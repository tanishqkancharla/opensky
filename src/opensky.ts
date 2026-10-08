import { projectNativeCollectionRows } from "./native-collection-viewport.js";
import { randomUUID } from "node:crypto";
import { chmod, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { asArray, asRecord, CuaDriverClient } from "./driver.js";
import { AsyncLifecycle } from "./async-lifecycle.js";
import { StdioMcpDriverClient, type TransportCloseReceipt } from "./mcp-driver.js";
import { BrowserSessionLeaseStore, legacyBrowserSessionOwnerPid } from "./browser-session-leases.js";
import { contextBindings, contextFailure, CONTEXT_OUTLINE_BYTES, isContextToken, renderContextDirections, renderContextProjection,
  validateContextBlock, validateQueryContexts, type ContextBlock } from "./browser-context.js";
import { invalidParams, OpenSkyError } from "./errors.js";
import { displayUrlAttribute } from "./display-url.js";
import { inferScreenshotScale, readImageMeta } from "./image-meta.js";
import { parseXdotoolKey, toHotkeyKeys, toMacDriverKey } from "./keys.js";
import { detectTarget, homeDir } from "./platform.js";
import { mkdirPrivate, writeFilePrivate } from "./secure-fs.js";
import { SessionStore, sessionFile, type StoredSnapshot } from "./session-store.js";
import type {
  App,
  AppState,
  BrowserTabInventoryEntry,
  Direction,
  DriverClient,
  MouseButton,
  NavigationAction,
  PasteFormat,
  ResolvedApp,
  Screenshot,
  OpenSky as OpenSkyApi,
  OpenSkyOptions,
  OpenSkyTarget,
  SnapshotElement,
  TargetHandle,
  TargetIdentity,
  TargetRequestIdentity,
  TextSelection,
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
  delete: { kind: "key", key: "delete" },
};

// The interface makes this exhaustive: adding a public operation requires a gate.
const GUARDED_OPERATIONS = {
  list_apps: true, list_browser_tabs: true, get_app_state: true, open_target: true, attach_browser: true, navigate: true,
  close_target: true, bring_to_front: true, click: true, drag: true, paste: true,
  perform_secondary_action: true, press_key: true, scroll: true, select_text: true,
  set_value: true, type_text: true, invoke: true,
} satisfies Record<Exclude<keyof OpenSkyApi, "target" | "close"> | "invoke", true>;

export class OpenSky implements OpenSkyApi {
  readonly target: OpenSkyTarget;
  readonly driver: DriverClient;
  private readonly rawDriver: DriverClient;
  private readonly ownedMcpDriver?: StdioMcpDriverClient;
  private readonly lifecycle: AsyncLifecycle;
  private closeReceipt?: TransportCloseReceipt;
  private cleanupPersistencePending = false;
  private readonly store: SessionStore;
  private readonly screenshotDir: string;
  private readonly autoLaunch: boolean;
  private readonly screenshotFormat?: "png" | "jpeg";
  private readonly screenshotScale?: number;
  private readonly settleDelayMs: number;
  private readonly nativeSettleDelayMs: number;
  private readonly degradedRetryMs: number;
  private readonly browserStabilityTimeoutMs: number;
  private readonly session: string;
  // A close receipt is required after a base-session call might have reached
  // the driver. Constructing a facade or evaluating pure JavaScript creates no
  // such session and must not resolve or start a driver during finalization.
  private baseSessionDispatchAttempted = false;
  private readonly runtimeId: string;
  private readonly browserLeases: BrowserSessionLeaseStore;
  private readonly preferTypedBrowser: boolean;
  private readonly managedBrowserSessions = new Set<string>();
  private readonly unresolvedLegacyBrowserSessions = new Set<string>();
  private baseSessionEnded = false;
  private browserSequence = 0;
  private lastOpenedAt = 0;
  private readonly lastActionAt = new Map<string, number>();
  private readonly browserMutationsPending = new Map<TargetHandle, number>();
  private readonly resolvedThisProcess = new Set<TargetHandle>();
  private screenshotSequence = 0;
  private readonly memory = {
    targets: {} as Record<TargetHandle, ResolvedApp>,
    aliases: {} as Record<string, TargetHandle>,
    trees: {} as Record<string, StoredSnapshot>,
    managedBrowserSessions: [] as string[],
  };
  private loaded = false;
  private loading?: Promise<void>;
  private readonly quarantinedTargets = new Set<TargetHandle>();

  constructor(options: OpenSkyOptions = {}) {
    if (options.transport !== undefined && !["cli", "mcp"].includes(options.transport)) {
      throw invalidParams("transport must be cli or mcp");
    }
    if (options.driver && (options.transport !== undefined || options.driverOptions !== undefined)) {
      throw invalidParams("transport/driverOptions configure an internal driver; omit them when injecting a caller-owned driver");
    }
    this.target = options.target ?? detectTarget();
    this.runtimeId = randomUUID();
    this.session = options.session ?? `opensky-${process.pid}-${this.runtimeId.slice(0, 8)}`;
    const driverOptions = { allowExistingBrowserProfiles: true, ...options.driverOptions, session: this.session };
    this.ownedMcpDriver = !options.driver && options.transport === "mcp"
      ? new StdioMcpDriverClient(driverOptions) : undefined;
    this.rawDriver = options.driver ?? this.ownedMcpDriver ?? new CuaDriverClient(driverOptions);
    this.lifecycle = new AsyncLifecycle("OpenSky", () => this.finalizeClose(), options.drainTimeoutMs ?? 30_000);
    // Each OpenSky owns a distinct base label even when the transport is shared.
    // The exposed driver uses the same admission gate; only finalization bypasses it.
    this.driver = {
      sessionOwnership: this.rawDriver.sessionOwnership,
      call: async (tool, args = {}) => this.lifecycle.run(`driver.${tool}`, async () => {
        const effectiveArgs = { ...args, session: args.session === undefined ? this.session : args.session };
        // Fence browser mutations at dispatch, not just after their promise settles.
        // A failed input can have taken effect, and direct library calls may overlap.
        const affected = ["browser_navigate", "browser_click", "browser_type", "browser_key", "browser_pointer"].includes(tool)
          ? Object.values(this.memory.targets).filter((target) => target.browser &&
            target.browser.session === effectiveArgs.session && target.browser.targetId === args.target_id && target.browser.tabId === args.tab_id)
          : [];
        for (const target of affected) {
          this.browserMutationsPending.set(target.handle, (this.browserMutationsPending.get(target.handle) ?? 0) + 1);
          this.markAction(target);
        }
        // Set this before invoking the transport: a timeout, malformed reply,
        // or retryable error can still leave the base session active. Explicit
        // foreign labels remain caller-controlled escape hatches.
        if (effectiveArgs.session === this.session) this.baseSessionDispatchAttempted = true;
        try { return await this.rawDriver.call(tool, effectiveArgs); }
        finally {
          for (const target of affected) {
            const remaining = (this.browserMutationsPending.get(target.handle) ?? 1) - 1;
            if (remaining) this.browserMutationsPending.set(target.handle, remaining);
            else this.browserMutationsPending.delete(target.handle);
            this.markAction(target);
          }
        }
      }),
      status: async () => this.lifecycle.run("driver.status", () => this.rawDriver.status()),
      ensureDaemon: async () => this.lifecycle.run("driver.ensureDaemon", () => this.rawDriver.ensureDaemon()),
    };
    const home = homeDir(options.homeDir);
    this.store = new SessionStore(sessionFile(home));
    this.browserLeases = new BrowserSessionLeaseStore(home, this.runtimeId, process.pid, undefined, this.rawDriver.sessionOwnership);
    this.screenshotDir = options.screenshotDir ?? join(home, "screenshots");
    this.autoLaunch = options.autoLaunch !== false;
    this.screenshotFormat = options.screenshotFormat;
    this.screenshotScale = options.screenshotScale;
    this.settleDelayMs = options.settleDelayMs ?? 800;
    // Mac input already waits for exact-window delivery in the driver. Keep
    // launch retries separate from the shorter post-input observation wait.
    this.nativeSettleDelayMs = options.settleDelayMs ?? (this.target === "mac" ? 150 : 800);
    this.degradedRetryMs = options.degradedRetryMs ?? 4_000;
    this.browserStabilityTimeoutMs = options.browserStabilityTimeoutMs ?? 2_000;
    this.preferTypedBrowser = options.preferTypedBrowser !== false;
    // Count the entire operation, including state/lease persistence between calls.
    // Closing intentionally rejects later nested dispatch within admitted methods.
    for (const name of Object.keys(GUARDED_OPERATIONS) as Array<keyof typeof GUARDED_OPERATIONS>) {
      const operation = this[name] as (...args: unknown[]) => Promise<unknown>;
      Object.defineProperty(this, name, {
        configurable: false, enumerable: false, writable: false,
        value: async (...args: unknown[]) => this.lifecycle.run(name, () => operation.apply(this, args)),
      });
    }
  }

  /** Process-exit proof only; session/target cleanup still needs its own receipts. */
  get transportCloseReceipt(): TransportCloseReceipt | undefined { return this.closeReceipt; }

  async list_apps(): Promise<App[]> {
    const result = await this.driver.call("list_apps", {});
    return mapApps(result.structured);
  }

  /** Discover actionable tabs in each exact window of a running user Chromium app. */
  async list_browser_tabs(args: { app: string }): Promise<BrowserTabInventoryEntry[]> {
    if (!args?.app?.trim()) throw invalidParams("app is required");
    await this.ensureLoaded();
    const listed = await this.listRawApps();
    const match = findApp(listed, args.app);
    if (!isChromiumApp(args.app, match)) {
      throw new OpenSkyError("list_browser_tabs requires a running supported Chromium browser.");
    }
    const inventory: BrowserTabInventoryEntry[] = [];
    const processes = listed.filter((candidate) => sameAppIdentity(candidate, match));
    const seenPids = new Set<number>();

    for (const processMatch of processes) {
      const pid = Number(processMatch.pid);
      if (!Number.isSafeInteger(pid) || pid <= 0 || seenPids.has(pid)) continue;
      seenPids.add(pid);
      // Isolated browser processes are already represented by their owned CUA
      // records. Re-attaching to them as if they were user tabs would duplicate
      // identity and weaken close ownership.
      if (Object.values(this.memory.targets).some((target) => target.pid === pid && target.browser?.managed === true)) continue;
      const windows = windowsFrom((await this.driver.call("list_windows", { pid })).structured)
        .filter(isOrdinaryWindow);
      const mainWindows = windows.filter((window) => window.is_main === true || window.main === true);
      const selectedWindowId = mainWindows.length === 1
        ? Number(mainWindows[0]!.window_id)
        : pickAppWindowId(windows, pid);

      for (const window of windows) {
        const windowId = Number(window.window_id);
        if (!Number.isSafeInteger(windowId) || windowId <= 0) continue;
        let existing = Object.values(this.memory.targets).find((target) =>
          target.pid === pid && target.windowId === windowId && target.browser?.managed === false &&
          this.managedBrowserSessions.has(target.browser.session)
        );
        let session = existing?.browser?.session;
        let createdSession = false;
        if (!session) {
          session = `${this.session}-browser-existing-inventory-${process.pid}-${this.runtimeId}-${++this.browserSequence}`;
          await this.browserLeases.reserve(session);
          this.managedBrowserSessions.add(session);
          createdSession = true;
        }
        try {
          if (createdSession) {
            const preparation = await this.driver.call("browser_prepare", {
              pid,
              window_id: windowId,
              session,
              strategy: { kind: "existing_profile" },
            });
            const prepared = asRecord(preparation.structured) ?? {};
            if (prepared.status !== "ok" || prepared.prepared !== true) {
              throw new OpenSkyError("The desktop helper did not confirm existing-profile discovery.");
            }
          }
          const boundResult = await this.driver.call("get_browser_state", {
            pid,
            window_id: windowId,
            session,
          });
          const bound = asRecord(boundResult.structured) ?? {};
          if (bound.status !== "ok" || bound.binding_quality !== "exact" || bound.mutation_allowed !== true) {
            throw new OpenSkyError(`The desktop helper could not bind browser window ${windowId} exactly.`);
          }
          const targetId = optionalString(bound.target_id);
          if (!targetId) throw new OpenSkyError("Existing-browser discovery returned no exact target identity.");
          const tabs = asArray<Record<string, unknown>>(bound.tabs);
          const liveTabIds = new Set<string>();
          for (const tab of tabs) {
            const tabId = optionalString(tab.tab_id);
            if (!tabId) continue;
            liveTabIds.add(tabId);
            const title = optionalString(tab.title);
            const url = optionalString(tab.url);
            const providerActive = typeof tab.active === "boolean" ? tab.active : null;
            const active = providerActive === true && selectedWindowId !== undefined
              ? windowId === selectedWindowId
              : providerActive;
            existing = Object.values(this.memory.targets).find((target) =>
              target.browser?.session === session && target.browser.tabId === tabId
            );
            const resolved = existing ?? {
              handle: newTargetHandle(),
              openedAt: this.nextOpenedAt(),
              query: args.app,
              name: String(processMatch.name ?? args.app),
              bundleId: optionalString(processMatch.bundle_id),
              launchPath: optionalString(processMatch.launch_path),
              pid,
              windowId,
              contentScope: "web" as const,
              browser: { session, targetId, tabId, managed: false, active },
              targetRequest: {
                requested: url ? [url] : [],
                resourceKind: "url" as const,
                requestDispatch: "unknown" as const,
                window: { id: windowId, source: "post_launch_list" as const, correlation: "uncorrelated" as const },
              },
            };
            resolved.pid = pid;
            resolved.windowId = windowId;
            resolved.browser = { ...resolved.browser!, session, targetId, tabId, managed: false, title, url, active };
            resolved.targetRequest = {
              requested: url ? [url] : [],
              resourceKind: "url",
              requestDispatch: "unknown",
              window: { id: windowId, source: "post_launch_list", correlation: "uncorrelated" },
            };
            if (!existing) {
              this.registerTarget(resolved);
              this.markResolved(resolved);
            } else {
              this.memory.targets[resolved.handle] = resolved;
            }
            inventory.push({
              targetHandle: resolved.handle,
              providerTabId: tabId,
              pid,
              windowId,
              title,
              url,
              active,
              owned: false,
            });
          }
          for (const target of Object.values(this.memory.targets)) {
            if (target.browser?.session === session && !liveTabIds.has(target.browser.tabId)) {
              this.removeTarget(target.handle);
            }
          }
        } catch (error) {
          if (createdSession) {
            try {
              await this.endSessionConfirmed(session);
              await this.browserLeases.release(session);
              this.managedBrowserSessions.delete(session);
            } catch (cleanupError) {
              throw new OpenSkyError(
                `Existing-browser discovery failed (${error instanceof Error ? error.message : String(error)}), and capability cleanup also failed: ` +
                  `${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
              );
            }
          }
          throw error;
        }
      }
    }
    await this.persist();
    return inventory;
  }

  async get_app_state(args: {
    app: string;
    disableDiff?: boolean;
    collectionScope?: "visible" | "all";
    includeScreenshot?: boolean;
    includeAccessibilityTree?: boolean;
    includeAppChrome?: boolean;
    scope?: "window" | "app";
    query?: string;
    context_element_index?: number;
    continuation?: string;
  }): Promise<AppState> {
    if (!args?.app) throw invalidParams("app is required");
    if (args.collectionScope !== undefined && !["visible", "all"].includes(args.collectionScope)) throw invalidParams("collectionScope must be visible or all");
    if (args.includeAccessibilityTree === false && (args.includeScreenshot === false ||
        args.query !== undefined || args.context_element_index !== undefined || args.continuation !== undefined)) {
      throw invalidParams("Screenshot-only observation requires a screenshot and cannot include query/context");
    }
    if (args.scope !== undefined && args.scope !== "window" && args.scope !== "app") throw invalidParams("scope must be window or app");
    if (args.scope === "app" && (args.query !== undefined || args.context_element_index !== undefined || args.continuation !== undefined)) {
      throw invalidParams("App scope cannot be combined with browser query/context");
    }
    if (args.context_element_index !== undefined || args.continuation !== undefined) {
      if ((args.context_element_index !== undefined && (!Number.isSafeInteger(args.context_element_index) || args.context_element_index < 0)) ||
          (args.continuation !== undefined && (!isContextToken(args.continuation) || args.context_element_index !== undefined)) ||
          args.query !== undefined || args.includeScreenshot === true || args.includeAppChrome === true) {
        throw invalidParams("context/continuation requires one valid index or emitted cursor, and cannot be combined with query, screenshot, or app chrome");
      }
      await this.ensureLoaded();
      const bound = this.targetForSelector(args.app);
      if (!bound?.browser) {
        throw new OpenSkyError("context requires an existing exact typed browser binding. No app was launched or input sent.");
      }
      this.assertTargetUsable(bound);
      return this.browserContext(bound, args.continuation ?? args.context_element_index!);
    }
    const exactTargetRequested = looksLikeTargetHandle(args.app);
    let resolved: ResolvedApp;
    if (args.query !== undefined) {
      await this.ensureLoaded();
      const bound = this.targetForSelector(args.app);
      if (!args.query.trim() || !bound?.browser) {
        throw new OpenSkyError(
          "query requires non-empty text and an exact typed browser binding. " +
            "No native app input or browser mutation was sent.",
        );
      }
      resolved = bound;
    } else {
      resolved = await this.requireResolved(args.app);
    }
    this.assertTargetUsable(resolved);
    if (args.collectionScope !== undefined && (this.target !== "mac" || resolved.browser || resolved.contentScope === "web")) throw invalidParams("collectionScope is available only for native Mac observations");
    if (args.includeAccessibilityTree === false && resolved.browser) {
      throw invalidParams("Screenshot-only observation requires a native window; typed browser observations retain their page snapshot mapping");
    }
    if (args.includeAppChrome === true && resolved.browser) {
      throw new OpenSkyError(
        "includeAppChrome is not available for an exact typed browser binding. " +
          "Continue with page-scoped semantic state; native browser-chrome input was not enabled.",
      );
    }
    if (args.includeAppChrome === true && resolved.contentScope === "web") {
      resolved.contentScope = undefined;
      this.memory.targets[resolved.handle] = resolved;
      await this.persist();
    }
    const hadPendingAction = this.lastActionAt.has(windowKey(resolved));
    await this.settleAfterAction(resolved);
    if (args.scope === "app") {
      if (resolved.browser || resolved.contentScope === "web") throw invalidParams("App scope requires a native app, not a browser content binding");
      resolved = await this.observeAppWindow(resolved, !exactTargetRequested && this.autoLaunch);
    }
    if (resolved.browser) {
      // A typed browser snapshot revalidates its exact target/tab binding. A
      // native window inventory here adds a full driver round trip without
      // improving safety, and is especially expensive after every page action.
      this.lastActionAt.delete(windowKey(resolved));
    } else {
      await this.refreshWindowAfterAction(resolved);
    }
    if (!resolved.browser && !resolved.windowId && !exactTargetRequested) await this.adoptWindowForObservation(resolved);
    if (!resolved.browser && !resolved.windowId) {
      return {
        app: resolved.launchPath || resolved.name || args.app,
        targetHandle: resolved.handle,
        screenshot: null,
        text:
          `Application ${JSON.stringify(resolved.name)} is running but has no usable ordinary window on the current desktop. ` +
          "Use an application keyboard shortcut or menu action to create or reveal a window, then observe again.",
        target: targetIdentityFor(resolved),
      };
    }
    if (args.includeAccessibilityTree === false) {
      const screenshot = await this.captureNativeWindowScreenshot(resolved);
      await this.persist();
      return {
        app: resolved.launchPath || resolved.name || args.app,
        targetHandle: resolved.handle,
        screenshot,
        text: "",
        // A pixel capture proves window identity, not current document AX metadata.
        target: targetIdentityFor(resolved),
      };
    }
    const stored = this.memory.trees[windowKey(resolved)];
    const previous = stored?.observationBaseline ?? stored;
    const snapshot = await this.snapshotSettled(resolved, {
      includeScreenshot: args.includeScreenshot !== false,
      stabilizeBrowser: hadPendingAction,
      query: args.query?.trim(),
      collectionScope: args.collectionScope,
    });
    const text = args.query !== undefined
      ? `Semantic query ${JSON.stringify(args.query.trim())}; fresh accessibility state:\n${snapshot.tree}`
      : snapshot.documentChanged && previous && !args.disableDiff
      ? `Document changed; fresh accessibility state:\n${snapshot.tree}`
      : snapshot.degraded || args.disableDiff || args.collectionScope === "all" || !previous || previous.viewKind === "context"
        ? snapshot.tree
        : diffTrees(previous.tree, previous.elements, snapshot.tree, snapshot.elements);
    if (!snapshot.degraded) {
      this.memory.trees[windowKey(resolved)] = {
        tree: snapshot.tree,
        elements: snapshot.elements,
        snapshotId: snapshot.snapshotId,
        contextDomains: snapshot.contextDomains,
        contextContinuations: snapshot.contextContinuations,
      };
    }
    await this.persist();
    return {
      app: resolved.launchPath || resolved.name || args.app,
      targetHandle: resolved.handle,
      screenshot: snapshot.screenshot ?? (snapshot.screenshotPath ? { url: pathToFileURL(snapshot.screenshotPath).href } : null),
      text: text + selectionObservation(snapshot.textSelection) +
        (!snapshot.degraded && this.target === "mac" && !resolved.browser
          ? inlineItemEditObservation(snapshot.tree, snapshot.elements) : ""),
      ...(snapshot.textSelection ? { textSelection: snapshot.textSelection } : {}),
      degraded: snapshot.degraded,
      degradedReason: snapshot.degradedReason,
      target: targetIdentityFor(resolved, snapshot),
      ...(resolved.browser ? {
        browserConnection: {
          ...(resolved.browser.debuggerHttpUrl ? { debuggerHttpUrl: resolved.browser.debuggerHttpUrl } : {}),
          providerTabId: resolved.browser.tabId,
        },
      } : {}),
    };
  }

  /** Expand the stored observation; never settle/recollect or silently reinterpret an old index. */
  private async browserContext(resolved: ResolvedApp, selector: number | string): Promise<AppState> {
    const browser = resolved.browser!;
    const key = windowKey(resolved);
    const previous = this.memory.trees[key];
    const continuation = typeof selector === "string" ? selector : undefined;
    const expected = continuation && previous?.contextContinuations && Object.hasOwn(previous.contextContinuations, continuation)
      ? previous.contextContinuations[continuation] : undefined;
    const anchor = previous?.elements.find((element) => continuation
      ? element.browser_ref === expected?.anchorRef : element.element_index === selector);
    const inputPending = () => this.lastActionAt.has(key) || this.browserMutationsPending.has(resolved.handle);
    if (!previous?.snapshotId || !anchor?.browser_ref || (continuation !== undefined && !expected) || inputPending()) {
      throw new OpenSkyError("context requires an index from the current browser snapshot with no intervening input. Observe the tab again first.");
    }
    const fail = () => new OpenSkyError(
      "The helper could not prove same-snapshot context for this exact tab. Observe the tab again before using indices; no input was sent.",
      "browser_context_unavailable",
    );
    // AX-only observations never preserve a screenshot coordinate mapping.
    browser.screenshotMapping = undefined;
    // Single-use at the local admission boundary too; an ambiguous delivery is
    // not permission to replay the cursor. Driver independently enforces this.
    if (continuation) delete previous.contextContinuations![continuation];
    let candidate: StoredSnapshot | undefined;
    try {
      const result = await this.driver.call("get_browser_state", {
        session: browser.session, target_id: browser.targetId, tab_id: browser.tabId,
        snapshot_format: "semantic_v2", include_screenshot: false,
        ...(continuation ? { continuation } : { context_ref: anchor.browser_ref }),
      });
      const structured = asRecord(result.structured) ?? {};
      const snapshot = asRecord(structured.snapshot) ?? {};
      const incoming = normalizeBrowserElements(structured.refs, structured.content_refs);
      const context = validateContextBlock(structured.context, { snapshotId: previous.snapshotId, elements: incoming, expected });
      if (context.member_projection && (snapshot.selected_nodes !== context.member_refs!.length ||
          snapshot.total_nodes !== context.source_member_nodes! - context.projected_out_nodes!)) throw fail();
      if (this.memory.trees[key] !== previous || inputPending() ||
          structured.status !== "ok" || structured.mode !== "snapshot" ||
          structured.target_id !== browser.targetId || structured.tab_id !== browser.tabId ||
          snapshot.id !== previous.snapshotId || snapshot.format !== "semantic_v2" || snapshot.scope !== "context" ||
          !context || context.anchor_ref !== anchor.browser_ref ||
          !isSnapshotRef(context.group_ref, previous.snapshotId) ||
          (context.parent_group_ref != null && !isSnapshotRef(context.parent_group_ref, previous.snapshotId)) ||
          typeof context.order_domain !== "string" || !context.order_domain ||
          !isNonnegativeInteger(context.before_omitted) || !isNonnegativeInteger(context.after_omitted) ||
          typeof context.group_complete !== "boolean" || typeof context.document_collection_complete !== "boolean" ||
          context.virtualized_extent !== "unknown" || snapshot.complete !== context.group_complete ||
          (context.group_complete && (context.before_omitted !== 0 || context.after_omitted !== 0 || !context.document_collection_complete))) {
        throw fail();
      }
      if (!anchor.browserFrame || incoming.some((element) =>
        !isSnapshotRef(element.browser_ref, previous.snapshotId!) || element.browserFrame !== anchor.browserFrame ||
        (previous.contextDomains?.[element.browser_ref!] !== undefined && previous.contextDomains[element.browser_ref!] !== context.order_domain))) throw fail();
      const { all, visible } = mergeBrowserContextElements(previous.elements, incoming);
      // Metadata must refer to this returned window, not an unrelated previously issued row.
      if (![context.anchor_ref, context.group_ref, context.parent_group_ref].filter((ref) => ref != null)
        .every((ref) => incoming.some((element) => element.browser_ref === ref))) throw fail();
      const outline = optionalString(structured.outline) ?? "";
      if ((context.member_refs || context.before_continuation || context.after_continuation || continuation) && Buffer.byteLength(outline, "utf8") > CONTEXT_OUTLINE_BYTES) throw fail();
      const bindings = contextBindings([context], incoming);
      if (Object.keys(bindings.contextContinuations).some(token => token === continuation ||
          (previous.contextContinuations && Object.hasOwn(previous.contextContinuations, token)))) throw fail();
      const contextContinuations = { ...previous.contextContinuations, ...bindings.contextContinuations };
      if (Object.keys(contextContinuations).length > 1024) throw fail();
      const rendered = renderBrowserObservation(outline, visible, structured, false, all);
      const window: WindowSnapshot = {
        pid: resolved.pid, windowId: resolved.windowId!, snapshotId: previous.snapshotId,
        tree: rendered.text, elements: all, screenshotPath: null,
        truncated: context.group_complete !== true || rendered.truncated,
      };
      candidate = { tree: window.tree, elements: all, snapshotId: window.snapshotId, viewKind: "context",
        contextDomains: { ...previous.contextDomains, ...Object.fromEntries(incoming.map((element) => [element.browser_ref!, context.order_domain as string])) },
        contextContinuations };
      this.memory.trees[key] = candidate;
      await this.persist();
      if (this.memory.trees[key] !== candidate || inputPending()) throw fail();
      const target = targetIdentityFor(resolved, window);
      if (target) target.document.freshness = "stored";
      return { app: resolved.launchPath || resolved.name, targetHandle: resolved.handle, screenshot: null, text: window.tree, target };
    } catch (error) {
      // An older helper may ignore context_ref and collect a replacement snapshot.
      // Do not leave those now-unproven capabilities usable, or erase a newer read.
      if (this.memory.trees[key] === previous || (candidate && this.memory.trees[key] === candidate)) {
        delete this.memory.trees[key];
        await this.persist().catch(() => undefined);
      }
      throw error;
    }
  }

  async open_target(args: {
    app: string;
    targets: string[];
    includeScreenshot?: boolean;
    sessionName?: string;
    browserVisible?: boolean;
    query?: string;
  }): Promise<AppState> {
    if (!args?.app || !Array.isArray(args.targets) || args.targets.length === 0) {
      throw invalidParams("app and at least one target are required");
    }
    await this.ensureLoaded();
    if (looksLikeTargetHandle(args.app)) {
      const source = this.targetForSelector(args.app);
      if (!source) throw unknownTargetHandle(args.app);
      this.assertTargetUsable(source);
      args = {
        ...args,
        app: source.launchPath || source.bundleId || source.name,
      };
    }
    const listed = await this.listRawApps();
    const match = findApp(listed, args.app);
    const onlyTarget = args.targets.length === 1 ? args.targets[0]!.trim().toLowerCase() : undefined;
    if (onlyTarget?.startsWith("about:") && onlyTarget !== "about:blank" && isChromiumApp(args.app, match)) {
      throw invalidParams("open_target supports only about:blank among browser-internal URLs");
    }
    if (args.query !== undefined && (
      !args.query.trim() ||
      !this.preferTypedBrowser ||
      args.targets.length !== 1 ||
      !isHttpUrl(args.targets[0] ?? "") ||
      !isChromiumApp(args.app, match)
    )) {
      throw new OpenSkyError(
        "query requires non-empty text and one URL opened through an exact typed Chromium binding. " +
          "No target was opened and no native app input was sent.",
      );
    }
    const typed = await this.tryOpenTypedBrowser(args, match);
    if (typed) return typed;
    // Cua Driver's close_window is intentionally exact and cooperative. On
    // macOS, request a distinct application instance so ownership can be
    // proven from a new PID plus the exact document (or a sole ordinary
    // window when document metadata is unavailable). Other platforms do not
    // currently support this launch/close contract.
    const requestFreshNativeInstance = this.target === "mac";
    const requestedDocument = requestFreshNativeInstance && args.targets.length === 1
      ? await canonicalDocumentPath(args.targets[0]!)
      : undefined;
    const preLaunchPids = listedPids(listed);
    const previousPid = Number(match?.pid);
    const previousWindows = !requestFreshNativeInstance && Number.isFinite(previousPid) && previousPid > 0
      ? windowsFrom((await this.driver.call("list_windows", { pid: previousPid })).structured)
      : [];
    const previousIds = new Set(previousWindows
      .map((window) => window.window_id)
      .filter((id): id is number => typeof id === "number"));
    const launchArgs = {
      ...launchArgsFor(args.app, match),
      urls: args.targets,
      ...(requestFreshNativeInstance ? {
        creates_new_application_instance: true,
        // A fresh, owned instance must not resurrect unrelated saved windows.
        additional_arguments: ["-ApplePersistenceIgnoreState", "YES"],
      } : {}),
    };
    let launched = await this.driver.call("launch_app", launchArgs);
    let structured = asRecord(launched.structured) ?? {};
    let pid = Number(structured.pid ?? match?.pid);
    if (!Number.isFinite(pid) || pid <= 0) {
      throw new OpenSkyError(`Failed to open target with ${JSON.stringify(args.app)}`);
    }
    let windows = windowsFrom(structured);
    let windowSource: TargetRequestIdentity["window"]["source"] = windows.length > 0
      ? "launch_result"
      : "post_launch_list";
    if (windows.length === 0) {
      windows = windowsFrom((await this.driver.call("list_windows", { pid })).structured);
    }
    // A new process may be visible before WindowServer publishes its first
    // ordinary window. Poll the exact returned pid once; never replay the
    // non-idempotent `open -n` request and accidentally create two instances.
    if (
      requestFreshNativeInstance &&
      pickOrdinaryWindowId(windows) === undefined &&
      launchRequestWasSent(structured) &&
      !preLaunchPids.has(pid)
    ) {
      await sleep(this.settleDelayMs);
      windows = windowsFrom((await this.driver.call("list_windows", { pid })).structured);
      windowSource = "post_launch_list";
    }
    // Some native launch services acknowledge a document/path request before
    // publishing its ordinary window. Native Computer Use hides that race.
    // Repeat the identical request once only while no ordinary window exists;
    // never replay after a usable or off-Space document window is observable.
    if (
      pickOrdinaryWindowId(windows) === undefined &&
      !launchDispatchRefused(structured) &&
      !requestFreshNativeInstance
    ) {
      await sleep(this.settleDelayMs);
      launched = await this.driver.call("launch_app", launchArgs);
      structured = { ...structured, ...(asRecord(launched.structured) ?? {}) };
      const retryPid = Number(structured.pid ?? pid);
      if (Number.isFinite(retryPid) && retryPid > 0) pid = retryPid;
      windows = windowsFrom(structured);
      if (pickOrdinaryWindowId(windows) === undefined) {
        windows = windowsFrom((await this.driver.call("list_windows", { pid })).structured);
      }
    }
    if (pickOrdinaryWindowId(windows) === undefined && launchDispatchRefused(structured)) {
      throw new OpenSkyError(
        `The desktop helper could not dispatch the requested target to ${JSON.stringify(args.app)} ` +
        `(${String(structured.error)}). No keyboard or pointer input was sent.`,
      );
    }
    if (requestedDocument && launchRequestWasSent(structured) && !preLaunchPids.has(pid)) {
      // AppKit may restore unrelated documents into a new process. Wait for
      // the requested AXDocument instead of requiring the process to have only
      // one window, adopting a same-title sibling, or replaying the open.
      const deadline = Date.now() + 5_000;
      do {
        windows = windowsFrom((await this.driver.call("list_windows", {
          pid, include_document_urls: true,
        })).structured);
        windowSource = "post_launch_list";
        if ((windows.length > 0 && !windows.some(window => "document_url" in window)) ||
            await requestedDocumentWindow(windows, requestedDocument) !== undefined ||
            Date.now() >= deadline) break;
        await sleep(200);
      } while (true);
    }
    const newWindows = windows.filter((window) =>
      typeof window.window_id === "number" && !previousIds.has(window.window_id),
    );
    const matchingWindows = windows.filter((window) => windowMatchesTargets(window, args.targets));
    const candidates = newWindows.length > 0 ? newWindows : matchingWindows.length > 0 ? matchingWindows : windows;
    const freshOrdinaryWindows = windows.filter(isOrdinaryWindow);
    const freshWindowId = requestedDocument && windows.some(window => "document_url" in window)
      ? await requestedDocumentWindow(windows, requestedDocument)
      : freshOrdinaryWindows.length === 1 &&
        typeof freshOrdinaryWindows[0]?.window_id === "number" && freshOrdinaryWindows[0].window_id > 0
      ? freshOrdinaryWindows[0].window_id
      : undefined;
    const windowId = requestFreshNativeInstance
      ? freshWindowId
      : pickUsableWindowId(candidates) ?? pickOrdinaryWindowId(candidates);
    if (windows.length === 0 || windowId === undefined) windowSource = "none";
    const correlation: TargetRequestIdentity["window"]["correlation"] = windowId === undefined
      ? "none"
      : requestFreshNativeInstance || newWindows.some((window) => window.window_id === windowId)
        ? "new_since_request"
        : matchingWindows.some((window) => window.window_id === windowId)
          ? "title_match"
          : "uncorrelated";
    const nativeCloseAuthority = requestFreshNativeInstance &&
      launchRequestWasSent(structured) &&
      !preLaunchPids.has(pid) &&
      launchIdentityMatches(args.app, match, structured) &&
      windowId !== undefined
      ? await this.verifyNativeCloseAuthority(pid, windowId, requestedDocument)
      : undefined;
    if (requestFreshNativeInstance && !nativeCloseAuthority) {
      throw new OpenSkyError(
        `The desktop helper could not prove that ${JSON.stringify(args.app)} created one fresh, uniquely ` +
          "request-correlated native window. No existing or title-matched window was adopted, and no keyboard or pointer input was sent.",
        "native_target_unproven",
        { pid, requested: args.targets, candidateWindowIds: freshOrdinaryWindows.map(window => window.window_id) },
      );
    }
    const resolved: ResolvedApp = {
      handle: newTargetHandle(),
      openedAt: this.nextOpenedAt(),
      query: args.app,
      name: String(structured.name ?? match?.name ?? args.app),
      bundleId: optionalString(structured.bundle_id) ?? optionalString(match?.bundle_id),
      launchPath: optionalString(structured.launch_path) ?? optionalString(match?.launch_path),
      pid,
      windowId,
      contentScope: args.targets.some(isHttpUrl) ? "web" : undefined,
      nativeCloseAuthority,
      targetRequest: {
        requested: [...args.targets],
        resourceKind: targetResourceKind(args.targets),
        requestDispatch: launchRequestWasSent(structured) ? "sent" : "unknown",
        window: { id: windowId, source: windowSource, correlation },
      },
    };
    this.registerTarget(resolved);
    this.markResolved(resolved);
    if (requestFreshNativeInstance) {
      // The independent authority check already refreshed this exact window;
      // retain native-style settling without paying for a redundant inventory
      // in get_app_state immediately afterward.
      if (this.settleDelayMs > 0) await sleep(this.settleDelayMs);
    } else {
      this.markAction(resolved);
    }
    await this.persist();
    return this.get_app_state({
      app: resolved.handle,
      disableDiff: true,
      includeScreenshot: args.includeScreenshot,
      query: args.query,
    });
  }

  /** Bind one exact tab in an existing user-owned Chromium window. */
  async attach_browser(args: {
    app: string;
    pid?: number;
    windowId?: number;
    providerTabId?: string;
    sessionName?: string;
    includeScreenshot?: boolean;
  }): Promise<AppState> {
    if (!args?.app) throw invalidParams("app is required");
    if (args.pid !== undefined && (!Number.isSafeInteger(args.pid) || args.pid <= 0)) {
      throw invalidParams("pid must be a positive integer");
    }
    if (args.windowId !== undefined && (!Number.isSafeInteger(args.windowId) || args.windowId <= 0)) {
      throw invalidParams("windowId must be a positive integer");
    }
    if (args.providerTabId !== undefined && !args.providerTabId.trim()) {
      throw invalidParams("providerTabId must contain non-whitespace text");
    }
    await this.ensureLoaded();
    const listed = await this.listRawApps();
    const match = findApp(listed, args.app);
    if (!isChromiumApp(args.app, match)) {
      throw new OpenSkyError("attach_browser requires a running supported Chromium browser.");
    }
    const pid = args.pid ?? Number(match?.pid);
    if (!Number.isSafeInteger(pid) || pid <= 0) {
      throw new OpenSkyError(`No running browser process was found for ${JSON.stringify(args.app)}.`);
    }
    const windows = windowsFrom((await this.driver.call("list_windows", { pid })).structured)
      .filter(isOrdinaryWindow);
    const windowId = args.windowId ?? (windows.length === 1 ? Number(windows[0]?.window_id) : undefined);
    if (!Number.isSafeInteger(windowId) || windowId! <= 0 ||
        !windows.some((window) => Number(window.window_id) === windowId)) {
      throw new OpenSkyError(
        `Could not select one exact existing browser window for pid ${pid}. ` +
          `Pass windowId from the browser's native window inventory; candidates: ${windows.map(window => window.window_id).join(", ") || "none"}.`,
      );
    }

    const sessionLabel = safeBrowserSessionLabel(args.sessionName);
    const session = `${this.session}-browser-existing${sessionLabel ? `-${sessionLabel}` : ""}-${process.pid}-${this.runtimeId}-${++this.browserSequence}`;
    await this.browserLeases.reserve(session);
    this.managedBrowserSessions.add(session);
    try {
      const preparation = await this.driver.call("browser_prepare", {
        pid,
        window_id: windowId,
        session,
        strategy: { kind: "existing_profile" },
      });
      const prepared = asRecord(preparation.structured) ?? {};
      if (prepared.status !== "ok" || prepared.prepared !== true) {
        throw new OpenSkyError("The desktop helper did not confirm existing-profile attachment.");
      }
      const boundResult = await this.driver.call("get_browser_state", {
        pid,
        window_id: windowId,
        session,
      });
      const bound = asRecord(boundResult.structured) ?? {};
      if (bound.status !== "ok" || bound.binding_quality !== "exact" || bound.mutation_allowed !== true) {
        throw new OpenSkyError("The desktop helper could not bind the existing browser window exactly.");
      }
      const targetId = optionalString(bound.target_id);
      const tabs = asArray<Record<string, unknown>>(bound.tabs);
      const requestedTab = args.providerTabId?.trim();
      const selected = requestedTab
        ? tabs.find((tab) => tab.tab_id === requestedTab)
        : tabs.find((tab) => tab.active === true) ?? (tabs.length === 1 ? tabs[0] : undefined);
      const tabId = optionalString(selected?.tab_id);
      if (!targetId || !tabId) {
        throw new OpenSkyError(requestedTab
          ? `The exact browser window does not contain provider tab ${JSON.stringify(requestedTab)}.`
          : "The exact browser binding did not identify one selected tab.");
      }
      const url = optionalString(selected?.url);
      const resolved: ResolvedApp = {
        handle: newTargetHandle(),
        openedAt: this.nextOpenedAt(),
        query: args.app,
        name: String(match?.name ?? args.app),
        bundleId: optionalString(match?.bundle_id),
        launchPath: optionalString(match?.launch_path),
        pid,
        windowId,
        contentScope: "web",
        browser: { session, targetId, tabId, managed: false },
        targetRequest: {
          requested: url ? [url] : [],
          resourceKind: "url",
          requestDispatch: "unknown",
          window: { id: windowId, source: "post_launch_list", correlation: "uncorrelated" },
        },
      };
      this.registerTarget(resolved);
      this.markResolved(resolved);
      this.markAction(resolved);
      await this.persist();
      return this.get_app_state({
        app: resolved.handle,
        disableDiff: true,
        includeScreenshot: args.includeScreenshot,
      });
    } catch (error) {
      try {
        await this.endSessionConfirmed(session);
        await this.browserLeases.release(session);
        this.managedBrowserSessions.delete(session);
      } catch (cleanupError) {
        throw new OpenSkyError(
          `Existing-browser attachment failed (${error instanceof Error ? error.message : String(error)}), and capability cleanup also failed: ` +
            `${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        );
      }
      throw error;
    }
  }

  /** Close only an exact driver-owned target created by this instance. */
  async close_target(args: { app: string }): Promise<void> {
    if (!args?.app) throw invalidParams("app is required");
    await this.ensureLoaded();
    const resolved = this.targetForSelector(args.app);
    if (resolved) this.assertTargetUsable(resolved);
    const browser = resolved?.browser;
    if (resolved && browser?.managed && this.managedBrowserSessions.has(browser.session)) {
      await this.closeResolvedTarget(resolved);
      return;
    }
    const authority = resolved?.nativeCloseAuthority;
    if (
      !resolved ||
      !authority ||
      authority.pid !== resolved.pid ||
      authority.windowId !== resolved.windowId
    ) {
      throw new OpenSkyError(
        `No driver-owned exact target is open for ${JSON.stringify(args.app)}. ` +
          "No user-owned app, window, or tab was closed.",
      );
    }
    let closed;
    try {
      closed = await this.driver.call("close_window", {
        pid: authority.pid,
        window_id: authority.windowId,
      });
    } catch (error) {
      // Exact close is cooperative. A confirmation sheet, delivery failure,
      // permission issue, or unconfirmed close must retain authority so the
      // caller can resolve the condition and retry the same target.
      throw new OpenSkyError(
        `Exact native window close was not completed: ${error instanceof Error ? error.message : String(error)}. ` +
          "The exact target and close authority remain available for retry.",
        error instanceof OpenSkyError ? error.code : undefined,
      );
    }
    const status = asRecord(closed.structured);
    if (
      status?.status !== "closed" ||
      Number(status.pid) !== authority.pid ||
      Number(status.window_id) !== authority.windowId
    ) {
      const detail = typeof status?.message === "string"
        ? status.message
        : `desktop helper returned status ${JSON.stringify(status?.status ?? "unknown")}`;
      throw new OpenSkyError(
        `Exact native window close was not verified: ${detail}. The target remains available for retry.`,
        typeof status?.code === "string" ? status.code : undefined,
      );
    }
    this.removeTarget(resolved.handle);
    await this.persist();
  }

  /** Navigate only an exact typed-browser tab and return its settled destination state. */
  async navigate(args: ({ app: string; url: string; action?: never } | {
    app: string;
    action: NavigationAction;
    url?: never;
  }) & { includeScreenshot?: boolean; query?: string }): Promise<AppState> {
    const raw = args as Record<string, unknown> | undefined;
    const hasUrl = typeof raw?.url === "string";
    const hasAction = typeof raw?.action === "string";
    if (!raw?.app || hasUrl === hasAction) {
      throw invalidParams("app and exactly one of url or action are required");
    }
    if (hasUrl && !isBrowserNavigableUrl(String(raw.url))) {
      throw invalidParams("url must be an http/https/about URL");
    }
    if (hasAction && !["back", "forward", "reload"].includes(String(raw.action))) {
      throw invalidParams("action must be back, forward, or reload");
    }
    if (args.query !== undefined && !args.query.trim()) {
      throw invalidParams("query must contain non-whitespace text");
    }
    const url = hasUrl ? String(raw.url).trim() : undefined;
    const action = hasAction ? String(raw.action) as NavigationAction : undefined;
    const resolved = await this.requireExactTypedBrowser(args.app, "navigate");
    const browser = resolved.browser!;
    const result = await this.driver.call("browser_navigate", {
      target_id: browser.targetId,
      tab_id: browser.tabId,
      ...(url ? { url } : { action }),
      session: browser.session,
    });
    const status = asRecord(result.structured);
    const expectedAction = url ? "url" : action;
    if (
      status?.status !== "ok" || status.target_id !== browser.targetId ||
      status.tab_id !== browser.tabId || status.action !== expectedAction ||
      status.refs_invalidated !== true
    ) {
      throw new OpenSkyError(
        "Exact-tab navigation returned an ambiguous acknowledgement and may have completed. " +
          "Observe the target before deciding whether to retry.",
      );
    }
    browser.screenshotMapping = undefined;
    if (url) {
      resolved.targetRequest = {
        requested: [url],
        resourceKind: "url",
        requestDispatch: "sent",
        window: resolved.targetRequest?.window ?? {
          id: resolved.windowId,
          source: "launch_result",
          correlation: "new_since_request",
        },
      };
    }
    this.markAction(resolved);
    await this.persist();
    try {
      return await this.get_app_state({
        app: args.app,
        disableDiff: true,
        includeScreenshot: args.includeScreenshot,
        query: args.query,
      });
    } catch (error) {
      throw new OpenSkyError(
        `Exact-tab navigation completed, but its settled observation failed: ${
          error instanceof Error ? error.message : String(error)
        }. The navigation may have completed; observe before deciding whether to retry.`,
        error instanceof OpenSkyError ? error.code : undefined,
      );
    }
  }

  /** End only resources that this OpenSky instance created. Safe to call repeatedly. */
  close(): Promise<void> { return this.lifecycle.close(); }

  private async finalizeClose(): Promise<void> {
    await this.ensureLoaded();
    const hadManagedBrowserSessions = this.managedBrowserSessions.size > 0;
    if (hadManagedBrowserSessions) this.cleanupPersistencePending = true;
    const sessions = [...this.managedBrowserSessions];
    if (!this.baseSessionEnded && this.baseSessionDispatchAttempted) sessions.push(this.session);
    const failures: Array<{ session: string; error: unknown }> = [];
    const endedManagedSessions = new Set<string>();
    await Promise.all(sessions.map(async (session) => {
      try {
        await this.endSessionConfirmed(session, this.rawDriver);
        if (session === this.session) this.baseSessionEnded = true;
        else {
          await this.browserLeases.release(session);
          this.managedBrowserSessions.delete(session);
          endedManagedSessions.add(session);
        }
      } catch (error) {
        // The caller may retry close(); the per-session lease stays owned.
        failures.push({ session, error });
      }
    }));
    for (const resolved of Object.values(this.memory.targets)) {
      if (resolved.browser && endedManagedSessions.has(resolved.browser.session)) {
        this.removeTarget(resolved.handle);
      }
    }
    if (this.cleanupPersistencePending) {
      try {
        await this.persist();
        this.cleanupPersistencePending = false;
      } catch (error) {
        failures.push({ session: "ownership ledger", error });
      }
    }
    if (failures.length > 0) {
      const detail = failures.map(({ session, error }) =>
        `${JSON.stringify(session)}: ${error instanceof Error ? error.message : String(error)}`
      ).join("; ");
      const receiptFailure = failures.find(({ error }) => error instanceof OpenSkyError && error.code === "session_end_unconfirmed");
      throw new OpenSkyError(`Failed to end ${failures.length} owned driver session(s): ${detail}`,
        receiptFailure ? "session_end_unconfirmed" : undefined);
    }
    if (this.ownedMcpDriver) {
      this.closeReceipt = await this.ownedMcpDriver.closeTransport();
      if (!this.closeReceipt.verified) throw new OpenSkyError(
        "The owned MCP transport did not close with verified drain and exit; cleanup is not proven.",
        "transport_close_unconfirmed", this.closeReceipt,
      );
    }
    const unresolved = (await this.browserLeases.unresolvedLeases()).filter(lease => lease.ownerMayBeAlive !== true);
    if (unresolved.length > 0 || this.unresolvedLegacyBrowserSessions.size > 0) {
      throw new OpenSkyError(
        "Unresolved browser ownership records remain. No foreign session was ended and the records were retained for reconciliation.",
        "browser_cleanup_unresolved",
        { unresolved, legacySessions: [...this.unresolvedLegacyBrowserSessions] },
      );
    }
  }

  private async tryOpenTypedBrowser(
    args: { app: string; targets: string[]; includeScreenshot?: boolean; sessionName?: string; browserVisible?: boolean; query?: string },
    match?: Record<string, unknown>,
  ): Promise<AppState | null> {
    if (
      !this.preferTypedBrowser ||
      args.targets.length !== 1 ||
      !isTypedBrowserOpenUrl(args.targets[0] ?? "") ||
      !isChromiumApp(args.app, match)
    ) return null;

    const sessionLabel = safeBrowserSessionLabel(args.sessionName);
    const session = `${this.session}-browser${sessionLabel ? `-${sessionLabel}` : ""}-${process.pid}-${this.runtimeId}-${++this.browserSequence}`;
    // Reserve the cleanup capability before dispatch. A timed-out or malformed
    // prepare may already have launched an isolated browser; waiting for its
    // success envelope before recording ownership would orphan that process.
    await this.browserLeases.reserve(session);
    this.managedBrowserSessions.add(session);
    try {
      const preparation = await this.driver.call("browser_prepare", {
        session,
        allow_launch: true,
        profile: {
          mode: "isolated_new",
          ...(args.browserVisible === false
            ? { headless: true, expose_debugger_endpoint: true }
            : {}),
        },
      });
      const preparedState = asRecord(preparation.structured) ?? {};
      if (preparedState.status !== "ok" || preparedState.prepared !== true) {
        throw new OpenSkyError(
          "The desktop helper returned an ambiguous browser preparation result. No legacy browser fallback was attempted.",
        );
      }
      const preparedPid = Number(preparedState.prepared_pid);
      if (!Number.isFinite(preparedPid) || preparedPid <= 0) {
        throw new OpenSkyError("The desktop helper prepared an isolated browser without a process identity.");
      }
      const headless = args.browserVisible === false;
      const debuggerHttpUrl = optionalString(preparedState.debugger_http_url);
      if (headless && !debuggerHttpUrl) {
        throw new OpenSkyError("The desktop helper launched a headless browser without a debugger endpoint.");
      }
      let windowId = 0;
      if (!headless) {
        // Process preparation can finish before the native window is registered.
        // Observe the same owned process; never prepare or launch it again.
        const deadline = performance.now() + 5_000;
        while (true) {
          const windowsResult = await this.driver.call("list_windows", { pid: preparedPid, session });
          const windows = windowsFrom(windowsResult.structured);
          const selectedWindowId = pickUsableWindowId(windows) ?? pickOrdinaryWindowId(windows);
          if (selectedWindowId !== undefined) {
            windowId = selectedWindowId;
            break;
          }
          const remaining = deadline - performance.now();
          if (remaining <= 0) {
            throw new OpenSkyError("The isolated browser launched without an exact ordinary window.");
          }
          await sleep(Math.min(100, remaining));
        }
      }
      const boundResult = await this.driver.call("get_browser_state", {
        pid: preparedPid,
        ...(!headless ? { window_id: windowId } : {}),
        session,
      });
      const bound = asRecord(boundResult.structured) ?? {};
      if (bound.status !== "ok" || bound.binding_quality !== "exact" || bound.mutation_allowed !== true) {
        throw new OpenSkyError("The desktop helper could not bind the isolated browser window exactly.");
      }
      const targetId = optionalString(bound.target_id);
      const tabs = asArray<Record<string, unknown>>(bound.tabs);
      const selected = tabs.find((tab) => tab.active === true) ?? (tabs.length === 1 ? tabs[0] : undefined);
      const tabId = optionalString(selected?.tab_id);
      if (!targetId || !tabId) {
        throw new OpenSkyError("The exact browser binding did not provide one selected tab.");
      }
      if (args.targets[0]!.trim().toLowerCase() !== "about:blank") {
        const navigation = await this.driver.call("browser_navigate", {
          target_id: targetId,
          tab_id: tabId,
          url: args.targets[0],
          session,
        });
        const navigationStatus = asRecord(navigation.structured);
        if (
          navigationStatus?.status !== "ok" || navigationStatus.target_id !== targetId ||
          navigationStatus.tab_id !== tabId || navigationStatus.action !== "url" ||
          navigationStatus.refs_invalidated !== true
        ) {
          throw new OpenSkyError(
            "Initial exact-tab navigation returned an ambiguous acknowledgement and may have completed. " +
              "The owned isolated browser will be cleaned up rather than retried.",
          );
        }
      }
      const resolved: ResolvedApp = {
        handle: newTargetHandle(),
        openedAt: this.nextOpenedAt(),
        query: args.app,
        name: String(match?.name ?? args.app),
        bundleId: optionalString(match?.bundle_id),
        launchPath: optionalString(match?.launch_path),
        pid: preparedPid,
        windowId,
        contentScope: "web",
        browser: { session, targetId, tabId, managed: true, debuggerHttpUrl },
        targetRequest: {
          requested: [...args.targets],
          resourceKind: "url",
          requestDispatch: "sent",
          window: headless
            ? { source: "none", correlation: "none" }
            : { id: windowId, source: "launch_result", correlation: "new_since_request" },
        },
      };
      this.registerTarget(resolved);
      this.markResolved(resolved);
      this.markAction(resolved);
      await this.persist();
      return this.get_app_state({
        app: resolved.handle,
        disableDiff: true,
        includeScreenshot: args.includeScreenshot,
        query: args.query,
      });
    } catch (error) {
      try {
        await this.endSessionConfirmed(session);
        await this.browserLeases.release(session);
        this.managedBrowserSessions.delete(session);
        for (const target of Object.values(this.memory.targets)) {
          if (target.browser?.session === session) this.removeTarget(target.handle);
        }
        await this.persist();
      } catch (cleanupError) {
        throw new OpenSkyError(
          `Typed browser setup failed (${error instanceof Error ? error.message : String(error)}), and cleanup of ` +
            `${JSON.stringify(session)} also failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
          cleanupError instanceof OpenSkyError ? cleanupError.code : undefined,
        );
      }
      if (isTypedBrowserUnavailable(error)) {
        if (args.query !== undefined) {
          throw new OpenSkyError(
            "The exact typed browser route is unavailable, so query could not be applied. " +
              "No legacy browser fallback was attempted and no native app input was sent.",
          );
        }
        return null;
      }
      throw error;
    }
  }

  async click(args: {
    app: string;
    element_index?: number;
    x?: number;
    y?: number;
    mouse_button?: MouseButton;
    click_count?: number;
    /** Mac native coordinate clicks only; omitted keeps legacy background delivery. */
    delivery_mode?: "background" | "foreground";
    /** Auxiliary native window-change poll;50–1000ms, legacy default1000. */
    window_change_timeout_ms?: number;
  }): Promise<void> {
    const windowObservation = nativeWindowObservationArgs(args?.window_change_timeout_ms);

    if (!args?.app) throw invalidParams("app is required");
    const button = normalizeMouseButton(args.mouse_button);
    const resolved = await this.requireResolved(args.app);
    if (args.delivery_mode !== undefined && (
      !["background", "foreground"].includes(args.delivery_mode) || this.target !== "mac" ||
      resolved.browser || args.element_index !== undefined ||
      typeof args.x !== "number" || typeof args.y !== "number"
    )) throw invalidParams("delivery_mode requires a Mac native coordinate click");
    if (resolved.browser) {
      const hasX = typeof args.x === "number";
      const hasY = typeof args.y === "number";
      if (hasX !== hasY) throw invalidParams("x and y must be provided together");
      if (args.element_index !== undefined && hasX) throw invalidParams("element_index cannot be combined with x/y");
      if (args.element_index === undefined && !hasX) throw invalidParams("provide element_index or x/y");
      const count = args.click_count ?? 1;
      if (button === "middle" || count < 1 || count > 2 || (button !== "left" && count !== 1)) {
        throw this.typedBrowserUnsupported(
          resolved,
          `${button} click with count ${count}`,
          "Exact typed tabs support a single left/right click or a left double-click.",
        );
      }
      const common = {
        target_id: resolved.browser.targetId,
        tab_id: resolved.browser.tabId,
        input_route: "dom_event",
        session: resolved.browser.session,
      };
      if (hasX) {
        const point = this.browserScreenshotPoint(resolved, args.x!, args.y!, "coordinate click");
        if (button === "right" || count === 2) {
          await this.driver.call("browser_pointer", {
            ...common,
            ...point,
            input_route: "trusted",
            action: button === "right" ? "right_click" : "double_click",
          });
        } else {
          await this.driver.call("browser_click", { ...common, ...point, input_route: "trusted" });
        }
      } else if (button === "right" || count === 2) {
        const element = this.browserElement(resolved, args.element_index!, "pointer");
        await this.driver.call("browser_pointer", {
          ...common,
          ref: element.browser_ref,
          action: button === "right" ? "right_click" : "double_click",
        });
      } else {
        const element = this.browserElement(resolved, args.element_index!, "click");
        await this.driver.call("browser_click", { ...common, ref: element.browser_ref });
      }
      this.markAction(resolved);
      return;
    }
    const parentSelection = this.target === "mac" && args.element_index !== undefined
      && this.memory.trees[windowKey(resolved)]?.elements
        .find(item => item.element_index === args.element_index)?.selectionViaParent === true;
    if (parentSelection && (button !== "left" || (args.click_count ?? 1) !== 1)) {
      throw invalidParams("Parent-backed selection supports one left indexed click; use a fresh screenshot for other pointer gestures.");
    }
    if (this.target === "mac" && button === "right" && (args.click_count ?? 1) === 1) {
      // Use one dedicated context-menu transport for native indices and pixels.
      // The generic pixel click's focus suppression can dismiss the menu even
      // when a caller has already activated the exact target window.
      const exactElement = args.element_index !== undefined
        ? this.elementTarget(resolved, args.element_index) : undefined;
      await this.requireUsableInputWindow(resolved);
      await this.driver.call("right_click", {
        pid: resolved.pid,
        ...(exactElement ?? { window_id: resolved.windowId, x: args.x, y: args.y }),
        ...(args.delivery_mode !== undefined ? { delivery_mode: args.delivery_mode } : {}),
      });
      this.markAction(resolved);
      return;
    }
    if (args.element_index === undefined) await this.requireUsableInputWindow(resolved);
    const payload: Record<string, unknown> = { ...windowObservation,
      pid: resolved.pid,
      window_id: resolved.windowId,
    };
    if (args.element_index !== undefined) {
      Object.assign(payload, this.elementTarget(resolved, args.element_index));
      if (this.target !== "linux" && button === "left" && args.click_count !== 2) payload.action = parentSelection ? "select_collection_item" : "press";
      const element = this.memory.trees[windowKey(resolved)]?.elements
        .find(item => item.element_index === args.element_index);
      // AppKit may accept an inactive collection click without navigating.
      // Use the guarded exact-window foreground route for native plain row,
      // cell and editable-control clicks, matching the facade's input intent.
      if (this.target === "mac" && button === "left" && (args.click_count ?? 1) === 1
        && /^AX(?:TextField|TextArea|ComboBox|Row|Cell)$/.test(element?.role ?? "")) {
        payload.delivery_mode = "foreground";
      }
      // Buttons without an advertised primary action need the existing exact
      // foreground route. Advertised AXPress keeps its established delivery.
      if (this.target === "mac" && button === "left" && (args.click_count ?? 1) === 1
        && element?.role === "AXButton" && Array.isArray(element.actions)
        && !element.actions.some(action => action === "AXPress" || action === "press")) {
        payload.delivery_mode = "foreground";
      }
      // App menus have application ancestry rather than AXWindow ancestry.
      // Verify the app and exact focused window before dispatching its menu
      // action. An owned popover above that window does not invalidate a menu.
      if (this.target === "mac" && /^AXMenu(?:Bar|BarItem|Item)$/.test(element?.role ?? "")) {
        payload.delivery_mode = "foreground";
        if (/^AXMenuBar(?:Item)?$/.test(element?.role ?? "")) {
          // A menu must remain visible for the following observation/action;
          // temporary activation would close it while restoring another app.
          await this.driver.call("bring_to_front", { pid: resolved.pid, window_id: resolved.windowId,
            activation_scope: "app_menu" });
        }
      }
    }
    if (args.x !== undefined) payload.x = args.x;
    if (args.y !== undefined) payload.y = args.y;
    if (args.delivery_mode !== undefined) payload.delivery_mode = args.delivery_mode;
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
    const clickSnapshot = this.memory.trees[windowKey(resolved)];
    try {
      await this.driver.call("click", payload);
    } catch (error) {
      // Never replay a parent-selection setter, including uncertain native errors.
      if (parentSelection) throw error;
      if (this.target === "mac" && button === "left" && (args.click_count ?? 1) === 1
        && args.element_index !== undefined && clickSnapshot
        && error instanceof OpenSkyError
        && error.message === "Cannot select current click route: current element role unavailable; no input was sent") {
        const rebound = await this.recoverRecreatedButton(resolved, args.element_index, clickSnapshot);
        if (!rebound) throw error;
        // The first call explicitly refused before input. Retry once with
        // current exact-window tokens; an uncertain second result is final.
        await this.driver.call("click", { ...payload, ...rebound });
        this.markAction(resolved);
        return;
      }
      const refusedBeforeInput = error instanceof OpenSkyError && error.code === "background_unavailable";
      if ((!refusedBeforeInput && !isFocusRoutingError(error)) || !resolved.windowId) throw error;
      await this.driver.call("click", { ...payload, delivery_mode: "foreground" });
    }
    this.markAction(resolved);
  }

  async bring_to_front(args: { app: string }): Promise<void> {
    if (!args?.app) throw invalidParams("app is required");
    const resolved = await this.requireResolved(args.app);
    if (resolved.browser) {
      throw this.typedBrowserUnsupported(
        resolved,
        "bringing the browser to the foreground",
        "Continue through the exact background tab, or open a separate native browser binding explicitly.",
      );
    }
    const boundWindow = await this.refreshBoundWindow(resolved);
    if (!boundWindow) {
      throw new OpenSkyError(
        `Application ${JSON.stringify(resolved.name)} has no exact ordinary window to bring forward. Observe again first.`,
      );
    }
    const result = await this.driver.call("bring_to_front", { pid: resolved.pid, window_id: boundWindow });
    this.markAction(resolved);
    // Older driver CLIs flattened the error envelope into a successful exit.
    // A partial activation can already have changed app focus, so never retry.
    const outcome = asRecord(result.structured);
    if (outcome?.activated === false || outcome?.status === "partial" || outcome?.status === "failed") {
      throw new OpenSkyError(
        `The driver could not verify that exact window ${boundWindow} is visible and frontmost. App focus may already have changed; observe before retrying.`,
        typeof outcome.code === "string" ? outcome.code : undefined,
        outcome,
      );
    }
    await this.settleAfterAction(resolved);
  }

  async drag(args: ({
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
  })): Promise<void> {
    if (!args?.app) throw invalidParams("app is required");
    const raw = args as Record<string, unknown>;
    const coordinateKeys = ["from_x", "from_y", "to_x", "to_y"] as const;
    const indexKeys = ["from_element_index", "to_element_index"] as const;
    const hasCoordinates = coordinateKeys.some((key) => raw[key] !== undefined);
    const hasIndices = indexKeys.some((key) => raw[key] !== undefined);
    if (hasCoordinates === hasIndices) {
      throw invalidParams("provide either from_x/from_y/to_x/to_y or from_element_index/to_element_index");
    }
    const required = hasCoordinates ? coordinateKeys : indexKeys;
    for (const key of required) {
      if (typeof raw[key] !== "number" || !Number.isFinite(raw[key])) {
        throw invalidParams(`${key} must be a finite number`);
      }
    }
    const resolved = await this.requireResolved(args.app);
    if (resolved.browser) {
      const browser = resolved.browser;
      let payload: Record<string, unknown>;
      if (hasIndices) {
        const origin = this.browserElement(resolved, Number(raw.from_element_index), "pointer");
        const destination = this.browserElement(resolved, Number(raw.to_element_index), "pointer");
        payload = {
          ref: origin.browser_ref,
          destination_ref: destination.browser_ref,
          input_route: "dom_event",
        };
      } else {
        const origin = this.browserScreenshotPoint(resolved, Number(raw.from_x), Number(raw.from_y), "coordinate drag");
        const destination = this.browserScreenshotPoint(resolved, Number(raw.to_x), Number(raw.to_y), "coordinate drag");
        payload = {
          ...origin,
          to_x: destination.x,
          to_y: destination.y,
          input_route: "trusted",
        };
      }
      const result = await this.driver.call("browser_pointer", {
        target_id: browser.targetId,
        tab_id: browser.tabId,
        session: browser.session,
        action: "drag",
        ...payload,
      });
      const status = asRecord(result.structured);
      if (
        status?.status !== "ok" || status.target_id !== browser.targetId ||
        status.tab_id !== browser.tabId || status.action !== "drag"
      ) {
        throw new OpenSkyError(
          "Exact-tab drag returned an ambiguous acknowledgement and may have completed. " +
            "Observe the target before deciding whether to retry.",
        );
      }
      this.markAction(resolved);
      return;
    }
    if (hasIndices) {
      throw new OpenSkyError(
        "from_element_index/to_element_index drag is available only for exact typed browser tabs. " +
          "Use screenshot coordinates for a native app.",
      );
    }
    await this.requireUsableInputWindow(resolved);
    const payload = {
      pid: resolved.pid,
      window_id: resolved.windowId,
      from_x: raw.from_x,
      from_y: raw.from_y,
      to_x: raw.to_x,
      to_y: raw.to_y,
    };
    try {
      await this.driver.call("drag", payload);
    } catch (error) {
      // Only this typed refusal proves that the drag sent no input. Retry once
      // against the same exact window; an arbitrary drag error may be partial.
      if (!(error instanceof OpenSkyError) || error.code !== "background_unavailable" || !resolved.windowId) throw error;
      await this.driver.call("drag", { ...payload, delivery_mode: "foreground" });
    }
    this.markAction(resolved);
  }

  async paste(args: { app: string; text: string; format?: PasteFormat }): Promise<void> {
    if (!args?.app || typeof args.text !== "string") throw invalidParams();
    const format = args.format ?? "text";
    if (format !== "text" && format !== "md" && format !== "html") {
      throw invalidParams();
    }
    await this.ensureLoaded();
    const resolved = this.targetForSelector(args.app);
    if (resolved?.browser) {
      this.assertTargetUsable(resolved);
      // Paste follows the current editor, as it does for a human. Refresh only
      // the exact tab to bind that editor; never reuse a pre-action focus flag.
      await this.get_app_state({ app: resolved.handle, includeScreenshot: false, disableDiff: true });
      const element = this.uniqueFocusedBrowserTypeElement(resolved);
      await this.driver.call("browser_type", {
        target_id: resolved.browser.targetId,
        tab_id: resolved.browser.tabId,
        session: resolved.browser.session,
        ref: element.browser_ref,
        mode: "paste", format, text: args.text,
      });
      this.markAction(resolved);
      return;
    }
    if ((this.target === "mac" || (this.target === "linux" && format === "text")) && resolved && !resolved.browser) {
      this.assertTargetUsable(resolved);
      await this.requireUsableInputWindow(resolved);
      // The compound driver operation checks exact live focus and sends one
      // paste. Never split this into clipboard writes plus a key, or replay
      // an uncertain delivery. Both platforms preserve supported prior clipboard
      // contents. Mac reports restoration separately and keeps an observed newer copy. Rich Mac
      // content is converted before mutation; the driver verifies exact plain
      // text insertion, while callers observe the resulting rich formatting.
      try {
        const result = await this.driver.call("native_paste", {
          pid: resolved.pid,
          window_id: resolved.windowId,
          text: args.text,
          format,
          ...(this.target === "mac" ? { clipboard_policy: "restore", delivery_mode: "foreground" } : {}),
        });
        const outcome = asRecord(result.structured);
        const verified = this.target === "linux"
          ? outcome?.status === "completed" && outcome.transfer_verified === true
          : outcome?.status === "completed" && outcome.target_value_verified === true && outcome.transfer_verified === false &&
            outcome.clipboard_policy === "restore" && (
              (outcome.clipboard_restore_status === "restored" && outcome.clipboard_restored === true) ||
              (outcome.clipboard_restore_status === "newer_writer_preserved" && outcome.clipboard_restored === false)
            );
        if (!verified) {
          throw new OpenSkyError(
            "Native paste receipt did not verify the required platform-specific outcome. " +
              "Observe before retrying; do not replay automatically.",
            "native_paste_unverified",
            outcome,
          );
        }
      } finally {
        // Errors can follow actual input; refresh the binding before the next
        // action even when this call cannot confirm delivery.
        this.markAction(resolved);
      }
      return;
    }
    throw new OpenSkyError(
      `Native paste is unsupported for target ${this.target} with format ${format}, or no exact native target is bound. ` +
        "Mac supports text/html/md; Linux supports text. No clipboard, app, window, tab, or input was touched. " +
        "This is a capability limitation, not an observed clipboard race; retrying the same request will not enable it.",
      "unsupported_native_paste",
    );
  }

  async perform_secondary_action(args: {
    app: string;
    element_index: number;
    action: string;
    /** Auxiliary native window-change poll;50–1000ms, legacy default1000. */
    window_change_timeout_ms?: number;
  }): Promise<void> {
    const windowObservation = nativeWindowObservationArgs(args?.window_change_timeout_ms);
    if (!args?.app || typeof args.element_index !== "number" || !args.action) {
      throw invalidParams();
    }
    const resolved = await this.requireResolved(args.app);
    const normalizedAction = args.action.trim().toLowerCase();
    if (normalizedAction === "increment" || normalizedAction === "decrement") {
      const element = this.memory.trees[windowKey(resolved)]?.elements
        .find(item => item.element_index === args.element_index);
      const advertised = element?.actions?.some(action => action.split("\n", 1)[0]!
        .replace(/^Name:/i, "").replace(/^AX/i, "").trim().toLowerCase() === normalizedAction);
      if (this.target !== "mac" || resolved.browser || !advertised) {
        throw new OpenSkyError(
          `${JSON.stringify(args.action)} is not a supported click action for this target, or is not advertised by this control. ` +
            "Refresh the control's state; use set_value or a supported indexed key only when the control advertises that capability.",
        );
      }
      // The existing native click route resolves the live advertised AX action
      // and checks enabled state and exact window ownership before dispatch.
    }
    const mapped = SECONDARY_ACTIONS[normalizedAction];
    if (resolved.browser) {
      if (["show menu", "show_menu", "axshowmenu"].includes(normalizedAction)) {
        const element = this.browserElement(resolved, args.element_index, "pointer");
        await this.driver.call("browser_pointer", {
          target_id: resolved.browser.targetId,
          tab_id: resolved.browser.tabId,
          ref: element.browser_ref,
          action: "right_click",
          input_route: "dom_event",
          session: resolved.browser.session,
        });
        this.markAction(resolved);
        return;
      }
      if (mapped?.kind === "click") {
        const element = this.browserElement(resolved, args.element_index, "click");
        await this.driver.call("browser_click", {
          target_id: resolved.browser.targetId,
          tab_id: resolved.browser.tabId,
          ref: element.browser_ref,
          input_route: "dom_event",
          session: resolved.browser.session,
        });
        this.markAction(resolved);
        return;
      }
      throw this.typedBrowserUnsupported(
        resolved,
        `secondary action ${JSON.stringify(args.action)}`,
        "Use click, type_text, set_value, or an explicitly supported typed-browser action.",
      );
    }
    if (this.target === "mac" && normalizedAction === "confirm") {
      const element = this.memory.trees[windowKey(resolved)]?.elements
        .find(item => item.element_index === args.element_index);
      if (element && ["AXTextField", "AXTextArea", "AXComboBox"].includes(element.role ?? "")) {
        // AppKit can accept AXConfirm without committing a programmatic value.
        // Focus this exact text control and deliver its Return key through the
        // existing guarded foreground key route; do not retry after delivery.
        await this.driver.call("press_key", {
          ...windowObservation,
          pid: resolved.pid, window_id: resolved.windowId, key: "return", delivery_mode: "foreground",
          ...this.elementTarget(resolved, args.element_index),
        });
        this.markAction(resolved);
        return;
      }
    }
    if (mapped?.kind === "front") {
      await this.bring_to_front({ app: args.app });
      return;
    }
    if (mapped?.kind === "key" && mapped.key) {
      await this.driver.call("press_key", {
        ...windowObservation,
        pid: resolved.pid,
        window_id: resolved.windowId,
        key: mapped.key,
        delivery_mode: "background",
        ...this.elementTarget(resolved, args.element_index),
      });
      this.markAction(resolved);
      return;
    }
    if (this.target === "mac" && normalizedAction === "open") {
      // Finder advertises AXOpen on folder rows, but rejects the AX action
      // with -25205. The driver's exact-window foreground double-click first
      // tries AXOpen, then uses its gated pointer route on that refusal.
      await this.driver.call("double_click", {
        pid: resolved.pid,
        window_id: resolved.windowId,
        delivery_mode: "foreground",
        ...this.elementTarget(resolved, args.element_index),
      });
      this.markAction(resolved);
      return;
    }
    await this.driver.call("click", {
      ...windowObservation,
      pid: resolved.pid,
      window_id: resolved.windowId,
      action: mapped?.action ?? args.action,
      ...(this.target === "mac" ? { delivery_mode: "foreground" } : {}),
      ...this.elementTarget(resolved, args.element_index),
    });
    this.markAction(resolved);
  }

  async press_key(args: {
    app: string;
    key: string;
    /** Explicit native app keyboard scope follows its current window. */
    scope?: "window" | "app";
    element_index?: number;
    x?: number;
    y?: number;
    /** Auxiliary native window-change poll;50–1000ms, legacy default1000. */
    window_change_timeout_ms?: number;
  }): Promise<void> {
    const windowObservation = nativeWindowObservationArgs(args?.window_change_timeout_ms);

    if (!args?.app || !args.key) throw invalidParams();
    if (args.element_index !== undefined && typeof args.element_index !== "number") {
      throw invalidParams("element_index must be a number");
    }
    const hasX = typeof args.x === "number";
    const hasY = typeof args.y === "number";
    if (hasX !== hasY) throw invalidParams("x and y must be provided together");
    if (args.element_index !== undefined && hasX) {
      throw invalidParams("element_index cannot be combined with x/y");
    }
    if (args.scope !== undefined && args.scope !== "window" && args.scope !== "app") throw invalidParams("Invalid keyboard scope");
    if (args.scope === "app" && (args.element_index !== undefined || hasX)) throw invalidParams("App keyboard scope cannot carry an observed element or coordinate target");
    let resolved = await this.requireResolved(args.app);
    if (args.scope === "app") {
      if (this.target !== "mac" || resolved.browser || resolved.contentScope) throw invalidParams("App keyboard scope requires a native Mac app binding");
      resolved = await this.observeAppWindow(resolved, false, false);
    }
    if (resolved.browser) {
      if (hasX) {
        throw this.typedBrowserUnsupported(
          resolved,
          "coordinate press_key",
          "Use an optional type-capable element_index, or omit a target to send the key to the page's current focus.",
        );
      }
      const browser = resolved.browser;
      const ref = args.element_index === undefined
        ? undefined
        : this.browserElement(resolved, args.element_index, "type").browser_ref;
      const result = await this.driver.call("browser_key", {
        target_id: browser.targetId,
        tab_id: browser.tabId,
        session: browser.session,
        key: args.key,
        ...(ref ? { ref } : {}),
      });
      const status = asRecord(result.structured);
      // Recent Cua releases project action receipts into the public contract,
      // removing legacy target/path fields after validating the exact request.
      const projectedDelivery = status?.route === "trusted_input" &&
        asRecord(status.delivery)?.mode === "background" && status.effect === "unverifiable";
      if (
        !projectedDelivery && (status?.status !== "ok" || status.target_id !== browser.targetId ||
        status.tab_id !== browser.tabId || status.path !== "cdp_input" ||
        status.effect !== "unverifiable")
      ) {
        throw new OpenSkyError(
          "Exact-tab key delivery returned an ambiguous acknowledgement and may have completed. " +
            "Observe the target before deciding whether to retry.",
        );
      }
      this.markAction(resolved);
      return;
    }
    const requestedKey = parseXdotoolKey(args.key, this.target);
    const parsed = this.target === "mac" ? toMacDriverKey(requestedKey) : requestedKey;
    const boundWindow = await this.refreshBoundWindow(resolved);
    if (!boundWindow) {
      throw new OpenSkyError(
        `Application ${JSON.stringify(resolved.name)} has no exact ordinary window for safe keyboard input. ` +
          "Refresh after a window exists; global input was not sent.",
      );
    }
    const target: Record<string, unknown> = {};
    if (args.element_index !== undefined) {
      Object.assign(target, this.elementTarget(resolved, args.element_index));
    } else if (hasX) {
      await this.requireUsableInputWindow(resolved);
      target.x = args.x;
      target.y = args.y;
    }
    if (Object.keys(target).length > 0) {
      if (args.element_index !== undefined) {
        await this.pressElementKey(resolved, args.element_index, parsed.key, parsed.modifiers, windowObservation);
      } else {
        await this.driver.call("press_key", { ...windowObservation,
          pid: resolved.pid,
          window_id: resolved.windowId,
          key: parsed.key,
          ...(parsed.modifiers.length > 0 ? { modifiers: parsed.modifiers } : {}),
          delivery_mode: "foreground",
          ...target,
        });
      }
      this.markAction(resolved);
      return;
    }
    if (parsed.modifiers.length > 0) {
      await this.driver.call("hotkey", { ...windowObservation,
        pid: resolved.pid,
        window_id: resolved.windowId,
        keys: toHotkeyKeys(parsed),
        delivery_mode: "foreground",
      });
      this.markAction(resolved);
      return;
    }
    await this.driver.call("press_key", { ...windowObservation,
      pid: resolved.pid,
      window_id: resolved.windowId,
      key: parsed.key,
      delivery_mode: "foreground",
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
    const hasX = typeof args.x === "number";
    const hasY = typeof args.y === "number";
    if (hasX !== hasY) throw invalidParams("x and y must be provided together");
    if (args.element_index !== undefined && hasX) throw invalidParams("element_index cannot be combined with x/y");
    const direction = normalizeDirection(args.direction);
    const resolved = await this.requireResolved(args.app);
    if (resolved.browser) {
      const pages = args.pages ?? 1;
      if (!Number.isFinite(pages) || pages <= 0) throw invalidParams("pages must be a positive number");
      if (hasX) {
        const point = this.browserScreenshotPoint(resolved, args.x!, args.y!, "coordinate scrolling");
        await this.driver.call("browser_pointer", {
          target_id: resolved.browser.targetId,
          tab_id: resolved.browser.tabId,
          ...point,
          input_route: "trusted",
          action: "scroll",
          delta_x: direction === "left" ? -800 * pages : direction === "right" ? 800 * pages : 0,
          delta_y: direction === "up" ? -600 * pages : direction === "down" ? 600 * pages : 0,
          session: resolved.browser.session,
        });
        this.markAction(resolved);
        return;
      }
      const element = typeof args.element_index === "number"
        ? this.browserElementWithAnyAction(resolved, args.element_index, ["scroll", "pointer"])
        : this.maybeUniqueBrowserElement(resolved, ["scroll"]);
      if (!element?.browser_ref) {
        throw this.typedBrowserUnsupported(
          resolved,
          "ambient scrolling",
          "Use a scroll-capable element_index from the latest semantic state. If none is present, the driver cannot yet expose this page's document scroller.",
        );
      }
      await this.driver.call("browser_pointer", {
        target_id: resolved.browser.targetId,
        tab_id: resolved.browser.tabId,
        ref: element.browser_ref,
        input_route: "dom_event",
        action: "scroll",
        delta_x: direction === "left" ? -800 * pages : direction === "right" ? 800 * pages : 0,
        delta_y: direction === "up" ? -600 * pages : direction === "down" ? 600 * pages : 0,
        session: resolved.browser.session,
      });
      this.markAction(resolved);
      return;
    }
    if (typeof args.element_index !== "number") await this.requireUsableInputWindow(resolved);
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
    try {
      await this.driver.call("scroll", payload);
    } catch (error) {
      // This refusal is emitted before the driver has an input route, so one
      // replay against this already-bound window is safe. Other scroll errors
      // can follow partial delivery and must remain observable to the caller.
      if (!(error instanceof OpenSkyError) || error.code !== "background_unavailable" || !resolved.windowId) throw error;
      await this.driver.call("scroll", { ...payload, delivery_mode: "foreground" });
    }
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
    const selectionType = args.selection_type === "exact" ? "text" : (args.selection_type ?? "text");
    if (selectionType !== "text" && selectionType !== "cursor_before" && selectionType !== "cursor_after") {
      throw invalidParams();
    }
    const resolved = await this.requireResolved(args.app);
    if (resolved.browser) {
      throw new OpenSkyError("select_text is not available for typed browser pages; copy observed page text directly instead.");
    }
    if (this.target === "linux" || this.target === "mac") {
      // Native Text offsets belong to this element, not the whole document.
      // The driver matches live text and verifies the resulting range/caret.
      // Never replay a partial selection as keyboard or pointer input.
      try {
        const result = await this.driver.call("select_text", {
          pid: resolved.pid,
          ...this.elementTarget(resolved, args.element_index),
          text: args.text,
          ...(args.prefix === undefined ? {} : { prefix: args.prefix }),
          ...(args.suffix === undefined ? {} : { suffix: args.suffix }),
          selection_type: selectionType,
        });
        const outcome = asRecord(result.structured);
        if (outcome?.status !== "completed" || outcome.verified !== true) {
          throw new OpenSkyError(
            "The driver did not verify the requested text selection. Observe before retrying; selection may have changed.",
            typeof outcome?.code === "string" ? outcome.code : "selection_unverified",
            outcome,
          );
        }
      } finally {
        // A refused receipt can follow a partial range mutation.
        this.markAction(resolved);
      }
      return;
    }
    const snapshot = this.memory.trees[windowKey(resolved)];
    const element = snapshot?.elements.find((item) => item.element_index === args.element_index);
    const haystack = element?.value ?? snapshot?.tree ?? "";
    const index = findWithContext(haystack, args.text, args.prefix, args.suffix);
    if (index < 0) {
      throw new OpenSkyError(`Text ${JSON.stringify(args.text)} was not found in element ${args.element_index}`);
    }

    // Windows retains the existing keyboard fallback until its native range
    // operation has equivalent real-platform acceptance.
    const beforeMoves = index;
    const moves = args.text.length;

    await this.pressElementKey(
      resolved,
      args.element_index,
      "home",
      ["ctrl"],
    );
    for (let i = 0; i < beforeMoves; i += 1) {
      await this.pressElementKey(resolved, args.element_index, "right");
    }
    if (selectionType === "cursor_before") return;
    if (selectionType === "cursor_after") {
      for (let i = 0; i < moves; i += 1) {
        await this.pressElementKey(resolved, args.element_index, "right");
      }
      return;
    }
    for (let i = 0; i < moves; i += 1) {
      await this.pressElementKey(resolved, args.element_index, "right", ["shift"]);
    }
  }

  async set_value(args: { app: string; element_index: number; value: string; window_change_timeout_ms?: number }): Promise<void> {
    const windowObservation = nativeWindowObservationArgs(args?.window_change_timeout_ms);
    if (!args?.app || typeof args.element_index !== "number" || typeof args.value !== "string") {
      throw invalidParams();
    }
    const resolved = await this.requireResolved(args.app);
    if (resolved.browser) {
      const element = this.browserElement(resolved, args.element_index, "type");
      await this.driver.call("browser_type", {
        target_id: resolved.browser.targetId,
        tab_id: resolved.browser.tabId,
        ref: element.browser_ref,
        text: args.value,
        replace: true,
        session: resolved.browser.session,
      });
      this.markAction(resolved);
      return;
    }
    const nativeElement = this.memory.trees[windowKey(resolved)]?.elements
      .find(item => item.element_index === args.element_index);
    const focusText = this.target === "mac" && nativeElement
      && ["AXTextField", "AXTextArea", "AXComboBox"].includes(nativeElement.role ?? "");
    await this.driver.call("set_value", {
      ...windowObservation,
      ...(focusText ? { delivery_mode: "foreground" } : {}),
      pid: resolved.pid,
      window_id: resolved.windowId,
      value: args.value,
      ...this.elementTarget(resolved, args.element_index),
    });
    this.markAction(resolved);
  }

  async type_text(args: {
    app: string;
    text: string;
    /** Explicit native app keyboard scope follows its current window. */
    scope?: "window" | "app";
    element_index?: number;
    x?: number;
    y?: number;
    /** Auxiliary native window-change poll;50–1000ms, legacy default1000. */
    window_change_timeout_ms?: number;
  }): Promise<void> {
    const windowObservation = nativeWindowObservationArgs(args?.window_change_timeout_ms);
    if (!args?.app || typeof args.text !== "string") throw invalidParams();
    if (args.element_index !== undefined && typeof args.element_index !== "number") {
      throw invalidParams("element_index must be a number");
    }
    const hasX = typeof args.x === "number";
    const hasY = typeof args.y === "number";
    if (hasX !== hasY) throw invalidParams("x and y must be provided together");
    if (args.element_index !== undefined && hasX) {
      throw invalidParams("element_index cannot be combined with x/y");
    }
    if (args.scope !== undefined && args.scope !== "window" && args.scope !== "app") throw invalidParams("Invalid keyboard scope");
    if (args.scope === "app" && (args.element_index !== undefined || hasX)) throw invalidParams("App keyboard scope cannot carry an observed element or coordinate target");
    let resolved = await this.requireResolved(args.app);
    if (args.scope === "app") {
      if (this.target !== "mac" || resolved.browser || resolved.contentScope) throw invalidParams("App keyboard scope requires a native Mac app binding");
      resolved = await this.observeAppWindow(resolved, false, false);
    }
    if (resolved.browser) {
      if (hasX) {
        throw this.typedBrowserUnsupported(
          resolved,
          "coordinate typing",
          "Use a type-capable element_index from the semantic state.",
        );
      }
      const element = args.element_index !== undefined
        ? this.browserElement(resolved, args.element_index, "type")
        : this.uniqueFocusedBrowserTypeElement(resolved);
      await this.driver.call("browser_type", {
        target_id: resolved.browser.targetId,
        tab_id: resolved.browser.tabId,
        ref: element.browser_ref,
        text: args.text,
        session: resolved.browser.session,
      });
      this.markAction(resolved);
      return;
    }
    if (args.element_index === undefined) await this.requireUsableInputWindow(resolved);
    const payload: Record<string, unknown> = {
      ...(this.target === "mac" ? windowObservation : {}),
      pid: resolved.pid,
      window_id: resolved.windowId,
      text: args.text,
    };
    if (args.element_index !== undefined) {
      Object.assign(payload, this.elementTarget(resolved, args.element_index));
    } else if (hasX) {
      payload.x = args.x;
      payload.y = args.y;
    }
    // PID-routed typing cannot distinguish sibling native windows. Choose the
    // exact-window foreground route before any AX attempt rather than replaying
    // a refusal that may follow an unreadable AX write.
    if (this.target === "mac" && args.element_index === undefined) {
      payload.delivery_mode = "foreground";
      payload.delay_ms = 0;
    }
    try {
      await this.driver.call("type_text", payload);
    } catch (error) {
      // This typed refusal means background delivery has no input actuator.
      // Retry against the same proven window, as click/key input already does.
      // Do not retry arbitrary typing errors: input may already have occurred.
      if (!(error instanceof OpenSkyError) || error.code !== "background_unavailable" || !resolved.windowId || payload.delivery_mode === "foreground") throw error;
      await this.driver.call("type_text", { ...payload, delivery_mode: "foreground" });
    }
    this.markAction(resolved);
  }

  async invoke(tool: string, args: Record<string, unknown> = {}) {
    return this.driver.call(tool, args);
  }

  private async requireResolved(app: string): Promise<ResolvedApp> {
    await this.ensureLoaded();
    const cached = this.targetForSelector(app);
    if (cached) this.assertTargetUsable(cached);
    if (looksLikeTargetHandle(app)) {
      if (!cached) throw unknownTargetHandle(app);
      return cached;
    }
    if (cached?.pid && this.resolvedThisProcess.has(cached.handle)) return cached;
    return this.resolveApp(app, { launchIfNeeded: this.autoLaunch });
  }

  private async requireExactTypedBrowser(app: string, operation: string): Promise<ResolvedApp> {
    await this.ensureLoaded();
    const resolved = this.targetForSelector(app);
    if (resolved) this.assertTargetUsable(resolved);
    if (looksLikeTargetHandle(app) && !resolved) throw unknownTargetHandle(app);
    const browser = resolved?.browser;
    if (!resolved || !browser || !this.managedBrowserSessions.has(browser.session)) {
      throw new OpenSkyError(
        `${operation} requires an exact active typed browser binding for ${JSON.stringify(app)}. ` +
          "No app was launched and no native keyboard or pointer input was sent.",
      );
    }
    return resolved;
  }

  private async resolveApp(app: string, options: { launchIfNeeded: boolean }): Promise<ResolvedApp> {
    await this.ensureLoaded();
    if (looksLikeTargetHandle(app)) throw unknownTargetHandle(app);
    const cached = this.targetForSelector(app);
    const listed = await this.listRawApps();
    const match = findApp(listed, app);
    if (match && (match.running || match.pid)) {
      let source = match;
      let pid = Number(match.pid);
      let windowId = await this.pickWindow(pid, match);
      let relaunched = false;
      if (!windowId && options.launchIfNeeded) {
        const launchArgs = launchArgsFor(app, match);
        let launched = await this.driver.call("launch_app", launchArgs);
        source = { ...match, ...(asRecord(launched.structured) ?? {}) };
        const nextPid = Number(source.pid);
        if (Number.isFinite(nextPid) && nextPid > 0) pid = nextPid;
        windowId = await this.pickWindow(pid, source);
        if (!windowId && !launchDispatchRefused(source)) {
          await sleep(this.settleDelayMs);
          launched = await this.driver.call("launch_app", launchArgs);
          source = { ...source, ...(asRecord(launched.structured) ?? {}) };
          const retryPid = Number(source.pid);
          if (Number.isFinite(retryPid) && retryPid > 0) pid = retryPid;
          windowId = await this.pickWindow(pid, source);
        }
        const recoveryPath = optionalString(source.launch_path) ?? optionalString(match.launch_path);
        if (!windowId && !launchDispatchRefused(source) && this.target === "mac" && recoveryPath) {
          launched = await this.driver.call("launch_app", { ...launchArgs, urls: [recoveryPath] });
          source = { ...source, ...(asRecord(launched.structured) ?? {}) };
          const recoveryPid = Number(source.pid);
          if (Number.isFinite(recoveryPid) && recoveryPid > 0) pid = recoveryPid;
          windowId = await this.pickWindow(pid, source);
        }
        if (!windowId && launchDispatchRefused(source)) {
          throw new OpenSkyError(
            `The desktop helper could not reveal an ordinary window for ${JSON.stringify(app)} ` +
            `(${String(source.error)}). No keyboard or pointer input was sent.`,
          );
        }
        if (!windowId) {
          throw new OpenSkyError(
            `The desktop helper could not reveal an ordinary window for ${JSON.stringify(app)} after bounded launch recovery. ` +
            "Retrying app aliases or global keyboard shortcuts will not create a safe target; no input was sent.",
          );
        }
        relaunched = true;
      }
      const resolved: ResolvedApp = {
        handle: cached?.pid === pid ? cached.handle : newTargetHandle(),
        openedAt: cached?.pid === pid ? cached.openedAt : this.nextOpenedAt(),
        query: app,
        name: String(source.name ?? match.name ?? app),
        bundleId: optionalString(source.bundle_id) ?? optionalString(match.bundle_id),
        launchPath: optionalString(source.launch_path) ?? optionalString(match.launch_path),
        pid,
        windowId,
        contentScope: cached?.pid === pid ? cached.contentScope : undefined,
        targetRequest: cached?.pid === pid ? cached.targetRequest : undefined,
        nativeCloseAuthority: cached?.pid === pid && cached.windowId === windowId
          ? cached.nativeCloseAuthority
          : undefined,
      };
      this.registerTarget(resolved);
      this.markResolved(resolved);
      if (relaunched) this.markAction(resolved);
      await this.persist();
      return resolved;
    }

    if (!options.launchIfNeeded) {
      throw new OpenSkyError(`Application ${JSON.stringify(app)} is not running`);
    }

    const launchArgs = launchArgsFor(app, match);
    const launched = await this.driver.call("launch_app", launchArgs);
    const structured = asRecord(launched.structured) ?? {};
    if (launchDispatchRefused(structured)) {
      throw new OpenSkyError(
        `The desktop helper could not launch ${JSON.stringify(app)} (${String(structured.error)}). ` +
        "No keyboard or pointer input was sent.",
      );
    }
    const pid = Number(structured.pid ?? match?.pid);
    if (!Number.isFinite(pid) || pid <= 0) {
      throw new OpenSkyError(`Failed to launch ${JSON.stringify(app)}`);
    }
    const windows = asArray<Record<string, unknown>>(structured.windows);
    const windowId = pickWindowId(windows) ?? (await this.pickWindow(pid, structured));
    const resolved: ResolvedApp = {
      handle: newTargetHandle(),
      openedAt: this.nextOpenedAt(),
      query: app,
      name: String(structured.name ?? match?.name ?? app),
      bundleId: optionalString(structured.bundle_id) ?? optionalString(match?.bundle_id),
      launchPath: optionalString(structured.launch_path) ?? optionalString(match?.launch_path),
      pid,
      windowId,
    };
    this.markAction(resolved);
    this.registerTarget(resolved);
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

  private targetForSelector(selector: string): ResolvedApp | undefined {
    const trimmed = selector.trim();
    if (looksLikeTargetHandle(trimmed)) {
      return this.memory.targets[trimmed as TargetHandle];
    }
    const handle = this.memory.aliases[normalizeAppKey(trimmed)];
    return handle ? this.memory.targets[handle] : undefined;
  }

  private registerTarget(resolved: ResolvedApp): void {
    this.lastOpenedAt = Math.max(this.lastOpenedAt, resolved.openedAt);
    this.memory.targets[resolved.handle] = resolved;
    for (const alias of targetAliases(resolved)) {
      this.memory.aliases[alias] = resolved.handle;
    }
  }

  private nextOpenedAt(): number {
    this.lastOpenedAt = Math.max(Date.now(), this.lastOpenedAt + 1);
    return this.lastOpenedAt;
  }

  private removeTarget(handle: TargetHandle): void {
    const removed = this.memory.targets[handle];
    if (!removed) return;
    delete this.memory.targets[handle];
    delete this.memory.trees[handle];
    this.lastActionAt.delete(handle);
    this.resolvedThisProcess.delete(handle);
    for (const [alias, current] of Object.entries(this.memory.aliases)) {
      if (current !== handle) continue;
      const replacement = Object.values(this.memory.targets)
        .filter((candidate) => targetAliases(candidate).includes(alias))
        .sort((a, b) => b.openedAt - a.openedAt)[0];
      if (replacement) this.memory.aliases[alias] = replacement.handle;
      else delete this.memory.aliases[alias];
    }
  }

  private async closeResolvedTarget(resolved: ResolvedApp): Promise<void> {
    const session = resolved.browser?.session;
    if (!session) return;
    await this.endSessionConfirmed(session);
    await this.browserLeases.release(session);
    this.managedBrowserSessions.delete(session);
    this.removeTarget(resolved.handle);
    await this.persist();
  }

  private async endSessionConfirmed(session: string, driver: DriverClient = this.driver): Promise<void> {
    const result = await driver.call("end_session", { session });
    const receipt = asRecord(result.structured);
    if (receipt?.session !== session || receipt.active !== false) {
      throw new OpenSkyError(
        `Ending owned driver session ${JSON.stringify(session)} was not confirmed by a matching inactive receipt. ` +
          "Exact ownership is retained; retry cleanup for the same session.",
        "session_end_unconfirmed",
        { session, receipt: result.structured },
      );
    }
  }

  private async verifyNativeCloseAuthority(
    pid: number,
    windowId: number,
    requestedDocument?: string,
  ): Promise<ResolvedApp["nativeCloseAuthority"]> {
    const verified = windowsFrom((await this.driver.call("list_windows", {
      pid, ...(requestedDocument ? { include_document_urls: true } : {}),
    })).structured)
      .filter(isOrdinaryWindow);
    if (requestedDocument && verified.some(window => "document_url" in window)) {
      if (await requestedDocumentWindow(verified, requestedDocument) !== windowId) return undefined;
    } else if (verified.length !== 1 || verified[0]?.window_id !== windowId) return undefined;
    return {
      kind: "request_created_exact_window",
      proof: "macos_new_application_instance",
      pid,
      windowId,
    };
  }

  private async pickWindow(
    pid: number,
    source: Record<string, unknown>,
    excludeIds: Set<number> = new Set(),
  ): Promise<number | undefined> {
    const fromSource = pickOrdinaryWindowId(
      asArray<Record<string, unknown>>(source.windows).filter((window) => {
        const id = window.window_id;
        return typeof id !== "number" || !excludeIds.has(id);
      }),
    );
    if (fromSource) return fromSource;
    const listed = await this.driver.call("list_windows", { pid });
    return pickOrdinaryWindowId(
      windowsFrom(listed.structured).filter((window) => {
        const id = window.window_id;
        return typeof id !== "number" || !excludeIds.has(id);
      }),
    );
  }

  /** Capture exact-window pixels while preserving the last visible AX diff baseline.
   * Linux capture-only retires semantic tokens, so collect AX and pixels atomically. */
  private async captureNativeWindowScreenshot(resolved: ResolvedApp): Promise<Screenshot | null> {
    if (!resolved.windowId || resolved.browser) throw invalidParams("Screenshot capture requires an exact native window");
    await mkdirPrivate(this.screenshotDir);
    const screenshotPath = join(this.screenshotDir,
      `${slug(resolved.name)}-${resolved.windowId}-${Date.now()}-${++this.screenshotSequence}.png`);
    if (this.target === "linux") {
      const key = windowKey(resolved);
      const previous = this.memory.trees[key];
      try {
        const snapshot = await this.snapshotWindow(resolved, {
          includeScreenshot: true, screenshotPath, requireValidScreenshot: true,
        });
        if (snapshot.degraded || !snapshot.snapshotId || !snapshot.screenshot) {
          throw new OpenSkyError("The driver could not capture current accessibility bindings with the exact window screenshot");
        }
        this.memory.trees[key] = {
          tree: snapshot.tree, elements: snapshot.elements, snapshotId: snapshot.snapshotId,
          // A private binding refresh must not consume changes the agent has
          // yet to see in its next accessibility observation.
          observationBaseline: previous?.observationBaseline ?? (previous ? {
            tree: previous.tree, elements: previous.elements, viewKind: previous.viewKind,
          } : { tree: "", elements: [] }),
        };
        return snapshot.screenshot;
      } catch (error) {
        // Collection may retire the old driver snapshot before failing. Never
        // preserve its input authority or replay input after a failed capture.
        if (this.memory.trees[key] === previous) {
          delete this.memory.trees[key];
          resolved.snapshotId = undefined;
          await this.persist().catch(() => undefined);
        }
        throw error;
      }
    }
    const result = await this.driver.call("get_window_state", {
      pid: resolved.pid,
      window_id: resolved.windowId,
      include_accessibility_tree: false,
      include_screenshot: true,
      screenshot_out_file: screenshotPath,
      screenshot_format: this.screenshotFormat,
      screenshot_scale: this.screenshotScale,
    });
    const structured = asRecord(result.structured) ?? {};
    if (structured.screenshot_frame_valid === false) {
      throw new OpenSkyError("The driver could not validate the exact window screenshot", undefined, structured);
    }
    const filePath = optionalString(structured.screenshot_file_path) ??
      await maybeWriteScreenshot(structured, screenshotPath);
    if (!filePath) return null;
    await chmod(filePath, 0o600).catch(() => undefined);
    return await screenshotFromFile(filePath, frameOf(structured)) ?? null;
  }

  private async snapshotWindow(
    resolved: ResolvedApp,
    options: { includeScreenshot: boolean; requireValidScreenshot?: boolean; screenshotPath?: string; maxDepth?: number; query?: string; collectionScope?: "visible" | "all" },
  ): Promise<WindowSnapshot> {
    if (!resolved.browser && !resolved.windowId) {
      resolved.windowId = await this.pickWindow(resolved.pid, {});
    }
    if (!resolved.browser && !resolved.windowId) {
      throw new OpenSkyError(`No window found for ${resolved.name} (pid ${resolved.pid})`);
    }
    if (resolved.browser) {
      const key = windowKey(resolved);
      const previous = this.memory.trees[key];
      try {
        return await this.snapshotBrowser(resolved, options);
      } catch (error) {
        // A fresh read may already have replaced the driver's snapshot before
        // its metadata fails validation. Do not retain old input/cursor authority,
        // and do not erase a newer successful concurrent observation.
        if (this.memory.trees[key] === previous) {
          delete this.memory.trees[key];
          resolved.browser.screenshotMapping = undefined;
          await this.persist().catch(() => undefined);
        }
        throw error;
      }
    }
    await mkdirPrivate(this.screenshotDir);
    const screenshotPath = options.screenshotPath ?? join(this.screenshotDir, `${slug(resolved.name)}-${resolved.windowId}.png`);
    const captureArgs = {
      pid: resolved.pid,
      window_id: resolved.windowId,
      include_screenshot: options.includeScreenshot,
      screenshot_out_file: options.includeScreenshot ? screenshotPath : undefined,
      screenshot_format: this.screenshotFormat,
      screenshot_scale: this.screenshotScale,
      max_depth: options.maxDepth,
    };
    // Full Mac walks use the existing recovery budget directly. The driver
    // returns as soon as collection finishes; a short initial timeout followed
    // by the same full walk discards work and publishes an unused snapshot.
    // Depth-limited reads and other platforms retain their own defaults.
    const result = await this.driver.call("get_window_state", {
      ...captureArgs,
      ...(this.target === "mac" && options.maxDepth === undefined ? { timeout_ms: 5000 } : {}),
    });
    const structured = asRecord(result.structured) ?? {};
    if (options.requireValidScreenshot && structured.screenshot_frame_valid === false) {
      throw new OpenSkyError("The driver could not validate the exact window screenshot", undefined, structured);
    }
    let rawElements = normalizeElements(structured.elements);
    const rawTree =
      (typeof structured.tree_markdown === "string" && structured.tree_markdown) ||
      (typeof structured.text === "string" && structured.text) ||
      "";
    const menuCapabilities = this.target === "mac"
      ? projectClosedMenuActions(rawTree, rawElements) : { tree: rawTree, elements: rawElements };
    rawElements = menuCapabilities.elements;
    const collectedElementCount = rawElements.length;
    const sanitized = sanitizeTreeText(menuCapabilities.tree, rawElements);
    const collection = this.target === "mac" && options.collectionScope !== "all" && options.maxDepth === undefined && resolved.contentScope !== "web"
      ? projectNativeCollectionRows(sanitized, rawElements, structured.native_collections)
      : { tree: sanitized, elements: rawElements, hiddenIndices: new Set<number>() };
    rawElements = collection.elements;
    const nativeWeb = this.target === "mac" && options.collectionScope !== "all" && options.maxDepth === undefined
      && resolved.contentScope !== "web" && structured.truncated !== true && structured.degraded !== true && structured.nodes_pending === 0
      ? projectNativeWebText(collection.tree, rawElements, asRecord(structured.text_selection) ?? undefined)
      : {tree: collection.tree, elements: rawElements, hiddenIndices: new Set<number>()};
    rawElements = nativeWeb.elements;
    const scoped = resolved.contentScope === "web" ? isolatePrimaryWebArea(nativeWeb.tree) : nativeWeb.tree;
    const visibleMenuIndices = new Set(rawElements.filter(element => element.role === "AXMenu"
      && element.enabled !== false && element.frame && element.frame.w > 0 && element.frame.h > 0)
      .map(element => element.element_index));
    const menuPruned = pruneMenuSubtrees(scoped, visibleMenuIndices);
    const pruned = this.target === "mac"
      ? projectActiveMenu(menuPruned.tree, rawElements, visibleMenuIndices, menuPruned.hiddenIndices)
      : menuPruned;
    const scopedIndices = resolved.contentScope === "web" ? indicesInTree(pruned.tree) : undefined;
    const visibleElements = pruned.hiddenIndices.size
      ? rawElements.filter((element) =>
          !pruned.hiddenIndices.has(element.element_index) &&
          (!scopedIndices || scopedIndices.has(element.element_index)),
        )
      : scopedIndices
        ? rawElements.filter((element) => scopedIndices.has(element.element_index))
        : rawElements;
    const previousElements = this.memory.trees[windowKey(resolved)]?.elements ?? [];
    const previousDocument = primaryDocumentFingerprint(previousElements);
    const namedElements = options.maxDepth !== undefined
      ? visibleElements : nameAnonymousContainers(pruned.tree, visibleElements);
    const currentDocument = primaryDocumentFingerprint(namedElements);
    const documentChanged = resolved.contentScope === "web" && previousDocument !== undefined &&
      currentDocument !== undefined && previousDocument !== currentDocument;
    const elements = stabilizeElementIndices(documentChanged ? [] : previousElements, namedElements, pruned.hiddenIndices.size > 0 || collection.hiddenIndices.size > 0 || nativeWeb.hiddenIndices.size > 0);
    const remappedTree = remapTreeIndices(pruned.tree || renderTree(visibleElements), elements);
    const tree = enrichTreeSemantics(compactTreeActionHints(remappedTree, elements), elements);
    const snapshotId = optionalString(structured.snapshot_id);
    const filePath =
      optionalString(structured.screenshot_file_path) ??
      (options.includeScreenshot ? await maybeWriteScreenshot(structured, screenshotPath) : null);
    const frame = frameOf(structured);
    const screenshot = filePath ? await screenshotFromFile(filePath, frame) : undefined;
    const returnedElementCount = optionalFiniteNumber(structured.returned_element_count) ?? rawElements.length;
    const totalElementCount = optionalFiniteNumber(structured.total_element_count) ??
      optionalFiniteNumber(structured.element_count) ?? returnedElementCount;
    if (filePath) await chmod(filePath, 0o600).catch(() => undefined);
    resolved.snapshotId = snapshotId;
    this.memory.targets[resolved.handle] = resolved;
    return {
      pid: resolved.pid,
      windowId: resolved.windowId!,
      snapshotId,
      tree,
      elements,
      textSelection: !structured.degraded && this.target === "mac"
        ? parseTextSelection(structured.text_selection, resolved.pid, resolved.windowId!) : undefined,
      screenshotPath: filePath,
      screenshot: screenshot ?? (filePath ? { url: pathToFileURL(filePath).href } : undefined),
      frame,
      degraded: structured.degraded === true,
      degradedReason: optionalString(structured.degraded_reason),
      truncated: structured.truncated === true || structured.elements_complete === false || totalElementCount > returnedElementCount,
      rawElementCount: collectedElementCount,
      totalElementCount,
      returnedElementCount,
      documentChanged,
    };
  }

  private async snapshotBrowser(
    resolved: ResolvedApp,
    options: { includeScreenshot: boolean; screenshotPath?: string; query?: string },
  ): Promise<WindowSnapshot> {
    const browser = resolved.browser;
    if (!browser || resolved.windowId === undefined) {
      throw new OpenSkyError("Typed browser snapshot requested without an exact binding.");
    }
    await mkdirPrivate(this.screenshotDir);
    const screenshotPath = options.screenshotPath ?? join(
      this.screenshotDir,
      `${slug(resolved.name)}-${resolved.windowId}-${Date.now()}-${++this.screenshotSequence}.png`,
    );
    // Navigation can invalidate the frame between CDP discovery and the AX
    // read. Retry only that read, retaining the exact binding and arguments.
    const request = {
      target_id: browser.targetId,
      tab_id: browser.tabId,
      session: browser.session,
      snapshot_format: "semantic_v2",
      include_screenshot: options.includeScreenshot,
      ...(options.query ? { query: options.query } : {}),
    };
    const retryDeadline = Date.now() + Math.max(0, this.degradedRetryMs);
    let result: Awaited<ReturnType<DriverClient["call"]>>;
    for (let attempt = 1; ; attempt++) {
      try {
        result = await this.driver.call("get_browser_state", request);
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/\bAccessibility\.getFullAXTree\b/.test(message) || !/Frame with the given frameId is not found/i.test(message)) throw error;
        browser.screenshotMapping = undefined;
        const exhausted = () => new OpenSkyError(
          `The exact browser snapshot remained unavailable after ${attempt} read attempt(s): ${message}. ` +
            "Observe the same target again; no input, navigation, or binding change was retried.",
          "browser_snapshot_transient_exhausted",
        );
        const remaining = retryDeadline - Date.now();
        if (attempt >= 3 || remaining <= 0) throw exhausted();
        await sleep(Math.min(100 * attempt, remaining));
        if (Date.now() >= retryDeadline) throw exhausted();
      }
    }
    const structured = asRecord(result.structured) ?? {};
    if (structured.status !== "ok" || structured.mode !== "snapshot") {
      throw new OpenSkyError("The desktop helper did not return a semantic browser snapshot.");
    }
    const page = asRecord(structured.page) ?? {};
    const priorUrl = browser.url;
    const priorDocumentId = browser.documentId;
    const nextUrl = optionalString(page.url);
    const nextDocumentId = optionalString(page.document_id);
    const rawElements = normalizeBrowserElements(structured.refs, structured.content_refs);
    const previousElements = this.memory.trees[windowKey(resolved)]?.elements ?? [];
    const documentChanged =
      (priorDocumentId !== undefined && nextDocumentId !== undefined && priorDocumentId !== nextDocumentId) ||
      (priorUrl !== undefined && nextUrl !== undefined && priorUrl !== nextUrl);
    const elements = stabilizeElementIndices(documentChanged ? [] : previousElements, rawElements, true);
    const outline = optionalString(structured.outline) ?? "";
    const snapshot = asRecord(structured.snapshot) ?? {};
    if (structured.query_contexts !== undefined && (!options.query || snapshot.format !== "semantic_v2" ||
        snapshot.scope !== "query" || structured.target_id !== browser.targetId || structured.tab_id !== browser.tabId)) throw contextFailure();
    const contexts = validateQueryContexts(structured.query_contexts, optionalString(snapshot.id) ?? "", elements);
    const bindings = contextBindings(contexts, elements);
    const rendered = renderBrowserObservation(outline, elements, structured, options.query !== undefined);
    const screenshot = options.includeScreenshot
      ? await browserScreenshotFromResult(result.raw, structured, screenshotPath)
      : undefined;
    const mapping = screenshotMappingFrom(structured);
    browser.url = nextUrl;
    browser.documentId = nextDocumentId;
    browser.title = browserPageTitle(page);
    browser.screenshotMapping = options.includeScreenshot && screenshot && mapping ? mapping : undefined;
    const selectedNodes = optionalFiniteNumber(snapshot.selected_nodes) ?? rawElements.length;
    const totalNodes = optionalFiniteNumber(snapshot.total_nodes) ?? selectedNodes;
    return {
      pid: resolved.pid,
      windowId: resolved.windowId,
      snapshotId: optionalString(snapshot.id),
      tree: rendered.text,
      elements,
      screenshotPath: screenshot ? screenshotPath : null,
      screenshot,
      truncated: snapshot.complete === false || rendered.truncated,
      rawElementCount: rawElements.length,
      totalElementCount: totalNodes,
      returnedElementCount: selectedNodes,
      documentChanged,
      ...bindings,
    };
  }

  private async snapshotSettled(
    resolved: ResolvedApp,
    options: { includeScreenshot: boolean; stabilizeBrowser?: boolean; query?: string; collectionScope?: "visible" | "all" },
  ): Promise<WindowSnapshot> {
    const deadline = Date.now() + this.degradedRetryMs;
    let delayMs = 150;
    const screenshotPath = join(
      this.screenshotDir,
      `${slug(resolved.name)}-${resolved.windowId}-${Date.now()}-${++this.screenshotSequence}.png`,
    );
    const stabilizeBrowser = Boolean(
      resolved.browser && options.stabilizeBrowser && this.browserStabilityTimeoutMs > 0,
    );
    const browserStabilityDeadline = Date.now() + this.browserStabilityTimeoutMs;
    const captureOptions = {
      includeScreenshot: stabilizeBrowser ? false : options.includeScreenshot,
      screenshotPath,
      query: options.query,
      collectionScope: options.collectionScope,
    };
    let snapshot = await this.snapshotWindow(resolved, captureOptions);
    while (snapshot.degraded && Date.now() < deadline) {
      await sleep(Math.min(delayMs, Math.max(0, deadline - Date.now())));
      delayMs = Math.min(delayMs * 2, 800);
      snapshot = await this.snapshotWindow(resolved, captureOptions);
    }
    if (stabilizeBrowser && !snapshot.degraded) {
      let delayMs = 150;
      let signature = browserStabilitySignature(snapshot, resolved.browser);
      let documentChanged = snapshot.documentChanged === true;
      while (Date.now() < browserStabilityDeadline) {
        await sleep(Math.min(delayMs, Math.max(0, browserStabilityDeadline - Date.now())));
        if (documentChanged) {
          this.memory.trees[windowKey(resolved)] = {
            tree: snapshot.tree,
            elements: snapshot.elements,
            snapshotId: snapshot.snapshotId,
            contextDomains: snapshot.contextDomains,
            contextContinuations: snapshot.contextContinuations,
          };
        }
        const next = await this.snapshotWindow(resolved, {
          ...captureOptions,
          includeScreenshot: false,
        });
        documentChanged ||= next.documentChanged === true;
        const nextSignature = browserStabilitySignature(next, resolved.browser);
        snapshot = next;
        if (nextSignature === signature) break;
        signature = nextSignature;
        delayMs = Math.min(delayMs * 2, 600);
      }
      if (options.includeScreenshot) {
        if (documentChanged) {
          this.memory.trees[windowKey(resolved)] = {
            tree: snapshot.tree,
            elements: snapshot.elements,
            snapshotId: snapshot.snapshotId,
            contextDomains: snapshot.contextDomains,
            contextContinuations: snapshot.contextContinuations,
          };
        }
        const captured = await this.snapshotWindow(resolved, {
          ...captureOptions,
          includeScreenshot: true,
        });
        documentChanged ||= captured.documentChanged === true;
        snapshot = captured;
      }
      snapshot.documentChanged = documentChanged;
    }
    // Unproven completeness is not evidence that the walk was truncated.
    // In particular Linux reports elements_complete=false even for a small
    // dialog. An unused projection would still replace its driver snapshot,
    // making the full observation's element tokens stale before input.
    const hasOmittedElements = snapshot.totalElementCount !== undefined &&
      snapshot.returnedElementCount !== undefined &&
      snapshot.totalElementCount > snapshot.returnedElementCount;
    const hasUnrepresentedElements = snapshot.returnedElementCount !== undefined &&
      snapshot.returnedElementCount > (snapshot.rawElementCount ?? snapshot.elements.length);
    const needsProjection = hasOmittedElements || (this.target !== "linux" && hasUnrepresentedElements);
    if (snapshot.truncated && needsProjection && !snapshot.degraded && !resolved.browser) {
      const full = snapshot;
      const projectionDepth = resolved.contentScope === "web" ? 5 : 3;
      const projected = await this.snapshotWindow(resolved, {
        includeScreenshot: false,
        screenshotPath,
        maxDepth: projectionDepth,
      });
      if (!projected.degraded && projected.tree.trim()) {
        projected.tree =
          `Accessibility projection: the default accessibility walk was incomplete after returning ${full.returnedElementCount ?? "its configured limit"}` +
          `${full.totalElementCount !== undefined ? ` of ${full.totalElementCount} discovered elements` : ""}, so deep repetitive descendants were ` +
          `collapsed at depth ${projectionDepth} while preserving their parent controls and landmarks.\n` +
          projected.tree;
        projected.screenshotPath = full.screenshotPath;
        projected.screenshot = full.screenshot;
        projected.frame = full.frame ?? projected.frame;
        snapshot = projected;
      }
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
    if (resolved.browser) resolved.browser.screenshotMapping = undefined;
    this.lastActionAt.set(windowKey(resolved), Date.now());
  }

  private async settleAfterAction(resolved: ResolvedApp): Promise<void> {
    const delayMs = resolved.browser ? this.settleDelayMs : this.nativeSettleDelayMs;
    if (delayMs <= 0) return;
    const actionAt = this.lastActionAt.get(windowKey(resolved));
    if (actionAt === undefined) return;
    const remaining = delayMs - (Date.now() - actionAt);
    if (remaining > 0) await sleep(remaining);
  }

  private async refreshWindowAfterAction(resolved: ResolvedApp): Promise<void> {
    const key = windowKey(resolved);
    if (!this.lastActionAt.has(key)) return;
    const listed = await this.driver.call("list_windows", { pid: resolved.pid });
    const windows = windowsFrom(listed.structured);
    const currentStillExists = resolved.windowId !== undefined && windows.some((window) =>
      window.window_id === resolved.windowId && isOrdinaryWindow(window),
    );
    resolved.windowId = currentStillExists ? resolved.windowId : undefined;
    this.lastActionAt.delete(key);
  }

  private async observeAppWindow(source: ResolvedApp, revealIfNeeded = false, preferFocusedControl = true): Promise<ResolvedApp> {
    let listed = await this.driver.call("list_windows", { pid: source.pid });
    let windows = windowsFrom(listed.structured);
    // An explicit named app binding can request normal macOS reopen semantics.
    // Existing handle observations never launch or reveal a replacement window.
    if (revealIfNeeded && this.target === "mac" && !source.browser && !source.contentScope &&
        !windows.some(window => window.pid === source.pid && isOrdinaryWindow(window) &&
          (window.is_on_screen === true || window.on_current_space === false))) {
      const apps = await this.listRawApps();
      const matches = apps.filter(app => app.bundle_id === source.bundleId && Number(app.pid) > 0);
      if (!source.bundleId || matches.length !== 1 || Number(matches[0]!.pid) !== source.pid) {
        throw new OpenSkyError("Cannot uniquely identify the running app to reopen; no lifecycle request or input was sent.");
      }
      const launched = asRecord((await this.driver.call("launch_app", { bundle_id: source.bundleId })).structured);
      if (!launched || launchDispatchRefused(launched) || !launchRequestWasSent(launched) ||
          Number(launched.pid) !== source.pid || launched.bundle_id !== source.bundleId) {
        throw new OpenSkyError("App reopen outcome is unproven. Observe the current desktop before another lifecycle request; no keyboard or pointer input was sent.");
      }
      // Poll the one request's actual window effects; never replay the launch.
      const deadline = Date.now() + 1_000;
      do {
        listed = await this.driver.call("list_windows", { pid: source.pid });
        windows = windowsFrom(listed.structured);
        if (windows.some(window => window.pid === source.pid && isOrdinaryWindow(window) &&
            window.is_on_screen === true && window.on_current_space !== false) || Date.now() >= deadline) break;
        await sleep(100);
      } while (true);
      source = {
        handle: newTargetHandle(), openedAt: this.nextOpenedAt(),
        query: source.query, name: source.name, bundleId: source.bundleId,
        launchPath: source.launchPath, pid: source.pid,
      };
    }
    const focused = this.target === "mac" ? asRecord(listed.structured)?.focused_window_id : undefined;
    const focusedControl = this.target === "mac" && preferFocusedControl ? asRecord(listed.structured)?.focused_element_window_id : undefined;
    const focusedSheetParent = this.target === "mac" ? asRecord(listed.structured)?.focused_sheet_parent_window_id : undefined;
    const multipleVisible = windows.filter((window) =>
      window.pid === source.pid && window.is_on_screen === true &&
      window.on_current_space !== false && isOrdinaryWindow(window),
    ).length > 1;
    let candidates = windows;
    let next: number | undefined;
    while (candidates.length > 0) {
      const candidate = pickAppWindowId(candidates, source.pid, focused, this.target === "mac" ? source.windowId : undefined, focusedControl, focusedSheetParent);
      if (candidate === undefined) break;
      // WindowServer can stack a Safari auxiliary surface above its document
      // window. An app-wide observation may choose the next visible window,
      // but only after proving that the top candidate has no matching AXWindow.
      if (this.target === "mac" && (multipleVisible || candidate === focusedControl || candidate === focusedSheetParent)) {
        const probe = await this.driver.call("get_window_state", {
          pid: source.pid, window_id: candidate,
          probe_only: true, include_screenshot: false,
        });
        const metadata = asRecord(probe.structured);
        if (metadata?.probe_only !== true || typeof metadata.window_matched !== "boolean" ||
          metadata.pid !== source.pid || metadata.window_id !== candidate) {
          throw new OpenSkyError("The desktop helper did not confirm an exact metadata-only window probe. Rebuild OpenSky Driver before observing this app with multiple visible windows.");
        }
        if (!metadata.window_matched) {
          if (candidate === focusedSheetParent) {
            throw new OpenSkyError("The focused sheet's exact parent window could not be observed. No input was sent; observe again after the dialog settles.");
          }
          candidates = candidates.filter((window) => window.window_id !== candidate);
          continue;
        }
      }
      next = candidate;
      break;
    }
    if (next === undefined) {
      throw new OpenSkyError("The app has no unambiguous frontmost visible window. No input was sent; reveal the intended window and observe again.");
    }
    this.lastActionAt.delete(windowKey(source));
    if (next === source.windowId) return source;
    // App scope permits observing another window of this process, but cannot
    // retarget an existing document handle or inherit its close authority.
    const resolved: ResolvedApp = {
      handle: newTargetHandle(), openedAt: this.nextOpenedAt(),
      query: source.query, name: source.name, bundleId: source.bundleId,
      launchPath: source.launchPath, pid: source.pid, windowId: next,
    };
    this.registerTarget(resolved);
    this.markResolved(resolved);
    await this.persist();
    return resolved;
  }

  private async refreshBoundWindow(resolved: ResolvedApp): Promise<number | undefined> {
    const listed = await this.driver.call("list_windows", { pid: resolved.pid });
    const windows = windowsFrom(listed.structured);
    const retained = resolved.windowId !== undefined && windows.some((window) =>
      window.window_id === resolved.windowId && isOrdinaryWindow(window),
    ) ? resolved.windowId : undefined;
    resolved.windowId = retained;
    return retained;
  }

  private async adoptWindowForObservation(resolved: ResolvedApp): Promise<number | undefined> {
    const listed = await this.driver.call("list_windows", { pid: resolved.pid });
    const windows = windowsFrom(listed.structured);
    const next = pickUsableWindowId(windows) ?? pickOrdinaryWindowId(windows);
    resolved.windowId = next;
    return next;
  }

  private async requireUsableInputWindow(resolved: ResolvedApp): Promise<void> {
    const listed = await this.driver.call("list_windows", { pid: resolved.pid });
    const windows = windowsFrom(listed.structured);
    const exact = windows.find((window) => window.window_id === resolved.windowId);
    if (!exact || !isOrdinaryWindow(exact)) {
      throw new OpenSkyError(
        `The exact bound window for ${JSON.stringify(resolved.name)} no longer exists; no input was sent. ` +
          "Observe again before addressing a replacement window.",
      );
    }
    if (exact.on_current_space === false || exact.is_on_screen === false) {
      throw new OpenSkyError(
        `The exact bound window ${resolved.windowId} for ${JSON.stringify(resolved.name)} is off the current desktop; ` +
          "no input was sent. Bring that window onto the current desktop and retry.",
      );
    }
  }

  private markResolved(resolved: ResolvedApp): void {
    this.resolvedThisProcess.add(resolved.handle);
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

  private async recoverRecreatedButton(
    resolved: ResolvedApp, elementIndex: number, previous: StoredSnapshot,
  ): Promise<Record<string, unknown> | undefined> {
    const key = windowKey(resolved);
    const original = previous.elements.find(element => element.element_index === elementIndex);
    const eligible = (element: SnapshotElement) => element.role === "AXButton"
      && element.enabled !== false && element.readOnly !== true
      && element.actions?.includes("AXPress") === true;
    if (!original?.identifier || !eligible(original) || !resolved.windowId
      || previous.elements.filter(element => element.identifier === original.identifier).length !== 1
      || this.memory.trees[key] !== previous) return undefined;
    await this.requireUsableInputWindow(resolved);
    const snapshot = await this.snapshotWindow(resolved, { includeScreenshot: false });
    // Mac currently publishes elements_complete=false even for uncapped
    // walks. Require all discovered nodes returned and no explicit cap marker;
    // unknown global AX completeness alone does not prove truncation.
    if (snapshot.degraded || snapshot.totalElementCount === undefined
      || snapshot.totalElementCount !== snapshot.returnedElementCount
      || snapshot.tree.includes("AX tree truncated") || !snapshot.snapshotId
      || this.memory.trees[key] !== previous) return undefined;
    const matches = snapshot.elements.filter(element => element.identifier === original.identifier);
    if (matches.length !== 1) return undefined;
    const current = matches[0]!;
    const sameFrame = original.frame && current.frame && original.frame.w > 0 && original.frame.h > 0
      && ["x", "y", "w", "h"].every(field =>
        original.frame![field as keyof NonNullable<SnapshotElement["frame"]>] ===
        current.frame![field as keyof NonNullable<SnapshotElement["frame"]>]);
    if (!eligible(current) || current.label !== original.label || !sameFrame
      || current.element_index !== elementIndex || !current.element_token) return undefined;
    this.memory.trees[key] = {
      tree: snapshot.tree, elements: snapshot.elements, snapshotId: snapshot.snapshotId,
      observationBaseline: previous.observationBaseline ?? {
        tree: previous.tree, elements: previous.elements, viewKind: previous.viewKind,
      },
    };
    return this.elementTarget(resolved, elementIndex);
  }

  private browserElement(resolved: ResolvedApp, elementIndex: number, action: string): SnapshotElement {
    const snapshot = this.memory.trees[windowKey(resolved)];
    const element = snapshot?.elements.find((item) => item.element_index === elementIndex);
    if (!element?.browser_ref) {
      throw new OpenSkyError(
        `Element index ${elementIndex} is not present in the latest semantic browser snapshot for ` +
          `${JSON.stringify(resolved.name)}. Call get_app_state again before acting.`,
      );
    }
    if (!element.actions?.includes(action)) {
      throw new OpenSkyError(`Element index ${elementIndex} does not support browser action ${JSON.stringify(action)}.`);
    }
    return element;
  }

  private browserElementWithAnyAction(
    resolved: ResolvedApp,
    elementIndex: number,
    actions: string[],
  ): SnapshotElement {
    const snapshot = this.memory.trees[windowKey(resolved)];
    const element = snapshot?.elements.find((item) => item.element_index === elementIndex);
    if (!element?.browser_ref) {
      throw new OpenSkyError(
        `Element index ${elementIndex} is not present in the latest semantic browser snapshot for ` +
          `${JSON.stringify(resolved.name)}. Call get_app_state again before acting.`,
      );
    }
    if (!actions.some((action) => element.actions?.includes(action))) {
      throw new OpenSkyError(
        `Element index ${elementIndex} does not support any of the required browser actions ` +
          `${JSON.stringify(actions)}.`,
      );
    }
    return element;
  }

  private maybeUniqueBrowserElement(resolved: ResolvedApp, actions: string[]): SnapshotElement | undefined {
    const candidates = (this.memory.trees[windowKey(resolved)]?.elements ?? []).filter((element) =>
      element.browser_ref && actions.some((action) => element.actions?.includes(action))
    );
    const mainDocument = candidates.filter((element) =>
      element.browserFrame === "main" && element.label === "Document"
    );
    if (mainDocument.length === 1) return mainDocument[0];
    return candidates.length === 1 ? candidates[0] : undefined;
  }

  private browserScreenshotPoint(
    resolved: ResolvedApp,
    x: number,
    y: number,
    action: string,
  ): { x: number; y: number } {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw invalidParams("browser coordinates must be finite numbers");
    const mapping = resolved.browser?.screenshotMapping;
    if (
      !mapping || mapping.coordinateSpace !== "viewport_css_px" ||
      !positiveFinite(mapping.pixelToCssScaleX) || !positiveFinite(mapping.pixelToCssScaleY)
    ) {
      throw this.typedBrowserUnsupported(
        resolved,
        action,
        "Request a fresh exact-tab screenshot first so its screenshot-pixel to viewport-CSS mapping is proven, or use a semantic element index.",
      );
    }
    const screenshotWidth = mapping.viewportCssWidth / mapping.pixelToCssScaleX;
    const screenshotHeight = mapping.viewportCssHeight / mapping.pixelToCssScaleY;
    if (x < 0 || y < 0 || x > screenshotWidth || y > screenshotHeight) {
      throw invalidParams(`browser ${action.replace(/^coordinate /, "")} coordinates must be inside the latest exact-tab screenshot`);
    }
    return { x: x * mapping.pixelToCssScaleX, y: y * mapping.pixelToCssScaleY };
  }

  private uniqueFocusedBrowserTypeElement(resolved: ResolvedApp): SnapshotElement {
    const candidates = (this.memory.trees[windowKey(resolved)]?.elements ?? []).filter((element) =>
      element.browser_ref && element.focused === true && element.actions?.includes("type")
    );
    if (candidates.length !== 1) {
      throw this.typedBrowserUnsupported(
        resolved,
        "ambient typing",
        "Use type_text with a type-capable element_index from the latest semantic state.",
      );
    }
    return candidates[0]!;
  }

  private typedBrowserUnsupported(resolved: ResolvedApp, action: string, guidance: string): OpenSkyError {
    return new OpenSkyError(
      `${action} is not safely available for the exact typed browser tab in ${JSON.stringify(resolved.name)}. ` +
        `${guidance} No native foreground or coordinate input was sent.`,
    );
  }

  private async pressElementKey(
    resolved: ResolvedApp,
    elementIndex: number,
    key: string,
    modifiers: string[] = [],
    windowObservation: Record<string, unknown> = {},
  ): Promise<void> {
    const target = this.elementTarget(resolved, elementIndex);
    const payload = { ...windowObservation,
      pid: resolved.pid,
      window_id: resolved.windowId,
      key,
      ...(modifiers.length > 0 ? { modifiers } : {}),
      ...target,
    };
    if (this.target === "mac" && modifiers.length > 0) {
      // AppKit menu equivalents can ignore a PID-routed modified key even
      // when the AX control is focused. Choose the guarded exact-window
      // route before dispatch, as for untargeted native shortcuts.
      await this.driver.call("press_key", { ...payload, delivery_mode: "foreground" });
      return;
    }
    try {
      await this.driver.call("press_key", { ...payload, delivery_mode: "background" });
      return;
    } catch (error) {
      if (error instanceof OpenSkyError && error.code === "background_unavailable" && resolved.windowId) {
        // The driver refused before input. Preserve the exact element target
        // while letting its foreground route focus the control and send once.
        await this.driver.call("press_key", { ...payload, delivery_mode: "foreground" });
        return;
      }
      if (!isFocusRoutingError(error)) throw error;
    }
    const snapshot = this.memory.trees[windowKey(resolved)];
    const element = snapshot?.elements.find((item) => item.element_index === elementIndex);
    if (/text|search|combo/i.test(element?.role ?? "")) {
      await this.driver.call("click", {
        pid: resolved.pid,
        window_id: resolved.windowId,
        action: "press",
        ...target,
      });
      try {
        await this.driver.call("press_key", { ...payload, delivery_mode: "background" });
        return;
      } catch (error) {
        if (!isFocusRoutingError(error)) throw error;
      }
    }
    await this.driver.call("press_key", { ...payload, delivery_mode: "foreground" });
  }

  private ensureLoaded(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    if (this.loading) return this.loading;
    const attempt = this.loadPersistedState();
    this.loading = attempt;
    void attempt.catch(() => undefined).finally(() => {
      if (this.loading === attempt) this.loading = undefined;
    });
    return attempt;
  }

  private assertTargetUsable(target: ResolvedApp): void {
    if (this.quarantinedTargets.has(target.handle) ||
        (target.browser && !this.managedBrowserSessions.has(target.browser.session))) {
      throw new OpenSkyError(
        "The persisted target is not owned by this runtime/transport. No input was sent. " +
          "Keep the record for reconciliation; create a fresh exact target in a separate home.",
        "target_transport_unavailable",
      );
    }
  }

  private async loadPersistedState(): Promise<void> {
    const persisted = await this.store.load();
    if ("apps" in persisted) {
      const byBinding = new Map<string, TargetHandle>();
      for (const [alias, legacy] of Object.entries(persisted.apps)) {
        const fingerprint = legacy.browser?.session
          ? `browser:${legacy.browser.session}`
          : `native:${legacy.pid}:${legacy.windowId ?? 0}`;
        let handle = byBinding.get(fingerprint);
        if (!handle) {
          handle = legacy.handle && looksLikeTargetHandle(legacy.handle)
            ? legacy.handle as TargetHandle
            : newTargetHandle();
          byBinding.set(fingerprint, handle);
          const resolved = {
            ...legacy,
            handle,
            openedAt: legacy.openedAt ?? Date.now(),
          } as ResolvedApp;
          this.lastOpenedAt = Math.max(this.lastOpenedAt, resolved.openedAt);
          this.memory.targets[handle] = resolved;
          const oldTree = persisted.trees[legacyWindowKey(legacy)];
          if (oldTree) this.memory.trees[handle] = oldTree;
        }
        this.memory.aliases[alias] = handle;
      }
    } else {
      this.memory.targets = persisted.targets;
      this.memory.aliases = persisted.aliases;
      this.memory.trees = persisted.trees;
      this.lastOpenedAt = Object.values(persisted.targets).reduce(
        (latest, target) => Math.max(latest, target.openedAt),
        this.lastOpenedAt,
      );
    }
    // Screenshot coordinates are observation-local evidence. Never trust a
    // persisted mapping after a process restart, even if the target session
    // itself can still be recovered.
    for (const target of Object.values(this.memory.targets)) {
      if (target.browser) target.browser.screenshotMapping = undefined;
      // A fresh proxy cannot inherit old native refs or native close authority.
      if (this.rawDriver.sessionOwnership?.kind === "mcp-proxy") this.quarantinedTargets.add(target.handle);
    }
    for (const session of persisted.managedBrowserSessions) {
      const ownerPid = legacyBrowserSessionOwnerPid(session);
      if (ownerPid === undefined) {
        this.unresolvedLegacyBrowserSessions.add(session);
        continue;
      }
      await this.browserLeases.importLegacy(session, ownerPid);
    }
    for (const session of await this.browserLeases.claimDeadOwners()) {
      this.managedBrowserSessions.add(session);
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    // v1/v2 entries without a recoverable owner PID cannot be reaped safely;
    // retain them for backward-compatible migration without granting close.
    this.memory.managedBrowserSessions = [...this.unresolvedLegacyBrowserSessions].sort();
    await this.store.save({
      version: 2,
      targets: this.memory.targets,
      aliases: this.memory.aliases,
      trees: this.memory.trees,
      managedBrowserSessions: this.memory.managedBrowserSessions,
    });
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

/** Accept only bounded, coherent observation data for this exact native target. */
export function parseTextSelection(value: unknown, pid: number, windowId: number): TextSelection | undefined {
  const selection = asRecord(value);
  const range = asRecord(selection?.range);
  if (!selection || selection.pid !== pid || selection.window_id !== windowId || !range ||
      typeof selection.role !== "string" || !/^AX[A-Za-z]+$/.test(selection.role) || /Secure/.test(selection.role) ||
      typeof selection.text !== "string" || typeof selection.text_truncated !== "boolean") return undefined;
  const start = range.start_utf16;
  const length = range.length_utf16;
  if (typeof start !== "number" || typeof length !== "number" || !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(length) || start < 0 || length < 0 || !Number.isSafeInteger(start + length)) return undefined;
  const text = selection.text;
  if (text.length > 2048 || (selection.text_truncated ? text.length >= length : text.length !== length)) return undefined;
  // Reject malformed UTF-16 rather than turning a split surrogate into evidence.
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (ch.length === 1 && code >= 0xd800 && code <= 0xdfff) return undefined;
  }
  return { role: selection.role, startUTF16: start, lengthUTF16: length, text, textTruncated: selection.text_truncated };
}

function selectionObservation(selection?: TextSelection): string {
  if (!selection) return "";
  const range = `UTF-16 ${selection.startUTF16}+${selection.lengthUTF16}`;
  return selection.lengthUTF16 === 0
    ? `\nText selection: none (caret ${selection.startUTF16}, UTF-16).`
    : `\nSelected text (${range}${selection.textTruncated ? "; text truncated to 2048 UTF-16 units" : ""}): ${JSON.stringify(selection.text)}`;
}

/** Observation only: the exact native window snapshot starts with AppKit's
 * detached inline item-name editor. Never infer focus or mint input authority. */
export function inlineItemEditObservation(tree: string, elements: SnapshotElement[]): string {
  const root = tree.split("\n").find(line => line.trim());
  const match = root?.match(/^- \[(\d+)\] AXTextField\b/);
  if (!match) return "";
  const editors = elements.filter(element => element.role === "AXTextField" &&
    element.identifier === "ShrinkToFit Text Field" && element.settable === true &&
    element.enabled === true && !element.url);
  if (editors.length !== 1 || editors[0]!.element_index !== Number(match[1])) return "";
  return `\nInline item-name editor [${editors[0]!.element_index}] is present. Return finishes the edit; observe the item again before opening it.`;
}

function isNativeFileItemLabel(element: SnapshotElement): boolean {
  return element.role === "AXTextField" && element.settable === true &&
    element.url?.startsWith("file:") === true && element.actions?.includes("AXOpen") === true;
}

export function diffTrees(
  previousTree: string,
  previousElements: SnapshotElement[],
  nextTree: string,
  nextElements: SnapshotElement[],
): string {
  const prev = new Map(previousElements.map((item) => [item.element_index, item]));
  const next = new Map(nextElements.map((item) => [item.element_index, item]));
  const previousParents = indexedTreeParents(previousTree, previousElements);
  const nextParents = indexedTreeParents(nextTree, nextElements);
  const reparented = new Set([...nextParents].flatMap(([index, parent]) =>
    prev.has(index) && previousParents.has(index) && previousParents.get(index) !== parent ? [index] : []));
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
      reparented.has(index) ||
      before.label !== element.label ||
      before.value !== element.value ||
      before.placeholder !== element.placeholder ||
      before.description !== element.description ||
      before.formattedValue !== element.formattedValue ||
      before.role !== element.role ||
      before.identifier !== element.identifier ||
      before.url !== element.url ||
      before.enabled !== element.enabled ||
      before.selected !== element.selected ||
      before.selectionViaParent !== element.selectionViaParent ||
      before.checked !== element.checked ||
      before.focused !== element.focused ||
      before.expanded !== element.expanded
    ) {
      changed.push(`${formatElement(before)} -> ${formatElement(element)}`);
    }
  }
  for (const [index, element] of prev) {
    if (!next.has(index)) removed.push(formatElement(element));
  }

  // Structured elements intentionally describe input-addressable controls.
  // Read-only values (for example a calculator result) still belong in the
  // observation diff. Anchor their display positions to indexed ancestors;
  // these keys never become element IDs or input authority.
  const previousDisplay = displayOnlyRows(previousTree);
  const nextDisplay = displayOnlyRows(nextTree);
  const displayDiff: string[] = [];
  for (const [key, line] of nextDisplay) {
    const before = previousDisplay.get(key);
    if (before !== line) displayDiff.push(`${before === undefined ? "+" : "~"} ${line}`);
  }
  let removedDescendantRows = 0;
  const removedStandaloneRows: string[] = [];
  for (const [key, line] of previousDisplay) {
    if (nextDisplay.has(key)) continue;
    // Descendants of a removed indexed control are already covered by its
    // removal ID. Small removals under surviving or unbound parents keep their
    // exact values; large obsolete inventories are summarized below.
    const parent = key.match(/^index:(\d+)(?:\/|$)/)?.[1];
    if (parent !== undefined && prev.has(Number(parent)) && !next.has(Number(parent))) {
      removedDescendantRows += 1;
    } else removedStandaloneRows.push(line);
  }
  if (removedStandaloneRows.length > 8) {
    // These are previous-snapshot labels, never current content or input IDs.
    // Match native removal summaries without repeating a discarded inventory.
    const roles = new Map<string, number>();
    for (const line of removedStandaloneRows) {
      const role = line.match(/^AX\w+/)?.[0] ?? "display";
      roles.set(role, (roles.get(role) ?? 0) + 1);
    }
    const counts = [...roles].sort(([a], [b]) => a.localeCompare(b))
      .map(([role, count]) => `${role}: ${count}`).join(", ");
    displayDiff.push(`Removed display rows: ${removedStandaloneRows.length} (outside removed elements; ${counts})`);
  } else {
    displayDiff.push(...removedStandaloneRows.map(line => `Removed display row: ${line}`));
  }
  if (removedDescendantRows) {
    displayDiff.push(`Removed display rows: ${removedDescendantRows} (within removed elements)`);
  }

  if (added.length === 0 && changed.length === 0 && removed.length === 0 && displayDiff.length === 0) {
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
          .map((element) => `+ ${formatAddedElement(nextTree, element)}`)
          .join("\n")
      : "",
    changed.length
      ? nextElements
          .filter((element) => {
            const before = prev.get(element.element_index);
            return before && (
              reparented.has(element.element_index) ||
              before.label !== element.label ||
              before.value !== element.value ||
              before.placeholder !== element.placeholder ||
              before.description !== element.description ||
              before.formattedValue !== element.formattedValue ||
              before.role !== element.role ||
              before.identifier !== element.identifier ||
              before.url !== element.url ||
              before.enabled !== element.enabled ||
              before.selected !== element.selected ||
      before.selectionViaParent !== element.selectionViaParent ||
              before.checked !== element.checked ||
              before.focused !== element.focused ||
              before.expanded !== element.expanded
            );
          })
          .map((element) => reparented.has(element.element_index)
            ? `~ ${formatRetainedElement(nextTree, element)} [parent=${nextParents.get(element.element_index) ?? "root"}]`
            : `~ ${formatElement(element)}`)
          .join("\n")
      : "",
    displayDiff.join("\n"),
  ]
    .filter(Boolean)
    .join("\n");
}


function formatRetainedElement(tree: string, element: SnapshotElement): string {
  const marker = new RegExp(`^\\s*-\\s+\\[${element.element_index}\\]\\s+${element.role}(?:\\s|$)`);
  const rows = quotedTreeRows(tree).filter(({line, closed}) => closed && marker.test(line));
  return rows.length === 1 ? rows[0]!.line.trim().replace(/^-\s+/, "") : formatElement(element);
}

/** Observe nearest indexed parents only where both public rows and structured
 * controls bind uniquely. Unbound/duplicate rows never supply a relationship. */
function indexedTreeParents(tree: string, elements: SnapshotElement[]): Map<number, number | null> {
  const structured = new Map<number, SnapshotElement>();
  const duplicate = new Set<number>();
  for (const element of elements) {
    if (structured.has(element.element_index)) duplicate.add(element.element_index);
    structured.set(element.element_index, element);
  }
  const rows = quotedTreeRows(tree).flatMap(({line, closed}) => {
    if (!closed) return [];
    const match = line.match(/^(\s*)-\s+(?:\[(\d+)\]\s+)?(AX\w+)(?:[\s\S]*)$/);
    return match ? [{indent:match[1]!.length, index:match[2] === undefined ? undefined : Number(match[2]), role:match[3]!}] : [];
  });
  const counts = new Map<number, number>();
  for (const row of rows) if (row.index !== undefined) counts.set(row.index, (counts.get(row.index) ?? 0) + 1);
  const bound = (row:typeof rows[number]) => row.index !== undefined && Number.isSafeInteger(row.index) &&
    !duplicate.has(row.index) && counts.get(row.index) === 1 && structured.get(row.index)?.role === row.role;
  const stack: typeof rows = [], parents = new Map<number, number | null>();
  for (const row of rows) {
    while (stack.length && stack[stack.length - 1]!.indent >= row.indent) stack.pop();
    const parent = [...stack].reverse().find(ancestor => ancestor.index !== undefined);
    if (bound(row) && (!parent || bound(parent))) parents.set(row.index!, parent?.index ?? null);
    stack.push(row);
  }
  return parents;
}

function displayOnlyRows(tree: string): Map<string, string> {
  const rows = new Map<string, string>();
  const stack: Array<{ indent: number; key: string }> = [];
  const siblings = new Map<string, number>();
  for (const { line } of quotedTreeRows(tree)) {
    const match = line.match(/^(\s*)-\s+(?:\[(\d+)\]\s+)?(AX\w+)([\s\S]*)$/);
    if (!match) continue;
    const indent = match[1]!.length;
    while (stack.length && stack[stack.length - 1]!.indent >= indent) stack.pop();
    const parent = stack[stack.length - 1]?.key ?? "root";
    const role = match[3]!;
    const siblingKey = `${parent}/${role}`;
    const ordinal = siblings.get(siblingKey) ?? 0;
    siblings.set(siblingKey, ordinal + 1);
    const key = match[2] === undefined ? `${siblingKey}:${ordinal}` : `index:${match[2]}`;
    stack.push({ indent, key });
    if (match[2] === undefined && match[4]!.trim()) rows.set(key, `${role}${match[4]}`);
  }
  return rows;
}

function treeLineForIndex(tree: string, index: number): string | undefined {
  const marker = new RegExp(`^\\s*-\\s+\\[${index}\\](?:\\s|$)`);
  const lines = tree.split("\n").filter(line => marker.test(line));
  // Literal document content can resemble a tree row. Ambiguous rows must
  // use the structured control rather than borrow a content line's hints.
  return lines.length === 1 ? lines[0]!.trim().replace(/^-\s+/, "") : undefined;
}

function formatAddedElement(tree: string, element: SnapshotElement): string {
  const multiline = [element.label, element.value, element.formattedValue]
    .some(value => value?.includes("\n") || value?.includes("\r"));
  const line = multiline ? undefined : treeLineForIndex(tree, element.element_index);
  if (line !== undefined) return line;
  // A rendered line is only the beginning of a multiline field. Serialize
  // the complete structured value so its body remains evidence, never rows.
  const actions = element.actions?.length ? ` [actions=[${element.actions.join(",")}]]` : "";
  const settable = element.settable === true ? " [settable]" : "";
  return `${formatElement(element)}${actions}${settable}`;
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
  const displayValue = element.formattedValue ?? element.value;
  const primaryValue = element.label === element.value
    ? displayValue : element.label ?? displayValue;
  const primary = JSON.stringify(primaryValue ?? "");
  const value = displayValue !== undefined && displayValue !== primaryValue
    ? ` value=${JSON.stringify(displayValue)}`
    : "";
  // This metadata is constructed separately from the serialized body. Omit
  // only generated IDs here; literal content and raw binding identity remain.
  const identifier = element.identifier && !/^_NS:\d+$/.test(element.identifier)
    ? ` id=${JSON.stringify(element.identifier)}` : "";
  const url = displayUrlAttribute(element.url);
  const semantics = semanticAttributes(element);
  const placeholder = element.placeholder !== undefined
    ? ` placeholder=${JSON.stringify(element.placeholder)}` : "";
  const description = element.description !== undefined && element.description !== element.label
    ? ` description=${JSON.stringify(element.description)}` : "";
  return `[${element.element_index}] ${element.role ?? "AXUnknown"} ${primary}${value}${identifier}${url}${semantics}${placeholder}${description}`;
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

function sameAppIdentity(candidate: Record<string, unknown>, reference?: Record<string, unknown>): boolean {
  if (!reference) return false;
  for (const key of ["bundle_id", "launch_path", "name"] as const) {
    const expected = optionalString(reference[key])?.trim().toLowerCase();
    if (expected) return optionalString(candidate[key])?.trim().toLowerCase() === expected;
  }
  return false;
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

function windowMatchesTargets(window: Record<string, unknown>, targets: string[]): boolean {
  const title = String(window.title ?? window.name ?? "").toLowerCase();
  if (!title) return false;
  return targets.some((target) => {
    const normalized = target.replaceAll("\\", "/");
    const tail = normalized.split("/").filter(Boolean).at(-1)?.toLowerCase() ?? "";
    let decoded = tail;
    try { decoded = decodeURIComponent(tail); } catch { /* retain the literal target */ }
    const stem = decoded.replace(/\.[a-z0-9]{1,8}$/i, "");
    return Boolean(decoded && (title.includes(decoded) || (stem.length >= 3 && title.includes(stem))));
  });
}

function launchDispatchRefused(structured: Record<string, unknown>): boolean {
  const state = asRecord(structured.launch_state);
  return typeof structured.error === "string" && state?.requested === false;
}

function launchRequestWasSent(structured: Record<string, unknown>): boolean {
  return asRecord(structured.launch_state)?.requested === true;
}

async function canonicalDocumentPath(target: string): Promise<string | undefined> {
  try {
    const path = target.startsWith("file:") ? fileURLToPath(target)
      : /^[a-z][a-z0-9+.-]*:/i.test(target) ? undefined
      : target === "~" ? homedir()
      : target.startsWith("~/") ? join(homedir(), target.slice(2)) : target;
    return path ? await realpath(path) : undefined;
  } catch {
    return undefined;
  }
}

async function requestedDocumentWindow(
  windows: Record<string, unknown>[],
  requestedPath: string,
): Promise<number | undefined> {
  const matches: number[] = [];
  for (const window of windows.filter(isOrdinaryWindow)) {
    if (typeof window.window_id !== "number" || window.window_id <= 0 ||
        typeof window.document_url !== "string" || !window.document_url.startsWith("file:")) continue;
    if (await canonicalDocumentPath(window.document_url) === requestedPath) matches.push(window.window_id);
  }
  const unique = [...new Set(matches)];
  return unique.length === 1 ? unique[0] : undefined;
}

function listedPids(apps: Record<string, unknown>[]): Set<number> {
  return new Set(apps.flatMap((app) => {
    const pid = Number(app.pid);
    return Number.isFinite(pid) && pid > 0 ? [pid] : [];
  }));
}

function launchIdentityMatches(
  query: string,
  match: Record<string, unknown> | undefined,
  launched: Record<string, unknown>,
): boolean {
  // Require the strongest catalog identity available; a coincidentally equal
  // display name/path must not override a mismatched bundle id.
  const requestedBundle = optionalString(match?.bundle_id) ??
    (looksLikeBundleId(query) ? query : undefined);
  if (requestedBundle) {
    return optionalString(launched.bundle_id)?.toLowerCase() === requestedBundle.toLowerCase();
  }
  const requestedPath = optionalString(match?.launch_path) ?? (looksLikePath(query) ? query : undefined);
  if (requestedPath) {
    return optionalString(launched.launch_path)?.toLowerCase() === requestedPath.toLowerCase();
  }
  const requestedName = optionalString(match?.name) ?? query;
  return optionalString(launched.name)?.toLowerCase() === requestedName.trim().toLowerCase();
}

export function pickWindowId(windows: Record<string, unknown>[]): number | undefined {
  if (windows.length === 0) return undefined;
  const eligible = windows.filter((window) => window.on_current_space !== false && window.is_on_screen !== false);
  const pool = eligible.length > 0 ? eligible : windows;
  const scored = [...pool].sort((a, b) => windowScore(b) - windowScore(a));
  const id = scored[0]?.window_id;
  return typeof id === "number" ? id : undefined;
}

/** Return only an ordinary, visible window that can safely ground AX actions. */
export function pickUsableWindowId(windows: Record<string, unknown>[]): number | undefined {
  const usable = windows.filter((window) =>
    window.on_current_space !== false && window.is_on_screen !== false && isOrdinaryWindow(window),
  );
  return pickWindowId(usable);
}

/** Ordinary app windows remain valid targets across transient Space/focus churn. */
export function pickOrdinaryWindowId(windows: Record<string, unknown>[]): number | undefined {
  return pickWindowId(windows.filter(isOrdinaryWindow));
}

/** App-wide observations prefer an exact eligible focused window when supplied,
 * then actual stacking order, never title/area scoring.
 * This deliberately differs from opening a specific document window. */
export function pickAppWindowId(windows: Record<string, unknown>[], pid: number, focusedWindowId?: unknown, retainedWindowId?: number, focusedControlWindowId?: unknown, focusedSheetParentWindowId?: unknown): number | undefined {
  const visible = windows.filter(window => window.pid === pid && window.is_on_screen === true &&
    window.on_current_space !== false && (window.layer === undefined || window.layer === 0) &&
    Number.isSafeInteger(window.window_id) && Number(window.window_id) > 0 && isOrdinaryWindow(window));
  // A sheet is observed through its proven exact parent. Invalid/vanished
  // parent metadata must not produce a healthy tree of an unrelated sibling.
  if (focusedSheetParentWindowId !== undefined && focusedSheetParentWindowId !== null) {
    const parent = Number.isSafeInteger(focusedSheetParentWindowId) && Number(focusedSheetParentWindowId) > 0
      ? visible.filter(window => window.window_id === focusedSheetParentWindowId) : [];
    return parent.length === 1 ? parent[0]!.window_id as number : undefined;
  }
  const controlWindow = Number.isSafeInteger(focusedControlWindowId) && Number(focusedControlWindowId) > 0
    ? visible.filter(window => window.window_id === focusedControlWindowId) : [];
  if (controlWindow.length === 1) return controlWindow[0]!.window_id as number;
  const focused = Number.isSafeInteger(focusedWindowId) && Number(focusedWindowId) > 0
    ? visible.filter(window => window.window_id === focusedWindowId) : [];
  if (focused.length === 1) return focused[0]!.window_id as number;
  // A native menu can temporarily remove AXFocusedWindow while its document
  // remains key. When focus is explicitly unavailable (null), keep the
  // eligible observed window until focus is reported
  // again; stale CG stacking must not switch an app handle to its sibling.
  if (focusedWindowId === null && retainedWindowId !== undefined) {
    const retained = visible.filter(window => window.window_id === retainedWindowId);
    if (retained.length === 1) return retainedWindowId;
  }
  if (visible.length === 1) return visible[0]!.window_id as number;
  if (!visible.length || visible.some(window => typeof window.z_index !== "number" || !Number.isFinite(window.z_index))) return undefined;
  const top = Math.max(...visible.map(window => window.z_index as number));
  const front = visible.filter(window => window.z_index === top);
  return front.length === 1 ? front[0]!.window_id as number : undefined;
}

function isOrdinaryWindow(window: Record<string, unknown>): boolean {
  const frame = frameOf(window);
  const closedGhost = window.is_on_screen === false &&
    window.on_current_space == null &&
    window.space_ids == null;
  return Boolean(frame && frame.width >= 120 && frame.height >= 80 && !closedGhost);
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
        nativeObjectId: optionalString(item.native_object_id),
        role: optionalString(item.role),
        label: optionalString(item.label),
        labelSource: optionalString(item.label_source),
        value: scalarText(item.value),
        placeholder: optionalString(item.placeholder ?? item.placeholder_value),
        description: optionalString(item.description),
        formattedValue: optionalString(item.formatted_value),
        identifier: optionalString(item.identifier ?? item.id),
        url: optionalString(item.url ?? item.document_url),
        actions: asArray<string>(item.actions),
        settable: optionalBoolean(item.settable ?? item.is_settable ?? item.value_settable ?? item.is_value_settable ?? item.editable),
        selectionViaParent: item.selection_via_parent === true ? true : undefined,
        enabled: optionalBoolean(item.enabled ?? item.is_enabled),
        selected: optionalBoolean(item.selected ?? item.is_selected),
        checked: optionalBoolean(item.checked ?? item.is_checked),
        focused: optionalBoolean(item.focused ?? item.is_focused),
        expanded: optionalBoolean(item.expanded ?? item.is_expanded),
        frame: asRecord(item.frame) as SnapshotElement["frame"],
      },
    ];
  });
}

function normalizeBrowserElements(value: unknown, contentRefs?: unknown): SnapshotElement[] {
  const seen = new Set<string>();
  const entries = [
    ...asArray<Record<string, unknown>>(value).map((item) => ({ item, readOnly: false })),
    ...asArray<Record<string, unknown>>(contentRefs).map((item) => ({ item, readOnly: true })),
  ];
  return entries.flatMap(({ item, readOnly }, index) => {
    const ref = optionalString(item.ref);
    if (!ref) return [];
    if (seen.has(ref)) throw new OpenSkyError("The helper returned duplicate browser references; observe again before using indices.");
    seen.add(ref);
    const role = optionalString(item.role)?.toLowerCase();
    // Content references carry observation identity, never input authority.
    const actions = readOnly ? [] : asArray<string>(item.actions);
    const label = optionalString(item.name);
    const intrinsicallyInteractive = new Set([
      "button", "link", "textbox", "searchbox", "checkbox", "radio", "combobox",
      "menuitem", "tab", "option", "slider", "switch",
    ]).has(role ?? "");
    const useful = actions.includes("type") || actions.includes("scroll") ||
      Boolean(label && (actions.includes("click") || actions.includes("pointer"))) ||
      (intrinsicallyInteractive && Boolean(label || actions.includes("type")));
    if (!useful && !readOnly) return [];
    const states = asRecord(item.states) ?? {};
    return [{
      element_index: index,
      browser_ref: ref,
      ...(readOnly ? { readOnly: true } : {}),
      browserFrame: optionalString(item.frame),
      role,
      label,
      value: scalarText(item.value),
      url: optionalString(item.url),
      actions,
      visibility: optionalString(item.visibility),
      enabled: states.disabled === true ? false : undefined,
      selected: optionalBoolean(states.selected),
      checked: optionalBoolean(states.checked),
      focused: optionalBoolean(states.focused),
      expanded: optionalBoolean(states.expanded),
      settable: actions.includes("type") ? true : undefined,
    }];
  });
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isSnapshotRef(value: unknown, snapshotId: string): value is string {
  return typeof value === "string" && value.startsWith(`${snapshotId}:`) &&
    /^\d+$/.test(value.slice(snapshotId.length + 1)) && isNonnegativeInteger(Number(value.slice(snapshotId.length + 1)));
}

/** The same snapshot has exact identities; label/rank matching would silently alias duplicate names. */
function mergeBrowserContextElements(previous: SnapshotElement[], incoming: SnapshotElement[]): {
  all: SnapshotElement[]; visible: SnapshotElement[];
} {
  const byRef = new Map(previous.map((element) => [element.browser_ref, element]));
  let next = Math.max(-1, ...previous.map((element) => element.element_index)) + 1;
  const visible = incoming.map((element) => {
    const prior = byRef.get(element.browser_ref);
    if (prior) {
      const identity = (entry: SnapshotElement) => JSON.stringify([
        entry.browser_ref, entry.role, entry.label, entry.value, entry.url, entry.browserFrame,
        entry.readOnly === true, [...(entry.actions ?? [])].sort(), entry.visibility,
        entry.enabled, entry.selected, entry.checked, entry.focused, entry.expanded,
      ]);
      if (identity(prior) !== identity(element)) {
        throw new OpenSkyError("Same-snapshot context changed an existing reference's identity or capabilities. Observe again before using indices.");
      }
      return prior;
    }
    if (element.readOnly !== true || element.actions?.length) {
      throw new OpenSkyError("Same-snapshot context cannot introduce new input capabilities. Observe again before acting.");
    }
    return { ...element, element_index: next++ };
  });
  return { all: [...previous, ...visible.filter((element) => !byRef.has(element.browser_ref))], visible };
}

function browserPageTitle(page: Record<string, unknown>): string | undefined {
  const title = optionalString(page.title);
  // A just-navigated target can still report the launch placeholder. Apply the
  // same presentation rule to fresh and stored views without inventing a title.
  return title === "about:blank" && optionalString(page.url) !== "about:blank" ? undefined : title;
}

export function renderBrowserState(
  outline: string,
  elements: SnapshotElement[],
  structured: Record<string, unknown>,
  queryRequested = false,
): string {
  return renderBrowserObservation(outline, elements, structured, queryRequested).text;
}

/** Keep renderer loss machine-readable as well as visible to the agent. */
export function renderBrowserObservation(
  outline: string,
  elements: SnapshotElement[],
  structured: Record<string, unknown>,
  queryRequested = false,
  availableElements = elements,
): { text: string; truncated: boolean } {
  const page = asRecord(structured.page) ?? {};
  const snapshot = asRecord(structured.snapshot) ?? {};
  const header = `Browser page: ${JSON.stringify(browserPageTitle(page) ?? "Untitled")} (${optionalString(page.url) ?? "URL unavailable"})`;
  const actionLines = elements.filter((element) => element.readOnly !== true).map((element) => {
    const label = JSON.stringify(element.label ?? element.value ?? "");
    const destination = displayUrlAttribute(element.url);
    const conciseActions = element.actions?.filter((action) =>
      // A clickable semantic node is already addressable through the normal
      // click tool. Advertising its lower-level pointer route as well spends
      // tokens without giving the model another useful choice.
      action !== "pointer" || !element.actions?.includes("click")
    );
    const hints = [
      conciseActions?.length ? `actions=[${conciseActions.join(",")}]` : "",
      // In-viewport controls are the default ranked result. Keep exceptional
      // visibility states because they affect whether an action should be sent.
      element.visibility && element.visibility !== "in_viewport" ? `visibility=${element.visibility}` : "",
      element.browserFrame && element.browserFrame !== "main" ? `frame=${element.browserFrame}` : "",
      element.focused === true ? "focused" : "",
      element.enabled === false ? "disabled" : "",
    ].filter(Boolean).join(" ");
    return `- [${element.element_index}] ${element.role ?? "unknown"} ${label}${destination}${hints ? ` [${hints}]` : ""}`;
  });
  const actions: string[] = [];
  let actionCharacters = 0;
  for (const line of actionLines) {
    if (actions.length >= 120 || actionCharacters + line.length + 1 > 8_000) break;
    actions.push(line);
    actionCharacters += line.length + 1;
  }
  const omittedActions = actionLines.length - actions.length;
  const contentElements = elements.filter((element) => element.readOnly === true);
  const contextGroups = new Set(["document", "rootwebarea", "webarea", "main", "article", "region", "feed", "list", "listitem", "table", "rowgroup", "row"]);
  const contentLines: string[] = [];
  let contentCharacters = 0;
  for (const element of contentElements) {
    const label = element.label ?? element.value ?? "";
    if (!label && !contextGroups.has(element.role ?? "")) continue;
    const characters = Array.from(label);
    // These are identity hints, not evidence excerpts; the source outline retains the actual content.
    const name = characters.length > 160
      ? `namePreview=${JSON.stringify(characters.slice(0, 160).join("") + "…")}`
      : JSON.stringify(label);
    const line = `- [${element.element_index}] ${element.role ?? "unknown"} ${name}`;
    if (contentLines.length >= 32 || contentCharacters + line.length + 1 > 3_000) break;
    contentLines.push(line);
    contentCharacters += line.length + 1;
  }
  const omittedContent = contentElements.length - contentLines.length;
  const context = asRecord(structured.context);
  const queryContexts = asArray<ContextBlock>(structured.query_contexts);
  // New context windows are bounded before cursor creation by the driver. A
  // second prefix cut here would hide rows that the next cursor has passed.
  const renderedOutline = compactBrowserOutline(outline, Array.isArray(context?.member_refs) ? outline.length : 10_000);
  const renderOmissions = [
    renderedOutline.omittedLines ? `${renderedOutline.omittedLines} outline source lines omitted (only a prefix is shown)` : "",
    omittedActions ? `${omittedActions} actionable elements omitted` : "",
    omittedContent ? `${omittedContent} read-only context anchors omitted` : "",
  ].filter(Boolean);
  const renderCoverage = renderOmissions.length
    ? `Rendered view is partial: ${renderOmissions.join("; ")}. Rendering limits are separate from driver collection completeness; omitted context cannot establish sibling order.`
    : "";
  const queryScoped = queryRequested || snapshot.scope === "query";
  const indexFor = (ref: unknown) => availableElements.find((element) => element.browser_ref === ref)?.element_index;
  const evidence = queryContexts.map((block, index) => [
    `Evidence context ${index + 1}: group [${indexFor(block.group_ref) ?? "unavailable"}]` +
      (block.parent_group_ref ? `; enclosing group [${indexFor(block.parent_group_ref) ?? "unavailable"}]` : "") +
      ". Same snapshot; source order only within this group/frame.",
    renderContextProjection(block),
    `${block.before_omitted} nodes before, ${block.after_omitted} after omitted; group ${block.group_complete ? "complete" : "incomplete"}. ` +
      `Document collection ${block.document_collection_complete ? "complete" : "incomplete"}; virtualized extent unknown.`,
    block.outline ?? "",
    renderContextDirections(block),
  ].filter(Boolean).join("\n")).join("\n\n");
  const coverage = context
    ? `Same-snapshot context (not a new page capture). Group [${indexFor(context.group_ref) ?? "unavailable"}]` +
      (context.parent_group_ref ? `; enclosing group [${indexFor(context.parent_group_ref) ?? "unavailable"}]` : "") +
      `. Group boundaries: ${context.before_omitted ?? "?"} nodes before, ${context.after_omitted ?? "?"} after omitted; ` +
      `group ${context.group_complete === true ? "complete" : "incomplete"}. ` +
      `Document collection ${context.document_collection_complete === true ? "complete" : "incomplete"}; virtualized extent unknown. ` +
      "Order applies only within this stored group/frame. Use context on a group index to read its beginning."
    : queryScoped
    ? (snapshot.complete === false
        ? `Filtered semantic query view is partial (${snapshot.selected_nodes ?? elements.length}/${snapshot.total_nodes ?? "?"} matching nodes).`
        : snapshot.complete === true
          ? "Filtered semantic query view is complete for matching nodes."
          : "Filtered semantic query completeness is unavailable.") +
      (queryContexts.length
        ? " Matching paths alone do not prove order. Evidence contexts below include nonmatching neighbors; use their coverage and continuation before making an order or absence claim."
        : " Surrounding labels and page-wide order may be omitted; ancestor paths are not a complete list of siblings. Use context on an index for stored surrounding structure, or omit query for a fresh page capture.")
    : snapshot.complete === false
      ? `Semantic state is partial (${snapshot.selected_nodes ?? elements.length}/${snapshot.total_nodes ?? "?"} ranked nodes); visible and near-viewport controls are prioritized.`
      : snapshot.complete === true
        ? "Driver semantic collection is complete."
        : "Driver semantic collection completeness is unavailable.";
  const text = [
    header, context ? renderContextProjection(context as unknown as ContextBlock) : "", coverage, renderCoverage,
    evidence,
    evidence ? "Matching paths (filtered, not a complete sibling list):" : "",
    renderedOutline.abbreviatedContainers ? "Outline: a bare '-' is an unnamed generic container, not an action ref. Source AX indentation is retained." : "",
    renderedOutline.text,
    context ? renderContextDirections(context as unknown as ContextBlock) : "",
    actions.length ? `Actionable elements (ranked, not page order):\n${actions.join("\n")}` : "",
    contentLines.length ? `Context anchors (read-only; use getAXState({context: index}); not page order):\n${contentLines.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return { text, truncated: renderOmissions.length > 0 };
}

/**
 * Preserve the driver's source order and indentation without interpreting it as
 * a contiguous tree: semantic_v2 can interleave disconnected ancestor paths.
 * Only exact bare generic lines are abbreviated. Every other retained source
 * line is copied verbatim, including names, states, repeats and whitespace.
 * The character budget covers the source prefix; coverage/legend are separate.
 */
export function compactBrowserOutline(outline: string, maxCharacters = 10_000): {
  text: string;
  omittedLines: number;
  abbreviatedContainers: number;
} {
  if (!Number.isSafeInteger(maxCharacters) || maxCharacters < 0) {
    throw new RangeError("outline character budget must be a non-negative safe integer");
  }
  const lines = outline === "" ? [] : outline.split("\n");
  const kept: string[] = [];
  let characters = 0;
  let abbreviatedContainers = 0;
  for (const line of lines) {
    const normalized = line.replace(/^( *)- generic$/, "$1-");
    const addition = normalized.length + (kept.length ? 1 : 0);
    if (characters + addition > maxCharacters) break;
    kept.push(normalized);
    characters += addition;
    if (normalized !== line) abbreviatedContainers++;
  }
  return { text: kept.join("\n"), omittedLines: lines.length - kept.length, abbreviatedContainers };
}

/** A closed, unselected Mac menu bar opens through its primary Press.
 * Pick/Cancel describe an already-open menu; native CU exposes them there.
 * Keep unknown state and non-menubar actions intact, and never infer openness
 * from a display title. The original driver metadata is not mutated.
 */
export function projectClosedMenuActions(tree: string, elements: SnapshotElement[]): { tree: string; elements: SnapshotElement[] } {
  let projected = tree;
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const visible = elements.map(element => {
    if (element.role !== "AXMenuBarItem" || element.selected !== false || !element.actions?.includes("AXPress")) return element;
    const actions = element.actions.filter(action => action !== "AXPick" && action !== "AXCancel");
    if (actions.length === element.actions.length) return element;
    const rendered = element.actions.map(action => action.replace(/^AX/, "").toLowerCase());
    const readable = actions.map(action => action.replace(/^AX/, "").toLowerCase());
    const metadata = new RegExp(
      `(^[ \t]*- \\[${element.element_index}\\] AXMenuBarItem\\b[^\\n]*)` +
      `actions=\\[${escape(rendered.join(","))}\\]\\](?=\\n|$)`, "gm",
    );
    projected = projected.replace(metadata, (_match, prefix: string) => `${prefix}actions=[${readable.join(",")}]]`);
    return { ...element, actions };
  });
  return { tree: projected, elements: visible };
}

/** Keep top-level menu-bar context while dropping enormous, closed menu trees. */
export function pruneMenuSubtrees(tree: string, visibleMenus: ReadonlySet<number> = new Set()): { tree: string; hiddenIndices: Set<number> } {
  if (!tree) return { tree, hiddenIndices: new Set() };
  const kept: string[] = [];
  const hiddenIndices = new Set<number>();
  let menuBarIndent: number | undefined;
  const lines = tree.split("\n");
  const visibleLines = new Set<number>();
  for (let start = 0; start < lines.length; start++) {
    const menu = lines[start]!.match(/^(\s*)- \[(\d+)\] AXMenu\b/);
    if (!menu || !visibleMenus.has(Number(menu[2]))) continue;
    const depth = menu[1]!.length;
    let hiddenSubmenuDepth: number | undefined;
    visibleLines.add(start);
    for (let row = start + 1; row < lines.length; row++) {
      const line = lines[row]!;
      const structural = /^\s*-\s+/.test(line);
      const indent = line.match(/^\s*/)?.[0].length ?? 0;
      if (structural && indent <= depth) break;
      if (structural && hiddenSubmenuDepth !== undefined && indent <= hiddenSubmenuDepth) hiddenSubmenuDepth = undefined;
      const child = line.match(/^\s*- (?:\[(\d+)\] )?AXMenu\b/);
      if (child && !visibleMenus.has(Number(child[1]))) hiddenSubmenuDepth = indent;
      if (hiddenSubmenuDepth === undefined) visibleLines.add(row);
    }
  }
  for (const [row, line] of lines.entries()) {
    if (visibleLines.has(row)) { kept.push(line); continue; }
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    if (/^\s*-\s+(?:\[\d+\]\s+)?AXMenuBar\b/.test(line)) {
      menuBarIndent = indent;
      kept.push(line);
      continue;
    }
    if (menuBarIndent !== undefined) {
      if (indent <= menuBarIndent) {
        if (/^\s*-\s+/.test(line)) {
          menuBarIndent = undefined;
        } else {
          const index = line.match(/\[(\d+)\]/)?.[1];
          if (index !== undefined) hiddenIndices.add(Number(index));
          continue;
        }
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

/** A selected menubar branch with a visible popup is the active observation.
 * Underlying app rows remain cached by the driver but are absent from this
 * presentation and its public input map until the menu is dismissed.
 */
export function projectActiveMenu(
  tree: string,
  elements: SnapshotElement[],
  visibleMenus: ReadonlySet<number>,
  alreadyHidden: ReadonlySet<number> = new Set(),
): { tree: string; hiddenIndices: Set<number>; active: boolean } {
  const lines = tree.split("\n");
  const selected = new Set(elements.filter(e => e.role === "AXMenuBarItem" && e.selected === true).map(e => e.element_index));
  const branches: Array<{start:number;end:number;indent:number}> = [];
  for (let start = 0; start < lines.length; start++) {
    const root = lines[start]!.match(/^(\s*)- \[(\d+)\] AXMenuBarItem\b/);
    if (!root || !selected.has(Number(root[2]))) continue;
    const indent = root[1]!.length;let end = start + 1;let visible = false;
    while (end < lines.length) {
      const line = lines[end]!;const depth = line.match(/^\s*/)?.[0].length ?? 0;
      if (/^\s*-\s+/.test(line) && depth <= indent) break;
      const menu = line.match(/^\s*- \[(\d+)\] AXMenu\b/);
      if (menu && visibleMenus.has(Number(menu[1]))) visible = true;
      end++;
    }
    if (visible) branches.push({start,end,indent});
  }
  const hiddenIndices = new Set(alreadyHidden);
  if (branches.length !== 1) return {tree,hiddenIndices,active:false};
  const {start,end,indent} = branches[0]!;
  const focused = lines.slice(start,end).map(line => line.slice(Math.min(indent,line.match(/^\s*/)?.[0].length ?? 0))).join("\n");
  const visibleIndices = indicesInTree(focused);
  for (const element of elements) if (!visibleIndices.has(element.element_index)) hiddenIndices.add(element.element_index);
  return {tree:focused,hiddenIndices,active:true};
}

/** Return the largest AXWebArea subtree plus its containing window identity. */
export function isolatePrimaryWebArea(tree: string): string {
  if (!tree) return tree;
  const lines = tree.split("\n");
  const candidates: Array<{ start: number; end: number }> = [];
  for (let start = 0; start < lines.length; start += 1) {
    if (!/\bAXWebArea\b/.test(lines[start] ?? "")) continue;
    const indent = lines[start]?.match(/^\s*/)?.[0].length ?? 0;
    let end = start + 1;
    while (end < lines.length) {
      const line = lines[end] ?? "";
      const nextIndent = line.match(/^\s*/)?.[0].length ?? 0;
      if (/^\s*-\s+/.test(line) && nextIndent <= indent) break;
      end += 1;
    }
    candidates.push({ start, end });
  }
  const primary = candidates.sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
  if (!primary || primary.end - primary.start < 2) return tree;
  const windowLine = lines.find((line) => /\bAXWindow\b/.test(line));
  return [windowLine, ...lines.slice(primary.start, primary.end)].filter(Boolean).join("\n");
}

function indicesInTree(tree: string): Set<number> {
  return new Set([...tree.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1])));
}

function isHttpUrl(target: string): boolean {
  return /^https?:\/\//i.test(target.trim());
}

function isBrowserNavigableUrl(target: string): boolean {
  const normalized = target.trim().toLowerCase();
  return normalized.startsWith("http://") || normalized.startsWith("https://") || normalized.startsWith("about:");
}

function isTypedBrowserOpenUrl(target: string): boolean {
  return isHttpUrl(target) || target.trim().toLowerCase() === "about:blank";
}

function safeBrowserSessionLabel(value: string | undefined): string {
  return value?.trim().replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 40) ?? "";
}

function isChromiumApp(query: string, match?: Record<string, unknown>): boolean {
  const identity = [query, optionalString(match?.name), optionalString(match?.bundle_id), optionalString(match?.launch_path)]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
  return /(?:google\s*chrome|com\.google\.chrome|microsoft\s*edge|com\.microsoft\.edgemac|chromium)/.test(identity);
}

function isTypedBrowserUnavailable(error: unknown): boolean {
  const code = error instanceof OpenSkyError ? error.code : undefined;
  // A supported route can fail while starting or connecting to the browser.
  // Preserve that failure: a second native launch hides the cause and can
  // create an unrelated browser outside the requested isolated session.
  if (code === "browser_route_unavailable") return false;
  if (code && ["browser_unsupported_engine", "method_not_found"].includes(code)) return true;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("unknown tool") || message.includes("tool not found");
}

function targetResourceKind(targets: string[]): TargetRequestIdentity["resourceKind"] {
  const urlCount = targets.filter(isHttpUrl).length;
  return urlCount === targets.length ? "url" : urlCount === 0 ? "path" : "mixed";
}

function targetIdentityFor(resolved: ResolvedApp, snapshot?: WindowSnapshot): TargetIdentity | undefined {
  const request = resolved.targetRequest;
  if (!request) return undefined;
  const rebound = request.window.id !== undefined && resolved.windowId !== request.window.id;
  const window = {
    id: resolved.windowId,
    source: rebound ? "post_launch_list" as const : request.window.source,
    correlation: rebound ? "uncorrelated" as const : request.window.correlation,
  };
  if (resolved.browser && snapshot && !snapshot.degraded) {
    return {
      handle: resolved.handle,
      ...request,
      window,
      document: {
        freshness: "current",
        title: resolved.browser.title,
        url: resolved.browser.url,
        source: "ax_document",
        requestRelation: requestRelation(request.requested, resolved.browser.url),
      },
      tab: { status: "verified", title: resolved.browser.title, url: resolved.browser.url },
    };
  }
  if (!snapshot || snapshot.degraded) {
    return {
      handle: resolved.handle,
      ...request,
      window,
      document: { freshness: "unavailable", requestRelation: "unknown" },
      tab: resolved.contentScope === "web" ? { status: "unverified" } : undefined,
    };
  }
  const candidates = snapshot.elements
    .filter((element) => /^AX(?:WebArea|Document)$/i.test(element.role ?? ""))
    .sort((a, b) => documentCandidateScore(b) - documentCandidateScore(a));
  const observed = candidates[0];
  const url = observed?.url;
  return {
    handle: resolved.handle,
    ...request,
    window,
    document: {
      freshness: "current",
      title: observed?.label,
      url,
      source: observed?.role?.toLowerCase() === "axwebarea" ? "ax_web_area" : observed ? "ax_document" : undefined,
      requestRelation: requestRelation(request.requested, url),
    },
    tab: resolved.contentScope === "web" ? { status: "unverified" } : undefined,
  };
}

function documentCandidateScore(element: SnapshotElement): number {
  const area = (element.frame?.w ?? 0) * (element.frame?.h ?? 0);
  return (element.url ? 1e12 : 0) + area;
}

function requestRelation(requested: string[], observed?: string): "exact" | "different" | "unknown" {
  if (!observed) return "unknown";
  const current = canonicalHttpUrl(observed);
  if (!current) return "unknown";
  const expected = requested.map(canonicalHttpUrl).filter((value): value is string => value !== undefined);
  if (expected.length !== requested.length) return "unknown";
  return expected.includes(current) ? "exact" : "different";
}

function canonicalHttpUrl(value: string): string | undefined {
  if (!isHttpUrl(value)) return undefined;
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return undefined;
  }
}

/** Compact model-facing rendering that never implies verified tab identity or creation. */
export function formatTargetIdentity(target: TargetIdentity): string {
  const document = target.document;
  const subject = document.url
    ? `url=${document.url}`
    : document.freshness === "current" && document.title
      ? `document=${JSON.stringify(document.title)}`
    : target.requested.length === 1
      ? `requested=${target.requested[0]}`
      : `requested=${target.requested.length} targets`;
  const unresolvedKind = target.resourceKind === "path" ? "path-unverified" : "url-unverified";
  const freshness = document.url
    ? "ax-current"
    : document.freshness === "current"
      ? `ax-document-current; ${unresolvedKind}`
      : unresolvedKind;
  const window = target.window.correlation.replaceAll("_", "-");
  const tab = target.tab ? `; tab=${target.tab.status}` : "";
  return `Target ${target.handle}: ${target.resourceKind} ${subject} [${freshness}; request=${document.requestRelation}; window=${window}${tab}]`;
}

/** Flatten only verified action metadata; labels, values and raw tokens stay intact. */
export function sanitizeTreeText(tree: string, elements: SnapshotElement[] = []): string {
  let sanitized = tree;
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const element of elements) {
    if (!element.role || !element.actions?.length) continue;
    const rendered = element.actions.map(action => action.replace(/^AX/, "").toLowerCase());
    const readable = rendered.flatMap((action, index) => {
      if (element.actions!.indexOf(element.actions![index]!) !== index) return [];
      const descriptor = action.match(/^name:([^\n]+)\ntarget:[^\n]*\nselector:[^\n]*$/);
      return [descriptor?.[1]?.trim() || action];
    });
    if (readable.length === rendered.length && readable.every((action, index) => action === rendered[index])) continue;
    // The renderer puts actions last in this element's metadata. Require the
    // complete raw list, current element index and role before rewriting it;
    // never search-and-replace descriptor-like text inside an editable value.
    const metadata = new RegExp(
      `(^[ \\t]*- \\[${element.element_index}\\] ${escape(element.role)}\\b[^\\n]*)` +
        `actions=\\[${escape(rendered.join(","))}\\]\\](?=\\n|$)`, "gm",
    );
    sanitized = sanitized.replace(metadata, (_match, prefix: string) =>
      `${prefix}actions=[${readable.join(",")}]]`);
  }
  return sanitized.split("\n").map(compactAuxiliaryHelp).join("\n");
}

function compactAuxiliaryHelp(line: string): string {
  const start = line.indexOf('help="');
  if (start < 0) return line;
  const valueStart = start + 'help="'.length;
  const beforeActions = line.lastIndexOf('" actions=[');
  const closing = beforeActions > valueStart ? beforeActions : line.lastIndexOf('"]');
  if (closing <= valueStart || closing - valueStart <= 512) return line;
  return `${line.slice(0, valueStart)}${line.slice(valueStart, valueStart + 512)}…${line.slice(closing)}`;
}

function primaryDocumentFingerprint(elements: SnapshotElement[]): string | undefined {
  const document = elements.find((element) => /^AX(?:WebArea|Document)$/i.test(element.role ?? ""));
  if (!document) return undefined;
  const url = document.url?.trim();
  if (url) return `url:${url}`;
  const label = document.label?.trim();
  return label ? `label:${label}` : undefined;
}

/**
 * Keep useful AX hints while compacting implicit selection and private IDs.
 * The structured element map retains every action, so this only reduces the
 * model-facing representation; it does not remove capabilities or provenance.
 */
export function compactTreeActionHints(tree: string, elements: SnapshotElement[]): string {
  const byIndex = new Map(elements.map((element) => [element.element_index, element]));
  return tree
    .split("\n")
    .map((line) => {
      const control = line.match(/^[ \t]*- \[(\d+)\] (AX\w+)\b/);
      const rawIndex = control?.[1];
      if (rawIndex === undefined) return line;
      const element = byIndex.get(Number(rawIndex));
      const role = element?.role ?? control![2]!;
      if (role !== control![2]) return line;
      if ([element?.value, element?.formattedValue, element?.label].some(value => value?.includes("\n"))) return line;
      const rawActions = element?.actions ?? [];
      let compact = compactGeneratedIdentifier(line, element);
      const selectable = role === "AXRow" && rawActions.some(action =>
        /^(?:AX)?Show(?:Default|Alternate)UI$/i.test(action));
      const isEditableText = isLikelyEditableText(element, role, line, rawActions);
      compact = compact.replace(/( \[| )actions=\[([^\]\n]*)\]\]$/i, (_match, opening: string, rawActions: string) => {
        const actions = rawActions
          .split(",")
          .map((action) => action.trim())
          .filter(Boolean)
          .filter(action => !selectable || !/^show(?:default|alternate)ui$/i.test(action))
          .filter((action) => action.toLowerCase() !== "scrolltovisible")
          .filter((action) => !isEditableText || action.toLowerCase() !== "press")
          .filter((action) => {
            if (action.toLowerCase() !== "showmenu") return true;
            return !isEditableText && /AX(?:MenuButton|PopUpButton|Button)\b/i.test(role);
          });
        return actions.length > 0 ? `${opening}actions=[${actions.join(",")}]]` : opening === " [" ? "" : "]";
      });
      return selectable && !compact.endsWith(" [selectable]") ? `${compact} [selectable]` : compact;
    })
    .join("\n");
}

/** Only the trailing, observed metadata block can contain a private ID. */
function compactGeneratedIdentifier(line: string, element?: SnapshotElement): string {
  const id = element?.identifier;
  if (!id || !/^_NS:\d+$/.test(id)) return line;
  if ([element.value, element.formattedValue, element.label].some(value => value?.includes("\n"))) return line;
  const prefix = ` [id=${id}`;
  const at = line.lastIndexOf(prefix);
  if (at < 0) return line;
  const tail = line.slice(at + prefix.length);
  if (tail === "]") return line.slice(0, at);
  // Unknown/multiline attribute shapes stay verbatim. Stable semantic IDs and
  // the raw structured identifier used for binding are never changed.
  if (!/^ (?:help="[^"\n]*" )?actions=\[[^\]\n]*\](?: settable)?\](?: \[value="(?:[^"\\\n]|\\[^\n])*"\])?$/.test(tail)) return line;
  return `${line.slice(0, at)} [${tail.trimStart()}`;
}

/** Reuse only unambiguous public element indices when the helper renumbers its walk. */
/** A single visible static descendant can name an otherwise anonymous row/cell.
 * This is a semantic observation hint, not native object identity or authority.
 * Duplicates still fail the existing uniqueness check; inputs use fresh tokens.
 */
export function nameAnonymousContainers(tree: string, elements: SnapshotElement[]): SnapshotElement[] {
  if (tree.includes("AX tree truncated")) return elements;
  const rows = tree.split("\n").flatMap(line => {
    const match = line.match(/^(\s*)- (?:\[(\d+)\] )?(AX\w+)\b(.*)$/);
    return match ? [{depth: match[1]!.length, index: match[2] === undefined ? undefined : Number(match[2]), role: match[3]!, tail: match[4]!}] : [];
  });
  return elements.map(element => {
    if (!/^AX(?:Row|Cell)$/.test(element.role ?? "") || element.label || element.identifier) return element;
    const start = rows.findIndex(row => row.index === element.element_index && row.role === element.role);
    if (start < 0) return element;
    const labels: string[] = [];
    for (let n = start + 1; n < rows.length && rows[n]!.depth > rows[start]!.depth; n++) {
      const row = rows[n]!;
      // Never name a container from editable data or a multiple-label subtree.
      if (/^AX(?:TextField|TextArea|ComboBox|SearchField)$/.test(row.role)) return element;
      if (row.role !== "AXStaticText") continue;
      const quoted = row.tail.match(/^\s*=\s*("(?:[^"\\]|\\.)*")\s*(?:\[.*\])?$/)?.[1];
      if (!quoted) return element;
      try {
        const label: unknown = JSON.parse(quoted);
        if (typeof label !== "string" || !label.trim() || label.length > 256) return element;
        labels.push(label);
      } catch { return element; }
    }
    return labels.length === 1 ? {...element, label: labels[0], labelSource: "contents"} : element;
  });
}

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
  const previousIdentityCounts = countElementIdentities(previous);
  const currentIdentityCounts = countElementIdentities(current);
  const previousSemanticCounts = countElementIdentities(previous, semanticElementIdentity);
  const currentSemanticCounts = countElementIdentities(current, semanticElementIdentity);
  const unused = new Set(previous.map((element) => element.element_index));
  let nextIndex = Math.max(-1, ...previous.map((element) => element.element_index)) + 1;
  // Reserve every proven native match first. A recreated unique semantic
  // wrapper must not take the index of a still-live object renamed this read.
  const matches = current.map((element) => {
    const candidates = previous.filter((prior) => unused.has(prior.element_index) &&
      // Do not transfer a read-only identity onto an actionable row with the same label.
      (prior.readOnly === true) === (element.readOnly === true));
    const identity = elementIdentity(element);
    // Native aliases and duplicate semantic names remain ambiguous.
    const prior = previousIdentityCounts.get(identity) === 1 && currentIdentityCounts.get(identity) === 1
      ? candidates.find((candidate) => elementIdentity(candidate) === identity)
      : undefined;
    if (prior) unused.delete(prior.element_index);
    return prior;
  });
  return current.map((element, index) => {
    let prior = matches[index];
    if (!prior && element.role !== "AXRadioButton" &&
      (!element.nativeObjectId || currentIdentityCounts.get(elementIdentity(element)) === 1)) {
      const semantic = semanticElementIdentity(element);
      if (previousSemanticCounts.get(semantic) === 1 && currentSemanticCounts.get(semantic) === 1) {
        prior = previous.find(candidate => unused.has(candidate.element_index) &&
          (candidate.readOnly === true) === (element.readOnly === true) &&
          (!candidate.nativeObjectId || previousIdentityCounts.get(elementIdentity(candidate)) === 1) &&
          semanticElementIdentity(candidate) === semantic);
        if (prior) unused.delete(prior.element_index);
      }
    }
    return {
      ...element,
      driver_index: element.driver_index ?? element.element_index,
      element_index: prior?.element_index ?? nextIndex++,
    };
  });
}

function countElementIdentities(elements: SnapshotElement[], identityFor = elementIdentity): Map<string, number> {
  const counts = new Map<string, number>();
  for (const element of elements) {
    const identity = identityFor(element);
    counts.set(identity, (counts.get(identity) ?? 0) + 1);
  }
  return counts;
}

function nativeWindowObservationArgs(timeout: number | undefined): Record<string, unknown> {
  if (timeout === undefined) return {};
  if (!Number.isInteger(timeout) || timeout < 50 || timeout > 1000) {
    throw invalidParams("window_change_timeout_ms must be an integer between50 and1000");
  }
  return { window_change_timeout_ms: timeout };
}

function elementIdentity(element: SnapshotElement): string {
  // A native object can change its label or identifier as selection changes.
  // Current tokens still authorize input; duplicated object IDs remain
  // ambiguous under the same uniqueness check as semantic fallback identities.
  if (element.nativeObjectId) {
    return [element.role ?? "", "native-object", element.nativeObjectId].join("\u0000");
  }
  return semanticElementIdentity(element);
}

function semanticElementIdentity(element: SnapshotElement): string {
  // The driver explicitly distinguishes an editable value from a control's
  // name. Keep anonymous fields anonymous as they are edited; uniqueness in
  // both snapshots is still required, and current tokens still authorize input.
  const label = element.labelSource === "value" && /^AX(?:TextField|TextArea|ComboBox|SearchField)$/i.test(element.role ?? "")
    ? "" : element.label ?? "";
  return element.identifier
    ? [element.role ?? "", "id", element.identifier].join("\u0000")
    : [element.role ?? "", "label", label].join("\u0000");
}

function remapTreeIndices(tree: string, elements: SnapshotElement[]): string {
  const indices = new Map(elements.map((element) => [element.driver_index ?? element.element_index, element.element_index]));
  return tree.replace(/\[(\d+)\]/g, (match, raw: string) => {
    const stable = indices.get(Number(raw));
    return stable === undefined ? match : `[${stable}]`;
  });
}

/** Compact only text proved outside its owning window; document bounds alone are not a viewport. */
export function projectNativeWebText(tree: string, elements: SnapshotElement[], textSelection?: {role?: unknown}):
  {tree: string; elements: SnapshotElement[]; hiddenIndices: Set<number>} {
  const intact = () => ({tree, elements, hiddenIndices: new Set<number>()});
  // A selected document range may span offscreen nodes without individual AXSelected flags.
  if (textSelection && !["AXTextField", "AXSearchField", "AXComboBox"].includes(String(textSelection.role))) return intact();
  const rect = (f: SnapshotElement["frame"]): f is NonNullable<SnapshotElement["frame"]> =>
    !!f && [f.x, f.y, f.w, f.h].every(Number.isFinite) && f.w > 0 && f.h > 0;
  const windows = elements.filter(e => e.role === "AXWindow");
  if (windows.length !== 1 || !rect(windows[0]!.frame)) return intact();
  const window = windows[0]!, windowFrame = window.frame!;
  const byIndex = new Map(elements.map(e => [e.element_index, e]));
  if (byIndex.size !== elements.length) return intact();
  const rows = quotedTreeRows(tree);
  if (rows.some(r => !r.closed)) return intact();
  const parsed = rows.map(({line}, position) => {
    const m = line.match(/^([ \t]*)- (?:\[(\d+)\] )?(AX[A-Za-z0-9]+)\b/);
    return m ? {position, depth: m[1]!.length, index: m[2] === undefined ? undefined : Number(m[2]), role: m[3]!} : undefined;
  }).filter((row): row is NonNullable<typeof row> => row !== undefined);
  const indices = parsed.flatMap(row => row.index === undefined ? [] : [row.index]);
  if (new Set(indices).size !== indices.length || parsed.filter(row => row.role === "AXWindow" && row.index === window.element_index).length !== 1) return intact();
  const ancestors: typeof parsed = [], omitted = new Set<number>(), hiddenIndices = new Set<number>(), counts = new Map<number, number>();
  for (let n = 0; n < parsed.length; n++) {
    const row = parsed[n]!;
    while (ancestors.length && ancestors.at(-1)!.depth >= row.depth) ancestors.pop();
    const area = [...ancestors].reverse().find(p => p.role === "AXWebArea");
    const owner = [...ancestors].reverse().find(p => p.role === "AXWindow");
    const e = row.index === undefined ? undefined : byIndex.get(row.index);
    const web = area?.index === undefined ? undefined : byIndex.get(area.index);
    const leaf = !parsed[n + 1] || parsed[n + 1]!.depth <= row.depth;
    const insideControl = area && ancestors.slice(ancestors.indexOf(area) + 1).some(parent => {
      const control = parent.index === undefined ? undefined : byIndex.get(parent.index);
      return !["AXGroup", "AXScrollArea", "AXLayoutArea", "AXStaticText", "AXHeading", "AXParagraph"].includes(parent.role)
        || control?.settable === true || (control?.actions ?? []).some(action => !["AXShowMenu", "AXScrollToVisible"].includes(action));
    });
    if (!insideControl && row.role === "AXStaticText" && e?.role === row.role && leaf && owner?.index === window.element_index
      && web?.role === "AXWebArea" && rect(web.frame) && rect(e.frame)
      && e.selected === false && e.focused !== true && e.settable !== true && e.selectionViaParent !== true
      && (e.actions ?? []).every(action => ["AXShowMenu", "AXScrollToVisible"].includes(action))) {
      const left = Math.max(windowFrame.x, web.frame.x), top = Math.max(windowFrame.y, web.frame.y);
      const right = Math.min(windowFrame.x + windowFrame.w, web.frame.x + web.frame.w);
      const bottom = Math.min(windowFrame.y + windowFrame.h, web.frame.y + web.frame.h);
      if (right > left && bottom > top && (e.frame.x + e.frame.w <= left || e.frame.x >= right
        || e.frame.y + e.frame.h <= top || e.frame.y >= bottom)) {
        omitted.add(row.position); hiddenIndices.add(e.element_index);
        counts.set(area!.position, (counts.get(area!.position) ?? 0) + 1);
      }
    }
    ancestors.push(row);
  }
  if (!hiddenIndices.size) return intact();
  return {tree: rows.map(({line}, position) => line + (counts.has(position)
    ? ` [window text viewport: ${counts.get(position)} offscreen text nodes omitted; scroll or request getAXState({collectionScope:"all"}) for complete loaded content.]` : ""))
    .filter((_, position) => !omitted.has(position)).join("\n"),
    elements: elements.filter(e => !hiddenIndices.has(e.element_index)), hiddenIndices};
}

/** Physical newlines inside quoted AX values remain part of one literal row. */
function quotedTreeRows(tree: string): Array<{line: string; closed: boolean}> {
  const rows: Array<{line: string; closed: boolean}> = [];
  let start = 0, quoted = false, escaped = false;
  for (let cursor = 0; cursor < tree.length; cursor++) {
    const char = tree[cursor]!;
    if (escaped) { escaped = false; continue; }
    if (quoted && char === "\\") { escaped = true; continue; }
    if (char === '"') quoted = !quoted;
    if (char === "\n" && !quoted) {
      rows.push({line: tree.slice(start, cursor), closed: true}); start = cursor + 1;
    }
  }
  rows.push({line: tree.slice(start), closed: !quoted});
  return rows;
}

/** Merge structured-only AX state into the readable tree without app-specific rules. */
export function enrichTreeSemantics(tree: string, elements: SnapshotElement[]): string {
  const byIndex = new Map(elements.map((element) => [element.element_index, element]));
  return quotedTreeRows(tree)
    .map(({line, closed}) => {
      // An unterminated value cannot safely acquire generated metadata.
      if (!closed) return line;
      const metadata = line.replace(/"(?:[^"\\]|\\.)*"/gs, '""');
      const rawIndex = line.match(/^\s*(?:-\s*)?\[(\d+)\](?:\s|$)/)?.[1];
      if (rawIndex !== undefined) {
        const element = byIndex.get(Number(rawIndex));
        if (!element) return line;
        const additions: string[] = [];
        // These names were derived from exactly one static descendant, not
        // native identity. Surface the observed hint beside the input index.
        if (element.labelSource === "contents" && /^AX(?:Row|Cell)$/.test(element.role ?? "")
          && element.label && !line.includes(`label=${JSON.stringify(element.label)}`)) {
          additions.push(`label=${JSON.stringify(element.label)}`);
        }
        const renderedValue = element.value === undefined ? undefined : JSON.stringify(element.value);
        if (isNativeFileItemLabel(element)) {
          if (!line.includes("file item label")) additions.push("file item label");
        } else if (isLikelyEditableText(element, element.role ?? "", line, element.actions ?? [])) {
          if (!/\b(?:editable|settable)\b/i.test(metadata)) additions.push("editable");
          if (!/\btype-directly\b/i.test(metadata)) additions.push("type-directly");
        }
        if (
          element.value !== undefined &&
          !/\bvalue\s*[:=]/i.test(line) &&
          !/\s=\s["'\d-]/.test(line) &&
          !(renderedValue && line.includes(`= ${renderedValue}`))
        ) {
          additions.push(`value=${JSON.stringify(element.value)}`);
        }
        if (element.selectionViaParent === true && !metadata.includes("selectable via parent")) additions.push("selectable via parent");
        if (element.enabled === false && !/\bdisabled\b/i.test(metadata)) additions.push("disabled");
        if (element.selected === true && element.value === undefined && !/\bselected\b/i.test(metadata)) {
          additions.push("selected");
        }
        if (element.checked !== undefined && !/\bchecked\b/i.test(metadata)) {
          additions.push(`checked=${element.checked}`);
        }
        if (element.focused === true && !/\bfocused\b/i.test(metadata)) additions.push("focused");
        if (element.expanded !== undefined && !/\bexpanded\b/i.test(metadata)) {
          additions.push(`expanded=${element.expanded}`);
        }
        return additions.length > 0 ? `${line} [${additions.join(" ")}]` : line;
      }
      // Cua Driver omits indices from intrinsic controls that cannot be acted on.
      // Surface that generic state so the model does not mistake them for active controls.
      if (
        /^\s*-\s+AX(?:Button|MenuButton|RadioButton|CheckBox|Switch|PopUpButton|ComboBox|Slider)\b/.test(line) &&
        !/\b(?:disabled|unavailable)\b/i.test(metadata)
      ) {
        return `${line} [unavailable]`;
      }
      return line;
    })
    .join("\n");
}

function isLikelyEditableText(
  element: SnapshotElement | undefined,
  role: string,
  line: string,
  actions: string[],
): boolean {
  if (!/^AX(?:TextField|TextArea|ComboBox)$/i.test(role) || element?.enabled === false) return false;
  if (element?.value?.includes("\n")) return false;
  if (element?.settable !== undefined) return element.settable;
  if (/\bsettable\b/i.test(line)) return true;
  const normalized = new Set(actions.map((action) => action.toLowerCase()));
  return normalized.has("press") || normalized.has("showmenu");
}

function semanticAttributes(element: SnapshotElement): string {
  const attributes: string[] = [];
  if (isNativeFileItemLabel(element)) attributes.push("file item label");
  if (element.selectionViaParent === true) attributes.push("selectable via parent");
  if (element.enabled === false) attributes.push("disabled");
  if (element.selected === true && element.value === undefined) attributes.push("selected");
  if (element.checked !== undefined) attributes.push(`checked=${element.checked}`);
  if (element.focused === true) attributes.push("focused");
  if (element.expanded !== undefined) attributes.push(`expanded=${element.expanded}`);
  return attributes.length > 0 ? ` [${attributes.join(" ")}]` : "";
}

function renderTree(elements: SnapshotElement[]): string {
  if (elements.length === 0) return "";
  return elements.map((element) => formatElement(element)).join("\n");
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

async function browserScreenshotFromResult(
  raw: unknown,
  structured: Record<string, unknown>,
  fallbackPath: string,
): Promise<Screenshot | undefined> {
  const direct = optionalString(structured.screenshot_png_b64);
  const rawRecord = asRecord(raw);
  const image = asArray<Record<string, unknown>>(rawRecord?.content).find((item) => item.type === "image");
  const data = direct ?? optionalString(image?.data);
  if (!data) return undefined;
  await writeFilePrivate(fallbackPath, Buffer.from(data, "base64"));
  const result = await screenshotFromFile(fallbackPath);
  const screenshot = asRecord(structured.screenshot) ?? {};
  return {
    ...result,
    url: pathToFileURL(fallbackPath).href,
    width: optionalFiniteNumber(screenshot.width) ?? result?.width,
    height: optionalFiniteNumber(screenshot.height) ?? result?.height,
    format: "png",
    coordinateSpace: screenshot.coordinate_space === "viewport_css_px" ? "viewport_css_px" : undefined,
    pixelToCssScaleX: optionalFiniteNumber(screenshot.pixel_to_css_scale_x),
    pixelToCssScaleY: optionalFiniteNumber(screenshot.pixel_to_css_scale_y),
    viewportCssWidth: optionalFiniteNumber(screenshot.viewport_css_width),
    viewportCssHeight: optionalFiniteNumber(screenshot.viewport_css_height),
  };
}

function screenshotMappingFrom(structured: Record<string, unknown>): NonNullable<ResolvedApp["browser"]>["screenshotMapping"] | undefined {
  const screenshot = asRecord(structured.screenshot);
  if (screenshot?.coordinate_space !== "viewport_css_px") return undefined;
  const pixelToCssScaleX = optionalFiniteNumber(screenshot.pixel_to_css_scale_x);
  const pixelToCssScaleY = optionalFiniteNumber(screenshot.pixel_to_css_scale_y);
  const viewportCssWidth = optionalFiniteNumber(screenshot.viewport_css_width);
  const viewportCssHeight = optionalFiniteNumber(screenshot.viewport_css_height);
  if (
    !positiveFinite(pixelToCssScaleX) || !positiveFinite(pixelToCssScaleY) ||
    !positiveFinite(viewportCssWidth) || !positiveFinite(viewportCssHeight)
  ) return undefined;
  return {
    coordinateSpace: "viewport_css_px",
    pixelToCssScaleX,
    pixelToCssScaleY,
    viewportCssWidth,
    viewportCssHeight,
  };
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

function optionalFiniteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function positiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function scalarText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return undefined;
}

function isFocusRoutingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /off.?space|ax.?unresolved|window.*unavailable|background input is refused|ambiguous_window_target|process-scoped|sibling window|could mutate/i.test(message);
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeAppKey(app: string): string {
  return app.trim().toLowerCase();
}

function newTargetHandle(): TargetHandle {
  return `tgt_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

function looksLikeTargetHandle(value: string): boolean {
  return value.trim().toLowerCase().startsWith("tgt_");
}

function unknownTargetHandle(value: string): OpenSkyError {
  return new OpenSkyError(
    `Target handle ${JSON.stringify(value)} is unknown or stale. No app was resolved or launched and no input was sent.`,
  );
}

function targetAliases(resolved: ResolvedApp): string[] {
  return [...new Set([resolved.query, resolved.name, resolved.bundleId, resolved.launchPath]
    .filter((value): value is string => Boolean(value))
    .map(normalizeAppKey))];
}

function browserStabilitySignature(
  snapshot: WindowSnapshot,
  browser: ResolvedApp["browser"],
): string {
  return JSON.stringify([
    browser?.url,
    browser?.documentId,
    snapshot.truncated === true,
    snapshot.totalElementCount,
    snapshot.returnedElementCount,
    snapshot.elements.map((element) => [
      element.role,
      element.label,
      element.value,
      element.browserFrame,
      element.actions,
    ]),
  ]);
}

function windowKey(resolved: ResolvedApp): string {
  return resolved.handle;
}

function legacyWindowKey(resolved: { pid: number; windowId?: number }): string {
  return `${resolved.pid}:${resolved.windowId ?? 0}`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "app";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
