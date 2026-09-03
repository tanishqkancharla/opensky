import { chmod, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { asArray, asRecord, CuaDriverClient } from "./driver.js";
import { invalidParams, OpenSkyError } from "./errors.js";
import { inferScreenshotScale, readImageMeta } from "./image-meta.js";
import { parseXdotoolKey, toHotkeyKeys } from "./keys.js";
import { detectTarget, homeDir, pasteModifierFor } from "./platform.js";
import { mkdirPrivate, writeFilePrivate } from "./secure-fs.js";
import { SessionStore, sessionFile } from "./session-store.js";
import type {
  App,
  AppState,
  Direction,
  DriverClient,
  MouseButton,
  PasteFormat,
  ResolvedApp,
  Screenshot,
  OpenSky as OpenSkyApi,
  OpenSkyOptions,
  OpenSkyTarget,
  SnapshotElement,
  WindowSnapshot,
} from "./types.js";

const DIRECTIONS: Record<string, "up" | "down" | "left" | "right"> = {
  up: "up",
  down: "down",
  left: "left",
  right: "right",
  u: "up",
  d: "down",
  l: "left",
  r: "right",
};

const MOUSE_BUTTONS: Record<string, "left" | "right" | "middle"> = {
  left: "left",
  right: "right",
  middle: "middle",
  l: "left",
  r: "right",
  m: "middle",
  "0": "left",
  "1": "right",
  "2": "middle",
};

const SECONDARY_ACTIONS: Record<string, { kind: "click" | "front" | "key"; action?: string; key?: string }> = {
  raise: { kind: "front" },
  "show menu": { kind: "click", action: "show_menu" },
  show_menu: { kind: "click", action: "show_menu" },
  axshowmenu: { kind: "click", action: "show_menu" },
  press: { kind: "click", action: "press" },
  open: { kind: "click", action: "open" },
  pick: { kind: "click", action: "pick" },
  confirm: { kind: "click", action: "confirm" },
  cancel: { kind: "click", action: "cancel" },
  increment: { kind: "click", action: "increment" },
  decrement: { kind: "click", action: "decrement" },
  delete: { kind: "key", key: "delete" },
};

export class OpenSky implements OpenSkyApi {
  readonly target: OpenSkyTarget;
  readonly driver: DriverClient;
  private readonly store: SessionStore;
  private readonly screenshotDir: string;
  private readonly autoLaunch: boolean;
  private readonly pasteModifier: "cmd" | "ctrl";
  private readonly screenshotFormat?: "png" | "jpeg";
  private readonly screenshotScale?: number;
  private readonly settleDelayMs: number;
  private readonly degradedRetryMs: number;
  private readonly lastActionAt = new Map<string, number>();
  private readonly resolvedThisProcess = new Set<string>();
  private screenshotSequence = 0;
  private readonly memory = {
    apps: {} as Record<string, ResolvedApp>,
    trees: {} as Record<string, { tree: string; elements: SnapshotElement[]; snapshotId?: string }>,
  };
  private loaded = false;

  constructor(options: OpenSkyOptions = {}) {
    this.target = options.target ?? detectTarget();
    this.driver = options.driver ?? new CuaDriverClient({ session: options.session ?? "opensky" });
    const home = homeDir(options.homeDir);
    this.store = new SessionStore(sessionFile(home));
    this.screenshotDir = options.screenshotDir ?? join(home, "screenshots");
    this.autoLaunch = options.autoLaunch !== false;
    this.pasteModifier = options.pasteModifier ?? pasteModifierFor(this.target);
    this.screenshotFormat = options.screenshotFormat;
    this.screenshotScale = options.screenshotScale;
    this.settleDelayMs = options.settleDelayMs ?? 800;
    this.degradedRetryMs = options.degradedRetryMs ?? 4_000;
  }

  async list_apps(): Promise<App[]> {
    const result = await this.driver.call("list_apps", {});
    return mapApps(result.structured);
  }

  async get_app_state(args: { app: string; disableDiff?: boolean }): Promise<AppState> {
    if (!args?.app) throw invalidParams("app is required");
    const resolved = await this.requireResolved(args.app);
    await this.settleAfterAction(resolved);
    await this.refreshWindowAfterAction(resolved);
    const previous = this.memory.trees[windowKey(resolved)];
    const snapshot = await this.snapshotSettled(resolved, { includeScreenshot: true });
    const text =
      args.disableDiff || !previous ? snapshot.tree : diffTrees(previous.tree, previous.elements, snapshot.tree, snapshot.elements);
    this.memory.trees[windowKey(resolved)] = {
      tree: snapshot.tree,
      elements: snapshot.elements,
      snapshotId: snapshot.snapshotId,
    };
    await this.persist();
    return {
      app: resolved.launchPath || resolved.name || args.app,
      screenshot: snapshot.screenshot ?? (snapshot.screenshotPath ? { url: pathToFileURL(snapshot.screenshotPath).href } : null),
      text,
    };
  }

  async click(args: {
    app: string;
    element_index?: number;
    x?: number;
    y?: number;
    mouse_button?: MouseButton;
    click_count?: number;
  }): Promise<void> {
    if (!args?.app) throw invalidParams("app is required");
    const button = normalizeMouseButton(args.mouse_button);
    const resolved = await this.requireResolved(args.app);
    const payload: Record<string, unknown> = {
      pid: resolved.pid,
      window_id: resolved.windowId,
    };
    if (args.element_index !== undefined) {
      Object.assign(payload, this.elementTarget(resolved, args.element_index));
    }
    if (args.x !== undefined) payload.x = args.x;
    if (args.y !== undefined) payload.y = args.y;
    payload.button = button;
    if (args.click_count !== undefined) payload.count = args.click_count;
    if (args.click_count === 2 && args.element_index !== undefined && button === "left") {
      await this.driver.call("double_click", {
        pid: resolved.pid,
        window_id: resolved.windowId,
        ...this.elementTarget(resolved, args.element_index),
      });
      this.markAction(resolved);
      return;
    }
    await this.driver.call("click", payload);
    this.markAction(resolved);
  }

  async drag(args: {
    app: string;
    from_x: number;
    from_y: number;
    to_x: number;
    to_y: number;
  }): Promise<void> {
    if (!args?.app) throw invalidParams("app is required");
    for (const key of ["from_x", "from_y", "to_x", "to_y"] as const) {
      if (typeof args[key] !== "number") throw invalidParams(`${key} is required`);
    }
    const resolved = await this.requireResolved(args.app);
    await this.driver.call("drag", {
      pid: resolved.pid,
      window_id: resolved.windowId,
      from_x: args.from_x,
      from_y: args.from_y,
      to_x: args.to_x,
      to_y: args.to_y,
    });
    this.markAction(resolved);
  }

  async paste(args: { app: string; text: string; format: PasteFormat }): Promise<void> {
    if (!args?.app || typeof args.text !== "string") throw invalidParams();
    if (args.format !== "text" && args.format !== "md" && args.format !== "html") {
      throw invalidParams();
    }
    const resolved = await this.requireResolved(args.app);
    let previous: Record<string, unknown> | undefined;
    try {
      const read = await this.driver.call("clipboard_read", { include_text: true, include_html: true });
      previous = extractClipboard(read.structured);
    } catch {
      previous = undefined;
    }
    try {
      await this.driver.call("clipboard_write", clipboardWritePayload(args.format, args.text));
      await this.driver.call("hotkey", {
        pid: resolved.pid,
        window_id: resolved.windowId,
        keys: [this.pasteModifier, "v"],
      });
      this.markAction(resolved);
    } finally {
      if (previous) {
        await this.driver.call("clipboard_write", previous).catch(() => undefined);
      }
    }
  }

  async perform_secondary_action(args: {
    app: string;
    element_index: number;
    action: string;
  }): Promise<void> {
    if (!args?.app || typeof args.element_index !== "number" || !args.action) {
      throw invalidParams();
    }
    const resolved = await this.requireResolved(args.app);
    const mapped = SECONDARY_ACTIONS[args.action.trim().toLowerCase()];
    if (mapped?.kind === "front") {
      await this.driver.call("bring_to_front", { pid: resolved.pid, window_id: resolved.windowId });
      this.markAction(resolved);
      return;
    }
    if (mapped?.kind === "key" && mapped.key) {
      await this.driver.call("press_key", {
        pid: resolved.pid,
        window_id: resolved.windowId,
        key: mapped.key,
        ...this.elementTarget(resolved, args.element_index),
      });
      this.markAction(resolved);
      return;
    }
    await this.driver.call("click", {
      pid: resolved.pid,
      window_id: resolved.windowId,
      action: mapped?.action ?? args.action,
      ...this.elementTarget(resolved, args.element_index),
    });
    this.markAction(resolved);
  }

  async press_key(args: { app: string; key: string }): Promise<void> {
    if (!args?.app || !args.key) throw invalidParams();
    const resolved = await this.requireResolved(args.app);
    const parsed = parseXdotoolKey(args.key);
    if (parsed.modifiers.length > 0) {
      await this.driver.call("hotkey", {
        pid: resolved.pid,
        window_id: resolved.windowId,
        keys: toHotkeyKeys(parsed),
      });
      this.markAction(resolved);
      return;
    }
    await this.driver.call("press_key", {
      pid: resolved.pid,
      window_id: resolved.windowId,
      key: parsed.key,
    });
    this.markAction(resolved);
  }

  async scroll(args: {
    app: string;
    element_index?: number;
    x?: number;
    y?: number;
    direction: Direction;
    pages?: number;
  }): Promise<void> {
    if (!args?.app) throw invalidParams();
    if (args.element_index !== undefined && typeof args.element_index !== "number") throw invalidParams();
    const direction = normalizeDirection(args.direction);
    const resolved = await this.requireResolved(args.app);
    const payload: Record<string, unknown> = {
      pid: resolved.pid,
      window_id: resolved.windowId,
      direction,
      by: "page",
      amount: args.pages ?? 1,
    };
    if (typeof args.element_index === "number") {
      Object.assign(payload, this.elementTarget(resolved, args.element_index));
    }
    if (typeof args.x === "number") payload.x = args.x;
    if (typeof args.y === "number") payload.y = args.y;
    await this.driver.call("scroll", payload);
    this.markAction(resolved);
  }

  async select_text(args: {
    app: string;
    element_index: number;
    text: string;
    prefix?: string;
    suffix?: string;
    selection_type?: string;
  }): Promise<void> {
    if (!args?.app || typeof args.element_index !== "number" || typeof args.text !== "string") {
      throw invalidParams();
    }
    const selectionType = args.selection_type ?? "text";
    if (selectionType !== "text" && selectionType !== "cursor_before" && selectionType !== "cursor_after") {
      throw invalidParams();
    }
    const resolved = await this.requireResolved(args.app);
    const snapshot = this.memory.trees[windowKey(resolved)];
    const element = snapshot?.elements.find((item) => item.element_index === args.element_index);
    const haystack = element?.value ?? snapshot?.tree ?? "";
    const index = findWithContext(haystack, args.text, args.prefix, args.suffix);
    if (index < 0) {
      throw new OpenSkyError(`Text ${JSON.stringify(args.text)} was not found in element ${args.element_index}`);
    }

    await this.click({ app: args.app, element_index: args.element_index });
    await this.driver.call("press_key", {
      pid: resolved.pid,
      window_id: resolved.windowId,
      key: "home",
      modifiers: this.target === "mac" ? ["cmd"] : ["ctrl"],
    });
    for (let i = 0; i < index; i += 1) {
      await this.driver.call("press_key", { pid: resolved.pid, window_id: resolved.windowId, key: "right" });
    }
    if (selectionType === "cursor_before") return;
    const moves = args.text.length;
    if (selectionType === "cursor_after") {
      for (let i = 0; i < moves; i += 1) {
        await this.driver.call("press_key", { pid: resolved.pid, window_id: resolved.windowId, key: "right" });
      }
      return;
    }
    for (let i = 0; i < moves; i += 1) {
      await this.driver.call("press_key", {
        pid: resolved.pid,
        window_id: resolved.windowId,
        key: "right",
        modifiers: ["shift"],
      });
    }
  }

  async set_value(args: { app: string; element_index: number; value: string }): Promise<void> {
    if (!args?.app || typeof args.element_index !== "number" || typeof args.value !== "string") {
      throw invalidParams();
    }
    const resolved = await this.requireResolved(args.app);
    await this.driver.call("set_value", {
      pid: resolved.pid,
      window_id: resolved.windowId,
      value: args.value,
      ...this.elementTarget(resolved, args.element_index),
    });
    this.markAction(resolved);
  }

  async type_text(args: { app: string; text: string }): Promise<void> {
    if (!args?.app || typeof args.text !== "string") throw invalidParams();
    const resolved = await this.requireResolved(args.app);
    await this.driver.call("type_text", {
      pid: resolved.pid,
      window_id: resolved.windowId,
      text: args.text,
    });
    this.markAction(resolved);
  }

  async invoke(tool: string, args: Record<string, unknown> = {}) {
    return this.driver.call(tool, args);
  }

  private async requireResolved(app: string): Promise<ResolvedApp> {
    await this.ensureLoaded();
    const cached = this.memory.apps[normalizeAppKey(app)];
    if (cached?.pid && this.resolvedThisProcess.has(normalizeAppKey(app))) return cached;
    return this.resolveApp(app, { launchIfNeeded: this.autoLaunch });
  }

  private async resolveApp(app: string, options: { launchIfNeeded: boolean }): Promise<ResolvedApp> {
    await this.ensureLoaded();
    const listed = await this.listRawApps();
    const match = findApp(listed, app);
    if (match && (match.running || match.pid)) {
      const pid = Number(match.pid);
      const windowId = await this.pickWindow(pid, match);
      const resolved: ResolvedApp = {
        query: app,
        name: String(match.name ?? app),
        bundleId: optionalString(match.bundle_id),
        launchPath: optionalString(match.launch_path),
        pid,
        windowId,
      };
      this.memory.apps[normalizeAppKey(app)] = resolved;
      if (resolved.bundleId) this.memory.apps[normalizeAppKey(resolved.bundleId)] = resolved;
      if (resolved.name) this.memory.apps[normalizeAppKey(resolved.name)] = resolved;
      this.markResolved(resolved);
      await this.persist();
      return resolved;
    }

    if (!options.launchIfNeeded) {
      throw new OpenSkyError(`Application ${JSON.stringify(app)} is not running`);
    }

    const launchArgs = launchArgsFor(app, match);
    const launched = await this.driver.call("launch_app", launchArgs);
    const structured = asRecord(launched.structured) ?? {};
    const pid = Number(structured.pid ?? match?.pid);
    if (!Number.isFinite(pid) || pid <= 0) {
      throw new OpenSkyError(`Failed to launch ${JSON.stringify(app)}`);
    }
    const windows = asArray<Record<string, unknown>>(structured.windows);
    const windowId = pickWindowId(windows) ?? (await this.pickWindow(pid, structured));
    const resolved: ResolvedApp = {
      query: app,
      name: String(structured.name ?? match?.name ?? app),
      bundleId: optionalString(structured.bundle_id) ?? optionalString(match?.bundle_id),
      launchPath: optionalString(structured.launch_path) ?? optionalString(match?.launch_path),
      pid,
      windowId,
    };
    this.markAction(resolved);
    this.memory.apps[normalizeAppKey(app)] = resolved;
    if (resolved.bundleId) this.memory.apps[normalizeAppKey(resolved.bundleId)] = resolved;
    if (resolved.name) this.memory.apps[normalizeAppKey(resolved.name)] = resolved;
    this.markResolved(resolved);
    await this.persist();
    return resolved;
  }

  private async listRawApps(): Promise<Record<string, unknown>[]> {
    const result = await this.driver.call("list_apps", {});
    const structured = result.structured;
    if (Array.isArray(structured)) return structured as Record<string, unknown>[];
    const record = asRecord(structured);
    if (record && Array.isArray(record.apps)) return record.apps as Record<string, unknown>[];
    if (record && Array.isArray(record.processes)) return record.processes as Record<string, unknown>[];
    return [];
  }

  private async pickWindow(
    pid: number,
    source: Record<string, unknown>,
    excludeIds: Set<number> = new Set(),
  ): Promise<number | undefined> {
    const fromSource = pickWindowId(
      asArray<Record<string, unknown>>(source.windows).filter((window) => {
        const id = window.window_id;
        return typeof id !== "number" || !excludeIds.has(id);
      }),
    );
    if (fromSource) return fromSource;
    const listed = await this.driver.call("list_windows", { pid });
    return pickWindowId(
      windowsFrom(listed.structured).filter((window) => {
        const id = window.window_id;
        return typeof id !== "number" || !excludeIds.has(id);
      }),
    );
  }

  private async snapshotWindow(
    resolved: ResolvedApp,
    options: { includeScreenshot: boolean; screenshotPath?: string },
  ): Promise<WindowSnapshot> {
    if (!resolved.windowId) {
      resolved.windowId = await this.pickWindow(resolved.pid, {});
    }
    if (!resolved.windowId) {
      throw new OpenSkyError(`No window found for ${resolved.name} (pid ${resolved.pid})`);
    }
    await mkdirPrivate(this.screenshotDir);
    const screenshotPath = options.screenshotPath ?? join(this.screenshotDir, `${slug(resolved.name)}-${resolved.windowId}.png`);
    const result = await this.driver.call("get_window_state", {
      pid: resolved.pid,
      window_id: resolved.windowId,
      include_screenshot: options.includeScreenshot,
      screenshot_out_file: options.includeScreenshot ? screenshotPath : undefined,
      screenshot_format: this.screenshotFormat,
      screenshot_scale: this.screenshotScale,
    });
    const structured = asRecord(result.structured) ?? {};
    const rawElements = normalizeElements(structured.elements);
    const rawTree =
      (typeof structured.tree_markdown === "string" && structured.tree_markdown) ||
      (typeof structured.text === "string" && structured.text) ||
      "";
    const pruned = pruneMenuSubtrees(sanitizeTreeText(rawTree));
    const visibleElements = pruned.hiddenIndices.size
      ? rawElements.filter((element) => !pruned.hiddenIndices.has(element.element_index))
      : rawElements;
    const previousElements = this.memory.trees[windowKey(resolved)]?.elements ?? [];
    const elements = stabilizeElementIndices(previousElements, visibleElements, pruned.hiddenIndices.size > 0);
    const tree = remapTreeIndices(pruned.tree || renderTree(visibleElements), elements);
    const snapshotId = optionalString(structured.snapshot_id);
    const filePath =
      optionalString(structured.screenshot_file_path) ??
      (options.includeScreenshot ? await maybeWriteScreenshot(structured, screenshotPath) : null);
    const frame = frameOf(structured);
    const screenshot = filePath ? await screenshotFromFile(filePath, frame) : undefined;
    if (filePath) await chmod(filePath, 0o600).catch(() => undefined);
    resolved.snapshotId = snapshotId;
    this.memory.apps[normalizeAppKey(resolved.query)] = resolved;
    return {
      pid: resolved.pid,
      windowId: resolved.windowId,
      snapshotId,
      tree,
      elements,
      screenshotPath: filePath,
      screenshot: screenshot ?? (filePath ? { url: pathToFileURL(filePath).href } : undefined),
      frame,
      degraded: structured.degraded === true,
      degradedReason: optionalString(structured.degraded_reason),
    };
  }

  private async snapshotSettled(
    resolved: ResolvedApp,
    options: { includeScreenshot: boolean },
  ): Promise<WindowSnapshot> {
    const deadline = Date.now() + this.degradedRetryMs;
    let delayMs = 150;
    const screenshotPath = join(
      this.screenshotDir,
      `${slug(resolved.name)}-${resolved.windowId}-${Date.now()}-${++this.screenshotSequence}.png`,
    );
    const captureOptions = { ...options, screenshotPath };
    let snapshot = await this.snapshotWindow(resolved, captureOptions);
    while (snapshot.degraded && Date.now() < deadline) {
      await sleep(Math.min(delayMs, Math.max(0, deadline - Date.now())));
      delayMs = Math.min(delayMs * 2, 800);
      snapshot = await this.snapshotWindow(resolved, captureOptions);
    }
    if (snapshot.degraded) {
      const detail = snapshot.degradedReason ? `: ${snapshot.degradedReason}` : "";
      snapshot.tree =
        `Accessibility tree unavailable for ${JSON.stringify(resolved.name)}${detail.replace(/\.$/, "")}. ` +
        "Use screenshot coordinates for this state, or bring the window onto the current desktop and retry.";
    }
    return snapshot;
  }

  private markAction(resolved: ResolvedApp): void {
    this.lastActionAt.set(windowKey(resolved), Date.now());
  }

  private async settleAfterAction(resolved: ResolvedApp): Promise<void> {
    if (this.settleDelayMs <= 0) return;
    const actionAt = this.lastActionAt.get(windowKey(resolved));
    if (actionAt === undefined) return;
    const remaining = this.settleDelayMs - (Date.now() - actionAt);
    if (remaining > 0) await sleep(remaining);
  }

  private async refreshWindowAfterAction(resolved: ResolvedApp): Promise<void> {
    const key = windowKey(resolved);
    if (!this.lastActionAt.has(key)) return;
    const nextWindowId = await this.pickWindow(resolved.pid, {});
    if (nextWindowId) resolved.windowId = nextWindowId;
    this.lastActionAt.delete(key);
  }

  private markResolved(resolved: ResolvedApp): void {
    this.resolvedThisProcess.add(normalizeAppKey(resolved.query));
    this.resolvedThisProcess.add(normalizeAppKey(resolved.name));
    if (resolved.bundleId) this.resolvedThisProcess.add(normalizeAppKey(resolved.bundleId));
    if (resolved.launchPath) this.resolvedThisProcess.add(normalizeAppKey(resolved.launchPath));
  }

  private elementTarget(resolved: ResolvedApp, elementIndex: number): Record<string, unknown> {
    const snapshot = this.memory.trees[windowKey(resolved)];
    const element = snapshot?.elements.find((item) => item.element_index === elementIndex);
    if (!snapshot || !element) {
      throw new OpenSkyError(
        `Element index ${elementIndex} is not present in the latest accessibility snapshot for ` +
          `${JSON.stringify(resolved.name)}. Call get_app_state again, or use screenshot coordinates when AX is unavailable.`,
      );
    }
    const target: Record<string, unknown> = {
      window_id: resolved.windowId,
      element_index: element.driver_index ?? elementIndex,
    };
    if (element?.element_token) target.element_token = element.element_token;
    if (snapshot?.snapshotId) target.snapshot_id = snapshot.snapshotId;
    return target;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    const persisted = await this.store.load();
    this.memory.apps = persisted.apps;
    this.memory.trees = persisted.trees;
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    await this.store.save(this.memory);
  }
}

export function createOpenSky(options: OpenSkyOptions = {}): OpenSky {
  return new OpenSky(options);
}

export const opensky = new OpenSky();

export function mapApps(structured: unknown): App[] {
  const record = asRecord(structured);
  const fromApps = Array.isArray(structured) ? structured : asArray(record?.apps);
  const fromProcesses = asArray(record?.processes);
  const fromAppsArray = fromApps.length > 0;
  const records = fromAppsArray ? fromApps : fromProcesses;
  const hasGuiHints = records.some((item) => {
    const rec = asRecord(item) ?? {};
    return Boolean(
      optionalString(rec.bundle_id) ||
        optionalString(rec.launch_path) ||
        optionalString(rec.path) ||
        (Array.isArray(rec.windows) && rec.windows.length > 0),
    );
  });
  return records.flatMap((item) => {
    const rec = asRecord(item) ?? {};
    if (!isApplicationRecord(rec, { fromAppsArray, hasGuiHints })) return [];
    const lastUsed = rec.last_used ?? rec.lastUsedDate;
    const useCount = Number(rec.use_count ?? rec.useCount);
    return [
      {
        id: String(rec.bundle_id ?? rec.launch_path ?? rec.path ?? rec.id ?? rec.name ?? ""),
        displayName: optionalString(rec.name ?? rec.displayName),
        lastUsedDate: normalizeLastUsed(lastUsed),
        useCount: Number.isFinite(useCount) ? useCount : undefined,
        isRunning: Boolean(rec.running ?? rec.isRunning ?? Number(rec.pid) > 0),
      },
    ];
  });
}

export function normalizeMouseButton(button?: MouseButton): "left" | "right" | "middle" {
  if (button === undefined) return "left";
  const mapped = MOUSE_BUTTONS[String(button).toLowerCase()];
  if (!mapped) {
    throw new OpenSkyError("mouseButton must be left, right, middle, l, r, m, 0, 1, or 2");
  }
  return mapped;
}

export function normalizeDirection(direction: Direction | string): "up" | "down" | "left" | "right" {
  const mapped = DIRECTIONS[String(direction).toLowerCase()];
  if (!mapped) {
    throw new OpenSkyError("direction must be up, down, left, or right");
  }
  return mapped;
}

export function findWithContext(haystack: string, text: string, prefix?: string, suffix?: string): number {
  if (!text) return -1;
  if (!prefix && !suffix) return haystack.indexOf(text);
  const needle = `${prefix ?? ""}${text}${suffix ?? ""}`;
  const found = haystack.indexOf(needle);
  if (found < 0) return haystack.indexOf(text);
  return found + (prefix?.length ?? 0);
}

export function diffTrees(
  previousTree: string,
  previousElements: SnapshotElement[],
  nextTree: string,
  nextElements: SnapshotElement[],
): string {
  const prev = new Map(previousElements.map((item) => [item.element_index, item]));
  const next = new Map(nextElements.map((item) => [item.element_index, item]));
  const added: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];

  for (const [index, element] of next) {
    const before = prev.get(index);
    if (!before) {
      added.push(formatElement(element));
      continue;
    }
    if (
      before.label !== element.label ||
      before.value !== element.value ||
      before.role !== element.role ||
      before.identifier !== element.identifier
    ) {
      changed.push(`${formatElement(before)} -> ${formatElement(element)}`);
    }
  }
  for (const [index, element] of prev) {
    if (!next.has(index)) removed.push(formatElement(element));
  }

  if (added.length === 0 && changed.length === 0 && removed.length === 0) {
    return "No accessibility changes.";
  }
  const removedIndices = previousElements
    .filter((element) => !next.has(element.element_index))
    .map((element) => element.element_index);
  return [
    "The following is a diff from the previous accessibility tree; + marks added elements and ~ marks changed elements.",
    removedIndices.length ? `Removed element IDs: ${formatIndexRanges(removedIndices)}` : "",
    added.length
      ? nextElements
          .filter((element) => !prev.has(element.element_index))
          .map((element) => `+ ${treeLineForIndex(nextTree, element.element_index) ?? formatElement(element)}`)
          .join("\n")
      : "",
    changed.length
      ? nextElements
          .filter((element) => {
            const before = prev.get(element.element_index);
            return before && (
              before.label !== element.label ||
              before.value !== element.value ||
              before.role !== element.role ||
              before.identifier !== element.identifier
            );
          })
          .map((element) => `~ ${formatElement(element)}`)
          .join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function treeLineForIndex(tree: string, index: number): string | undefined {
  const marker = `[${index}]`;
  return tree.split("\n").find((line) => line.includes(marker))?.trim().replace(/^-\s+/, "");
}

function formatIndexRanges(indices: number[]): string {
  const sorted = [...new Set(indices)].sort((a, b) => a - b);
  const ranges: string[] = [];
  for (let start = 0; start < sorted.length; start += 1) {
    let end = start;
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) end += 1;
    ranges.push(start === end ? String(sorted[start]) : `${sorted[start]}-${sorted[end]}`);
    start = end;
  }
  return ranges.join(", ");
}

function formatElement(element: SnapshotElement): string {
  const primary = JSON.stringify(element.label ?? element.value ?? "");
  const value = element.value !== undefined && element.value !== element.label
    ? ` value=${JSON.stringify(element.value)}`
    : "";
  const identifier = element.identifier ? ` id=${JSON.stringify(element.identifier)}` : "";
  return `[${element.element_index}] ${element.role ?? "AXUnknown"} ${primary}${value}${identifier}`;
}

function findApp(apps: Record<string, unknown>[], query: string): Record<string, unknown> | undefined {
  const q = query.trim().toLowerCase();
  return (
    apps.find((app) => optionalString(app.bundle_id)?.toLowerCase() === q) ||
    apps.find((app) => optionalString(app.launch_path)?.toLowerCase() === q) ||
    apps.find((app) => optionalString(app.name)?.toLowerCase() === q) ||
    apps.find((app) => optionalString(app.launch_path)?.toLowerCase().endsWith(q)) ||
    apps.find((app) => optionalString(app.name)?.toLowerCase().includes(q))
  );
}

function launchArgsFor(app: string, match?: Record<string, unknown>): Record<string, unknown> {
  if (match?.bundle_id) return { bundle_id: match.bundle_id };
  if (match?.launch_path) return { launch_path: match.launch_path };
  if (looksLikePath(app)) return { launch_path: app };
  if (looksLikeBundleId(app)) return { bundle_id: app };
  return { name: app };
}

function looksLikePath(app: string): boolean {
  return app.startsWith("/") || app.endsWith(".app") || app.includes("\\");
}

function looksLikeBundleId(app: string): boolean {
  return app.includes(".") && !app.includes(" ") && !app.startsWith("/");
}

function windowsFrom(structured: unknown): Record<string, unknown>[] {
  if (Array.isArray(structured)) return structured as Record<string, unknown>[];
  const record = asRecord(structured);
  if (record && Array.isArray(record.windows)) return record.windows as Record<string, unknown>[];
  return [];
}

export function pickWindowId(windows: Record<string, unknown>[]): number | undefined {
  if (windows.length === 0) return undefined;
  const eligible = windows.filter((window) => window.on_current_space !== false && window.is_on_screen !== false);
  const pool = eligible.length > 0 ? eligible : windows;
  const scored = [...pool].sort((a, b) => windowScore(b) - windowScore(a));
  const id = scored[0]?.window_id;
  return typeof id === "number" ? id : undefined;
}

export function windowScore(window: Record<string, unknown>): number {
  const frame = frameOf(window);
  const width = frame?.width ?? 0;
  const height = frame?.height ?? 0;
  const area = width * height;
  const title = String(window.title ?? window.name ?? "");
  let score = 0;
  if (window.is_main === true || window.main === true || window.is_document === true) score += 1e8;
  const role = String(window.role ?? window.window_role ?? "").toLowerCase();
  if (role.includes("document") || role === "axwindow" || role === "window") score += 1e6;
  if (window.on_current_space === false || window.is_on_screen === false) score -= 1e9;
  if (height > 0 && height < 40) score -= 1e8;
  if (width > 0 && width < 80) score -= 1e6;
  score += Math.min(area, 4_000_000);
  if (!title.trim()) score -= 5e5;
  if (/aux(iliary)?|palette|inspector|toolbar|menu|popup|tooltip|hud|status/i.test(title)) score -= 1e6;
  if (/\.(rtf|txt|md|doc|docx|html)$/i.test(title) || /^untitled/i.test(title) || /document/i.test(title)) {
    score += 1e5;
  }
  score += (typeof window.z_index === "number" ? window.z_index : 0) * 10;
  return score;
}

function normalizeElements(value: unknown): SnapshotElement[] {
  return asArray<Record<string, unknown>>(value).flatMap((item) => {
    if (typeof item.element_index !== "number") return [];
    return [
      {
        element_index: item.element_index,
        driver_index: item.element_index,
        element_token: optionalString(item.element_token),
        role: optionalString(item.role),
        label: optionalString(item.label),
        value: optionalString(item.value),
        identifier: optionalString(item.identifier ?? item.id),
        actions: asArray<string>(item.actions),
        frame: asRecord(item.frame) as SnapshotElement["frame"],
      },
    ];
  });
}

/** Keep top-level menu-bar context while dropping enormous, closed menu trees. */
export function pruneMenuSubtrees(tree: string): { tree: string; hiddenIndices: Set<number> } {
  if (!tree) return { tree, hiddenIndices: new Set() };
  const kept: string[] = [];
  const hiddenIndices = new Set<number>();
  let menuBarIndent: number | undefined;
  for (const line of tree.split("\n")) {
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    if (/^\s*-\s+(?:\[\d+\]\s+)?AXMenuBar\b/.test(line)) {
      menuBarIndent = indent;
      kept.push(line);
      continue;
    }
    if (menuBarIndent !== undefined) {
      if (indent <= menuBarIndent) {
        menuBarIndent = undefined;
      } else if (indent > menuBarIndent + 2 || !/\bAXMenuBarItem\b/.test(line)) {
        const index = line.match(/\[(\d+)\]/)?.[1];
        if (index !== undefined) hiddenIndices.add(Number(index));
        continue;
      }
    }
    kept.push(line);
  }
  return { tree: kept.join("\n"), hiddenIndices };
}

/** Flatten Cua's multi-line custom-action descriptor into one readable action. */
export function sanitizeTreeText(tree: string): string {
  return tree.replace(
    /,name:([^\n\]]+)\ntarget:[^\n]*\nselector:[^\]]*/g,
    (_match, name: string) => `,${name.trim()}`,
  );
}

