import { test as base, expect } from "vitest";
import { PNG } from "pngjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createOpenSky, createCua } from "../../src/index.js";
import type { App } from "../../src/cua.js";
import { recordAppTiming } from "./app-timing.js";
import { assertDisposableLinuxDesktop, withOwnedLinuxApp } from "../../evals/parity/linux-app.js";

import { prepareLinuxBenchmarkApp } from "../../evals/parity/linux-benchmark-app.js";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
type SavedDocument = {
  readCell(address: string): Promise<{ formula: string | null; value: string | null }>;
  readSheetNames(): Promise<string[]>;
  readWorkbookChanges(): Promise<{
    sheetNamesUnchanged: boolean;
    changes: Array<{ sheet: string; cell: string; before: unknown; after: unknown }>;
  }>;
};
type Desktop = { app: App; document: SavedDocument };
type Input = {
  taskId: string; file: string; mode: "--calc" | "--impress" | "--code";
  observedScreenshotSize?: { width: number; heights: number[] };
};

export function desktopSetupTest(input: Input) {
  return base.extend<Desktop & { desktop: Desktop }>({
    desktop: async ({ task }, use) => {
      assertDisposableLinuxDesktop();
      const artifacts = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "setup", task.name.split(":")[0]);
      await mkdir(artifacts, { recursive: true });
      const temporary = await mkdtemp(join(tmpdir(), "opensky-desktop-setup-"));
      const document = join(temporary, input.file);
      let sdk: ReturnType<typeof createOpenSky> | undefined;
      let launchAttempted = false;
      try {
        await copyFile(join(root, "evals/parity/osworld", input.taskId, input.file), document);
        const launch = await prepareLinuxBenchmarkApp({
          category: input.mode === "--code" ? "vs_code" : input.mode === "--calc" ? "libreoffice_calc" : "libreoffice_impress",
          document, temporary, artifacts, vscodePath: process.env.OPENSKY_EVAL_VSCODE ?? "/usr/share/code",
        });
        launchAttempted = true;
        await withOwnedLinuxApp(launch.options, async () => {
          sdk = createOpenSky({ homeDir: join(temporary, "sdk"), autoLaunch: false,
            driverOptions: { binaryPath: process.env.OPENSKY_DRIVER_BINARY, socket: process.env.OPENSKY_DRIVER_SOCKET, autoStart: false, autoInstall: false } });
          const app = recordAppTiming(await createCua(sdk).getApp(launch.appName), artifacts);
          try {
            await expect.poll(async () => {
              const image = join(artifacts, "ready.png");
              await writeFile(image, await app.getScreenshot());
              const text = (await exec("tesseract", [image, "stdout", "--psm", "11"], { timeout: 10_000 })).stdout;
              await writeFile(join(artifacts, "ready.txt"), text);
              return text.match(/\b(?:File|Edit|Selection|View|Insert)\b/g) ?? [];
            }, { timeout: 20_000 }).toEqual(expect.arrayContaining(launch.menus));
            if (input.observedScreenshotSize) {
              const screenshot = PNG.sync.read(Buffer.from(await app.getScreenshot()));
              expect(screenshot.width).toBe(input.observedScreenshotSize.width);
              expect(input.observedScreenshotSize.heights).toContain(screenshot.height);
            }
            await use({ app, document: { async readCell(address) {
              return JSON.parse((await exec(process.env.OPENSKY_EVAL_PYTHON ?? "python3", ["-c",
                'import sys,json,zipfile,xml.etree.ElementTree as E; z=zipfile.ZipFile(sys.argv[1]); r=E.fromstring(z.read("xl/worksheets/sheet1.xml")); ns={"s":"http://schemas.openxmlformats.org/spreadsheetml/2006/main"}; c=next((c for c in r.findall(".//s:c",ns) if c.get("r")==sys.argv[2]),None); print(json.dumps({"formula":c.findtext("s:f",None,ns) if c is not None else None,"value":c.findtext("s:v",None,ns) if c is not None else None}))', document, address])).stdout);
            }, async readSheetNames() {
              return JSON.parse((await exec(process.env.OPENSKY_EVAL_PYTHON ?? "python3", ["-c",
                'import sys,json,zipfile,xml.etree.ElementTree as E; z=zipfile.ZipFile(sys.argv[1]); r=E.fromstring(z.read("xl/workbook.xml")); ns={"s":"http://schemas.openxmlformats.org/spreadsheetml/2006/main"}; print(json.dumps([sheet.get("name") for sheet in r.findall("s:sheets/s:sheet",ns)]))', document])).stdout);
            }, async readWorkbookChanges() {
              return JSON.parse((await exec(process.env.OPENSKY_EVAL_PYTHON ?? "python3", [
                join(root, "e2e/fixtures/workbook-changes.py"),
                join(root, "evals/parity/osworld", input.taskId, input.file), document,
              ])).stdout);
            } } });
          } finally {
            await writeFile(join(artifacts, "final-state.txt"), await app.getAXState({ disableDiffing: true })).catch(() => undefined);
            await writeFile(join(artifacts, "final.png"), await app.getScreenshot()).catch(() => undefined);
            await copyFile(document, join(artifacts, input.file));
          }
        });
      } finally {
        await sdk?.close();
        const cleanup = await readFile(join(artifacts, "cleanup.json"), "utf8").then(JSON.parse).catch(() => null);
        if (!launchAttempted || cleanup?.verifiedExited) await rm(temporary, { recursive: true, force: true });
      }
    },
    app: async ({ desktop }, use) => use(desktop.app),
    document: async ({ desktop }, use) => use(desktop.document),
  });
}
