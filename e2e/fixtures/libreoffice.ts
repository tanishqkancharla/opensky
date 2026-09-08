import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { test as base } from "vitest";
import { createOpenSky, createCua, type CuaApp } from "opensky-cua";
import { withOwnedMacApp } from "../../evals/parity/mac-app.js";

const repo = fileURLToPath(new URL("../../", import.meta.url));

/** Real LibreOffice/public SDK fixture. The lifecycle observer is unavailable
 * to tests and agents; it checks readiness, retains diagnostics, and cleans up. */
export const test = base.extend<{ app: CuaApp }>({
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
    await copyFile(join(repo, "evals/parity/osworld/3ef2b351-8a84-4ff2-8724-d86eae9b842e/Constitution_Template_With_Guidelines.docx"), document);
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
          const app = await createCua(sdk).getApp("org.libreoffice.script");
          try { await use(app); }
          finally {
            // Post-test diagnostics cannot supply indices or observations to
            // the test. Independent AX makes an omitted dialog distinguishable
            // from a save action that never opened one.
            await writeFile(join(artifacts, "external-final.json"), JSON.stringify(await owned.inspect({ accessibility: true }), null, 2));
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
