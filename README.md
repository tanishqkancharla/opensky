# ccua

`ccua` is a computer-use **skill** plus a **CLI that wraps the Node REPL with top-level await**. Inside the REPL, `sky` implements the OpenAI Computer [`@oai/sky`](https://openai.com) API, backed by the [Cua Driver](https://cua.ai/cua-driver) CLI (`cua-driver call …`) instead of the proprietary `@oai/sky` host module.

```js
const apps = await sky.list_apps();
const before = await sky.get_app_state({ app: "Calculator", disableDiff: true });
await sky.click({ app: "Calculator", element_index: 13 });
const after = await sky.get_app_state({ app: "Calculator" });
```

## Install Cua Driver

`ccua` is a wrapper. The native driver still has to be installed and granted OS permissions.

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
npm install
npm run build
npm link
```

Or run it without linking:

```bash
bun src/cli.ts doctor
# or, after build:
node dist/cli.js doctor
```

Set `CUA_DRIVER_PATH` if the binary is not on `PATH`.

## Add / install the skill

The skill lives at [`skills/ccua/SKILL.md`](skills/ccua/SKILL.md). Agents load it from `.agents/skills`, `.cursor/skills`, `.claude/skills`, or `.codex/skills`.

### Agent Skills CLI (`npx skills add`)

From a checkout of this project:

```bash
# project-level (committed with the repo)
npx skills add . --skill ccua -a cursor -a claude-code -a copilot -y

# user-level (every project on this machine)
npx skills add . --skill ccua -g -y
```

After the repo is on GitHub:

```bash
npx skills add <owner>/ccua --skill ccua -g -y
```

List without installing:

```bash
npx skills add . --list
```

### `ccua skill add` / `ccua skill install`

Copies `skills/ccua` into the local agent directories:

```bash
# project: ./.agents/skills/ccua, ./.cursor/skills/ccua, ...
ccua skill add
ccua skill install

# user: ~/.agents/skills/ccua, ~/.cursor/skills/ccua, ...
ccua skill install --global
ccua skill add -g
```

`skill add` is an alias for `skill install`.

Manual copy:

```bash
mkdir -p .cursor/skills
cp -R skills/ccua .cursor/skills/ccua
```

Then start a new agent session (or `/ccua`) so the skill is picked up.

## Usage

```bash
ccua                  # interactive async REPL  (prompt: ccua>)
ccua eval 'await sky.list_apps()'
ccua eval --json 'return await sky.get_app_state({app:"Calculator", disableDiff:true})'
ccua run script.js
ccua serve            # persist context across evals
ccua stop
ccua doctor
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

Library use (same process, no CLI):

```js
import { createSky } from "ccua";

const sky = createSky();
await sky.list_apps();
```

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

`npm test` is an alias for `bun test`. `npm run build` still emits the Node-compatible `dist/` used by the published `ccua` bin.

Tests use a mock `cua-driver` so they run without a desktop or TCC grants.
