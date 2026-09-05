import assert from "node:assert/strict";
import { test } from "node:test";
import { projectPublicTranscript as project, timelineFileName } from "../evals/acceptance/public-transcript.js";

test("omits nested screenshot URLs and tiny data images regardless of key", () => {
  const input = { _meta: { screenshot: { tabId: "20", url: "data:image/png;base64,AAAA" } }, unrelated: "data:image/png;base64,AQ==" };
  const result = project(input) as any;
  assert.equal(result._meta.screenshot.tabId, "20");
  assert.match(result._meta.screenshot.url, /encoded image omitted/);
  assert.match(result.unrelated, /encoded image omitted/);
  assert.equal(input.unrelated, "data:image/png;base64,AQ==");
});
test("omits clearly binary structures without losing numeric task objects", () => {
  const numeric = { 0: 7, 1: 25 };
  const input = { screenshot: numeric, __cuaBytes: [1, 2], typed: new Uint8Array([1, 2]), buffer: { type: "Buffer", data: [1, 2] }, task: numeric, rows: [1, 2], screenshotInvalid: { 0: 999 } };
  const result = project(input) as any;
  for (const key of ["screenshot", "__cuaBytes", "typed", "buffer"]) assert.match(result[key], /2 bytes/);
  assert.deepEqual(result.task, numeric);
  assert.deepEqual(result.rows, [1, 2]);
  assert.deepEqual(result.screenshotInvalid, { 0: 999 });
  // A color triple can coincidentally begin with JPEG magic; it is not an image.
  assert.deepEqual(project({ color: { 0: 255, 1: 216, 2: 255 } }), { color: { 0: 255, 1: 216, 2: 255 } });
});
test("preserves exact ordinary text, arguments, status and metadata", () => {
  const input = { args: { code: "await app.click(2);", data: "data field ".repeat(1000), image: "image description ".repeat(1000) }, status: "completed", result: { content: [{ type: "text", text: "Public answer" }], _meta: { target: "123", latencyMs: 22 } } };
  assert.deepEqual(project(input), input);
  assert.deepEqual(project({ data: "AAAA", image: "hello" }), { data: "AAAA", image: "hello" });
});
test("omits image-block encoding, private reasoning and associated signatures", () => {
  const result = project({ content: [{ type: "image", data: "AQ==", mimeType: "image/png" }, { type: "thinking", thinking: "private", signature: "secret" }, { type: "text", text: "visible" }], thinkingSignature: "secret", reasoningOutput: 42 }) as any;
  assert.match(result.content[0].data, /omitted/);
  assert.deepEqual(result.content[1], { type: "thinking", omitted: "private reasoning" });
  assert.equal(result.content[2].text, "visible");
  assert.equal(result.reasoningOutput, 42);
  assert.ok(!JSON.stringify(result).includes("secret"));
});
test("large serialized screenshot stays bounded", () => {
  const screenshot = Object.fromEntries(Array.from({ length: 100_000 }, (_, i) => [i, i % 256]));
  assert.ok(JSON.stringify(project({ screenshot })).length < 100);
});
test("large image encoding and serialized PNG result use bounded projection", () => {
  assert.ok(JSON.stringify(project({ type: "image", data: "A".repeat(1_300_000) })).length < 150);
  const result = Object.fromEntries([137, 80, 78, 71, 13, 10, 26, 10, ...new Array(1000).fill(0)].map((byte, i) => [i, byte]));
  assert.ok(JSON.stringify(project({ details: { result } })).length < 150);
});
test("timeline output permits only a simple markdown basename", () => {
  assert.equal(timelineFileName(undefined), "timeline-full.md");
  assert.equal(timelineFileName("timeline-readable-v2.md"), "timeline-readable-v2.md");
  for (const name of ["../out.md", "/tmp/out.md", "x/y.md", "x\\y.md", "metrics.json", "", "a\nb.md"]) assert.throws(() => timelineFileName(name));
});
