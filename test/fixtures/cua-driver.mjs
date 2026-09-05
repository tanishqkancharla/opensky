#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const statePath = process.env.CUA_MOCK_STATE;
const logPath = process.env.CUA_MOCK_LOG;

if (!statePath) {
  process.stderr.write("CUA_MOCK_STATE is required for the mock cua-driver\n");
  process.exit(1);
}

const argv = process.argv.slice(2).filter((item) => item !== "--socket" && !item.startsWith("/tmp/"));
const command = parseCommand(argv);

const state = await loadState();
await appendLog({ argv, command });

try {
  const result = await dispatch(command, state);
  await saveState(state);
  if (result !== undefined) {
    process.stdout.write(`${typeof result === "string" ? result : JSON.stringify(result)}\n`);
  }
  process.exit(0);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  await saveState(state);
  process.stdout.write(`${JSON.stringify({ isError: true, content: [{ type: "text", text: message }] })}\n`);
  process.exit(1);
}

function parseCommand(args) {
  if (args[0] === "status") return { type: "status" };
  if (args[0] === "serve") return { type: "serve" };
  if (args[0] === "stop") return { type: "stop" };
  if (args[0] === "call") {
    const rest = args.slice(1).filter((item) => item !== "--raw" && item !== "--compact");
    return { type: "call", tool: rest[0], args: parseJson(rest[1] ?? "{}") };
  }
  if (args[0] && !args[0].startsWith("-")) {
    return { type: "call", tool: args[0], args: parseJson(args[1] ?? "{}") };
  }
  throw new Error(`unsupported mock argv: ${args.join(" ")}`);
}

async function dispatch(command, state) {
  if (command.type === "status") {
    process.stdout.write("running\n");
    return undefined;
  }
  if (command.type === "serve" || command.type === "stop") {
    return "ok";
  }
  const { tool, args } = command;
  state.calls.push({ tool, args });
  if (tool === "start_session") {
    state.sessionEnded = false;
    return envelope({ active: true, revived: true, session: args.session });
  }
  if (state.sessionEnded) {
    throw new Error(`session '${args.session}' has ended; call start_session to revive it`);
  }
  switch (tool) {
    case "end_session":
      state.sessionEnded = true;
      return envelope({ session: args.session, active: false });
    case "list_apps":
      return envelope({ apps: state.apps });
    case "launch_app":
      return envelope(launchApp(state, args));
    case "list_windows":
      return envelope({ windows: windowsFor(state, args.pid) });
    case "close_window":
      return envelope(closeWindow(state, args));
    case "get_window_state":
      return envelope(await getWindowState(state, args));
    case "click":
    case "double_click":
    case "right_click":
      return envelope(click(state, args, tool));
    case "drag":
      return envelope(drag(state, args));
    case "type_text":
      return envelope(typeText(state, args));
    case "press_key":
    case "hotkey":
      return envelope(press(state, args, tool));
    case "set_value":
      return envelope(setValue(state, args));
    case "scroll":
      return envelope(scroll(state, args));
    case "clipboard_read":
      return envelope({
        text: state.clipboard,
        html: state.clipboardHtml,
        markdown: state.clipboardMarkdown,
        types: [
          "public.utf8-plain-text",
          ...(state.clipboardHtml ? ["public.html"] : []),
          ...(state.clipboardMarkdown ? ["public.markdown"] : []),
        ],
      });
    case "clipboard_write":
      state.clipboard = String(args.text ?? "");
      state.clipboardHtml = args.html;
      state.clipboardMarkdown = args.markdown;
      return envelope({
        types: [
          "public.utf8-plain-text",
          ...(args.html ? ["public.html"] : []),
          ...(args.markdown ? ["public.markdown"] : []),
        ],
      });
    case "bring_to_front":
      return envelope({ effect: "confirmed", pid: args.pid });
    default:
      throw new Error(`unknown tool ${tool}`);
  }
}

function launchApp(state, args) {
  const existing = findApp(state, args) ?? createApp(state, args);
  if (state.launchRefuse) {
    return { error: "LAUNCH_FAILED", launch_state: { process_running: true, requested: false, window_ready: false } };
  }
  const app = args.creates_new_application_instance === true && !state.newInstanceReuseExisting
    ? cloneAppInstance(state, existing, args)
    : existing;
  app.running = true;
  if (!app.pid) app.pid = nextPid(state);
  if (state.launchNoWindowsOnce > 0) {
    state.launchNoWindowsOnce -= 1;
    if (args.creates_new_application_instance === true) {
      state.pendingWindowPids ??= [];
      state.pendingWindowPids.push(app.pid);
    }
    return {
      pid: app.pid,
      name: app.name,
      bundle_id: app.bundle_id,
      launch_path: app.launch_path,
      windows: [],
      launch_state: { process_running: true, requested: true, window_ready: false },
    };
  }
  ensureOrdinaryWindow(app);
  if (state.newInstanceExtraWindow && args.creates_new_application_instance === true) {
    app.windows.push(makeWindow(app, 2000 + app.pid, "Sibling"));
  }
  return {
    pid: app.pid,
    name: state.newInstanceIdentityMismatch ? "Different App" : app.name,
    bundle_id: state.newInstanceIdentityMismatch ? "com.example.different" : app.bundle_id,
    launch_path: app.launch_path,
    windows: app.windows,
    launch_state: { process_running: true, requested: true, window_ready: app.windows.length > 0 },
  };
}

