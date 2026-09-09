import { test as base, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendFile, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { createOpenSky } from "../../src/index.js";
import { assertDisposableLinuxDesktop, withOwnedLinuxApp } from "../../evals/parity/linux-app.js";
const exec = promisify(execFile);

type Target = { click(index: number): Promise<void>; activate(): Promise<void>; pressKey(key: string): Promise<void>; typeText(text: string): Promise<void>; readText(): Promise<string> };
type Fixture = {
  target: Target;
  sibling: { activate(): Promise<void>; save(): Promise<void>; readText(): Promise<string>; hasFocus(): Promise<boolean> };
  modal: { readTree(): Promise<string>; typeText(text: string): Promise<void>; readState(): Promise<string>; close(): Promise<void> };
};

async function createDocument(path: string, text: string): Promise<void> {
  await exec(process.env.OPENSKY_EVAL_PYTHON ?? "python3", ["-c", `
import sys,zipfile,xml.sax.saxutils as X
with zipfile.ZipFile(sys.argv[1], 'x') as z:
 z.writestr('mimetype','application/vnd.oasis.opendocument.text',compress_type=zipfile.ZIP_STORED)
 z.writestr('META-INF/manifest.xml','<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>')
 z.writestr('content.xml','<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2"><office:body><office:text><text:p>'+X.escape(sys.argv[2])+'</text:p></office:text></office:body></office:document-content>')
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

export const test = base.extend<Fixture & { fixture: Fixture }>({
  fixture: async ({ task }, use) => {
    assertDisposableLinuxDesktop();
    const artifacts = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "focus-typing", task.name.split(":")[0]);
    const targetArtifacts = join(artifacts, "target");
    const siblingArtifacts = join(artifacts, "sibling");
    await mkdir(targetArtifacts, { recursive: true });
    await mkdir(siblingArtifacts, { recursive: true });
    const temporary = await mkdtemp(join(tmpdir(), "opensky-focus-typing-"));
    const targetFile = join(temporary, "target.odt");
    const siblingFile = join(temporary, "sibling.odt");
    await createDocument(targetFile, "Target document.");
    await createDocument(siblingFile, "Sibling document.");
    const sdk = createOpenSky({ homeDir: join(temporary, "sdk"), autoLaunch: false,
      driverOptions: { binaryPath: process.env.OPENSKY_DRIVER_BINARY, socket: process.env.OPENSKY_DRIVER_SOCKET, autoStart: false, autoInstall: false } });
    const launch = (name: string, document: string, directory: string) => ({ executable: "/usr/bin/libreoffice", documentTitle: `${name}.odt`, artifacts: directory,
      args: [`-env:UserInstallation=${pathToFileURL(join(temporary, `${name}-profile`)).href}`, "--norestore", "--nologo", "--nofirststartwizard", "--writer", document],
      env: { SAL_USE_VCLPLUGIN: "gtk3", NO_AT_BRIDGE: "0" } });
    const timed = async <T>(name: string, action: () => Promise<T>): Promise<T> => {
      const start = performance.now();
      try { return await action(); }
      finally { await appendFile(join(artifacts, "action-timing.jsonl"), JSON.stringify({ name, durationMs: performance.now() - start }) + "\n"); }
    };
    try {
      await withOwnedLinuxApp(launch("target", targetFile, targetArtifacts), async targetOwned => {
        // Bind the exact document before opening another LibreOffice process.
        // This is the public SDK window handle, not an injected test target.
        const state = await sdk.get_app_state({ app: "LibreOffice", scope: "window", includeScreenshot: false });
        const handle = state.targetHandle;
        const target: Target = {
          click: async index => { await timed("target.click", () => sdk.invoke("click", { pid: targetOwned.pid, window_id: Number(targetOwned.window), element_index: index })); },
          activate: async () => { await sdk.bring_to_front({ app: handle }); },
          pressKey: async key => { await timed(`target.pressKey(${key})`, () => sdk.press_key({ app: handle, key })); },
          typeText: async text => { await timed("target.typeText", () => sdk.type_text({ app: handle, text })); },
          readText: () => documentText(targetFile),
        };
        await withOwnedLinuxApp(launch("sibling", siblingFile, siblingArtifacts), async siblingOwned => {
          const siblingTarget = { pid: siblingOwned.pid, window_id: Number(siblingOwned.window) };
          const modalTarget = async () => {
            let found: Record<string, unknown> | undefined;
            await expect.poll(async () => {
              const reply = await sdk.invoke("list_windows", { pid: targetOwned.pid });
              const data = reply.structured as { windows?: Record<string, unknown>[] };
              found = data.windows?.find(window => /Find.*Replace/i.test(String(window.title)));
              return found !== undefined;
            }, { timeout: 15_000 }).toBe(true);
            return { pid: targetOwned.pid, window_id: Number(found!.window_id ?? found!.id ?? found!.xid) };
          };
          try {
            await use({ target,
              sibling: {
                activate: async () => { await sdk.invoke("bring_to_front", siblingTarget); },
                save: async () => { await sdk.invoke("press_key", { ...siblingTarget, key: "s", modifiers: ["ctrl"], delivery_mode: "foreground" }); },
                readText: () => documentText(siblingFile),
                hasFocus: async () => (await exec("xdotool", ["getactivewindow"])).stdout.trim() === siblingOwned.window,
              },
              modal: {
                readTree: async () => String(((await sdk.invoke("get_window_state", { ...await modalTarget(), include_screenshot: false })).structured as { tree_markdown?: string })?.tree_markdown ?? ""),
                typeText: async text => { await sdk.invoke("type_text", { ...await modalTarget(), text, delivery_mode: "foreground" }); },
                readState: async () => JSON.stringify((await sdk.invoke("get_window_state", { ...await modalTarget(), include_screenshot: false })).structured),
                close: async () => { await sdk.invoke("press_key", { ...await modalTarget(), key: "Escape", delivery_mode: "foreground" }); },
              },
            });
          } finally {
            await copyFile(targetFile, join(targetArtifacts, "target.odt"));
            await copyFile(siblingFile, join(siblingArtifacts, "sibling.odt"));
            await writeFile(join(artifacts, "final-windows.json"), JSON.stringify(await sdk.invoke("list_windows", {}), null, 2)).catch(() => undefined);
            // Retain a modal's real field values even if the rejection assertion
            // fails immediately because the SDK unexpectedly accepted the input.
            const windows = (await sdk.invoke("list_windows", { pid: targetOwned.pid }).catch(() => null))?.structured as { windows?: Record<string, unknown>[] } | undefined;
            const dialog = windows?.windows?.find(window => /Find.*Replace/i.test(String(window.title)));
            if (dialog) await writeFile(join(artifacts, "final-modal-state.json"), JSON.stringify(await sdk.invoke("get_window_state", {
              pid: targetOwned.pid, window_id: Number(dialog.window_id ?? dialog.id ?? dialog.xid), include_screenshot: false,
            }), null, 2)).catch(() => undefined);
          }
        });
      });
    } finally {
      await sdk.close();
      const cleanup = await Promise.all([targetArtifacts, siblingArtifacts].map(directory => readFile(join(directory, "cleanup.json"), "utf8").then(JSON.parse).catch(() => null)));
      const verifiedExited = cleanup.every(receipt => receipt?.verifiedExited);
      if (verifiedExited) await rm(temporary, { recursive: true, force: true });
      await writeFile(join(artifacts, "cleanup.json"), JSON.stringify({ verifiedExited, temporaryRemoved: verifiedExited,
        target: cleanup[0], sibling: cleanup[1] }, null, 2));
    }
  },
  target: async ({ fixture }, use) => use(fixture.target),
  sibling: async ({ fixture }, use) => use(fixture.sibling),
  modal: async ({ fixture }, use) => use(fixture.modal),
});
