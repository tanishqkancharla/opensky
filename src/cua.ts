import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { OpenSkyError } from "./errors.js";
import { opensky as defaultOpenSky } from "./opensky.js";
import type {
  App as LegacyAppInfo,
  AppState,
  MouseButton,
  OpenSky as OpenSkyApi,
  PasteFormat,
  SelectionType,
  TargetHandle,
} from "./types.js";

export type Vec2 = [x: number, y: number];
export type NativeDirection = "up" | "down" | "left" | "right" | "u" | "d" | "l" | "r";
export type NativeSelectionType = "text" | "cursor_before" | "cursor_after";

export interface ObservationOptions { emit?: boolean }
export interface StateOptions extends ObservationOptions {
  disableDiffing?: boolean;
  /** OpenSky extension: request a fresh semantic view narrowed to matching content. */
  query?: string;
}
export interface PasteOptions { format?: PasteFormat }
export interface ClickOptions { mouseButton?: MouseButton; clickCount?: number }
export interface SelectTextOptions {
  prefix?: string;
  suffix?: string;
  selectionType?: NativeSelectionType;
}

export interface StateAndScreenshot {
  state: string;
  screenshot?: Uint8Array;
}

export interface AppInfo {
  id: string;
  displayName?: string;
  lastUsedDate?: string | number;
  useCount?: number;
  isRunning?: boolean;
}

export interface BrowserTabInfo {
  id: string;
  providerTabId?: string;
  title?: string;
  url?: string;
}

export interface BrowserInfo {
  id: string;
  name?: string;
  family?: string;
  type?: "iab" | "extension" | "cdp";
  profileName?: string;
  metadata?: { extensionInstanceId?: string; codexSessionId?: string };
}

export interface TabInfo extends BrowserTabInfo { browserId: string }
export interface BrowserState extends BrowserInfo { tabs: BrowserTabInfo[] }
export interface CuaState { apps: AppInfo[]; browsers: BrowserState[] }
export interface BrowserOptions extends ObservationOptions { browser?: string }
export interface GetBrowserOptions { id?: string; url?: string }
export interface CreateBrowserTabOptions { visible?: boolean; sessionName?: string }

export interface Target {
  getAXState(options?: StateOptions): Promise<string>;
  getScreenshot(options?: ObservationOptions): Promise<Uint8Array>;
  getAXStateAndScreenshot(options?: StateOptions): Promise<StateAndScreenshot>;
  paste(text: string, options?: PasteOptions): Promise<void>;
  click(target: number | Vec2, options?: ClickOptions): Promise<void>;
  drag(from: Vec2, to: Vec2): Promise<void>;
  pressKey(key: string): Promise<void>;
  scroll(target: number | Vec2, direction: NativeDirection, pages?: number): Promise<void>;
  selectText(elementIndex: number, text: string, options?: SelectTextOptions): Promise<void>;
  setValue(elementIndex: number, value: string): Promise<void>;
  typeText(text: string): Promise<void>;
  performSecondaryAction(elementIndex: number, action: string): Promise<void>;
}

export interface App extends Target {}
export interface Tab extends Target {
  readonly id: string;
  readonly browserId: string;
  goto(url: string): Promise<void>;
  back(): Promise<void>;
  forward(): Promise<void>;
  reload(): Promise<void>;
  close(): Promise<void>;
  markDeliverable(): Promise<void>;
  markHandoff(): Promise<void>;
}

export interface Browser {
  readonly browserId: string;
  documentation(): Promise<string>;
}

export interface CuaFacadeOptions {
  emit?: (value: unknown) => void;
  markDeliverable?: (tab: TabInfo) => void | Promise<void>;
  markHandoff?: (tab: TabInfo) => void | Promise<void>;
}

export class CuaUnsupportedError extends OpenSkyError {
  constructor(operation: string, detail: string) {
    super(`Unsupported native-compatibility operation ${JSON.stringify(operation)}: ${detail}`, "cua_unsupported");
    this.name = "CuaUnsupportedError";
  }
}

export class CuaTargetClosedError extends OpenSkyError {
  constructor(handle: string) {
    super(`Exact target ${JSON.stringify(handle)} is closed; no app was resolved and no input was sent.`, "cua_target_closed");
    this.name = "CuaTargetClosedError";
  }
}

