# opensky

`opensky` is an open implementation of the OpenAI Computer [`@oai/sky`](https://openai.com) API. It is a **library**, an **async Node REPL**, and an **agent skill**. Under the hood it calls [Cua Driver](https://cua.ai/cua-driver) (`cua-driver call …`) instead of the proprietary `@oai/sky` host module.

```js
import { createSky } from "opensky";

const sky = createSky();
const apps = await sky.list_apps();
const before = await sky.get_app_state({ app: "Calculator", disableDiff: true });
await sky.click({ app: "Calculator", element_index: 13 });
const after = await sky.get_app_state({ app: "Calculator" });
```

## Install Cua Driver

`opensky` is a wrapper. The native driver still has to be installed and granted OS permissions.

```bash
/bin/bash -c "$(curl -fsSL https://cua.ai/driver/install.sh)"
```

**macOS** (keep TCC attribution on `CuaDriver.app`):

```bash
open -n -g -a CuaDriver --args serve
cua-driver permissions grant
cua-driver doctor
```

Grant **Accessibility** and **Screen Recording** to `CuaDriver.app`.

**Windows**

```powershell
irm https://cua.ai/driver/install.ps1 | iex
cua-driver autostart kick
```

**Linux** (X11 / XWayland + AT-SPI):

```bash
/bin/bash -c "$(curl -fsSL https://cua.ai/driver/install.sh)"
cua-driver serve
cua-driver doctor
```

## Install the CLI

From this repo:

```bash
bun install
bun src/cli.ts doctor
```

Or with Node, after `npm install` (the `prepare` script builds `dist/`):

```bash
npx opensky doctor
```

Set `CUA_DRIVER_PATH` if the binary is not on `PATH`.

## Add / install the skill

The skill lives at [`skills/opensky/SKILL.md`](skills/opensky/SKILL.md). Agents load it from `.agents/skills`, `.cursor/skills`, `.claude/skills`, or `.codex/skills`.

### Agent Skills CLI (`npx skills add`)

From a checkout of this project:

```bash
# project-level (committed with the repo)
npx skills add . --skill opensky -a cursor -a claude-code -a copilot -y

# user-level (every project on this machine)
npx skills add . --skill opensky -g -y
```

After the repo is on GitHub:

```bash
npx skills add <owner>/opensky --skill opensky -g -y
```

List without installing:

```bash
npx skills add . --list
```

### `opensky skill add` / `opensky skill install`

Copies `skills/opensky` into the local agent directories:

```bash
# project: ./.agents/skills/opensky, ./.cursor/skills/opensky, ...
opensky skill add
opensky skill install

# user: ~/.agents/skills/opensky, ~/.cursor/skills/opensky, ...
opensky skill install --global
opensky skill add -g
```

`skill add` is an alias for `skill install`.

Manual copy:

```bash
mkdir -p .cursor/skills
cp -R skills/opensky .cursor/skills/opensky
```

Then start a new agent session (or `/opensky`) so the skill is picked up.

## Usage

```bash
opensky                  # interactive async REPL  (prompt: opensky>)
opensky eval 'await sky.list_apps()'
opensky eval --json 'return await sky.get_app_state({app:"Calculator", disableDiff:true})'
opensky run script.js
opensky serve            # persist context across evals
opensky stop
opensky doctor
```

The REPL evaluates each snippet as an async function body, so `await` works. A single expression is returned automatically; otherwise `return` the value you want printed.

## `sky` API

Same contract as `@oai/sky`, implemented with Cua Driver:

| Method | Cua Driver tools used |
| --- | --- |
| `list_apps()` | `list_apps` |
| `get_app_state({app, disableDiff?})` | `launch_app` if needed, `list_windows`, `get_window_state` |
| `click` | `click` / `double_click` |
| `drag` | `drag` |
| `paste` | `clipboard_read` / `clipboard_write` + `hotkey` (cmd/ctrl+v), clipboard restored |
| `perform_secondary_action` | `click` `action`, `bring_to_front`, or `press_key` |
| `press_key` | `press_key` / `hotkey` (xdotool-style strings) |
| `scroll` | `scroll` |
| `select_text` | focus + Home/arrows (prefix/suffix disambiguation) |
| `set_value` | `set_value` |
| `type_text` | `type_text` |

`sky.target` is `"mac"`, `"win"`, or `"linux"`.

## Recommended action loop

```js
const before = await sky.get_app_state({
  app: "Calculator",
  disableDiff: true,
});

await sky.click({ app: "Calculator", element_index: 13 });

const after = await sky.get_app_state({ app: "Calculator" });
console.log(after.text);
```

Element indices are snapshots. Some identifiers fail silently. An action can take effect even if a later screenshot capture rejects. Refresh state before retrying.

## Development

Tests are TypeScript and run with [Bun](https://bun.sh) (`bun test`), which executes `src/` directly — no `tsc` step required for the suite.

```bash
curl -fsSL https://bun.sh/install | bash
bun test
```

`npm test` is an alias for `bun test`. `npm run build` still emits the Node-compatible `dist/` used by the published `opensky` bin.

Tests use a mock `cua-driver` so they run without a desktop or TCC grants.
