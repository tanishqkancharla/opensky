import { test as base, expect } from "vitest";
import { spawn, execFile } from "node:child_process";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { appendFile, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { evaluationEnvironment } from "../../evals/parity/codex.js";
import { assertDisposableLinuxDesktop, withOwnedLinuxApp } from "../../evals/parity/linux-app.js";

const exec = promisify(execFile);
const paragraphs = ["First paragraph must stay unchanged.", "H2O—Soak up the Science.", "Last paragraph must stay unchanged."];
type NativeSky = {
  press_key(args: { key: string }): Promise<void>;
  type_text(args: { text: string }): Promise<void>;
  get_screenshot(): Promise<void>;
};
type Fixture = { sky: NativeSky; document: { readText(): Promise<string> } };
type Result = { isError?: boolean; content?: { type: string; text?: string; data?: string; mimeType?: string }[];
  structuredContent?: { cellStatus?: string; cell_id?: string; cellId?: string } | null };

async function createDocument(path: string): Promise<void> {
  await exec(process.env.OPENSKY_EVAL_PYTHON ?? "python3", ["-c", `
import sys,zipfile,xml.sax.saxutils as X
with zipfile.ZipFile(sys.argv[1], 'x') as z:
 z.writestr('mimetype','application/vnd.oasis.opendocument.text',compress_type=zipfile.ZIP_STORED)
 z.writestr('META-INF/manifest.xml','<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>')
 z.writestr('content.xml','<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2"><office:body><office:text><text:p>'+'</text:p><text:p>'.join(X.escape(p) for p in sys.argv[2].split('\\n'))+'</text:p></office:text></office:body></office:document-content>')
`, path, paragraphs.join("\n")]);
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

async function withNativeSky(artifacts: string, use: (sky: NativeSky) => Promise<void>): Promise<void> {
  const config = JSON.parse(await readFile(join(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "native-repl-config.json"), "utf8")) as {
    command: string; args: string[]; env: Record<string, string>;
  };
  const child = spawn(config.command, config.args, {
    env: { ...evaluationEnvironment(), ...config.env }, detached: true, stdio: ["pipe", "pipe", "pipe"],
  });
  const closed = new Promise<void>(done => child.once("close", () => done()));
  let stderr = "", sequence = 0, images = 0, poisoned = false;
  let exitCode: number | null = null, exitSignal: string | null = null;
  const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void }>();
  const fail = (error: Error) => { poisoned = true; for (const entry of pending.values()) entry.reject(error); pending.clear(); };
  child.stderr.on("data", bytes => { stderr += bytes; });
  child.stdin.on("error", fail);
  child.on("error", fail);
  child.on("exit", (code, signal) => { exitCode = code; exitSignal = signal; fail(new Error(`Native REPL exited (${code ?? signal})`)); });
  createInterface({ input: child.stdout }).on("line", line => {
    try {
      const message = JSON.parse(line);
      if (message.method) {
        if (message.id !== undefined) child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: message.id,
          error: { code: -32601, message: "Unexpected server request in deterministic native control" } }) + "\n");
        return;
      }
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request?.reject(new Error(JSON.stringify(message.error)));
      else request?.resolve(message.result);
    } catch (error) { fail(new Error(String(error))); }
  });
  const request = async (method: string, params: unknown): Promise<any> => {
    if (poisoned) throw new Error("Native transport no longer usable; input is not replayed");
    const id = ++sequence, startedAt = Date.now();
    await appendFile(join(artifacts, "native-rpc.jsonl"), JSON.stringify({ event: "request", id, method, params }) + "\n");
    try {
      const result = await new Promise<any>((done, reject) => {
        const timer = setTimeout(() => { pending.delete(id); poisoned = true; reject(new Error(`Native RPC ${id} unresolved after 45 seconds; no replay`)); }, 45_000);
        pending.set(id, { resolve: value => { clearTimeout(timer); done(value); }, reject: error => { clearTimeout(timer); reject(error); } });
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n", error => { if (error) fail(error); });
      });
      await appendFile(join(artifacts, "native-rpc.jsonl"), JSON.stringify({ event: "response", id, elapsedMs: Date.now() - startedAt, result }) + "\n");
      return result;
    } catch (error) {
      poisoned = true;
      await appendFile(join(artifacts, "native-rpc.jsonl"), JSON.stringify({ event: "error", id, elapsedMs: Date.now() - startedAt, error: String(error) }) + "\n");
      throw error;
    }
  };
  const cell = async (code: string): Promise<Result> => {
    const result = await request("tools/call", { name: "js", arguments: { code, title: "Native Writer keyboard control" } }) as Result;
    const text = (result.content ?? []).filter(part => part.type === "text").map(part => part.text ?? "").join("\n");
    const metadata = result.structuredContent;
    const unresolvedHandle = (metadata?.cell_id || metadata?.cellId) && metadata?.cellStatus !== "completed";
    if (result.isError || unresolvedHandle ||
        (metadata?.cellStatus && metadata.cellStatus !== "completed") ||
        /Script running with cell ID|cell[^\n]*(?:running|in_progress)/i.test(text)) {
      poisoned = true;
      throw new Error(`Native cell failed or remains unresolved; no input replay: ${text}`);
    }
    return result;
  };
  const sky: NativeSky = {
    async press_key(args) { await cell(`await sky.press_key(${JSON.stringify(args)});`); },
    async type_text(args) { await cell(`await sky.type_text(${JSON.stringify(args)});`); },
    async get_screenshot() {
      const result = await cell('var images = await sky.get_screenshot(); await nodeRepl.emitImage(images[0].data_url);');
      const image = result.content?.find(part => part.type === "image" && part.data);
      if (!image?.data) throw new Error("Native screenshot did not return image bytes");
      await writeFile(join(artifacts, `native-${String(++images).padStart(3, "0")}.${image.mimeType === "image/png" ? "png" : "jpg"}`), Buffer.from(image.data, "base64"));
    },
  };
  let actionError: unknown, cleanupError: unknown;
  const alive = () => { if (!child.pid) return false; try { process.kill(-child.pid, 0); return true; } catch { return false; } };
  try {
    await request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "native-selection-arrow-control", version: "1" } });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    const tools = await request("tools/list", {});
    if (!tools.tools?.some((tool: { name: string }) => tool.name === "js")) throw new Error("Native transport has no js tool");
    await cell('globalThis.sky = (await import("@oai/sky")).sky;');
    await use(sky);
  } catch (error) { actionError = error; }
  finally {
    child.stdin.end();
    await Promise.race([closed, delay(2_000)]);
    try {
      if (alive()) process.kill(-child.pid!, "SIGTERM");
      for (let i = 0; i < 20 && alive(); i++) await delay(100);
      if (alive()) process.kill(-child.pid!, "SIGKILL");
      for (let i = 0; i < 20 && alive(); i++) await delay(100);
      if (alive()) throw new Error("Owned native process group remained alive");
    } catch (error) { cleanupError = error; }
    fail(new Error("Native control ended"));
    await writeFile(join(artifacts, "native-stderr.log"), stderr);
    await writeFile(join(artifacts, "native-cleanup.json"), JSON.stringify({
      group: child.pid, verifiedExited: !alive(), exitCode, exitSignal,
      actionError: actionError ? String(actionError) : null, cleanupError: cleanupError ? String(cleanupError) : null,
      inputReplayed: false,
    }, null, 2));
  }
  if (actionError && cleanupError) throw new AggregateError([actionError, cleanupError], "Native action and cleanup failed");
  if (actionError) throw actionError;
  if (cleanupError) throw cleanupError;
}

