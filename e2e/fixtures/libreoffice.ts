import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test as base } from "vitest";
import { createOpenSky, createCua, type CuaApp, type OpenSky, type TargetHandle } from "opensky-cua";
import { withOwnedMacApp } from "../../evals/parity/mac-app.js";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const exec = promisify(execFile);
const contexts = new WeakMap<CuaApp, { sdk: OpenSky; document: string; originalHandle: TargetHandle }>();
type SavedDocument = { readText(): Promise<string[]>; expectedText: string[]; originalHandle: TargetHandle };
const source = join(repo, "evals/parity/osworld/3ef2b351-8a84-4ff2-8724-d86eae9b842e/Constitution_Template_With_Guidelines.docx");
const marker = "OpenSky save probe ";

async function documentText(path: string): Promise<string[]> {
  const python = process.env.OPENSKY_EVAL_PYTHON;
  if (!python) throw new Error("Set OPENSKY_EVAL_PYTHON to the real python-docx environment for saved-file assertions");
  const result = await exec(python, ["-c", "import json,sys; from docx import Document; d=Document(sys.argv[1]); print(json.dumps([p.text for p in d.paragraphs]+[c.text for t in d.tables for r in t.rows for c in r.cells]))", path], { timeout: 10_000 });
  return JSON.parse(result.stdout);
}

export function nativeActionIndex(state: string, role: string, name: string): number {
  const matches = state.split("\n").flatMap(line => {
    const match = line.match(/^\s*- \[(\d+)\] (\S+) ("(?:[^"\\]|\\.)*")/);
    return match && match[2] === role && JSON.parse(match[3]!) === name ? [Number(match[1])] : [];
  });
  if (matches.length !== 1) throw new Error(`Expected one observed ${role} named ${name}; found ${matches.length}`);
  return matches[0]!;
}

/** Real LibreOffice/public SDK fixture. The lifecycle observer is unavailable
 * to tests and agents; it checks readiness, retains diagnostics, and cleans up. */
export const test = base.extend<{ app: CuaApp; sdk: OpenSky; savedDocument: SavedDocument; savePrompt: CuaApp }>({
  sdk: async ({ app }, use) => { await use(contexts.get(app)!.sdk); },
  savedDocument: async ({ app }, use) => {
    const context = contexts.get(app)!;
    const expectedText = await documentText(source);
    expectedText[0] = marker + expectedText[0];
    await use({ expectedText, originalHandle: context.originalHandle, readText: () => documentText(context.document) });
  },
  savePrompt: async ({ app }, use) => {
    await app.typeText(marker);
    await app.pressKey("super+s");
    await expect.poll(() => app.getAXState({ emit: false, disableDiffing: true })).toContain("Use Word 2010–365 Document Format");
    await use(app);
  },
  app: async ({}, use) => {
    if (process.env.OPENSKY_REAL_DRIVER !== "1" || process.platform !== "darwin") {
      throw new Error("This regression requires an authorized macOS desktop and OPENSKY_REAL_DRIVER=1");
    }
    const appPath = process.env.OPENSKY_EVAL_LIBREOFFICE;
    const binaryPath = process.env.OPENSKY_DRIVER_BINARY;
    if (!appPath || !binaryPath) throw new Error("Set OPENSKY_EVAL_LIBREOFFICE and OPENSKY_DRIVER_BINARY; no auto-install");
    const artifactRoot = resolve(process.env.OPENSKY_E2E_ARTIFACT_DIR ?? join(repo, "evals/runs"));
    await mkdir(artifactRoot, { recursive: true });
    const artifacts = await mkdtemp(join(artifactRoot, "libreoffice-dialog-"));
    const temporary = await mkdtemp(join(tmpdir(), "opensky-lo-regression-"));
    const document = join(temporary, "save-dialog.docx");
    await copyFile(source, document);
    try {
      await withOwnedMacApp({
        appPath, bundleId: "org.libreoffice.script", artifacts, disposableProfile: true,
        launchEnvironment: { PYTHONDONTWRITEBYTECODE: "1" },
        launchArguments: [`-env:UserInstallation=${pathToFileURL(join(temporary, "profile")).href}`, "--norestore", "--nologo", "--writer", document],
      }, async owned => {
        const deadline = Date.now() + 30_000;
        let ready = false;
        do {
          const state = await owned.inspect();
          ready = state.finishedLaunching && state.windows.some(window => window.onScreen && window.title.includes("save-dialog.docx"));
          if (!ready) await delay(250);
        } while (!ready && Date.now() < deadline);
        if (!ready) throw new Error("LibreOffice fixture failed readiness; test not started");
        const sdk = createOpenSky({ homeDir: join(artifacts, "sdk"), driverOptions: { binaryPath, autoInstall: false, autoStart: false } });
        try {
          const initial = await sdk.get_app_state({ app: "org.libreoffice.script", includeScreenshot: false });
          const app = await createCua(sdk).getApp("org.libreoffice.script");
          contexts.set(app, { sdk, document, originalHandle: initial.targetHandle });
          try { await use(app); }
          finally {
            // Post-test diagnostics cannot supply indices or observations to
            // the test. Independent AX makes an omitted dialog distinguishable
            // from a save action that never opened one.
            await writeFile(join(artifacts, "external-final.json"), JSON.stringify(await owned.inspect({ accessibility: true }), null, 2));
            await writeFile(join(artifacts, "driver-windows-final.json"), JSON.stringify(await sdk.invoke("list_windows", { pid: owned.pid }), null, 2));
            await writeFile(join(artifacts, "sdk-final.txt"), await app.getAXState({ emit: false, disableDiffing: true }));
          }
        } finally { await sdk.close(); }
      });
    } finally {
      const cleanup = await readFile(join(artifacts, "cleanup.json"), "utf8").then(JSON.parse).catch(() => null);
      if (cleanup?.status === "passed") await rm(temporary, { recursive: true, force: true });
      else console.error(`Cleanup not verified; retained ${temporary}`);
      console.info(`LibreOffice regression evidence: ${artifacts}`);
    }
  },
});
