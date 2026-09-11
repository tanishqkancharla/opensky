import { withNativeSky, type NativeSky } from "./native-keyboard-control.js";
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
const paragraphs = ["First paragraph must stay unchanged.", "H2O—Soak up the Science.", "Last paragraph must stay unchanged."];
type Fixture = { sky: NativeSky; app: App; paragraph: number; document: { readText(): Promise<string> } };

async function createDocument(path: string): Promise<void> {
  await exec(process.env.OPENSKY_EVAL_PYTHON ?? "python3", ["-c", `
import sys,zipfile,xml.sax.saxutils as X
with zipfile.ZipFile(sys.argv[1], 'x') as z:
 z.writestr('mimetype','application/vnd.oasis.opendocument.text',compress_type=zipfile.ZIP_STORED)
 z.writestr('META-INF/manifest.xml','<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>')
 z.writestr('content.xml','<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2"><office:body><office:text><text:p>'+'</text:p><text:p>'.join(X.escape(p) for p in sys.argv[2].split('\\n'))+'</text:p></office:text></office:body></office:document-content>')
`, path, paragraphs.join("\n")]);
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

export const test = base.extend<Fixture & { owned: Fixture }>({
  owned: async ({ task }, use) => {
    assertDisposableLinuxDesktop();
    const artifacts = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "hybrid-selection-arrows", task.name.split(":")[0]);
    await mkdir(resolve(artifacts, ".."), { recursive: true });
    await mkdir(artifacts); // Never replace an earlier attempt.
    const temporary = await mkdtemp(join(tmpdir(), "opensky-subscript35-selection-"));
    const document = join(temporary, "subscript35-selection.odt");
    let sdk: ReturnType<typeof createOpenSky> | undefined;
    try {
      await createDocument(document);
      expect(await documentText(document)).toBe(paragraphs.join("\n"));
      sdk = createOpenSky({ homeDir: join(temporary, "sdk"), autoLaunch: false,
        driverOptions: { binaryPath: process.env.OPENSKY_DRIVER_BINARY, socket: process.env.OPENSKY_DRIVER_SOCKET, autoStart: false, autoInstall: false } });
      const runtime = sdk;
      await withOwnedLinuxApp({ executable: "/usr/bin/libreoffice", documentTitle: "subscript35-selection.odt", artifacts,
        args: [`-env:UserInstallation=${pathToFileURL(join(temporary, "profile")).href}`, "--norestore", "--nologo", "--nofirststartwizard", "--writer", document],
        env: { SAL_USE_VCLPLUGIN: "gtk3", NO_AT_BRIDGE: "0" },
      }, async () => {
        const app = recordAppTiming(await createCua(runtime).getApp("LibreOffice"), artifacts);
        try {
          let paragraph: number | undefined;
          await expect.poll(async () => {
            const tree = await app.getAXState({ disableDiffing: true });
            const rows = tree.split("\n").filter(line => line.includes(JSON.stringify(paragraphs[1])) && /\[\d+\] paragraph /.test(line));
            paragraph = rows.length === 1 ? Number(rows[0]!.match(/\[(\d+)\]/)![1]) : undefined;
            return paragraph !== undefined;
          }, { timeout: 20_000 }).toBe(true);
          await withNativeSky(artifacts, async sky => {
            await use({ sky, app, paragraph: paragraph!, document: { readText: () => documentText(document) } });
          });
        } finally {
          // Capture failure evidence too. An unavailable screenshot must not
          // replace the body's saved-outcome error or prevent owned cleanup.
          try { await writeFile(join(artifacts, "final.png"), await app.getScreenshot()); }
          catch (error) { await writeFile(join(artifacts, "screenshot-error.txt"), String(error)); }
          await copyFile(document, join(artifacts, "subscript35-selection.odt"));
          const saved = await documentText(document);
          const expectedDigit = paragraphs.join("\n").replace("H2O", "HMARKO");
          const expectedO = paragraphs.join("\n").replace("H2O", "H2MARK");
          await writeFile(join(artifacts, "saved-selection-diagnostic.json"), JSON.stringify({
            saved, expectedDigit, expectedO,
            replacement: saved === expectedDigit ? "digit-2" : saved === expectedO ? "letter-O" : "other-or-unsaved",
            note: "Saved replacement identifies the edited character. This read-only saved outcome distinguishes the selected character; This hybrid uses OpenSky selection setup for both key routes. It isolates key delivery; it is not native selectText acceptance.",
          }, null, 2));
        }
      });
    } finally {
      try { await sdk?.close(); }
      finally {
        const cleanup = await readFile(join(artifacts, "cleanup.json"), "utf8").then(JSON.parse).catch(() => null);
        if (!sdk || cleanup?.verifiedExited) await rm(temporary, { recursive: true, force: true });
        await writeFile(join(artifacts, "temporary-cleanup.json"), JSON.stringify({ removed: !sdk || cleanup?.verifiedExited === true }));
      }
    }
  },
  sky: async ({ owned }, use) => use(owned.sky),
  app: async ({ owned }, use) => use(owned.app),
  paragraph: async ({ owned }, use) => use(owned.paragraph),
  document: async ({ owned }, use) => use(owned.document),
});
