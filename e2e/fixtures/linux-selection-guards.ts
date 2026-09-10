import { test as base, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { createOpenSky } from "../../src/index.js";
import { assertDisposableLinuxDesktop, withOwnedLinuxApp } from "../../evals/parity/linux-app.js";
const exec = promisify(execFile);
type Window = { pid: number; window_id: number };
type ObservedElement = Window & { element_index: number; element_token: string; snapshot_id: string };
type Fixture = {
  sdk: ReturnType<typeof createOpenSky>; target: Window; sibling: Window;
  selection: ObservedElement & { text: string }; toolbar: ObservedElement;
  documents: { target(): Promise<string>; sibling(): Promise<string>; struck(): Promise<string[]> };
  observeToolbar(): Promise<ObservedElement>;
  desktop: { activeWindow(): Promise<number> };
  modal: { target: Window; readState(): Promise<string> };
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


type FixtureState = Omit<Fixture, "sibling"> & { sibling: Window | null };

export const test = base.extend<Fixture & { fixture: FixtureState }>({
  fixture: async ({ task }, use) => {
    assertDisposableLinuxDesktop();
    const artifacts = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "selection-guards", task.name.split(":")[0]);
    await mkdir(artifacts, { recursive: true });
    const temporary = await mkdtemp(join(tmpdir(), "opensky-selection-guards-"));
    const targetFile = join(temporary, "guard-target.odt");
    const siblingFile = join(temporary, "guard-sibling.odt");
    await createDocument(targetFile, "Target document. needle.");
    await createDocument(siblingFile, "Sibling document. needle.");
    const openSibling = !task.name.startsWith("SELECT-G04:");
    const sdk = createOpenSky({ homeDir: join(temporary, "sdk"), autoLaunch: false,
      driverOptions: { binaryPath: process.env.OPENSKY_DRIVER_BINARY, socket: process.env.OPENSKY_DRIVER_SOCKET, autoStart: false, autoInstall: false } });
    try {
      // G04 isolates token invalidation in one window. Coincident maximized
      // sibling bounds currently cause a separate unresolved frame-identity
      // refusal before selection; before01 did not reach its stale assertion.
      // Other cases use same-process siblings with distinct ordinary WM bounds.
      await withOwnedLinuxApp({ executable: "/usr/bin/libreoffice", documentTitle: "guard-target.odt", artifacts,
        args: [`-env:UserInstallation=${pathToFileURL(join(temporary, "profile")).href}`, "--norestore", "--nologo", "--nofirststartwizard", "--writer", targetFile, ...(openSibling ? [siblingFile] : [])],
        env: { SAL_USE_VCLPLUGIN: "gtk3", NO_AT_BRIDGE: "0" },
      }, async owned => {
        const target = { pid: owned.pid, window_id: Number(owned.window) };
        const windows = async () => ((await sdk.invoke("list_windows", { pid: owned.pid })).structured as { windows?: Record<string, unknown>[] }).windows ?? [];
        const findWindow = async (title: RegExp): Promise<Window> => {
          let found: Record<string, unknown> | undefined;
          await expect.poll(async () => {
            found = (await windows()).find(window => title.test(String(window.title)));
            return found !== undefined;
          }, { timeout: 20_000 }).toBe(true);
          return { pid: owned.pid, window_id: Number(found!.window_id ?? found!.id ?? found!.xid) };
        };
        const sibling = openSibling ? await findWindow(/^guard-sibling\.odt/) : null;
        if (sibling) {
          expect(sibling.window_id).not.toBe(target.window_id);
          await sdk.invoke("bring_to_front", sibling);
          const id = String(sibling.window_id);
          const maximized = (await exec("xprop", ["-id", id, "_NET_WM_STATE"])).stdout;
          // Use Openbox's ordinary restore action only when actually maximized.
          if (maximized.includes("_NET_WM_STATE_MAXIMIZED")) {
            await exec("xdotool", ["key", "--clearmodifiers", "alt+F10"]);
            await expect.poll(async () => (await exec("xprop", ["-id", id, "_NET_WM_STATE"])).stdout,
              { timeout: 5_000 }).not.toContain("_NET_WM_STATE_MAXIMIZED");
          }
          await exec("xdotool", ["windowsize", "--sync", id, "740", "520"], { timeout: 5_000 });
          await exec("xdotool", ["windowmove", "--sync", id, "350", "250"], { timeout: 5_000 });
          const siblingGeometry = (await exec("xdotool", ["getwindowgeometry", "--shell", id])).stdout;
          const targetGeometry = (await exec("xdotool", ["getwindowgeometry", "--shell", String(target.window_id)])).stdout;
          const bounds = (value: string) => value.split("\n").filter(line => /^(X|Y|WIDTH|HEIGHT)=/.test(line)).join("\n");
          expect(bounds(siblingGeometry)).not.toBe(bounds(targetGeometry));
          await writeFile(join(artifacts, "window-layout.json"), JSON.stringify({ targetGeometry, siblingGeometry }, null, 2));
          await sdk.invoke("press_key", { ...sibling, key: "End", modifiers: ["ctrl"], delivery_mode: "foreground" });
        }
        await sdk.invoke("bring_to_front", target);
        let selection: Fixture["selection"] | undefined;
        let toolbar: ObservedElement | undefined;
        await expect.poll(async () => {
          const result = await sdk.invoke("get_window_state", { ...target, include_screenshot: false });
          const state = result.structured as { snapshot_id?: string; elements?: Array<{ element_index: number; element_token?: string; role?: string; label?: string; value?: string }> };
          const paragraph = state.elements?.find(element => element.role === "paragraph" &&
            [element.label, element.value].some(value => value?.includes("Target document. needle.")));
          const strike = state.elements?.find(element => element.role === "toggle button" && element.label === "Strikethrough");
          if (paragraph?.element_token && strike?.element_token && state.snapshot_id) {
            selection = { ...target, element_index: paragraph.element_index, element_token: paragraph.element_token, snapshot_id: state.snapshot_id, text: "needle" };
            toolbar = { ...target, element_index: strike.element_index, element_token: strike.element_token, snapshot_id: state.snapshot_id };
          }
          await writeFile(join(artifacts, "initial-target-state.json"), JSON.stringify(result, null, 2));
          return selection !== undefined && toolbar !== undefined;
        }, { timeout: 30_000 }).toBe(true);
        let modalWindow = target;
        if (task.name.startsWith("SELECT-G02:")) {
          await sdk.invoke("press_key", { ...target, key: "h", modifiers: ["ctrl"], delivery_mode: "foreground" });
          modalWindow = await findWindow(/Find.*Replace/i);
          expect(modalWindow.window_id).not.toBe(target.window_id);
          await sdk.invoke("type_text", { ...modalWindow, text: "Keep this search", delivery_mode: "foreground" });
        }
        try {
          await use({ sdk, target, sibling, selection: selection!, toolbar: toolbar!,
            documents: { target: () => documentText(targetFile), sibling: () => documentText(siblingFile), struck: () => documentStruckText(targetFile) },
            observeToolbar: async () => {
              const result = await sdk.invoke("get_window_state", { ...target, include_screenshot: false });
              const state = result.structured as { snapshot_id?: string; elements?: Array<{ element_index: number; element_token?: string; role?: string; label?: string }> };
              const button = state.elements?.find(element => element.role === "toggle button" && element.label === "Strikethrough");
              if (!button?.element_token || !state.snapshot_id) throw new Error("Fresh Strikethrough toolbar target is unavailable");
              return { ...target, element_index: button.element_index, element_token: button.element_token, snapshot_id: state.snapshot_id };
            },
            desktop: { activeWindow: async () => Number((await exec("xdotool", ["getactivewindow"])).stdout.trim()) },
            modal: { target: modalWindow, readState: async () => JSON.stringify((await sdk.invoke("get_window_state", { ...modalWindow, include_screenshot: false })).structured) },
          });
        } finally {
          await copyFile(targetFile, join(artifacts, "guard-target.odt"));
          await copyFile(siblingFile, join(artifacts, "guard-sibling.odt"));
          await writeFile(join(artifacts, "final-windows.json"), JSON.stringify(await windows(), null, 2)).catch(() => undefined);
          for (const [name, window] of [["target", target], ["sibling", sibling], ["modal", modalWindow]] as const) {
            if (!window) continue;
            await writeFile(join(artifacts, `final-${name}-state.json`), JSON.stringify(await sdk.invoke("get_window_state", { ...window, include_screenshot: true }), null, 2)).catch(() => undefined);
          }
        }
      });
    } finally {
      await sdk.close();
      const cleanup = await readFile(join(artifacts, "cleanup.json"), "utf8").then(JSON.parse).catch(() => null);
      if (cleanup?.verifiedExited) await rm(temporary, { recursive: true, force: true });
      await writeFile(join(artifacts, "temporary-cleanup.json"), JSON.stringify({ removed: cleanup?.verifiedExited === true }));
    }
  },
  sdk: async ({ fixture }, use) => use(fixture.sdk),
  target: async ({ fixture }, use) => use(fixture.target),
  sibling: async ({ fixture }, use) => {
    if (!fixture.sibling) throw new Error("This case deliberately has no open sibling window");
    await use(fixture.sibling);
  },
  selection: async ({ fixture }, use) => use(fixture.selection),
  toolbar: async ({ fixture }, use) => use(fixture.toolbar),
  documents: async ({ fixture }, use) => use(fixture.documents),
  observeToolbar: async ({ fixture }, use) => use(fixture.observeToolbar),
  desktop: async ({ fixture }, use) => use(fixture.desktop),
  modal: async ({ fixture }, use) => use(fixture.modal),
});
