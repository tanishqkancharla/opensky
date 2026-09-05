/** Real-driver boundary regression: invalid API shapes must not reach the driver. */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CuaDriverClient } from "../src/driver.js";
import { detectTarget } from "../src/platform.js";
import { createCuaReplToolRuntime } from "./cua-repl-tool.js";
import { RecordingDriverClient } from "./driver-tape.js";

const output = process.argv[2] ? resolve(process.argv[2]) : await mkdtemp(join(tmpdir(), "opensky-argument-probe-"));
await mkdir(output, { recursive: true });
const real = new CuaDriverClient({ autoInstall: false, autoStart: false });
const status = await real.status();
if (!status.running) throw new Error(`Real driver unavailable: ${status.text}`);
const driver = new RecordingDriverClient(real, { probe: "browser-argument-validation", realDriver: true });
const runtime = createCuaReplToolRuntime(driver, detectTarget(), { homeDir: join(output, "runtime") });
const tool = runtime.tools[0]!;
const checks: unknown[] = [];
let error: unknown;
try {
  await driver.call("get_config", {});
  for (const code of [
    "await cua.getBrowser('chrome')",
    "await cua.getBrowser({browser: 'chrome'})",
    "await cua.createBrowserTab('chrome', 'https://example.com/', {visible: 'yes'})",
  ]) await rejectsWithoutDispatch(code);
  const selected = await tool.execute("select", { code: "const browser = await cua.getBrowser({id:'chrome'});" }, undefined, undefined, {} as never);
  assert.notEqual(selected.isError, true, JSON.stringify(selected.content));
  checks.push({ code: "cua.getBrowser({id:'chrome'})", result: selected });
  await rejectsWithoutDispatch("await browser.tabs.new('https://example.com/')");
  assert.equal(driver.tape.calls.some((call) => ["browser_prepare", "browser_navigate", "open_app"].includes(call.tool)), false);
} catch (caught) {
  error = caught;
} finally {
  try { await runtime.close(); } catch (caught) { error ??= caught; }
  await writeFile(join(output, "evidence.json"), `${JSON.stringify({
    passed: !error, realDriver: true, opensGuiTargets: false, status, checks,
    error: error instanceof Error ? error.message : error,
    tape: driver.tape,
  }, null, 2)}\n`, { flag: "wx" });
}
if (error) throw error;
console.log(`Real-driver browser argument checks passed: ${join(output, "evidence.json")}`);

async function rejectsWithoutDispatch(code: string) {
  const before = driver.tape.calls.length;
  const result = await tool.execute(`invalid-${checks.length}`, { code }, undefined, undefined, {} as never);
  assert.equal(result.isError, true, `Expected a structured error for ${code}`);
  assert.match(JSON.stringify(result.content), /Invalid params/);
  assert.equal(driver.tape.calls.length, before, `Invalid call reached the real driver: ${code}`);
  checks.push({ code, result, driverCallsAdded: driver.tape.calls.length - before });
}
