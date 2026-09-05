import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { createOpenSky } from "../src/opensky.js";
import type { DriverCall, DriverClient, DriverResult } from "../src/types.js";

const SESSION = "opensky-typed-browser-test";
const PID = 7_421;
const WINDOW_ID = 88_001;
const TARGET_ID = "bt-test-1";
const TAB_ID = "tab-test-1";
const URL = "https://example.com/search";

/**
 * Contract double for Cua Driver's typed Chromium surface. It also implements
 * the legacy launch/window-state calls so these tests reach their assertions
 * while the production implementation is being migrated.
 */
class TypedBrowserDriver implements DriverClient {
  readonly calls: DriverCall[] = [];
  private currentUrl = "about:blank";
  private documentId = "doc-test-1";
  failEndSessionCount = 0;
  endSessionReceipt: ((session: string) => unknown) | undefined;
  failBind = false;
  ambiguousPrepare = false;
  failNextSnapshot = false;
  resultUrl = "https://example.com/results";
  snapshotErrors: Error[] = [];
  snapshotComplete = true;
  contentRefs: Array<Record<string, unknown>> = [];
  snapshotOutline?: string;
  lastSnapshot?: Record<string, unknown>;
  contextResult?: (args: Record<string, unknown>) => DriverResult | Promise<DriverResult>;
  clickResult?: () => DriverResult | Promise<DriverResult>;

  replaceDocument(): void {
    this.documentId = `doc-test-${Number(this.documentId.split("-").at(-1)) + 1}`;
  }

  async ensureDaemon(): Promise<void> {}

  async status(): Promise<{ running: boolean; text: string }> {
    return { running: true, text: "running" };
  }

  async call(tool: string, args: Record<string, unknown> = {}): Promise<DriverResult> {
    // CuaDriverClient adds its configured session before dispatch. Keep the
    // fake at that same boundary so assertions see the effective wire request.
    const effectiveArgs = args.session === undefined ? { ...args, session: SESSION } : { ...args };
    this.calls.push({ tool, args: effectiveArgs });

    switch (tool) {
      case "list_apps":
        return result({
          apps: [{
            name: "Google Chrome",
            bundle_id: "com.google.Chrome",
            launch_path: "/Applications/Google Chrome.app",
            running: false,
          }],
        });
      case "browser_prepare":
        if (this.ambiguousPrepare) return result({ status: "pending", prepared: false });
        return result({
          status: "ok",
          prepared: true,
          prepared_pid: PID,
          action: "launched_isolated_browser",
          side_effects: { launched_browser: true, created_profile: true },
        });
      case "list_windows":
        return result({ windows: [ordinaryWindow()] });
      case "get_browser_state":
        if (effectiveArgs.target_id !== undefined) {
          if (effectiveArgs.context_ref !== undefined && this.contextResult) return this.contextResult(effectiveArgs);
          const error = this.snapshotErrors.shift();
          if (error) throw error;
          if (this.failNextSnapshot) {
            this.failNextSnapshot = false;
            throw new Error("injected snapshot failure");
          }
          return this.semanticSnapshot(effectiveArgs.include_screenshot === true, typeof effectiveArgs.query === "string");
        }
        if (this.failBind) throw new Error("injected bind failure");
        return result({
          status: "ok",
          mode: "bind",
          target_id: TARGET_ID,
          binding_quality: "exact",
          binding_route: "native_cdp_window",
          mutation_allowed: true,
          native_title: "Example Search",
          tabs: [{ tab_id: TAB_ID, title: "New Tab", url: "about:blank", active: true }],
        });
      case "browser_navigate":
        if (typeof effectiveArgs.url === "string") this.currentUrl = effectiveArgs.url;
        else if (effectiveArgs.action === "back") this.currentUrl = "https://example.com/back";
        else if (effectiveArgs.action === "forward") this.currentUrl = "https://example.com/forward";
        return result({
          status: "ok",
          target_id: TARGET_ID,
          tab_id: TAB_ID,
          url: typeof effectiveArgs.url === "string" ? this.currentUrl : null,
          action: typeof effectiveArgs.url === "string" ? "url" : effectiveArgs.action,
          history_destination_attested: effectiveArgs.action === "back" || effectiveArgs.action === "forward",
          refs_invalidated: true,
        });
      case "browser_key":
        return result({
          status: "ok", target_id: TARGET_ID, tab_id: TAB_ID,
          ref: effectiveArgs.ref ?? null, key: effectiveArgs.key,
          modifier_count: 0, path: "cdp_input", effect: "unverifiable",
        });
      case "browser_type":
      case "browser_click":
      case "revoke_session":
        if (tool === "browser_click" && this.clickResult) return this.clickResult();
        return result({ status: "ok", effect: "confirmed" });
      case "browser_pointer":
        return result({
          status: "ok", target_id: TARGET_ID, tab_id: TAB_ID,
          action: effectiveArgs.action, route: effectiveArgs.input_route,
        });
      case "end_session":
        if (this.failEndSessionCount-- > 0) throw new Error("injected cleanup refusal");
        return result(this.endSessionReceipt ? this.endSessionReceipt(String(effectiveArgs.session)) : { session: effectiveArgs.session, active: false });

      // Compatibility responses for the pre-typed-browser implementation.
      case "launch_app":
        return result({
          pid: PID,
          name: "Google Chrome",
          bundle_id: "com.google.Chrome",
          launch_path: "/Applications/Google Chrome.app",
          windows: [ordinaryWindow()],
        });
      case "get_window_state":
        return result({
          pid: PID,
          window_id: WINDOW_ID,
          snapshot_id: "legacy-snapshot",
          tree_markdown: [
            '[0] AXTextField "Query"',
            '[1] AXButton "Submit"',
          ].join("\n"),
          elements: [
            { element_index: 0, role: "AXTextField", label: "Query", actions: ["press"] },
            { element_index: 1, role: "AXButton", label: "Submit", actions: ["press"] },
          ],
          elements_complete: true,
        });
      case "type_text":
      case "click":
        return result({ effect: "confirmed", route: "accessibility" });
      default:
        throw new Error(`Unexpected driver call: ${tool}`);
    }
  }

  private semanticSnapshot(includeScreenshot = false, queried = false): DriverResult {
    const structured = {
      status: "ok",
      mode: "snapshot",
      target_id: TARGET_ID,
      tab_id: TAB_ID,
      snapshot: {
        id: "p41",
        format: "semantic_v2",
        complete: this.snapshotComplete,
        scope: queried ? "query" : "viewport",
        selected_nodes: 5,
        total_nodes: 5,
        node_budget: 300,
        omitted: {
          css_hidden: 0,
          offscreen: 0,
          page_occluded: 0,
          no_layout: 0,
          unknown: 0,
          budget: 0,
          unprovable_frame: 0,
        },
        continuation: null,
      },
      page: { url: this.currentUrl, title: "Example Search", document_id: this.documentId },
      outline: this.snapshotOutline ?? [
        '- textbox "Query"',
        '- button "Submit"',
        '- region "Results"',
      ].join("\n"),
      refs: [
        {
          ref: "p41:0",
          role: "textbox",
          name: "Query",
          value: "",
          states: { focused: true },
          actions: ["type"],
          frame: "main",
          visibility: "in_viewport",
        },
        {
          ref: "p41:1",
          role: "link",
          name: "Submit",
          value: null,
          url: this.resultUrl,
          states: {},
          actions: ["click", "pointer"],
          frame: "main",
          visibility: "in_viewport",
        },
        {
          ref: "p41:2",
          role: "region",
          name: "Document",
          value: null,
          states: {},
          actions: ["scroll"],
          frame: "main",
          visibility: "in_viewport",
        },
        {
          ref: "p41:3",
          role: "generic",
          name: "Document",
          value: null,
          states: {},
          actions: ["scroll"],
          frame: "oopif",
          visibility: "in_viewport",
        },
        {
          ref: "p41:4",
          role: "generic",
          name: "Drop target",
          value: null,
          states: {},
          actions: ["pointer"],
          frame: "main",
          visibility: "in_viewport",
        },
      ],
      content_refs: this.contentRefs,
      oopif: { status: "attached", frames: 0 },
      ...(includeScreenshot ? {
        screenshot: {
          source: "cdp_tab",
          scope: "viewport",
          mime_type: "image/png",
          width: 200,
          height: 240,
          coordinate_space: "viewport_css_px",
          viewport_css_width: 100,
          viewport_css_height: 120,
          pixel_to_css_scale_x: 0.5,
          pixel_to_css_scale_y: 0.5,
        },
        screenshot_png_b64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Xw4AAAAASUVORK5CYII=",
      } : {}),
    };
    this.lastSnapshot = structured;
    return result(structured);
  }
}

