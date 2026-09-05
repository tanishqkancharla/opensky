import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CuaDriverClient, parseDriverOutput, parseDriverRefusal } from "../src/driver.js";
import { OpenSkyError } from "../src/errors.js";

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

describe("parseDriverRefusal", () => {
  it("reads typed browser refusal envelopes", () => {
    assert.deepEqual(parseDriverRefusal({
      status: "refused",
      refusal: { code: "browser_requires_setup", message: "Prepare an isolated browser first." },
    }), {
      code: "browser_requires_setup",
      message: "Prepare an isolated browser first.",
    });
  });

  it("retains legacy effect refusals", () => {
    assert.deepEqual(parseDriverRefusal({ effect: "refused", code: "window_off_space", reason: "Window is off-Space." }), {
      code: "window_off_space",
      message: "Window is off-Space.",
    });
    assert.deepEqual(parseDriverRefusal({
      effect: "refused",
      refusal: { code: "browser_ref_stale", message: "The browser ref is stale." },
    }), {
      code: "browser_ref_stale",
      message: "The browser ref is stale.",
    });
    assert.deepEqual(parseDriverRefusal({
      effect: "refused",
      reason: { code: "browser_action_unavailable", detail: "The target is not focusable." },
    }), {
      code: "browser_action_unavailable",
      message: "The target is not focusable.",
    });
    assert.equal(parseDriverRefusal({ status: "ok" }), null);
  });

  it("recognizes explicit bare refusals but not bare codes, malformed objects, or prose", () => {
    assert.deepEqual(parseDriverRefusal({ refusal: { code: "scope_denied", message: "Outside the bound target." } }), {
      code: "scope_denied", message: "Outside the bound target.",
    });
    assert.deepEqual(parseDriverRefusal({ refusal: { message: "Refused." } }), { code: undefined, message: "Refused." });
    for (const value of [null, [], "refused", { code: "scope_denied" }, { refusal: {} }, { refusal: { code: "  ", message: 7 } }, { effect: "confirmed" }]) {
      assert.equal(parseDriverRefusal(value, "refused (scope_denied): not allowed"), null);
    }
  });

  it("explains valid projected escalation without inventing its exact cause", () => {
    assert.deepEqual(parseDriverRefusal({
      effect: "refused", route: "trusted_input", escalation: { target: "page", reason: "route_unavailable" },
    }), {
      code: undefined,
      message: "The desktop helper refused the request. Driver escalation: target=page, reason=route_unavailable.",
    });
    for (const escalation of [null, [], { target: "page", reason: {} }, { target: "unexpected", reason: "permission_required" }, { target: "page", reason: "x".repeat(50_000) }]) {
      assert.deepEqual(parseDriverRefusal({ effect: "refused", escalation }), {
        code: undefined, message: "The desktop helper refused the request.",
      });
    }
  });

  it("uses retained envelope text only after structured refusal is established", () => {
    const diagnostic = "refused (browser_input_trust_unavailable): focus emulation could not be restored; delivery is unknown and must not be retried automatically";
    const parsed = parseDriverOutput(JSON.stringify({
      content: [{ type: "text", text: diagnostic }],
      structuredContent: { effect: "refused", route: "trusted_input" }, isError: false,
    }));
    assert.deepEqual(parseDriverRefusal(parsed.result.structured, parsed.result.text), { code: undefined, message: diagnostic });
    assert.deepEqual(parseDriverRefusal({ status: "refused", refusal: { code: "exact", message: "Structured diagnostic." } }, diagnostic), {
      code: "exact", message: "Structured diagnostic.",
    });
  });

  it("keeps unknown delivery terminal and bounds diagnostics without synthesizing a code", () => {
    const refusal = parseDriverRefusal({ effect: "refused", delivery: { mode: "unknown" } }, "long ".repeat(10_000) + "must not retry");
    assert.equal(refusal?.code, undefined);
    assert.ok(refusal!.message.length < 4_100);
    assert.match(refusal!.message, /truncated/);
    assert.match(refusal!.message, /must not retry/);
    assert.match(refusal!.message, /Action delivery is unknown; do not retry automatically\.$/);
    assert.equal(parseDriverRefusal({ status: "refused", code: "x".repeat(50_000) })?.code, undefined);
  });

  it("does not revive or replay a refused action based on diagnostic recovery prose", async () => {
    // Transport boundary unit test, not real-driver acceptance evidence.
    const driver = new CuaDriverClient({ session: "unit-session" });
    const calls: string[][] = [];
    const structured = { effect: "refused", delivery: { mode: "unknown" }, route: "trusted_input" };
    const diagnostic = "session recovery via start_session is unavailable; input delivery is unknown";
    const transport = driver as unknown as {
      ensureDaemon(): Promise<void>;
      execDriver(args: string[]): Promise<{ code: number; stdout: string; stderr: string }>;
    };
    transport.ensureDaemon = async () => {};
    transport.execDriver = async (args) => {
      calls.push(args);
      return { code: 1, stderr: "", stdout: JSON.stringify({ isError: true, structuredContent: structured, content: [{ type: "text", text: diagnostic }] }) };
    };
    await assert.rejects(driver.call("browser_pointer", { action: "scroll" }), (error) => {
      assert.ok(error instanceof OpenSkyError);
      assert.equal(error.code, undefined);
      assert.deepEqual(error.details, structured);
      assert.match(error.message, /session recovery/);
      assert.match(error.message, /do not retry automatically/);
      return true;
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0][2], "browser_pointer");
  });

  it("revives only its own named session after exact pre-dispatch admission refusal", async () => {
    const ended = { status: "refused", refusal: { code: "session_ended", message: "The session has ended." } };
    for (const [structured, requestedSession, expectedCalls] of [
      [ended, "unit-session", 3],
      [ended, "other-session", 1],
      [{ ...ended, delivery: { mode: "unknown" } }, "unit-session", 1],
      [{ ...ended, effect: "refused" }, "unit-session", 1],
      [{ status: "refused", refusal: { ...ended.refusal, detail: { delivery: "unknown" } } }, "unit-session", 1],
    ] as const) {
      const driver = new CuaDriverClient({ session: "unit-session" });
      const calls: string[][] = [];
      const transport = driver as unknown as {
        ensureDaemon(): Promise<void>;
        execDriver(args: string[]): Promise<{ code: number; stdout: string; stderr: string }>;
      };
      transport.ensureDaemon = async () => {};
      transport.execDriver = async args => {
        calls.push(args);
        return { code: 0, stderr: "", stdout: JSON.stringify(calls.length === 1 ? structured : { active: true }) };
      };
      const call = driver.call("get_window_state", { session: requestedSession });
      if (expectedCalls === 3) {
        await call;
        assert.equal(calls[1][2], "start_session");
        assert.deepEqual(JSON.parse(calls[1][3]), { session: "unit-session" });
        assert.deepEqual(calls[2], calls[0]);
      } else await assert.rejects(call, OpenSkyError);
      assert.equal(calls.length, expectedCalls);
    }
  });

  it("does not replay after the one permitted session revival itself is refused", async () => {
    const driver = new CuaDriverClient({ session: "unit-session" });
    const calls: string[][] = [];
    const transport = driver as unknown as {
      ensureDaemon(): Promise<void>;
      execDriver(args: string[]): Promise<{ code: number; stdout: string; stderr: string }>;
    };
    transport.ensureDaemon = async () => {};
    transport.execDriver = async args => {
      calls.push(args);
      return { code: 0, stderr: "", stdout: JSON.stringify({ status: "refused", refusal: {
        code: calls.length === 1 ? "session_ended" : "protected_resource_denied", message: "Refused.",
      } }) };
    };
    await assert.rejects(driver.call("get_window_state"), (error: unknown) => error instanceof OpenSkyError && error.code === "protected_resource_denied");
    assert.equal(calls.length, 2);
  });
});
