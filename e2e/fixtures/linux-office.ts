import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { expect, test as base } from "vitest";
import { createOpenSky, createCua } from "opensky-cua";

const exec = promisify(execFile);
const taskId = "3ef2b351-8a84-4ff2-8724-d86eae9b842e";
type Desktop = { pressKey(key: string): Promise<void>; observe(): Promise<string> };
type Document = { grade(): Promise<{ taskSuccess: boolean; completeDocumentTextMatches: boolean }> };

// A thin test-driver adapter exposes the same keyboard/observation events on
// each public API. It performs no document edits, save recovery or grading.
export const test = base.extend<{ desktop: Desktop; document: Document; fixture: { desktop: Desktop; document: Document } }>({
  fixture: async ({}, use) => {
    if (process.platform !== "linux" || process.env.GITHUB_ACTIONS !== "true") {
      throw new Error("Linux office fixtures require a disposable GitHub desktop; no app was launched.");
    }
    const backend = process.env.OPENSKY_LINUX_OFFICE_BACKEND;
    if (backend !== "native" && backend !== "opensky") throw new Error("Select native or opensky");
    const artifacts = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!);
    await mkdir(artifacts, { recursive: true });
    const root = resolve("../evals/parity/osworld");
    const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
    const task = manifest.tasks.find((task: { id: string }) => task.id === taskId);
    const source = join(root, taskId, task.inputFile);
    const bytes = await readFile(source);
    if (createHash("sha256").update(bytes).digest("hex") !== task.assets[0].sha256) throw new Error("Input asset changed");
    const temporary = await mkdtemp(join(tmpdir(), "opensky-linux-office-"));
    const document = join(temporary, task.inputFile);
    await copyFile(source, document);
    const child = spawn("/usr/bin/libreoffice", [
      `-env:UserInstallation=${pathToFileURL(join(temporary, "profile")).href}`,
      "--norestore", "--nologo", "--nofirststartwizard", "--writer", document,
    ], { detached: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, SAL_USE_VCLPLUGIN: "gtk3", NO_AT_BRIDGE: "0" } });
    let log = "";
    child.stdout.on("data", bytes => { log += bytes; });
    child.stderr.on("data", bytes => { log += bytes; });
    let launchError: Error | undefined;
    child.on("error", error => { launchError = error; });
    const group = child.pid;
    let sdk: ReturnType<typeof createOpenSky> | undefined;
    let sequence = 0;
    const actions: string[] = [];
    try {
      if (!group) throw new Error("LibreOffice launch produced no process");
      let window: string | undefined;
      for (let attempt = 0; attempt < 120; attempt++) {
        if (launchError) throw launchError;
        const found = await exec("xdotool", ["search", "--onlyvisible", "--name", task.inputFile]).catch(() => null);
        for (const candidate of found?.stdout.trim().split("\n").filter(Boolean) ?? []) {
          const pid = (await exec("xdotool", ["getwindowpid", candidate])).stdout.trim();
          const stat = await readFile(`/proc/${pid}/stat`, "utf8");
          if (Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[2]) === group) window = candidate;
        }
        if (window) break;
        await delay(250);
      }
      if (!window) throw new Error("Owned LibreOffice document did not become visible");
      await exec("xdotool", ["windowactivate", "--sync", window]);
      await writeFile(join(artifacts, "setup.json"), JSON.stringify({ backend, group, window, taskId, sourceSha256: task.assets[0].sha256 }));
      // Preserve the actual desktop identity before app binding can fail. These
      // diagnostics never select an app, change an outcome or repair a result.
      const windowPid = (await exec("xdotool", ["getwindowpid", window])).stdout.trim();
      await writeFile(join(artifacts, "window-identity.json"), JSON.stringify({
        pid: Number(windowPid),
        properties: (await exec("xprop", ["-id", window, "WM_CLASS", "_NET_WM_PID", "_GTK_APPLICATION_ID"])).stdout,
        command: (await readFile(`/proc/${windowPid}/cmdline`, "utf8")).replaceAll("\0", " "),
        desktopEntries: (await exec("sh", ["-c", "cat /usr/share/applications/libreoffice*.desktop"])).stdout,
      }));
      let pressKey: Desktop["pressKey"];
      let screenshot: () => Promise<Uint8Array>;
      if (backend === "native") {
        const packageRoot = process.env.OPENSKY_NATIVE_PROBE_PACKAGE!;
        const metadata = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
        const { sky } = await import(pathToFileURL(join(packageRoot, metadata.main)).href);
        if (sky.target !== "linux") throw new Error("Native backend is not Linux");
        pressKey = key => sky.press_key({ key });
        screenshot = async () => (await sky.get_screenshot())[0].bytes;
      } else {
        sdk = createOpenSky({ homeDir: join(temporary, "sdk"), autoLaunch: false,
          driverOptions: { binaryPath: process.env.OPENSKY_DRIVER_BINARY, socket: process.env.OPENSKY_DRIVER_SOCKET, autoInstall: false, autoStart: false } });
        await writeFile(join(artifacts, "apps.json"), JSON.stringify(await sdk.list_apps(), null, 2));
        const app = await createCua(sdk).getApp("LibreOffice");
        pressKey = key => app.pressKey(key);
        screenshot = () => app.getScreenshot({ emit: false });
      }
      const desktop: Desktop = {
        async pressKey(key) { actions.push(key); await pressKey(key); },
        async observe() {
          const path = join(artifacts, `observation-${++sequence}.${backend === "native" ? "jpg" : "png"}`);
          await writeFile(path, await screenshot());
          // Assertions read the same pixels a human or screenshot agent sees.
          // OCR does not inspect the document file or issue any desktop input.
          const text = (await exec("tesseract", [path, "stdout", "--psm", "11"], { timeout: 10_000 })).stdout;
          await writeFile(`${path}.txt`, text);
          return text;
        },
      };
      await expect.poll(() => desktop.observe(), { timeout: 20_000, interval: 250 }).toMatch(/File\s+Edit\s+View\s+Insert/);
      await use({ desktop, document: { async grade() {
        return JSON.parse((await exec(process.env.OPENSKY_EVAL_PYTHON ?? "python3", [join(root, "score.py"), taskId, document], { timeout: 30_000 })).stdout);
      } } });
    } finally {
      try {
        await copyFile(document, join(artifacts, task.inputFile)).catch(() => undefined);
        await writeFile(join(artifacts, "actions.json"), JSON.stringify(actions));
        await writeFile(join(artifacts, "libreoffice.log"), log);
      } finally {
        try { await sdk?.close(); } finally {
          // Only the fresh process group created above; never a machine-wide pkill.
          const alive = () => { if (!group) return false; try { process.kill(-group, 0); return true; } catch { return false; } };
          if (alive()) process.kill(-group!, "SIGTERM");
          for (let i = 0; i < 40 && alive(); i++) await delay(100);
          if (alive()) process.kill(-group!, "SIGKILL");
          for (let i = 0; i < 20 && alive(); i++) await delay(100);
          const exited = !alive();
          if (exited) await rm(temporary, { recursive: true, force: true });
          await writeFile(join(artifacts, "cleanup.json"), JSON.stringify({ group, exited, temporaryRemoved: exited }));
          if (!exited) throw new Error("Owned LibreOffice process group cleanup not verified");
        }
      }
    }
  },
  desktop: async ({ fixture }, use) => use(fixture.desktop),
  document: async ({ fixture }, use) => use(fixture.document),
});
