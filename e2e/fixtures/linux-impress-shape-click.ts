import { expect, test as base } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { createOpenSky, createCua } from "../../src/index.js";
import type { App } from "../../src/cua.js";
import { recordAppTiming } from "./app-timing.js";
import { assertDisposableLinuxDesktop, withOwnedLinuxApp } from "../../evals/parity/linux-app.js";
import { prepareLinuxBenchmarkApp } from "../../evals/parity/linux-benchmark-app.js";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
const taskId = "3161d64e-3120-47b4-aaad-6a764a92493b";
const inputName = "45_1.pptx";
type Texts = { slides: { name: string; paragraphs: string[] }[][] };
type TitleFormatting = { bold: boolean | null; sizePt: number | null };
type Fixture = { app: App; shapeIndex: number; titlePoint: [number, number]; originalTexts: Texts; splitTitleTexts: Texts;
  document: { readTexts(): Promise<Texts>; changed(): Promise<boolean>; readTitleFormatChange(): Promise<{ before: TitleFormatting; after: TitleFormatting }> } };
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function readTexts(path: string): Promise<Texts> {
  return JSON.parse((await exec(process.env.OPENSKY_EVAL_PYTHON ?? "python3", ["-c", `
import json,sys,zipfile,xml.etree.ElementTree as E
z=zipfile.ZipFile(sys.argv[1]); ns={'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main'}
slides=[]
for filename in sorted((n for n in z.namelist() if n.startswith('ppt/slides/slide') and n.endswith('.xml')),key=lambda n:int(n.rsplit('slide',1)[1][:-4])):
 slide=[]
 for shape in E.fromstring(z.read(filename)).findall('.//p:sp',ns):
  body=shape.find('p:txBody',ns)
  if body is None:continue
  props=shape.find('p:nvSpPr/p:cNvPr',ns)
  paragraphs=[]
  for p in body.findall('a:p',ns):
   paragraphs.append(''.join((n.text or '') if n.tag=='{'+ns['a']+'}t' else '\\n' for n in p.iter() if n.tag in ['{'+ns['a']+'}t','{'+ns['a']+'}br']))
  # LibreOffice adds empty txBody nodes to decorative shapes during export.
  # Compare every nonempty text shape; preserve all its paragraph boundaries.
  if any(paragraphs):slide.append({'name':props.get('name','') if props is not None else '', 'paragraphs':paragraphs})
 slides.append(slide)
print(json.dumps({'slides':slides}))
`, path], { timeout: 10_000 })).stdout);
}

// Explicit saved run properties for this retained document; absent or mixed
// properties remain unknown rather than assuming inherited bold/size values.
async function readTitleFormatting(path: string): Promise<TitleFormatting> {
  return JSON.parse((await exec(process.env.OPENSKY_EVAL_PYTHON ?? "python3", ["-c", `
import json,sys,zipfile,xml.etree.ElementTree as E
ns={'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main'}
with zipfile.ZipFile(sys.argv[1]) as z: slide=E.fromstring(z.read('ppt/slides/slide14.xml'))
titles=[]
for shape in slide.findall('.//p:sp',ns):
 props=shape.find('p:nvSpPr/p:cNvPr',ns)
 if props is not None and props.get('name')=='Google Shape;306;p26': titles.append(shape)
assert len(titles)==1, 'Expected one saved title shape'
formats=[]
for run in titles[0].findall('p:txBody/a:p/a:r',ns):
 if not run.findtext('a:t','',ns):continue
 props=run.find('a:rPr',ns)
 bold=props.get('b') if props is not None else None
 size=props.get('sz') if props is not None else None
 formats.append({'bold':True if bold in ('1','true') else False if bold in ('0','false') else None,'sizePt':int(size)/100 if size is not None else None})
assert formats, 'Saved title has no text runs'
print(json.dumps(formats[0] if all(f==formats[0] for f in formats) else {'bold':None,'sizePt':None}))
`, path], { timeout: 10_000 })).stdout);
}