export const test = base.extend<Fixture & { owned: Fixture }>({
  owned: async ({ task }, use) => {
    assertDisposableLinuxDesktop();
    if (process.env.GITHUB_ACTIONS !== "true") throw new Error("This native control requires the pinned CI native package");
    for (const key of ["OPENAI_API_KEY", "OPENSKY_REMOTE_RESERVATION", "OPENSKY_RESERVATION_ENVELOPE", "PARITY_DISPATCH_POLICY", "PARITY_DISPATCH_RECEIPT"]) {
      if (process.env[key]) throw new Error(`No-model control cannot inherit ${key}`);
    }
    const parent = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "native-selection-arrows");
    await mkdir(parent, { recursive: true });
    const artifacts = join(parent, task.name.split(":")[0]);
    await mkdir(artifacts); // Refuse to replace evidence from an earlier attempt.
    const temporary = await mkdtemp(join(tmpdir(), "native-selection-arrows-"));
    const document = join(temporary, "selection-arrows.odt");
    let appAttempted = false;
    try {
      await createDocument(document);
      expect(await documentText(document)).toBe(paragraphs.join("\n"));
      appAttempted = true;
      await withOwnedLinuxApp({ executable: "/usr/bin/libreoffice", documentTitle: "selection-arrows.odt", artifacts,
        args: [`-env:UserInstallation=${pathToFileURL(join(temporary, "profile")).href}`, "--norestore", "--nologo", "--nofirststartwizard", "--writer", document],
        env: { SAL_USE_VCLPLUGIN: "gtk3", NO_AT_BRIDGE: "0" },
      }, async () => {
        try {
          await withNativeSky(artifacts, async sky => {
            try {
              await sky.get_screenshot();
              await use({ sky, document: { readText: () => documentText(document) } });
            } finally {
              try { await sky.get_screenshot(); }
              catch (error) { await writeFile(join(artifacts, "screenshot-error.txt"), String(error)); }
            }
          });
        } finally {
          await copyFile(document, join(artifacts, "selection-arrows.odt"));
          const saved = await documentText(document);
          const expectedDigit = paragraphs.join("\n").replace("H2O", "HMARKO");
          const expectedO = paragraphs.join("\n").replace("H2O", "H2MARK");
          await writeFile(join(artifacts, "saved-selection-diagnostic.json"), JSON.stringify({
            saved, expectedDigit, expectedO,
            replacement: saved === expectedDigit ? "digit-2" : saved === expectedO ? "letter-O" : "other-or-unsaved",
            note: "Native screenshot/keyboard control with no model. Retain a failed digit assertion when Writer selects O; do not infer a driver defect from this result alone.",
          }, null, 2));
        }
      });
    } finally {
      const cleanup = await readFile(join(artifacts, "cleanup.json"), "utf8").then(JSON.parse).catch(() => null);
      const removed = !appAttempted || cleanup?.verifiedExited === true;
      if (removed) await rm(temporary, { recursive: true, force: true });
      await writeFile(join(artifacts, "temporary-cleanup.json"), JSON.stringify({ removed }));
    }
  },
  sky: async ({ owned }, use) => use(owned.sky),
  document: async ({ owned }, use) => use(owned.document),
});
