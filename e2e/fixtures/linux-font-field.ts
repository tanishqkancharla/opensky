import { expect, test as base } from "vitest";
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
const originalText = "Target audience";
type Saved = { texts: string[]; distinctNonemptyRunSizesPt: (number | null)[] };
type Fixture = { app: App; fontField: number; document: { read(): Promise<Saved> } };

async function readPresentation(path: string): Promise<Saved> {
  return JSON.parse((await exec(process.env.OPENSKY_EVAL_PYTHON ?? "python3", ["-c", `
import json,sys
from pptx import Presentation
p=Presentation(sys.argv[1]); texts=[]; sizes=[]
for slide in p.slides:
 for shape in slide.shapes:
  if shape.has_text_frame:
   texts.append(shape.text)
   for paragraph in shape.text_frame.paragraphs:
    for run in paragraph.runs:
     if run.text.strip(): sizes.append(run.font.size.pt if run.font.size else None)
print(json.dumps({'texts':texts,'distinctNonemptyRunSizesPt':sorted(set(sizes),key=str)}))
`, path], { timeout: 10_000 })).stdout);
}

export const test = base.extend<Fixture & { owned: Fixture }>({
  owned: async ({ task }, use) => {
    assertDisposableLinuxDesktop();
    const artifacts = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "font-field", task.name.split(":")[0]);
    await mkdir(artifacts, { recursive: true });
    const temporary = await mkdtemp(join(tmpdir(), "opensky-font-field-"));
    const path = join(temporary, "font-field.pptx");
    let sdk: ReturnType<typeof createOpenSky> | undefined;
    let launchAttempted = false;
    try {
      // Ordinary input document only; all edits under test happen through the public app API.
      await exec(process.env.OPENSKY_EVAL_PYTHON ?? "python3", ["-c", `
import sys
from pptx import Presentation
from pptx.util import Inches,Pt
p=Presentation(); slide=p.slides.add_slide(p.slide_layouts[6]); box=slide.shapes.add_textbox(Inches(1),Inches(2),Inches(8),Inches(2)); run=box.text_frame.paragraphs[0].add_run(); run.text=sys.argv[2]; run.font.name='Liberation Sans'; run.font.size=Pt(70); p.save(sys.argv[1])
`, path, originalText]);
      expect(await readPresentation(path)).toEqual({ texts: [originalText], distinctNonemptyRunSizesPt: [70] });
      const launch = await prepareLinuxBenchmarkApp({ category: "libreoffice_impress", document: path, temporary, artifacts });
      launchAttempted = true;
      await withOwnedLinuxApp(launch.options, async owned => {
        sdk = createOpenSky({ homeDir: join(temporary, "sdk"), autoLaunch: false,
          driverOptions: { binaryPath: process.env.OPENSKY_DRIVER_BINARY, socket: process.env.OPENSKY_DRIVER_SOCKET, autoStart: false, autoInstall: false } });
        const app = recordAppTiming(await createCua(sdk).getApp(launch.appName), artifacts);
        let sequence = 0;
        const observe = async () => {
          const tree = await app.getAXState({ disableDiffing: true });
          await writeFile(join(artifacts, `observation-${++sequence}.txt`), tree);
          return tree;
        };
        const uniqueIndex = (tree: string, pattern: RegExp) => {
          const rows = tree.split("\n").filter(line => pattern.test(line));
          expect(rows).toHaveLength(1);
          return Number(rows[0]!.match(/\[(\d+)\]/)![1]);
        };
        try {
          await expect.poll(observe, { timeout: 20_000 }).toContain('paragraph "Target audience"');
          await app.click(uniqueIndex(await observe(), /\[\d+\] paragraph "Target audience"/));
          await app.pressKey("CTRL+A");
          const fontField = uniqueIndex(await observe(), /\[\d+\] text "70 pt"/);
          const bounds = await exec("/usr/bin/python3", [fileURLToPath(new URL("./font-field-bounds.py", import.meta.url)), "--pid", String(owned.pid)], { timeout: 65_000 });
          await writeFile(join(artifacts, "font-field-bounds.json"), bounds.stdout);
          await writeFile(join(artifacts, "before.png"), await app.getScreenshot());
          await use({ app, fontField, document: { read: () => readPresentation(path) } });
        } finally {
          try { await observe(); await writeFile(join(artifacts, "final.png"), await app.getScreenshot()); }
          catch (error) { await writeFile(join(artifacts, "observation-error.txt"), String(error)); }
          await copyFile(path, join(artifacts, "font-field.pptx"));
          await writeFile(join(artifacts, "saved-outcome.json"), JSON.stringify(await readPresentation(path), null, 2));
        }
      });
    } finally {
      try { await sdk?.close(); }
      finally {
        const cleanup = await readFile(join(artifacts, "cleanup.json"), "utf8").then(JSON.parse).catch(() => null);
        const canRemove = !launchAttempted || cleanup?.verifiedExited === true;
        if (canRemove) await rm(temporary, { recursive: true, force: true });
        await writeFile(join(artifacts, "temporary-cleanup.json"), JSON.stringify({ removed: canRemove }));
      }
    }
  },
  app: async ({ owned }, use) => use(owned.app),
  fontField: async ({ owned }, use) => use(owned.fontField),
  document: async ({ owned }, use) => use(owned.document),
});
