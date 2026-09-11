import { test as base, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { createOpenSky, createCua } from "../../src/index.js";
import type { App } from "../../src/cua.js";
import { recordAppTiming } from "./app-timing.js";
import { assertDisposableLinuxDesktop, withOwnedLinuxApp } from "../../evals/parity/linux-app.js";
const exec = promisify(execFile);
const paragraphs = ["First paragraph must stay unchanged.", "😀 café é one needle; two needle.", "Last paragraph must stay unchanged."];
type Fixture = { app: App; paragraph: number; strikeButton: number; document: { readText(): Promise<string>; readStruckText(): Promise<string[]> } };

async function createDocument(path: string, text: string): Promise<void> {
  await exec(process.env.OPENSKY_EVAL_PYTHON ?? "python3", ["-c", `
import sys,zipfile,xml.sax.saxutils as X
with zipfile.ZipFile(sys.argv[1], 'x') as z:
 z.writestr('mimetype','application/vnd.oasis.opendocument.text',compress_type=zipfile.ZIP_STORED)
 z.writestr('META-INF/manifest.xml','<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>')
 z.writestr('content.xml','<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2"><office:body><office:text><text:p>'+'</text:p><text:p>'.join(X.escape(p) for p in sys.argv[2].split('\\n'))+'</text:p></office:text></office:body></office:document-content>')
`, path, text]);
}
async function documentText(path: string): Promise<string> {
  return (await exec(process.env.OPENSKY_EVAL_PYTHON ?? "python3", ["-c", `
import sys,zipfile,xml.etree.ElementTree as E
with zipfile.ZipFile(sys.argv[1]) as z: r=E.fromstring(z.read('content.xml'))
n={'o':'urn:oasis:names:tc:opendocument:xmlns:office:1.0','t':'urn:oasis:names:tc:opendocument:xmlns:text:1.0'}
def visible(e):
 out=e.text or ''
 for c in e:
  if c.tag=='{'+n['t']+'}s': out+=' '*int(c.get('{'+n['t']+'}c','1'))
  elif c.tag=='{'+n['t']+'}tab': out+='\\t'
  elif c.tag=='{'+n['t']+'}line-break': out+='\\n'
  else: out+=visible(c)
  out+=c.tail or ''
 return out
print('\\n'.join(visible(p) for p in r.findall('.//o:text/t:p',n)),end='')
`, path])).stdout;
}

async function documentStruckText(path: string): Promise<string[]> {
  const output = (await exec(process.env.OPENSKY_EVAL_PYTHON ?? "python3", ["-c", `
import sys,zipfile,json,xml.etree.ElementTree as E
n={'o':'urn:oasis:names:tc:opendocument:xmlns:office:1.0','t':'urn:oasis:names:tc:opendocument:xmlns:text:1.0','s':'urn:oasis:names:tc:opendocument:xmlns:style:1.0'}
with zipfile.ZipFile(sys.argv[1]) as z:
 root=E.fromstring(z.read('content.xml'))
 roots=[root]+([E.fromstring(z.read('styles.xml'))] if 'styles.xml' in z.namelist() else [])
styles={e.get('{'+n['s']+'}name'):e for r in roots for e in r.findall('.//s:style',n)}
def style_strike(name,inherited,seen=()):
 if not name or name not in styles or name in seen: return inherited
 e=styles[name]
 value=style_strike(e.get('{'+n['s']+'}parent-style-name'),inherited,seen+(name,))
 p=e.find('s:text-properties',n)
 if p is not None:
  line=p.get('{'+n['s']+'}text-line-through-style')
  if line is not None: value=line!='none'
 return value
def struck(e,inherited=False):
 active=style_strike(e.get('{'+n['t']+'}style-name'),inherited)
 out=(e.text or '') if active else ''
 for c in e:
  if c.tag=='{'+n['t']+'}s': out+=(' '*int(c.get('{'+n['t']+'}c','1'))) if active else ''
  elif c.tag=='{'+n['t']+'}tab': out+='\\t' if active else ''
  elif c.tag=='{'+n['t']+'}line-break': out+='\\n' if active else ''
  else: out+=struck(c,active)
  if active: out+=c.tail or ''
 return out
print(json.dumps([struck(p) for p in root.findall('.//o:text/t:p',n)]))
`, path])).stdout;
  return JSON.parse(output) as string[];
}

export const test = base.extend<Fixture & { fixture: Fixture }>({
  fixture: async ({ task }, use) => {
    assertDisposableLinuxDesktop();
    const artifacts = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "selection", task.name.split(":")[0]);
    await mkdir(artifacts, { recursive: true });
    const temporary = await mkdtemp(join(tmpdir(), "opensky-selection-"));
    const document = join(temporary, "selection.odt");
    await createDocument(document, paragraphs.join("\n"));
    const sdk = createOpenSky({ homeDir: join(temporary, "sdk"), autoLaunch: false,
      driverOptions: { binaryPath: process.env.OPENSKY_DRIVER_BINARY, socket: process.env.OPENSKY_DRIVER_SOCKET, autoStart: false, autoInstall: false } });
    try {
      // Ordinary user preference: a fresh profile should not interrupt the
      // edit with startup tips. No document or input behavior is configured.
      // LibreOffice 24.2 Common.xcs: /Office.Common/Misc/ShowTipOfTheDay.
      const profileUser = join(temporary, "profile", "user");
      await mkdir(profileUser, { recursive: true });
      const preferences = '<?xml version="1.0" encoding="UTF-8"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Misc"><prop oor:name="ShowTipOfTheDay" oor:op="fuse"><value>false</value></prop></item></oor:items>';
      await writeFile(join(profileUser, "registrymodifications.xcu"), preferences);
      await writeFile(join(artifacts, "initial-profile-preferences.xcu"), preferences);
      await withOwnedLinuxApp({ executable: "/usr/bin/libreoffice", documentTitle: "selection.odt", artifacts,
        args: [`-env:UserInstallation=${pathToFileURL(join(temporary, "profile")).href}`, "--norestore", "--nologo", "--nofirststartwizard", "--writer", document],
        env: { SAL_USE_VCLPLUGIN: "gtk3", NO_AT_BRIDGE: "0" },
      }, async () => {
        const app = recordAppTiming(await createCua(sdk).getApp("LibreOffice"), artifacts);
        try {
          let paragraph: number | undefined;
          let strikeButton: number | undefined;
          await expect.poll(async () => {
            const state = await app.getAXState({ disableDiffing: true });
            const line = state.split("\n").find(line => line.includes(paragraphs[1]) && /\[\d+\] paragraph/.test(line));
            paragraph = line ? Number(line.match(/\[(\d+)\]/)![1]) : undefined;
            const strike = state.match(/\[(\d+)\] toggle button "Strikethrough"/);
            strikeButton = strike ? Number(strike[1]) : undefined;
            return paragraph !== undefined && strikeButton !== undefined;
          }, { timeout: 20_000 }).toBe(true);
          await use({ app, paragraph: paragraph!, strikeButton: strikeButton!, document: { readText: () => documentText(document), readStruckText: () => documentStruckText(document) } });
        } finally {
          await writeFile(join(artifacts, "final.png"), await app.getScreenshot()).catch(() => undefined);
          await copyFile(document, join(artifacts, "selection.odt"));
        }
      });
    } finally {
      await sdk.close();
      const cleanup = await readFile(join(artifacts, "cleanup.json"), "utf8").then(JSON.parse).catch(() => null);
      if (cleanup?.verifiedExited) await rm(temporary, { recursive: true, force: true });
      await writeFile(join(artifacts, "temporary-cleanup.json"), JSON.stringify({ removed: cleanup?.verifiedExited === true }));
    }
  },
  app: async ({ fixture }, use) => use(fixture.app),
  paragraph: async ({ fixture }, use) => use(fixture.paragraph),
  strikeButton: async ({ fixture }, use) => use(fixture.strikeButton),
  document: async ({ fixture }, use) => use(fixture.document),
});
