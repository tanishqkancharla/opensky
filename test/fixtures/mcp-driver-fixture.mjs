#!/usr/bin/env node

if (process.argv.slice(2).join(" ") === "--version") {
  process.stdout.write("opensky-driver fixture\n");
  process.exit(0);
}

if (process.argv.slice(2).join(" ") === "--opensky-driver-identity") {
  process.stdout.write(JSON.stringify({product: "opensky-driver", protocolVersion: 1}) + "\n");
  process.exit(0);
}

// Inert newline-delimited JSON-RPC fixture. It never loads or contacts Cua.
const argv = process.argv.slice(2);
const mode = process.env.MCP_FIXTURE_MODE ?? "normal";
if (!argv.includes("mcp")) {
  if (argv.includes("status")) {
    if (process.env.EXPECT_STATUS_ARGS && JSON.stringify(argv) !== process.env.EXPECT_STATUS_ARGS) {
      process.stderr.write("unexpected status socket arguments\n");
      process.exit(65);
    }
    if (mode === "slow-status") await new Promise(resolve => setTimeout(resolve, 120));
    process.stdout.write("fixture running\n");
    process.exit(0);
  }
  process.stderr.write(`unexpected fixture command: ${JSON.stringify(argv)}\n`);
  process.exit(64);
}

const expectedArgs = process.env.EXPECT_MCP_ARGS;
if (expectedArgs && JSON.stringify(argv) !== expectedArgs) {
  process.stderr.write(`mcp argv mismatch: ${JSON.stringify(argv)}\n`);
  process.exit(65);
}

let input = "";
let toolCalls = 0;
let endedOnce = false;
if (mode === "hang-close" || mode.startsWith("stubborn-")) setInterval(() => {}, 60_000);
if (mode.startsWith("stubborn-")) process.on("SIGTERM", () => {});

process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  input += chunk;
  for (;;) {
    const newline = input.indexOf("\n");
    if (newline < 0) break;
    const line = input.slice(0, newline);
    input = input.slice(newline + 1);
    if (line.trim()) handle(JSON.parse(line));
  }
});

function send(value) {
  const line = `${JSON.stringify(value)}\n`;
  if (mode === "split") {
    const middle = Math.max(1, Math.floor(line.length / 2));
    process.stdout.write(line.slice(0, middle));
    setTimeout(() => process.stdout.write(line.slice(middle)), 5);
    return;
  }
  if (mode === "notification") {
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/progress", params: {} })}\n${line}`);
    return;
  }
  process.stdout.write(line);
}

function toolResult(structuredContent, text = JSON.stringify(structuredContent), isError = false, extraContent = []) {
  return {
    content: [{ type: "text", text }, ...extraContent],
    structuredContent,
    isError,
  };
}

function handle(request) {
  if (request.method === "initialize") {
    if (mode === "malformed-handshake") {
      send({ jsonrpc: "2.0", id: request.id, result: { protocolVersion: 7 } });
      return;
    }
    send({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: mode === "unsupported-version" ? "1900-01-01" : "2025-06-18",
        capabilities: mode === "missing-capabilities" ? {} : { tools: {} },
        serverInfo: { name: "opensky-driver", version: "fixture" },
      },
    });
    return;
  }
  if (request.method === "notifications/initialized") return;
  if (request.method === "tools/list") {
    if (mode === "malformed-tools") {
      send({ jsonrpc: "2.0", id: request.id, result: { tools: [{ name: 7 }] } });
      return;
    }
    send({
      jsonrpc: "2.0",
      id: request.id,
      result: { tools: ["echo", "image", "start_session"].map(name => ({ name, inputSchema: { type: "object" } })) },
    });
    return;
  }
  if (request.method !== "tools/call") {
    send({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "not found" } });
    return;
  }

  toolCalls += 1;
  const name = request.params?.name;
  const args = request.params?.arguments ?? {};
  process.stderr.write(`CALL ${name}\n`);
  if (mode === "timeout" || (mode === "timeout-second" && toolCalls > 1)) return;
  if (mode === "eof") {
    process.exit(0);
    return;
  }
  if (mode === "mismatched-id") {
    send({ jsonrpc: "2.0", id: request.id + 1, result: toolResult({ ok: true }) });
    return;
  }
  if (mode === "malformed-json" || mode === "stubborn-malformed") {
    process.stdout.write("{not-json}\n");
    return;
  }
  if (mode === "oversized") {
    send({ jsonrpc: "2.0", id: request.id, result: toolResult({ value: "x".repeat(8_192) }) });
    return;
  }
  if (mode === "rpc-error") {
    send({ jsonrpc: "2.0", id: request.id, error: { code: -32603, message: "proxy transport unavailable", data: "private detail" } });
    return;
  }
  if (mode === "malformed-error") {
    send({ jsonrpc: "2.0", id: request.id, error: { code: "-32603", message: 7 } });
    return;
  }
  if (mode === "both-result-error") {
    send({ jsonrpc: "2.0", id: request.id, result: toolResult({ ok: true }), error: null });
    return;
  }
  if (mode === "malformed-call-result") {
    send({ jsonrpc: "2.0", id: request.id, result: { ok: true } });
    return;
  }
  if (mode === "stderr") process.stderr.write("s".repeat(32_000));

  const reply = () => {
    if (mode === "ended-once" && name === "echo" && !endedOnce) {
      endedOnce = true;
      send({ jsonrpc: "2.0", id: request.id, result: toolResult({
        status: "refused",
        refusal: { code: "session_ended", message: "The session ended." },
      }, "The session ended.", true) });
      return;
    }
    if (mode === "prose-ended" && name === "echo") {
      send({ jsonrpc: "2.0", id: request.id, result: toolResult(
        { effect: "refused", delivery: { mode: "unknown" } },
        "session ended; call start_session to revive",
        true,
      ) });
      return;
    }
    if (name === "image") {
      send({ jsonrpc: "2.0", id: request.id, result: toolResult(
        { ok: true, sequence: toolCalls },
        "visible text",
        false,
        [{ type: "image", data: "AQID", mimeType: "image/png" }],
      ) });
      return;
    }
    send({ jsonrpc: "2.0", id: request.id, result: toolResult({ ok: true, name, args, sequence: toolCalls }) });
  };
  if (mode === "delay") setTimeout(reply, 80);
  else reply();
}
