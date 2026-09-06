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
import { executeProbeCase } from "./probe-case-loop.js";

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
  {
    name: "wrapper-heavy list preserves trailing qualification and source nesting",
    html: '<main><ul aria-label="Wrapped entries"><li><span>Earlier wrapped entry</span></li><li><button>Inspect wrapped</button>' +
      '<div>'.repeat(20) + '<span>Context qualifier: conditional.</span>' + '</div>'.repeat(20) +
      '<div tabindex="0" aria-label="Focusable context">Retained stateful container</div></li></ul></main>',
    query: "Inspect wrapped", anchorRole: "button", anchorName: "Inspect wrapped",
    nearby: "Context qualifier: conditional.", outer: "Earlier wrapped entry",
  },
  {
    name: "wrapper-heavy table preserves column and late cell qualification",
    html: '<main><table aria-label="Wrapped records"><tbody><tr><th>Earlier wrapped record</th><td>Ready</td></tr>' +
      '<tr><th>Current wrapped record</th><td><button>Inspect wrapped record</button>' + '<div>'.repeat(20) +
      '<span>Context qualifier: deferred.</span>' + '</div>'.repeat(20) + '</td></tr></tbody></table></main>',
    query: "Inspect wrapped record", anchorRole: "button", anchorName: "Inspect wrapped record",
    nearby: "Context qualifier: deferred.", outer: "Earlier wrapped record",
  },
  {
    name: "long nested list with adjacent stored windows",
    html: '<main><ul aria-label="Ledger">' + Array.from({ length: 80 }, (_, i) =>
      `<li><span>Ledger row ${String(i).padStart(2, "0")}</span><ol><li>Nested detail A</li><li>Nested detail B</li></ol>${i === 40 ? '<button>Inspect midpoint</button>' : ''}</li>`).join('') + '</ul></main>',
    query: "Inspect midpoint", anchorRole: "button", anchorName: "Inspect midpoint",
    nearby: "Ledger row 40", outer: "Ledger row 00", paginate: true,
  },
] as const;

