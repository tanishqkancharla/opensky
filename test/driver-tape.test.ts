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

const here = dirname(fileURLToPath(import.meta.url));

describe("driver tapes", () => {
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
