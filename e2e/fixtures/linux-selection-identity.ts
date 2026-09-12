import { expect, test as base } from "vitest";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { promisify } from "node:util";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createCua, createOpenSky } from "../../src/index.js";
import type { App } from "../../src/cua.js";
import { assertDisposableLinuxDesktop, withOwnedLinuxApp } from "../../evals/parity/linux-app.js";

const exec = promisify(execFile);
const targetText = "SELECTION_IDENTITY_DUPLICATE_v1";
const fullRange = `0:${targetText.length}`;
type Fixture = { app: App; observer: App; insert: number; observeOriginalUnselected(): Promise<number>; proveOrdinalDrift(original: number): Promise<void>; status(): Promise<string> };

function indexedControl(state: string, role: string, name: string): number {
  const matches = state.split("\n").filter(line => line.includes(`${role} \"${name}\"`) && /\[\d+\]/.test(line));
  if (matches.length !== 1) throw new Error(`Expected one indexed ${role} named ${name}`);
  return Number(matches[0]!.match(/\[(\d+)\]/)![1]);
}

async function discoverOwnedApp(sdk: ReturnType<typeof createOpenSky>, pid: number, artifacts: string, label: string): Promise<string> {
  let selector: string | undefined;
  await expect.poll(async () => {
    const listed = (await sdk.invoke("list_apps", {})).structured as { apps?: Array<{ pid?: number; bundle_id?: string; name?: string; launch_path?: string }> };
    await writeFile(join(artifacts, `${label}-app-list.json`), JSON.stringify(listed));
    const match = listed.apps?.find(app => Number(app.pid) === pid);
    selector = match?.bundle_id || match?.name || match?.launch_path;
    return Boolean(selector);
  }, { timeout: 15_000 }).toBe(true);
  return selector!;
}

async function waitForDriver(binary: string, socket: string, process: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await exec(binary, ["status", "--socket", socket]);
      return;
    } catch {
      if (process.exitCode !== null) throw new Error(`Observer driver exited before startup: ${process.exitCode}`);
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  throw new Error("Observer driver did not become ready");
}

async function stopDriver(process: ChildProcess | undefined): Promise<void> {
  if (!process || process.exitCode !== null) return;
  process.kill("SIGTERM");
  await once(process, "exit");
}

