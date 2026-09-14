# CLI setup and output

Use this reference for shell-based agents. A host that already provides `cua`
does not need a CLI, imports, or installation.

## Setup

```sh
npm install -g opensky-cua
opensky doctor
opensky skill install -g
```

`doctor` checks the selected OpenSky Driver and starts its daemon if needed.
It does not download a missing driver. Build/install from the
[tanishqkancharla/cua fork](https://github.com/tanishqkancharla/cua):
`bash libs/cua-driver/scripts/install.sh` on macOS/Linux, or
`libs/cua-driver/scripts/install.ps1` on Windows. Rust and platform build tools
are required. Upstream Cua Driver is not a supported fallback.
On macOS, Accessibility and Screen Recording belong to
`/Applications/OpenSkyDriver.app` (OpenSky Driver).

## Sessions

| Command | Behavior |
| --- | --- |
| `opensky` / `opensky repl` | Interactive async REPL |
| `opensky serve` | Persistent local session; leave running in its own process |
| `opensky eval '<code>'` / `opensky -e '<code>'` | Reuse a live server, otherwise create a fresh runtime |
| `opensky run script.js` | Standalone async script; never reuse a server |
| `opensky stop` | Stop the server and clean up its owned browser sessions |
| `opensky skill install` | Copy this entire skill, including references, to project agent directories |
| `opensky skill install -g` | Copy to user agent directories instead |

Default skill destinations are `.agents/skills`, `.cursor/skills`,
`.claude/skills`, and `.codex/skills`. `skill add` aliases `skill install`.
`skill uninstall` removes installed copies in the selected scope.

```sh
# Keep running in a separate process for multi-turn work:
opensky serve
# Then, in subsequent calls:
opensky eval 'var app = await cua.getApp("App Name"); await app.getAXState()'
opensky eval 'await app.getAXState()'
```

`await`, the last expression, explicit `return`, and `console.log` work.
Top-level variables/functions/classes persist in the session. Even declarations
written with `const` are mutable session bindings; reassignment/redeclaration
can emit an advisory warning. Nested scopes retain normal JavaScript semantics.

Preloaded globals: `cua`, legacy `opensky`, `state`, `sleep(ms)`, `readFile`,
`pathToFileURL`, and low-level `driver`. Use `cua` for ordinary GUI work.

## Output

Unlike a preloaded observation tool, the CLI does not automatically attach
images or print the initial state emitted internally by `getApp`. End the cell
with `await app.getAXState()` to print its outline.
`--json` returns `{ok, value, logs, error?}`. Console logs are also printed before
that JSON; avoid logging when a consumer expects a single JSON document.

`getScreenshot()` returns image bytes, not a rendered shell image. To obtain a
file URL for a host image viewer, the legacy observation supports:

```js
var shot = await opensky.get_app_state({app: "App Name", scope: "app", includeScreenshot: true});
shot.screenshot // {url: "file:///…", width, height, …}, or null
```

Display that actual file through the host's image facility. Its indices belong
to that legacy observation; observe through your bound `app` before continuing
facade actions. A preloaded `cua_repl` host emits screenshots itself; use its
provided output helpers only if explicit output is needed.

## Configuration

- `--home <dir>` / `OPENSKY_HOME`: session state, default `~/.opensky`. Use the
  same home for server and clients; separate homes give independent sessions.
- `--no-serve`: use a fresh runtime even if a server exists.
- `--driver <path>` / `OPENSKY_DRIVER_BINARY`: select an OpenSky Driver build.
- `OPENSKY_DRIVER_APP_PATH`: select a macOS app bundle.
- `--socket <path>` / `OPENSKY_DRIVER_SOCKET`: connect to a selected daemon.
- `--transport cli|mcp`: internal driver transport; CLI is default, MCP experimental.
  An explicit transport refuses to reuse an existing REPL server.

The server listens on localhost and authenticates with `repl.json` (mode 0600).
The CLI reads its token automatically. This is a trusted local REPL, not a
sandbox for hostile JavaScript. Stop only a server you own; it may contain
another caller's bindings and browser sessions.
