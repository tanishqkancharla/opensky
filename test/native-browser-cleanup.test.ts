import assert from "node:assert/strict";
import { test } from "node:test";
import { nativeBrowserCleanupEvidence } from "../evals/acceptance/native-browser-cleanup.js";

const surface = (open: string[]) => ({ kind: "browserUse", backend: "chrome", browserId: "1", extensionInstanceId: "extension", openTabIds: open, openTabs: open.map(id => ({ id: Number(id) })) });
const state = (tabs: string[]) => ({ apps: [], browsers: [{ id: "1", metadata: { extensionInstanceId: "extension" }, tabs: tabs.map(id => ({ id })) }] });
function call(code: string, open: string[], tabs?: string[]) {
  return { id: code, name: "cua_repl.js", args: { code }, status: "completed", result: {
    _meta: { "codex/toolSurface": surface(open) },
    content: tabs ? [{ type: "text", text: JSON.stringify(state(tabs)) }] : [],
  } };
}
const baseline = () => call("await cua.getState();", [], ["10"]);
const created = () => call("let work = await cua.createBrowserTab('chrome', 'https://example.test');", ["20"]);
const closed = () => call("await work.close(); await cua.getState();", [], ["10"]);
const score = (...calls: ReturnType<typeof call>[]) => nativeBrowserCleanupEvidence(calls);

test("provider evidence and fresh inventory verify exact owned absence and sibling retention", () => {
  assert.equal(score(baseline(), created(), closed()).succeeded, true);
  // No close source text is required: operator/user closure is still absence,
  // although this evidence does not attribute who performed the close.
  assert.equal(score(baseline(), created(), call("await cua.getState();", [], ["10"])).succeeded, true);
});
test("comments, dead branches, arbitrary JSON claims cannot establish cleanup", () => {
  for (const code of [
    "// await work.close();\nawait cua.getState();",
    "if(false) await work.close(); await cua.getState();",
    "nodeRepl.write({apps:[],browsers:[]});",
    "await work.close(); nodeRepl.write({apps:[],browsers:[]});",
    "try { await work.close(); } catch {} await cua.getState();",
  ]) assert.equal(score(baseline(), created(), call(code, [], ["10"])).succeeded, false, code);
});
test("wrong-tab closure, controlled sibling, or live released-owned tab fails", () => {
  assert.equal(score(baseline(), created(), call("await other.close(); await cua.getState();", ["20"], ["10", "20"])).succeeded, false);
  assert.equal(score(baseline(), created(), call("await work.getAXState();", ["20", "21"]), call("await work.close(); await cua.getState();", ["21"], ["10", "21"])).succeeded, false);
  assert.equal(score(baseline(), created(), call("await work.close(); await cua.getState();", [], ["10", "20"])).succeeded, false);
  assert.equal(score(baseline(), created(), call("await other.close(); await cua.getState();", [], [])).succeeded, false);
});
test("missing baseline, final inventory, or controlled metadata fails closed", () => {
  assert.equal(score(created(), closed()).succeeded, false);
  assert.equal(score(baseline(), created(), call("await work.close();", [])).succeeded, false);
  const missing = closed();
  delete (missing.result._meta as any)["codex/toolSurface"].openTabIds;
  assert.equal(score(baseline(), created(), missing).succeeded, false);
  const incomplete = closed();
  incomplete.result.content[0]!.text = JSON.stringify({ apps: [], browsers: [{ id: "1" }] });
  assert.equal(score(baseline(), created(), incomplete).succeeded, false);
});
test("provider change, conflicting metadata, and preexisting claims fail", () => {
  const reconnect = closed();
  reconnect.result._meta["codex/toolSurface"].extensionInstanceId = "different";
  assert.equal(score(baseline(), created(), reconnect).succeeded, false);
  const inconsistent = closed();
  inconsistent.result._meta["codex/toolSurface"].openTabs = [{ id: 20 }];
  assert.equal(score(baseline(), created(), inconsistent).succeeded, false);
  assert.equal(score(baseline(), call("await cua.getTab('10');", ["10"]), closed()).succeeded, false);
});
test("failed or stale final observation cannot verify cleanup", () => {
  const failed = closed(); failed.status = "failed";
  assert.equal(score(baseline(), created(), failed).succeeded, false);
  assert.equal(score(baseline(), created(), closed(), call("await cua.createBrowserTab('chrome');", ["21"])).succeeded, false);
});

// Shape observed in real e32 MDN: getState has a complete inventory with
// extension identity in browsers[].metadata, but its toolSurface contains only
// kind/backend/browserId. The separate close result has explicit empty lists.
// These synthetic contract cases are not task acceptance or historical rescoring.
function inventoryOnly() {
  const result = call("await cua.getState();", [], ["10"]);
  result.result._meta["codex/toolSurface"] = { kind: "browserUse", backend: "chrome", browserId: "1" } as any;
  return result;
}
test("v3 accepts separate exact empty receipt followed by complete pure inventories", () => {
  const receipt = call("await work.close();", []);
  const result = score(inventoryOnly(), created(), receipt, inventoryOnly(), inventoryOnly());
  assert.equal(result.succeeded, true);
  assert.equal(result.schemaVersion, 3);
  if (result.succeeded) assert.equal(result.controlledEmptyReceiptCallId, receipt.id);
});
test("v3 never carries a receipt across mutation, failed, reset, or unknown calls", () => {
  for (const intervening of [
    call("await work.goto('https://example.test');", []),
    call("await work.getAXState();", []),
    { ...inventoryOnly(), name: "cua_repl.js_reset" },
    { ...inventoryOnly(), name: "other.read" },
    { ...inventoryOnly(), status: "failed" },
  ]) {
    // Omit controlled receipt metadata from the intervening call; only actual
    // explicit provider snapshots could establish a new receipt after it.
    intervening.result._meta["codex/toolSurface"] = { kind: "browserUse", backend: "chrome", browserId: "1" } as any;
    assert.equal(score(inventoryOnly(), created(), call("await work.close();", []), intervening, inventoryOnly()).succeeded, false);
  }
  assert.equal(score(inventoryOnly(), created(), call("await work.close();", []), inventoryOnly(), { ...inventoryOnly(), name: "other.read" }).succeeded, false);
});
test("v3 distinguishes omitted controlled lists from explicit empty and rejects malformed lists", () => {
  assert.equal(score(inventoryOnly(), created(), inventoryOnly()).succeeded, false);
  const unconfirmedClose = call("await work.close();", []);
  unconfirmedClose.result._meta["codex/toolSurface"] = { kind: "browserUse", backend: "chrome", browserId: "1" } as any;
  assert.equal(score(inventoryOnly(), created(), unconfirmedClose, inventoryOnly()).succeeded, false);
  const malformed = inventoryOnly();
  (malformed.result._meta["codex/toolSurface"] as any).openTabIds = null;
  assert.equal(score(inventoryOnly(), created(), call("await work.close();", []), malformed).succeeded, false);
});
