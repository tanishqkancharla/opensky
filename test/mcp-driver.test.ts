import assert from "node:assert/strict";
import { chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { before, describe, it } from "node:test";

import { OpenSkyError } from "../src/errors.js";
import { StdioMcpDriverClient } from "../src/mcp-driver.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "fixtures", "mcp-driver-fixture.mjs");

// These subprocesses are protocol fixtures only, never real-driver/GUI acceptance.
describe("persistent stdio MCP driver", () => {
  before(async () => chmod(fixture, 0o755));

  function client(
    mode = "normal",
    options: ConstructorParameters<typeof StdioMcpDriverClient>[0] = {},
  ) {
    return new StdioMcpDriverClient({
      binaryPath: fixture,
      autoInstall: false,
      target: "mac",
      timeoutMs: 1_000,
      handshakeTimeoutMs: 1_000,
      closeTimeoutMs: 500,
      killTimeoutMs: 500,
      env: { ...process.env, MCP_FIXTURE_MODE: mode },
      ...options,
    });
  }

  it("uses topology-preserving argv and requires an explicit non-mac socket", async () => {
    const mac = client("normal", {
      env: { ...process.env, MCP_FIXTURE_MODE: "normal", EXPECT_MCP_ARGS: JSON.stringify(["mcp"]) },
    });
    assert.equal((await mac.call("echo")).structured instanceof Object, true);
    assert.equal((await mac.closeTransport()).verified, true);

    const linux = client("normal", {
      target: "linux",
      socket: "/tmp/fixture-cua.sock",
      env: {
        ...process.env,
        MCP_FIXTURE_MODE: "normal",
        EXPECT_MCP_ARGS: JSON.stringify(["--socket", "/tmp/fixture-cua.sock", "mcp"]),
      },
    });
    await linux.call("echo");
    assert.equal((await linux.closeTransport()).verified, true);

    const envSocket = client("normal", {
      target: "linux",
      env: {
        ...process.env,
        CUA_DRIVER_SOCKET: "/tmp/fixture-env-cua.sock",
        MCP_FIXTURE_MODE: "normal",
        EXPECT_MCP_ARGS: JSON.stringify(["--socket", "/tmp/fixture-env-cua.sock", "mcp"]),
      },
    });
    await envSocket.call("echo");
    assert.equal((await envSocket.closeTransport()).verified, true);

    const unsafe = client("normal", { target: "linux" });
    await assert.rejects(unsafe.call("echo"), (error: unknown) =>
      error instanceof OpenSkyError && error.code === "mcp_socket_required");
    assert.equal((await unsafe.closeTransport()).verified, true);

    for (const options of [
      { target: "other" },
      { timeoutMs: 0 },
      { handshakeTimeoutMs: Number.NaN },
      { drainTimeoutMs: -1 },
      { closeTimeoutMs: 1.5 },
      { killTimeoutMs: Number.MAX_SAFE_INTEGER + 1 },
      { maxPendingCalls: 0 },
      { socket: "" },
    ]) {
      assert.throws(() => client("normal", options as never), TypeError);
    }
  });

  it("performs the handshake, accepts split frames/notifications, and serializes calls", async () => {
    for (const mode of ["split", "notification"]) {
      const driver = client(mode);
      const first = driver.call("echo", { ordinal: 1 });
      const second = driver.call("echo", { ordinal: 2 });
      assert.deepEqual((await first).structured, { ok: true, name: "echo", args: { ordinal: 1 }, sequence: 1 });
      assert.deepEqual((await second).structured, { ok: true, name: "echo", args: { ordinal: 2 }, sequence: 2 });
      assert.equal((await driver.closeTransport()).verified, true);
    }
  });

  it("bounds admission before retaining args and snapshots queued JSON at admission", async () => {
    const driver = client("delay", { timeoutMs: 100, maxPendingCalls: 2 });
    const first = driver.call("echo", { ordinal: 1 });
    const mutable = { ordinal: 2, nested: { value: "original" } };
    const second = driver.call("echo", mutable);
    mutable.nested.value = "mutated";

    let getterCalls = 0;
    const excess = Object.defineProperty({}, "private", {
      enumerable: true,
      get() { getterCalls += 1; return "not retained"; },
    });
    await assert.rejects(driver.call("echo", excess), (error: unknown) =>
      error instanceof OpenSkyError && error.code === "mcp_pending_limit");
    assert.equal(getterCalls, 0);

    assert.deepEqual((await first).structured, { ok: true, name: "echo", args: { ordinal: 1 }, sequence: 1 });
    // This call spends longer than timeoutMs waiting in the queue, but its own
    // dispatch completes within timeoutMs. The timeout is deliberately per dispatch.
    assert.deepEqual((await second).structured, {
      ok: true,
      name: "echo",
      args: { ordinal: 2, nested: { value: "original" } },
      sequence: 2,
    });
    assert.equal((await driver.closeTransport()).verified, true);

    const bounded = client("normal", { maxLineBytes: 512 });
    await assert.rejects(bounded.call("echo", { huge: "x".repeat(1_000) }), (error: unknown) =>
      error instanceof OpenSkyError && error.code === "mcp_request_too_large");
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    await assert.rejects(bounded.call("echo", cyclic), (error: unknown) =>
      error instanceof OpenSkyError && error.code === "mcp_invalid_arguments");
    assert.equal((await bounded.closeTransport()).verified, true);
  });

  it("preserves the complete CallToolResult envelope including images", async () => {
    const driver = client();
    const result = await driver.call("image");
    assert.deepEqual(result.structured, { ok: true, sequence: 1 });
    assert.equal(result.text, "visible text");
    assert.deepEqual(result.raw, {
      content: [
        { type: "text", text: "visible text" },
        { type: "image", data: "AQID", mimeType: "image/png" },
      ],
      structuredContent: { ok: true, sequence: 1 },
      isError: false,
    });
    assert.equal((await driver.closeTransport()).verified, true);

    const unavailable = client();
    await assert.rejects(unavailable.call("not-advertised"), (error: unknown) =>
      error instanceof OpenSkyError && error.code === "mcp_tool_unavailable");
    const unavailableClose = await unavailable.closeTransport();
    assert.doesNotMatch(unavailableClose.stderrTail, /CALL not-advertised/);
    assert.equal(unavailableClose.verified, true);
  });

  it("revives only an exact own pre-dispatch session refusal", async () => {
    const exact = client("ended-once", { session: "owned-session" });
    const result = await exact.call("echo");
    assert.deepEqual(result.structured, {
      ok: true,
      name: "echo",
      args: { session: "owned-session" },
      sequence: 3,
    });
    const exactClose = await exact.closeTransport();
    assert.equal((exactClose.stderrTail.match(/CALL /g) ?? []).length, 3);
    assert.match(exactClose.stderrTail, /CALL start_session/);

    const prose = client("prose-ended", { session: "owned-session" });
    await assert.rejects(prose.call("echo"), (error: unknown) =>
      error instanceof OpenSkyError && /do not retry automatically/.test(error.message));
    const proseClose = await prose.closeTransport();
    assert.equal((proseClose.stderrTail.match(/CALL /g) ?? []).length, 1);
    assert.doesNotMatch(proseClose.stderrTail, /CALL start_session/);

    const foreign = client("ended-once", { session: "owned-session" });
    await assert.rejects(foreign.call("echo", { session: "foreign-session" }), (error: unknown) =>
      error instanceof OpenSkyError && error.code === "session_ended");
    const foreignClose = await foreign.closeTransport();
    assert.equal((foreignClose.stderrTail.match(/CALL /g) ?? []).length, 1);
    assert.doesNotMatch(foreignClose.stderrTail, /CALL start_session/);
  });

  it("closes admission synchronously, drains an admitted call, and exits cleanly", async () => {
    const driver = client("delay");
    await driver.call("echo", { warmup: true });
    const admitted = driver.call("echo", { held: true });
    await new Promise<void>(resolve => setImmediate(resolve));
    const queued = driver.call("echo", { queued: true });
    const closing = driver.closeTransport();
    await assert.rejects(driver.call("echo"), (error: unknown) =>
      error instanceof OpenSkyError && error.code === "mcp_transport_closed");
    assert.deepEqual((await admitted).structured, { ok: true, name: "echo", args: { held: true }, sequence: 2 });
    await assert.rejects(queued, (error: unknown) =>
      error instanceof OpenSkyError && error.code === "mcp_transport_closed");
    const receipt = await closing;
    assert.equal(receipt.callsDrained, true);
    assert.equal(receipt.stdinClosed, true);
    assert.equal(receipt.exited, true);
    assert.equal(receipt.forced, false);
    assert.equal(receipt.verified, true);
    assert.deepEqual(await driver.closeTransport(), receipt);
  });

  it("quarantines timeout, EOF, malformed, mismatched, and oversized outcomes without replay", async () => {
    const cases = [
      ["timeout", { timeoutMs: 80 }],
      ["eof", {}],
      ["malformed-json", {}],
      ["mismatched-id", {}],
      ["oversized", { maxLineBytes: 512 }],
      ["malformed-call-result", {}],
      ["both-result-error", {}],
      ["malformed-error", {}],
      ["stubborn-malformed", { killTimeoutMs: 40 }],
    ] as const;
    for (const [mode, options] of cases) {
      const driver = client(mode, options);
      await assert.rejects(driver.call("echo"), OpenSkyError, mode);
      await assert.rejects(driver.call("echo"), (error: unknown) =>
        error instanceof OpenSkyError && error.code === "mcp_transport_quarantined");
      const receipt = await driver.closeTransport();
      assert.equal(receipt.verified, false, mode);
      assert.equal((receipt.stderrTail.match(/CALL echo/g) ?? []).length, 1, mode);
      if (mode === "stubborn-malformed") {
        assert.equal(receipt.exited, true);
        assert.equal(receipt.signal, "SIGKILL");
      }
    }
  });

  it("keeps JSON-RPC transport errors distinct and stderr bounded", async () => {
    const rpc = client("rpc-error");
    await assert.rejects(rpc.call("echo"), (error: unknown) => {
      assert.ok(error instanceof OpenSkyError);
      assert.equal(error.code, "mcp_json_rpc_error");
      assert.deepEqual(error.details, {
        rpcCode: -32603,
        message: "proxy transport unavailable",
        delivery: "unknown",
      });
      assert.doesNotMatch(JSON.stringify(error.details), /private detail/);
      return true;
    });
    assert.equal((await rpc.closeTransport()).verified, false);

    const noisy = client("stderr", { maxStderrBytes: 128 });
    await noisy.call("echo");
    const receipt = await noisy.closeTransport();
    assert.ok(Buffer.byteLength(receipt.stderrTail) <= 128);
    assert.equal(receipt.verified, true);
  });

  it("fails malformed handshake and forced close as not proven", async () => {
    for (const [mode, message] of [
      ["malformed-handshake", /malformed MCP initialize/],
      ["unsupported-version", /malformed MCP initialize/],
      ["missing-capabilities", /malformed MCP initialize/],
      ["malformed-tools", /malformed MCP tools\/list/],
    ] as const) {
      const malformed = client(mode);
      await assert.rejects(malformed.call("echo"), message);
      assert.equal((await malformed.closeTransport()).verified, false);
    }

    const hung = client("stubborn-close", { closeTimeoutMs: 40, killTimeoutMs: 40 });
    await hung.call("echo");
    const receipt = await hung.closeTransport();
    assert.equal(receipt.exited, true);
    assert.equal(receipt.forced, true);
    assert.equal(receipt.verified, false);
  });

  it("bounds the admitted-call drain and quarantines rather than dispatching queued work", async () => {
    const driver = client("timeout-second", { timeoutMs: 5_000, drainTimeoutMs: 40, closeTimeoutMs: 40, killTimeoutMs: 100 });
    await driver.call("echo", { warmup: true });
    const active = driver.call("echo");
    await new Promise<void>(resolve => setImmediate(resolve));
    const queued = driver.call("echo", { queued: true });
    const before = Date.now();
    const receipt = await driver.closeTransport();
    assert.ok(Date.now() - before < 1_000);
    await assert.rejects(active, OpenSkyError);
    await assert.rejects(queued, OpenSkyError);
    assert.equal(receipt.callsDrained, false);
    assert.equal(receipt.forced, true);
    assert.equal(receipt.verified, false);
    assert.equal((receipt.stderrTail.match(/CALL echo/g) ?? []).length, 2);
  });

  it("rejects helper APIs after close and never spawns MCP after a readiness timeout", async () => {
    const closed = client();
    assert.equal((await closed.closeTransport()).verified, true);
    await assert.rejects(closed.status(), (error: unknown) =>
      error instanceof OpenSkyError && error.code === "mcp_transport_closed");
    await assert.rejects(closed.ensureDaemon(), (error: unknown) =>
      error instanceof OpenSkyError && error.code === "mcp_transport_closed");

    const late = client("slow-status", { drainTimeoutMs: 30, closeTimeoutMs: 30, killTimeoutMs: 30 });
    const call = late.call("echo");
    await new Promise<void>(resolve => setImmediate(resolve));
    const receipt = await late.closeTransport();
    assert.equal(receipt.callsDrained, false);
    assert.equal(receipt.verified, false);
    await assert.rejects(call, (error: unknown) =>
      error instanceof OpenSkyError && error.code === "mcp_transport_quarantined");
    assert.equal((late as unknown as { child?: unknown }).child, undefined);
  });
});
