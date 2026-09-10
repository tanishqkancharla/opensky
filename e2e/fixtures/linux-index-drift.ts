import { expect, test as base } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createCua, createOpenSky } from "../../src/index.js";
import type { App } from "../../src/cua.js";
import { assertDisposableLinuxDesktop, withOwnedLinuxApp } from "../../evals/parity/linux-app.js";
const exec = promisify(execFile);
type Fixture = { app: App; controls: {
  enableIndex: number;
  removeIndex: number;
  clickRetainedOk(): Promise<"delivered" | "stale">;
  visibleStatus(): Promise<{ earlierEnabled: boolean; action: string; okPresent: boolean }>;
} };

export const test = base.extend<Fixture & { owned: Fixture }>({
  owned: async ({ task }, use) => {
    assertDisposableLinuxDesktop();
    // GI is a system package; the scorer virtualenv does not provide GTK.
    await exec("/usr/bin/python3", ["-c", "import gi; gi.require_version('Gtk','3.0'); from gi.repository import Gtk"]);
    const artifacts = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "index-drift", task.name.split(":")[0]);
    await mkdir(artifacts, { recursive: true });
    const temporary = await mkdtemp(join(tmpdir(), "opensky-index-drift-"));
    const sdk = createOpenSky({ homeDir: join(temporary, "sdk"), autoLaunch: false,
      driverOptions: { binaryPath: process.env.OPENSKY_DRIVER_BINARY, socket: process.env.OPENSKY_DRIVER_SOCKET, autoStart: false, autoInstall: false } });
    try {
      await withOwnedLinuxApp({ executable: "/usr/bin/python3", args: [fileURLToPath(new URL("./gtk-index-drift.py", import.meta.url))],
        documentTitle: "^OpenSky Index Lab$", artifacts, env: { NO_AT_BRIDGE: "0", GDK_BACKEND: "x11" } }, async owned => {
        let selector: string | undefined;
        await expect.poll(async () => {
          const listed = (await sdk.invoke("list_apps", {})).structured as { apps?: Array<{ pid?: number; bundle_id?: string; name?: string; launch_path?: string }> };
          const match = listed.apps?.find(app => Number(app.pid) === owned.pid);
          selector = match?.bundle_id || match?.name || match?.launch_path;
          return Boolean(selector);
        }, { timeout: 15_000 }).toBe(true);
        const app = await createCua(sdk).getApp(selector!);
        const index = (state: string, label: string) => {
          const rows = state.split("\n").filter(line => line.includes(`push button "${label}"`) && /\[\d+\]/.test(line));
          if (rows.length !== 1) throw new Error(`Expected exactly one indexed ${label} control`);
          return Number(rows[0]!.match(/\[(\d+)\]/)![1]);
        };
        let initial = "";
        await expect.poll(async () => {
          initial = await app.getAXState({ disableDiffing: true });
          return initial;
        }, { timeout: 15_000 }).toContain('label = "Earlier: disabled"');
        expect(initial).toContain('label = "Action: none"');
        expect(initial).not.toMatch(/\[\d+\] push button "Earlier control"/);
        const okIndex = index(initial, "OK"), enableIndex = index(initial, "Enable earlier control");
        expect(index(initial, "Cancel")).toBe(okIndex - 1);
        await writeFile(join(artifacts, "initial-state.txt"), initial);
        await copyFile(join(temporary, "sdk/session.json"), join(artifacts, "initial-session.json"));
        let capture = 0;
        try {
          await use({ app, controls: { enableIndex, removeIndex: index(initial, "Remove OK"),
            async clickRetainedOk() {
              try {
                await app.click(okIndex);
                await writeFile(join(artifacts, "retained-click.json"), JSON.stringify({ status: "delivered", okIndex }));
                return "delivered";
              } catch (error) {
                await writeFile(join(artifacts, "retained-click.json"), JSON.stringify({ status: "rejected", okIndex, error: String(error) }));
                if (!/stale_element|stale.*(?:token|snapshot)|(?:token|snapshot).*stale/i.test(String(error))) throw error;
                return "stale";
              }
            },
            async visibleStatus() {
              const state = await app.getAXState({ disableDiffing: true });
              await writeFile(join(artifacts, `outcome-${++capture}.txt`), state);
              await copyFile(join(temporary, "sdk/session.json"), join(artifacts, `outcome-${capture}-session.json`));
              const action = state.match(/label = "Action: ([^"]+)"/)?.[1];
              if (!action) throw new Error("Visible action label is missing");
              return { earlierEnabled: state.includes('label = "Earlier: enabled"'), action, okPresent: /\[\d+\] push button "OK"/.test(state) };
            },
          } });
        } finally {
          try { await writeFile(join(artifacts, "final.png"), await app.getScreenshot()); }
          catch (error) { await writeFile(join(artifacts, "capture-error.txt"), String(error)); }
        }
      });
    } finally {
      await sdk.close();
      const cleanup = await readFile(join(artifacts, "cleanup.json"), "utf8").then(JSON.parse).catch(() => null);
      if (cleanup?.verifiedExited) await rm(temporary, { recursive: true, force: true });
      await writeFile(join(artifacts, "temporary-cleanup.json"), JSON.stringify({ removed: cleanup?.verifiedExited === true }));
    }
  },
  app: async ({ owned }, use) => use(owned.app),
  controls: async ({ owned }, use) => use(owned.controls),
});