describe("OpenSky typed-browser contract", () => {
  it("fences context while input is in flight and after an ambiguous input failure", async () => {
    const { opensky, driver } = await harness();
    const state = await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
    let started!: () => void;
    let rejectInput!: (error: Error) => void;
    const dispatched = new Promise<void>((resolve) => { started = resolve; });
    driver.clickResult = () => { started(); return new Promise((_resolve, reject) => { rejectInput = reject; }); };
    const input = opensky.click({ app: state.targetHandle, element_index: 1 });
    const ambiguous = assert.rejects(input, /ambiguous input/);
    await dispatched;
    const before = driver.calls.length;
    await assert.rejects(() => opensky.get_app_state({ app: state.targetHandle, context_element_index: 1 }), /no intervening input/);
    assert.equal(driver.calls.length, before);
    rejectInput(new Error("ambiguous input"));
    await ambiguous;
    await assert.rejects(() => opensky.get_app_state({ app: state.targetHandle, context_element_index: 1 }), /no intervening input/);
    assert.equal(driver.calls.length, before);
  });

  it("rejects a context/input race in either completion order", async () => {
    for (const inputFirst of [true, false]) {
      const { opensky, driver } = await harness();
      const state = await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
      let contextStarted!: () => void;
      let inputStarted!: () => void;
      let releaseContext!: (value: DriverResult) => void;
      let releaseInput!: (value: DriverResult) => void;
      const contextDispatched = new Promise<void>((resolve) => { contextStarted = resolve; });
      const inputDispatched = new Promise<void>((resolve) => { inputStarted = resolve; });
      driver.contextResult = () => { contextStarted(); return new Promise((resolve) => { releaseContext = resolve; }); };
      driver.clickResult = () => { inputStarted(); return new Promise((resolve) => { releaseInput = resolve; }); };
      const pending = opensky.get_app_state({ app: state.targetHandle, context_element_index: 1 });
      const refused = assert.rejects(pending, /could not prove same-snapshot context/);
      await contextDispatched;
      const input = opensky.click({ app: state.targetHandle, element_index: 1 });
      await inputDispatched;
      if (inputFirst) { releaseInput(result({ status: "ok" })); await input; }
      releaseContext(contextFixture(driver, "p41:1"));
      await refused;
      if (!inputFirst) { releaseInput(result({ status: "ok" })); await input; }
    }
  });

  it("invalidates unreturned context indices when session persistence fails", async () => {
    const { opensky, driver } = await harness();
    const state = await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
    driver.contextResult = (args) => contextFixture(driver, String(args.context_ref));
    const store = Reflect.get(opensky, "store") as { save: (...args: unknown[]) => Promise<void> };
    const originalSave = store.save;
    store.save = async () => { throw new Error("injected persistence failure"); };
    await assert.rejects(() => opensky.get_app_state({ app: state.targetHandle, context_element_index: 1 }), /persistence failure/);
    store.save = originalSave;
    const before = driver.calls.length;
    for (const index of [1, 5, 6]) {
      await assert.rejects(() => opensky.get_app_state({ app: state.targetHandle, context_element_index: index }), /current browser snapshot/);
    }
    assert.equal(driver.calls.length, before);
  });

  it("requires response-local navigation refs and a stable stored ordering domain", async () => {
    for (const missingGroup of [true, false]) {
      const { opensky, driver } = await harness();
      const state = await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
      driver.contextResult = (args) => contextFixture(driver, String(args.context_ref));
      await opensky.get_app_state({ app: state.targetHandle, context_element_index: 1 });
      driver.contextResult = (args) => {
        const response = contextFixture(driver, String(args.context_ref));
        const value = response.structured as Record<string, any>;
        if (missingGroup) value.content_refs = [];
        else value.context.order_domain = "different-domain";
        return response;
      };
      await assert.rejects(() => opensky.get_app_state({ app: state.targetHandle, context_element_index: 1 }), /could not prove same-snapshot context/);
    }
  });

  it("reads same-snapshot context in one exact call and preserves existing action indices", async () => {
    const { opensky, driver } = await harness();
    driver.contentRefs = [{ ref: "p41:9", role: "heading", name: "Repeated", actions: [], frame: "main" }];
    const state = await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
    assert.match(state.text, /\[5\] heading "Repeated"/);
    driver.contextResult = (args) => contextFixture(driver, String(args.context_ref));
    const before = driver.calls.length;
    const context = await opensky.get_app_state({ app: state.targetHandle, context_element_index: 1 });
    assert.equal(driver.calls.length, before + 1, "no settling, re-collection, native inventory, or screenshot calls");
    assert.deepEqual(driver.calls.at(-1), {
      tool: "get_browser_state",
      args: { session: driver.calls.find((call) => call.tool === "browser_prepare")!.args.session,
        target_id: TARGET_ID, tab_id: TAB_ID, snapshot_format: "semantic_v2", include_screenshot: false, context_ref: "p41:1" },
    });
    assert.equal(context.target?.document.freshness, "stored");
    assert.equal(context.screenshot, null);
    assert.match(context.text, /Same-snapshot context \(not a new page capture\)/);
    assert.match(context.text, /Group \[6\]; enclosing group \[7\]/);
    assert.match(context.text, /\[1\] link "Submit"/);
    assert.doesNotMatch(context.text, /p41:/);
    await opensky.get_app_state({ app: state.targetHandle, context_element_index: 7 });
    assert.equal(driver.calls.at(-1)!.args.context_ref, "p41:11");
    await opensky.click({ app: state.targetHandle, element_index: 1 });
    assert.equal(driver.calls.at(-1)!.args.ref, "p41:1");
  });

  it("keeps read-only content addressable without granting any input route", async () => {
    const { opensky, driver } = await harness();
    driver.contentRefs = [{ ref: "p41:9", role: "link", name: "Submit", actions: ["click", "type", "pointer", "scroll"], frame: "main" }];
    const state = await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
    assert.match(state.text, /Context anchors \(read-only/);
    const before = driver.calls.length;
    for (const operation of [
      () => opensky.click({ app: state.targetHandle, element_index: 5 }),
      () => opensky.set_value({ app: state.targetHandle, element_index: 5, value: "x" }),
      () => opensky.scroll({ app: state.targetHandle, element_index: 5, direction: "down" }),
      () => opensky.perform_secondary_action({ app: state.targetHandle, element_index: 5, action: "show menu" }),
      () => opensky.press_key({ app: state.targetHandle, element_index: 5, key: "ENTER" }),
    ]) await assert.rejects(operation, /does not support/);
    assert.equal(driver.calls.length, before);
    driver.contextResult = (args) => contextFixture(driver, String(args.context_ref));
    await opensky.get_app_state({ app: state.targetHandle, context_element_index: 5 });
    assert.equal(driver.calls.at(-1)!.args.context_ref, "p41:9");
  });

  it("rejects invalid, native, unknown, and post-input context before dispatch", async () => {
    const { opensky, driver } = await harness();
    const state = await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
    const before = driver.calls.length;
    for (const args of [
      { app: "Calculator", context_element_index: 1 },
      { app: state.targetHandle, context_element_index: 99 },
      { app: state.targetHandle, context_element_index: -1 },
      { app: state.targetHandle, context_element_index: 1.5 },
      { app: state.targetHandle, context_element_index: NaN },
      { app: state.targetHandle, context_element_index: 1, query: "x" },
      { app: state.targetHandle, context_element_index: 1, includeScreenshot: true },
      { app: state.targetHandle, context_element_index: 1, includeAppChrome: true },
    ]) await assert.rejects(() => opensky.get_app_state(args));
    assert.equal(driver.calls.length, before);
    await opensky.click({ app: state.targetHandle, element_index: 1 });
    const afterInput = driver.calls.length;
    await assert.rejects(() => opensky.get_app_state({ app: state.targetHandle, context_element_index: 1 }), /no intervening input/);
    assert.equal(driver.calls.length, afterInput);
  });

  it("fails closed if an older helper ignores context and invalidates the old capabilities", async () => {
    const { opensky, driver } = await harness();
    const state = await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
    await assert.rejects(() => opensky.get_app_state({ app: state.targetHandle, context_element_index: 1 }), /could not prove same-snapshot context/);
    const before = driver.calls.length;
    await assert.rejects(() => opensky.click({ app: state.targetHandle, element_index: 1 }), /latest semantic browser snapshot/);
    assert.equal(driver.calls.length, before);
  });

  it("does not diff a new page capture against a historical context window", async () => {
    const { opensky, driver } = await harness();
    const state = await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
    driver.contextResult = (args) => contextFixture(driver, String(args.context_ref));
    await opensky.get_app_state({ app: state.targetHandle, context_element_index: 1 });
    const fresh = await opensky.get_app_state({ app: state.targetHandle, includeScreenshot: false });
    assert.match(fresh.text, /^Browser page:/);
    assert.doesNotMatch(fresh.text, /Same-snapshot context|Removed|Added/);
    assert.equal(fresh.target?.document.freshness, "current");
  });

  it("rejects malformed, foreign, conflicting, or authority-expanding context responses", async () => {
    const corruptions: Array<(value: Record<string, any>) => void> = [
      (value) => { value.snapshot.id = "p42"; },
      (value) => { value.tab_id = "foreign"; },
      (value) => { value.context.anchor_ref = "p41:99"; },
      (value) => { value.context.group_ref = "p42:1"; },
      (value) => { value.context.parent_group_ref = "p41:999"; },
      (value) => { value.context.before_omitted = -1; },
      (value) => { value.context.group_complete = true; value.snapshot.complete = true; },
      (value) => { value.content_refs[0].ref = "p42:0"; },
      (value) => { value.content_refs.push(value.content_refs[0]); },
      (value) => { value.refs[0].name = "Different target"; },
      (value) => { value.refs.push({ ...value.refs[0], ref: "p41:999" }); },
      (value) => { value.refs = []; },
      (value) => { value.content_refs[0].frame = "oopif"; },
      (value) => { delete value.content_refs[0].frame; },
    ];
    for (const corrupt of corruptions) {
      const { opensky, driver } = await harness();
      const state = await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
      driver.contextResult = (args) => {
        const response = contextFixture(driver, String(args.context_ref));
        corrupt(response.structured as Record<string, any>);
        return response;
      };
      await assert.rejects(() => opensky.get_app_state({ app: state.targetHandle, context_element_index: 1 }));
      const before = driver.calls.length;
      await assert.rejects(() => opensky.click({ app: state.targetHandle, element_index: 1 }));
      assert.equal(driver.calls.length, before);
    }
  });

  it("does not overwrite a newer observation when a context request finishes late", async () => {
    const { opensky, driver } = await harness();
    const state = await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
    let release!: (value: DriverResult) => void;
    let started!: () => void;
    const dispatched = new Promise<void>((resolve) => { started = resolve; });
    const response = contextFixture(driver, "p41:1");
    driver.contextResult = () => { started(); return new Promise((resolve) => { release = resolve; }); };
    const pending = opensky.get_app_state({ app: state.targetHandle, context_element_index: 1 });
    const refused = assert.rejects(pending, /could not prove same-snapshot context/);
    await dispatched;
    await opensky.get_app_state({ app: state.targetHandle, includeScreenshot: false });
    release(response);
    await refused;
    await opensky.click({ app: state.targetHandle, element_index: 1 });
    assert.equal(driver.calls.at(-1)!.args.ref, "p41:1");
  });

  it("fails closed on an ambiguous typed preparation result", async () => {
    const { opensky, driver } = await harness();
    driver.ambiguousPrepare = true;

    await assert.rejects(
      () => opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false }),
      /No legacy browser fallback was attempted/,
    );
    assert.equal(driver.calls.some((call) => call.tool === "launch_app"), false);
    const prepare = driver.calls.find((call) => call.tool === "browser_prepare");
    assert.deepEqual(driver.calls.find((call) => call.tool === "end_session")?.args, {
      session: prepare?.args.session,
    });
  });

  it("opens a Chrome URL through an isolated exact binding and semantic_v2 snapshot", async () => {
    const { opensky, driver } = await harness();

    const state = await opensky.open_target({
      app: "Google Chrome",
      targets: [URL],
      includeScreenshot: false,
    });

    const tools = driver.calls.map((call) => call.tool);
    assertOrderedSubsequence(tools, [
      "list_apps",
      "browser_prepare",
      "list_windows",
      "get_browser_state",
      "browser_navigate",
      "get_browser_state",
    ]);
    assert.equal(tools.includes("launch_app"), false);
    assert.equal(tools.includes("get_window_state"), false);
    assert.equal(
      tools.filter((tool) => tool === "list_windows").length,
      1,
      "the semantic target/tab snapshot makes a post-navigation native window refresh redundant",
    );
    const prepare = driver.calls.find((call) => call.tool === "browser_prepare");
    const browserSession = String(prepare?.args.session);
    assert.match(browserSession, new RegExp(`^${SESSION}-browser-`));
    assert.deepEqual(driver.calls[1]?.args, {
      session: browserSession,
      allow_launch: true,
      profile: { mode: "isolated_new" },
    });
    const listedWindows = driver.calls.find((call) => call.tool === "list_windows");
    assert.deepEqual(listedWindows?.args, { session: browserSession, pid: PID });
    const bind = driver.calls.find((call) =>
      call.tool === "get_browser_state" && call.args.pid === PID
    );
    assert.deepEqual(bind?.args, {
      session: browserSession,
      pid: PID,
      window_id: WINDOW_ID,
    });
    const navigate = driver.calls.find((call) => call.tool === "browser_navigate");
    assert.deepEqual(navigate?.args, {
      session: browserSession,
      target_id: TARGET_ID,
      tab_id: TAB_ID,
      url: URL,
    });
    const snapshot = driver.calls.find((call) =>
      call.tool === "get_browser_state" && call.args.target_id === TARGET_ID
    );
    assert.deepEqual(snapshot?.args, {
      session: browserSession,
      target_id: TARGET_ID,
      tab_id: TAB_ID,
      snapshot_format: "semantic_v2",
      include_screenshot: false,
    });
    assert.match(state.text, /\[0\].*Query/);
    assert.match(state.text, /\[1\].*Submit/);
    assert.match(state.text, /\[1\].*url="https:\/\/example\.com\/results"/);
    assert.doesNotMatch(state.text, /visibility=in_viewport/);
    assert.equal((state.target?.tab as { status?: string } | undefined)?.status, "verified");
    assert.equal(state.target?.document.url, URL);
    assert.equal(state.target?.document.requestRelation, "exact");
  });

  it("keeps later controls addressable when a preceding destination URL is very long", async () => {
    const { opensky, driver } = await harness();
    driver.resultUrl = `https://example.com/results?signature=${"x".repeat(10_000)}`;
    const state = await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
    assert.match(state.text, /\[1\].*Submit.*urlPreview="https:\/\/example.com\/results\?signature=x+…"/);
    assert.match(state.text, /\[2\].*Document.*actions=\[scroll\]/);
    assert.ok(state.text.length < 2_000);
    await opensky.click({ app: state.targetHandle, element_index: 1 });
    const action = driver.calls.find((call) => call.tool === "browser_click");
    assert.ok(action, "preview never replaces the opaque driver action route");
    assert.equal(JSON.stringify(action).includes("urlPreview"), false);
    assert.equal(JSON.stringify(action).includes("p41:1"), true);
    await opensky.close();
  });

  it("opens an exact blank tab for the current browser.tabs.new lifecycle", async () => {
    const { opensky, driver } = await harness();

    const state = await opensky.open_target({
      app: "Google Chrome",
      targets: ["about:blank"],
      includeScreenshot: false,
      sessionName: " blank probe ",
    });

    assert.equal(state.target?.tab?.status, "verified");
    assert.equal(state.target?.tab?.url, "about:blank");
    assert.equal(driver.calls.some((call) => call.tool === "launch_app"), false);
    assert.equal(driver.calls.some((call) => call.tool === "browser_navigate"), false, "the prepared exact tab is already blank");
    assert.match(String(driver.calls.find((call) => call.tool === "browser_prepare")?.args.session), /-browser-blank-probe-/);
  });

  it("rejects browser-internal open targets other than exact about:blank", async () => {
    const { opensky, driver } = await harness();

    await assert.rejects(
      () => opensky.open_target({ app: "Google Chrome", targets: ["about:settings"], includeScreenshot: false }),
      /only about:blank/,
    );
    assert.equal(driver.calls.some((call) => call.tool === "browser_prepare" || call.tool === "launch_app"), false);
  });

  it("composes a semantic query into the initial exact-browser observation", async () => {
    const { opensky, driver } = await harness();

    const state = await opensky.open_target({
      app: "Google Chrome",
      targets: [URL],
      includeScreenshot: false,
      query: "Releases",
    });

    const snapshot = driver.calls.findLast((call) =>
      call.tool === "get_browser_state" && call.args.target_id === TARGET_ID
    );
    assert.equal(snapshot?.args.query, "Releases");
    assert.match(state.text, /^Semantic query "Releases"; fresh accessibility state:/);
    assert.equal(driver.calls.some((call) => call.tool === "launch_app"), false);
  });

  it("navigates the exact typed tab and returns its settled queried destination", async () => {
    const { opensky, driver } = await harness();
    await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
    const destination = "https://example.com/results";
    const before = driver.calls.length;

    const state = await opensky.navigate({
      app: "Google Chrome",
      url: destination,
      includeScreenshot: false,
      query: "Results",
    });

    assert.deepEqual(driver.calls.slice(before).map((call) => call.tool), [
      "browser_navigate",
      "get_browser_state",
    ]);
    assert.deepEqual(driver.calls[before]?.args, {
      session: driver.calls.find((call) => call.tool === "browser_prepare")?.args.session,
      target_id: TARGET_ID,
      tab_id: TAB_ID,
      url: destination,
    });
    assert.equal(driver.calls.at(-1)?.args.query, "Results");
    assert.match(state.text, /^Semantic query "Results"; fresh accessibility state:/);
    assert.deepEqual(state.target?.requested, [destination]);
    assert.equal(state.target?.document.url, destination);
    assert.equal(state.target?.document.requestRelation, "exact");
  });

  it("routes back, forward, and reload to the exact tab and observes each result", async () => {
    const { opensky, driver } = await harness();
    const opened = await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
    const browserSession = driver.calls.find((call) => call.tool === "browser_prepare")?.args.session;

    for (const action of ["back", "forward", "reload"] as const) {
      const before = driver.calls.length;
      const state = await opensky.navigate({ app: opened.targetHandle, action, includeScreenshot: false });
      assert.deepEqual(driver.calls.slice(before).map((call) => call.tool), [
        "browser_navigate", "get_browser_state",
      ]);
      assert.deepEqual(driver.calls[before]?.args, {
        session: browserSession, target_id: TARGET_ID, tab_id: TAB_ID, action,
      });
      assert.equal(state.target?.requested[0], URL, "history/reload must not invent a requested URL");
    }
  });

  it("rejects invalid navigation shapes before any driver call", async () => {
    const { opensky, driver } = await harness();
    await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
    const before = driver.calls.length;

    await assert.rejects(
      () => opensky.navigate({ app: "Google Chrome", url: URL, action: "back" } as never),
      /exactly one of url or action/,
    );
    await assert.rejects(
      () => opensky.navigate({ app: "Google Chrome" } as never),
      /exactly one of url or action/,
    );
    await assert.rejects(
      () => opensky.navigate({ app: "Google Chrome", action: "sideways" } as never),
      /back, forward, or reload/,
    );
    assert.equal(driver.calls.length, before);
  });

  it("warns that acknowledged navigation may have completed when observation fails", async () => {
    const { opensky, driver } = await harness();
    await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
    driver.failNextSnapshot = true;

    await assert.rejects(
      () => opensky.navigate({ app: "Google Chrome", action: "reload", includeScreenshot: false }),
      /navigation completed.*observation failed.*may have completed.*observe before.*retry/i,
    );
    assert.equal(driver.calls.at(-2)?.tool, "browser_navigate");
    assert.equal(driver.calls.at(-1)?.tool, "get_browser_state");
  });

  it("refuses navigation without an exact owned binding before any driver call", async () => {
    const { opensky, driver } = await harness();

    await assert.rejects(
      () => opensky.navigate({ app: "Calculator", url: "https://example.com/" }),
      /navigate requires an exact driver-owned typed browser binding.*No app was launched/s,
    );
    assert.equal(driver.calls.length, 0);
  });

  it("rejects unsafe navigation URLs before touching an exact binding", async () => {
    const { opensky, driver } = await harness();
    await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
    const before = driver.calls.length;

    await assert.rejects(
      () => opensky.navigate({ app: "Google Chrome", url: "javascript:alert(1)" }),
      /http\/https\/about URL/,
    );
    assert.equal(driver.calls.length, before);
  });

  it("rejects an initial query for a non-browser target before mutation", async () => {
    const { opensky, driver } = await harness();

    await assert.rejects(
      () => opensky.open_target({
        app: "Calculator",
        targets: ["https://example.com/"],
        query: "Releases",
      }),
      /query requires.*exact typed Chromium binding/,
    );
    assert.equal(driver.calls.some((call) => call.tool === "launch_app"), false);
    assert.equal(driver.calls.some((call) => call.tool === "browser_prepare"), false);
  });

  it("rechecks semantic browser state after input until it is stable", async () => {
    const { opensky, driver } = await harness({ browserStabilityTimeoutMs: 20 });

    await opensky.open_target({
      app: "Google Chrome",
      targets: [URL],
      includeScreenshot: false,
    });

    const snapshots = driver.calls.filter((call) =>
      call.tool === "get_browser_state" && call.args.target_id === TARGET_ID
    );
    assert.equal(snapshots.length, 2, "one internal recheck confirms semantic stability");
    assert.equal(snapshots.every((call) => call.args.include_screenshot === false), true);
  });

  it("retries only the exact read after a navigation-invalidated AX frame", async () => {
    const { opensky, driver } = await harness({ degradedRetryMs: 1_000 });
    const target = await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
    const before = driver.calls.length;
    await opensky.press_key({ app: target.targetHandle, key: "Return" });
    driver.snapshotErrors = [new Error("Accessibility.getFullAXTree failed: CDP Accessibility.getFullAXTree failed (-32602): Frame with the given frameId is not found.")];
    const observed = await opensky.get_app_state({ app: target.targetHandle, query: "Query", includeScreenshot: false });
    assert.match(observed.text, /Query/);
    const calls = driver.calls.slice(before);
    assert.equal(calls.filter((call) => call.tool === "browser_key").length, 1);
    const reads = calls.filter((call) => call.tool === "get_browser_state");
    assert.equal(reads.length, 2);
    assert.deepEqual(reads[0]?.args, reads[1]?.args);
    assert.deepEqual({ target: reads[1]?.args.target_id, tab: reads[1]?.args.tab_id, query: reads[1]?.args.query }, { target: TARGET_ID, tab: TAB_ID, query: "Query" });
    assert.equal(calls.some((call) => ["browser_prepare", "browser_navigate", "launch_app"].includes(call.tool)), false);
    await opensky.close();
  });

  it("bounds transient browser snapshot retries and retains the original exact target", async () => {
    const { opensky, driver } = await harness({ degradedRetryMs: 1_000 });
    const target = await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
    const before = driver.calls.length;
    driver.snapshotErrors = Array.from({ length: 4 }, () => new Error("CDP Accessibility.getFullAXTree failed (-32602): Frame with the given frameId is not found"));
    await assert.rejects(opensky.get_app_state({ app: target.targetHandle, includeScreenshot: false }), { code: "browser_snapshot_transient_exhausted" });
    const reads = driver.calls.slice(before);
    assert.equal(reads.length, 3);
    assert.ok(reads.every((call) => call.tool === "get_browser_state"));
    assert.ok(reads.every((call) => JSON.stringify(call.args) === JSON.stringify(reads[0]?.args)));
    driver.snapshotErrors = [];
    assert.equal((await opensky.get_app_state({ app: target.targetHandle, includeScreenshot: false })).targetHandle, target.targetHandle);
    await opensky.close();
  });

  it("does not retry unrelated snapshot errors or retry when the budget is disabled", async () => {
    for (const [degradedRetryMs, message] of [
      [1_000, "CDP Accessibility.getFullAXTree failed: permission denied"],
      [1_000, "CDP Page.navigate failed: Frame with the given frameId is not found"],
      [0, "CDP Accessibility.getFullAXTree failed: Frame with the given frameId is not found"],
    ] as const) {
      const { opensky, driver } = await harness({ degradedRetryMs });
      const target = await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
      const error = new Error(message);
      driver.snapshotErrors = [error];
      const before = driver.calls.length;
      await assert.rejects(opensky.get_app_state({ app: target.targetHandle, includeScreenshot: false }), (actual) => {
        if (degradedRetryMs > 0) assert.equal(actual, error);
        else assert.equal((actual as {code:string}).code, "browser_snapshot_transient_exhausted");
        return true;
      });
      assert.equal(driver.calls.length - before, 1);
      await opensky.close();
    }
  });

  it("exposes driver semantic query results as fresh addressable browser state", async () => {
    const { opensky, driver } = await harness();
    await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });

    const state = await opensky.get_app_state({
      app: "Google Chrome",
      query: "Releases",
      includeScreenshot: false,
    });

    const queried = driver.calls.findLast((call) => call.tool === "get_browser_state");
    assert.equal(queried?.args.query, "Releases");
    assert.match(state.text, /^Semantic query "Releases"; fresh accessibility state:/);
    assert.match(state.text, /\[1\].*Submit/);
    assert.match(state.text, /Filtered semantic query view is complete for matching nodes/);
    assert.match(state.text, /Surrounding labels and page-wide order may be omitted/);
    assert.doesNotMatch(state.text, /Semantic state is complete/);
    const unfiltered = await opensky.get_app_state({ app: state.targetHandle, disableDiff: true, includeScreenshot: false });
    assert.doesNotMatch(unfiltered.text, /Filtered semantic query/);
    assert.match(unfiltered.text, /Driver semantic collection is complete/);
    assert.equal(driver.calls.at(-1)?.args.query, undefined);
    const beforeRefusal = driver.calls.length;
    await assert.rejects(
      () => opensky.get_app_state({ app: "Calculator", query: "Releases" }),
      /query requires.*exact typed browser binding/,
    );
    assert.equal(driver.calls.length, beforeRefusal, "an unsupported query must not resolve or launch an app");
  });

  it("reports partial query counts as matching nodes, not page-wide coverage", async () => {
    const { opensky, driver } = await harness();
    driver.snapshotComplete = false;
    const state = await opensky.open_target({
      app: "Google Chrome", targets: [URL], includeScreenshot: false, query: "Submit",
    });
    assert.match(state.text, /Filtered semantic query view is partial \(5\/5 matching nodes\)/);
    assert.match(state.text, /ancestor paths are not a complete list of siblings/);
    assert.doesNotMatch(state.text, /Semantic state is (complete|partial)/);
    await opensky.close();
  });

  it("maps public numeric indices back to exact typed browser refs", async () => {
    const { opensky, driver } = await harness();
    await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });

    await opensky.type_text({ app: "Google Chrome", element_index: 0, text: "vertical mouse" });
    await opensky.click({ app: "Google Chrome", element_index: 1 });

    const browserSession = String(
      driver.calls.find((call) => call.tool === "browser_prepare")?.args.session,
    );
    const type = driver.calls.findLast((call) => call.tool === "browser_type");
    assert.deepEqual(type?.args, {
      session: browserSession,
      target_id: TARGET_ID,
      tab_id: TAB_ID,
      ref: "p41:0",
      text: "vertical mouse",
    });
    const click = driver.calls.findLast((call) => call.tool === "browser_click");
    assert.deepEqual(click?.args, {
      session: browserSession,
      target_id: TARGET_ID,
      tab_id: TAB_ID,
      ref: "p41:1",
      input_route: "dom_event",
    });
  });

  it("routes exact-tab keys with optional semantic focus and never uses native input", async () => {
    const { opensky, driver } = await harness();
    await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
    const browserSession = driver.calls.find((call) => call.tool === "browser_prepare")?.args.session;

    await opensky.press_key({ app: "Google Chrome", key: "Return" });
    await opensky.press_key({ app: "Google Chrome", key: "ctrl+a", element_index: 0 });

    assert.deepEqual(driver.calls.filter((call) => call.tool === "browser_key").map((call) => call.args), [
      { session: browserSession, target_id: TARGET_ID, tab_id: TAB_ID, key: "Return" },
      { session: browserSession, target_id: TARGET_ID, tab_id: TAB_ID, key: "ctrl+a", ref: "p41:0" },
    ]);
    assert.equal(driver.calls.some((call) => call.tool === "press_key" || call.tool === "hotkey"), false);
    const before = driver.calls.length;
    await assert.rejects(
      () => opensky.press_key({ app: "Google Chrome", key: "Return", x: 4, y: 5 }),
      /coordinate press_key.*No native foreground or coordinate input was sent/s,
    );
    await assert.rejects(
      () => opensky.press_key({ app: "Google Chrome", key: "Return", element_index: 1 }),
      /does not support browser action "type"/,
    );
    assert.equal(driver.calls.length, before);
  });

  it("routes semantic browser drag by exact refs", async () => {
    const { opensky, driver } = await harness();
    await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
    const browserSession = driver.calls.find((call) => call.tool === "browser_prepare")?.args.session;

    await opensky.drag({ app: "Google Chrome", from_element_index: 1, to_element_index: 4 });

    assert.deepEqual(driver.calls.findLast((call) => call.tool === "browser_pointer")?.args, {
      session: browserSession,
      target_id: TARGET_ID,
      tab_id: TAB_ID,
      action: "drag",
      ref: "p41:1",
      destination_ref: "p41:4",
      input_route: "dom_event",
    });
  });

  it("converts fresh browser screenshot pixels to viewport CSS for trusted drag", async () => {
    const { opensky, driver } = await harness();
    await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: true });
    const browserSession = driver.calls.find((call) => call.tool === "browser_prepare")?.args.session;

    await opensky.drag({ app: "Google Chrome", from_x: 20, from_y: 40, to_x: 100, to_y: 120 });

    assert.deepEqual(driver.calls.findLast((call) => call.tool === "browser_pointer")?.args, {
      session: browserSession,
      target_id: TARGET_ID,
      tab_id: TAB_ID,
      action: "drag",
      input_route: "trusted",
      x: 10,
      y: 20,
      to_x: 50,
      to_y: 60,
    });
  });

  it("converts fresh browser screenshot pixels for trusted click and scroll", async () => {
    const { opensky, driver } = await harness();
    await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: true });
    const browserSession = driver.calls.find((call) => call.tool === "browser_prepare")?.args.session;

    await opensky.click({ app: "Google Chrome", x: 20, y: 40 });
    assert.deepEqual(driver.calls.findLast((call) => call.tool === "browser_click")?.args, {
      session: browserSession,
      target_id: TARGET_ID,
      tab_id: TAB_ID,
      input_route: "trusted",
      x: 10,
      y: 20,
    });

    await opensky.get_app_state({ app: "Google Chrome", includeScreenshot: true });
    await opensky.scroll({ app: "Google Chrome", x: 100, y: 120, direction: "down", pages: 2 });
    assert.deepEqual(driver.calls.findLast((call) => call.tool === "browser_pointer")?.args, {
      session: browserSession,
      target_id: TARGET_ID,
      tab_id: TAB_ID,
      input_route: "trusted",
      action: "scroll",
      x: 50,
      y: 60,
      delta_x: 0,
      delta_y: 1_200,
    });
    assert.equal(driver.calls.some((call) => call.tool === "click" || call.tool === "scroll"), false);
  });

  it("refuses browser coordinate drag without current screenshot coordinate proof", async () => {
    const { opensky, driver } = await harness();
    await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
    const before = driver.calls.length;

    await assert.rejects(
      () => opensky.drag({ app: "Google Chrome", from_x: 1, from_y: 2, to_x: 3, to_y: 4 }),
      /fresh exact-tab screenshot.*No native foreground or coordinate input was sent/s,
    );
    assert.equal(driver.calls.length, before);
  });

  it("refuses browser coordinates outside the proven screenshot", async () => {
    const { opensky, driver } = await harness();
    await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: true });
    const before = driver.calls.length;

    await assert.rejects(
      () => opensky.drag({ app: "Google Chrome", from_x: 1, from_y: 2, to_x: 201, to_y: 4 }),
      /coordinates must be inside the latest exact-tab screenshot/,
    );
    await assert.rejects(
      () => opensky.click({ app: "Google Chrome", x: 201, y: 4 }),
      /coordinates must be inside the latest exact-tab screenshot/,
    );
    assert.equal(driver.calls.length, before);
  });

  it("keeps every unsupported browser action fail-closed on the exact tab boundary", async () => {
    const { opensky, driver } = await harness();
    await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
    const before = driver.calls.length;

    await assert.rejects(() => opensky.click({ app: "Google Chrome", x: 10, y: 20 }), /No native foreground or coordinate input was sent/);
    await assert.rejects(() => opensky.paste({ app: "Google Chrome", text: "unsafe" }), /safe paste requires.*No clipboard.*was touched/s);
    await assert.rejects(() => opensky.type_text({ app: "Google Chrome", x: 5, y: 6, text: "unsafe" }), /No native foreground or coordinate input was sent/);
    await assert.rejects(() => opensky.scroll({ app: "Google Chrome", x: 20, y: 30, direction: "up" }), /No native foreground or coordinate input was sent/);
    await assert.rejects(() => opensky.bring_to_front({ app: "Google Chrome" }), /No native foreground or coordinate input was sent/);
    await assert.rejects(() => opensky.get_app_state({ app: "Google Chrome", includeAppChrome: true }), /includeAppChrome is not available/);

    assert.equal(driver.calls.length, before, "no native fallback call should escape the typed browser boundary");
  });

  it("routes ambient focused typing, page scroll, right-click, and double-click through typed APIs", async () => {
    const { opensky, driver } = await harness();
    await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });

    await opensky.type_text({ app: "Google Chrome", text: "focused text" });
    await opensky.scroll({ app: "Google Chrome", direction: "down", pages: 2 });
    await opensky.click({ app: "Google Chrome", element_index: 1, mouse_button: "right" });
    await opensky.click({ app: "Google Chrome", element_index: 1, click_count: 2 });
    await assert.rejects(
      () => opensky.click({ app: "Google Chrome", element_index: 1, mouse_button: "middle" }),
      /not safely available/,
    );

    const browserType = driver.calls.findLast((call) => call.tool === "browser_type");
    assert.equal(browserType?.args.ref, "p41:0");
    const pointers = driver.calls.filter((call) => call.tool === "browser_pointer");
    assert.deepEqual(pointers.map((call) => ({
      ref: call.args.ref,
      action: call.args.action,
      deltaY: call.args.delta_y,
    })), [
      { ref: "p41:2", action: "scroll", deltaY: 1_200 },
      { ref: "p41:1", action: "right_click", deltaY: undefined },
      { ref: "p41:1", action: "double_click", deltaY: undefined },
    ]);
    assert.equal(driver.calls.some((call) => ["type_text", "scroll", "click", "double_click"].includes(call.tool)), false);
  });

  it("resets public indices when document_id changes at the same URL", async () => {
    const { opensky, driver } = await harness();
    await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
    driver.replaceDocument();

    const state = await opensky.get_app_state({ app: "Google Chrome", includeScreenshot: false });

    assert.match(state.text, /^Document changed; fresh accessibility state:/);
    assert.match(state.text, /\[0\] textbox "Query"/);
  });

  it("retains cleanup ownership and surfaces a failed teardown for retry", async () => {
    const { opensky, driver, home } = await harness();
    await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
    driver.failEndSessionCount = 1;

    await assert.rejects(() => opensky.close(), /Failed to end 1 owned driver session/);
    assert.equal((await browserLeaseRecords(home)).length, 1, "a failed end_session must retain its exact lease");
    await opensky.close();
    assert.equal((await browserLeaseRecords(home)).length, 0);

    const ended = driver.calls.filter((call) => call.tool === "end_session");
    assert.equal(ended.length, 3, "the failed browser session is retried while the base session is not ended twice");
  });

  for (const [label, receipt] of [
    ["missing", (_session: string) => undefined],
    ["status-only", (_session: string) => ({ status: "ok" })],
    ["mismatched", (_session: string) => ({ session: "another-session", active: false })],
    ["still-active", (session: string) => ({ session, active: true })],
  ] as const) {
    it(`retains exact close authority after a ${label} end-session receipt`, async () => {
      const { opensky, driver, home } = await harness();
      const target = await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
      const session = String(driver.calls.find((call) => call.tool === "browser_prepare")?.args.session);
      driver.endSessionReceipt = receipt;
      await assert.rejects(opensky.close_target({ app: target.targetHandle }), { code: "session_end_unconfirmed" });
      assert.deepEqual((await browserLeaseRecords(home)).map((lease) => lease.session), [session]);
      driver.endSessionReceipt = undefined;
      await opensky.close_target({ app: target.targetHandle });
      assert.equal((await browserLeaseRecords(home)).length, 0);
      assert.deepEqual(driver.calls.filter((call) => call.tool === "end_session").map((call) => call.args.session), [session, session]);
      const before = driver.calls.length;
      await assert.rejects(opensky.close_target({ app: target.targetHandle }), /No driver-owned exact target/);
      assert.equal(driver.calls.length, before);
      await opensky.close();
    });

    it(`retries base and managed cleanup after a ${label} end-session receipt`, async () => {
      const { opensky, driver, home } = await harness();
      await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
      driver.endSessionReceipt = receipt;
      await assert.rejects(opensky.close(), { code: "session_end_unconfirmed" });
      assert.equal((await browserLeaseRecords(home)).length, 1);
      const firstAttempt = driver.calls.filter((call) => call.tool === "end_session").map((call) => call.args.session);
      assert.equal(firstAttempt.length, 2);
      driver.endSessionReceipt = undefined;
      await opensky.close();
      assert.equal((await browserLeaseRecords(home)).length, 0);
      assert.deepEqual(driver.calls.filter((call) => call.tool === "end_session").map((call) => call.args.session), [...firstAttempt, ...firstAttempt]);
      await opensky.close();
      assert.equal(driver.calls.filter((call) => call.tool === "end_session").length, 4);
    });

    it(`retains rollback ownership after a ${label} end-session receipt`, async () => {
      const { opensky, driver, home } = await harness();
      driver.failBind = true;
      driver.endSessionReceipt = receipt;
      await assert.rejects(opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false }), { code: "session_end_unconfirmed" });
      const [lease] = await browserLeaseRecords(home);
      assert.ok(lease);
      driver.endSessionReceipt = undefined;
      await opensky.close();
      assert.equal((await browserLeaseRecords(home)).length, 0);
      assert.equal(driver.calls.filter((call) => call.tool === "end_session" && call.args.session === lease.session).length, 2);
    });
  }

  it("retains a reclaimed orphan lease until its matching inactive receipt arrives", async () => {
    const { opensky: first, driver, home } = await harness();
    await first.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
    const session = String(driver.calls.find((call) => call.tool === "browser_prepare")?.args.session);
    await markBrowserLeaseOwnerDead(home, session);
    const restarted = createOpenSky({ driver, homeDir: home, session: `${SESSION}-restarted`, target: "mac", settleDelayMs: 0 });
    driver.endSessionReceipt = (requested) => requested === session ? { status: "ok" } : { session: requested, active: false };
    await assert.rejects(restarted.close(), { code: "session_end_unconfirmed" });
    assert.deepEqual((await browserLeaseRecords(home)).map((lease) => lease.session), [session]);
    driver.endSessionReceipt = undefined;
    await restarted.close();
    assert.equal((await browserLeaseRecords(home)).length, 0);
    assert.equal(driver.calls.filter((call) => call.tool === "end_session" && call.args.session === session).length, 2);
    assert.equal(driver.calls.filter((call) => call.tool === "end_session" && call.args.session === `${SESSION}-restarted`).length, 1);
  });

  it("retains a failed setup rollback session so close can retry it", async () => {
    const { opensky, driver } = await harness();
    driver.failBind = true;
    driver.failEndSessionCount = 1;

    await assert.rejects(
      () => opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false }),
      /setup failed.*cleanup.*also failed/i,
    );
    driver.failBind = false;
    await opensky.close();

    const ended = driver.calls.filter((call) => call.tool === "end_session");
    assert.equal(ended.length, 3);
    assert.match(String(ended[0]?.args.session), new RegExp(`^${SESSION}-browser-`));
    assert.equal(ended[0]?.args.session, ended[1]?.args.session);
    assert.equal(ended[2]?.args.session, SESSION);
  });

  it("uses collision-resistant default session ownership per instance", async () => {
    const driver = new TypedBrowserDriver();
    const firstHome = await mkdtemp(join(tmpdir(), "opensky-default-session-a-"));
    const secondHome = await mkdtemp(join(tmpdir(), "opensky-default-session-b-"));
    const first = createOpenSky({ driver, homeDir: firstHome, settleDelayMs: 0, degradedRetryMs: 0 });
    const second = createOpenSky({ driver, homeDir: secondHome, settleDelayMs: 0, degradedRetryMs: 0 });

    await first.close();
    await second.close();

    const sessions = driver.calls.filter((call) => call.tool === "end_session").map((call) => String(call.args.session));
    assert.equal(sessions.length, 2);
    assert.notEqual(sessions[0], sessions[1]);
    assert.match(sessions[0]!, /^opensky-\d+-[0-9a-f]{8}$/);
  });

  it("ends each driver-owned browser session exactly once", async () => {
    const { opensky, driver } = await harness();
    await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
    const browserSession = String(
      driver.calls.find((call) => call.tool === "browser_prepare")?.args.session,
    );

    await opensky.close();
    await opensky.close();

    const ended = driver.calls.filter((call) => call.tool === "end_session");
    assert.equal(ended.length, 2);
    assert.deepEqual(ended.map((call) => call.args.session).sort(), [SESSION, browserSession].sort());
    assert.equal(driver.calls.some((call) => call.tool === "revoke_session"), false);
  });

  it("does not reap a live runtime's browser lease in the same home", async () => {
    const driver = new TypedBrowserDriver();
    const home = await mkdtemp(join(tmpdir(), "opensky-live-owner-"));
    const first = createOpenSky({
      driver,
      homeDir: home,
      session: SESSION,
      target: "mac",
      settleDelayMs: 0,
      degradedRetryMs: 0,
      browserStabilityTimeoutMs: 0,
    });
    await first.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
    const browserSession = String(
      driver.calls.find((call) => call.tool === "browser_prepare")?.args.session,
    );
    const persistedBefore = JSON.parse(await readFile(join(home, "session.json"), "utf8"));
    assert.deepEqual(persistedBefore.managedBrowserSessions, []);
    assert.deepEqual((await browserLeaseRecords(home)).map((lease) => lease.session), [browserSession]);

    const restarted = createOpenSky({
      driver,
      homeDir: home,
      session: `${SESSION}-restarted`,
      target: "mac",
      settleDelayMs: 0,
      degradedRetryMs: 0,
      browserStabilityTimeoutMs: 0,
    });
    await restarted.close();

    const ended = driver.calls.filter((call) => call.tool === "end_session");
    assert.equal(ended.some((call) => call.args.session === browserSession), false);
    assert.deepEqual((await browserLeaseRecords(home)).map((lease) => lease.session), [browserSession]);

    await first.close();
    assert.equal(driver.calls.filter((call) => call.tool === "end_session" && call.args.session === browserSession).length, 1);
    assert.equal((await browserLeaseRecords(home)).length, 0);
  });

  it("reclaims a crash leftover only after its recorded owner pid is absent", async () => {
    const driver = new TypedBrowserDriver();
    const home = await mkdtemp(join(tmpdir(), "opensky-dead-owner-"));
    const first = createOpenSky({
      driver,
      homeDir: home,
      session: SESSION,
      target: "mac",
      settleDelayMs: 0,
      degradedRetryMs: 0,
      browserStabilityTimeoutMs: 0,
    });
    await first.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
    const browserSession = String(driver.calls.find((call) => call.tool === "browser_prepare")?.args.session);
    await markBrowserLeaseOwnerDead(home, browserSession);

    const restarted = createOpenSky({
      driver,
      homeDir: home,
      session: `${SESSION}-restarted`,
      target: "mac",
      settleDelayMs: 0,
      degradedRetryMs: 0,
      browserStabilityTimeoutMs: 0,
    });
    await restarted.close();

    assert.equal(driver.calls.filter((call) => call.tool === "end_session" && call.args.session === browserSession).length, 1);
    assert.equal((await browserLeaseRecords(home)).length, 0);
  });

  it("keeps concurrent same-home browser ownership independent despite session-state lost updates", async () => {
    const driver = new TypedBrowserDriver();
    const home = await mkdtemp(join(tmpdir(), "opensky-concurrent-leases-"));
    const first = createOpenSky({
      driver, homeDir: home, session: SESSION, target: "mac", settleDelayMs: 0,
      degradedRetryMs: 0, browserStabilityTimeoutMs: 0,
    });
    const second = createOpenSky({
      driver, homeDir: home, session: SESSION, target: "mac", settleDelayMs: 0,
      degradedRetryMs: 0, browserStabilityTimeoutMs: 0,
    });

    await Promise.all([
      first.open_target({ app: "Google Chrome", targets: ["https://example.com/one"], includeScreenshot: false }),
      second.open_target({ app: "Google Chrome", targets: ["https://example.com/two"], includeScreenshot: false }),
    ]);
    const browserSessions = driver.calls
      .filter((call) => call.tool === "browser_prepare")
      .map((call) => String(call.args.session));
    const firstSession = String(driver.calls.find((call) =>
      call.tool === "browser_navigate" && call.args.url === "https://example.com/one"
    )?.args.session);
    const secondSession = String(driver.calls.find((call) =>
      call.tool === "browser_navigate" && call.args.url === "https://example.com/two"
    )?.args.session);
    assert.equal(new Set(browserSessions).size, 2);
    assert.deepEqual(
      new Set((await browserLeaseRecords(home)).map((lease) => lease.session)),
      new Set(browserSessions),
      "per-session leases must survive last-writer-wins session.json target persistence",
    );
    const leaseDirectory = join(home, "browser-session-leases");
    const leaseName = (await readdir(leaseDirectory)).find((name) => name.endsWith(".lease"));
    assert.ok(leaseName);
    assert.equal((await stat(leaseDirectory)).mode & 0o777, 0o700);
    assert.equal((await stat(join(leaseDirectory, leaseName, "lease.json"))).mode & 0o777, 0o600);

    await first.close();
    const afterFirst = driver.calls.filter((call) => call.tool === "end_session").map((call) => String(call.args.session));
    assert.equal(afterFirst.includes(firstSession), true);
    assert.equal(afterFirst.includes(secondSession), false);
    assert.deepEqual((await browserLeaseRecords(home)).map((lease) => lease.session), [secondSession]);

    await second.close();
    assert.equal(driver.calls.filter((call) => call.tool === "end_session" && browserSessions.includes(String(call.args.session))).length, 2);
    assert.equal((await browserLeaseRecords(home)).length, 0);
  });

  it("closes one exact owned target without closing user-owned browser state", async () => {
    const { opensky, driver } = await harness();
    await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
    const browserSession = String(
      driver.calls.find((call) => call.tool === "browser_prepare")?.args.session,
    );

    await opensky.close_target({ app: "Google Chrome" });
    await assert.rejects(
      () => opensky.close_target({ app: "Google Chrome" }),
      /No driver-owned exact target.*No user-owned app, window, or tab was closed/,
    );
    await opensky.close();

    const ended = driver.calls.filter((call) => call.tool === "end_session");
    assert.deepEqual(ended.map((call) => call.args.session).sort(), [SESSION, browserSession].sort());
    assert.equal(ended.filter((call) => call.args.session === browserSession).length, 1);
  });

  it("keeps same-app targets independently addressable while shorthand selects the newest", async () => {
    const { opensky, driver } = await harness();
    const first = await opensky.open_target({
      app: "Google Chrome",
      targets: ["https://example.com/first"],
      includeScreenshot: false,
    });
    const firstHandle = first.target?.handle;
    const firstSession = String(driver.calls.filter((call) => call.tool === "browser_prepare")[0]?.args.session);
    assert.match(firstHandle ?? "", /^tgt_[a-f0-9]{20}$/);
    assert.equal(first.targetHandle, firstHandle);

    const second = await opensky.open_target({
      app: firstHandle!,
      targets: ["https://example.com/second"],
      includeScreenshot: false,
    });
    const secondHandle = second.target?.handle;
    const secondSession = String(driver.calls.filter((call) => call.tool === "browser_prepare")[1]?.args.session);
    assert.match(secondHandle ?? "", /^tgt_[a-f0-9]{20}$/);
    assert.equal(second.targetHandle, secondHandle);
    assert.notEqual(firstHandle, secondHandle);
    assert.notEqual(firstSession, secondSession);
    assert.equal(driver.calls.some((call) => call.tool === "end_session"), false);

    await opensky.get_app_state({ app: firstHandle!, includeScreenshot: false });
    assert.equal(driver.calls.filter((call) => call.tool === "get_browser_state").at(-1)?.args.session, firstSession);
    await opensky.click({ app: firstHandle!, element_index: 1 });
    assert.equal(driver.calls.filter((call) => call.tool === "browser_click").at(-1)?.args.session, firstSession);

    await opensky.get_app_state({ app: "Google Chrome", includeScreenshot: false });
    assert.equal(driver.calls.filter((call) => call.tool === "get_browser_state").at(-1)?.args.session, secondSession);

    await opensky.close_target({ app: "Google Chrome" });
    assert.deepEqual(
      driver.calls.filter((call) => call.tool === "end_session").map((call) => call.args.session),
      [secondSession],
    );
    await opensky.click({ app: "Google Chrome", element_index: 1 });
    assert.equal(driver.calls.filter((call) => call.tool === "browser_click").at(-1)?.args.session, firstSession);
    await opensky.get_app_state({ app: "Google Chrome", includeScreenshot: false });
    assert.equal(driver.calls.filter((call) => call.tool === "get_browser_state").at(-1)?.args.session, firstSession);

    await opensky.close_target({ app: firstHandle! });
    assert.deepEqual(
      driver.calls.filter((call) => call.tool === "end_session").map((call) => call.args.session),
      [secondSession, firstSession],
    );
  });

  it("fails unknown and stale reserved handles closed before every driver call", async () => {
    const { opensky, driver } = await harness();
    const opened = await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
    const handle = opened.target!.handle;
    await opensky.close_target({ app: handle });
    const before = driver.calls.length;

    await assert.rejects(() => opensky.get_app_state({ app: handle }), /unknown or stale.*No app was resolved or launched/s);
    await assert.rejects(() => opensky.click({ app: handle, element_index: 1 }), /unknown or stale/);
    await assert.rejects(() => opensky.navigate({ app: "tgt_00000000000000000000", url: URL }), /unknown or stale/);
    await assert.rejects(
      () => opensky.open_target({ app: "tgt_00000000000000000000", targets: [URL] }),
      /unknown or stale/,
    );
    await assert.rejects(() => opensky.close_target({ app: handle }), /No driver-owned exact target/);
    assert.equal(driver.calls.length, before);
  });

  it("retains and quarantines legacy browser aliases with no recoverable ownership", async () => {
    const driver = new TypedBrowserDriver();
    const home = await mkdtemp(join(tmpdir(), "opensky-legacy-targets-"));
    const legacy = {
      apps: {
        "google chrome": legacyBrowserBinding("Google Chrome"),
        "com.google.chrome": legacyBrowserBinding("com.google.Chrome"),
      },
      trees: {},
      managedBrowserSessions: ["legacy-browser-session"],
    };
    await writeFile(join(home, "session.json"), JSON.stringify(legacy));
    const opensky = createOpenSky({
      driver,
      homeDir: home,
      session: SESSION,
      target: "mac",
      settleDelayMs: 0,
      degradedRetryMs: 0,
      browserStabilityTimeoutMs: 0,
    });

    await assert.rejects(
      opensky.get_app_state({ app: "Google Chrome", query: "Submit", includeScreenshot: false }),
      (error: any) => error.code === "target_transport_unavailable",
    );
    assert.equal(driver.calls.length, 0, "unowned aliases must not grant observation or action authority");
    await assert.rejects(opensky.close(), (error: any) => error.code === "browser_cleanup_unresolved");
    const after = JSON.parse(await readFile(join(home, "session.json"), "utf8"));
    assert.deepEqual(after, legacy, "retain the original unresolved evidence, without adopting it");
    assert.deepEqual(after.managedBrowserSessions, ["legacy-browser-session"]);
    assert.equal(driver.calls.some((call) => call.tool === "end_session" && call.args.session === "legacy-browser-session"), false);
  });

  it("migrates and reaps an owner-pid-bearing legacy browser session only after owner death", async () => {
    const driver = new TypedBrowserDriver();
    const home = await mkdtemp(join(tmpdir(), "opensky-legacy-browser-lease-"));
    const deadPid = 2_147_483_646;
    const legacySession = `opensky-old-browser-${deadPid}-1`;
    await writeFile(join(home, "session.json"), JSON.stringify({
      version: 2,
      targets: {},
      aliases: {},
      trees: {},
      managedBrowserSessions: [legacySession],
    }));
    const opensky = createOpenSky({
      driver,
      homeDir: home,
      session: SESSION,
      target: "mac",
      settleDelayMs: 0,
      degradedRetryMs: 0,
    });

    await opensky.close();

    assert.equal(driver.calls.filter((call) => call.tool === "end_session" && call.args.session === legacySession).length, 1);
    assert.equal((await browserLeaseRecords(home)).length, 0);
    const persisted = JSON.parse(await readFile(join(home, "session.json"), "utf8"));
    assert.deepEqual(persisted.managedBrowserSessions, []);
  });
});