export class CuaTargetNotFoundError extends OpenSkyError {
  constructor(id: string) {
    super(`No exact OpenSky-owned tab matches ${JSON.stringify(id)}; no target was opened and no input was sent.`, "cua_target_not_found");
    this.name = "CuaTargetNotFoundError";
  }
}

type OwnedTabRecord = {
  handle: TargetHandle;
  browserId: string;
  profileName?: string;
  title?: string;
  url?: string;
  closed: boolean;
};

const BROWSERS = Object.freeze({
  chrome: { id: "chrome", app: "Google Chrome", name: "Google Chrome", family: "chromium" },
  edge: { id: "edge", app: "Microsoft Edge", name: "Microsoft Edge", family: "chromium" },
});

export class CuaFacade {
  private readonly tabs = new Map<string, OwnedTabRecord>();
  private readonly pendingStates = new Map<TargetHandle, AppState>();

  constructor(
    readonly opensky: OpenSkyApi,
    private readonly options: CuaFacadeOptions = {},
  ) {}

  async getState(options: ObservationOptions = {}): Promise<CuaState> {
    const state = { apps: await this.listApps({ emit: false }), browsers: this.browserStates() };
    this.emit(state, options);
    return state;
  }

  async listApps(options: ObservationOptions = {}): Promise<AppInfo[]> {
    const apps = (await this.opensky.list_apps()).map(mapAppInfo);
    this.emit(apps, options);
    return apps;
  }

  async getApp(app: string): Promise<App> {
    if (!app?.trim()) throw new OpenSkyError("Invalid params: app is required", "invalid_params");
    const state = await this.opensky.get_app_state({ app, disableDiff: true, includeScreenshot: false });
    this.options.emit?.(state.text);
    return new BoundApp(this, state.targetHandle);
  }

  async listBrowsers(options: ObservationOptions = {}): Promise<BrowserInfo[]> {
    const browsers = this.browserStates().map(({ tabs: _tabs, ...browser }) => browser);
    this.emit(browsers, options);
    return browsers;
  }

  async listTabs(options: BrowserOptions = {}): Promise<TabInfo[]> {
    const browserId = options.browser ? normalizeBrowserId(options.browser) : undefined;
    const tabs = [...this.tabs.values()]
      .filter((tab) => !tab.closed && (!browserId || tab.browserId === browserId))
      .map(tabInfo);
    this.emit(tabs, options);
    return tabs;
  }

  async getBrowser(options: GetBrowserOptions = {}): Promise<Browser> {
    let browserId = options.id ? normalizeBrowserId(options.id) : undefined;
    if (options.url) {
      const matches = [...this.tabs.values()].filter((tab) => !tab.closed && tab.url === options.url);
      if (matches.length !== 1) {
        throw new CuaTargetNotFoundError(options.url);
      }
      if (browserId && matches[0]!.browserId !== browserId) throw new CuaTargetNotFoundError(options.url);
      browserId = matches[0]!.browserId;
    }
    if (!browserId) {
      const ids = [...new Set([...this.tabs.values()].filter((tab) => !tab.closed).map((tab) => tab.browserId))];
      if (ids.length !== 1) {
        throw new CuaUnsupportedError("getBrowser", "pass an exact browser id when zero or multiple owned browser providers exist");
      }
      browserId = ids[0]!;
    }
    const browser = new BoundBrowser(browserId);
    this.options.emit?.(await browser.documentation());
    return browser;
  }

  async createBrowserTab(browser: string, url?: string, options: CreateBrowserTabOptions = {}): Promise<Tab> {
    const browserId = normalizeBrowserId(browser);
    const descriptor = BROWSERS[browserId as keyof typeof BROWSERS];
    if (!descriptor) throw new CuaUnsupportedError("createBrowserTab", `browser ${JSON.stringify(browser)} is not supported`);
    const normalizedUrl = normalizeBrowserUrl(url ?? "");
    if (options.visible === false) {
      throw new CuaUnsupportedError("createBrowserTab", "hidden browser tabs are unavailable; the isolated Chromium window is visible");
    }
    const state = await this.opensky.open_target({ app: descriptor.app, targets: [normalizedUrl], includeScreenshot: false });
    if (state.target?.tab?.status !== "verified") {
      throw new CuaUnsupportedError("createBrowserTab", "the driver did not return a verified exact tab binding");
    }
    const record: OwnedTabRecord = {
      handle: state.targetHandle,
      browserId,
      profileName: options.sessionName,
      title: state.target.tab.title ?? state.target.document.title,
      url: state.target.tab.url ?? state.target.document.url ?? normalizedUrl,
      closed: false,
    };
    this.tabs.set(record.handle, record);
    this.options.emit?.(state.text);
    return new BoundTab(this, record);
  }

