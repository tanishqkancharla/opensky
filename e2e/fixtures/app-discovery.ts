import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as base } from "vitest";
import { createOpenSky, type OpenSky } from "opensky-cua";
import { withOwnedMacApp } from "../../evals/parity/mac-app.js";
import { verifyDriverRuntime } from "../../evals/parity/driver-runtime.js";

// Real external app lifecycle is fixture setup. The SDK remains connected to
// the same daemon across launch/quit; restarting it would hide stale discovery.
function discoveryFixture(afterQuit: boolean) {
  return base.extend<{ sdk: OpenSky }>({
    sdk: async ({}, use) => {
      const binaryPath = process.env.OPENSKY_DRIVER_BINARY;
      if (process.platform !== "darwin" || process.env.OPENSKY_REAL_DRIVER !== "1" || !binaryPath) {
        throw new Error("Requires a provisioned macOS driver and OPENSKY_REAL_DRIVER=1; no auto-install or start");
      }
      const root = process.env.OPENSKY_E2E_ARTIFACT_DIR ?? tmpdir();
      await mkdir(root, { recursive: true });
      const artifacts = await mkdtemp(join(root, afterQuit ? "app-quit-" : "app-launch-"));
      const socket = process.env.OPENSKY_DRIVER_SOCKET ?? process.env.CUA_DRIVER_SOCKET;
      // App inventory uses NSWorkspace, not AX or screen capture. Still verify
      // the exact daemon; never request permissions or bypass input gates.
      await verifyDriverRuntime({ binaryPath, socket, artifacts, requirePermissions: false });
      const sdk = createOpenSky({ homeDir: join(artifacts, "sdk"), autoLaunch: false,
        driverOptions: { binaryPath, socket, autoInstall: false, autoStart: false } });
      const scratch = await mkdtemp(join(tmpdir(), "opensky-discovery-"));
      const document = join(scratch, "discovery.txt");
      await writeFile(document, "OpenSky app discovery test.\n");
      try {
        await sdk.list_apps();
        await withOwnedMacApp({ appPath: "/System/Applications/TextEdit.app", bundleId: "com.apple.TextEdit", artifacts, openDocuments: [document] }, async () => {
          if (afterQuit) await sdk.list_apps();
          else await use(sdk);
        });
        if (afterQuit) await use(sdk);
      } finally {
        await sdk.close();
        const cleanup = await readFile(join(artifacts, "cleanup.json"), "utf8").then(JSON.parse).catch(() => null);
        const temporaryRemoved = cleanup?.verifiedExited === true;
        if (temporaryRemoved) await rm(scratch, { recursive: true, force: true });
        await writeFile(join(artifacts, "fixture-cleanup.json"), JSON.stringify({ temporaryRemoved, cleanup }, null, 2));
        if (!temporaryRemoved) console.error(`App discovery cleanup unproven; preserve ${scratch}`);
      }
    },
  });
}

export const openedAppTest = discoveryFixture(false);
export const quitAppTest = discoveryFixture(true);
