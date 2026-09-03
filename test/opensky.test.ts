import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "bun:test";

import {
  diffTrees,
  enrichTreeSemantics,
  findWithContext,
  mapApps,
  normalizeDirection,
  normalizeMouseButton,
  pickUsableWindowId,
  pickWindowId,
} from "../src/opensky.js";
import type { SnapshotElement } from "../src/types.js";
import { makeHarness } from "./harness.ts";

describe("opensky helpers", () => {
  it("maps list_apps records onto the opensky App shape", () => {
    const apps = mapApps({
      apps: [
        {
          name: "Calculator",
          bundle_id: "com.apple.calculator",
          running: true,
          last_used: "2026-05-15T12:34:56Z",
          use_count: 42,
        },
        { name: "init", pid: 1, running: true },
        { id: "calculator", name: "calculator", launch_path: "/System/Applications/Calculator.app" },
      ],
    });
    assert.equal(apps[0].id, "com.apple.calculator");
    assert.equal(apps[0].displayName, "Calculator");
    assert.equal(apps[0].isRunning, true);
    assert.equal(apps[0].useCount, 42);
    assert.equal(typeof apps[0].lastUsedDate, "number");
    assert.equal(
      apps.some((app) => app.displayName === "init"),
      false,
    );
    assert.equal(apps[1].id, "/System/Applications/Calculator.app");
  });

  it("converts millisecond lastUsedDate values to unix seconds", () => {
    const apps = mapApps({
      apps: [{ name: "Notes", bundle_id: "com.apple.Notes", last_used: 1_747_308_896_000 }],
    });
    assert.equal(apps[0].lastUsedDate, 1_747_308_896);
  });

  it("prefers the document window over a tiny auxiliary chrome window", () => {
    const id = pickWindowId([
      {
        window_id: 2000,
        title: "",
        z_index: 20,
        frame: { width: 1022, height: 25 },
        on_current_space: true,
        is_on_screen: true,
      },
      {
        window_id: 2001,
        title: "Untitled",
        z_index: 8,
        is_main: true,
        frame: { width: 800, height: 600 },
        on_current_space: true,
        is_on_screen: true,
      },
    ]);
    assert.equal(id, 2001);
  });

  it("does not bind actions to off-space or tiny proxy windows", () => {
    assert.equal(pickUsableWindowId([
      { window_id: 1, frame: { width: 1000, height: 700 }, on_current_space: false, is_on_screen: false },
      { window_id: 2, frame: { width: 54, height: 54 }, on_current_space: true, is_on_screen: true },
    ]), undefined);
    assert.equal(pickUsableWindowId([
      { window_id: 3, frame: { width: 640, height: 480 }, on_current_space: true, is_on_screen: true },
    ]), 3);
  });

  it("validates mouse buttons including numeric aliases", () => {
    assert.equal(normalizeMouseButton(0), "left");
    assert.equal(normalizeMouseButton("r"), "right");
    assert.equal(normalizeMouseButton("middle"), "middle");
    assert.throws(() => normalizeMouseButton("thumb" as never), /mouseButton must be left, right, middle/);
  });

  it("validates scroll directions including one-letter aliases", () => {
    assert.equal(normalizeDirection("d"), "down");
    assert.equal(normalizeDirection("left"), "left");
    assert.throws(() => normalizeDirection("sideways"), /direction must be up, down, left, or right/);
  });

  it("disambiguates select_text with prefix and suffix", () => {
    const haystack = "alpha beta alpha\nsecond line";
    assert.equal(findWithContext(haystack, "alpha", "alpha beta ", "\nsecond line"), 11);
  });

  it("diffs accessibility snapshots", () => {
    const previous: SnapshotElement[] = [{ element_index: 13, role: "AXButton", label: "7", value: "" }];
    const next: SnapshotElement[] = [
      { element_index: 13, role: "AXButton", label: "7", value: "pressed" },
      { element_index: 14, role: "AXButton", label: "8", value: "" },
    ];
    const text = diffTrees("", previous, "tree", next);
    assert.match(text, /^\+ /m);
    assert.match(text, /^~ /m);
  });

  it("enriches trees with generic structured AX state", () => {
    const text = enrichTreeSemantics(
      [
        '- [7] AXRadioButton (World Clock) [actions=[press]]',
        '- [8] AXButton (Save) [actions=[press]]',
        '- AXButton (Lap)',
      ].join("\n"),
      [
        { element_index: 7, role: "AXRadioButton", label: "World Clock", value: "1", selected: true },
        { element_index: 8, role: "AXButton", label: "Save", enabled: false },
      ],
    );
    assert.match(text, /World Clock.*value="1"/);
    assert.match(text, /Save.*disabled/);
    assert.match(text, /Lap.*unavailable/);
  });

  it("diffs structured AX semantics even when labels do not change", () => {
    const previous: SnapshotElement[] = [
      { element_index: 7, role: "AXRadioButton", label: "World Clock", value: "0", enabled: true },
    ];
    const next: SnapshotElement[] = [
      { element_index: 7, role: "AXRadioButton", label: "World Clock", value: "1", enabled: false },
    ];
    const text = diffTrees("", previous, "", next);
    assert.match(text, /^~ /m);
    assert.match(text, /value="1"/);
    assert.match(text, /disabled/);
  });
});