/** Reuse public element indices across snapshots even when the helper renumbers its walk. */
export function stabilizeElementIndices(
  previous: SnapshotElement[],
  current: SnapshotElement[],
  compactInitial = false,
): SnapshotElement[] {
  if (previous.length === 0) {
    return current.map((element, index) => ({
      ...element,
      driver_index: element.driver_index ?? element.element_index,
      element_index: compactInitial ? index : element.element_index,
    }));
  }
  const unused = new Set(previous.map((element) => element.element_index));
  let nextIndex = Math.max(-1, ...previous.map((element) => element.element_index)) + 1;
  return current.map((element) => {
    const candidates = previous.filter((prior) => unused.has(prior.element_index));
    const prior =
      (element.identifier
        ? candidates.find(
            (candidate) => candidate.role === element.role && candidate.identifier === element.identifier,
          )
        : undefined) ??
      (element.label
        ? candidates.find((candidate) => elementIdentity(candidate) === elementIdentity(element))
        : undefined) ??
      candidates.find(
        (candidate) =>
          candidate.role === element.role &&
          candidate.driver_index === element.driver_index,
      ) ??
      candidates.find((candidate) => elementIdentity(candidate) === elementIdentity(element));
    if (prior) unused.delete(prior.element_index);
    return {
      ...element,
      driver_index: element.driver_index ?? element.element_index,
      element_index: prior?.element_index ?? nextIndex++,
    };
  });
}

