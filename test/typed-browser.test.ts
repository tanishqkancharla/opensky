import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "bun:test";

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
  failBind = false;
  ambiguousPrepare = false;

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
        if (effectiveArgs.target_id !== undefined) return this.semanticSnapshot();
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
        this.currentUrl = String(effectiveArgs.url);
        return result({
          status: "ok",
          target_id: TARGET_ID,
          tab_id: TAB_ID,
          url: this.currentUrl,
          refs_invalidated: true,
        });
      case "browser_type":
      case "browser_click":
      case "revoke_session":
        return result({ status: "ok", effect: "confirmed" });
      case "browser_pointer":
        return result({ status: "ok", effect: "confirmed" });
      case "end_session":
        if (this.failEndSessionCount-- > 0) throw new Error("injected cleanup refusal");
        return result({ status: "ok", effect: "confirmed" });

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

  private semanticSnapshot(): DriverResult {
    return result({
      status: "ok",
      mode: "snapshot",
      target_id: TARGET_ID,
      tab_id: TAB_ID,
      snapshot: {
        id: "p41",
        format: "semantic_v2",
        complete: true,
        scope: "viewport",
        selected_nodes: 4,
        total_nodes: 4,
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
      outline: [
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
          role: "button",
          name: "Submit",
          value: null,
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
      ],
      content_refs: [],
      oopif: { status: "attached", frames: 0 },
    });
  }
}

describe("OpenSky typed-browser contract", () => {
  it("fails closed on an ambiguous typed preparation result", async () => {
    const { opensky, driver } = await harness();
    driver.ambiguousPrepare = true;

    await assert.rejects(
      () => opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false }),
      /No legacy browser fallback was attempted/,
    );
    assert.equal(driver.calls.some((call) => call.tool === "launch_app"), false);
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
    assert.doesNotMatch(state.text, /visibility=in_viewport/);
    assert.equal((state.target?.tab as { status?: string } | undefined)?.status, "verified");
    assert.equal(state.target?.document.url, URL);
    assert.equal(state.target?.document.requestRelation, "exact");
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

  it("keeps every unsupported browser action fail-closed on the exact tab boundary", async () => {
    const { opensky, driver } = await harness();
    await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
    const before = driver.calls.length;

    await assert.rejects(() => opensky.click({ app: "Google Chrome", x: 10, y: 20 }), /No native foreground or coordinate input was sent/);
    await assert.rejects(() => opensky.drag({ app: "Google Chrome", from_x: 1, from_y: 2, to_x: 3, to_y: 4 }), /No native foreground or coordinate input was sent/);
    await assert.rejects(() => opensky.paste({ app: "Google Chrome", text: "unsafe" }), /No native foreground or coordinate input was sent/);
    await assert.rejects(() => opensky.press_key({ app: "Google Chrome", key: "Return" }), /No native foreground or coordinate input was sent/);
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
    const { opensky, driver } = await harness();
    await opensky.open_target({ app: "Google Chrome", targets: [URL], includeScreenshot: false });
    driver.failEndSessionCount = 1;

    await assert.rejects(() => opensky.close(), /Failed to end 1 owned driver session/);
    await opensky.close();

    const ended = driver.calls.filter((call) => call.tool === "end_session");
    assert.equal(ended.length, 3, "the failed browser session is retried while the base session is not ended twice");
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
});

async function harness() {
  const driver = new TypedBrowserDriver();
  const home = await mkdtemp(join(tmpdir(), "opensky-typed-browser-"));
  const opensky = createOpenSky({
    driver,
    homeDir: home,
    screenshotDir: join(home, "screenshots"),
    session: SESSION,
    target: "mac",
    settleDelayMs: 0,
    degradedRetryMs: 0,
  });
  return { opensky, driver };
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

function result(structured: unknown): DriverResult {
  return { structured, text: "ok", raw: structured };
}

function assertOrderedSubsequence(actual: string[], expected: string[]): void {
  let cursor = 0;
  for (const value of actual) {
    if (value === expected[cursor]) cursor += 1;
  }
  assert.equal(cursor, expected.length, `expected ordered calls ${expected.join(" -> ")}; got ${actual.join(" -> ")}`);
}