describe("OpenSky against cua-driver", () => {
  it("lists apps and launches a cold app from get_app_state", async () => {
    const { opensky } = await makeHarness();
    const apps = await opensky.list_apps();
    assert.ok(apps.some((app) => app.displayName === "Calculator"));
    assert.ok(apps.some((app) => app.id === "com.apple.calculator"));
    assert.equal(apps.find((app) => app.displayName === "Calculator")?.useCount, 42);
    assert.equal(
      apps.some((app) => app.displayName === "init"),
      false,
    );

    const notes = await opensky.get_app_state({ app: "Notes", disableDiff: true });
    assert.equal(notes.app, "/System/Applications/Notes.app");
    assert.match(notes.text, /AXWindow/);
    assert.ok(notes.screenshot?.url.startsWith("file:"));
    assert.equal(notes.screenshot?.format, "png");
    assert.equal(notes.screenshot?.width, 1);
    assert.equal(notes.screenshot?.height, 1);
  });

  it("returns a full tree then a diff", async () => {
    const { opensky } = await makeHarness();
    const first = await opensky.get_app_state({ app: "Calculator", disableDiff: true });
    assert.match(first.text, /\[13]/);
    assert.match(first.text, /AXMenuBar/);
    assert.match(first.text, /Scientific.*value="0"/);
    assert.match(first.text, /Unavailable.*disabled/);
    await opensky.click({ app: "Calculator", element_index: 13, mouse_button: 0 });
    const second = await opensky.get_app_state({ app: "Calculator" });
    assert.match(second.text, /^~ /m);
    assert.doesNotMatch(second.text, /No accessibility changes/);
  });

  it("clicks, types, pastes, sets values, scrolls, and presses keys", async () => {
    const { opensky, driver, statePath } = await makeHarness();
    const textEdit = await opensky.get_app_state({ app: "TextEdit", disableDiff: true });
    assert.match(textEdit.text, /AXTextArea/);
    assert.doesNotMatch(textEdit.text, /^$/);

    await opensky.select_text({
      app: "TextEdit",
      element_index: 2,
      text: "alpha",
      prefix: "alpha beta ",
      suffix: "\nsecond line",
      selection_type: "text",
    });
    await opensky.click({ app: "TextEdit", element_index: 2, mouse_button: "l" });
    await opensky.type_text({ app: "TextEdit", text: "hello" });
    await opensky.set_value({ app: "TextEdit", element_index: 2, value: "Replacement text" });
    await opensky.paste({ app: "TextEdit", text: "<strong>Hello</strong>", format: "html" });
    await opensky.press_key({ app: "TextEdit", key: "super+a" });
    await opensky.press_key({ app: "TextEdit", key: "Up" });
    await opensky.scroll({ app: "TextEdit", element_index: 1, direction: "d", pages: 1 });
    await opensky.scroll({ app: "TextEdit", direction: "down" });
    await opensky.drag({
      app: "TextEdit",
      from_x: 100,
      from_y: 100,
      to_x: 200,
      to_y: 100,
    });
    await opensky.perform_secondary_action({ app: "TextEdit", element_index: 0, action: "Raise" });
    await opensky.perform_secondary_action({ app: "TextEdit", element_index: 2, action: "Show Menu" });
    await opensky.perform_secondary_action({ app: "TextEdit", element_index: 2, action: "Increment" });
    await opensky.perform_secondary_action({ app: "TextEdit", element_index: 2, action: "Decrement" });

    const raw = await driver.call("list_apps", {});
    assert.ok(raw.structured);
    const persisted = JSON.parse(await readFile(statePath, "utf8")) as {
      calls: Array<{ tool: string; args: Record<string, unknown> }>;
      apps: Array<{ name: string; actions: Array<{ tool: string; args: Record<string, unknown> }> }>;
    };
    assert.ok(persisted.calls.some((call) => call.tool === "clipboard_write" && call.args.html === "<strong>Hello</strong>"));
    const textEditActions = persisted.apps.find((app) => app.name === "TextEdit")?.actions ?? [];
    assert.ok(textEditActions.some((action) => action.args?.action === "increment"));
    assert.ok(textEditActions.some((action) => action.args?.action === "decrement"));
    assert.ok(
      textEditActions.some((action) => action.tool === "scroll" && action.args?.element_index === undefined && action.args?.direction === "down"),
    );

    await assert.rejects(
      () => opensky.paste({ app: "TextEdit", text: "x", format: "rtf" as never }),
      /Invalid params/,
    );
    await assert.rejects(
      () => opensky.select_text({ app: "TextEdit", element_index: 2, text: "alpha", selection_type: "range" }),
      /Invalid params/,
    );
    await assert.rejects(
      () => opensky.scroll({ app: "TextEdit", element_index: 1, direction: "sideways" }),
      /direction must be up, down, left, or right/,
    );
    await assert.rejects(() => opensky.click({ app: "TextEdit", x: -4, y: -4 }), /windowNotFoundAtPosition/);
  });

  it("resolves display name, bundle id, and path", async () => {
    const { opensky } = await makeHarness();
    const byName = await opensky.get_app_state({ app: "Calculator", disableDiff: true });
    const byBundle = await opensky.get_app_state({ app: "com.apple.calculator", disableDiff: true });
    const byPath = await opensky.get_app_state({
      app: "/System/Applications/Calculator.app",
      disableDiff: true,
    });
    assert.match(byName.text, /Calculator/);
    assert.match(byBundle.text, /Calculator/);
    assert.match(byPath.text, /Calculator/);
  });

  it("writes screenshot bytes to a file: URL", async () => {
    const { opensky, dir } = await makeHarness();
    const state = await opensky.get_app_state({ app: "Calculator", disableDiff: true });
    assert.ok(state.screenshot);
    const bytes = await readFile(fileURLToPath(state.screenshot.url));
    assert.ok(bytes.length > 10);
    assert.equal(bytes[0], 0x89);
    assert.equal(state.screenshot.width, 1);
    assert.equal(state.screenshot.format, "png");
    const session = await stat(join(dir, "home", "session.json"));
    assert.equal(session.mode & 0o777, 0o600);
  });

  it("revives an expired helper session transparently", async () => {
    const { opensky, statePath } = await makeHarness();
    await opensky.list_apps();
    const state = JSON.parse(await readFile(statePath, "utf8"));
    state.sessionEnded = true;
    await Bun.write(statePath, JSON.stringify(state));

    const apps = await opensky.list_apps();
    assert.ok(apps.some((app) => app.displayName === "Calculator"));
    const after = JSON.parse(await readFile(statePath, "utf8")) as {
      sessionEnded: boolean;
      calls: Array<{ tool: string }>;
    };
    assert.equal(after.sessionEnded, false);
    assert.ok(after.calls.some((call) => call.tool === "start_session"));
  });

  it("retries helper-reported degraded AX snapshots", async () => {
    const { opensky, statePath } = await makeHarness();
    await opensky.list_apps();
    const state = JSON.parse(await readFile(statePath, "utf8"));
    state.degradedSnapshots = 1;
    await Bun.write(statePath, JSON.stringify(state));

    const snapshot = await opensky.get_app_state({ app: "Calculator", disableDiff: true });
    assert.match(snapshot.text, /AXWindow/);
  });

  it("keeps the screenshot and gives coordinate guidance for persistent AX degradation", async () => {
    const { opensky, statePath } = await makeHarness();
    await opensky.list_apps();
    const state = JSON.parse(await readFile(statePath, "utf8"));
    state.degradedAlways = true;
    await Bun.write(statePath, JSON.stringify(state));

    const snapshot = await opensky.get_app_state({ app: "Calculator", disableDiff: true });
    assert.match(snapshot.text, /Use screenshot coordinates/);
    assert.ok(snapshot.screenshot?.url.startsWith("file:"));
  });
});
