export type OpenSkyTarget = "mac" | "win" | "linux";

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
}

export interface AppState {
  app: string;
  screenshot: Screenshot | null;
  text: string;
}

export interface OpenSky {
  readonly target: OpenSkyTarget;
  list_apps(): Promise<App[]>;
  get_app_state(args: {
    app: string;
    disableDiff?: boolean;
    includeScreenshot?: boolean;
  }): Promise<AppState>;
  bring_to_front(args: { app: string }): Promise<void>;
  click(args: {
    app: string;
    element_index?: number;
    x?: number;
    y?: number;
    mouse_button?: MouseButton;
    click_count?: number;
  }): Promise<void>;
  drag(args: {
    app: string;
    from_x: number;
    from_y: number;
    to_x: number;
    to_y: number;
  }): Promise<void>;
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
  call(tool: string, args?: Record<string, unknown>): Promise<DriverResult>;
  status(): Promise<{ running: boolean; text: string }>;
  ensureDaemon(): Promise<void>;
}

export interface ResolvedApp {
  query: string;
  name: string;
  bundleId?: string;
  launchPath?: string;
  pid: number;
  windowId?: number;
  snapshotId?: string;
}

export interface SnapshotElement {
  element_index: number;
  /** Current helper index; element_index is OpenSky's stable public index. */
  driver_index?: number;
  element_token?: string;
  role?: string;
  label?: string;
  value?: string;
  identifier?: string;
  actions?: string[];
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
}

export interface OpenSkyOptions {
  driver?: DriverClient;
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
}
