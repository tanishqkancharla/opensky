import type { CuaDriverOptions } from "./driver.js";

export type OpenSkyTarget = "mac" | "win" | "linux";

/** Opaque exact-target selector returned by OpenSky. Pass it anywhere `app` is accepted. */
export type TargetHandle = `tgt_${string}`;

export type Direction =
  | "up"
  | "down"
  | "left"
  | "right"
  | "u"
  | "d"
  | "l"
  | "r";

export type SelectionType = "text" | "exact" | "cursor_before" | "cursor_after";

export type MouseButton =
  | "left"
  | "right"
  | "middle"
  | "l"
  | "r"
  | "m"
  | 0
  | 1
  | 2;

export type PasteFormat = "text" | "md" | "html";
export type NavigationAction = "back" | "forward" | "reload";

export interface App {
  id: string;
  displayName?: string;
  lastUsedDate?: string | number;
  useCount?: number;
  isRunning?: boolean;
}

export interface Screenshot {
  url: string;
  width?: number;
  height?: number;
  scale?: number;
  format?: "png" | "jpeg";
  /** Exact typed-browser screenshots use viewport CSS pixels for input. */
  coordinateSpace?: "viewport_css_px";
  /** Multiply screenshot x pixels by this value before exact-tab input. */
  pixelToCssScaleX?: number;
  /** Multiply screenshot y pixels by this value before exact-tab input. */
  pixelToCssScaleY?: number;
  viewportCssWidth?: number;
  viewportCssHeight?: number;
}

export interface AppState {
  app: string;
  /** Opaque exact-target selector. Pass it anywhere `app` is accepted. */
  targetHandle: TargetHandle;
  screenshot: Screenshot | null;
  text: string;
  /** True when the exact window was observed but its AX tree could not be resolved. */
  degraded?: boolean;
  degradedReason?: string;
  /** Honest target/document identity; tab identity remains unverified without typed browser binding. */
  target?: TargetIdentity;
}

export type TargetResourceKind = "url" | "path" | "mixed";
export type TargetWindowSource = "launch_result" | "post_launch_list" | "none";
export type TargetWindowCorrelation = "new_since_request" | "title_match" | "uncorrelated" | "none";

export interface TargetRequestIdentity {
  requested: string[];
  resourceKind: TargetResourceKind;
  requestDispatch: "sent" | "unknown";
  window: {
    id?: number;
    source: TargetWindowSource;
    correlation: TargetWindowCorrelation;
  };
}

export interface TargetIdentity extends TargetRequestIdentity {
  /** Opaque selector for this exact window/tab. Pass it as `app` to address this target again. */
  handle: TargetHandle;
  document: {
    freshness: "current" | "unavailable";
    title?: string;
    url?: string;
    source?: "ax_web_area" | "ax_document";
    requestRelation: "exact" | "different" | "unknown";
  };
  /** Present only when the target is web content. */
  tab?:
    | { status: "unverified" }
    | { status: "verified"; title?: string; url?: string };
}

export interface OpenSky {
  readonly target: OpenSkyTarget;
  list_apps(): Promise<App[]>;
  get_app_state(args: {
    app: string;
    disableDiff?: boolean;
    includeScreenshot?: boolean;
    includeAppChrome?: boolean;
    /** Narrow an exact typed browser snapshot to matching semantic content. */
    query?: string;
  }): Promise<AppState>;
  open_target(args: {
    app: string;
    targets: string[];
    includeScreenshot?: boolean;
    /** Optional human-readable label embedded in a unique owned browser-session id. */
    sessionName?: string;
    /** Narrow the initial exact typed browser observation. */
    query?: string;
  }): Promise<AppState>;
  /** Navigate an existing exact typed-browser tab and return its settled state. */
  navigate(args: ({ app: string; url: string; action?: never } | {
    app: string;
    action: NavigationAction;
    url?: never;
  }) & {
    includeScreenshot?: boolean;
    /** Narrow the settled destination observation. */
    query?: string;
  }): Promise<AppState>;
  /** Cooperatively close one exact browser tab or native window owned by open_target. */
  close_target(args: { app: string }): Promise<void>;
  bring_to_front(args: { app: string }): Promise<void>;
  click(args: {
    app: string;
    element_index?: number;
    x?: number;
    y?: number;
    mouse_button?: MouseButton;
    click_count?: number;
  }): Promise<void>;
  drag(args: ({
    app: string;
    from_x: number;
    from_y: number;
    to_x: number;
    to_y: number;
    from_element_index?: never;
    to_element_index?: never;
  } | {
    app: string;
    from_element_index: number;
    to_element_index: number;
    from_x?: never;
    from_y?: never;
    to_x?: never;
    to_y?: never;
  })): Promise<void>;
  paste(args: {
    app: string;
    text: string;
    format?: PasteFormat;
  }): Promise<void>;
  perform_secondary_action(args: {
    app: string;
    element_index: number;
    action: string;
  }): Promise<void>;
  press_key(args: {
    app: string;
    key: string;
    element_index?: number;
    x?: number;
    y?: number;
  }): Promise<void>;
  scroll(args: {
    app: string;
    element_index?: number;
    x?: number;
    y?: number;
    direction: Direction;
    pages?: number;
  }): Promise<void>;
  select_text(args: {
    app: string;
    element_index: number;
    text: string;
    prefix?: string;
    suffix?: string;
    selection_type?: SelectionType;
  }): Promise<void>;
  set_value(args: {
    app: string;
    element_index: number;
    value: string;
  }): Promise<void>;
  type_text(args: {
    app: string;
    text: string;
    element_index?: number;
    x?: number;
    y?: number;
  }): Promise<void>;
  /** Release driver-owned browser profiles and their helper sessions. */
  close(): Promise<void>;
}

