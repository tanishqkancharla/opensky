/** Real installed-driver integration on controlled generic pages, not a model/parity score. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCua, type Tab } from "../src/cua.js";
import { asRecord } from "../src/driver.js";
import { StdioMcpDriverClient } from "../src/mcp-driver.js";
import { createOpenSky } from "../src/opensky.js";
import { parseOperatorSessions, successfulEndSessionId } from "./acceptance/evidence.js";
import { RecordingDriverClient } from "./driver-tape.js";

// Cases describe generic structural relationships, not a website-specific extraction recipe.
const cases = [
  {
    name: "article section and earlier sibling",
    html: '<main><article aria-label="Reference"><h1>Reference</h1><p>Lead text.</p><section aria-label="Introduction"><h2>Introduction</h2><p>Earlier section.</p></section><section aria-label="Methods"><h2>Methods</h2><p>Context qualifier: preliminary.</p><button>Inspect methods</button></section></article></main>',
    query: "Inspect methods", anchorRole: "button", anchorName: "Inspect methods",
    nearby: "Context qualifier: preliminary.", outer: "Introduction",
  },
  {
    name: "list item qualifier and preceding item",
    html: '<main><ul aria-label="Entries"><li><span>Earlier entry</span><button>Inspect earlier</button></li><li><span>Context qualifier: archived.</span><button>Inspect current</button></li></ul></main>',
    query: "Inspect current", anchorRole: "button", anchorName: "Inspect current",
    nearby: "Context qualifier: archived.", outer: "Earlier entry",
  },
  {
    name: "table row qualifier and preceding row",
    html: '<main><table aria-label="Records"><tbody><tr><th>Earlier record</th><td>Ready</td></tr><tr><th>Current record</th><td>Context qualifier: provisional.</td><td><button>Inspect record</button></td></tr></tbody></table></main>',
    query: "Inspect record", anchorRole: "button", anchorName: "Inspect record",
    nearby: "Context qualifier: provisional.", outer: "Earlier record",
  },
] as const;

if (process.env.OPENSKY_REAL_DRIVER !== "1") throw new Error("Set OPENSKY_REAL_DRIVER=1 to authorize isolated test browser windows.");
const binary = process.env.CUA_DRIVER_BINARY;
const expectedSource = process.env.EVAL_EXPECTED_DRIVER_SHA;
if (!binary || !expectedSource || !/^[a-f0-9]{40}$/.test(expectedSource)) {
  throw new Error("An explicit CUA_DRIVER_BINARY and exact EVAL_EXPECTED_DRIVER_SHA are required; no install/start fallback.");
}
const output = await mkdtemp(join(tmpdir(), "opensky-context-probe-"));
const home = join(output, "runtime");
const session = `context-probe-${randomUUID()}`;
const revision = spawnSync("git", ["rev-parse", "HEAD"], { cwd: join(import.meta.dirname, ".."), encoding: "utf8" });
const status = spawnSync("git", ["status", "--porcelain"], { cwd: join(import.meta.dirname, ".."), encoding: "utf8" });
if (revision.status !== 0 || status.status !== 0) throw new Error("Cannot establish probe source provenance");
const openskySource = { revision: revision.stdout.trim(), dirty: status.stdout.length !== 0 };
await writeFile(join(output, "declaration.json"), JSON.stringify({
  classification: "real-driver-controlled-page-integration", modelEvaluation: false,
  startedAt: new Date().toISOString(), output, home, session, binary, expectedSource, openskySource,
  fixtures: cases.map((fixture) => ({ ...fixture, sha256: createHash("sha256").update(fixture.html).digest("hex") })),
  cleanup: "Exact probe-owned tabs and sessions only; retain runtime unless receipts, clean transport exit and empty operator inventory prove cleanup.",
}, null, 2) + "\n", { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ output, phase: "declared-before-driver-or-gui-work" }));
const client = new StdioMcpDriverClient({ binaryPath: binary, autoInstall: false, autoStart: false, timeoutMs: 20_000, session });
const driver = new RecordingDriverClient(client, { classification: "real-driver-controlled-page-integration", expectedSource });
const opensky = createOpenSky({ driver, session, homeDir: home, settleDelayMs: 0 });
const timeline: Array<Record<string, unknown>> = [];
const cua = createCua(opensky);
const server = createServer((request, response) => {
  const fixture = cases[Number(request.url?.slice(1))];
  response.writeHead(fixture ? 200 : 404, { "Content-Type": "text/html; charset=utf-8" });
  response.end(fixture ? `<!doctype html><title>OpenSky context probe</title><body>${fixture.html}</body>` : "Unknown fixture");
});
let failure: unknown;
let transport: Awaited<ReturnType<StdioMcpDriverClient["closeTransport"]>> | undefined;
let cleanupVerified = false;
let before: unknown;
let after: unknown;
const inventory = () => {
  const result = spawnSync(binary, ["sessions", "list", "--json"], { encoding: "utf8", timeout: 10_000 });
  if (result.status !== 0 || result.error) throw new Error("Operator session inventory unavailable");
  return parseOperatorSessions(result.stdout);
};
try {
  before = inventory();
  assert.deepEqual(before, [], "Require a quiescent helper before admitting the probe");
  const config = asRecord((await driver.call("get_config", { session })).structured);
  assert.equal(config?.source_sha, expectedSource);
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  for (const [index, fixture] of cases.entries()) {
    let tab: Tab | undefined;
    try {
      tab = await cua.createBrowserTab("chrome", `http://127.0.0.1:${address.port}/${index}`, { sessionName: `context-${index}` });
      const queried = await tab.getAXState({ query: fixture.query });
      timeline.push({ case: fixture.name, operation: "query", args: { query: fixture.query }, result: queried });
      const anchor = findIndex(queried, fixture.anchorRole, fixture.anchorName);
      const currentSnapshot = snapshotId();
      const callsBefore = driver.tape.calls.length;
      const nearby = await tab.getAXState({ context: anchor });
      timeline.push({ case: fixture.name, operation: "context", args: { context: anchor }, result: nearby });
      assert.equal(driver.tape.calls.length, callsBefore + 1, "Context makes exactly one driver call");
      assert.equal(snapshotId(), currentSnapshot, "Context must not collect a replacement snapshot");
      assert.ok(nearby.includes(fixture.nearby), "An unmatched sibling qualifier must survive");
      const outerIndex = Number(nearby.match(/enclosing group \[(\d+)\]/)?.[1]);
      assert.ok(Number.isSafeInteger(outerIndex), "A group must offer an outward structural anchor");
      const outer = await tab.getAXState({ context: outerIndex });
      timeline.push({ case: fixture.name, operation: "outer context", args: { context: outerIndex }, result: outer });
      assert.ok(outer.includes(fixture.outer), "The earlier sibling must be reachable through generic structure");
      assert.equal(snapshotId(), currentSnapshot);
      const beforeRefusal = driver.tape.calls.length;
      const activeTab = tab;
      await assert.rejects(() => activeTab.click(outerIndex), /does not support/);
      assert.equal(driver.tape.calls.length, beforeRefusal, "Read-only group cannot dispatch input");
      await tab.click(anchor); // Original same-snapshot action authority remains valid; fixture button has no external effect.
      await assert.rejects(() => activeTab.getAXState({ context: anchor }), /no intervening input/);
      timeline.push({ case: fixture.name, checksPassed: true });
    } finally { if (tab) await tab.close(); }
  }
} catch (error) { failure = error; }
finally {
  try { await opensky.close(); } catch (error) { failure ??= error; }
  try { transport = await client.closeTransport(); } catch (error) { failure ??= error; }
  try {
    after = inventory();
    const ended = driver.tape.calls.filter((call) => call.tool === "end_session");
    const prepared = driver.tape.calls.filter((call) => call.tool === "browser_prepare").map((call) => String(call.args.session));
    cleanupVerified = [session, ...prepared].every((owned) => ended.some((call) =>
      successfulEndSessionId(call) === owned)) && Array.isArray(after) && after.length === 0 &&
      transport !== undefined && transport.instanceId === client.sessionOwnership.instanceId && transport.verified &&
      transport.admissionClosed && transport.callsDrained && transport.stdinClosed && transport.exited &&
      transport.exitCode === 0 && transport.signal === null && !transport.forced;
  } catch (error) { failure ??= error; }
  await new Promise<void>((resolve) => {
    if (!server.listening) { resolve(); return; }
    const timer = setTimeout(() => {
      failure ??= new Error("Probe loopback server shutdown unverified");
      server.closeAllConnections();
      server.unref();
      resolve();
    }, 2_000);
    server.close(() => { clearTimeout(timer); resolve(); });
    server.closeAllConnections(); // Only sockets accepted by this probe-created server.
  });
  if (cleanupVerified) {
    try { await rm(home, { recursive: true, force: true }); } // Exact run-created runtime directory only.
    catch (error) { failure ??= error; }
  }
  const report = { classification: "real-driver-controlled-page-integration", modelEvaluation: false,
    expectedSource, openskySource, session, before, after, cleanupVerified, transport, timeline,
    passed: !failure && cleanupVerified, error: failure instanceof Error ? failure.message : failure };
  await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  await writeFile(join(output, "driver-tape.json"), JSON.stringify(driver.tape, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ output, passed: report.passed, cleanupVerified, error: report.error }));
  if (!report.passed) process.exitCode = 1;
}

function findIndex(text: string, role: string, name: string): number {
  const matches = text.split("\n").flatMap((line) => {
    const match = line.match(/^- \[(\d+)\] (\S+) ("(?:[^"\\]|\\.)*")/);
    return match && match[2] === role && JSON.parse(match[3]!) === name ? [Number(match[1])] : [];
  });
  assert.equal(matches.length, 1, `Expected one visible ${role} ${JSON.stringify(name)}`);
  return matches[0]!;
}

function snapshotId(): unknown {
  const call = driver.tape.calls.findLast((call) => call.tool === "get_browser_state");
  return asRecord(asRecord(call?.result?.structured)?.snapshot)?.id;
}
