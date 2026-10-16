import assert from "node:assert/strict";
import { AsyncRepl } from "../../src/async-repl.js";
import { installNodeReplOutput, type ReplOutput } from "../../src/node-repl.js";
import { runStrictFixture } from "../strict-process.js";

const cases: Record<string, () => Promise<void>> = {
  "keeps strict output capabilities in the membrane and snapshots values at write time": async () => {
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
  },
};

await runStrictFixture(import.meta.url, cases);