function cloneAppInstance(state, source, args) {
  const pid = nextPid(state);
  const app = {
    ...source,
    pid,
    name: args.name ?? source.name,
    bundle_id: args.bundle_id ?? source.bundle_id,
    launch_path: args.launch_path ?? source.launch_path,
    running: true,
    windows: [],
    elements: structuredClone(source.elements ?? []),
    actions: [],
  };
  state.apps.push(app);
  return app;
}

function makeWindow(app, windowId = 1000 + app.pid, title = app.name) {
  return {
    window_id: windowId,
    pid: app.pid,
    title,
    z_index: 10,
    is_on_screen: true,
    on_current_space: true,
    frame: { x: 120, y: 80, width: 800, height: 600 },
  };
}

function ensureOrdinaryWindow(app) {
  if (app.windows.length === 0) app.windows.push(makeWindow(app));
}

function closeWindow(state, args) {
  const app = byPid(state, args.pid);
  const window = app.windows.find((item) => item.window_id === args.window_id);
  if (!window) {
    return {
      status: "missing",
      effect: "refused",
      code: "window_not_found",
      pid: args.pid,
      window_id: args.window_id,
      message: "the exact window is missing",
    };
  }
  const response = state.closeWindowResponses?.shift() ?? "closed";
  if (response !== "closed") {
    const codes = {
      confirmation_required: "close_confirmation_required",
      noop: "close_unconfirmed",
      disabled: "close_button_disabled",
      delivery_failed: "close_action_failed",
    };
    return {
      status: response,
      effect: "refused",
      code: codes[response] ?? String(response),
      pid: args.pid,
      window_id: args.window_id,
      message: `close refused: ${response}`,
    };
  }
  app.windows = app.windows.filter((item) => item.window_id !== args.window_id);
  return { status: "closed", pid: args.pid, window_id: args.window_id };
}

async function getWindowState(state, args) {
  const app = byPid(state, args.pid);
  const window = app.windows.find((item) => item.window_id === args.window_id) ?? app.windows[0];
  if (!window) throw new Error(`window_id_not_found`);
  state.snapshotSeq += 1;
  const snapshotId = `s${String(state.snapshotSeq).padStart(8, "0")}`;
  const source = elementsForWindow(app, window).filter((element) =>
    args.max_depth === undefined || Number(element.depth ?? 0) <= args.max_depth
  );
  const elements = source.map((element) => ({
    ...element,
    element_token: `${snapshotId}:${element.element_index}`,
  }));
  if (state.degradedSnapshots > 0 || state.degradedAlways) {
    state.degradedSnapshots = Math.max(0, (state.degradedSnapshots ?? 0) - 1);
    if (args.screenshot_out_file) {
      await mkdir(dirname(args.screenshot_out_file), { recursive: true });
      await writeFile(args.screenshot_out_file, Buffer.from(PNG_1X1, "base64"));
    }
    return {
      pid: app.pid,
      window_id: window.window_id,
      degraded: true,
      degraded_reason: "ax_window_unresolved",
      elements: [],
      tree_markdown: "",
      screenshot_file_path: args.screenshot_out_file ?? undefined,
    };
  }
  state.snapshots[`${app.pid}:${window.window_id}`] = { snapshotId, elements };
  const tree = elements
    .map((element) => `${"  ".repeat(Number(element.depth ?? 0))}[${element.element_index}] ${element.role} ${element.label}${element.value ? ` value=${JSON.stringify(element.value)}` : ""}`)
    .join("\n");
  if (args.screenshot_out_file) {
    await mkdir(dirname(args.screenshot_out_file), { recursive: true });
    await writeFile(args.screenshot_out_file, Buffer.from(PNG_1X1, "base64"));
  }
  return {
    pid: app.pid,
    window_id: window.window_id,
    snapshot_id: snapshotId,
    tree_markdown: tree,
    elements,
    frame: window.frame,
    screenshot_file_path: args.screenshot_out_file ?? undefined,
    elements_complete: !(state.saturateDefault && args.max_depth === undefined),
    total_element_count: state.saturateDefault && args.max_depth === undefined ? 4000 : elements.length,
    returned_element_count: state.saturateDefault && args.max_depth === undefined ? 2000 : elements.length,
    element_count: state.saturateDefault && args.max_depth === undefined ? 2000 : elements.length,
  };
}