if (process.env.OPENSKY_REAL_DRIVER !== "1") throw new Error("Set OPENSKY_REAL_DRIVER=1 to authorize isolated test browser windows.");
const binary = process.env.CUA_DRIVER_BINARY;
const expectedSource = process.env.EVAL_EXPECTED_DRIVER_SHA;
const expectedProjection = process.env.EVAL_EXPECTED_MEMBER_PROJECTION;
if (expectedProjection !== undefined && expectedProjection !== "semantic_evidence_v1" && expectedProjection !== "none") {
  throw new Error("EVAL_EXPECTED_MEMBER_PROJECTION must be semantic_evidence_v1 or none.");
}
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
  startedAt: new Date().toISOString(), output, home, session, binary, expectedSource, expectedProjection, openskySource,
  fixtures: cases.map((fixture) => ({ ...fixture, sha256: createHash("sha256").update(fixture.html).digest("hex") })),
  cleanup: "Exact probe-owned tabs and sessions only; retain runtime unless receipts, clean transport exit and empty operator inventory prove cleanup.",
}, null, 2) + "\n", { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ output, phase: "declared-before-driver-or-gui-work" }));
const client = new StdioMcpDriverClient({ binaryPath: binary, autoInstall: false, autoStart: false, timeoutMs: 20_000, session });
const driver = new RecordingDriverClient(client, { classification: "real-driver-controlled-page-integration", expectedSource });
const opensky = createOpenSky({ driver, session, homeDir: home, settleDelayMs: 0 });
const timeline: Array<Record<string, unknown>> = [];
const assertionFailures: Array<{ case: string; error: string }> = [];
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
    const caseCallStart = driver.tape.calls.length;
    const outcome = await executeProbeCase({
      run: async () => {
        tab = await cua.createBrowserTab("chrome", `http://127.0.0.1:${address.port}/${index}`, { sessionName: `context-${index}` });
        const queried = await tab.getAXState({ query: fixture.query });
        timeline.push({ case: fixture.name, operation: "query", args: { query: fixture.query }, result: queried });
        checkProjection();
        const anchor = findIndex(queried, fixture.anchorRole, fixture.anchorName);
        const currentSnapshot = snapshotId();
        const matchingPathsAt = queried.indexOf("Matching paths (filtered, not a complete sibling list):");
        assert.ok(matchingPathsAt > 0, "Automatic evidence must be distinct from matching paths");
        const automatic = queried.slice(0, matchingPathsAt);
        assert.match(automatic, /Evidence context/, "Query must include context without an extra request");
        assert.ok(sourceOutline(automatic).includes(JSON.stringify(fixture.nearby)), "Automatic context must retain an unmatched qualifier");
        const callsBefore = driver.tape.calls.length;
        const nearby = await tab.getAXState({ context: anchor });
        checkProjection();
        timeline.push({ case: fixture.name, operation: "context", args: { context: anchor }, result: nearby });
        assert.equal(driver.tape.calls.length, callsBefore + 1, "Context makes exactly one driver call");
        assert.equal(snapshotId(), currentSnapshot, "Context must not collect a replacement snapshot");
        assert.ok(nearby.includes(fixture.nearby), "An unmatched sibling qualifier must survive");
        const outerIndex = Number(nearby.match(/enclosing group \[(\d+)\]/)?.[1]);
        assert.ok(Number.isSafeInteger(outerIndex), `${fixture.name}: this fixture requires an outward structural anchor`);
        const outer = await tab.getAXState({ context: outerIndex });
        checkProjection();
        timeline.push({ case: fixture.name, operation: "outer context", args: { context: outerIndex }, result: outer });
        // Inspect only the source outline, never the separate ranked action or
        // context-index inventories. Compare only the fixture's evidence strings.
        if ("paginate" in fixture) {
          await checkPagination(tab, outer, currentSnapshot, fixture.name);
        } else {
          const outline = sourceOutline(outer);
          const earlierAt = outline.indexOf(JSON.stringify(fixture.outer));
          const currentAt = outline.indexOf(JSON.stringify(fixture.nearby));
          assert.ok(earlierAt >= 0 && currentAt > earlierAt,
            `${fixture.name}: the source outline must show the earlier sibling before the current qualifier`);
          assert.match(outer, /0 nodes before, 0 after omitted; group complete\./,
            `${fixture.name}: this small static group must have fully proven collection coverage`);
        }
        assert.equal(snapshotId(), currentSnapshot);
        const beforeRefusal = driver.tape.calls.length;
        const activeTab = tab;
        await assert.rejects(() => activeTab.click(outerIndex), /does not support/);
        assert.equal(driver.tape.calls.length, beforeRefusal, "Read-only group cannot dispatch input");
        await tab.click(anchor); // Original same-snapshot action authority remains valid; fixture button has no external effect.
        await assert.rejects(() => activeTab.getAXState({ context: anchor }), /no intervening input/);
      },
      cleanup: async () => {
        if (!tab) return false;
        await tab.close();
        return caseCleanupVerified(caseCallStart);
      },
    });
    if (outcome.assertionFailure) {
      const error = outcome.assertionFailure.message;
      assertionFailures.push({ case: fixture.name, error });
      timeline.push({ case: fixture.name, checksPassed: false, assertionFailure: error, cleanupVerified: true });
    } else {
      timeline.push({ case: fixture.name, checksPassed: true, cleanupVerified: true });
    }
  }
  if (assertionFailures.length > 0) {
    failure = new Error(`${assertionFailures.length} controlled fixture assertion(s) failed: ${assertionFailures
      .map((entry) => `${entry.case}: ${entry.error}`)
      .join("; ")}`);
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
    expectedSource, expectedProjection, openskySource, session, before, after, cleanupVerified, transport, timeline, assertionFailures,
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

function checkProjection(): void {
  const structured = asRecord(driver.tape.calls.at(-1)?.result?.structured);
  const contexts = structured?.context ? [structured.context] : structured?.query_contexts;
  assert.ok(Array.isArray(contexts) && contexts.length > 0);
  for (const raw of contexts) {
    const context = asRecord(raw)!;
    if (expectedProjection === "none") assert.equal(context.member_projection, undefined);
    if (expectedProjection === "semantic_evidence_v1") assert.equal(context.member_projection, expectedProjection);
    if (context.member_projection) {
      assert.equal(context.member_projection, "semantic_evidence_v1");
      assert.ok(Array.isArray(context.member_refs) && context.member_refs.length > 0);
      assert.equal(Number(context.before_omitted) + context.member_refs.length + Number(context.after_omitted) +
        Number(context.projected_out_nodes), context.source_member_nodes, "Projection must account for every eligible raw AX member");
    }
  }
}

function sourceOutline(text: string): string {
  return text.split("\n").filter((line) => /^\s*- /.test(line) && !/^- \[\d+\]/.test(line)).join("\n");
}

function directionToken(text: string, direction: "Earlier" | "Later"): string | undefined {
  const match = text.match(new RegExp(`${direction} context: getAXState\\(\\{continuation: ("(?:[^"\\\\]|\\\\.)*")\\}\\)`));
  return match ? JSON.parse(match[1]!) as string : undefined;
}

/** Verify actor-visible source rows and exact stored cursor semantics separately.
 * The wire is used only to check provenance/bounds, never to fill missing text.
 */
async function checkPagination(tab: Tab, initial: string, expectedSnapshot: unknown, caseName: string): Promise<void> {
  const observedRows: number[] = [];
  const issuedMembers = new Set<string>();
  const forwardMembers: string[] = [];
  const seenTokens = new Set<string>();
  let earlierToken: string | undefined;
  let text = initial;
  let previousEnd = 0;
  let finalPageStart = 0;
  let total: number | undefined;
  const readPage = async (token: string) => {
    assert.ok(!seenTokens.has(token), "Traversal must not repeat a consumed cursor");
    seenTokens.add(token);
    const before = driver.tape.calls.length;
    const page = await tab.getAXState({ continuation: token });
    checkProjection();
    timeline.push({ case: caseName, operation: "continuation", args: { continuation: token }, result: page });
    assert.equal(driver.tape.calls.length, before + 1, "Continuation makes exactly one driver call");
    assert.equal(snapshotId(), expectedSnapshot, "Continuation must not recapture");
    const context = asRecord(asRecord(driver.tape.calls.at(-1)?.result?.structured)?.context);
    assert.equal(context?.group_ref, group);
    assert.equal(context?.order_domain, domain);
    assert.equal(context?.source_member_nodes, initialContext?.source_member_nodes);
    assert.equal(context?.projected_out_nodes, initialContext?.projected_out_nodes);
    const count = driver.tape.calls.length;
    await assert.rejects(() => tab.getAXState({ continuation: token }), /current browser snapshot/);
    assert.equal(driver.tape.calls.length, count, "Reused cursor must fail before dispatch");
    return page;
  };
  const initialContext = asRecord(asRecord(driver.tape.calls.at(-1)?.result?.structured)?.context);
  const group = initialContext?.group_ref;
  const domain = initialContext?.order_domain;
  assert.equal(initialContext?.before_omitted, 0, "Reading a group starts at its beginning");
  for (let pages = 0; ; pages++) {
    assert.ok(pages < 100, "Traversal must make bounded progress");
    const context = asRecord(asRecord(driver.tape.calls.at(-1)?.result?.structured)?.context);
    assert.ok(context && Array.isArray(context.member_refs) && context.member_refs.length > 0);
    assert.ok(context.member_refs.length <= 25);
    const before = Number(context.before_omitted);
    const after = Number(context.after_omitted);
    assert.equal(before, previousEnd, "Later windows must be contiguous in source order");
    previousEnd = before + context.member_refs.length;
    finalPageStart = before;
    total ??= before + context.member_refs.length + after;
    assert.equal(before + context.member_refs.length + after, total, "All windows describe one fixed materialized group");
    for (const ref of context.member_refs) {
      assert.equal(typeof ref, "string");
      assert.ok(!issuedMembers.has(ref), "Adjacent later pages may not skip via overlapping member windows");
      issuedMembers.add(ref);
      forwardMembers.push(ref);
    }
    observedRows.push(...[...sourceOutline(text).matchAll(/"Ledger row (\d{2})"/g)].map(match => Number(match[1])));
    earlierToken = directionToken(text, "Earlier");
    const token = directionToken(text, "Later");
    if (!token) { assert.equal(after, 0, "No unreachable omitted tail on a static list"); break; }
    assert.ok(after > 0);
    text = await readPage(token);
  }
  assert.equal(issuedMembers.size, total, "Every materialized member must appear in a window");
  assert.deepEqual([...new Set(observedRows)], Array.from({ length: 80 }, (_, i) => i), "Visible source outlines must expose every nested-list row in order");
  assert.ok(earlierToken, "A later window must expose a usable earlier cursor");
  let expectedReverseEnd = finalPageStart;
  for (let pages = 0; earlierToken; pages++) {
    assert.ok(pages < 100);
    text = await readPage(earlierToken);
    const context = asRecord(asRecord(driver.tape.calls.at(-1)?.result?.structured)?.context);
    const before = Number(context?.before_omitted);
    assert.ok(context && Array.isArray(context.member_refs) && context.member_refs.length > 0);
    assert.equal(before + context.member_refs.length, expectedReverseEnd, "Earlier windows must be contiguous toward the beginning");
    assert.deepEqual(context.member_refs, forwardMembers.slice(before, expectedReverseEnd), "Reverse traversal returns the same exact source members");
    expectedReverseEnd = before;
    earlierToken = directionToken(text, "Earlier");
    if (!earlierToken) assert.equal(before, 0, "No unreachable omitted prefix");
  }
  assert.equal(expectedReverseEnd, 0, "Reverse traversal covers the whole prefix");
  assert.ok(sourceOutline(text).includes('"Ledger row 00"'), "Earlier traversal exposes the actual prefix, not a count alone");
}

function caseCleanupVerified(callStart: number): boolean {
  const calls = driver.tape.calls.slice(callStart);
  const prepared = [...new Set(calls
    .filter((call) => call.tool === "browser_prepare")
    .map((call) => call.args.session)
    .filter((owned): owned is string => typeof owned === "string" && owned.length > 0))];
  if (prepared.length === 0) return false;
  const ended = calls.filter((call) => call.tool === "end_session");
  return prepared.every((owned) => ended.some((call) => successfulEndSessionId(call) === owned));
}
