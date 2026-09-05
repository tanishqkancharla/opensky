import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";

import { createCua, CuaTargetClosedError, CuaUnsupportedError } from "../src/cua.js";
import type { AppState, OpenSky } from "../src/types.js";

class FakeOpenSky {
  calls: Array<{ method: string; args: unknown }> = [];
  private sequence = 0;
  screenshotUrl = "";
  apps = [{ id: "com.example", displayName: "Example" }];

  async list_apps() { this.calls.push({ method: "list_apps", args: {} }); return this.apps; }
  async get_app_state(args: Record<string, unknown>): Promise<AppState> {
    this.calls.push({ method: "get_app_state", args });
    const handle = String(args.app).startsWith("tgt_") ? String(args.app) : "tgt_app";
    return state(handle, `state:${handle}`, Boolean(args.includeScreenshot) ? this.screenshotUrl : undefined);
  }
  async open_target(args: Record<string, unknown>): Promise<AppState> {
    this.calls.push({ method: "open_target", args });
    const handle = `tgt_tab_${++this.sequence}`;
    return state(handle, `opened:${handle}`, undefined, String((args.targets as string[])[0]));
  }
  async navigate(args: Record<string, unknown>): Promise<AppState> {
    this.calls.push({ method: "navigate", args });
    const url = typeof args.url === "string" ? args.url : `https://${String(args.action)}.example/`;
    return state(String(args.app), `navigated:${url}`, undefined, url);
  }
  async close_target(args: unknown) { this.calls.push({ method: "close_target", args }); }
  async click(args: unknown) { this.calls.push({ method: "click", args }); }
  async drag(args: unknown) { this.calls.push({ method: "drag", args }); }
  async paste(args: unknown) { this.calls.push({ method: "paste", args }); }
  async press_key(args: unknown) { this.calls.push({ method: "press_key", args }); }
  async scroll(args: unknown) { this.calls.push({ method: "scroll", args }); }
  async select_text(args: unknown) { this.calls.push({ method: "select_text", args }); }
  async set_value(args: unknown) { this.calls.push({ method: "set_value", args }); }
  async type_text(args: unknown) { this.calls.push({ method: "type_text", args }); }
  async perform_secondary_action(args: unknown) { this.calls.push({ method: "perform_secondary_action", args }); }
}

