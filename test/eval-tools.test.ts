import assert from "node:assert/strict";
import { describe, it } from "bun:test";

import { validateBatchActions } from "../evals/tools.js";

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
});
