import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { createOpenSkyToolRuntime, dispatchBatchActions, OPENSKY_TOOL_NAMES, validateBatchActions } from "../evals/tools.js";
import type { DriverClient, DriverResult } from "../src/types.js";

describe("OpenSky tool runtime lifecycle", () => {
  it("gives agent hosts an explicit cleanup hook", async () => {
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const driver: DriverClient = {
      async ensureDaemon() {},
      async status() { return { running: true, text: "running" }; },
      async call(tool, args = {}): Promise<DriverResult> {
        calls.push({ tool, args });
        const structured = tool === "end_session" ? { session: args.session, active: false } : { status: "ok" };
        return { structured, text: JSON.stringify(structured), raw: structured };
      },
    };
    const runtime = createOpenSkyToolRuntime(driver, "mac", {
      homeDir: await mkdtemp(join(tmpdir(), "opensky-eval-tools-")),
    });

    await runtime.close();
    await runtime.close();

    assert.equal(runtime.tools.length > 0, true);
    assert.equal(OPENSKY_TOOL_NAMES.includes("navigate"), true);
    assert.equal(OPENSKY_TOOL_NAMES.includes("close_target"), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.tool, "end_session");
    assert.match(String(calls[0]?.args.session), /^opensky-\d+-[0-9a-f]{8}$/);
  });

  it("rejects contradictory observation queries before dispatching input", async () => {
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const driver: DriverClient = {
      async ensureDaemon() {},
      async status() { return { running: true, text: "running" }; },
      async call(tool, args = {}): Promise<DriverResult> {
        calls.push({ tool, args });
        const structured = tool === "end_session" ? { session: args.session, active: false } : { status: "ok" };
        return { structured, text: JSON.stringify(structured), raw: structured };
      },
    };
    const runtime = createOpenSkyToolRuntime(driver, "mac", {
      homeDir: await mkdtemp(join(tmpdir(), "opensky-eval-tools-")),
    });
    const click = runtime.tools.find((tool) => tool.name === "click");
    const batch = runtime.tools.find((tool) => tool.name === "perform_actions");
    assert.ok(click);
    assert.ok(batch);

    await assert.rejects(
      () => click.execute("test", {
        app: "Browser",
        element_index: 1,
        observe: false,
        observation_query: "Results",
      }),
      /observation_query requires a post-action observation/,
    );
    await assert.rejects(
      () => batch.execute("test", {
        app: "Browser",
        actions: [{ type: "click", element_index: 1 }],
        observation: "none",
        observation_query: "Results",
      }),
      /observation_query requires a post-action observation/,
    );
    assert.equal(calls.length, 0, "invalid combinations must not initialize the driver or send input");
    await runtime.close();
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
