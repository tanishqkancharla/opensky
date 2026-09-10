import { readFile, readdir, readlink, realpath, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { assertDisposableLinuxDesktop } from "./linux-app.js";
import { OpenSkyDriverClient } from "../../src/driver.js";

/** Query the daemon that will actually receive actions, not the CLI's default
 * permission-status route. Never start a daemon or request a TCC grant here. */
export async function verifyDriverRuntime(options: { binaryPath: string; socket?: string; artifacts: string; requirePermissions?: boolean; ownedLinuxPid?: number }) {
  const driver = new OpenSkyDriverClient({
    binaryPath: options.binaryPath, socket: options.socket,
    autoStart: false, autoInstall: false,
  });
  const configuredExecutable = await realpath(options.binaryPath);
  let permissions: Record<string, unknown> | null = null;
  let linuxIdentity: Record<string, unknown> | null = null;
  let error: string | null = null;
  try {
    const response = await driver.call("check_permissions", process.platform === "linux" ? {} : { prompt: false });
    permissions = response.structured as Record<string, unknown>;
    const source = permissions?.source as Record<string, unknown> | undefined;
    if (process.platform === "linux") {
      assertDisposableLinuxDesktop();
      if (!options.socket || !Number.isSafeInteger(options.ownedLinuxPid) || options.ownedLinuxPid! <= 0) {
        throw new Error("Linux runtime verification requires a disposable desktop and the owned daemon PID/socket");
      }
      const pid = options.ownedLinuxPid!;
      const proc = `/proc/${pid}`;
      const instance = (stat: string) => stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
      const started = instance(await readFile(`${proc}/stat`, "utf8"));
      if (!started || await realpath(`${proc}/exe`) !== configuredExecutable) throw new Error("Owned Linux daemon executable does not match the configured driver");
      const sockets = (await readFile("/proc/net/unix", "utf8")).split("\n").map(line => line.trim().split(/\s+/));
      const listener = sockets.filter(fields => fields[7] === options.socket && fields[3] === "00010000");
      if (listener.length !== 1) throw new Error("Private driver socket is not a unique listening socket");
      const descriptors = await Promise.all((await readdir(`${proc}/fd`)).map(fd => readlink(`${proc}/fd/${fd}`).catch(() => "")));
      if (!descriptors.includes(`socket:[${listener[0][6]}]`)) throw new Error("Configured socket is not owned by the expected Linux daemon");
      const identity = JSON.parse((await promisify(execFile)(configuredExecutable, ["--opensky-driver-identity"], { timeout: 10_000 })).stdout);
      const config = (await driver.call("get_config", {})).structured as Record<string, unknown>;
      if (identity.product !== "opensky-driver" || identity.protocolVersion !== 1 || !/^[a-f0-9]{40}$/.test(identity.source ?? "") || config.platform !== "linux" || config.source_sha !== identity.source) {
        throw new Error("Connected Linux daemon did not report the configured OpenSky source revision");
      }
      if (instance(await readFile(`${proc}/stat`, "utf8")) !== started) throw new Error("Linux daemon process changed during verification");
      linuxIdentity = { pid, startTicks: started, socketInode: listener[0][6], source: identity.source, executable: configuredExecutable };
      if (options.requirePermissions !== false && (permissions.x11 !== true || permissions.atspi !== true)) throw new Error("Linux evaluation requires working X11 input/capture and accessibility bus");
    } else {
      if (process.platform !== "darwin") throw new Error("No runtime identity verification for this platform");
      if (source?.attribution !== "driver-daemon" || source.bundle_id !== "com.opensky.driver" || typeof source.executable !== "string" || typeof source.pid !== "number") {
        throw new Error("OpenSky daemon did not provide its own executable identity");
      }
      if (await realpath(source.executable) !== configuredExecutable) {
        throw new Error(`Driver runtime mismatch: configured ${configuredExecutable}, connected to ${source.executable}`);
      }
      if (options.requirePermissions !== false && (permissions.accessibility !== true || permissions.screen_recording !== true)) {
        throw new Error("The selected OpenSky daemon needs Accessibility and Screen Recording before GUI evaluation");
      }
    }
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }
  await writeFile(join(options.artifacts, "driver-runtime.json"), JSON.stringify({
    capturedAt: new Date().toISOString(), configuredExecutable, socket: options.socket ?? null,
    permissions, linuxIdentity, requiredPermissions: options.requirePermissions !== false, error, ready: error === null,
  }, null, 2));
  if (error) throw new Error(error);
  return permissions!;
}