function elementIdentity(element: SnapshotElement): string {
  return element.identifier
    ? [element.role ?? "", "id", element.identifier].join("\u0000")
    : [element.role ?? "", "label", element.label ?? ""].join("\u0000");
}

function remapTreeIndices(tree: string, elements: SnapshotElement[]): string {
  const indices = new Map(elements.map((element) => [element.driver_index ?? element.element_index, element.element_index]));
  return tree.replace(/\[(\d+)\]/g, (match, raw: string) => {
    const stable = indices.get(Number(raw));
    return stable === undefined ? match : `[${stable}]`;
  });
}

function renderTree(elements: SnapshotElement[]): string {
  if (elements.length === 0) return "";
  return elements.map((element) => formatElement(element)).join("\n");
}

function extractClipboard(structured: unknown): Record<string, unknown> | undefined {
  const record = asRecord(structured);
  if (!record) return undefined;
  const payload: Record<string, unknown> = {};
  const text = optionalString(record.text) ?? optionalString(record.plain_text);
  const html = optionalString(record.html) ?? optionalString(record.html_text);
  const markdown = optionalString(record.markdown) ?? optionalString(record.md);
  if (text) payload.text = text;
  if (html) payload.html = html;
  if (markdown) payload.markdown = markdown;
  return Object.keys(payload).length > 0 ? payload : undefined;
}

