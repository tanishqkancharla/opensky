import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test as base } from "vitest";
import { PNG } from "pngjs";
import { createCua, createOpenSky, type CuaFacade, type OpenSky, type Tab, type TargetHandle } from "opensky-cua";
import { editorPage, servePage, type Site } from "./site.js";
import { withOwnedMacApp } from "../../evals/parity/mac-app.js";
import { verifyDriverRuntime } from "../../evals/parity/driver-runtime.js";

type BrowserFixtures = { sdk: OpenSky; cua: CuaFacade; html: string; site: Site; tab: Tab };

export const test = base.extend<BrowserFixtures>({
  html: editorPage,
  sdk: async ({}, use) => {
    if (process.env.OPENSKY_REAL_DRIVER !== "1") {
      throw new Error("Draft E2E: set OPENSKY_REAL_DRIVER=1 only on a provisioned disposable desktop. No driver was contacted.");
    }
    const binaryPath = (process.env.OPENSKY_DRIVER_BINARY ?? process.env.CUA_DRIVER_BINARY);
    if (!binaryPath) throw new Error("OPENSKY_DRIVER_BINARY must identify the already installed helper. No auto-install/start.");
    const artifactRoot = process.env.OPENSKY_E2E_ARTIFACT_DIR ?? tmpdir();
    await mkdir(artifactRoot, { recursive: true });
    const homeDir = await mkdtemp(join(artifactRoot, "opensky-sdk-e2e-"));
    const socket = process.env.OPENSKY_DRIVER_SOCKET ?? process.env.CUA_DRIVER_SOCKET;
    if (process.platform === "darwin") await verifyDriverRuntime({ binaryPath, socket, artifacts: homeDir });
    const sdk = createOpenSky({
      homeDir,
      autoLaunch: false,
      screenshotFormat: "png",
      driverOptions: { binaryPath, socket, autoInstall: false, autoStart: false },
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
      if (process.env.OPENSKY_E2E_ARTIFACT_DIR) {
        const directory = await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR, "tab-"));
        // Diagnostics happen after the test: they cannot refresh its action mapping.
        for (const [name, capture] of [
          ["final.png", () => tab.getScreenshot({ emit: false })],
          ["final-ax.txt", () => tab.getAXState({ emit: false, disableDiffing: true })],
        ] as const) {
          try { await writeFile(join(directory, name), await capture()); }
          catch (error) { console.error(`Could not retain ${name}:`, error); }
        }
      }
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
    const artifacts = await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR ?? tmpdir(), "native-document-"));
    const path = join(directory, "sdk-draft.txt");
    await writeFile(path, nativeText, "utf8");
    try {
      await withOwnedMacApp({ appPath: "/System/Applications/TextEdit.app", bundleId: "com.apple.TextEdit", artifacts, openDocuments: [path] }, async owned => {
        const deadline = Date.now() + 30_000;
        let ready = false;
        let activation;
        do {
          const state = await owned.inspect();
          ready = state.finishedLaunching && state.windows.some(window => window.onScreen && window.title === "sdk-draft.txt");
          if (!ready && activation === undefined && state.windows.some(window => window.title === "sdk-draft.txt")) activation = await owned.activate();
          if (!ready) await delay(250);
        } while (!ready && Date.now() < deadline);
        await writeFile(join(artifacts, "fixture-readiness.json"), JSON.stringify({ ready, activation, state: await owned.inspect() }, null, 2));
        if (!ready) throw new Error("Owned TextEdit document did not become visible; selection test not started");
        const opened = await sdk.get_app_state({ app: "com.apple.TextEdit", includeScreenshot: false, disableDiff: true });
        await writeFile(join(artifacts, "sdk-initial.txt"), opened.text);
        try {
          await use({ handle: opened.targetHandle, path, read: () => readFile(path, "utf8") });
        } finally {
          await writeFile(join(artifacts, "saved-before-cleanup.txt"), await readFile(path));
          // Only this existing temporary document can receive cleanup input.
          try { await sdk.press_key({ app: opened.targetHandle, key: "super+s" }); }
          catch (error) {
            // A discovery failure must not be masked by the same refusal in
            // teardown. Process exit is still independently verified below.
            await writeFile(join(artifacts, "cleanup-save-error.txt"), String(error));
          }
        }
      });
    } finally {
      const cleanup = await readFile(join(artifacts, "cleanup.json"), "utf8").then(JSON.parse).catch(() => null);
      const temporaryRemoved = cleanup?.verifiedExited === true;
      if (temporaryRemoved) await rm(directory, { recursive: true, force: true });
      await writeFile(join(artifacts, "fixture-cleanup.json"), JSON.stringify({ temporaryRemoved, cleanup }, null, 2));
      console.info(`Native document evidence: ${artifacts}`);
      if (!temporaryRemoved) console.error(`Native cleanup unproven; preserve scratch document at ${path}`);
    }
  },
});

export function nativeEditorIndex(state: string): number {
  const matches = [...state.matchAll(/^\s*(?:-\s*)?\[(\d+)\] AXTextArea\b/gm)];
  if (matches.length !== 1) throw new Error(`Expected one TextEdit AXTextArea, found ${matches.length}`);
  return Number(matches[0]![1]);
}
