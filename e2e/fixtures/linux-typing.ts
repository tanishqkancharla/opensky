import { test as base, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createOpenSky, createCua } from "../../src/index.js";
import type { App } from "../../src/cua.js";
import { withNativeLinuxRepl, type NativeLinuxReplConfig } from "../../evals/parity/native-linux-repl.js";
import { recordAppTiming } from "./app-timing.js";
import { assertDisposableLinuxDesktop, withOwnedLinuxApp } from "../../evals/parity/linux-app.js";
import { withX11InputRecord } from "./x11-input-record.js";
import { withTextEvents } from "./text-events.js";
import { withAppStall } from "./app-stall.js";
const exec = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));

type TypingApp = Pick<App, "pressKey" | "typeText" | "click" | "getAXState" | "getScreenshot" | "getAXStateAndScreenshot">;
type Fixture = { app: TypingApp; document: { readText(): Promise<string> }; keyboard: { unchanged(): Promise<boolean> } };
export const test = base.extend<Fixture & { fixture: Fixture }>({
  fixture: async ({ task }, use) => {
    assertDisposableLinuxDesktop();
    const transport = process.env.OPENSKY_TEST_TRANSPORT;
    if (transport !== undefined && transport !== "cli" && transport !== "mcp") throw new Error("Invalid OPENSKY_TEST_TRANSPORT");
    const artifacts = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "typing", task.name.split(":")[0]);
    await mkdir(artifacts, { recursive: true });
    const originalKeyboard = (await exec("xmodmap", ["-pke"])).stdout;
    await writeFile(join(artifacts, "keyboard-before.txt"), originalKeyboard);
    const temporary = await mkdtemp(join(tmpdir(), "opensky-typing-"));
    const document = join(temporary, "typing.docx");
    await copyFile(join(root, "evals/parity/osworld/0e763496-b6bb-4508-a427-fad0b6c3e195/Dublin_Zoo_Intro.docx"), document);
    let sdk: ReturnType<typeof createOpenSky> | undefined;
    try {
      await withOwnedLinuxApp({ executable: "/usr/bin/libreoffice", documentTitle: "typing.docx", artifacts,
        args: [`-env:UserInstallation=${pathToFileURL(join(temporary, "profile")).href}`, "--norestore", "--nologo", "--nofirststartwizard", "--writer", document],
        env: { SAL_USE_VCLPLUGIN: "gtk3", NO_AT_BRIDGE: "0" },
      }, async (owned) => {
        const driveApp = async (app: TypingApp) => {
          try {
            await expect.poll(async () => {
              const image = join(artifacts, "ready.png");
              await writeFile(image, await app.getScreenshot());
              const text = (await exec("tesseract", [image, "stdout", "--psm", "11"], { timeout: 10_000 })).stdout;
              await writeFile(join(artifacts, "ready.txt"), text);
              return text;
            }, { timeout: 20_000 }).toMatch(/File\s+Edit\s+View\s+Insert/);
            const drive = async () => use({ app, document: { async readText() {
              return (await exec(process.env.OPENSKY_EVAL_PYTHON ?? "python3", ["-c",
                'import sys,zipfile,xml.etree.ElementTree as E; z=zipfile.ZipFile(sys.argv[1]); r=E.fromstring(z.read("word/document.xml")); n={"w":"http://schemas.openxmlformats.org/wordprocessingml/2006/main"}; print("\\n".join("".join(p.itertext()) for p in r.findall(".//w:body/w:p",n)),end="")', document])).stdout;
            } }, keyboard: { async unchanged() {
              const current = (await exec("xmodmap", ["-pke"])).stdout;
              await writeFile(join(artifacts, "keyboard-before.txt"), originalKeyboard);
              await writeFile(join(artifacts, "keyboard-after.txt"), current);
              return current === originalKeyboard;
            } } });
            const observedDrive = async () => {
              if (task.name.startsWith("TYPE-L03:")) {
                // TYPE-L03 always starts the active X RECORD control. Passive
                // keyboard/text observers remain optional diagnostics for L01.
                await withAppStall(join(artifacts, "app-stall"), owned.pid, drive);
              } else if (process.env.OPENSKY_ATSPI_TEXT_RECORD === "1" && task.name.startsWith("TYPE-L01:")) {
                await withTextEvents(join(artifacts, "text-events"), owned.pid, drive);
              } else {
                await drive();
              }
            };
            if (process.env.OPENSKY_X11_INPUT_RECORD === "1" && task.name.startsWith("TYPE-L01:")) {
              await withX11InputRecord(join(artifacts, "x11-input"), observedDrive);
            } else {
              await observedDrive();
            }
          } finally {
            await writeFile(join(artifacts, "keyboard-after.txt"), (await exec("xmodmap", ["-pke"])).stdout);
            await writeFile(join(artifacts, "final.png"), await app.getScreenshot()).catch(() => undefined);
            await copyFile(document, join(artifacts, "typing.docx"));
          }
        };
        if (process.env.OPENSKY_LINUX_TYPING_NATIVE_FACADE === "1") {
          // Exact independently owned window; use the package's public facade
          // through its original REPL, without the legacy sky-only agent guard.
          const config: NativeLinuxReplConfig = JSON.parse(await readFile(join(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "native-repl-config.json"), "utf8"));
          config.env.CUA_REPL_ENABLED_SURFACES = "computer";
          config.env.NODE_REPL_UNTRUSTED_ENV_ALLOWLIST = "CUA_REPL_ENABLED_SURFACES";
          await withNativeLinuxRepl(config, artifacts, async cell => {
            await cell('await import("@oai/cua/tinyskyAlt");');
            await cell(`var app = await cua.getApp({windowId: ${Number(owned.window)}});`);
            const call = (method: string, args: unknown[]) => cell(`await app.${method}(...${JSON.stringify(args)});`);
            const image = (result: Awaited<ReturnType<typeof cell>>) => {
              const item = result.content?.find(item => item.type === "image");
              if (!item?.data) throw new Error("Native screenshot returned no image");
              return Buffer.from(item.data, "base64");
            };
            const state = async (options: unknown) => {
              const result = await cell(`nodeRepl.write({nativeState: await app.getAXState(${JSON.stringify(options ?? {})})});`);
              for (const item of result.content ?? []) {
                if (item.type !== "text" || !item.text) continue;
                try { const value = JSON.parse(item.text); if (typeof value.nativeState === "string") return value.nativeState; } catch {}
              }
              throw new Error("Native AX observation returned no serialized state");
            };
            await driveApp({
              pressKey: async key => { await call("pressKey", [key]); },
              typeText: async text => { await call("typeText", [text]); },
              click: async (target, options) => { await call("click", options ? [target, options] : [target]); },
              getAXState: state,
              getScreenshot: async () => image(await call("getScreenshot", [])),
              getAXStateAndScreenshot: async () => { throw new Error("Combined native observation is outside this focused control"); },
            });
          });
        } else {
          sdk = createOpenSky({ transport, homeDir: join(temporary, "sdk"), autoLaunch: false,
            driverOptions: { binaryPath: process.env.OPENSKY_DRIVER_BINARY, socket: process.env.OPENSKY_DRIVER_SOCKET, autoStart: false, autoInstall: false } });
          const cua = createCua(sdk);
          const app = recordAppTiming(await cua.getApp("LibreOffice Writer").catch(async (error) => {
            // Keep the original failure. Passive inventory and the independently
            // owned process/window let a focused retry distinguish catalog lookup
            // from startup, permissions or stale window identity.
            const diagnostics = await Promise.allSettled([
              sdk!.driver.call("list_apps", {}),
              sdk!.driver.call("list_windows", { pid: owned.pid }),
              owned.inspect(),
            ]);
            await writeFile(join(artifacts, "binding-failure.json"), JSON.stringify({
              error: String(error), owned: { pid: owned.pid, window: owned.window, startTicks: owned.startTicks },
              diagnostics: diagnostics.map((result, index) => result.status === "fulfilled"
                ? { status: result.status, value: index < 2 ? (result.value as { structured: unknown }).structured : result.value }
                : { status: result.status, reason: String(result.reason) }),
            }, null, 2)).catch(() => undefined);
            throw error;
          }), artifacts);
          await driveApp(app);
        }
      });
    } finally {
      await sdk?.close();
      const cleanup = await readFile(join(artifacts, "cleanup.json"), "utf8").then(JSON.parse).catch(() => null);
      if (cleanup?.verifiedExited) await rm(temporary, { recursive: true, force: true });
    }
  },
  app: async ({ fixture }, use) => use(fixture.app),
  document: async ({ fixture }, use) => use(fixture.document),
  keyboard: async ({ fixture }, use) => use(fixture.keyboard),
});
