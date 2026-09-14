import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as base } from "vitest";
import { PNG } from "pngjs";
import { createCua, createOpenSky, type CuaFacade, type Tab, type TargetHandle } from "opensky-cua";
import { editorPage, servePage, type Site } from "./site.js";
import { verifyDriverRuntime } from "../../evals/parity/driver-runtime.js";
import { withSdkOwnedMacDocument } from "./mac-sdk-document.js";

export type PublicSdk = Parameters<typeof createCua>[0];

type BrowserFixtures = { sdk: PublicSdk; cua: CuaFacade; html: string; site: Site; tab: Tab };

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
    if (process.platform === "darwin" && process.env.OPENSKY_E2E_ARTIFACT_DIR) {
      // Retain actual launch/window observations for intermittent opening
      // failures. This forwards every call unchanged; it never supplies results.
      const call = sdk.driver.call.bind(sdk.driver);
      sdk.driver.call = async (tool, args = {}) => {
        const startedAt = new Date().toISOString();
        const result = await call(tool, args);
        if (tool === "launch_app" || (tool === "list_windows" && args.pid)) {
          await appendFile(join(homeDir, "native-window-calls.jsonl"), JSON.stringify({
            startedAt, tool, args, structured: result.structured,
          }) + "\n");
        }
        return result;
      };
    }
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
type NativeDocument = { handle: TargetHandle; path: string; editorIndex: number; initialText: string; read(): Promise<string> };

export const nativeTest = test.extend<{ document: NativeDocument; documentText: string }>({
  documentText: nativeText,
  document: async ({ sdk, documentText }, use) => {
    if (process.platform !== "darwin") throw new Error("This native fixture requires macOS TextEdit; select browser tests on other platforms.");
    const directory = await mkdtemp(join(tmpdir(), "opensky-native-e2e-"));
    const artifacts = await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR ?? tmpdir(), "native-document-"));
    const path = join(directory, "sdk-draft.txt");
    await writeFile(path, documentText, "utf8");
    try {
      await withSdkOwnedMacDocument({ sdk, path, artifacts }, async owned => {
        const opened = await sdk.get_app_state({ app: owned.handle, includeScreenshot: false, disableDiff: true });
        await writeFile(join(artifacts, "sdk-initial.txt"), opened.text);
        try {
          await use({ handle: owned.handle, path, editorIndex: nativeEditorIndex(opened.text), initialText: documentText, read: () => readFile(path, "utf8") });
        } finally {
          // Observe the public outcome after the test, including when paste
          // reports uncertainty before the test can save. This diagnostic
          // cannot turn a failed action or saved-file assertion into a pass.
          try {
            const after = await sdk.get_app_state({ app: owned.handle, includeScreenshot: false, disableDiff: true });
            await writeFile(join(artifacts, "post-action-ax.txt"), after.text);
          } catch (error) {
            await writeFile(join(artifacts, "post-action-observation-error.txt"), String(error));
          }
          // Capture the persisted file before any teardown save. The test's
          // explicit save remains the saved-file oracle; this is recovery only.
          await writeFile(join(artifacts, "saved-before-cleanup.txt"), await readFile(path));
          try { await sdk.press_key({ app: opened.targetHandle, key: "super+s" }); }
          catch (error) {
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
