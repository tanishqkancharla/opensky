import assert from "node:assert/strict";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "bun:test";

import {
  createOpenSky,
  diffTrees,
  compactTreeActionHints,
  enrichTreeSemantics,
  formatTargetIdentity,
  isolatePrimaryWebArea,
  findWithContext,
  mapApps,
  normalizeDirection,
  normalizeMouseButton,
  pickOrdinaryWindowId,
  pickUsableWindowId,
  pickWindowId,
  pruneMenuSubtrees,
  sanitizeTreeText,
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
    assert.equal(pickOrdinaryWindowId([
      { window_id: 4, frame: { width: 640, height: 480 }, on_current_space: false, is_on_screen: false },
    ]), 4);
    assert.equal(pickOrdinaryWindowId([
      {
        window_id: 5,
        frame: { width: 640, height: 480 },
        on_current_space: null,
        is_on_screen: false,
        space_ids: null,
      },
    ]), undefined);
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
        '- [9] AXComboBox (Search) [actions=[press]]',
        '- [10] AXTextField = "Hardware" [actions=[confirm]]',
        '- AXButton (Lap)',
      ].join("\n"),
      [
        { element_index: 7, role: "AXRadioButton", label: "World Clock", value: "1", selected: true },
        { element_index: 8, role: "AXButton", label: "Save", enabled: false },
        { element_index: 9, role: "AXComboBox", label: "Search", value: "", actions: ["press"] },
        { element_index: 10, role: "AXTextField", value: "Hardware", actions: ["confirm"] },
      ],
    );
    assert.match(text, /World Clock.*value="1"/);
    assert.match(text, /Save.*disabled/);
    assert.match(text, /Search.*editable type-directly/);
    assert.doesNotMatch(text, /Hardware.*editable|Hardware.*type-directly/);
    assert.match(text, /Lap.*unavailable/);
  });

  it("omits ubiquitous web action noise without changing structured capabilities", () => {
    const elements: SnapshotElement[] = [
      { element_index: 1, role: "AXStaticText", actions: ["showmenu", "scrolltovisible"] },
      { element_index: 2, role: "AXLink", actions: ["press", "showmenu", "scrolltovisible"] },
      { element_index: 3, role: "AXMenuButton", actions: ["showmenu", "press"] },
    ];
    const compact = compactTreeActionHints([
      '- [1] AXStaticText = "Results" [actions=[showmenu,scrolltovisible]]',
      '- [2] AXLink "Results" [actions=[press,showmenu,scrolltovisible]]',
      '- [3] AXMenuButton "Options" [actions=[showmenu,press]]',
    ].join("\n"), elements);
    assert.equal(compact, [
      '- [1] AXStaticText = "Results"',
      '- [2] AXLink "Results" [actions=[press]]',
      '- [3] AXMenuButton "Options" [actions=[showmenu,press]]',
    ].join("\n"));
    assert.deepEqual(elements[0]?.actions, ["showmenu", "scrolltovisible"]);
  });

  it("bounds verbose auxiliary help without changing the primary label or actions", () => {
    const longHelp = "detail ".repeat(200);
    const compact = sanitizeTreeText(`- [7] AXLink (README.md) [help="${longHelp}"] [actions=[press]]`);
    assert.match(compact, /^- \[7\] AXLink \(README\.md\)/);
    assert.match(compact, /…"\] \[actions=\[press\]\]$/);
    assert.ok(compact.length < 620);
    const realDriverShape = sanitizeTreeText(`- [9] AXLink (commit) [help="${longHelp}" actions=[press,showmenu]]`);
    assert.match(realDriverShape, /…" actions=\[press,showmenu\]\]$/);
    assert.ok(realDriverShape.length < 620);
    assert.equal(sanitizeTreeText('- [8] AXTextField = "exact value" [help="short"]'), '- [8] AXTextField = "exact value" [help="short"]');
  });

  it("does not advertise unreliable press actions for editable text controls", () => {
    const elements: SnapshotElement[] = [
      { element_index: 9, role: "AXComboBox", actions: ["press", "showmenu", "scrolltovisible"] },
      { element_index: 10, role: "AXPopUpButton", actions: ["press", "showmenu"] },
    ];
    const compact = compactTreeActionHints([
      '- [9] AXComboBox "Go to file" [actions=[press,showmenu,scrolltovisible]]',
      '- [10] AXPopUpButton "Branch" [actions=[press,showmenu]]',
    ].join("\n"), elements);
    assert.equal(compact, [
      '- [9] AXComboBox "Go to file"',
      '- [10] AXPopUpButton "Branch" [actions=[press,showmenu]]',
    ].join("\n"));
    assert.deepEqual(elements[0]?.actions, ["press", "showmenu", "scrolltovisible"]);
  });

  it("isolates the largest web area from restored tabs and browser chrome", () => {
    const tree = [
      '- [0] AXWindow "Browser"',
      '  - [1] AXToolbar',
      '    - [2] AXButton "Back"',
      '  - [3] AXWebArea "Small popup"',
      '    - [4] AXStaticText = "Popup"',
      '  - [5] AXWebArea "Main page"',
      '    - [6] AXHeading "Article"',
      '      - [7] AXStaticText = "Article"',
      '    - [8] AXTextField "Search"',
      '  - [9] AXRadioButton "Restored tab"',
      '- [10] AXMenuBar',
    ].join("\n");
    assert.equal(isolatePrimaryWebArea(tree), [
      '- [0] AXWindow "Browser"',
      '  - [5] AXWebArea "Main page"',
      '    - [6] AXHeading "Article"',
      '      - [7] AXStaticText = "Article"',
      '    - [8] AXTextField "Search"',
    ].join("\n"));
  });

  it("does not let multiline menu labels escape closed-menu pruning", () => {
    const tree = [
      '- [0] AXWindow "App"',
      '- [10] AXMenuBar',
      '  - [11] AXMenuBarItem "Develop"',
      'label continuation at column zero',
      '    - [12] AXMenu',
      '      - [13] AXMenuItem "Hidden"',
      '  - [14] AXMenuBarItem "Help"',
    ].join("\n");
    const pruned = pruneMenuSubtrees(tree);
    assert.match(pruned.tree, /AXMenuBarItem "Develop"/);
    assert.match(pruned.tree, /AXMenuBarItem "Help"/);
    assert.doesNotMatch(pruned.tree, /continuation|Hidden/);
    assert.ok(pruned.hiddenIndices.has(12));
    assert.ok(pruned.hiddenIndices.has(13));
  });

  it("does not duplicate a multiline value already rendered after an equals sign", () => {
    const value = "first line\nsecond line";
    const tree = `[1] AXTextArea = "first line\nsecond line"`;
    const enriched = enrichTreeSemantics(tree, [{ element_index: 1, role: "AXTextArea", value }]);
    assert.equal(enriched, tree);
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

  it("projects a saturated native tree shallowly so later controls stay visible", async () => {
    const { opensky, statePath } = await makeHarness();
    await opensky.list_apps();
    const fixture = JSON.parse(await readFile(statePath, "utf8"));
    fixture.saturateDefault = true;
    await writeFile(statePath, JSON.stringify(fixture));

    const state = await opensky.get_app_state({ app: "Calculator", disableDiff: true, includeScreenshot: false });
    assert.match(state.text, /^Accessibility projection:/);
    assert.match(state.text, /Scientific/);
    const after = JSON.parse(await readFile(statePath, "utf8"));
    const observations = after.calls.filter((call: { tool: string }) => call.tool === "get_window_state");
    assert.equal(observations.length, 2);
    assert.equal(observations[0].args.max_depth, undefined);
    assert.equal(observations[1].args.max_depth, 3);
  });

  it("projects an incomplete web tree at a depth that preserves nested controls", async () => {
    const { opensky, statePath } = await makeHarness();
    await opensky.list_apps();
    const fixture = JSON.parse(await readFile(statePath, "utf8"));
    fixture.saturateDefault = true;
    fixture.apps[0].elements = [
      { element_index: 1, role: "AXWindow", label: "Browser", depth: 0 },
      { element_index: 2, role: "AXWebArea", label: "Example", url: "https://example.com/", depth: 1 },
      { element_index: 3, role: "AXTable", label: "Files", depth: 2 },
      { element_index: 4, role: "AXRow", label: "README row", depth: 3 },
      { element_index: 5, role: "AXCell", label: "Name", depth: 4 },
      { element_index: 6, role: "AXLink", label: "README.md", actions: ["press"], depth: 5 },
      { element_index: 7, role: "AXStaticText", label: "deep repetitive prose", depth: 6 },
    ];
    await writeFile(statePath, JSON.stringify(fixture));

    const state = await opensky.open_target({ app: "Calculator", targets: ["https://example.com/"], includeScreenshot: false });
    assert.match(state.text, /^Accessibility projection:/);
    assert.match(state.text, /README\.md/);
    assert.doesNotMatch(state.text, /deep repetitive prose/);
    const after = JSON.parse(await readFile(statePath, "utf8"));
    const observations = after.calls.filter((call: { tool: string }) => call.tool === "get_window_state");
    assert.equal(observations.at(-1).args.max_depth, 5);
  });

  it("returns fresh web state instead of a cross-document removed-index diff", async () => {
    const { opensky, statePath } = await makeHarness();
    await opensky.list_apps();
    const fixture = JSON.parse(await readFile(statePath, "utf8"));
    fixture.apps[0].elements = [
      { element_index: 1, role: "AXWindow", label: "Browser" },
      { element_index: 2, role: "AXWebArea", label: "Page A", url: "https://example.com/a" },
      { element_index: 3, role: "AXLink", label: "Go to B", actions: ["press"] },
    ];
    await writeFile(statePath, JSON.stringify(fixture));
    const opened = await opensky.open_target({ app: "Calculator", targets: ["https://example.com/a"], includeScreenshot: false });

    const navigated = JSON.parse(await readFile(statePath, "utf8"));
    const target = navigated.apps.find((app: { windows: Array<{ window_id: number }> }) =>
      app.windows.some((window) => window.window_id === opened.target?.window.id)
    );
    assert.ok(target);
    target.elements = [
      { element_index: 30, role: "AXWindow", label: "Browser" },
      { element_index: 31, role: "AXWebArea", label: "Page B", url: "https://example.com/b" },
      { element_index: 32, role: "AXHeading", label: "Destination" },
    ];
    await writeFile(statePath, JSON.stringify(navigated));

    const state = await opensky.get_app_state({ app: "Calculator", includeScreenshot: false });
    assert.match(state.text, /^Document changed; fresh accessibility state:/);
    assert.match(state.text, /Destination/);
    assert.doesNotMatch(state.text, /Removed element IDs/);
  });

  it("relaunches a running UI app when it has no ordinary window", async () => {
    const { opensky, statePath } = await makeHarness();
    await opensky.list_apps();
    const fixture = JSON.parse(await readFile(statePath, "utf8"));
    const calculator = fixture.apps.find((app: { name: string }) => app.name === "Calculator");
    calculator.windows = [];
    await writeFile(statePath, JSON.stringify(fixture));

    const state = await opensky.get_app_state({ app: "Calculator", disableDiff: true, includeScreenshot: false });
    assert.match(state.text, /AXWindow/);
    const after = JSON.parse(await readFile(statePath, "utf8"));
    assert.ok(after.calls.some((call: { tool: string; args: Record<string, unknown> }) =>
      call.tool === "launch_app" && call.args.bundle_id === "com.apple.calculator",
    ));
  });

  it("retries an acknowledged app reveal once when its window is delayed", async () => {
    const { opensky, statePath } = await makeHarness();
    await opensky.list_apps();
    const fixture = JSON.parse(await readFile(statePath, "utf8"));
    const calculator = fixture.apps.find((app: { name: string }) => app.name === "Calculator");
    calculator.windows = [];
    fixture.launchNoWindowsOnce = 1;
    await writeFile(statePath, JSON.stringify(fixture));

    const state = await opensky.get_app_state({ app: "Calculator", disableDiff: true, includeScreenshot: false });
    assert.match(state.text, /AXWindow/);
    const after = JSON.parse(await readFile(statePath, "utf8"));
    assert.equal(after.calls.filter((call: { tool: string }) => call.tool === "launch_app").length, 2);
  });

  it("uses the catalog app path as a final macOS reveal fallback", async () => {
    const { opensky, statePath } = await makeHarness();
    await opensky.list_apps();
    const fixture = JSON.parse(await readFile(statePath, "utf8"));
    const calculator = fixture.apps.find((app: { name: string }) => app.name === "Calculator");
    calculator.windows = [];
    fixture.launchNoWindowsOnce = 2;
    await writeFile(statePath, JSON.stringify(fixture));

    const state = await opensky.get_app_state({ app: "Calculator", disableDiff: true, includeScreenshot: false });
    assert.match(state.text, /AXWindow/);
    const after = JSON.parse(await readFile(statePath, "utf8"));
    const launches = after.calls.filter((call: { tool: string }) => call.tool === "launch_app");
    assert.equal(launches.length, 3);
    assert.deepEqual(launches[2].args.urls, ["/System/Applications/Calculator.app"]);
  });

  it("opens and binds a supplied target through the core API", async () => {
    const { opensky, statePath } = await makeHarness();
    const state = await opensky.open_target({
      app: "TextEdit",
      targets: ["/tmp/epoch-target.txt"],
      includeScreenshot: false,
    });
    assert.match(state.text, /AXTextArea/);
    assert.equal(state.target?.resourceKind, "path");
    assert.equal(state.target?.tab, undefined);
    const rendered = formatTargetIdentity(state.target!);
    assert.match(rendered, /path-unverified/);
    assert.doesNotMatch(rendered, /url-unverified|tab=/);
    const persisted = JSON.parse(await readFile(statePath, "utf8")) as {
      calls: Array<{ tool: string; args: Record<string, unknown> }>;
    };
    assert.ok(persisted.calls.some((call) =>
      call.tool === "launch_app" &&
      JSON.stringify(call.args.urls) === JSON.stringify(["/tmp/epoch-target.txt"]),
    ));
  });

  it("polls the fresh pid instead of replaying a delayed new-instance launch", async () => {
    const { opensky, statePath } = await makeHarness();
    await opensky.list_apps();
    const fixture = JSON.parse(await readFile(statePath, "utf8"));
    const textEdit = fixture.apps.find((app: { name: string }) => app.name === "TextEdit");
    textEdit.windows = [];
    fixture.launchNoWindowsOnce = 1;
    await writeFile(statePath, JSON.stringify(fixture));

    const state = await opensky.open_target({
      app: "TextEdit",
      targets: ["/tmp/delayed-target.txt"],
      includeScreenshot: false,
    });
    assert.match(state.text, /AXTextArea/);
    const after = JSON.parse(await readFile(statePath, "utf8"));
    const launches = after.calls.filter((call: { tool: string }) => call.tool === "launch_app");
    assert.equal(launches.length, 1);
    assert.deepEqual(launches[0].args.urls, ["/tmp/delayed-target.txt"]);
    assert.equal(launches[0].args.creates_new_application_instance, true);
  });

  it("does not loop or recommend unsafe input after a refused target dispatch", async () => {
    const { opensky, statePath, dir } = await makeHarness();
    await opensky.open_target({ app: "TextEdit", targets: ["/tmp/prior.txt"], includeScreenshot: false });
    await opensky.list_apps();
    const fixture = JSON.parse(await readFile(statePath, "utf8"));
    const textEdit = fixture.apps.find((app: { name: string }) => app.name === "TextEdit");
    textEdit.windows = [];
    fixture.launchRefuse = true;
    await writeFile(statePath, JSON.stringify(fixture));

    await assert.rejects(
      opensky.open_target({ app: "TextEdit", targets: ["/tmp/refused.txt"], includeScreenshot: false }),
      /could not dispatch.*LAUNCH_FAILED.*No keyboard or pointer input was sent/,
    );
    const after = JSON.parse(await readFile(statePath, "utf8"));
    assert.equal(after.calls.filter((call: { tool: string }) => call.tool === "launch_app").length, 2);
    const session = JSON.parse(await readFile(join(dir, "home", "session.json"), "utf8"));
    const textEditBindings = Object.values(session.targets).filter((binding: any) =>
      binding.targetRequest?.requested?.[0] === "/tmp/prior.txt"
    ) as any[];
    assert.ok(textEditBindings.length > 0);
    assert.ok(textEditBindings.some((binding) => binding.targetRequest?.requested?.[0] === "/tmp/prior.txt"));
  });

  it("reports current document identity without claiming a verified tab", async () => {
    const { opensky, statePath } = await makeHarness();
    await opensky.list_apps();
    const fixture = JSON.parse(await readFile(statePath, "utf8"));
    fixture.apps.push({
      pid: 0,
      name: "Safari",
      bundle_id: "com.apple.Safari",
      launch_path: "/Applications/Safari.app",
      running: false,
      windows: [],
      elements: [
        { element_index: 0, role: "AXWindow", label: "Example Domain" },
        { element_index: 1, role: "AXWebArea", label: "Example Domain", url: "https://example.com/" },
        { element_index: 2, role: "AXHeading", label: "Example Domain" },
      ],
      actions: [],
    });
    await writeFile(statePath, JSON.stringify(fixture));

    const state = await opensky.open_target({
      app: "Safari",
      targets: ["https://EXAMPLE.com#fragment"],
      includeScreenshot: false,
    });
    assert.equal(state.target?.document.url, "https://example.com/");
    assert.equal(state.target?.document.requestRelation, "exact");
    assert.equal(state.target?.window.correlation, "new_since_request");
    assert.deepEqual(state.target?.tab, { status: "unverified" });
    const rendered = formatTargetIdentity(state.target!);
    assert.match(rendered, /^Target tgt_[a-f0-9]+: url url=https:\/\/example\.com\//);
    assert.match(rendered, /request=exact/);
    assert.match(rendered, /tab=unverified/);
    assert.doesNotMatch(rendered, /new tab|opened tab/i);
  });

  it("clicks, types, sets values, scrolls, and presses keys", async () => {
    const { opensky, driver, statePath } = await makeHarness();
    const textEdit = await opensky.get_app_state({ app: "TextEdit", disableDiff: true });
    assert.match(textEdit.text, /AXTextArea/);
    assert.doesNotMatch(textEdit.text, /^$/);

    await opensky.bring_to_front({ app: "TextEdit" });
    await opensky.select_text({
      app: "TextEdit",
      element_index: 2,
      text: "alpha",
      prefix: "alpha beta ",
      suffix: "\nsecond line",
      selection_type: "exact",
    });
    await opensky.click({ app: "TextEdit", element_index: 2, mouse_button: "l" });
    await opensky.type_text({ app: "TextEdit", element_index: 2, text: "hello" });
    await opensky.set_value({ app: "TextEdit", element_index: 2, value: "Replacement text" });
    await opensky.press_key({ app: "TextEdit", key: "super+a" });
    await opensky.press_key({ app: "TextEdit", key: "Up" });
    await opensky.press_key({ app: "TextEdit", key: "super+a", element_index: 2 });
    await opensky.press_key({ app: "TextEdit", key: "Right", element_index: 2 });
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
    await assert.rejects(
      opensky.perform_secondary_action({ app: "TextEdit", element_index: 2, action: "Increment" }),
      /not a supported click action/,
    );

    const raw = await driver.call("list_apps", {});
    assert.ok(raw.structured);
    const persisted = JSON.parse(await readFile(statePath, "utf8")) as {
      calls: Array<{ tool: string; args: Record<string, unknown> }>;
      apps: Array<{ name: string; actions: Array<{ tool: string; args: Record<string, unknown> }> }>;
    };
    assert.ok(persisted.calls.some((call) => call.tool === "bring_to_front" && call.args.window_id === 2001));
    assert.ok(
      persisted.calls.filter((call) => call.tool === "list_windows" && call.args.pid === 900).length >= 2,
      "bring_to_front should verify that its exact bound window is usable after raising it",
    );
    assert.ok(
      persisted.calls.some(
        (call) => call.tool === "hotkey" && call.args.delivery_mode === "foreground" &&
          JSON.stringify(call.args.keys) === JSON.stringify(["cmd", "a"]),
      ),
    );
    assert.ok(
      persisted.calls.some(
        (call) => call.tool === "press_key" && call.args.delivery_mode === "foreground" && call.args.key === "up",
      ),
    );
    assert.ok(
      persisted.calls.some(
        (call) => call.tool === "press_key" && call.args.delivery_mode === "background" &&
          call.args.element_index === 2 && call.args.key === "a" &&
          JSON.stringify(call.args.modifiers) === JSON.stringify(["cmd"]),
      ),
    );
    assert.ok(
      persisted.calls.some(
        (call) => call.tool === "click" && call.args.element_index === 2 && call.args.action === "press",
      ),
    );
    const selectionKeys = persisted.calls.filter(
      (call) => call.tool === "press_key" && call.args.delivery_mode === "background" &&
        call.args.element_index === 2,
    );
    assert.ok(selectionKeys.some((call) => call.args.key === "home"));
    assert.ok(selectionKeys.some(
      (call) => call.args.key === "right" && JSON.stringify(call.args.modifiers) === JSON.stringify(["shift"]),
    ));
    assert.ok(selectionKeys.every(
      (call) => typeof call.args.element_token === "string" && typeof call.args.snapshot_id === "string",
    ));
    assert.ok(
      persisted.calls.some(
        (call) => call.tool === "type_text" && call.args.element_index === 2 &&
          typeof call.args.element_token === "string" && typeof call.args.snapshot_id === "string",
      ),
    );
    const textEditActions = persisted.apps.find((app) => app.name === "TextEdit")?.actions ?? [];
    assert.ok(textEditActions.some(
      (action) => action.tool === "press_key" && action.args?.element_index === 2 &&
        action.args?.key === "a" && JSON.stringify(action.args?.modifiers) === JSON.stringify(["cmd"]),
    ));
    assert.ok(
      textEditActions.some((action) => action.tool === "scroll" && action.args?.element_index === undefined && action.args?.direction === "down"),
    );

    await assert.rejects(
      () => opensky.paste({ app: "TextEdit", text: "x", format: "rtf" as never }),
      /Invalid params/,
    );
    await assert.rejects(
      () => opensky.type_text({ app: "TextEdit", text: "x", x: 10 }),
      /x and y must be provided together/,
    );
    await assert.rejects(
      () => opensky.type_text({ app: "TextEdit", text: "x", element_index: 2, x: 10, y: 20 }),
      /element_index cannot be combined with x\/y/,
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

  it("refuses paste before resolving a target or touching the global clipboard", async () => {
    const { opensky, logPath } = await makeHarness();

    await assert.rejects(
      () => opensky.paste({ app: "TextEdit", text: "do not dispatch" }),
      /safe paste requires.*No clipboard, app, window, tab, or input was touched/s,
    );
    const calls = await readFile(logPath, "utf8").catch(() => "");
    assert.equal(calls, "");
  });

  it("keeps exact AX actions usable off-Space while refusing pixel or ambient input", async () => {
    const { opensky, statePath } = await makeHarness();
    await opensky.get_app_state({ app: "TextEdit", disableDiff: true, includeScreenshot: false });
    const state = JSON.parse(await readFile(statePath, "utf8")) as {
      apps: Array<{ name: string; windows: Array<Record<string, unknown>> }>;
      calls: Array<{ tool: string }>;
    };
    const textEdit = state.apps.find((app) => app.name === "TextEdit");
    assert.ok(textEdit);
    for (const window of textEdit.windows) {
      window.on_current_space = false;
      window.is_on_screen = false;
    }
    const typeCallsBefore = state.calls.filter((call) => call.tool === "type_text").length;
    await writeFile(statePath, JSON.stringify(state));

    await opensky.type_text({ app: "TextEdit", text: "exact target", element_index: 2 });
    await opensky.click({ app: "TextEdit", element_index: 2 });
    await assert.rejects(
      opensky.type_text({ app: "TextEdit", text: "ambient must not be sent" }),
      /off the current desktop; no input was sent/,
    );
    await assert.rejects(
      opensky.click({ app: "TextEdit", x: 10, y: 10 }),
      /off the current desktop; no input was sent/,
    );
    await opensky.bring_to_front({ app: "TextEdit" });
    const after = JSON.parse(await readFile(statePath, "utf8")) as { calls: Array<{ tool: string }> };
    assert.equal(after.calls.filter((call) => call.tool === "type_text").length, typeCallsBefore + 1);
    assert.equal(after.calls.filter((call) => call.tool === "bring_to_front").length, 1);
  });

  it("never silently rebinds keyboard input to a sibling window", async () => {
    const { opensky, statePath } = await makeHarness();
    await opensky.get_app_state({ app: "TextEdit", disableDiff: true, includeScreenshot: false });
    const state = JSON.parse(await readFile(statePath, "utf8")) as {
      apps: Array<{ name: string; windows: Array<Record<string, unknown>> }>;
      calls: Array<{ tool: string }>;
    };
    const textEdit = state.apps.find((app) => app.name === "TextEdit");
    const original = textEdit?.windows.find((window) => {
      const frame = window.frame as { width?: number; height?: number } | undefined;
      return Number(frame?.width) >= 120 && Number(frame?.height) >= 80;
    });
    assert.ok(original);
    const replacement = { ...original, window_id: Number(original.window_id) + 999, title: "Sibling.txt" };
    textEdit.windows = [replacement];
    const hotkeysBefore = state.calls.filter((call) => call.tool === "hotkey").length;
    await writeFile(statePath, JSON.stringify(state));

    await assert.rejects(opensky.press_key({ app: "TextEdit", key: "cmd+f" }), /no exact ordinary window/);
    await assert.rejects(
      opensky.perform_secondary_action({ app: "TextEdit", element_index: 0, action: "Raise" }),
      /no exact ordinary window/,
    );
    let after = JSON.parse(await readFile(statePath, "utf8")) as { calls: Array<{ tool: string }> };
    assert.equal(after.calls.filter((call) => call.tool === "hotkey").length, hotkeysBefore);

    await opensky.get_app_state({ app: "TextEdit", disableDiff: true, includeScreenshot: false });
    await opensky.press_key({ app: "TextEdit", key: "cmd+f" });
    after = JSON.parse(await readFile(statePath, "utf8")) as { calls: Array<{ tool: string }> };
    assert.equal(after.calls.filter((call) => call.tool === "hotkey").length, hotkeysBefore + 1);
  });

  it("never adopts a sibling while an opaque native target handle is requested", async () => {
    const { opensky, statePath } = await makeHarness();
    const opened = await opensky.open_target({
      app: "TextEdit",
      targets: ["/tmp/exact-handle.txt"],
      includeScreenshot: false,
    });
    await opensky.press_key({ app: opened.targetHandle, key: "Return" });
    const state = JSON.parse(await readFile(statePath, "utf8")) as {
      apps: Array<{ name: string; windows: Array<Record<string, unknown>> }>;
      calls: Array<{ tool: string; args: Record<string, unknown> }>;
    };
    const textEdit = state.apps.find((app) =>
      app.windows.some((window) => Number(window.window_id) === opened.target?.window.id)
    );
    const original = textEdit?.windows.find((window) => Number(window.window_id) === opened.target?.window.id);
    assert.ok(original);
    textEdit.windows = [{ ...original, window_id: Number(original.window_id) + 999, title: "Sibling.txt" }];
    const snapshotsBefore = state.calls.filter((call) => call.tool === "get_window_state").length;
    await writeFile(statePath, JSON.stringify(state));

    const missing = await opensky.get_app_state({ app: opened.targetHandle, includeScreenshot: false });
    assert.match(missing.text, /has no usable ordinary window/);
    const after = JSON.parse(await readFile(statePath, "utf8")) as typeof state;
    assert.equal(
      after.calls.filter((call) => call.tool === "get_window_state").length,
      snapshotsBefore,
      "an exact handle must not snapshot the replacement sibling",
    );
  });

  it("closes only the exact owned native sibling and repoints its app alias", async () => {
    const { opensky, statePath, dir } = await makeHarness();
    const first = await opensky.open_target({
      app: "TextEdit",
      targets: ["/tmp/first-owned.txt"],
      includeScreenshot: false,
    });
    const second = await opensky.open_target({
      app: "TextEdit",
      targets: ["/tmp/second-owned.txt"],
      includeScreenshot: false,
    });
    const before = JSON.parse(await readFile(statePath, "utf8")) as {
      apps: Array<{ pid: number; name: string; windows: Array<{ window_id: number }> }>;
    };
    const originalUserPid = 900;
    const originalUserWindows = before.apps.find((app) => app.pid === originalUserPid)?.windows.map((window) => window.window_id);
    assert.ok(originalUserWindows?.length);

    await opensky.close_target({ app: "TextEdit" });

    const after = JSON.parse(await readFile(statePath, "utf8")) as {
      apps: Array<{ pid: number; windows: Array<{ window_id: number }> }>;
      calls: Array<{ tool: string; args: Record<string, unknown> }>;
    };
    const close = after.calls.findLast((call) => call.tool === "close_window");
    assert.equal(close?.args.window_id, second.target?.window.id);
    assert.deepEqual(
      after.apps.find((app) => app.pid === originalUserPid)?.windows.map((window) => window.window_id),
      originalUserWindows,
      "pre-existing user windows must be untouched",
    );
    assert.ok(after.apps.some((app) => app.windows.some((window) => window.window_id === first.target?.window.id)));
    assert.equal(after.apps.some((app) => app.windows.some((window) => window.window_id === second.target?.window.id)), false);
    assert.equal(after.calls.some((call) => ["hotkey", "press_key", "invoke_menu", "kill_app"].includes(call.tool)), false);

    const session = JSON.parse(await readFile(join(dir, "home", "session.json"), "utf8"));
    assert.equal(session.aliases.textedit, first.targetHandle);
    assert.equal(session.targets[second.targetHandle], undefined);
    assert.ok(session.targets[first.targetHandle]?.nativeCloseAuthority);
  });

  it("retains exact native close authority across a structured refusal and retry", async () => {
    const { opensky, statePath, dir, driver } = await makeHarness();
    const opened = await opensky.open_target({
      app: "TextEdit",
      targets: ["/tmp/needs-confirmation.txt"],
      includeScreenshot: false,
    });
    const fixture = JSON.parse(await readFile(statePath, "utf8"));
    fixture.closeWindowResponses = ["confirmation_required", "closed"];
    await writeFile(statePath, JSON.stringify(fixture));

    await assert.rejects(
      opensky.close_target({ app: opened.targetHandle }),
      (error: any) => {
        assert.equal(error.code, "close_confirmation_required");
        assert.match(error.message, /remain available for retry/);
        return true;
      },
    );
    let session = JSON.parse(await readFile(join(dir, "home", "session.json"), "utf8"));
    assert.ok(session.targets[opened.targetHandle]?.nativeCloseAuthority);

    // A new runtime can recover the canonical capability from the durable
    // target record; it never reconstructs authority from a title or alias.
    const resumed = createOpenSky({
      driver,
      homeDir: join(dir, "home"),
      screenshotDir: join(dir, "resumed-shots"),
      target: "mac",
      settleDelayMs: 0,
    });
    await resumed.close_target({ app: opened.targetHandle });
    session = JSON.parse(await readFile(join(dir, "home", "session.json"), "utf8"));
    assert.equal(session.targets[opened.targetHandle], undefined);

    const after = JSON.parse(await readFile(statePath, "utf8")) as {
      calls: Array<{ tool: string; args: Record<string, unknown> }>;
    };
    const closes = after.calls.filter((call) => call.tool === "close_window");
    assert.equal(closes.length, 2);
    assert.deepEqual(closes[0]?.args, closes[1]?.args);
  });

  it("refuses to adopt an existing process when fresh native ownership is unproven", async () => {
    const { opensky, statePath } = await makeHarness();
    await opensky.list_apps();
    const fixture = JSON.parse(await readFile(statePath, "utf8"));
    fixture.newInstanceReuseExisting = true;
    await writeFile(statePath, JSON.stringify(fixture));

    await assert.rejects(
      opensky.open_target({ app: "TextEdit", targets: ["/tmp/not-owned.txt"], includeScreenshot: false }),
      /could not prove.*fresh.*request-correlated.*No existing or title-matched window was adopted/,
    );
    await assert.rejects(
      opensky.close_target({ app: "TextEdit" }),
      /No driver-owned exact target.*No user-owned app, window, or tab was closed/,
    );
    const after = JSON.parse(await readFile(statePath, "utf8")) as { calls: Array<{ tool: string }> };
    assert.equal(after.calls.some((call) => call.tool === "close_window"), false);
  });

  it("refuses fresh native authority when the launched application identity mismatches", async () => {
    const { opensky, statePath } = await makeHarness();
    await opensky.list_apps();
    const fixture = JSON.parse(await readFile(statePath, "utf8"));
    fixture.newInstanceIdentityMismatch = true;
    await writeFile(statePath, JSON.stringify(fixture));

    await assert.rejects(
      opensky.open_target({ app: "TextEdit", targets: ["/tmp/wrong-app.txt"], includeScreenshot: false }),
      /could not prove.*fresh.*request-correlated/,
    );
    const after = JSON.parse(await readFile(statePath, "utf8")) as { calls: Array<{ tool: string }> };
    assert.equal(after.calls.some((call) => call.tool === "get_window_state"), false);
    assert.equal(after.calls.some((call) => call.tool === "close_window"), false);
  });

  it("fails closed when a fresh process exposes ambiguous sibling windows", async () => {
    const { opensky, statePath, dir } = await makeHarness();
    await opensky.list_apps();
    const fixture = JSON.parse(await readFile(statePath, "utf8"));
    fixture.newInstanceExtraWindow = true;
    await writeFile(statePath, JSON.stringify(fixture));

    await assert.rejects(
      opensky.open_target({ app: "TextEdit", targets: ["/tmp/ambiguous.txt"], includeScreenshot: false }),
      /could not prove.*one fresh, uniquely request-correlated native window/,
    );
    const sessionText = await readFile(join(dir, "home", "session.json"), "utf8").catch(() => undefined);
    if (sessionText) {
      const session = JSON.parse(sessionText);
      assert.equal(Object.values(session.targets).some((target: any) =>
        target.targetRequest?.requested?.includes("/tmp/ambiguous.txt")
      ), false);
    }
    const after = JSON.parse(await readFile(statePath, "utf8")) as { calls: Array<{ tool: string }> };
    assert.equal(after.calls.some((call) => call.tool === "get_window_state"), false);
    assert.equal(after.calls.some((call) => call.tool === "close_window"), false);
  });

  it("fails targeted typing closed when its snapshot becomes stale", async () => {
    const { opensky, statePath } = await makeHarness();
    await opensky.get_app_state({ app: "TextEdit", disableDiff: true, includeScreenshot: false });
    const state = JSON.parse(await readFile(statePath, "utf8")) as {
      snapshots: Record<string, { snapshotId: string }>;
      apps: Array<{
        name: string;
        elements: Array<{ element_index: number; value?: string }>;
        actions: Array<{ tool: string }>;
      }>;
    };
    for (const snapshot of Object.values(state.snapshots)) snapshot.snapshotId = "s99999999";
    const textEdit = state.apps.find((app) => app.name === "TextEdit");
    const beforeValue = textEdit?.elements.find((element) => element.element_index === 2)?.value;
    const beforeActions = textEdit?.actions.filter((action) => action.tool === "type_text").length ?? 0;
    await writeFile(statePath, JSON.stringify(state));

    await assert.rejects(
      opensky.type_text({ app: "TextEdit", element_index: 2, text: "must not be sent" }),
      /stale snapshot_id/,
    );
    const after = JSON.parse(await readFile(statePath, "utf8")) as typeof state;
    const afterTextEdit = after.apps.find((app) => app.name === "TextEdit");
    assert.equal(afterTextEdit?.elements.find((element) => element.element_index === 2)?.value, beforeValue);
    assert.equal(
      afterTextEdit?.actions.filter((action) => action.tool === "type_text").length ?? 0,
      beforeActions,
    );
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

  it("skips screenshot capture when the caller requests AX only", async () => {
    const { opensky, statePath } = await makeHarness();
    const snapshot = await opensky.get_app_state({
      app: "Calculator",
      disableDiff: true,
      includeScreenshot: false,
    });
    assert.equal(snapshot.screenshot, null);
    const state = JSON.parse(await readFile(statePath, "utf8")) as {
      calls: Array<{ tool: string; args: Record<string, unknown> }>;
    };
    const call = state.calls.findLast((item) => item.tool === "get_window_state");
    assert.equal(call?.args.include_screenshot, false);
    assert.equal(call?.args.screenshot_out_file, undefined);
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
    assert.equal(snapshot.degraded, true);
    assert.match(snapshot.degradedReason ?? "", /ax_window_unresolved/);
  });
});
