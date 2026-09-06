import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contextBindings, isContextToken, renderContextDirections, renderContextProjection, validateContextBlock, validateQueryContexts, type ContextBlock } from "../src/browser-context.js";
import { renderBrowserObservation } from "../src/opensky.js";
import type { SnapshotElement } from "../src/types.js";

// Pure malformed/valid protocol fixtures; not real-driver acceptance.
const element = (n: number, frame = "main"): SnapshotElement => ({ element_index: 100 + n, browser_ref: `p7:${n}`, browserFrame: frame, role: "region", label: "Same label", readOnly: true, actions: [] });
const elements = Array.from({ length: 110 }, (_, n) => element(n));
const block = (patch: Partial<ContextBlock> = {}): ContextBlock => ({
  anchor_ref: "p7:0", group_ref: "p7:1", parent_group_ref: "p7:2", order_domain: "opaque-order-a",
  before_omitted: 0, after_omitted: 0, group_complete: true, document_collection_complete: true,
  virtualized_extent: "unknown", member_refs: ["p7:0", "p7:1"], outline: '- heading "Unmatched neighbor"', ...patch,
});
const rejects = (f: () => unknown) => assert.throws(f, { code: "browser_context_unavailable" });

describe("same-snapshot query context contract (pure fixtures)", () => {
  const window = (start: number, end: number, patch: Partial<ContextBlock> = {}) => block({
    anchor_ref: `p7:${start}`, before_omitted: start, after_omitted: 10 - end,
    member_refs: elements.slice(start, end).map(element => element.browser_ref!),
    group_complete: false, outline: `Window ${start} to ${end}`, ...patch,
  });

  it("accepts separate and coherent overlapping windows within one exact group", () => {
    const blocks = [window(0, 4, { after_continuation: "first-next" }),
      window(2, 6, { before_continuation: "middle-back" }),
      window(6, 10, { before_continuation: "last-back" })];
    assert.deepEqual(validateQueryContexts(blocks, "p7", elements), blocks);
    const bindings = contextBindings(blocks, elements).contextContinuations;
    assert.equal(bindings["first-next"].anchorRef, "p7:0");
    assert.equal(bindings["middle-back"].anchorRef, "p7:2");
    assert.equal(bindings["last-back"].anchorRef, "p7:6");
    assert.equal(new Set(Object.values(bindings).map(cursor => cursor.groupRef)).size, 1);
  });

  it("rejects duplicate ranges, shifted refs and conflicting same-group overlap", () => {
    const first = window(0, 4);
    rejects(() => validateQueryContexts([first, { ...first, anchor_ref: "p7:3" }], "p7", elements));
    rejects(() => validateQueryContexts([first, window(2, 6, { member_refs: ["p7:3", "p7:2", "p7:4", "p7:5"] })], "p7", elements));
    rejects(() => validateQueryContexts([first, window(6, 10, { member_refs: ["p7:0", "p7:7", "p7:8", "p7:9"] })], "p7", elements));
  });

  it("pins same-group totals, parent, order domain and collection status across windows", () => {
    for (const patch of [{ after_omitted: 1 }, { parent_group_ref: null }, { order_domain: "different" },
      { document_collection_complete: false }]) {
      rejects(() => validateQueryContexts([window(0, 4), window(6, 10, patch)], "p7", elements));
    }
    rejects(() => validateQueryContexts([window(1, 2, { after_omitted: Number.MAX_SAFE_INTEGER })], "p7", elements));
  });

  it("requires identical explicit projections across separate windows of one group", () => {
    const projection = { member_projection: "semantic_evidence_v1", source_member_nodes: 30, projected_out_nodes: 20 } as const;
    const first = window(0, 4, projection);
    const last = window(6, 10, projection);
    assert.deepEqual(validateQueryContexts([first, last], "p7", elements), [first, last]);
    rejects(() => validateQueryContexts([first, window(6, 10)], "p7", elements));
    rejects(() => validateQueryContexts([window(0, 4), last], "p7", elements));
    rejects(() => validateQueryContexts([first, { ...last, source_member_nodes: 31, projected_out_nodes: 21 }], "p7", elements));
  });

  it("validates and explicitly describes semantic projection without inventing source completeness", () => {
    const value = block({ member_projection: "semantic_evidence_v1", source_member_nodes: 12, projected_out_nodes: 10 });
    assert.deepEqual(validateQueryContexts([value], "p7", elements), [value]);
    assert.match(renderContextProjection(value), /2\/12 eligible stored AX nodes/);
    assert.match(renderContextProjection(value), /not all AX nodes or lossless text/);
    assert.equal(renderContextProjection(block()), "");
    for (const patch of [
      { member_projection: undefined }, { member_projection: "full_source" },
      { projected_out_nodes: undefined }, { source_member_nodes: undefined },
      { projected_out_nodes: -1 }, { projected_out_nodes: 0.5 }, { source_member_nodes: NaN },
      { source_member_nodes: 11 }, { source_member_nodes: Number.MAX_SAFE_INTEGER + 1 },
      { projected_out_nodes: Number.MAX_SAFE_INTEGER }, { member_refs: [] },
    ]) rejects(() => validateQueryContexts([{ ...value, ...patch }], "p7", elements));
    rejects(() => validateQueryContexts([block({ projected_out_nodes: 0 })], "p7", elements));
    const rendered = renderBrowserObservation("", elements, { query_contexts: [value] }, true);
    assert.ok(rendered.text.indexOf("Member projection:") < rendered.text.indexOf("group complete."));
    const direct = renderBrowserObservation("", elements, { context: value });
    assert.ok(direct.text.indexOf("Member projection:") < direct.text.indexOf("group complete."));
  });

  it("binds the immutable projection domain and totals to continuation authority", () => {
    const value = block({ member_projection: "semantic_evidence_v1", source_member_nodes: 14, projected_out_nodes: 10,
      after_omitted: 2, group_complete: false, after_continuation: "next-projection" });
    const expected = contextBindings([value], elements).contextContinuations["next-projection"]!;
    assert.equal(expected.sourceMemberNodes, 14);
    validateContextBlock(value, { snapshotId: "p7", elements, expected });
    for (const patch of [
      { source_member_nodes: 15, projected_out_nodes: 11 },
      { member_projection: undefined, source_member_nodes: undefined, projected_out_nodes: undefined },
    ]) rejects(() => validateContextBlock({ ...value, ...patch }, { snapshotId: "p7", elements, expected }));
    rejects(() => validateContextBlock(block({ after_omitted: 2, group_complete: false }), { snapshotId: "p7", elements, expected }));
    // A projected-out exact anchor remains a metadata identity, not an extra member.
    validateContextBlock({ ...value, member_refs: ["p7:1", "p7:3"] }, { snapshotId: "p7", elements, expected });
  });

  it("accepts valid automatic contexts and preserves source content and exact cursor authority", () => {
    const value = block({ before_omitted: 4, before_continuation: "opaque-before", group_complete: false });
    assert.deepEqual(validateQueryContexts([value], "p7", elements), [value]);
    const bindings = contextBindings([value], elements);
    assert.deepEqual(bindings.contextContinuations["opaque-before"], { anchorRef: "p7:0", groupRef: "p7:1", orderDomain: "opaque-order-a", frame: "main" });
    assert.equal(bindings.contextDomains["p7:2"], "opaque-order-a");
    assert.deepEqual(validateQueryContexts(undefined, "p7", elements), []);
  });

  it("rejects unknown, foreign, cross-frame, malformed and duplicate member identities", () => {
    for (const refs of [["p7:999"], ["p8:0"], ["p7:-1"], ["p7:0\n"], ["p7:0", "p7:0"], ["p7:9007199254740992"]]) {
      rejects(() => validateQueryContexts([block({ member_refs: refs })], "p7", elements));
    }
    const mixed = elements.map(e => e.browser_ref === "p7:3" ? { ...e, browserFrame: "oopif" } : e);
    rejects(() => validateQueryContexts([block({ member_refs: ["p7:3"] })], "p7", mixed));
    for (const patch of [{ anchor_ref: "p8:0" }, { group_ref: "p7:999" }, { parent_group_ref: "p7:3" }]) {
      rejects(() => validateQueryContexts([block(patch)], "p7", mixed));
    }
  });

  it("rejects duplicate issued refs rather than choosing a last matching element", () => {
    rejects(() => validateQueryContexts([block()], "p7", [...elements, { ...element(0), element_index: 999 }]));
  });

  it("rejects self-consistent refs with an invalid snapshot identity", () => {
    for (const id of ["", "foreign", "p-1", "p1:2", "p1\n"]) {
      const renamed = elements.map(e => ({ ...e, browser_ref: e.browser_ref!.replace("p7", id) }));
      const value = block({ anchor_ref: `${id}:0`, group_ref: `${id}:1`, parent_group_ref: `${id}:2`, member_refs: [`${id}:0`] });
      rejects(() => validateQueryContexts([value], id, renamed));
      rejects(() => validateQueryContexts([], id, []));
    }
  });

  it("rejects malformed or contradictory metadata and changed expected cursors", () => {
    for (const patch of [
      { before_omitted: -1 }, { after_omitted: 0.5 }, { after_omitted: Number.MAX_SAFE_INTEGER + 1 },
      { order_domain: "" }, { order_domain: "x".repeat(2049) }, { group_complete: true, after_omitted: 1 },
      { group_complete: true, document_collection_complete: false }, { virtualized_extent: "complete" },
      { group_complete: "true" }, { outline: 42 }, { member_refs: undefined },
    ]) rejects(() => validateQueryContexts([block(patch as Partial<ContextBlock>)], "p7", elements));
    const cursor = { anchorRef: "p7:0", groupRef: "p7:1", orderDomain: "opaque-order-a", frame: "main" };
    validateContextBlock(block(), { snapshotId: "p7", elements, expected: cursor });
    rejects(() => validateContextBlock(block({ member_refs: elements.slice(0, 26).map(e => e.browser_ref!) }), { snapshotId: "p7", elements }));
    for (const patch of [{ anchorRef: "p7:3" }, { groupRef: "p7:3" }, { orderDomain: "foreign" }, { frame: "oopif" }]) {
      rejects(() => validateContextBlock(block(), { snapshotId: "p7", elements, expected: { ...cursor, ...patch } }));
    }
  });

  it("rejects bad, reused and cross-group continuation tokens and conflicting ref domains", () => {
    for (const token of ["", "with space", "line\nbreak", "tail\n", "tail\r", "é", "x".repeat(257)]) {
      assert.equal(isContextToken(token), false);
      rejects(() => validateQueryContexts([block({ group_complete: false, after_omitted: 1, after_continuation: token })], "p7", elements));
    }
    rejects(() => validateQueryContexts([block({ after_continuation: "unexpected" })], "p7", elements));
    rejects(() => validateQueryContexts([block({ group_complete: false, before_omitted: 1, after_omitted: 1, before_continuation: "same", after_continuation: "same" })], "p7", elements));
    const a = block({ group_complete: false, after_omitted: 1, after_continuation: "shared" });
    const b = block({ anchor_ref: "p7:3", group_ref: "p7:4", parent_group_ref: null, member_refs: ["p7:3"], group_complete: false, after_omitted: 1, after_continuation: "shared" });
    rejects(() => validateQueryContexts([a, b], "p7", elements));
    rejects(() => validateQueryContexts([block(), block({ group_ref: "p7:4", order_domain: "foreign" })], "p7", elements));
    rejects(() => validateQueryContexts([block(), block()], "p7", elements));
  });

  it("enforces shared six-block, 96-member and 24000 UTF8-byte budgets", () => {
    const many = (count: number) => Array.from({ length: count }, (_, i) => block({ anchor_ref: `p7:${i}`, group_ref: `p7:${i + 10}`, parent_group_ref: null, member_refs: [], outline: "" }));
    validateQueryContexts(many(6), "p7", elements);
    rejects(() => validateQueryContexts(many(7), "p7", elements));
    const a = block({ member_refs: elements.slice(0, 48).map(e => e.browser_ref!), outline: "é".repeat(6000) });
    const b = block({ anchor_ref: "p7:50", group_ref: "p7:51", parent_group_ref: null, member_refs: elements.slice(48, 96).map(e => e.browser_ref!), outline: "🙂".repeat(3000) });
    validateQueryContexts([a, b], "p7", elements);
    rejects(() => validateQueryContexts([a, { ...b, member_refs: [...b.member_refs!, "p7:96"] }], "p7", elements));
    rejects(() => validateQueryContexts([a, { ...b, outline: b.outline + "x" }], "p7", elements));
    rejects(() => validateQueryContexts([block({ member_refs: elements.slice(0, 97).map(e => e.browser_ref!) })], "p7", elements));
  });

  it("caps issued continuation bindings at twelve and safely stores opaque property names", () => {
    const blocks = Array.from({ length: 6 }, (_, i) => block({
      anchor_ref: `p7:${i}`, group_ref: `p7:${i + 10}`, parent_group_ref: null, member_refs: [],
      before_omitted: 1, after_omitted: 1, group_complete: false,
      before_continuation: i === 0 ? "__proto__" : `before-${i}`, after_continuation: `after-${i}`,
    }));
    const bindings = contextBindings(blocks, elements);
    assert.equal(Object.keys(bindings.contextContinuations).length, 12);
    assert.equal(Object.getPrototypeOf(bindings.contextContinuations), null);
    assert.equal(bindings.contextContinuations["__proto__"].anchorRef, "p7:0");
    rejects(() => contextBindings([...blocks, block({ group_ref: "p7:19", group_complete: false,
      after_omitted: 1, after_continuation: "thirteenth" })], elements));
  });

  it("keeps exact continuation recipes outside truncated ordinary outline budgets", () => {
    const value = block({ group_complete: false, before_omitted: 2, after_omitted: 3, before_continuation: "b\"ack", after_continuation: "later" });
    const rendered = renderBrowserObservation("x".repeat(11000), elements, { snapshot: { scope: "query", complete: true }, query_contexts: [value] }, true);
    assert.equal(rendered.truncated, true);
    assert.ok(rendered.text.includes('getAXState({continuation: "b\\\"ack"})'));
    assert.ok(rendered.text.includes('getAXState({continuation: "later"})'));
    assert.match(renderContextDirections(block({ group_complete: false, after_omitted: 1 })), /no continuation available/);
    assert.match(rendered.text, /Unmatched neighbor/);
  });

  it("does not re-truncate a valid standalone 12000-byte context at 10000 characters", () => {
    const outline = "x".repeat(11999) + "Z";
    const value = block({ member_refs: ["p7:0"], after_omitted: 1, group_complete: false, after_continuation: "next-window" });
    const rendered = renderBrowserObservation(outline, [element(0)], { context: value, snapshot: { scope: "context", complete: false } });
    assert.ok(rendered.text.includes(outline));
    assert.equal(rendered.truncated, false);
    assert.ok(rendered.text.includes('getAXState({continuation: "next-window"})'));
    const utf8 = "🙂".repeat(3000);
    assert.equal(Buffer.byteLength(utf8), 12000);
    assert.ok(renderBrowserObservation(utf8, [element(0)], { context: value }).text.includes(utf8));
  });

  it("joins group indices by exact ref, never duplicate labels or rendered order", () => {
    const supplied = [element(1), element(0), element(2)];
    const result = renderBrowserObservation("", [], { query_contexts: [block()] }, true, supplied);
    assert.match(result.text, /group \[101\]; enclosing group \[102\]/);
    const missing = renderBrowserObservation("", [], { query_contexts: [block()] }, true, [element(3)]);
    assert.match(missing.text, /group \[unavailable\]/);
    assert.doesNotMatch(missing.text, /group \[103\]/);
  });
});
