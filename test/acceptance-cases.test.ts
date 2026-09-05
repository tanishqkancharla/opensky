import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  acceptanceFamilies,
  selectAcceptanceCase,
  type AcceptanceFamily,
} from "../evals/acceptance/cases.js";

const expectedFamilies: readonly AcceptanceFamily[] = [
  "amazon",
  "github",
  "wikipedia",
  "hacker-news",
  "mdn",
  "activity-monitor",
];

test("acceptance corpus preserves its frozen prompt and oracle contract", () => {
  assert.deepEqual(Object.keys(acceptanceFamilies), expectedFamilies);
  assert.equal(
    createHash("sha256").update(JSON.stringify(acceptanceFamilies)).digest("hex"),
    "79f00fce545ae8788f4a9ab9c040c08ca7a7ac7d46d568773d72f8fd33cb3cd0",
  );

  for (const [family, variants] of Object.entries(acceptanceFamilies)) {
    assert.equal(variants.length, 2, `${family} must retain both frozen seeds`);
    assert.ok(Object.isFrozen(variants));
    for (const task of variants) {
      assert.equal(task.family, family);
      assert.ok(Object.isFrozen(task));
      assert.ok(Object.isFrozen(task.oracle));
      assert.ok(Object.isFrozen(task.oracle.lifecycle));
      assert.ok(
        task.oracle.lifecycle.targetKind === "exact_browser_session" ||
          task.oracle.lifecycle.targetKind === "native_window",
      );
      assert.equal(
        task.oracle.lifecycle.targetKind,
        family === "activity-monitor" ? "native_window" : "exact_browser_session",
      );
      assert.equal(task.oracle.lifecycle.mustBeClosed, true);
    }
  }
});

test("selection is deterministic without mutating canonical variants", () => {
  for (const family of expectedFamilies) {
    const variants = acceptanceFamilies[family];
    assert.equal(selectAcceptanceCase(family, "0").id, variants[0]!.id);
    assert.equal(selectAcceptanceCase(family, "1").id, variants[1]!.id);
    const wrapped = selectAcceptanceCase(family, "3");
    assert.equal(wrapped.id, variants[1]!.id);
    assert.equal(wrapped.seed, 3);
    assert.equal(variants[1]!.seed, 1);
    assert.ok(Object.isFrozen(wrapped));
  }
});

test("selection rejects invalid family and seed values", () => {
  assert.throws(() => selectAcceptanceCase("unknown", "0"), /Unknown EVAL_TASK/);
  for (const seed of ["-1", "1.5", "NaN", "9007199254740992"]) {
    assert.throws(() => selectAcceptanceCase("amazon", seed), /EVAL_SEED must be a non-negative safe integer/);
  }
});
