import { test as base, expect } from "vitest";
import { PNG } from "pngjs";
import { createHash } from "node:crypto";
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
const taskId = "ecb0df7a-4e8d-4a03-b162-053391d3afaf";
const filename = "Order_Id_Mark_Pass_Fail.xlsx";
const source = join(root, "evals/parity/osworld", taskId, filename);
const sourceHash = "c72c9bb3446ecebf1b10fd4e48833670683aaff02b20cfd10309e5b1626de5fa";
type Point = [number, number];
type Word = { text: string; x: number; y: number; width: number; height: number };
type Values = Record<string, Record<string, unknown>>;
type Choices = Record<string, { type: string; choices: string[]; arrowVisible: boolean }[]>;
type Fixtures = {
  app: App;
  dialog: { entriesPoint: Point; okPoint: Point; observe(): Promise<{ open: boolean; choices: string[] }> };
  document: { readChoices(): Promise<Choices>; expectedChoices: Choices; readValues(): Promise<Values>; originalValues: Values };
};

// This reads the externally saved workbook; it never saves it or reaches into Calc.
async function readWorkbook(path: string): Promise<{ values: Values; choices: Choices }> {
  return JSON.parse((await exec(process.env.OPENSKY_EVAL_PYTHON ?? "python3", ["-c", `
import json,posixpath,re,sys,zipfile,xml.etree.ElementTree as E
from decimal import Decimal
n={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(sys.argv[1]) as z:
 shared=[]
 if 'xl/sharedStrings.xml' in z.namelist():
  shared=[''.join(e.itertext()) for e in E.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',n)]
 rel={r.get('Id'):r.get('Target') for r in E.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
 values={}; choices={}
 for sheet in E.fromstring(z.read('xl/workbook.xml')).findall('s:sheets/s:sheet',n):
  target=rel[sheet.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')]
  path=target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/'+target)
  tree=E.fromstring(z.read(path)); cells={}
  for c in tree.findall('s:sheetData/s:row/s:c',n):
   kind=c.get('t','n'); value=c.findtext('s:v',None,n); formula=c.findtext('s:f',None,n)
   if kind=='s': value=shared[int(value)]; kind='text'
   elif kind=='inlineStr': value=''.join(c.find('s:is',n).itertext()); kind='text'
   elif kind=='n' and value is not None: value=str(Decimal(value).normalize())
   if value is not None or formula is not None: cells[c.get('r')]={'kind':kind,'value':value,'formula':formula}
  values[sheet.get('name')]=cells
  if sheet.get('name')=='Sheet1':
   for row in range(2,30):
    matches=[]
    for d in tree.findall('s:dataValidations/s:dataValidation',n):
     for area in d.get('sqref','').split():
      parts=area.replace('$','').split(':'); a=re.fullmatch(r'([A-Z]+)([0-9]+)',parts[0]); b=re.fullmatch(r'([A-Z]+)([0-9]+)',parts[-1])
      if a and b and a[1]==b[1]=='D' and int(a[2])<=row<=int(b[2]):
       f=d.findtext('s:formula1','',n)
       matches.append({'type':d.get('type'),'choices':f[1:-1].split(',') if len(f)>=2 and f[0]==f[-1]=='"' else [],'arrowVisible':d.get('showDropDown','false') not in ('1','true')})
    choices['D'+str(row)]=matches
 print(json.dumps({'values':values,'choices':choices}))
`, path], { timeout: 10_000 })).stdout);
}

