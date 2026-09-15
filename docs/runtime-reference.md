# Runtime integration

Read this when embedding OpenSky or configuring its driver transport. For agent
interaction, start with the [skill](../skills/opensky/SKILL.md).

## Embedded host output

Create the facade with `createCua(sdk, {emit})` to receive observation output.
Without an emitter, consume returned values explicitly. Strict `cua_repl` hosts
can use `createNodeReplOutput` / `installNodeReplOutput` to provide
`nodeRepl.write(value)` and `nodeRepl.emitImage(bytesOrDataUrl)`. The ordinary
CLI uses expression/log output, not automatic image attachments.

## Driver transport

`createOpenSky()` still defaults to the one-shot CLI transport. To try the
persistent stdio transport against the existing signed daemon:

```js
const opensky = createOpenSky({
  transport: "mcp",
  driverOptions: { autoInstall: false, autoStart: false },
});
try {
  console.log(await opensky.list_apps());
} finally {
  await opensky.close();
}
```

The equivalent one-shot CLI invocation is
`opensky --no-serve --transport mcp eval 'await opensky.list_apps()'`.
An explicit transport flag refuses to reuse an already-running REPL server;
it does not silently change that server's transport.
Windows/Linux require an explicit `driverOptions.socket`, `OPENSKY_DRIVER_SOCKET`,
or legacy `CUA_DRIVER_SOCKET`;
OpenSky never switches to a direct, in-process driver to make MCP work.
Cross-platform, crash-recovery, and new-user GUI acceptance remain incomplete,
so this is not a default change or parity claim.

Each instance uses its own base session by default. `close()` immediately rejects
new operations, drains admitted work, ends exact owned sessions, and only then
closes its internally created MCP proxy. Its `transportCloseReceipt` describes
process exit, not independent proof that a target disappeared. If cleanup fails,
retain the home/leases and inspect the error; a retry may finish cleanup, but never
reopens normal operations. The default library drain limit is 30 seconds, tunable
with `drainTimeoutMs`. A drain timeout does not schedule a late finalizer.

An injected `driver` is caller-owned: OpenSky never closes its transport. Close
every consumer before calling `StdioMcpDriverClient.closeTransport()` yourself.
Do not combine injection with `transport` or `driverOptions`. Advanced MCP options
bound queued/admitted work (64), frames (32 MiB), and shutdown. Ordinary driver
calls in both CLI and MCP transports wait for completion by default; set
`driverOptions.timeoutMs` to a positive integer to opt into a deadline, or
`null` to explicitly leave it uncapped. Lifecycle checks remain bounded. Explicit
timeouts, malformed replies, and lost connections quarantine the client without
replaying unknown-delivery calls. Low-level `invoke`/`driver.call` with explicit
session labels are trusted escape hatches, not a sandbox for untrusted consumers.


## Browser cleanup ownership

Owned browser sessions have private lease records under
`OPENSKY_HOME/browser-session-leases/`. Concurrent live runtimes do not reap each
other's sessions. CLI crash recovery requires evidence that the recorded owner
process is gone; uncertain liveness or PID reuse preserves the lease. An MCP
proxy cannot adopt another proxy's session. Failed or unconfirmed teardown keeps
the lease for exact retry. A confirmed cleanup receipt names that same session
and reports it inactive. Session aliases remain last-writer-wins; use independent
homes for concurrent runtimes that require persistent target discovery.

## REPL integration

Top-level declarations persist across cells, including variables written with
`const`; reassignment/redeclaration can emit an advisory warning. Nested scopes
retain lexical semantics. `globalThis` and `__openskyLogs` are reserved declaration
names. Strict evaluator mode requires VM microtask draining: unsupported runtimes
are rejected before cell admission. Use Node.js 22.19+ for development/evaluation.
Ordinary CLI REPL execution also works under Bun.

## Driver selection

OpenSky Driver is built from the `main` branch of `tanishqkancharla/cua`.
The source relationship is recorded in `driver-source.json` at the repository
root so local tooling does not have to infer it from the remote URL.

Binary selection precedence is `--driver` / `driverOptions.binaryPath`,
`OPENSKY_DRIVER_BINARY`, `OPENSKY_DRIVER`, then legacy `CUA_DRIVER_BINARY` /
`CUA_DRIVER_PATH`. Explicit missing selections fail without a PATH fallback.
Builds must report OpenSky Driver identity; upstream binaries are not accepted.
`OPENSKY_DRIVER_APP_PATH` selects a macOS bundle when no binary override is set.
For a socket use `--socket`, `driverOptions.socket`, or `OPENSKY_DRIVER_SOCKET`
(legacy `CUA_DRIVER_SOCKET`). `OpenSkyDriverClient` / `OpenSkyDriverOptions` are
the current exports; `CuaDriverClient` remains a compatibility alias.
`autoInstall` remains accepted but does not download a helper.
