import { test as base, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createOpenSky, createCua } from "../../src/index.js";
import type { App } from "../../src/cua.js";
import { recordAppTiming } from "./app-timing.js";
import { assertDisposableLinuxDesktop, withOwnedLinuxApp } from "../../evals/parity/linux-app.js";
import { prepareLinuxBenchmarkApp } from "../../evals/parity/linux-benchmark-app.js";

const exec = promisify(execFile);
type Desktop = { app: App; findField: number; replaceField: number; document: { read(): Promise<string> } };
export const test = base.extend<Desktop & { owned: Desktop }>({
  owned: async ({ task }, use) => {
    assertDisposableLinuxDesktop();
    const artifacts = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "code-origin", task.name.split(":")[0]);
    await mkdir(artifacts, { recursive: true });
    const temporary = await mkdtemp(join(tmpdir(), "opensky-code-origin-"));
    const path = join(temporary, "origin.txt");
    let sdk: ReturnType<typeof createOpenSky> | undefined;
    let launched = false;
    try {
      await writeFile(path, "Original text\nKeep this line\n");
      const launch = await prepareLinuxBenchmarkApp({ category: "vs_code", document: path, temporary, artifacts,
        vscodePath: process.env.OPENSKY_EVAL_VSCODE ?? "/usr/share/code" });
      launched = true;
      await withOwnedLinuxApp(launch.options, async owned => {
        // Ordinary initial window placement, scoped to the fixture-owned XID.
        await exec("xdotool", ["windowsize", "--sync", owned.window, "960", "700"]);
        await exec("xdotool", ["windowmove", "--sync", owned.window, "200", "100"]);
        const geometry = (await exec("xdotool", ["getwindowgeometry", "--shell", owned.window])).stdout;
        await writeFile(join(artifacts, "initial-window-geometry.txt"), geometry);
        expect(Number(geometry.match(/^X=(\d+)$/m)?.[1])).toBeGreaterThan(0);
        expect(Number(geometry.match(/^Y=(\d+)$/m)?.[1])).toBeGreaterThan(0);
        expect(geometry).toMatch(/^WIDTH=960$/m);
        expect(geometry).toMatch(/^HEIGHT=700$/m);
        sdk = createOpenSky({ homeDir: join(temporary, "sdk"), autoLaunch: false,
          driverOptions: { binaryPath: process.env.OPENSKY_DRIVER_BINARY, socket: process.env.OPENSKY_DRIVER_SOCKET, autoStart: false, autoInstall: false } });
        const app = recordAppTiming(await createCua(sdk).getApp(launch.appName), artifacts);
        try {
          await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 20_000 }).toContain("origin.txt");
          await app.pressKey("CTRL+H");
          await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 20_000 }).toContain('entry "Replace"');
          const tree = await app.getAXState({ disableDiffing: true });
          await writeFile(join(artifacts, "before.txt"), tree);
          await writeFile(join(artifacts, "before.png"), await app.getScreenshot());
          const field = (name: string) => {
            const rows = tree.split("\n").filter(line => line.includes(`entry "${name}"`));
            expect(rows).toHaveLength(1);
            return Number(rows[0]!.match(/\[(\d+)\]/)![1]);
          };
          await use({ app, findField: field("Find"), replaceField: field("Replace"), document: { read: () => readFile(path, "utf8") } });
        } finally {
          await writeFile(join(artifacts, "final.txt"), await app.getAXState({ disableDiffing: true })).catch(() => undefined);
          await writeFile(join(artifacts, "final.png"), await app.getScreenshot()).catch(() => undefined);
          await copyFile(path, join(artifacts, "origin.txt"));
        }
      });
    } finally {
      try { await sdk?.close(); }
      finally {
        const cleanup = await readFile(join(artifacts, "cleanup.json"), "utf8").then(JSON.parse).catch(() => null);
        const removed = !launched || cleanup?.verifiedExited === true;
        if (removed) await rm(temporary, { recursive: true, force: true });
        await writeFile(join(artifacts, "temporary-cleanup.json"), JSON.stringify({ removed }));
      }
    }
  },
  app: async ({ owned }, use) => use(owned.app),
  findField: async ({ owned }, use) => use(owned.findField),
  replaceField: async ({ owned }, use) => use(owned.replaceField),
  document: async ({ owned }, use) => use(owned.document),
});
