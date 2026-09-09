import { test as base, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createOpenSky, createCua } from "../../src/index.js";
import type { App } from "../../src/cua.js";
import { assertDisposableLinuxDesktop, withOwnedLinuxApp } from "../../evals/parity/linux-app.js";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
type Input = { taskId: string; file: string; mode: "--calc" | "--impress" | "--code" };

export function desktopSetupTest(input: Input) {
  return base.extend<{ app: App }>({
    app: async ({ task }, use) => {
      assertDisposableLinuxDesktop();
      const artifacts = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "setup", task.name.split(":")[0]);
      await mkdir(artifacts, { recursive: true });
      const temporary = await mkdtemp(join(tmpdir(), "opensky-desktop-setup-"));
      const document = join(temporary, input.file);
      let sdk: ReturnType<typeof createOpenSky> | undefined;
      let launchAttempted = false;
      try {
        await copyFile(join(root, "evals/parity/osworld", input.taskId, input.file), document);
        const profile = join(temporary, "profile");
        const isCode = input.mode === "--code";
        if (isCode) {
          await mkdir(join(profile, "User"), { recursive: true });
          await writeFile(join(profile, "User/settings.json"), JSON.stringify({
            "update.mode": "none", "telemetry.telemetryLevel": "off", "workbench.startupEditor": "none", "editor.accessibilitySupport": "on",
          }));
        }
        launchAttempted = true;
        await withOwnedLinuxApp({ executable: isCode ? "/usr/share/code/code" : "/usr/bin/libreoffice", documentTitle: input.file, artifacts,
          args: isCode ? ["--user-data-dir", profile, "--extensions-dir", join(temporary, "extensions"), "--disable-extensions", "--skip-welcome", "--skip-release-notes", "--new-window", "--force-renderer-accessibility",
            ...(process.getuid?.() === 0 ? ["--no-sandbox"] : []), document]
            : [`-env:UserInstallation=${pathToFileURL(profile).href}`, "--norestore", "--nologo", "--nofirststartwizard", input.mode, document],
          env: { SAL_USE_VCLPLUGIN: "gtk3", NO_AT_BRIDGE: "0" },
        }, async () => {
          sdk = createOpenSky({ homeDir: join(temporary, "sdk"), autoLaunch: false,
            driverOptions: { binaryPath: process.env.OPENSKY_DRIVER_BINARY, socket: process.env.OPENSKY_DRIVER_SOCKET, autoStart: false, autoInstall: false } });
          const app = await createCua(sdk).getApp(isCode ? "Visual Studio Code" : "LibreOffice");
          try {
            await expect.poll(async () => {
              const image = join(artifacts, "ready.png");
              await writeFile(image, await app.getScreenshot());
              const text = (await exec("tesseract", [image, "stdout", "--psm", "11"], { timeout: 10_000 })).stdout;
              await writeFile(join(artifacts, "ready.txt"), text);
              return text.match(/\b(?:File|Edit|Selection|View|Insert)\b/g) ?? [];
            }, { timeout: 20_000 }).toEqual(expect.arrayContaining(isCode ? ["File", "Edit", "Selection", "View"] : ["File", "Edit", "View", "Insert"]));
            await use(app);
          } finally {
            await writeFile(join(artifacts, "final-state.txt"), await app.getAXState({ disableDiffing: true })).catch(() => undefined);
            await writeFile(join(artifacts, "final.png"), await app.getScreenshot()).catch(() => undefined);
            await copyFile(document, join(artifacts, input.file));
          }
        });
      } finally {
        await sdk?.close();
        const cleanup = await readFile(join(artifacts, "cleanup.json"), "utf8").then(JSON.parse).catch(() => null);
        if (!launchAttempted || cleanup?.verifiedExited) await rm(temporary, { recursive: true, force: true });
      }
    },
  });
}