async function harness(options: { browserStabilityTimeoutMs?: number; degradedRetryMs?: number } = {}) {
  const driver = new TypedBrowserDriver();
  const home = await mkdtemp(join(tmpdir(), "opensky-typed-browser-"));
  const opensky = createOpenSky({
    driver,
    homeDir: home,
    screenshotDir: join(home, "screenshots"),
    session: SESSION,
    target: "mac",
    settleDelayMs: 0,
    degradedRetryMs: options.degradedRetryMs ?? 0,
    browserStabilityTimeoutMs: options.browserStabilityTimeoutMs ?? 0,
  });
  return { opensky, driver, home };
}

async function browserLeaseRecords(home: string): Promise<Array<{ session: string; owner: { pid: number } }>> {
  const directory = join(home, "browser-session-leases");
  const names = await readdir(directory).catch(() => []);
  const records = await Promise.all(names
    .filter((name) => name.endsWith(".lease"))
    .map(async (name) => JSON.parse(await readFile(join(directory, name, "lease.json"), "utf8"))));
  return records.sort((a, b) => String(a.session).localeCompare(String(b.session)));
}

async function markBrowserLeaseOwnerDead(home: string, session: string): Promise<void> {
  const directory = join(home, "browser-session-leases");
  const names = await readdir(directory);
  const name = names.find((candidate) => candidate.endsWith(".lease"));
  assert.ok(name);
  const source = join(directory, name);
  const recordPath = join(source, "lease.json");
  const record = JSON.parse(await readFile(recordPath, "utf8"));
  assert.equal(record.session, session);
  const deadPid = 2_147_483_646;
  record.owner.pid = deadPid;
  await writeFile(recordPath, JSON.stringify(record));
  const parts = name.split(".");
  assert.equal(parts.length, 4);
  parts[1] = String(deadPid);
  await rename(source, join(directory, parts.join(".")));
}