function elementsForWindow(app, window) {
  if (Array.isArray(window.elements)) return window.elements;
  const height = window.frame?.height ?? window.frame?.h;
  if (typeof height === "number" && height < 40) return [];
  return app.elements;
}

function click(state, args, tool) {
  if (args.x !== undefined && args.y !== undefined && (args.x < 0 || args.y < 0)) {
    throw new Error(`windowNotFoundAtPosition(${args.x}, ${args.y})`);
  }
  const app = byPid(state, args.pid);
  const snapshot = currentSnapshot(state, app, args);
  if (args.element_index !== undefined) {
    requireElement(snapshot, args);
  }
  if (args.element_index === 13 && app.name === "Calculator") {
    app.elements[1].value = "7";
  }
  app.actions.push({ tool, args });
  return { effect: "confirmed", route: "accessibility" };
}

function drag(state, args) {
  if ([args.from_x, args.from_y, args.to_x, args.to_y].some((value) => typeof value !== "number")) {
    throw new Error("Invalid params");
  }
  byPid(state, args.pid).actions.push({ tool: "drag", args });
  return { effect: "confirmed", route: "synthetic_events" };
}

function typeText(state, args) {
  const app = byPid(state, args.pid);
  let field;
  if (args.element_index !== undefined) {
    const snapshot = currentSnapshot(state, app, args);
    const element = requireElement(snapshot, args);
    field = app.elements.find((item) => item.element_index === element.element_index);
  } else {
    field = app.elements.find((element) => element.role === "AXTextArea" || element.role === "AXTextField") ?? app.elements[app.elements.length - 1];
  }
  if (!field) throw new Error("No editable element");
  field.value = `${field.value ?? ""}${args.text}`;
  app.actions.push({ tool: "type_text", args });
  return { effect: "confirmed", route: "accessibility" };
}

function press(state, args, tool) {
  const app = byPid(state, args.pid);
  app.actions.push({ tool, args });
  if (Array.isArray(args.keys) && args.keys.includes("v")) {
    const field = app.elements.find((element) => element.role === "AXTextArea") ?? app.elements[app.elements.length - 1];
    field.value = `${field.value ?? ""}${state.clipboard}`;
  }
  return { effect: "unverifiable", route: "synthetic_events" };
}

function setValue(state, args) {
  const app = byPid(state, args.pid);
  const snapshot = currentSnapshot(state, app, args);
  const element = requireElement(snapshot, args);
  const live = app.elements.find((item) => item.element_index === element.element_index);
  live.value = String(args.value);
  app.actions.push({ tool: "set_value", args });
  return { effect: "confirmed", route: "accessibility" };
}

function scroll(state, args) {
  const direction = String(args.direction ?? "");
  if (!["up", "down", "left", "right"].includes(direction)) {
    throw new Error("direction must be up, down, left, or right");
  }
  byPid(state, args.pid).actions.push({ tool: "scroll", args });
  return { effect: "confirmed", route: "synthetic_events" };
}

function findApp(state, args) {
  return state.apps.find((app) => {
    if (args.bundle_id) return app.bundle_id === args.bundle_id;
    if (args.launch_path) return app.launch_path === args.launch_path;
    if (args.name) return app.name.toLowerCase() === String(args.name).toLowerCase();
    return false;
  });
}

function createApp(state, args) {
  const app = {
    pid: nextPid(state),
    name: args.name ?? "Untitled",
    bundle_id: args.bundle_id ?? "com.example.app",
    launch_path: args.launch_path ?? "/Applications/Untitled.app",
    running: true,
    last_used: "2026-01-01T00:00:00Z",
    windows: [],
    elements: [{ element_index: 0, role: "AXWindow", label: args.name ?? "Untitled", value: "" }],
    actions: [],
  };
  state.apps.push(app);
  return app;
}

function windowsFor(state, pid) {
  const app = byPid(state, pid);
  const pending = state.pendingWindowPids?.indexOf(pid) ?? -1;
  if (pending >= 0) {
    state.pendingWindowPids.splice(pending, 1);
    ensureOrdinaryWindow(app);
  }
  return app.windows;
}

function byPid(state, pid) {
  const app = state.apps.find((item) => item.pid === pid);
  if (!app) throw new Error(`window_target_not_found`);
  return app;
}

function currentSnapshot(state, app, args) {
  const windowId = args.window_id ?? app.windows[0]?.window_id;
  return state.snapshots[`${app.pid}:${windowId}`] ?? {
    snapshotId: args.snapshot_id,
    elements: app.elements,
  };
}

