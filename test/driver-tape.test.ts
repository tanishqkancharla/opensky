import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  RecordingDriverClient,
  ReplayDriverClient,
  canonicalizeDriverArgs,
  type DriverTape,
} from "../evals/driver-tape.js";
import { replayScenario } from "../evals/replay.js";
import type { DriverClient, DriverResult } from "../src/types.js";
import { OpenSkyError } from "../src/errors.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("driver tapes", () => {
  async function recordFailure(error: unknown) {
    const recorder = new RecordingDriverClient({
      async call() { throw error; },
      async status() { return { running: true, text: "contract fixture" }; },
      async ensureDaemon() {},
    });
    await assert.rejects(recorder.call("browser_pointer", { action: "scroll" }), caught => caught === error);
    return recorder.tape;
  }

  it("preserves additive OpenSkyError diagnostics and replays the same typed refusal", async () => {
    const details = { effect: "refused", route: "trusted_input", delivery: "unknown" };
    const tape = await recordFailure(new OpenSkyError("No safe delivery proof", "input_refused", details));
    assert.equal(tape.version, 1);
    assert.equal(tape.calls[0]!.error, "No safe delivery proof");
    assert.deepEqual(tape.calls[0]!.errorMetadata, { name: "Error", code: "input_refused", details });
    const replay = new ReplayDriverClient(JSON.parse(JSON.stringify(tape)));
    await assert.rejects(replay.call("browser_pointer", { action: "scroll" }), error => {
      assert.ok(error instanceof OpenSkyError);
      assert.equal(error.message, "No safe delivery proof");
      assert.equal(error.name, "Error");
      assert.equal(error.code, "input_refused");
      assert.deepEqual(error.details, details);
      return true;
    });
    replay.assertExhausted();
  });

  it("preserves old v1 string errors without inventing typed metadata", async () => {
    const tape = await recordFailure(new Error("legacy refusal"));
    assert.equal(tape.calls[0]!.errorMetadata, undefined);
    const replay = new ReplayDriverClient(tape);
    await assert.rejects(replay.call("browser_pointer", { action: "scroll" }), error => {
      assert.ok(error instanceof Error && !(error instanceof OpenSkyError));
      assert.equal(error.message, "legacy refusal");
      return true;
    });
  });

  it("bounds oversized cyclic and non-JSON details without invoking getters or toJSON", async () => {
    const cyclic: any = {}; cyclic.self = cyclic;
    let invoked = false;
    const getter = Object.defineProperty({}, "payload", { enumerable: true, get() { invoked = true; throw Error("getter"); } });
    const values = ["x".repeat(50_000), cyclic, { integer: 1n }, { fn() {} }, new Date(), getter,
      { toJSON() { invoked = true; return {}; } }, new Array(1_000_000), { x: NaN }];
    for (const details of values) {
      const tape = await recordFailure(new OpenSkyError("refused", undefined, details));
      assert.ok(JSON.stringify(tape).length < 20_000);
      assert.match((tape.calls[0]!.errorMetadata!.details as any).omitted, /details/);
      await assert.rejects(new ReplayDriverClient(tape).call("browser_pointer", { action: "scroll" }), OpenSkyError);
    }
    assert.equal(invoked, false);
  });

  it("excludes stack, environment and causes even when nested in details", async () => {
    const tape = await recordFailure(new OpenSkyError("refused", "code", {
      status: "refused", stack: "secret-stack", env: { TOKEN: "secret-env" },
      nested: { cause: "secret-cause", causes: [], environment: "secret-env", delivery: "unknown" },
    }));
    assert.deepEqual(tape.calls[0]!.errorMetadata!.details, { status: "refused", nested: { delivery: "unknown" } });
    assert.ok(!JSON.stringify(tape).includes("secret"));
  });

  it("malformed error metadata never becomes a successful replay", async () => {
    for (const errorMetadata of [null, {}, { name: "Error", code: 3 }, { name: "x".repeat(1000) }]) {
      const tape = { version: 1, calls: [{ tool: "x", args: {}, error: "refusal", errorMetadata,
        result: { structured: { status: "ok" }, text: "", raw: null } }] } as unknown as DriverTape;
      await assert.rejects(new ReplayDriverClient(tape).call("x"), OpenSkyError);
    }
    const missingMessage = { version: 1, calls: [{ tool: "x", args: {}, errorMetadata: { name: "Error" },
      result: { structured: { status: "ok" }, text: "", raw: null } }] } as DriverTape;
    await assert.rejects(new ReplayDriverClient(missingMessage).call("x"), /Invalid driver tape error metadata/);
  });

  it("malformed metadata retains the cursor and prevents skipping into later success", async () => {
    const tape = { version: 1, calls: [
      { tool: "bad", args: {}, error: "refused", errorMetadata: { name: "Error", code: 3 } },
      { tool: "next", args: {}, result: { structured: { status: "ok" }, text: "", raw: null } },
    ] } as unknown as DriverTape;
    const replay = new ReplayDriverClient(tape);
    await assert.rejects(replay.call("bad"), /Invalid driver tape error metadata at call 0/);
    assert.throws(() => replay.assertExhausted(), /2 unused call\(s\), starting at call 0/);
    await assert.rejects(replay.call("next"), /Driver tape mismatch at call 0/);
    await assert.rejects(replay.call("bad"), /Invalid driver tape error metadata at call 0/);
    assert.throws(() => replay.assertExhausted(), /2 unused call\(s\), starting at call 0/);
  });

  it("a well-formed recorded refusal still consumes exactly one call", async () => {
    const tape = await recordFailure(new OpenSkyError("refused", "input_refused"));
    tape.calls.push({ tool: "next", args: {}, result: { structured: { status: "ok" }, text: "", raw: null } });
    const replay = new ReplayDriverClient(tape);
    await assert.rejects(replay.call("browser_pointer", { action: "scroll" }), OpenSkyError);
    assert.throws(() => replay.assertExhausted(), /1 unused call\(s\), starting at call 1/);
    assert.deepEqual((await replay.call("next")).structured, { status: "ok" });
    replay.assertExhausted();
  });

  it("records results, timing, and normalized screenshot paths", async () => {
    const result: DriverResult = {
      structured: {
        tree_markdown: "- [0] AXWindow",
        elements: [{ element_index: 0 }],
        returned_element_count: 1,
        total_element_count: 3,
      },
      text: "",
      raw: null,
    };
    const delegate: DriverClient = {
      async call() { return result; },
      async status() { return { running: true, text: "test" }; },
      async ensureDaemon() {},
    };
    const recorder = new RecordingDriverClient(delegate, { source: "test" });
    assert.deepEqual(await recorder.call("get_window_state", {
      pid: 7,
      screenshot_out_file: "/private/tmp/random.png",
      omitted: undefined,
    }), result);
    assert.deepEqual(recorder.tape.calls[0]?.args, {
      pid: 7,
      screenshot_out_file: "<SCREENSHOT_OUT>",
    });
    assert.equal(recorder.tape.calls[0]?.observed?.treeCharacters, 14);
    assert.equal(recorder.tape.calls[0]?.observed?.returnedElementCount, 1);
    assert.equal(recorder.tape.calls[0]?.observed?.totalElementCount, 3);
    assert.equal(typeof recorder.tape.calls[0]?.observed?.durationMs, "number");
  });

  it("strictly checks call order and canonical arguments", async () => {
    const tape: DriverTape = {
      version: 1,
      calls: [{
        tool: "list_windows",
        args: { pid: 9 },
        result: { structured: { windows: [] }, text: "", raw: null },
      }],
    };
    const replay = new ReplayDriverClient(tape);
    await assert.rejects(
      replay.call("list_windows", { pid: 10 }),
      /Driver tape mismatch at call 0[\s\S]*"pid":9[\s\S]*"pid":10/,
    );
    await replay.call("list_windows", { pid: 9 });
    replay.assertExhausted();
  });

  it("canonicalizes nested records deterministically", () => {
    assert.deepEqual(canonicalizeDriverArgs({ z: 1, nested: { b: 2, a: 1 }, a: undefined }), {
      nested: { a: 1, b: 2 },
      z: 1,
    });
  });

  it("replays the real-driver-derived GitHub projection through public OpenSky", async () => {
    const scenario = join(
      here,
      "..",
      "evals",
      "fixtures",
      "real-driver",
      "github-repository",
      "scenario.json",
    );
    const first = await replayScenario(scenario);
    const second = await replayScenario(scenario);
    assert.deepEqual(first, second);
    assert.equal(first.metrics.driverCalls, 5);
    assert.equal(first.metrics.reductionRatio, 0.4058);
    assert.match(first.states[0]?.text ?? "", /Accessibility projection:/);
    assert.match(first.states[0]?.text ?? "", /README\.md/);
  });
});