function clipboardWritePayload(format: PasteFormat, text: string): Record<string, unknown> {
  if (format === "html") {
    return { text: stripHtml(text) || text, html: text };
  }
  if (format === "md") {
    return { text, markdown: text };
  }
  return { text };
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, "").trim();
}

function isApplicationRecord(
  record: Record<string, unknown>,
  options: { fromAppsArray: boolean; hasGuiHints: boolean },
): boolean {
  if (isKernelProcess(record)) return false;
  const bundle = optionalString(record.bundle_id);
  const path = optionalString(record.launch_path) ?? optionalString(record.path);
  const hasWindows = Array.isArray(record.windows) && record.windows.length > 0;
  if (bundle || path || hasWindows) return true;
  if (record.has_gui === true || record.is_app === true) return true;
  if (options.hasGuiHints) return false;
  return options.fromAppsArray || Boolean(optionalString(record.name) ?? optionalString(record.displayName));
}

function isKernelProcess(record: Record<string, unknown>): boolean {
  const name = (optionalString(record.name) ?? optionalString(record.displayName) ?? "").trim();
  if (!name) return true;
  if (name.startsWith("[")) return true;
  return /^(init|kthreadd|kworker\/|ksoftirqd|migration\/|rcu_|systemd|kernel_task)$/i.test(name);
}