  async getTab(id: string, options: BrowserOptions = {}): Promise<Tab> {
    const record = this.tabs.get(id);
    if (!record) throw new CuaTargetNotFoundError(id);
    if (record.closed) throw new CuaTargetClosedError(id);
    if (options.browser && normalizeBrowserId(options.browser) !== record.browserId) {
      throw new CuaTargetNotFoundError(id);
    }
    const tab = new BoundTab(this, record);
    await tab.getAXState({ disableDiffing: true, emit: options.emit });
    return tab;
  }

  target(handle: TargetHandle, kind: "app" | "tab" = "app"): App | Tab {
    if (kind === "tab") {
      const record = this.tabs.get(handle);
      if (!record) throw new CuaTargetNotFoundError(handle);
      if (record.closed) throw new CuaTargetClosedError(handle);
      return new BoundTab(this, record);
    }
    return new BoundApp(this, handle);
  }

  assertOpen(handle: TargetHandle): void {
    const tab = this.tabs.get(handle);
    if (tab?.closed) throw new CuaTargetClosedError(handle);
  }

  prepareAction(handle: TargetHandle): void {
    this.assertOpen(handle);
    this.pendingStates.delete(handle);
  }

  async state(handle: TargetHandle, options: StateOptions, screenshot: boolean): Promise<AppState> {
    this.assertOpen(handle);
    const pending = this.pendingStates.get(handle);
    if (pending && !screenshot && options.disableDiffing !== true && options.query === undefined) {
      this.pendingStates.delete(handle);
      return pending;
    }
    // A stronger fresh observation supersedes any state captured by an earlier
    // navigation, so never let that older state leak into a later call.
    this.pendingStates.delete(handle);
    const state = await this.opensky.get_app_state({
      app: handle,
      disableDiff: options.disableDiffing,
      includeScreenshot: screenshot,
      ...(options.query === undefined ? {} : { query: options.query }),
    });
    const tab = this.tabs.get(handle);
    if (tab && state.target?.tab?.status === "verified") {
      tab.title = state.target.tab.title ?? state.target.document.title;
      tab.url = state.target.tab.url ?? state.target.document.url;
    }
    return state;
  }

  emit(value: unknown, options: ObservationOptions = {}): void {
    if (options.emit !== false) this.options.emit?.(value);
  }

  closeTab(record: OwnedTabRecord): void {
    record.closed = true;
    this.pendingStates.delete(record.handle);
  }

  rememberState(state: AppState): void {
    this.pendingStates.set(state.targetHandle, state);
  }

  async mark(kind: "deliverable" | "handoff", record: OwnedTabRecord): Promise<void> {
    const callback = kind === "deliverable" ? this.options.markDeliverable : this.options.markHandoff;
    if (!callback) {
      throw new CuaUnsupportedError(
        kind === "deliverable" ? "markDeliverable" : "markHandoff",
        "this is host metadata and no host callback was configured",
      );
    }
    await callback(tabInfo(record));
  }

  private browserStates(): BrowserState[] {
    const grouped = new Map<string, OwnedTabRecord[]>();
    for (const tab of this.tabs.values()) {
      if (tab.closed) continue;
      const current = grouped.get(tab.browserId) ?? [];
      current.push(tab);
      grouped.set(tab.browserId, current);
    }
    return [...grouped].map(([id, tabs]) => {
      const descriptor = BROWSERS[id as keyof typeof BROWSERS];
      return {
        id,
        name: descriptor?.name ?? id,
        family: descriptor?.family,
        type: "cdp" as const,
        profileName: tabs.length === 1 ? tabs[0]?.profileName : undefined,
        tabs: tabs.map(({ browserId: _browserId, ...tab }) => {
          const info = tabInfo({ ...tab, browserId: id });
          return { id: info.id, providerTabId: info.providerTabId, title: info.title, url: info.url };
        }),
      };
    });
  }
}

