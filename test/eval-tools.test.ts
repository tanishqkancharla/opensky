import assert from "node:assert/strict";
import { describe, it } from "bun:test";

import { createOpenSkyToolRuntime, dispatchBatchActions, validateBatchActions } from "../evals/tools.js";
import type { DriverClient, DriverResult } from "../src/types.js";

describe("OpenSky tool runtime lifecycle", () => {
  it("gives agent hosts an explicit cleanup hook", async () => {
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const driver: DriverClient = {
      async ensureDaemon() {},
      async status() { return { running: true, text: "running" }; },
      async call(tool, args = {}): Promise<DriverResult> {
        calls.push({ tool, args });
        return { structured: { status: "ok" }, text: "ok", raw: {} };
      },
    };
    const runtime = createOpenSkyToolRuntime(driver, "mac");

    await runtime.close();
    await runtime.close();

    assert.equal(runtime.tools.length > 0, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.tool, "end_session");
    assert.match(String(calls[0]?.args.session), /^opensky-\d+-[0-9a-f]{8}$/);
  });
});

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
