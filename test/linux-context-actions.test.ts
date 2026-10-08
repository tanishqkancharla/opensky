import assert from "node:assert/strict";
import { test } from "node:test";
import { compactLinuxContextActions, diffTrees } from "../src/opensky.js";
import type { SnapshotElement } from "../src/types.js";

const elements = [
  { element_index: 0, actions: ["showContextMenu"] },
  { element_index: 7, actions: ["press", "showContextMenu"] },
] as SnapshotElement[];
const tree = '- [0] frame "Example" [actions=[showContextMenu]]\n  - [7] push button "Run" [actions=[press,showContextMenu]] [focused]';

test("heterogeneous, missing and malformed capability evidence stays verbatim", () => {
  assert.equal(compactLinuxContextActions(tree, [elements[0]!, { ...elements[1]!, actions: ["press"] }]), tree);
  assert.equal(compactLinuxContextActions(tree, [elements[0]!]), tree);
  for (const variant of [tree.replace('press,showContextMenu', 'press'), tree.replace('[actions=[press,showContextMenu]]', '[actions=unknown]'), tree.replace('"Run"', '"unterminated')]) {
    assert.equal(compactLinuxContextActions(variant, elements), variant);
  }
});

test("literal multiline values and action-looking text retain every character", () => {
  const literal = tree.replace('"Run"', '"line one\n  - [0] literal [actions=[showContextMenu]]\nline three"');
  const result = compactLinuxContextActions(literal, elements);
  assert.ok(result.includes('"line one\n  - [0] literal [actions=[showContextMenu]]\nline three"'));
  assert.ok(result.includes('[7] push button'));
  assert.ok(result.includes('[actions=[press]] [focused]'));
});

test("one indexed control stays verbatim instead of adding an unnecessary legend", () => {
  const one = tree.split('\n')[0]!;
  assert.equal(compactLinuxContextActions(one, elements), one);
});


test("diffs publish a full current view when the shared capability note appears or disappears", () => {
  const shared = compactLinuxContextActions(tree, elements);
  const mixed = tree.replace('[actions=[press,showContextMenu]]', '[actions=[press]]');
  const mixedElements = [elements[0]!, { ...elements[1]!, actions: ["press"] }];
  assert.equal(diffTrees(shared, elements, mixed, mixedElements), mixed);
  assert.equal(diffTrees(mixed, mixedElements, shared, elements), shared);
  assert.equal(diffTrees(shared, elements, shared, elements), "No accessibility changes.");
});
