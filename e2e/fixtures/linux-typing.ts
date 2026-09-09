import { test as base, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createOpenSky, createCua } from "../../src/index.js";
import type { App } from "../../src/cua.js";
import { recordAppTiming } from "./app-timing.js";
import { assertDisposableLinuxDesktop, withOwnedLinuxApp } from "../../evals/parity/linux-app.js";
const exec = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));

type Fixture = { app: App; document: { readText(): Promise<string> }; keyboard: { unchanged(): Promise<boolean> } };
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
      }, async () => {
        sdk = createOpenSky({ transport, homeDir: join(temporary, "sdk"), autoLaunch: false,
          driverOptions: { binaryPath: process.env.OPENSKY_DRIVER_BINARY, socket: process.env.OPENSKY_DRIVER_SOCKET, autoStart: false, autoInstall: false } });
        const app = recordAppTiming(await createCua(sdk).getApp("LibreOffice"), artifacts);
        try {
          await expect.poll(async () => {
            const image = join(artifacts, "ready.png");
            await writeFile(image, await app.getScreenshot());
            const text = (await exec("tesseract", [image, "stdout", "--psm", "11"], { timeout: 10_000 })).stdout;
            await writeFile(join(artifacts, "ready.txt"), text);
            return text;
          }, { timeout: 20_000 }).toMatch(/File\s+Edit\s+View\s+Insert/);
          await use({ app, document: { async readText() {
            return (await exec(process.env.OPENSKY_EVAL_PYTHON ?? "python3", ["-c",
              'import sys,zipfile,xml.etree.ElementTree as E; z=zipfile.ZipFile(sys.argv[1]); r=E.fromstring(z.read("word/document.xml")); n={"w":"http://schemas.openxmlformats.org/wordprocessingml/2006/main"}; print("\\n".join("".join(p.itertext()) for p in r.findall(".//w:body/w:p",n)),end="")', document])).stdout;
          } }, keyboard: { async unchanged() {
            const current = (await exec("xmodmap", ["-pke"])).stdout;
            await writeFile(join(artifacts, "keyboard-before.txt"), originalKeyboard);
            await writeFile(join(artifacts, "keyboard-after.txt"), current);
            return current === originalKeyboard;
          } } });
        } finally {
          await writeFile(join(artifacts, "keyboard-after.txt"), (await exec("xmodmap", ["-pke"])).stdout);
          await writeFile(join(artifacts, "final.png"), await app.getScreenshot()).catch(() => undefined);
          await copyFile(document, join(artifacts, "typing.docx"));
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
