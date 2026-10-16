import { runStrictCase } from "./strict-process.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createNodeReplOutput, type ReplOutput } from "../src/node-repl.js";

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

  it("keeps strict output capabilities in the membrane and snapshots values at write time", () =>
    runStrictCase(new URL("./fixtures/strict-output-case.ts", import.meta.url), "keeps strict output capabilities in the membrane and snapshots values at write time"));
});