export interface DriverCall {
  tool: string;
  args: Record<string, unknown>;
}

export interface DriverResult {
  structured: unknown;
  text: string;
  raw: unknown;
}

export interface DriverClient {
  /** Wrappers must preserve this metadata; it is correlation, not authority. */
  readonly sessionOwnership?: { kind: "cli-explicit" } | { kind: "mcp-proxy"; instanceId: string };
  call(tool: string, args?: Record<string, unknown>): Promise<DriverResult>;
  status(): Promise<{ running: boolean; text: string }>;
  ensureDaemon(): Promise<void>;
}

export interface ResolvedApp {
  /** Canonical opaque identity. App names and bundle ids are only aliases to this record. */
  handle: TargetHandle;
  /** Monotonic-enough ordering used to restore an app alias after its newest target closes. */
  openedAt: number;
  query: string;
  name: string;
  bundleId?: string;
  launchPath?: string;
  pid: number;
  windowId?: number;
  snapshotId?: string;
  /** URL targets default to their primary AXWebArea, matching a native Tab binding. */
  contentScope?: "web";
  targetRequest?: TargetRequestIdentity;
  /** Proof that this process created and may cooperatively close one exact native window. */
  nativeCloseAuthority?: NativeCloseAuthority;
  /** Exact typed-browser binding for driver-owned Chromium page content. */
  browser?: BrowserBinding;
}

export interface NativeCloseAuthority {
  kind: "request_created_exact_window";
  proof: "macos_new_application_instance";
  pid: number;
  windowId: number;
}

export interface BrowserBinding {
  session: string;
  targetId: string;
  tabId: string;
  managed: boolean;
  title?: string;
  url?: string;
  documentId?: string;
  screenshotMapping?: {
    coordinateSpace: "viewport_css_px";
    pixelToCssScaleX: number;
    pixelToCssScaleY: number;
    viewportCssWidth: number;
    viewportCssHeight: number;
  };
}

export interface SnapshotElement {
  element_index: number;
  /** Current helper index; element_index is OpenSky's stable public index. */
  driver_index?: number;
  element_token?: string;
  /** Opaque current-document capability returned by semantic_v2. */
  browser_ref?: string;
  /** Driver-reported semantic frame provenance (for example main or oopif). */
  browserFrame?: string;
  role?: string;
  label?: string;
  value?: string;
  identifier?: string;
  url?: string;
  actions?: string[];
  visibility?: string;
  /** Explicit AX value mutability when the helper publishes it. */
  settable?: boolean;
  enabled?: boolean;
  selected?: boolean;
  checked?: boolean;
  focused?: boolean;
  expanded?: boolean;
  frame?: { x: number; y: number; w: number; h: number };
}

export interface WindowSnapshot {
  pid: number;
  windowId: number;
  snapshotId?: string;
  tree: string;
  elements: SnapshotElement[];
  screenshotPath: string | null;
  screenshot?: Screenshot;
  frame?: { width: number; height: number };
  degraded?: boolean;
  degradedReason?: string;
  truncated?: boolean;
  totalElementCount?: number;
  returnedElementCount?: number;
  documentChanged?: boolean;
}

export interface OpenSkyOptions {
  /** Injected clients remain caller-owned and are never disposed by OpenSky. */
  driver?: DriverClient;
  /** Experimental persistent MCP; CLI remains the default until platform acceptance. */
  transport?: "cli" | "mcp";
  /** Configuration for an internally owned local driver, not an injected client. */
  driverOptions?: Omit<CuaDriverOptions, "session">;
  /** Stop waiting for admitted operations without claiming cleanup; defaults to 30s. */
  drainTimeoutMs?: number;
  homeDir?: string;
  screenshotDir?: string;
  session?: string;
  autoLaunch?: boolean;
  pasteModifier?: "cmd" | "ctrl";
  target?: OpenSkyTarget;
  screenshotFormat?: "png" | "jpeg";
  screenshotScale?: number;
  /** Delay after an action/launch before observing the next state. Defaults to 800ms. */
  settleDelayMs?: number;
  /** Maximum time to retry a helper-reported degraded AX snapshot. Defaults to 4s. */
  degradedRetryMs?: number;
  /** Maximum time to wait for semantic browser state to stop changing after input. Defaults to 2s. */
  browserStabilityTimeoutMs?: number;
  /** Prefer an isolated typed Chromium session for one-URL browser targets. Defaults to true. */
  preferTypedBrowser?: boolean;
}