abstract class BoundTarget implements Target {
  protected constructor(protected readonly facade: CuaFacade, readonly targetHandle: TargetHandle) {}

  toJSON() { return { targetHandle: this.targetHandle, kind: this instanceof BoundTab ? "tab" : "app" }; }

  async getAXState(options: StateOptions = {}): Promise<string> {
    const state = await this.facade.state(this.targetHandle, options, false);
    this.facade.emit(state.text, options);
    return state.text;
  }

  async getScreenshot(options: ObservationOptions = {}): Promise<Uint8Array> {
    const state = await this.facade.state(this.targetHandle, {}, true);
    if (!state.screenshot) throw new CuaUnsupportedError("getScreenshot", "the exact target returned no screenshot");
    const screenshot = new Uint8Array(await readFile(fileURLToPath(state.screenshot.url)));
    this.facade.emit(screenshot, options);
    return screenshot;
  }

  async getAXStateAndScreenshot(options: StateOptions = {}): Promise<StateAndScreenshot> {
    const state = await this.facade.state(this.targetHandle, options, true);
    const result: StateAndScreenshot = { state: state.text };
    if (state.screenshot) result.screenshot = new Uint8Array(await readFile(fileURLToPath(state.screenshot.url)));
    this.facade.emit(result, options);
    return result;
  }

  async paste(text: string, options: PasteOptions = {}): Promise<void> {
    this.facade.assertOpen(this.targetHandle);
    if (this instanceof BoundTab) {
      throw new CuaUnsupportedError(
        "Tab.paste",
        "Cua Driver has no safe clipboard paste route; use setValue(elementIndex, text), or click a semantic editable target before typeText when typing semantics are acceptable",
      );
    }
    await this.facade.opensky.paste({ app: this.targetHandle, text, format: options.format });
  }

  async click(target: number | Vec2, options: ClickOptions = {}): Promise<void> {
    this.facade.prepareAction(this.targetHandle);
    const translated = typeof target === "number" ? { element_index: target } : point(target);
    await this.facade.opensky.click({
      app: this.targetHandle,
      ...translated,
      mouse_button: options.mouseButton,
      click_count: options.clickCount,
    });
  }

  async drag(from: Vec2, to: Vec2): Promise<void> {
    this.facade.prepareAction(this.targetHandle);
    const start = point(from);
    const end = point(to);
    await this.facade.opensky.drag({
      app: this.targetHandle,
      from_x: start.x,
      from_y: start.y,
      to_x: end.x,
      to_y: end.y,
    });
  }

  async pressKey(key: string): Promise<void> {
    this.facade.prepareAction(this.targetHandle);
    await this.facade.opensky.press_key({ app: this.targetHandle, key });
  }

  async scroll(target: number | Vec2, direction: NativeDirection, pages?: number): Promise<void> {
    this.facade.prepareAction(this.targetHandle);
    const translated = typeof target === "number" ? { element_index: target } : point(target);
    await this.facade.opensky.scroll({ app: this.targetHandle, ...translated, direction, pages });
  }

  async selectText(elementIndex: number, text: string, options: SelectTextOptions = {}): Promise<void> {
    this.facade.prepareAction(this.targetHandle);
    await this.facade.opensky.select_text({
      app: this.targetHandle,
      element_index: elementIndex,
      text,
      prefix: options.prefix,
      suffix: options.suffix,
      selection_type: options.selectionType as SelectionType | undefined,
    });
  }

  async setValue(elementIndex: number, value: string): Promise<void> {
    this.facade.prepareAction(this.targetHandle);
    await this.facade.opensky.set_value({ app: this.targetHandle, element_index: elementIndex, value });
  }

  async typeText(text: string): Promise<void> {
    this.facade.prepareAction(this.targetHandle);
    await this.facade.opensky.type_text({ app: this.targetHandle, text });
  }

  async performSecondaryAction(elementIndex: number, action: string): Promise<void> {
    this.facade.prepareAction(this.targetHandle);
    await this.facade.opensky.perform_secondary_action({ app: this.targetHandle, element_index: elementIndex, action });
  }
}