function frameOf(record: Record<string, unknown>): { width: number; height: number } | undefined {
  const frame = asRecord(record.frame) ?? asRecord(record.bounds) ?? record;
  const width = Number(frame.width ?? frame.w);
  const height = Number(frame.height ?? frame.h);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined;
  return { width, height };
}

async function screenshotFromFile(
  path: string,
  frame?: { width: number; height: number },
): Promise<Screenshot | undefined> {
  try {
    const bytes = await readFile(path);
    const meta = readImageMeta(bytes);
    return {
      url: pathToFileURL(path).href,
      width: meta?.width,
      height: meta?.height,
      format: meta?.format,
      scale: meta ? inferScreenshotScale(meta, frame) : undefined,
    };
  } catch {
    return { url: pathToFileURL(path).href };
  }
}

async function maybeWriteScreenshot(structured: Record<string, unknown>, fallbackPath: string): Promise<string | null> {
  if (typeof structured.screenshot_file_path === "string") return structured.screenshot_file_path;
  const b64 = optionalString(structured.screenshot_png_b64);
  if (!b64) return null;
  await writeFilePrivate(fallbackPath, Buffer.from(b64, "base64"));
  return fallbackPath;
}

function normalizeLastUsed(value: unknown): string | number | undefined {
  if (typeof value === "number") {
    if (value > 1e12) return Math.floor(value / 1000);
    return value;
  }
  if (typeof value !== "string" || !value) return undefined;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && /^\d+(\.\d+)?$/.test(value)) {
    return asNumber > 1e12 ? Math.floor(asNumber / 1000) : asNumber;
  }
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return Math.floor(parsed / 1000);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeAppKey(app: string): string {
  return app.trim().toLowerCase();
}

function windowKey(resolved: ResolvedApp): string {
  return `${resolved.pid}:${resolved.windowId ?? 0}`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "app";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
