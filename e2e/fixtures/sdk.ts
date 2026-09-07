import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as base } from "vitest";
import { PNG } from "pngjs";
import { createCua, createOpenSky, type CuaFacade, type OpenSky, type Tab, type TargetHandle } from "opensky-cua";
import { editorPage, servePage, type Site } from "./site.js";

type BrowserFixtures = { sdk: OpenSky; cua: CuaFacade; html: string; site: Site; tab: Tab };

export const test = base.extend<BrowserFixtures>({
  html: editorPage,
  sdk: async ({}, use) => {
    if (process.env.OPENSKY_REAL_DRIVER !== "1") {
      throw new Error("Draft E2E: set OPENSKY_REAL_DRIVER=1 only on a provisioned disposable desktop. No driver was contacted.");
    }
    const binaryPath = (process.env.OPENSKY_DRIVER_BINARY ?? process.env.CUA_DRIVER_BINARY);
    if (!binaryPath) throw new Error("OPENSKY_DRIVER_BINARY must identify the already installed helper. No auto-install/start.");
    const homeDir = await mkdtemp(join(tmpdir(), "opensky-sdk-e2e-"));
    const sdk = createOpenSky({
      homeDir,
      screenshotFormat: "png",
      driverOptions: { binaryPath, autoInstall: false, autoStart: false },
    });
    try {
      await use(sdk);
    } finally {
      try { await sdk.close(); }
      finally {
        // Keep recovery state even when another fixture (for example native
        // window teardown) failed while SDK session shutdown itself succeeded.
        console.info(`SDK E2E recovery/artifact directory: ${homeDir}`);
      }
    }
  },
  cua: async ({ sdk }, use) => { await use(createCua(sdk)); },
  site: async ({ html }, use) => {
    const site = await servePage(html);
    try { await use(site); } finally { await site.close(); }
  },
  tab: async ({ cua, site }, use) => {
    const tab = await cua.createBrowserTab(process.env.OPENSKY_E2E_BROWSER ?? "chrome", site.url, { sessionName: "SDK E2E" });
    try { await use(tab); }
    finally {
      if ((await cua.listTabs({ emit: false })).some(info => info.id === tab.id)) await tab.close();
    }
  },
});

/** Resolve only the current public actionable list; never a driver token or guessed index. */
export function actionIndex(state: string, role: string, name: string): number {
  const indices = state.split("\n").flatMap(line => {
    const match = line.match(/^- \[(\d+)\] (\S+) ("(?:[^"\\]|\\.)*")/);
    return match && match[2] === role && JSON.parse(match[3]!) === name ? [Number(match[1])] : [];
  });
  const unique = [...new Set(indices)];
  if (unique.length !== 1) throw new Error(`Expected one current ${role} named ${JSON.stringify(name)}; found ${unique.length}`);
  return unique[0]!;
}

/** Leaf text from the public outline, excluding aggregate container names and ranked actions. */
export function leafText(state: string): string[] {
  return state.split("\n").flatMap(line => {
    const match = line.match(/^\s*- (?:statictext|text|StaticText) ("(?:[^"\\]|\\.)*")/);
    return match ? [JSON.parse(match[1]!) as string] : [];
  });
}

export function screenshotCenter(png: Uint8Array): [number, number] {
  const bytes = Buffer.from(png.buffer, png.byteOffset, png.byteLength);
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("Expected SDK PNG screenshot");
  return [bytes.readUInt32BE(16) / 2, bytes.readUInt32BE(20) / 2];
}

/** Locate the visible red document marker in the actual public SDK screenshot. */
export function scrollMarkerTop(png: Uint8Array): number {
  const { width, height, data } = PNG.sync.read(Buffer.from(png));
  const columns = [0.35, 0.5, 0.65].map(fraction => Math.floor(width * fraction));
  for (let y = 0; y < height; y++) {
    if (columns.every(x => {
      const pixel = (y * width + x) * 4;
      return data[pixel]! > 200 && data[pixel + 1]! < 80 && data[pixel + 2]! < 80 && data[pixel + 3]! > 200;
    })) return y;
  }
  throw new Error("The document marker is not visible in the SDK screenshot");
}

export const nativeText = "α 😀 one needle.\nβ 😀 two needle.\n";
type NativeDocument = { handle: TargetHandle; path: string; read(): Promise<string> };

export const nativeTest = test.extend<{ document: NativeDocument }>({
  document: async ({ sdk }, use) => {
    if (process.platform !== "darwin") throw new Error("This native fixture requires macOS TextEdit; select browser tests on other platforms.");
    const directory = await mkdtemp(join(tmpdir(), "opensky-native-e2e-"));
    const path = join(directory, "sdk-draft.txt");
    await writeFile(path, nativeText, "utf8");
    let handle: TargetHandle | undefined;
    let closed = false;
    try {
      const opened = await sdk.open_target({ app: "TextEdit", targets: [path], includeScreenshot: false });
      handle = opened.targetHandle;
      await use({ handle: opened.targetHandle, path, read: () => readFile(path, "utf8") });
    } finally {
      try {
        if (handle) {
          // All writes go to this fixture's existing temporary file. Never confirm
          // an unexpected Save As sheet or close a user-owned sibling window.
          await sdk.press_key({ app: handle, key: "super+s" });
          await sdk.close_target({ app: handle });
          closed = true;
        }
      } finally {
        if (closed) await rm(directory, { recursive: true, force: true });
        else console.error(`Native cleanup unproven; preserve scratch document at ${path}`);
      }
    }
  },
});

export function nativeEditorIndex(state: string): number {
  const matches = [...state.matchAll(/^\s*\[(\d+)\] AXTextArea\b/gm)];
  if (matches.length !== 1) throw new Error(`Expected one TextEdit AXTextArea, found ${matches.length}`);
  return Number(matches[0]![1]);
}