class BoundApp extends BoundTarget implements App {
  constructor(facade: CuaFacade, handle: TargetHandle) { super(facade, handle); }
}

class BoundTab extends BoundTarget implements Tab {
  constructor(facade: CuaFacade, private readonly record: OwnedTabRecord) { super(facade, record.handle); }
  get id() { return this.record.handle; }
  get browserId() { return this.record.browserId; }

  async goto(url: string): Promise<void> { await this.navigate({ url }); }
  async back(): Promise<void> { await this.navigate({ action: "back" }); }
  async forward(): Promise<void> { await this.navigate({ action: "forward" }); }
  async reload(): Promise<void> { await this.navigate({ action: "reload" }); }

  async close(): Promise<void> {
    this.facade.prepareAction(this.targetHandle);
    await this.facade.opensky.close_target({ app: this.targetHandle });
    this.facade.closeTab(this.record);
  }

  async markDeliverable(): Promise<void> { this.facade.assertOpen(this.targetHandle); await this.facade.mark("deliverable", this.record); }
  async markHandoff(): Promise<void> { this.facade.assertOpen(this.targetHandle); await this.facade.mark("handoff", this.record); }

  private async navigate(destination: { url: string } | { action: "back" | "forward" | "reload" }): Promise<void> {
    this.facade.prepareAction(this.targetHandle);
    const state = "url" in destination
      ? await this.facade.opensky.navigate({ app: this.targetHandle, url: destination.url, includeScreenshot: false })
      : await this.facade.opensky.navigate({ app: this.targetHandle, action: destination.action, includeScreenshot: false });
    this.record.title = state.target?.tab?.status === "verified" ? state.target.tab.title : state.target?.document.title;
    this.record.url = state.target?.tab?.status === "verified" ? state.target.tab.url : state.target?.document.url;
    this.facade.rememberState(state);
  }
}

class BoundBrowser implements Browser {
  constructor(readonly browserId: string) {}
  async documentation(): Promise<string> {
    return `OpenSky browser ${JSON.stringify(this.browserId)} exposes only exact tabs created by cua.createBrowserTab; user-owned tabs are not discoverable or closable.`;
  }
}

export function createCua(opensky: OpenSkyApi, options: CuaFacadeOptions = {}): CuaFacade {
  return new CuaFacade(opensky, options);
}

/** Native-style facade over the package singleton. Prefer createCua for explicit lifecycle ownership. */
export const cua = createCua(defaultOpenSky);

function point(value: Vec2): { x: number; y: number } {
  if (!Array.isArray(value) || value.length !== 2 || value.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
    throw new OpenSkyError("Invalid params: coordinate target must be a finite [x, y] pair", "invalid_params");
  }
  return { x: value[0], y: value[1] };
}

function normalizeBrowserId(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "chrome" || normalized === "google chrome" || normalized === "com.google.chrome") return "chrome";
  if (normalized === "edge" || normalized === "microsoft edge" || normalized === "com.microsoft.edgemac") return "edge";
  if (normalized === "iab") throw new CuaUnsupportedError("browser selection", "the in-app browser provider is not implemented by Cua Driver");
  throw new CuaUnsupportedError("browser selection", `unknown browser id ${JSON.stringify(value)}`);
}

function normalizeBrowserUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new CuaUnsupportedError("createBrowserTab", "a URL is required because Cua Driver cannot create an exactly-bound blank tab");
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try { parsed = new URL(candidate); }
  catch { throw new CuaUnsupportedError("createBrowserTab", `invalid browser URL ${JSON.stringify(value)}`); }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname) {
    throw new CuaUnsupportedError("createBrowserTab", "only http/https URLs can create an exact typed OpenSky-owned tab");
  }
  return parsed.href;
}

function mapAppInfo(app: LegacyAppInfo): AppInfo {
  return {
    id: app.id,
    displayName: app.displayName,
    lastUsedDate: app.lastUsedDate,
    useCount: app.useCount,
    isRunning: app.isRunning,
  };
}

function tabInfo(tab: OwnedTabRecord): TabInfo {
  return { id: tab.handle, browserId: tab.browserId, title: tab.title, url: tab.url };
}
