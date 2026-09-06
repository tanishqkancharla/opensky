import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createNodeReplOutput, installNodeReplOutput, type ReplOutput } from "../src/node-repl.js";
import { AsyncRepl } from "../src/async-repl.js";

describe("Computer-compatible explicit output", () => {
  it("preserves byte views, detects image format, and keeps explicit repeated images", async () => {
    const outputs: ReplOutput[] = [];
    const output = createNodeReplOutput(value => outputs.push(value));
    // Format/serialization fixtures; no claim of full image decoding.
    const fixtures = [
      { bytes: [137, 80, 78, 71, 13, 10, 26, 10], mime: "image/png" },
      { bytes: [255, 216, 255, 224], mime: "image/jpeg" },
      { bytes: [...Buffer.from("RIFF\x04\x00\x00\x00WEBP")], mime: "image/webp" },
    ];
    for (const { bytes, mime } of fixtures) {
      const padded = Uint8Array.from([0, ...bytes, 0]);
      const view = padded.subarray(1, padded.length - 1);
      await output.emitImage(view);
      await output.emitImage({ bytes: view, mimeType: mime });
      await output.emitImage(`data:${mime};base64,${Buffer.from(view).toString("base64")}`);
      assert.deepEqual(outputs.splice(0), Array.from({ length: 3 }, () => ({
        type: "image", mimeType: mime, data: Buffer.from(bytes).toString("base64"),
      })));
    }
    await assert.rejects(() => output.emitImage({ bytes: Uint8Array.from([255, 216, 255]), mimeType: "image/png" }), /MIME/);
    await assert.rejects(() => output.emitImage("https://example.com/image.png"), /host asset resolver/);
    await assert.rejects(() => output.emitImage(new Uint8Array([1, 2, 3])), /recognized/);
    assert.deepEqual(outputs, []);
  });

  it("keeps strict output capabilities in the membrane and snapshots values at write time", async () => {
    const outputs: ReplOutput[] = [];
    const repl = new AsyncRepl({ strictSandbox: true, allowNodeApis: false });
    installNodeReplOutput(repl, value => outputs.push(value));
    await repl.evaluate(`
      let value = {count:1}; nodeRepl.write(value); value.count = 2;
      const padded = new Uint8Array([0,255,216,255,0]);
      await nodeRepl.emitImage({bytes:padded.subarray(1,4), mimeType:"image/jpeg"});
    `);
    assert.deepEqual(outputs, [
      { type: "text", text: "{ count: 1 }" },
      { type: "image", mimeType: "image/jpeg", data: "/9j/" },
    ]);
    await assert.rejects(() => repl.evaluate(`nodeRepl.emitImage.constructor("return process")()`), /Code generation/);
    await assert.rejects(() => repl.evaluate(`await nodeRepl.emitImage("file:///tmp/test.png")`), /host asset resolver/);
    assert.equal(outputs.length, 2);
  });
});
