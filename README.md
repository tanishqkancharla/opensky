# OpenSky

Operate desktop apps and browser tabs from an agent or JavaScript program.
OpenSky provides a TypeScript SDK (`opensky-cua`), a persistent async REPL
(`opensky`), and an [agent skill](skills/opensky/SKILL.md), backed by
[OpenSky Driver](https://github.com/tanishqkancharla/cua), the `main` branch of
our CUA Driver fork.

The preferred `cua` API uses bound app/tab objects: observe the interface, act on
an observed control, then verify the result. It follows the native Computer Use
interaction shape; unsupported capabilities are reported explicitly.

## Install

```sh
npm install -g opensky-cua
opensky doctor
opensky skill install -g
```

Install **OpenSky Driver** from the fork's `main` branch first if `doctor`
reports it missing:

```sh
git clone https://github.com/tanishqkancharla/cua.git
cd cua
bash libs/cua-driver/scripts/install.sh
```

Use `libs/cua-driver/scripts/install.ps1` instead on Windows. The
machine-readable source contract is [driver-source.json](driver-source.json).
Building requires Rust and platform build tools. Automatic fork release
downloads are not available; OpenSky never falls back to upstream CUA Driver.

On macOS, grant Accessibility and Screen Recording to
`/Applications/OpenSkyDriver.app`, displayed as **OpenSky Driver**. Its permission
identity is separate from the upstream app. `doctor` checks the selected binary
and starts the daemon if needed; it does not install a missing build.

Use `OPENSKY_DRIVER_BINARY=/absolute/path/to/opensky-driver` to select a build,
and `OPENSKY_DRIVER_SOCKET` for a non-default daemon socket.
See [runtime configuration](docs/runtime-reference.md) for advanced options.

`skill install -g` copies the skill and references into user-level `.agents`,
`.cursor`, `.claude`, and `.codex` skill directories. Omit `-g` for the current
project. Reload skills or start a new agent session after installing.

## Agent quick start

If the host provides a preloaded `cua_repl` tool, use `cua` directly:

```js
var app = await cua.getApp("App Name");
```

Read the emitted observation, act on its current indices, then observe again.
That host emits observations and screenshots automatically.

For a shell-based agent, start a persistent session in a separate process:

```sh
opensky serve
```

Then execute cells from subsequent shell calls:

```sh
opensky eval 'var app = await cua.getApp("App Name"); await app.getAXState()'
opensky eval 'await app.getAXState()'
opensky stop
```

`serve` retains JavaScript bindings and observation state. Without a live server,
`eval` creates a fresh runtime each time. The CLI prints the last expression;
screenshot bytes require a host image viewer. Use `opensky --help` for commands
and [CLI setup and output](skills/opensky/references/cli.md) for details.

The [skill](skills/opensky/SKILL.md) contains the common method signatures and
interaction rules. It is generic: no application-specific task recipes.
Advanced references are loaded only when needed:

- [Browser tabs and large-page context](skills/opensky/references/browser.md)
- [Text input, selection, and paste](skills/opensky/references/text-input.md)
- [Legacy SDK and explicit native file ownership](skills/opensky/references/legacy-api.md)

## TypeScript / JavaScript SDK

```js
import { createOpenSky, createCua } from "opensky-cua";

const sdk = createOpenSky();
const cua = createCua(sdk);
try {
  const tab = await cua.createBrowserTab("chrome", "https://example.com", {
    visible: false, // omit or use true for an ordinary visible browser window
  });
  console.log(await tab.getAXState());
  await tab.goto("https://example.com/about");
  console.log(await tab.getAXState());
  await tab.close();
} finally {
  await sdk.close();
}
```

Direct SDK users consume returned observations; embedded hosts can provide an
`emit` callback. App objects expose `getAXState`, `getScreenshot`, `click`,
`pressKey`, `typeText`, `setValue`, `selectText`, `paste`, `scroll`, and `drag`.
Tabs add `goto`, `back`, `forward`, `reload`, and exact `close`.
See [runtime integration](docs/runtime-reference.md) for emitters and lifecycle.

App observations follow the active window within the bound process, including
dialogs; actions target the latest observed window. Explicit legacy handles
stay fixed to their window. Browser sessions created by OpenSky are isolated and
owned. `cua.listTabs()` and `getState()` discover the live tabs in every exact
ordinary window reported for running Chrome or Edge processes. Returned IDs are
stable while the OpenSky session and provider tab remain live; `cua.getTab(id)`
acts on that exact tab. Discovered tabs are user-owned, so `tab.close()` refuses
to close them and `sdk.close()` only detaches. A caller can still bind a known
window/tab directly with `cua.attachBrowserTab(...)`. Existing-profile discovery
requires the driver's `existing-profile` grant; OpenSky requests it when starting
its own helper, so restart an older already-running daemon after upgrading.
Coordinates use the latest screenshot's pixels. Native paste is supported
on macOS and Linux X11 with the documented
[text and clipboard restrictions](skills/opensky/references/text-input.md).

## Validation and development

Platform results apply to their recorded source and binary versions. The
[Linux V14 comparison](docs/linux-parity-v14.md) uses SDK
`c69d3b8533ffc860759707737e45dc5578466b23` and driver
[`bd7c5a52253b20a8169d0a9a10437b8a14c68f6a`](https://github.com/tanishqkancharla/cua/tree/bd7c5a52253b20a8169d0a9a10437b8a14c68f6a).
Use those pins to reproduce it; the fork's default branch is not that validated
Linux source. See the [Mac window validation](docs/macos-window-fixes-2026-09-14.md)
for the separate macOS evidence and remaining limitations. A documentation
revision does not constitute a new parity measurement.

Development/evaluation uses Node.js 22.19+:

```sh
npm install
npm run build
npm test
```

The build emits `dist/` for the CLI and SDK. The ordinary test suite includes
contract doubles and replay tapes and does not establish real GUI acceptance.
See [real SDK E2E tests](e2e/README.md), [parity evaluations](evals/parity/README.md),
and [driver follow-ups](docs/driver-followups.md) for behavior-level validation.
Harness findings belong in the [friction ledger](docs/harness-friction.md);
reusable lessons belong in [harness principles](docs/harness-principles.md).
