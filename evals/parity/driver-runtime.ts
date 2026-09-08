import { realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OpenSkyDriverClient } from "../../src/driver.js";

/** Query the daemon that will actually receive actions, not the CLI's default
 * permission-status route. Never start a daemon or request a TCC grant here. */
export async function verifyDriverRuntime(options: { binaryPath: string; socket?: string; artifacts: string }) {
  const driver = new OpenSkyDriverClient({
    binaryPath: options.binaryPath, socket: options.socket,
    autoStart: false, autoInstall: false,
  });
  const configuredExecutable = await realpath(options.binaryPath);
  let permissions: Record<string, unknown> | null = null;
  let error: string | null = null;
  try {
    const response = await driver.call("check_permissions", { prompt: false });
    permissions = response.structured as Record<string, unknown>;
    const source = permissions?.source as Record<string, unknown> | undefined;
    if (process.platform !== "darwin") throw new Error("Runtime identity verification currently requires macOS daemon source attribution");
    if (source?.attribution !== "driver-daemon" || source.bundle_id !== "com.opensky.driver" || typeof source.executable !== "string" || typeof source.pid !== "number") {
      throw new Error("OpenSky daemon did not provide its own executable identity");
    }
    if (await realpath(source.executable) !== configuredExecutable) {
      throw new Error(`Driver runtime mismatch: configured ${configuredExecutable}, connected to ${source.executable}`);
    }
    if (permissions.accessibility !== true || permissions.screen_recording !== true) {
      throw new Error("The selected OpenSky daemon needs Accessibility and Screen Recording before GUI evaluation");
    }
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }
  await writeFile(join(options.artifacts, "driver-runtime.json"), JSON.stringify({
    capturedAt: new Date().toISOString(), configuredExecutable, socket: options.socket ?? null,
    permissions, error, ready: error === null,
  }, null, 2));
  if (error) throw new Error(error);
  return permissions!;
}