function ordinaryWindow() {
  return {
    pid: PID,
    window_id: WINDOW_ID,
    title: "Example Search",
    is_main: true,
    is_on_screen: true,
    on_current_space: true,
    frame: { x: 80, y: 60, width: 1_200, height: 800 },
  };
}

function legacyBrowserBinding(query: string) {
  return {
    query,
    name: "Google Chrome",
    bundleId: "com.google.Chrome",
    launchPath: "/Applications/Google Chrome.app",
    pid: PID,
    windowId: WINDOW_ID,
    contentScope: "web",
    browser: {
      session: "legacy-browser-session",
      targetId: TARGET_ID,
      tabId: TAB_ID,
      managed: true,
    },
    targetRequest: {
      requested: [URL],
      resourceKind: "url",
      requestDispatch: "sent",
      window: { id: WINDOW_ID, source: "launch_result", correlation: "new_since_request" },
    },
  };
}

function result(structured: unknown): DriverResult {
  return { structured, text: "ok", raw: structured };
}

/** Deterministic protocol fixture only; real helper acceptance is a separate evaluation. */
function contextFixture(driver: TypedBrowserDriver, anchorRef: string): DriverResult {
  const base = structuredClone(driver.lastSnapshot!);
  return result({
    ...base,
    snapshot: { ...(base.snapshot as object), scope: "context", complete: false },
    outline: '- region "Repeated"\n  - statictext "Qualifier before the match"\n  - link "Submit"',
    refs: (base.refs as Array<{ ref: string }>).filter((entry) => entry.ref === "p41:1"),
    content_refs: [
      ...(base.content_refs as Array<Record<string, unknown>>).filter((entry) => entry.ref === anchorRef),
      { ref: "p41:10", role: "region", name: "Repeated", actions: [], frame: "main" },
      { ref: "p41:11", role: "main", name: "Document", actions: [], frame: "main" },
    ],
    context: {
      anchor_ref: anchorRef, group_ref: "p41:10", parent_group_ref: "p41:11", order_domain: "opaque-order-1",
      before_omitted: 0, after_omitted: 12, group_complete: false,
      document_collection_complete: true, virtualized_extent: "unknown",
    },
  });
}

function assertOrderedSubsequence(actual: string[], expected: string[]): void {
  let cursor = 0;
  for (const value of actual) {
    if (value === expected[cursor]) cursor += 1;
  }
  assert.equal(cursor, expected.length, `expected ordered calls ${expected.join(" -> ")}; got ${actual.join(" -> ")}`);
}