function requireElement(snapshot, args) {
  const element = snapshot.elements.find((item) => item.element_index === args.element_index);
  if (!element) throw new Error("No cached AX state");
  if (args.snapshot_id && snapshot.snapshotId && args.snapshot_id !== snapshot.snapshotId) {
    throw new Error("stale snapshot_id");
  }
  if (args.element_token && args.element_token !== element.element_token) {
    throw new Error("stale element_token");
  }
  return element;
}

function envelope(structuredContent) {
  return {
    content: [{ type: "text", text: "ok" }],
    structuredContent,
    isError: false,
  };
}

function nextPid(state) {
  state.nextPid += 1;
  return state.nextPid;
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

async function loadState() {
  try {
    return JSON.parse(await readFile(statePath, "utf8"));
  } catch {
    return defaultState();
  }
}

async function saveState(state) {
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, JSON.stringify(state, null, 2));
}

async function appendLog(entry) {
  if (!logPath) return;
  let existing = [];
  try {
    existing = JSON.parse(await readFile(logPath, "utf8"));
  } catch {
    existing = [];
  }
  existing.push(entry);
  await mkdir(dirname(logPath), { recursive: true });
  await writeFile(logPath, JSON.stringify(existing, null, 2));
}

function defaultState() {
  return {
    nextPid: 900,
    snapshotSeq: 0,
    clipboard: "",
    clipboardHtml: undefined,
    clipboardMarkdown: undefined,
    calls: [],
    snapshots: {},
    sessionEnded: false,
    degradedSnapshots: 0,
    degradedAlways: false,
    pendingWindowPids: [],
    closeWindowResponses: [],
    apps: [
      {
        pid: 844,
        name: "Calculator",
        bundle_id: "com.apple.calculator",
        launch_path: "/System/Applications/Calculator.app",
        running: true,
        last_used: "2026-05-15T12:34:56Z",
        use_count: 42,
        windows: [
          {
            window_id: 10725,
            pid: 844,
            title: "Calculator",
            z_index: 12,
            is_on_screen: true,
            on_current_space: true,
            is_main: true,
            frame: { x: 40, y: 80, width: 198, height: 350 },
          },
        ],
        elements: [
          { element_index: 0, role: "AXWindow", label: "Calculator", value: "", actions: ["Raise"] },
          { element_index: 13, role: "AXButton", label: "7", value: "", actions: ["Press"] },
          { element_index: 20, role: "AXButton", label: "×", value: "", actions: ["Press"] },
          { element_index: 30, role: "AXRadioButton", label: "Scientific", value: 0, selected: false, enabled: true, actions: ["Press"] },
          { element_index: 31, role: "AXButton", label: "Unavailable", enabled: false, actions: [] },
          {
            element_index: 100,
            role: "AXMenuBar",
            label: "Apple",
            value: "",
            frame: { x: 0, y: 0, w: 1440, h: 24 },
          },
          { element_index: 101, role: "AXMenuBarItem", label: "Calculator", value: "" },
        ],
        actions: [],
      },
      {
        pid: 900,
        name: "TextEdit",
        bundle_id: "com.apple.TextEdit",
        launch_path: "/System/Applications/TextEdit.app",
        running: true,
        last_used: 809740800,
        windows: [
          {
            window_id: 2000,
            pid: 900,
            title: "",
            z_index: 20,
            is_on_screen: true,
            on_current_space: true,
            frame: { x: 0, y: 22, width: 1022, height: 25 },
            elements: [],
          },
          {
            window_id: 2001,
            pid: 900,
            title: "Untitled",
            z_index: 8,
            is_on_screen: true,
            on_current_space: true,
            is_main: true,
            frame: { x: 120, y: 80, width: 800, height: 600 },
          },
        ],
        elements: [
          { element_index: 0, role: "AXWindow", label: "Untitled", value: "", actions: ["Raise"] },
          { element_index: 1, role: "AXScrollArea", label: "scroll", value: "", actions: [] },
          {
            element_index: 2,
            role: "AXTextArea",
            label: "text",
            value: "alpha beta alpha\nsecond line",
            actions: ["AXShowMenu"],
          },
        ],
        actions: [],
      },
      {
        pid: 0,
        name: "Notes",
        bundle_id: "com.apple.Notes",
        launch_path: "/System/Applications/Notes.app",
        running: false,
        last_used: null,
        windows: [],
        elements: [{ element_index: 0, role: "AXWindow", label: "Notes", value: "" }],
        actions: [],
      },
      {
        pid: 1,
        name: "init",
        running: true,
        last_used: null,
        windows: [],
        elements: [],
        actions: [],
      },
    ],
  };
}
