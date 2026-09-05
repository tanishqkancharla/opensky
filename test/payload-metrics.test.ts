import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toolFailureReason } from "../evals/acceptance/evidence.js";
import {
  aggregatePayloadMetrics,
  extractPublicToolCallCounts,
  formatPublicToolCallCounts,
  measurePayload,
} from "../evals/acceptance/payload-metrics.js";

describe("payload metrics", () => {
  it("separates visible text and image encoding from complete host serialization", () => {
    const args = { code: "go()" };
    const result = {
      content: [
        { type: "text", text: "visible" },
        { type: "image", data: "YWJjZA==", mimeType: "image/png" },
      ],
      details: { payload: "host-only", screenshotCopy: "YWJjZA==" },
    };
    const metrics = measurePayload(args, result);

    assert.equal(metrics.argumentSerializedChars, JSON.stringify(args).length);
    assert.equal(metrics.resultHostSerializedChars, JSON.stringify(result).length);
    assert.equal(metrics.totalHostSerializedChars, JSON.stringify(args).length + JSON.stringify(result).length);
    assert.equal(metrics.modelVisibleTextChars, "visible".length);
    assert.equal(metrics.modelVisibleImageCount, 1);
    assert.equal(metrics.modelVisibleImageEncodedChars, 8);
    assert.deepEqual(metrics.modelVisibleImageEncodedCharsByImage, [8]);
  });

  it("counts image blocks even when their bytes are unavailable and aggregates calls", () => {
    const metrics = aggregatePayloadMetrics([
      { args: { a: 1 }, result: { content: [{ type: "image", image_url: { url: "data:image/png;base64,AAAA" } }] } },
      { args: {}, error: "failed visibly" },
      { args: {}, result: { content: [{ type: "image", image_url: { url: "https://example.test/image.png" } }] } },
    ]);

    assert.equal(metrics.callCount, 3);
    assert.equal(metrics.modelVisibleTextChars, "failed visibly".length);
    assert.equal(metrics.modelVisibleImageCount, 2);
    assert.equal(metrics.modelVisibleImageEncodedChars, 4);
    assert.deepEqual(metrics.modelVisibleImageEncodedCharsByImage, [4, 0]);
  });

  it("does not mistake nested details or arbitrary objects for model-visible text", () => {
    const metrics = measurePayload({}, {
      content: [{ type: "resource", text: "not a text block" }],
      details: { text: "host metadata", data: "pretend-image" },
    });
    assert.equal(metrics.modelVisibleTextChars, 0);
    assert.equal(metrics.modelVisibleImageCount, 0);
    assert.ok(metrics.resultHostSerializedChars > 0);
  });

  it("accepts an explicit visible projection without changing host serialization", () => {
    const result = { aggregated_output: "instructions", exit_code: 0 };
    const metrics = measurePayload(
      {},
      result,
      { content: [{ type: "text", text: result.aggregated_output }] },
    );
    assert.equal(metrics.modelVisibleTextChars, "instructions".length);
    assert.equal(metrics.resultHostSerializedChars, JSON.stringify(result).length);
  });

  it("reports canonical failed-status permission denials as failed public calls", () => {
    const calls = [
      {
        status: toolFailureReason({
          status: "failed",
          result: { content: [{ type: "text", text: "Computer Use was not approved to use Activity Monitor" }] },
        }) ? "failed" : "completed",
      },
      { status: "completed" },
    ];
    const counts = extractPublicToolCallCounts({
      efficiencyInputs: {
        publicToolCallCount: calls.length,
        failedPublicToolCallCount: calls.filter((call) => call.status === "failed").length,
      },
    });

    assert.deepEqual(counts, { total: 2, failed: 1 });
    assert.equal(formatPublicToolCallCounts(counts.total, counts.failed), "2 total, 1 failed");
  });

  it("preserves missing or malformed public-call counts as unknown", () => {
    assert.deepEqual(extractPublicToolCallCounts({ efficiencyInputs: {} }), { total: null, failed: null });
    assert.deepEqual(
      extractPublicToolCallCounts({ efficiencyInputs: { publicToolCallCount: -1, failedPublicToolCallCount: "0" } }),
      { total: null, failed: null },
    );
    assert.deepEqual(
      extractPublicToolCallCounts({ efficiencyInputs: { publicToolCallCount: 0, failedPublicToolCallCount: 0 } }),
      { total: 0, failed: 0 },
    );
    assert.equal(formatPublicToolCallCounts(3, null), "3 total, ? failed");
  });
});
