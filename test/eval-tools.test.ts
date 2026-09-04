import assert from "node:assert/strict";
import { describe, it } from "bun:test";

import { dispatchBatchActions, validateBatchActions } from "../evals/tools.js";

describe("perform_actions safety", () => {
  it("rejects ambient content after unverified focus-changing input", () => {
    assert.throws(
      () => validateBatchActions([
        { type: "press_key", key: "super+f" },
        { type: "type_text", text: "query" },
      ]),
      /Unsafe batch/,
    );
    assert.throws(
      () => validateBatchActions([
        { type: "click", element_index: 2 },
        { type: "paste", text: "query" },
      ]),
      /Unsafe batch/,
    );
  });

  it("permits content without a preceding focus change", () => {
    assert.doesNotThrow(() => validateBatchActions([
      { type: "type_text", text: "query" },
    ]));
  });

  it("permits atomic targeted typing and element-targeted set_value", () => {
    assert.doesNotThrow(() => validateBatchActions([
      { type: "press_key", key: "super+f" },
      { type: "type_text", element_index: 7, text: "query" },
    ]));
    assert.throws(() => validateBatchActions([
      { type: "click", element_index: 2 },
      { type: "type_text", x: 40, y: 80, text: "query" },
    ]), /Unsafe batch/);
    assert.doesNotThrow(() => validateBatchActions([
      { type: "click", element_index: 2 },
      { type: "set_value", element_index: 2, value: "replacement" },
    ]));
  });

  it("reports the completed prefix and never retries it after a failure", async () => {
    const calls: string[] = [];
    const opensky = {
      click: async () => { calls.push("click"); },
      type_text: async () => { calls.push("type_text"); throw new Error("stale snapshot_id"); },
    };
    const result = await dispatchBatchActions(opensky as never, "Browser", [
      { type: "click", element_index: 4 },
      { type: "type_text", element_index: 5, text: "query" },
      { type: "press_key", key: "Return" },
    ]);
    assert.deepEqual(result, { completed: 1, error: "stale snapshot_id" });
    assert.deepEqual(calls, ["click", "type_text"]);
  });
});