export const test = base.extend<Fixture & { owned: Fixture }>({
  owned: async ({ task }, use) => {
    assertDisposableLinuxDesktop();
    const artifacts = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "shape-click", task.name.split(":")[0]);
    await mkdir(artifacts, { recursive: true });
    const temporary = await mkdtemp(join(tmpdir(), "opensky-impress-shape-click-"));
    const path = join(temporary, inputName);
    let sdk: ReturnType<typeof createOpenSky> | undefined;
    let launchAttempted = false;
    try {
      const source = join(root, "evals/parity/osworld", taskId, inputName);
      const manifest = JSON.parse(await readFile(join(root, "evals/parity/osworld/manifest.json"), "utf8"));
      const pin = manifest.tasks.find((t: { id: string }) => t.id === taskId).assets.find((a: { file: string }) => a.file === inputName);
      const originalBytes = await readFile(source);
      expect(digest(originalBytes)).toBe(pin.sha256);
      await copyFile(source, path);
      const originalTexts = await readTexts(path);
      expect(originalTexts.slides).toHaveLength(22);
      expect(originalTexts.slides[13]?.find(s => s.name === "Google Shape;306;p26")?.paragraphs).toEqual(["Target audience"]);
      // Observed in retained L01/L02: Enter splits this title at its caret.
      // Build the whole-document expectation from the untouched input so every
      // other shape and paragraph remains part of the assertion.
      const splitTitleTexts = structuredClone(originalTexts);
      splitTitleTexts.slides[13]!.find(s => s.name === "Google Shape;306;p26")!.paragraphs = ["Target a", "udience"];
      await writeFile(join(artifacts, "original-texts.json"), JSON.stringify(originalTexts, null, 2));
      await writeFile(join(artifacts, "input-sha256.txt"), pin.sha256 + "\n");
      const launch = await prepareLinuxBenchmarkApp({ category: "libreoffice_impress", document: path, temporary, artifacts });
      launchAttempted = true;
      await withOwnedLinuxApp(launch.options, async () => {
        sdk = createOpenSky({ homeDir: join(temporary, "sdk"), autoLaunch: false,
          driverOptions: { binaryPath: process.env.OPENSKY_DRIVER_BINARY, socket: process.env.OPENSKY_DRIVER_SOCKET, autoStart: false, autoInstall: false } });
        const timed = recordAppTiming(await createCua(sdk).getApp(launch.appName), artifacts);
        let sequence = 0;
        const app = new Proxy(timed, { get(target, key) {
          const value = Reflect.get(target, key, target);
          if (typeof value !== "function") return value;
          if (key !== "getScreenshot" && key !== "getAXStateAndScreenshot") return value.bind(target);
          return async (...args: unknown[]) => {
            const result = await value.apply(target, args);
            const name = `capture-${String(++sequence).padStart(3, "0")}`;
            const bytes = key === "getScreenshot" ? result : result.screenshot;
            if (bytes) await writeFile(join(artifacts, name + ".png"), bytes);
            if (key === "getAXStateAndScreenshot") await writeFile(join(artifacts, name + ".txt"), result.state);
            return result;
          };
        } });
        try {
          await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 20_000 }).toContain('PageShape: Slide 1"');
          const ready = PNG.sync.read(Buffer.from(await app.getScreenshot()));
          expect(ready.width).toBe(1280);
          expect([881, 883]).toContain(ready.height);
          // Replay the retained ordinary slide-pane navigation, without editing input files.
          await app.click([82, 185]);
          for (let i = 0; i < 13; i++) await app.pressKey("PAGEDOWN");
          const state = await app.getAXStateAndScreenshot({ disableDiffing: true });
          expect(state.state).toContain('PageShape: Slide 14"');
          const shapes = state.state.split("\n").filter(line => /\[\d+\] panel "Google Shape;306;p26"/.test(line));
          expect(shapes).toHaveLength(1);
          expect(state.state).toContain('paragraph "Target audience"');
          const screenshot = join(artifacts, "slide14.png");
          await writeFile(screenshot, state.screenshot!);
          const tsv = (await exec("tesseract", [screenshot, "stdout", "--psm", "11", "tsv"], { timeout: 10_000 })).stdout;
          await writeFile(join(artifacts, "slide14.tsv"), tsv);
          const words = tsv.trim().split("\n").slice(1).map(line => line.split("\t"));
          const titleWords = ["Target", "audience"].map(word => {
            const matches = words.filter(w => w[11] === word && Number(w[6]) > 200 && Number(w[6]) < 520 && Number(w[7]) > 290 && Number(w[7]) < 390);
            expect(matches).toHaveLength(1);
            return matches[0]!;
          });
          const left = Math.min(...titleWords.map(w => Number(w[6])));
          const right = Math.max(...titleWords.map(w => Number(w[6]) + Number(w[8])));
          const top = Math.min(...titleWords.map(w => Number(w[7])));
          const bottom = Math.max(...titleWords.map(w => Number(w[7]) + Number(w[9])));
          const titlePoint: [number, number] = [Math.round((left + right) / 2), Math.round((top + bottom) / 2)];
          await writeFile(join(artifacts, "target.json"), JSON.stringify({ shapeIndex: Number(shapes[0]!.match(/\[(\d+)\]/)![1]), titlePoint, coordinateBasis: "visible title words in same public screenshot; not assumed equal to AT-SPI shape center" }));
          await use({ app, shapeIndex: Number(shapes[0]!.match(/\[(\d+)\]/)![1]), titlePoint, originalTexts, splitTitleTexts,
            document: { readTexts: () => readTexts(path), changed: async () => digest(await readFile(path)) !== pin.sha256,
              readTitleFormatChange: async () => ({ before: await readTitleFormatting(source), after: await readTitleFormatting(path) }) } });
        } finally {
          try { await app.getAXStateAndScreenshot({ disableDiffing: true }); }
          catch (error) { await writeFile(join(artifacts, "capture-error.txt"), String(error)); }
          await copyFile(path, join(artifacts, inputName));
          await writeFile(join(artifacts, "saved-texts.json"), JSON.stringify(await readTexts(path), null, 2));
        }
      });
    } finally {
      try { await sdk?.close(); } finally {
        const cleanup = await readFile(join(artifacts, "cleanup.json"), "utf8").then(JSON.parse).catch(() => null);
        const removed = !launchAttempted || cleanup?.verifiedExited === true;
        if (removed) await rm(temporary, { recursive: true, force: true });
        await writeFile(join(artifacts, "temporary-cleanup.json"), JSON.stringify({ removed }));
      }
    }
  },
  app: async ({ owned }, use) => use(owned.app),
  shapeIndex: async ({ owned }, use) => use(owned.shapeIndex),
  titlePoint: async ({ owned }, use) => use(owned.titlePoint),
  originalTexts: async ({ owned }, use) => use(owned.originalTexts),
  splitTitleTexts: async ({ owned }, use) => use(owned.splitTitleTexts),
  document: async ({ owned }, use) => use(owned.document),
});