describe("native-style cua facade", () => {
  it("forwards context explicitly instead of consuming a pending navigation state", async () => {
    const fake = new FakeOpenSky();
    const cua = createCua(fake as unknown as OpenSky);
    const tab = await cua.createBrowserTab("chrome", "https://example.com");
    await tab.goto("https://next.example");
    await tab.getAXState({ context: 4 });
    assert.deepEqual(fake.calls.at(-1), {
      method: "get_app_state", args: { app: "tgt_tab_1", disableDiff: undefined, includeScreenshot: false, context_element_index: 4 },
    });
    const before = fake.calls.length;
    await assert.rejects(() => tab.getAXState({ query: "x", context: 4 }), /cannot be combined/);
    await assert.rejects(() => tab.getAXStateAndScreenshot({ context: 4 }), /cannot be combined/);
    assert.equal(fake.calls.length, before);
    await tab.getAXState();
    assert.equal(fake.calls.length, before + 1, "historical navigation state was superseded");
  });
  it("rejects browser argument mistakes before discovery or target creation", async () => {
    const fake = new FakeOpenSky();
    fake.apps = [{ id: "com.google.chrome", displayName: "Google Chrome" }];
    const cua = createCua(fake as unknown as OpenSky);
    for (const options of ["chrome", null, [], { browser: "chrome" }, { id: 42 }, { url: false }, { url: "https://example.com", extra: undefined }]) {
      await assert.rejects(() => cua.getBrowser(options as never), /Invalid params/);
    }
    await assert.rejects(() => Reflect.apply(cua.getBrowser, cua, [{ id: "chrome" }, "extra"]), /Invalid params/);
    for (const options of ["eval", null, [], { visible: "yes" }, { sessionName: 42 }, { url: "https://example.com" }]) {
      await assert.rejects(() => cua.createBrowserTab("chrome", "https://example.com", options as never), /Invalid params/);
    }
    assert.deepEqual(fake.calls, [], "invalid calls must not discover apps or create targets");
    const browser = await cua.getBrowser({ id: "chrome" });
    const before = fake.calls.length;
    for (const args of [["https://example.com"], [{}], [undefined]]) {
      await assert.rejects(() => Reflect.apply(browser.tabs.new, browser.tabs, args), /takes no arguments.*createBrowserTab/);
    }
    assert.equal(fake.calls.length, before);
    assert.match(await browser.documentation(), /tabs\.new\(\).*about:blank/);
    assert.match(await browser.documentation(), /getBrowser\(\{id\?, url\?\}\)/);
  });

  it("binds app actions to the exact handle and translates camelCase arguments", async () => {
    const fake = new FakeOpenSky();
    const emitted: unknown[] = [];
    const cua = createCua(fake as unknown as OpenSky, { emit: (value) => emitted.push(value) });
    const app = await cua.getApp("Example");
    assert.deepEqual(fake.calls[0], {
      method: "get_app_state",
      args: { app: "Example", disableDiff: true, includeScreenshot: false },
    });
    await app.click(7, { mouseButton: "right", clickCount: 1 });
    await app.scroll([10, 20], "down", 2);
    await app.selectText(8, "needle", { prefix: "pre", suffix: "post", selectionType: "cursor_after" });
    await app.performSecondaryAction(9, "Show Menu");

    assert.deepEqual(fake.calls.slice(1), [
      { method: "click", args: { app: "tgt_app", element_index: 7, mouse_button: "right", click_count: 1 } },
      { method: "scroll", args: { app: "tgt_app", x: 10, y: 20, direction: "down", pages: 2 } },
      { method: "select_text", args: { app: "tgt_app", element_index: 8, text: "needle", prefix: "pre", suffix: "post", selection_type: "cursor_after" } },
      { method: "perform_secondary_action", args: { app: "tgt_app", element_index: 9, action: "Show Menu" } },
    ]);
    assert.deepEqual(emitted, ["state:tgt_app"]);
  });

  it("keeps sibling tabs distinct and fails a closed handle before legacy dispatch", async () => {
    const fake = new FakeOpenSky();
    const cua = createCua(fake as unknown as OpenSky);
    const first = await cua.createBrowserTab("chrome", "https://one.example/");
    const second = await cua.createBrowserTab("chrome", "https://two.example/");
    assert.notEqual(first.id, second.id);
    await first.close();
    const callsAfterClose = fake.calls.length;
    await assert.rejects(() => first.click(1), CuaTargetClosedError);
    assert.equal(fake.calls.length, callsAfterClose);
    assert.deepEqual((await cua.listTabs()).map((tab) => tab.id), [second.id]);
  });

  it("provides owned browser lifecycle and exact history navigation", async () => {
    const fake = new FakeOpenSky();
    const cua = createCua(fake as unknown as OpenSky);
    const tab = await cua.createBrowserTab("chrome", "https://start.example/", { sessionName: "eval" });
    await tab.goto("https://next.example/");
    await tab.back();
    await tab.forward();
    await tab.reload();
    assert.deepEqual(fake.calls.filter((call) => call.method === "navigate").map((call) => call.args), [
      { app: tab.id, url: "https://next.example/", includeScreenshot: false },
      { app: tab.id, action: "back", includeScreenshot: false },
      { app: tab.id, action: "forward", includeScreenshot: false },
      { app: tab.id, action: "reload", includeScreenshot: false },
    ]);
    const callsBeforeSettledObservation = fake.calls.length;
    assert.equal(await tab.getAXState({ emit: false }), "navigated:https://reload.example/");
    assert.equal(fake.calls.length, callsBeforeSettledObservation, "the settled navigation state should satisfy the next observation");
    await tab.goto("https://action-after-navigation.example/");
    await tab.pressKey("Return");
    const callsBeforeFreshObservation = fake.calls.length;
    await tab.getAXState({ emit: false });
    assert.equal(fake.calls.length, callsBeforeFreshObservation + 1, "an intervening mutation must invalidate the pending navigation state");
    const state = await cua.getState({ emit: false });
    assert.equal(state.browsers[0]?.id, "chrome");
    assert.equal(state.browsers[0]?.tabs[0]?.id, tab.id);
    assert.equal((await cua.getTab(tab.id, { emit: false })).id, tab.id);
    assert.deepEqual(fake.calls.at(-1), {
      method: "get_app_state",
      args: { app: tab.id, disableDiff: true, includeScreenshot: false },
    });
  });

  it("discovers installed browser providers before any tab is owned", async () => {
    const fake = new FakeOpenSky();
    fake.apps = [
      { id: "/Applications/Microsoft Edge.app", displayName: "Microsoft Edge" },
      { id: "com.google.Chrome", displayName: "Google Chrome" },
      { id: "com.example", displayName: "Example" },
    ];
    const emitted: unknown[] = [];
    const cua = createCua(fake as unknown as OpenSky, { emit: (value) => emitted.push(value) });

    assert.deepEqual(await cua.listBrowsers({ emit: false }), [
      { id: "edge", name: "Microsoft Edge", family: "chromium", type: "cdp", profileName: undefined },
      { id: "chrome", name: "Google Chrome", family: "chromium", type: "cdp", profileName: undefined },
    ]);
    const state = await cua.getState({ emit: false });
    assert.deepEqual(state.browsers.map(({ id, tabs }) => ({ id, tabs })), [
      { id: "edge", tabs: [] },
      { id: "chrome", tabs: [] },
    ]);
    assert.equal((await cua.getBrowser()).browserId, "chrome", "Chrome should be the default provider when both are installed");
    assert.match(String(emitted.at(-1)), /OpenSky browser "chrome"/);
  });

  it("selects browser providers by explicit id or normalized URL without requiring an owned tab", async () => {
    const fake = new FakeOpenSky();
    fake.apps = [{ id: "com.microsoft.edgemac", displayName: "Microsoft Edge" }];
    const cua = createCua(fake as unknown as OpenSky);

    assert.equal((await cua.getBrowser({ id: "Microsoft Edge", url: "example.com" })).browserId, "edge", "an explicit provider takes precedence after the URL hint is validated");
    assert.equal((await cua.getBrowser({ url: "example.com" })).browserId, "edge");
    await assert.rejects(() => cua.getBrowser({ id: "chrome" }), /not installed or available/);
    await assert.rejects(() => cua.getBrowser({ id: "edge", url: "not a URL" }), /getBrowser/);
    await assert.rejects(() => cua.getBrowser({ url: "" }), /getBrowser/);
    await assert.rejects(() => cua.getBrowser({ url: "file:\/\/\/tmp\/example" }), /getBrowser/);
  });

  it("uses a normalized URL to recover the provider of an exact owned tab", async () => {
    const fake = new FakeOpenSky();
    fake.apps = [
      { id: "com.google.Chrome", displayName: "Google Chrome" },
      { id: "com.microsoft.edgemac", displayName: "Microsoft Edge" },
    ];
    const cua = createCua(fake as unknown as OpenSky);
    await cua.createBrowserTab("edge", "example.com");

    assert.equal((await cua.getBrowser({ url: "example.com" })).browserId, "edge");
  });

  it("recognizes each supported provider identifier without relying on its display name", async () => {
    const cases = [
      { app: { id: "com.google.Chrome", displayName: "Other" }, browserId: "chrome" },
      { app: { id: "/Applications/Google Chrome.app", displayName: "Other" }, browserId: "chrome" },
      { app: { id: "other", displayName: "Google Chrome" }, browserId: "chrome" },
      { app: { id: "com.microsoft.edgemac", displayName: "Other" }, browserId: "edge" },
      { app: { id: "/Applications/Microsoft Edge.app", displayName: "Other" }, browserId: "edge" },
      { app: { id: "other", displayName: "Microsoft Edge" }, browserId: "edge" },
    ] as const;
    for (const { app, browserId } of cases) {
      const fake = new FakeOpenSky();
      fake.apps = [app];
      const cua = createCua(fake as unknown as OpenSky);
      assert.deepEqual((await cua.listBrowsers({ emit: false })).map((browser) => browser.id), [browserId]);
    }

    const unrelated = new FakeOpenSky();
    unrelated.apps = [{ id: "/Applications/Chrome Remote Desktop.app", displayName: "Chromium Helper" }];
    const cua = createCua(unrelated as unknown as OpenSky);
    assert.deepEqual(await cua.listBrowsers({ emit: false }), []);
    await assert.rejects(() => cua.getBrowser(), /no supported installed browser provider/);
  });

  it("keeps an owned provider discoverable when the installed-app catalog omits it", async () => {
    const fake = new FakeOpenSky();
    const cua = createCua(fake as unknown as OpenSky);
    const tab = await cua.createBrowserTab("chrome", "https://example.com/");

    assert.deepEqual((await cua.getState({ emit: false })).browsers.map((browser) => browser.id), ["chrome"]);
    assert.equal((await cua.getBrowser({ id: "chrome" })).browserId, "chrome");
    await tab.close();
    await assert.rejects(() => cua.getBrowser({ id: "chrome" }), /not installed or available/);
  });

  it("labels populated and empty state inventories as facade-owned only", async () => {
    const fake = new FakeOpenSky();
    const emitted: unknown[] = [];
    const cua = createCua(fake as unknown as OpenSky, { emit: (value) => emitted.push(value) });
    const before = await cua.getState();
    assert.equal(before.tabInventoryScope, "facade-owned-only");
    assert.deepEqual(before.browsers, []);
    assert.equal((emitted.at(-1) as typeof before).tabInventoryScope, "facade-owned-only");
    const tab = await cua.createBrowserTab("chrome", "https://example.com/");
    const during = await cua.getState();
    assert.equal(during.tabInventoryScope, "facade-owned-only");
    assert.equal(during.browsers[0]?.tabs[0]?.id, tab.id);
    await tab.close();
    const after = await cua.getState();
    assert.equal(after.tabInventoryScope, "facade-owned-only");
    assert.deepEqual(after.browsers, []);
  });

  it("matches the current bound browser.tabs lifecycle and session naming ergonomics", async () => {
    const fake = new FakeOpenSky();
    fake.apps = [{ id: "com.google.Chrome", displayName: "Google Chrome" }];
    const cua = createCua(fake as unknown as OpenSky);
    const browser = await cua.getBrowser({ id: "chrome" });

    assert.equal(await browser.tabs.selected(), undefined);
    await browser.nameSession("  evaluator  ");
    assert.equal((await cua.listBrowsers({ emit: false }))[0]?.profileName, "evaluator");
    await assert.rejects(() => browser.nameSession("   "), /must contain non-whitespace text/);

    const tab = await browser.tabs.new();
    assert.deepEqual(fake.calls.find((call) => call.method === "open_target")?.args, {
      app: "Google Chrome",
      targets: ["about:blank"],
      includeScreenshot: false,
      sessionName: "evaluator",
    });
    assert.equal((await browser.tabs.selected())?.id, tab.id);
    assert.deepEqual((await browser.tabs.list()).map(({ id, browserId, url }) => ({ id, browserId, url })), [
      { id: tab.id, browserId: "chrome", url: "about:blank" },
    ]);
    assert.equal((await browser.tabs.get(tab.id)).id, tab.id);
    const second = await browser.tabs.new();
    assert.equal(await browser.tabs.selected(), undefined, "selection is unprovable across two isolated owned browser sessions");
    await second.close();
    assert.equal((await browser.tabs.selected())?.id, tab.id);
    await tab.close();
    assert.equal(await browser.tabs.selected(), undefined);
  });

  it("matches native observation defaults and returns screenshot bytes", async () => {
    const fake = new FakeOpenSky();
    const dir = await mkdtemp(join(tmpdir(), "opensky-cua-facade-"));
    const screenshot = join(dir, "screen.png");
    await writeFile(screenshot, Buffer.from([137, 80, 78, 71]));
    fake.screenshotUrl = pathToFileURL(screenshot).href;
    const cua = createCua(fake as unknown as OpenSky);
    const app = await cua.getApp("Example");
    await app.getAXState({ disableDiffing: true, emit: false });
    await app.getAXState({ query: "needle", emit: false });
    const bytes = await app.getScreenshot({ emit: false });
    const combined = await app.getAXStateAndScreenshot({ disableDiffing: true, emit: false });
    assert.deepEqual([...bytes], [137, 80, 78, 71]);
    assert.deepEqual([...combined.screenshot!], [137, 80, 78, 71]);
    assert.deepEqual(fake.calls.filter((call) => call.method === "get_app_state").slice(1).map((call) => call.args), [
      { app: "tgt_app", disableDiff: true, includeScreenshot: false },
      { app: "tgt_app", disableDiff: undefined, includeScreenshot: false, query: "needle" },
      { app: "tgt_app", disableDiff: undefined, includeScreenshot: true },
      { app: "tgt_app", disableDiff: true, includeScreenshot: true },
    ]);
  });

  it("throws precise unsupported errors without no-ops or fallback dispatch", async () => {
    const fake = new FakeOpenSky();
    const cua = createCua(fake as unknown as OpenSky);
    await assert.rejects(() => cua.createBrowserTab("iab", "https://example.com"), CuaUnsupportedError);
    await assert.rejects(() => cua.createBrowserTab("chrome"), CuaUnsupportedError);
    const normalized = await cua.createBrowserTab("chrome", "example.com");
    assert.deepEqual(fake.calls.at(-1), {
      method: "open_target",
      args: { app: "Google Chrome", targets: ["https://example.com/"], includeScreenshot: false },
    });
    await normalized.close();
    const tab = await cua.createBrowserTab("chrome", "https://example.com");
    const before = fake.calls.length;
    await assert.rejects(() => tab.paste("text"), /no safe clipboard paste route/);
    await assert.rejects(() => tab.markDeliverable(), /no host callback was configured/);
    await assert.rejects(() => tab.markHandoff(), /no host callback was configured/);
    assert.equal(fake.calls.length, before);
  });
});

function state(handle: string, text: string, screenshotUrl?: string, url?: string): AppState {
  return {
    app: "Example",
    targetHandle: handle as `tgt_${string}`,
    text,
    screenshot: screenshotUrl ? { url: screenshotUrl, format: "png" } : null,
    target: url ? {
      handle: handle as `tgt_${string}`,
      requested: [url],
      resourceKind: "url",
      requestDispatch: "sent",
      window: { id: 1, source: "launch_result", correlation: "new_since_request" },
      document: { freshness: "current", url, requestRelation: "exact" },
      tab: { status: "verified", url, title: url },
    } : undefined,
  };
}
