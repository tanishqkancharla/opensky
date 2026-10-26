# Static tool contract cache — OpenSky 0.2.47

## Change and supported API

Driver `9b44434c09c6fae60948266ea8a78683049b7e28` caches the compiled tool manifest and shared ActionResult schema once per process. Public manifest/tool lookup APIs still return owned copies. The cache contains type metadata; action results, input data and user/session state are not cached by this change.

This is an authorship-preserving port of Georgios Konstantopoulos's [upstream#5977](https://github.com/trycua/cua/pull/5977), commit `6a48bfc0ade6d8226e7d0866eeafc3dde40a235b`. It retains the fork's existing validator/index caches and native behavior.

## Local protocol measurement

Seven randomized-order paired trials use same-profile Mac arm64 release binaries, base `5f5c17bbc2a9f8c6260d151ec734b86fab164ae8` and candidate 9b44434c. Each process receives only initialize and two tools/list requests, then stdin EOF. No tools/call or desktop action is sent.

| Measurement | Before | After |
| --- | ---: | ---: |
| Median process startup through first tool listing |64.12ms|10.52ms|
| Tools listed |66|66|
| Canonical tool definitions |identical|identical|

That is 83.6% lower startup time **in this local protocol measurement**. Timing includes process creation, initialization and the first tools/list response. It is not an agent-task speed, cost, context or parity-score result. All 17 processes (three initial baseline plus fourteen paired processes) exited unforced. Canonical tools-list SHA256 is `ba65b82eed202e5c41433c31cd6c4edfc30cc56e52b43fd287795f63806e46b7`.

The measured interface is newline-delimited JSON-RPC over `opensky-driver mcp --direct --no-overlay`:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
{"jsonrpc":"2.0","id":3,"method":"tools/list","params":{}}
```

Direct mode is used here for isolated metadata measurement. Normal Mac SDK startup continues to use the trusted app daemon for TCC attribution. [Exact environment, pins, paired timings, contract hashes and application evidence](manifest-cache102.json).

## Regression and release qualification

- Existing 68 contract and 1159 Mac core tests pass before and after the port.
- [Three-platform run40320069274](https://github.com/tanishqkancharla/cua/actions/runs/40320069274) passes whole build/unit suites. Full public CLI/MCP contract exports match the previous5f baseline on Linux, Mac and Windows. Platform tests:728 Linux,711 Mac,305 Windows.
- [Bookworm build/consumer40320077687](https://github.com/tanishqkancharla/opensky/actions/runs/40320077687), SDK `76e2a2528ace782acaab5001717fe4015c40ba29`, validates the extracted source/hash-pinned archive under Node 22, ordinary UID 1001, TigerVNC/XFWM4 and shared D-Bus/AT-SPI, using bounded grants.275 embedded contracts,728 Linux units and 3 TLS owners pass.
- Actual native paste saves exact ASCII/Unicode bytes; partial delivery stays unknown; typing continues from 49 visible codepoints at the deadline to all 1,000 saved before conflicting work starts. Queued cancellation, completion/drain, strict bridge and replacement binding pass.
- GTK buttons, popup/keyboard, separately selected capture-bound foreground pixel input, consumed-capture/stale-popup refusals and exact native_focus_unavailable refusal pass. Unicode remains49UTF8 bytes with zero submission. Every owned supervisor exits unforced.
- The stable-signed local Mac build retains Accessibility/Screen Recording and actual 250/50ms observation settings. SDK read-only capture binds the original Calendar PID 84295/window 54774; WindowServer health passes. This is read-only scope, not new Mac input/full-source acceptance.

## Limits

No new API signatures, tool payloads or native input behavior are introduced by the cache. GTK semantic ref focus, Mac19/66, sandboxed Bookworm Chrome, Windows GUI and Wayland remain unresolved or unqualified as previously documented. Paid benchmark admission remains closed; no agent arms or score rows were added. The separate upstream post_action_wait option is not part of this release.
