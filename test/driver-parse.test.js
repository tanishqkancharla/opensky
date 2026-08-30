import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseDriverOutput } from "../dist/driver.js";

describe("parseDriverOutput", () => {
  it("reads MCP envelopes", () => {
    const parsed = parseDriverOutput(
      JSON.stringify({
        content: [{ type: "text", text: "ok" }],
        structuredContent: { apps: [{ name: "Calculator" }] },
        isError: false,
      }),
    );
    assert.equal(parsed.isError, false);
    assert.deepEqual(parsed.result.structured, { apps: [{ name: "Calculator" }] });
  });

  it("reads direct JSON", () => {
    const parsed = parseDriverOutput(JSON.stringify({ pid: 844 }));
    assert.equal(parsed.isError, false);
    assert.deepEqual(parsed.result.structured, { pid: 844 });
  });

  it("surfaces isError envelopes", () => {
    const parsed = parseDriverOutput(
      JSON.stringify({
        isError: true,
        content: [{ type: "text", text: "Invalid params" }],
      }),
    );
    assert.equal(parsed.isError, true);
    assert.equal(parsed.message, "Invalid params");
  });

  it("keeps non-JSON stdout as text", () => {
    const parsed = parseDriverOutput("running");
    assert.equal(parsed.result.text, "running");
  });
});