export const test = base.extend<Fixtures & { fixture: Fixtures }>({
  fixture: async ({ task }, use) => {
    assertDisposableLinuxDesktop();
    expect(createHash("sha256").update(await readFile(source)).digest("hex")).toBe(sourceHash);
    const artifacts = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "dropdown", task.name.split(":")[0]);
    await mkdir(artifacts, { recursive: true });
    const temporary = await mkdtemp(join(tmpdir(), "opensky-dropdown-"));
    const documentPath = join(temporary, filename);
    let sdk: ReturnType<typeof createOpenSky> | undefined;
    let launchAttempted = false;
    try {
      await copyFile(source, documentPath);
      const originalValues = (await readWorkbook(source)).values;
      const launch = await prepareLinuxBenchmarkApp({ category: "libreoffice_calc", document: documentPath, temporary, artifacts });
      launchAttempted = true;
      await withOwnedLinuxApp(launch.options, async () => {
        sdk = createOpenSky({ homeDir: join(temporary, "sdk"), autoLaunch: false,
          driverOptions: { binaryPath: process.env.OPENSKY_DRIVER_BINARY, socket: process.env.OPENSKY_DRIVER_SOCKET, autoStart: false, autoInstall: false } });
        const app = recordAppTiming(await createCua(sdk).getApp(launch.appName), artifacts);
        let sequence = 0;
        const capture = async () => {
          const stem = `screen-${String(++sequence).padStart(3, "0")}`;
          const image = await app.getScreenshot();
          const imagePath = join(artifacts, `${stem}.png`);
          await writeFile(imagePath, image);
          const tsv = (await exec("tesseract", [imagePath, "stdout", "--psm", "11", "tsv"], { timeout: 10_000 })).stdout;
          await writeFile(join(artifacts, `${stem}.tsv`), tsv);
          const words: Word[] = tsv.trimEnd().split("\n").slice(1).flatMap(line => {
            const fields = line.split("\t");
            return fields[0] === "5" && fields[11]?.trim() ? [{ text: fields[11].trim(), x: Number(fields[6]), y: Number(fields[7]), width: Number(fields[8]), height: Number(fields[9]) }] : [];
          });
          return { ...PNG.sync.read(Buffer.from(image)), words, text: words.map(word => word.text).join(" ") };
        };
        const center = (word: Word): Point => [word.x + word.width / 2, word.y + word.height / 2];
        // The retained remote dialog renders Entries as "Enties" in
        // Tesseract. Accept only this observed variant; keep all other labels
        // exact, and retain the editor geometry and saved-value assertions.
        const matchesLabel = (text: string, label: string) => text === label || (label === "Entries" && text === "Enties");
        const named = (words: Word[], label: string) => {
          const matches = words.filter(word => matchesLabel(word.text, label));
          if (matches.length !== 1) throw new Error(`Expected one visible ${label}; found ${matches.length}`);
          return matches[0]!;
        };
        try {
          await expect.poll(async () => (await capture()).text, { timeout: 20_000 }).toMatch(/File.*Edit.*View.*Insert/);
          const sheet = await capture();
          // Same configured 1280x900 desktop as existing Calc coordinate tests.
          expect(sheet.width).toBe(1280);
          expect([881, 883]).toContain(sheet.height);
          await app.click([70, 123]);
          await app.pressKey("CTRL+A");
          await app.typeText("D2:D29");
          await app.pressKey("ENTER");
          await app.pressKey("ALT+D");
          await app.pressKey("V");
          await expect(app.getAXState({ disableDiffing: true })).resolves.toContain('dialog = "Validity"');
          const validity = await capture();
          // The Allow label identifies the visible combo directly to its right.
          const allow = named(validity.words, "Allow:");
          await app.click([allow.x + allow.width + 100, allow.y + allow.height / 2]);
          await app.pressKey("HOME");
          for (let index = 0; index < 6; index++) await app.pressKey("ARROWDOWN");
          await app.pressKey("ENTER");
          const list = await capture();
          expect(list.text).toMatch(/List/);
          const entries = named(list.words, "Entries");
          const ok = named(list.words, "OK");
          // Entries labels the large editor to its right. Verify the target is
          // inside the blank visible editor, not an unlabeled AX node.
          const entriesPoint: Point = [entries.x + entries.width + 100, entries.y + entries.height / 2];
          expect(entriesPoint[0]).toBeLessThan(list.width - 20);
          expect(entriesPoint[1]).toBeLessThan(ok.y);
          const pixel = (Math.floor(entriesPoint[1]) * list.width + Math.floor(entriesPoint[0])) * 4;
          expect([...list.data.subarray(pixel, pixel + 3)]).toEqual([255, 255, 255]);
          const expectedChoices = Object.fromEntries(Array.from({ length: 28 }, (_, index) => [`D${index + 2}`, [{ type: "list", choices: ["Pass", "Fail", "Held"], arrowVisible: true }]]));
          await use({ app, dialog: { entriesPoint, okPoint: center(ok), async observe() {
            const screen = await capture();
            const state = await app.getAXState({ disableDiffing: true });
            return { open: state.includes('dialog = "Validity"') && screen.words.some(word => matchesLabel(word.text, "Entries")),
              // OCR sometimes appends the visible caret as ] or ). The saved
              // workbook assertion below still requires exact literal choices.
              choices: screen.words.map(word => word.text.replace(/[|)\]]+$/, "")).filter(text => ["Pass", "Fail", "Held"].includes(text)) };
          } }, document: { originalValues, expectedChoices,
            readChoices: async () => (await readWorkbook(documentPath)).choices,
            readValues: async () => (await readWorkbook(documentPath)).values } });
        } finally {
          // Preserve saved output first, even if the app is no longer observable.
          await copyFile(documentPath, join(artifacts, filename));
          await writeFile(join(artifacts, "saved-workbook.json"), JSON.stringify(await readWorkbook(documentPath), null, 2));
          await capture().catch(() => undefined);
          await app.getAXState({ disableDiffing: true }).then(state => writeFile(join(artifacts, "final-state.txt"), state)).catch(() => undefined);
        }
      });
    } finally {
      await sdk?.close();
      const cleanup = await readFile(join(artifacts, "cleanup.json"), "utf8").then(JSON.parse).catch(() => null);
      if (!launchAttempted || cleanup?.verifiedExited) await rm(temporary, { recursive: true, force: true });
    }
  },
  app: async ({ fixture }, use) => use(fixture.app),
  dialog: async ({ fixture }, use) => use(fixture.dialog),
  document: async ({ fixture }, use) => use(fixture.document),
});