export const test = base.extend<Fixture & { owned: Fixture }>({
  owned: async ({ task }, use) => {
    assertDisposableLinuxDesktop();
    await exec("/usr/bin/python3", ["-c", "import gi; gi.require_version('Gtk','3.0'); from gi.repository import Gtk"]);
    const artifacts = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "selection-identity", task.name.split(":")[0]);
    await mkdir(artifacts, { recursive: true });
    const temporary = await mkdtemp(join(tmpdir(), "opensky-selection-identity-"));
    const driverBinary = process.env.OPENSKY_DRIVER_BINARY;
    if (!driverBinary) throw new Error("OPENSKY_DRIVER_BINARY is required for the independent observer driver");
    const observerSocket = join(temporary, "observer-driver.sock");
    const sdk = createOpenSky({ homeDir: join(temporary, "sdk"), autoLaunch: false, driverOptions: { binaryPath: driverBinary, socket: process.env.OPENSKY_DRIVER_SOCKET, autoStart: false, autoInstall: false } });
    let observerDriver: ChildProcess | undefined;
    let observerSdk: ReturnType<typeof createOpenSky> | undefined;
    try {
      await withOwnedLinuxApp({ executable: "/usr/bin/python3", args: [fileURLToPath(new URL("./gtk-selection-identity-drift.py", import.meta.url))], documentTitle: "^OpenSky Selection Identity Lab$", artifacts, env: { NO_AT_BRIDGE: "0", GDK_BACKEND: "x11" } }, async owned => {
        observerDriver = spawn(driverBinary, ["serve", "--no-overlay", "--socket", observerSocket], { stdio: ["ignore", "ignore", "ignore"] });
        await waitForDriver(driverBinary, observerSocket, observerDriver);
        await writeFile(join(artifacts, "driver-connections.json"), JSON.stringify({ primarySocket: process.env.OPENSKY_DRIVER_SOCKET, observerSocket, observerPid: observerDriver.pid }));
        const primarySelector = await discoverOwnedApp(sdk, owned.pid, artifacts, "primary");
        const app = await createCua(sdk).getApp(primarySelector);
        observerSdk = createOpenSky({ homeDir: join(temporary, "observer-sdk"), autoLaunch: false, driverOptions: { binaryPath: driverBinary, socket: observerSocket, autoStart: false, autoInstall: false } });
        const observerSelector = await discoverOwnedApp(observerSdk, owned.pid, artifacts, "observer");
        const observer = await createCua(observerSdk).getApp(observerSelector);
        const observerState = await observer.getAXState({ disableDiffing: true });
        const reset = indexedControl(observerState, "push button", "Reset selection");
        const insert = indexedControl(observerState, "push button", "Insert duplicate above");
        await writeFile(join(artifacts, "initial-observer-state.txt"), observerState);
        await observer.click(reset);
        await expect.poll(async () => {
          const resetState = await observer.getAXState({ disableDiffing: true });
          await writeFile(join(artifacts, "after-reset-observer-state.txt"), resetState);
          return resetState;
        }, { timeout: 10_000 }).toContain("selection_drift=armed selection_target=none selection_range=none");
        await use({ app, observer, insert,
          observeOriginalUnselected: async () => {
            const primaryState = await app.getAXState({ disableDiffing: true });
            await writeFile(join(artifacts, "pre-action-primary-state.txt"), primaryState);
            expect(primaryState).toContain("selection_drift=armed selection_target=none selection_range=none");
            return indexedControl(primaryState, "text", "Observed selection target");
          },
          proveOrdinalDrift: async original => {
            const afterInsert = await observer.getAXState({ disableDiffing: true });
            await writeFile(join(artifacts, "after-insert-observer-state.txt"), afterInsert);
            const inserted = indexedControl(afterInsert, "text", "Inserted duplicate");
            const originalLive = indexedControl(afterInsert, "text", "Observed selection target");
            expect(inserted).toBe(original);
            expect(originalLive).not.toBe(original);
            expect(afterInsert).toContain("selection_drift=applied selection_target=none selection_range=none");
          },
          status: async () => {
            const state = await app.getAXState({ disableDiffing: true });
            await writeFile(join(artifacts, "final-primary-state.txt"), state);
            return state;
          },
        });
        await copyFile(join(temporary, "sdk", "session.json"), join(artifacts, "primary-session.json")).catch(() => undefined);
        await copyFile(join(temporary, "observer-sdk", "session.json"), join(artifacts, "observer-session.json")).catch(() => undefined);
        await writeFile(join(artifacts, "final.png"), await app.getScreenshot()).catch(() => undefined);
      });
    } finally {
      await Promise.all([sdk.close(), observerSdk?.close()]);
      await stopDriver(observerDriver);
      const cleanup = await readFile(join(artifacts, "cleanup.json"), "utf8").then(JSON.parse).catch(() => null);
      if (cleanup?.verifiedExited) await rm(temporary, { recursive: true, force: true });
      await writeFile(join(artifacts, "temporary-cleanup.json"), JSON.stringify({ removed: cleanup?.verifiedExited === true }));
    }
  },
  app: async ({ owned }, use) => use(owned.app), observer: async ({ owned }, use) => use(owned.observer),
  insert: async ({ owned }, use) => use(owned.insert), observeOriginalUnselected: async ({ owned }, use) => use(owned.observeOriginalUnselected),
  proveOrdinalDrift: async ({ owned }, use) => use(owned.proveOrdinalDrift), status: async ({ owned }, use) => use(owned.status),
});

export { fullRange, targetText };
