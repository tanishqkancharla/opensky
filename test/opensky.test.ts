import assert from "node:assert/strict";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  createOpenSky,
  inlineItemEditObservation,
  projectActiveMenu,
  projectClosedMenuActions,
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
  pickAppWindowId,
  pickUsableWindowId,
  pickWindowId,
  pruneMenuSubtrees,
  sanitizeTreeText,
  nameAnonymousContainers,
  stabilizeElementIndices,
} from "../src/opensky.js";
import type { SnapshotElement } from "../src/types.js";
import { OpenSkyError } from "../src/errors.js";
import { makeHarness } from "./harness.ts";

describe("unadvertised native primary button routing", () => {
  it("selects one exact foreground click while preserving advertised and other gestures", async () => {
    const { opensky, statePath } = await makeHarness();
    await opensky.list_apps();
    const fixture = JSON.parse(await readFile(statePath, "utf8"));
    const app = fixture.apps.find((item: { name: string }) => item.name === "Calculator");
    app.elements = [
      { element_index: 0, role: "AXWindow", label: "Buttons" },
      { element_index: 1, role: "AXButton", label: "Unadvertised", actions: [] },
      { element_index: 2, role: "AXButton", label: "Advertised", actions: ["press"] },
      { element_index: 3, role: "AXButton", label: "AX advertised", actions: ["AXPress"] },
    ];
    await writeFile(statePath, JSON.stringify(fixture));
    await opensky.get_app_state({ app: "Calculator", includeScreenshot: false });
    await opensky.click({ app: "Calculator", element_index: 1 });
    await opensky.click({ app: "Calculator", element_index: 2 });
    await opensky.click({ app: "Calculator", element_index: 3 });
    await opensky.click({ app: "Calculator", element_index: 1, mouse_button: "right" });
    await opensky.click({ app: "Calculator", element_index: 1, click_count: 2 });
    const after = JSON.parse(await readFile(statePath, "utf8"));
    const inputs = after.calls.filter((call: { tool: string }) => ["click", "right_click", "double_click"].includes(call.tool));
    assert.equal(inputs.length, 5, "one dispatch per gesture; no preliminary refusal or replay");
    assert.ok(inputs.every((call: any) => call.args.pid === app.pid && call.args.window_id === app.windows[0].window_id));
    assert.equal(inputs[0].args.delivery_mode, "foreground");
    assert.ok(inputs.slice(1).every((call: any) => call.args.delivery_mode === undefined));
  });
});

describe("opensky helpers", () => {
  it("diffs unindexed display values without creating input authority", () => {
    const controls: SnapshotElement[] = [{element_index: 7, role: "AXGroup"}, {element_index: 9, role: "AXButton", label: "Clear"}];
    const before = '- [7] AXGroup\n  - AXStaticText = "0" (Edit field)\n  - AXStaticText = "Stable [42] label"\n- [9] AXButton (Clear)';
    const after = before.replace('"0"', '"213"');
    const diff = diffTrees(before, controls, after, controls);
    assert.match(diff, /^~ AXStaticText = "213" \(Edit field\)$/m);
    assert.ok(!diff.includes('Stable [42] label'));
    assert.ok(!diff.includes('[7] AXStaticText'));
    assert.equal(diffTrees(after, controls, after, controls), "No accessibility changes.");
    const removed = diffTrees(after, controls, '- [9] AXButton (Clear)', [controls[1]!]);
    assert.match(removed, /Removed display rows: 2 \(within removed elements\)/);
    assert.ok(!removed.includes('AXStaticText = "213"'), "discarded subtree contents are already covered by removed IDs");
    const added = diffTrees('- [9] AXButton (Clear)', [controls[1]!], after, controls);
    assert.match(added, /^\+ AXStaticText = "213"/m);
    const reparented = after.replace('[7]', '[10]');
    const moved = diffTrees(after, controls, reparented, [{...controls[0]!, element_index: 10}, controls[1]!]);
    assert.match(moved, /Removed display rows: 2/);
    assert.match(moved, /^\+ AXStaticText/m);
    assert.equal(controls.length, 2);
    const retainedParent = diffTrees(after, controls, '- [7] AXGroup\n- [9] AXButton (Clear)', controls);
    assert.match(retainedParent, /Removed display row: AXStaticText = "213"/);
    const unboundParent = diffTrees(after, [controls[1]!], '- [9] AXButton (Clear)', [controls[1]!]);
    assert.match(unboundParent, /Removed display row: AXStaticText = "213"/);
    const rootRemoval = diffTrees('- AXStaticText = "root result"', [], '', []);
    assert.match(rootRemoval, /Removed display row: AXStaticText = "root result"/);
    const inventory = Array.from({length:75},(_,n)=>`  - [${n+20}] AXRow\n    - AXStaticText = "old title ${n}"\n    - AXStaticText = "old snippet ${n}"\n    - AXStaticText = "old date ${n}"\n    - AXImage (move)\n    - AXStaticText = "archive"`).join('\n');
    const inventoryElements: SnapshotElement[] = [{element_index:0,role:'AXWindow'}, ...Array.from({length:75},(_,n)=>({element_index:n+20,role:'AXRow'}))];
    const compact = diffTrees(`- [0] AXWindow\n${inventory}`,inventoryElements,'- [0] AXWindow',[inventoryElements[0]!]);
    assert.match(compact, /Removed element IDs: 20-94/);
    assert.match(compact, /Removed display rows: 375 \(within removed elements\)/);
    assert.ok(!compact.includes('old snippet'));
    const literal = '- AXStaticText = "literal\n  - [20] AXRow\n    - AXStaticText = content"';
    const literalRemoval = diffTrees(literal, [{element_index:20,role:'AXRow'}], '', []);
    assert.ok(literalRemoval.includes('Removed display row: AXStaticText = "literal\n  - [20] AXRow\n    - AXStaticText = content"'), 'quoted content never becomes ancestry');
    const retained: SnapshotElement = {element_index:289,role:'AXRow',identifier:'ICMNoteListCell, Note[id=owned]'};
    const oldParent: SnapshotElement = {element_index:288,role:'AXCell'};
    const newParent: SnapshotElement = {element_index:300,role:'AXCell'};
    const child = '- [289] AXRow [id=ICMNoteListCell, Note[id=owned]]';
    const oldTree = `- [288] AXCell\n  ${child}`;
    const newTree = `- [300] AXCell\n  - AXGroup\n    ${child}`;
    const relation = diffTrees(oldTree,[oldParent,retained],newTree,[newParent,retained]);
    assert.match(relation,/^~ \[289\] AXRow \[id=ICMNoteListCell, Note\[id=owned\]\] \[parent=300\]$/m);
    assert.equal(relation.split('\n').filter(line=>line.startsWith('~ [289]')).length,1);
    assert.ok(!relation.includes('+ [289]'), 'retained input identity stays retained');
    assert.match(relation,/Removed element IDs: 288/);
    const rootMove=diffTrees(oldTree,[oldParent,retained],child,[retained]);
    assert.match(rootMove,/\[parent=root\]/);
    const alsoChanged=diffTrees(oldTree,[oldParent,retained],newTree,[newParent,{...retained,selected:true}]);
    assert.equal(alsoChanged.split('\n').filter(line=>line.startsWith('~ [289]')).length,1);
    for (const [tree,elements] of [
      [newTree,[retained]], // The new parent is not in structured input data.
      [newTree,[newParent,retained,retained]],
      [newTree,[{...newParent,role:'AXButton'},retained]],
      [`${newTree}\n${child}`,[newParent,retained]],
      [`${newTree}\n- [300] AXCell`,[newParent,retained]],
      [`- [300] AXCell\n  - AXStaticText = "literal\n    ${child} content"`,[newParent,retained]],
      [`- [300] AXCell\n  ${child} "unterminated`,[newParent,retained]],
    ] as Array<[string,SnapshotElement[]]>) {
      assert.ok(!diffTrees(oldTree,[oldParent,retained],tree,elements).includes('[parent='), 'ambiguous/unbound/literal/partial rows provide no relation');
    }
    assert.ok(!diffTrees('',[oldParent,retained],newTree,[newParent,retained]).includes('[parent='), 'missing prior row is unknown');
    assert.ok(!diffTrees(newTree,[newParent,retained],newTree,[newParent,retained]).includes('[parent='));
  });

  it("does not reuse ambiguous public indices for repeated controls", () => {
    const previous: SnapshotElement[] = [
      { element_index: 10, driver_index: 100, role: "AXButton", label: "Expand" },
      { element_index: 11, driver_index: 101, role: "AXButton", label: "Expand" },
      { element_index: 12, driver_index: 102, role: "AXButton", label: "Save" },
    ];
    const current: SnapshotElement[] = [
      { element_index: 200, role: "AXButton", label: "Close" },
      { element_index: 201, role: "AXButton", label: "Expand" },
      { element_index: 202, role: "AXButton", label: "Save" },
    ];

    const stabilized = stabilizeElementIndices(previous, current);

    assert.deepEqual(stabilized.map((element) => element.element_index), [13, 14, 12]);
    assert.deepEqual(stabilized.map((element) => element.driver_index), [200, 201, 202]);
  });

  it("app observation follows actual z-order, including an untitled dialog above a large document", () => {
    assert.equal(pickAppWindowId([
      { pid: 7, window_id: 1, title: "document.docx", is_main: true, z_index: 4, is_on_screen: true, frame: { width: 1000, height: 800 } },
      { pid: 7, window_id: 2, title: "", z_index: 9, is_on_screen: true, frame: { width: 500, height: 200 } },
    ], 7), 2);
  });

  it("app observation excludes another process, other Spaces and tiny proxy windows", () => {
    assert.equal(pickAppWindowId([
      { pid: 8, window_id: 1, z_index: 90, is_on_screen: true, frame: { width: 1000, height: 800 } },
      { pid: 7, window_id: 2, z_index: 80, is_on_screen: true, on_current_space: false, frame: { width: 500, height: 200 } },
      { pid: 7, window_id: 3, z_index: 70, is_on_screen: true, frame: { width: 50, height: 50 } },
      { pid: 7, window_id: 4, z_index: 1, is_on_screen: true, frame: { width: 500, height: 200 } },
    ], 7), 4);
  });

  it("app observation refuses ambiguous or missing stacking evidence", () => {
    const visible = { pid: 7, is_on_screen: true, frame: { width: 500, height: 200 } };
    assert.equal(pickAppWindowId([{ ...visible, window_id: 1, z_index: null }, { ...visible, window_id: 2, z_index: 1 }], 7), undefined);
    assert.equal(pickAppWindowId([{ ...visible, window_id: 1, z_index: 1 }, { ...visible, window_id: 2, z_index: 1 }], 7), undefined);
    assert.equal(pickAppWindowId([{ ...visible, window_id: 1, is_on_screen: undefined }], 7), undefined);
  });

  it("app observation follows the verified focused control surface while retaining exact eligibility", () => {
    const main = {pid: 7, window_id: 1, is_on_screen: true, z_index: 10, frame: {width: 1200, height: 900}};
    const panel = {pid: 7, window_id: 2, is_on_screen: true, z_index: 11, frame: {width: 403, height: 84}};
    const choose = (windows: Record<string, unknown>[], control: unknown) => pickAppWindowId(windows, 7, 1, undefined, control);
    assert.equal(choose([main, panel], 2), 2);
    assert.equal(choose([main, panel], undefined), 1);
    assert.equal(choose([main, panel], "2"), 1);
    assert.equal(choose([main, {...panel, pid: 8}], 2), 1);
    assert.equal(choose([main, {...panel, is_on_screen: false}], 2), 1);
    assert.equal(choose([main, {...panel, on_current_space: false}], 2), 1);
    assert.equal(choose([main, {...panel, layer: 1}], 2), 1);
    assert.equal(choose([main, {...panel, frame: {width: 50, height: 50}}], 2), 1);
    assert.equal(choose([main, panel, panel], 2), 1);
  });

  it("app observation prefers exact eligible focus when it differs from stacking order", () => {
    const visible = { pid: 7, is_on_screen: true, frame: { width: 500, height: 200 } };
    const windows = [{ ...visible, window_id: 1, z_index: 418 }, { ...visible, window_id: 2, z_index: 263 }];
    assert.equal(pickAppWindowId(windows, 7, 2), 2);
    assert.equal(pickAppWindowId(windows, 7, null), 1);
    assert.equal(pickAppWindowId(windows, 7, "2"), 1);
    assert.equal(pickAppWindowId(windows, 7, 999), 1);
    assert.equal(pickAppWindowId([{ ...windows[1], pid: 8 }, windows[0]!], 7, 2), 1);
    assert.equal(pickAppWindowId([{ ...windows[1], on_current_space: false }, windows[0]!], 7, 2), 1);
  });

  it("observes a focused sheet through its exact eligible parent and refuses invalid parent metadata", () => {
    const original = {pid: 7, window_id: 1, is_on_screen: true, z_index: 1, frame: {width: 900, height: 700}};
    const sibling = {...original, window_id: 2, z_index: 20};
    const sheet = {...original, window_id: 3, z_index: 21, frame: {width: 320, height: 92}};
    const choose = (windows: Record<string, unknown>[], parent: unknown) => pickAppWindowId(windows, 7, 3, undefined, undefined, parent);
    assert.equal(choose([original, sibling, sheet], 1), 1);
    for (const parent of ["1", 0, -1, 999]) assert.equal(choose([original, sibling, sheet], parent), undefined);
    for (const altered of [{...original, pid: 8}, {...original, is_on_screen: false},
      {...original, on_current_space: false}, {...original, layer: 1}, {...original, frame: {width: 50, height: 50}}]) {
      assert.equal(choose([altered, sibling, sheet], 1), undefined);
    }
    assert.equal(choose([original, original, sibling, sheet], 1), undefined);
    assert.equal(choose([original, sibling, sheet], null), 3);
  });

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

  it("displays derived container labels without naming ambiguous or editable descendants", () => {
    const tree = '- [1] AXRow\n  - [2] AXCell\n    - AXStaticText = "Documents"';
    const elements = [{element_index:1,role:"AXRow"},{element_index:2,role:"AXCell"}];
    const named = nameAnonymousContainers(tree, elements);
    const text = enrichTreeSemantics(tree, named);
    assert.match(text, /\[1\] AXRow \[label="Documents"\]/);
    assert.match(text, /\[2\] AXCell \[label="Documents"\]/);
    assert.equal(enrichTreeSemantics(text, named), text);
    for (const suffix of ['\n    - AXStaticText = "Other"', '\n    - [3] AXTextField = "Documents"', '\n⚠️ AX tree truncated']) {
      assert.doesNotMatch(enrichTreeSemantics(tree + suffix, nameAnonymousContainers(tree + suffix, elements)), /label=/);
    }
    assert.deepEqual(elements, [{element_index:1,role:"AXRow"},{element_index:2,role:"AXCell"}]);
  });

  it("compacts implicit selection and private IDs without losing indices, useful actions or content", () => {
    const elements: SnapshotElement[] = [
      {element_index:1,role:"AXRow",actions:["AXShowDefaultUI","AXShowAlternateUI","Details"],identifier:"_NS:9"},
      {element_index:2,role:"AXCell",actions:["AXOpen"],identifier:"StableCell"},
      {element_index:3,role:"AXTextField",value:'literal [id=_NS:3 actions=[open]]',identifier:"_NS:3",actions:["AXConfirm"]},
      {element_index:4,role:"AXTextArea",value:'first [id=_NS:4]\nsecond',identifier:"_NS:4",actions:["AXShowMenu"]},
    ];
    const tree = '- [1] AXRow [id=_NS:9 actions=[showdefaultui,showalternateui,details]]\n' +
      '  - [2] AXCell [id=StableCell actions=[open]]\n' +
      '- [3] AXTextField = "literal [id=_NS:3 actions=[open]]" [id=_NS:3 actions=[confirm]]\n' +
      '- [4] AXTextArea = "first [id=_NS:4]\nsecond" [id=_NS:4 actions=[showmenu]]';
    const compact = compactTreeActionHints(tree,elements);
    assert.equal(compact,'- [1] AXRow [actions=[details]] [selectable]\n' +
      '  - [2] AXCell [id=StableCell actions=[open]]\n' +
      '- [3] AXTextField = "literal [id=_NS:3 actions=[open]]" [actions=[confirm]]\n' +
      '- [4] AXTextArea = "first [id=_NS:4]\nsecond" [id=_NS:4 actions=[showmenu]]');
    assert.deepEqual([...compact.matchAll(/^-?\s*-? \[(\d+)\]/gm)].map(m=>m[1]), [...tree.matchAll(/^-?\s*-? \[(\d+)\]/gm)].map(m=>m[1]));
    assert.deepEqual(elements[0]?.actions,["AXShowDefaultUI","AXShowAlternateUI","Details"]);
    assert.equal(elements[0]?.identifier,"_NS:9");
    assert.equal(compactTreeActionHints(tree,[]),tree);
    const literal = '- [1] AXRow = "literal [actions=[showdefaultui,showalternateui]]" [id=_NS:9 actions=[showdefaultui,showalternateui,details]]';
    assert.equal(compactTreeActionHints(literal,elements),'- [1] AXRow = "literal [actions=[showdefaultui,showalternateui]]" [actions=[details]] [selectable]');
  });

  it("flattens verified first and subsequent custom actions without changing content or raw capabilities", () => {
    const custom = "Name:customize info and appearance\nTarget:0x0\nSelector:(null)";
    const second = "Name:close tab\nTarget:0x123\nSelector:_closeButtonClicked:";
    const elements: SnapshotElement[] = [
      {element_index:12,role:"AXCell",actions:[custom,"Pin List",custom,"Pin List"],selected:true},
      {element_index:13,role:"AXButton",actions:["AXPress",second,"AXShowMenu"]},
    ];
    const raw = `- [12] AXCell (Reminders) [actions=[${custom.toLowerCase()},pin list,${custom.toLowerCase()},pin list]]\n` +
      `- [13] AXButton (Tab) [help="keep" actions=[press,${second.toLowerCase()},showmenu]]`;
    const clean = sanitizeTreeText(raw,elements);
    assert.equal(clean,'- [12] AXCell (Reminders) [actions=[customize info and appearance,pin list]]\n' +
      '- [13] AXButton (Tab) [help="keep" actions=[press,close tab,showmenu]]');
    assert.match(enrichTreeSemantics(clean,elements), /actions=\[customize info and appearance,pin list\]\] \[selected\]/);
    assert.equal(sanitizeTreeText(clean,elements),clean);
    assert.deepEqual(elements[0]?.actions,[custom,"Pin List",custom,"Pin List"]);
    const content = `- [19] AXTextArea = "actions=[${custom.toLowerCase()},pin list]]" [actions=[showmenu]]`;
    assert.equal(sanitizeTreeText(content,[{element_index:19,role:"AXTextArea",actions:["AXShowMenu"]}]),content);
    assert.equal(sanitizeTreeText(raw,[{...elements[0]!,element_index:99}]),raw);
  });


  it("diffs display-only styling and reversion while retaining raw values", () => {
    const raw = "Copper title\nRegular body.";
    const previous: SnapshotElement[] = [{ element_index: 7, role: "AXTextArea", label: raw, value: raw }];
    const next: SnapshotElement[] = [{ ...previous[0]!, formattedValue: "**Copper title**\nRegular body." }];
    const bold = diffTrees("", previous, "", next);
    assert.match(bold, /^~ \[7\] AXTextArea/m);
    assert.ok(bold.includes("**Copper title**"));
    assert.equal(bold.split("Regular body.").length, 2, "render display once");
    assert.equal(next[0]!.value, raw);
    const plain = diffTrees("", next, "", previous);
    assert.match(plain, /^~ \[7\] AXTextArea/m);
    assert.ok(plain.includes("Copper title"));
    assert.ok(!plain.includes("**Copper title**"));
    assert.equal(diffTrees("", next, "", next), "No accessibility changes.");
    const labelled = diffTrees("", [{...previous[0]!, label: "Compose"}], "", [{...next[0]!, label: "Compose"}]);
    assert.ok(labelled.includes('"Compose"'));
    assert.ok(labelled.includes('value="**Copper title**'));
  });


  it("shows attested collection labels without inventing labels for other controls", () => {
    const row: SnapshotElement = {element_index:7, role:"AXRow", label:"Notes", labelSource:"contents", selected:true, element_token:"exact:7"};
    const source = '- [7] AXRow [selectable]';
    assert.equal(enrichTreeSemantics(source,[row]),source+' [label="Notes" selected]');
    assert.equal(row.element_token,"exact:7");
    assert.equal(enrichTreeSemantics(source,[{...row,labelSource:undefined,selected:undefined}]),source);
    assert.equal(enrichTreeSemantics('- [7] AXTextArea = "literal label=Notes"',[{...row,role:"AXTextArea",selected:undefined}]),'- [7] AXTextArea = "literal label=Notes"');
    assert.equal(enrichTreeSemantics('- [8] AXRow [selectable]',[row]),'- [8] AXRow [selectable]');
  });

  it("preserves literal multiline values while enriching only external AX metadata", () => {
    const value = 'first line\nsecond line';
    const tree = `[1] AXTextArea = "${value}"`;
    assert.equal(enrichTreeSemantics(tree, [{element_index:1,role:'AXTextArea',value}]),tree);
    const element: SnapshotElement = {element_index:1,role:'AXTextArea',value,focused:true};
    assert.equal(enrichTreeSemantics(tree,[element]),`${tree} [focused]`);
    // State-like words and literal tree/index markers are document content.
    const literal = 'focused selected disabled checked expanded\n- [9] AXButton (document content)\n' + String.raw`mentions [9] and \"quoted\" text`;
    const source = `- [1] AXTextArea = "${literal}"\n- [9] AXButton (Save)`;
    const controls: SnapshotElement[] = [{...element,value:literal}, {element_index:9,role:'AXButton',focused:true}];
    assert.equal(enrichTreeSemantics(source,controls),`- [1] AXTextArea = "${literal}" [focused]\n- [9] AXButton (Save) [focused]`);
    assert.equal(controls[0]!.value,literal);
    const already = `${tree} [focused]`;
    assert.equal(enrichTreeSemantics(already,[element]),already);
    const intrinsic = '- AXButton (Save)\n- [1] AXTextArea = "literal unavailable\n- AXButton (body)"';
    assert.equal(enrichTreeSemantics(intrinsic,[]),'- AXButton (Save) [unavailable]\n- [1] AXTextArea = "literal unavailable\n- AXButton (body)"');
    const incomplete = '[1] AXTextArea = "unfinished\n- [9] AXButton';
    assert.equal(enrichTreeSemantics(incomplete,controls),incomplete);
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

  it("uses the full Mac walk budget once and acts only with that capture token", async () => {
    const { opensky, statePath } = await makeHarness();
    await opensky.list_apps();
    const fixture = JSON.parse(await readFile(statePath, "utf8"));
    fixture.timeoutNativeWalk = true;
    await writeFile(statePath, JSON.stringify(fixture));
    const state = await opensky.get_app_state({ app: "Calculator", disableDiff: true, includeScreenshot: false });
    assert.match(state.text, /Scientific/);
    assert.doesNotMatch(state.text, /^Accessibility projection:/);
    await opensky.click({ app: "Calculator", element_index: 13 });
    const after = JSON.parse(await readFile(statePath, "utf8"));
    const reads = after.calls.filter((call: { tool: string; args: {probe_only?: boolean} }) => call.tool === "get_window_state" && !call.args.probe_only);
    assert.equal(reads.length, 1);
    assert.equal(reads[0].args.timeout_ms, 5000);
    assert.equal(reads[0].args.pid, fixture.apps[0].pid);
    assert.equal(reads[0].args.window_id, fixture.apps[0].windows[0].window_id);
    const input = after.calls.find((call: { tool: string }) => call.tool === "click");
    assert.equal(input.args.snapshot_id, "s00000001");
    assert.equal(input.args.element_token, "s00000001:13");
  });

  it("bounds an exhausted full Mac walk to one read and retains its partial state", async () => {
    const { opensky, statePath } = await makeHarness();
    await opensky.list_apps();
    const fixture = JSON.parse(await readFile(statePath, "utf8"));
    fixture.timeoutNativeWalk = true; fixture.timeoutNativeWalkAlways = true;
    await writeFile(statePath, JSON.stringify(fixture));
    const state = await opensky.get_app_state({ app: "Calculator", disableDiff: true, includeScreenshot: false });
    assert.doesNotMatch(state.text, /Scientific/);
    const after = JSON.parse(await readFile(statePath, "utf8"));
    const reads = after.calls.filter((call: { tool: string; args: {probe_only?: boolean} }) => call.tool === "get_window_state" && !call.args.probe_only);
    assert.equal(reads.length, 1); assert.equal(reads[0].args.timeout_ms, 5000);
  });

  it("keeps the native capture default for Linux", async () => {
    const { driver, dir, statePath } = await makeHarness();
    const linux = createOpenSky({ driver, target: "linux", homeDir: join(dir, "linux-home"), settleDelayMs: 0 });
    try {
      await linux.get_app_state({ app: "Calculator", disableDiff: true, includeScreenshot: false });
      const after = JSON.parse(await readFile(statePath, "utf8"));
      const reads = after.calls.filter((call: any) => call.tool === "get_window_state");
      assert.equal(reads.length, 1); assert.equal(reads[0].args.timeout_ms, undefined);
      await linux.click({ app: "Calculator", element_index: 13 });
      const changed = await linux.get_app_state({ app: "Calculator", disableDiff: true, includeScreenshot: false });
      assert.match(changed.text, /\[13\] AXButton 7 value="7"/);
      const inputState = JSON.parse(await readFile(statePath, "utf8"));
      const input = inputState.calls.find((call: any) => call.tool === "click");
      assert.equal(input.args.action, undefined, "Linux's closed click schema has no action field");
      assert.equal(input.args.pid, reads[0].args.pid);
      assert.equal(input.args.window_id, reads[0].args.window_id);
      assert.equal(input.args.element_token, "s00000001:13");
      assert.equal(input.args.button, "left");
      await linux.press_key({ app: "Calculator", key: "ALT+O" });
      await linux.press_key({ app: "Calculator", key: "super+shift+f" });
      const keys = JSON.parse(await readFile(statePath, "utf8")).calls.filter((call: any) => call.tool === "hotkey");
      assert.deepEqual(keys.map((call: any) => call.args.keys), [["alt", "o"], ["super", "shift", "f"]]);
      for (const call of keys) {
        assert.equal(call.args.pid, reads[0].args.pid);
        assert.equal(call.args.window_id, reads[0].args.window_id);
      }
    } finally { await linux.close(); }
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
    assert.equal(observations[0].args.timeout_ms, 5000);
    assert.equal(observations[1].args.timeout_ms, undefined);
  });

  it("keeps one native snapshot when every returned element is represented", async () => {
    const { opensky, statePath } = await makeHarness();
    await opensky.list_apps();
    const fixture = JSON.parse(await readFile(statePath, "utf8"));
    fixture.unprovenIncomplete = true;
    await writeFile(statePath, JSON.stringify(fixture));

    const state = await opensky.get_app_state({ app: "Calculator", disableDiff: true, includeScreenshot: false });
    assert.doesNotMatch(state.text, /^Accessibility projection:/);
    assert.match(state.text, /Scientific/);
    const after = JSON.parse(await readFile(statePath, "utf8"));
    const observations = after.calls.filter((call: { tool: string }) => call.tool === "get_window_state");
    assert.equal(observations.length, 1);
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
    assert.deepEqual(launches[0].args.additional_arguments, ["-ApplePersistenceIgnoreState", "YES"]);
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
        (call) => call.tool === "press_key" && call.args.delivery_mode === "foreground" &&
          call.args.element_index === 2 && call.args.key === "a" &&
          JSON.stringify(call.args.modifiers) === JSON.stringify(["cmd"]),
      ),
    );
    assert.ok(
      persisted.calls.some(
        (call) => call.tool === "click" && call.args.element_index === 2 && call.args.action === "press",
      ),
    );
    // Native selection is covered against real saved documents in E2E.
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

  it("replays a pre-input scroll refusal once in foreground for the bound window", async () => {
    const { opensky, statePath } = await makeHarness();
    await opensky.get_app_state({ app: "TextEdit", disableDiff: true, includeScreenshot: false });
    const fixture = JSON.parse(await readFile(statePath, "utf8"));
    fixture.scrollRefusalCode = "background_unavailable";
    await writeFile(statePath, JSON.stringify(fixture));

    await opensky.scroll({ app: "TextEdit", x: 100, y: 200, direction: "down", pages: 6 });

    const after = JSON.parse(await readFile(statePath, "utf8"));
    const scrolls = after.calls.filter((call: { tool: string }) => call.tool === "scroll");
    assert.equal(scrolls.length, 2);
    assert.deepEqual(scrolls[0].args, {
      pid: 900, window_id: 2001, direction: "down", by: "page", amount: 6, x: 100, y: 200, session: "opensky",
    });
    assert.deepEqual(scrolls[1].args, {
      pid: 900, window_id: 2001, direction: "down", by: "page", amount: 6, x: 100, y: 200,
      delivery_mode: "foreground", session: "opensky",
    });
  });

  it("does not replay a scroll error whose delivery is not proven absent", async () => {
    const { opensky, statePath } = await makeHarness();
    await opensky.get_app_state({ app: "TextEdit", disableDiff: true, includeScreenshot: false });
    const fixture = JSON.parse(await readFile(statePath, "utf8"));
    fixture.scrollRefusalCode = "delivery_unknown";
    await writeFile(statePath, JSON.stringify(fixture));

    await assert.rejects(
      () => opensky.scroll({ app: "TextEdit", x: 100, y: 200, direction: "down" }),
      /scroll refused before delivery: delivery_unknown/,
    );

    const after = JSON.parse(await readFile(statePath, "utf8"));
    assert.equal(after.calls.filter((call: { tool: string }) => call.tool === "scroll").length, 1);
  });

  it("requires separate Mac clipboard preservation evidence without replaying paste", async () => {
    const completed = {status:"completed", target_value_verified:true, transfer_verified:false,
      clipboard_policy:"restore", clipboard_restore_status:"restored", clipboard_restored:true};
    const cases = [
      {outcome:completed, accepted:true},
      {outcome:{...completed,clipboard_restore_status:"newer_writer_preserved",clipboard_restored:false},accepted:true},
      ...[
        {clipboard_restore_status:"restored",clipboard_restored:false},
        {clipboard_restore_status:"newer_writer_preserved",clipboard_restored:true},
        {clipboard_restore_status:"failed",clipboard_restored:false},
        {clipboard_restore_status:"unverified_input",clipboard_restored:false},
        {clipboard_policy:"leave",clipboard_restored:false},
        {clipboard_restore_status:undefined,clipboard_restored:undefined},
        {target_value_verified:false}, {transfer_verified:true}, {status:"unknown"},
      ].map(delta=>({outcome:{...completed,...delta},accepted:false})),
    ];
    for (const {outcome,accepted} of cases) {
      const {opensky}=await makeHarness();const observed=await opensky.get_app_state({app:"TextEdit",includeScreenshot:false});
      const original=opensky.driver.call.bind(opensky.driver);const calls:Array<{tool:string,args:Record<string,unknown>}>=[];
      opensky.driver.call=async(tool,args={})=>{calls.push({tool,args});if(tool==="native_paste")return {structured:outcome,text:"receipt",content:[]};return original(tool,args);};
      const action=opensky.paste({app:observed.targetHandle,text:"one paste",format:"text"});
      if(accepted)await action;else await assert.rejects(action,/Observe before retrying; do not replay automatically/);
      const inputs=calls.filter(c=>c.tool==="native_paste");assert.equal(inputs.length,1);
      assert.equal(inputs[0].args.clipboard_policy,"restore");assert.equal(inputs[0].args.delivery_mode,"foreground");
      assert.equal(inputs[0].args.pid,900);assert.equal(inputs[0].args.window_id,2001);
      assert.ok(!calls.some(c=>["type_text","hotkey","clipboard_set"].includes(c.tool)));
      await opensky.close();
    }
  });

  it("refuses paste before resolving a target or touching the global clipboard", async () => {
    const { opensky, logPath } = await makeHarness();

    await assert.rejects(
      () => opensky.paste({ app: "TextEdit", text: "do not dispatch" }),
      /Native paste is unsupported.*No clipboard, app, window, tab, or input was touched/s,
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
    assert.deepEqual(
      closes.map(call => ({ pid: call.args.pid, window_id: call.args.window_id })),
      [{ pid: 901, window_id: 1901 }, { pid: 901, window_id: 1901 }],
    );
    assert.notEqual(closes[0]?.args.session, closes[1]?.args.session, "resumed runtime owns a distinct base session");
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
    await writeFile(statePath, JSON.stringify(state));

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
    // A spawned fixture process can exceed the harness's 50 ms shortcut under
    // CI load. Use the production retry budget for the recovery assertion.
    const { opensky, statePath } = await makeHarness({ degradedRetryMs: 4_000 });
    await opensky.list_apps();
    const state = JSON.parse(await readFile(statePath, "utf8"));
    state.degradedSnapshots = 1;
    await writeFile(statePath, JSON.stringify(state));

    const snapshot = await opensky.get_app_state({ app: "Calculator", disableDiff: true });
    assert.match(snapshot.text, /AXWindow/);
  });

  it("keeps the screenshot and gives coordinate guidance for persistent AX degradation", async () => {
    const { opensky, statePath } = await makeHarness();
    await opensky.list_apps();
    const state = JSON.parse(await readFile(statePath, "utf8"));
    state.degradedAlways = true;
    await writeFile(statePath, JSON.stringify(state));

    const snapshot = await opensky.get_app_state({ app: "Calculator", disableDiff: true });
    assert.match(snapshot.text, /Use screenshot coordinates/);
    assert.ok(snapshot.screenshot?.url.startsWith("file:"));
    assert.equal(snapshot.degraded, true);
    assert.match(snapshot.degradedReason ?? "", /ax_window_unresolved/);
  });
});


describe("Remaining verified campaign contracts", () => {
it("advertises only primary Press for a proven closed menu bar and preserves open/unknown menu actions", () => {
    const item: SnapshotElement = {element_index: 4, role: "AXMenuBarItem", label: "File", selected: false, actions: ["AXCancel", "AXPress", "AXPick"]};
    const tree = '- [4] AXMenuBarItem "File" [actions=[cancel,press,pick]]';
    const projected = projectClosedMenuActions(tree, [item]);
    assert.equal(projected.tree, '- [4] AXMenuBarItem "File" [actions=[press]]');
    assert.deepEqual(projected.elements[0]!.actions, ["AXPress"]);
    assert.deepEqual(item.actions, ["AXCancel", "AXPress", "AXPick"]);
    for (const selected of [true, undefined]) {
      const open = projectClosedMenuActions(tree, [{...item, selected}]);
      assert.equal(open.tree, tree); assert.deepEqual(open.elements[0]!.actions, item.actions);
    }
    const menuItem = {...item, role:"AXMenuItem"};
    assert.deepEqual(projectClosedMenuActions(tree, [menuItem]).elements, [menuItem]);
    const unknownPrimary = {...item, actions:["AXPick"]};
    assert.deepEqual(projectClosedMenuActions(tree, [unknownPrimary]).elements, [unknownPrimary]);
    assert.equal(projectClosedMenuActions('- [5] AXTextArea = "actions=[cancel,press,pick]"', [item]).tree, '- [5] AXTextArea = "actions=[cancel,press,pick]"');
  });

it("distinguishes a live root item-name editor from a file label without changing capabilities", () => {
    const label: SnapshotElement = {element_index: 8, role: "AXTextField", value: "Drafts", url: "file:///owned/Drafts/", actions: ["AXOpen", "AXConfirm"], settable: true, enabled: true};
    const source = '- [8] AXTextField = "Drafts" [actions=[open,confirm] settable]';
    const rendered = enrichTreeSemantics(source, [label]);
    assert.match(rendered, /file item label/);
    assert.doesNotMatch(rendered, /type-directly/);
    assert.match(rendered, /actions=\[open,confirm\].*settable/);
    assert.deepEqual(label.actions, ["AXOpen", "AXConfirm"]);
    const editor: SnapshotElement = {element_index: 9, role: "AXTextField", identifier: "ShrinkToFit Text Field", value: "Drafts", settable: true, enabled: true};
    const tree = '- [9] AXTextField = "Drafts" [id=ShrinkToFit Text Field]\n- [10] AXWindow "Documents"';
    assert.match(inlineItemEditObservation(tree, [editor]), /editor \[9\].*Return finishes/);
    assert.equal(inlineItemEditObservation('- [10] AXWindow "Documents"\n  '+tree, [editor]), "");
    assert.equal(inlineItemEditObservation(tree, [{...editor, enabled:false}]), "");
    assert.equal(inlineItemEditObservation(tree, [{...editor, url:label.url}]), "");
    assert.equal(inlineItemEditObservation(tree, [editor, {...editor, element_index:11}]), "");
    assert.match(enrichTreeSemantics('- [9] AXTextField [settable]', [editor]), /type-directly/);
  });

it("chooses exact foreground for native buttons missing primary-action enumeration, without replay", async () => {
    const {opensky,statePath}=await makeHarness();
    await opensky.list_apps();
    const fixture=JSON.parse(await readFile(statePath,"utf8"));
    fixture.apps[0].elements=[
      {element_index:14,role:"AXButton",label:"Toolbar button",actions:["Name:Move next\nTarget:0x0"]},
      {element_index:15,role:"AXButton",label:"Standard button",actions:["AXPress"]},
    ];
    await writeFile(statePath,JSON.stringify(fixture));
    const observed=await opensky.get_app_state({app:"Calculator",disableDiff:true,includeScreenshot:false});
    await opensky.click({app:observed.targetHandle,element_index:14});
    await opensky.click({app:observed.targetHandle,element_index:15});
    const after=JSON.parse(await readFile(statePath,"utf8"));
    const inputs=after.calls.filter((c:any)=>c.tool==='click');
    assert.equal(inputs.length,2);assert.equal(inputs[0].args.delivery_mode,'foreground');
    assert.equal(inputs[1].args.delivery_mode,undefined);
    assert.ok(inputs.every((c:any)=>c.args.window_id===fixture.apps[0].windows[0].window_id&&c.args.element_token));
    const original=opensky.driver.call.bind(opensky.driver);let attempts=0;
    opensky.driver.call=async(tool,args={})=>{
      if(tool==='click'){attempts++;throw new OpenSkyError('AX action outcome unknown','delivery_unknown');}
      return original(tool,args);
    };
    await assert.rejects(()=>opensky.click({app:observed.targetHandle,element_index:14}),/outcome unknown/);
    assert.equal(attempts,1);
  });

it("keeps parent-selection separate from native actions and reports capability removal", async () => {
    const {opensky,statePath}=await makeHarness();await opensky.list_apps();
    const fixture=JSON.parse(await readFile(statePath,"utf8"));
    fixture.apps[0].elements=[{element_index:14,role:"AXGroup",label:"Page 2",selection_via_parent:true,actions:[]}];
    await writeFile(statePath,JSON.stringify(fixture));
    const observed=await opensky.get_app_state({app:"Calculator",disableDiff:true,includeScreenshot:false});
    assert.match(observed.text,/selectable via parent/);
    await opensky.click({app:observed.targetHandle,element_index:14});
    for(const options of [{mouse_button:"right" as const},{click_count:2},{mouse_button:"middle" as const}])
      await assert.rejects(()=>opensky.click({app:observed.targetHandle,element_index:14,...options}),/one left indexed click/);
    const result=JSON.parse(await readFile(statePath,"utf8"));
    const inputs=result.calls.filter((c:any)=>["click","right_click","double_click"].includes(c.tool));
    assert.equal(inputs.length,1);assert.equal(inputs[0].args.action,"select_collection_item");
    assert.equal(inputs[0].args.window_id,fixture.apps[0].windows[0].window_id);assert.ok(inputs[0].args.element_token);
    const original=opensky.driver.call.bind(opensky.driver);let attempts=0;
    opensky.driver.call=async(tool,args={})=>{
      if(tool==='click'){attempts++;throw new OpenSkyError('selection outcome unknown','background_unavailable');}
      return original(tool,args);
    };
    await assert.rejects(()=>opensky.click({app:observed.targetHandle,element_index:14}),/selection outcome unknown/);
    assert.equal(attempts,1,'an uncertain parent-selection setter must never be replayed');
    const previous:SnapshotElement[]=[{element_index:14,role:"AXGroup",selectionViaParent:true}];
    const removed:SnapshotElement[]=[{element_index:14,role:"AXGroup"}];
    const diff=diffTrees('',previous,'',removed);
    assert.match(diff,/^~ \[14\] AXGroup ""$/m);assert.doesNotMatch(diff,/selectable via parent/);
  });

it("keeps proven repeated native controls while retaining unique semantic fallback for recreated wrappers", () => {
    const previous: SnapshotElement[] = [
      { element_index: 10, role: "AXStaticText", label: "Repeated event", nativeObjectId: "a", element_token: "old:a" },
      { element_index: 11, role: "AXStaticText", label: "Repeated event", nativeObjectId: "b", element_token: "old:b" },
      { element_index: 12, role: "AXCell", label: "Documents", nativeObjectId: "row-old", element_token: "old:row" },
    ];
    const current = [
      { ...previous[1]!, element_index: 50, element_token: "new:b" },
      { ...previous[0]!, element_index: 51, element_token: "new:a" },
      { ...previous[2]!, element_index: 52, nativeObjectId: "row-new", element_token: "new:row" },
    ];
    const stable = stabilizeElementIndices(previous, current);
    assert.deepEqual(stable.map(e => e.element_index), [11, 10, 12]);
    assert.deepEqual(stable.map(e => e.driver_index), [50, 51, 52]);
    assert.deepEqual(stable.map(e => e.element_token), ["new:b", "new:a", "new:row"]);
    const replacements = current.slice(0, 2).map(e => ({ ...e, nativeObjectId: `new:${e.nativeObjectId}` }));
    assert.ok(stabilizeElementIndices(previous, replacements).every(e => e.element_index > 12));
  });

it("does not let semantic fallback consume a live renamed native control or native alias", () => {
    const previous: SnapshotElement[] = [
      { element_index: 10, role: "AXButton", label: "Save", nativeObjectId: "a" },
      { element_index: 11, role: "AXButton", label: "Close", nativeObjectId: "b" },
    ];
    const renamed = [
      { element_index: 50, role: "AXButton", label: "Save", nativeObjectId: "new-object" },
      { element_index: 51, role: "AXButton", label: "Save as", nativeObjectId: "a" },
    ];
    assert.deepEqual(stabilizeElementIndices(previous, renamed).map(e => e.element_index), [12, 10]);
    const aliases = [
      { element_index: 50, role: "AXButton", label: "Save", nativeObjectId: "alias" },
      { element_index: 51, role: "AXButton", label: "Close", nativeObjectId: "alias" },
    ];
    assert.ok(stabilizeElementIndices(previous, aliases).every(e => e.element_index > 11));
    assert.ok(stabilizeElementIndices(aliases, previous).every(e => e.element_index > 51));
  });

it("keeps native object slots through mutable identifiers without borrowing duplicate or replacement identities", () => {
    const previous:SnapshotElement[]=[
      {element_index:5,role:"AXRadioButton",label:"Same title",identifier:"Tab?isActive=false",value:"0",nativeObjectId:"epoch:object-a",element_token:"old:a"},
      {element_index:6,role:"AXRadioButton",label:"Same title",identifier:"Tab?isActive=true",value:"1",nativeObjectId:"epoch:object-b",element_token:"old:b"},
    ];
    const current:SnapshotElement[]=[
      {...previous[0]!,element_index:99,identifier:"Tab?isActive=true",value:"1",element_token:"new:a"},
      {...previous[1]!,element_index:100,identifier:"Tab?isActive=false",value:"0",element_token:"new:b"},
    ];
    const stable=stabilizeElementIndices(previous,current);
    assert.deepEqual(stable.map(e=>e.element_index),[5,6]);
    assert.deepEqual(stable.map(e=>e.driver_index),[99,100]);
    assert.deepEqual(stable.map(e=>e.element_token),["new:a","new:b"]);
    const diff=diffTrees('',previous,'',stable);
    assert.match(diff,/~ \[5\] AXRadioButton[^\n]*value="1"/);
    assert.match(diff,/~ \[6\] AXRadioButton[^\n]*value="0"/);
    for(const replacement of [
      current.map(e=>({...e,nativeObjectId:"duplicate"})),
      current.map(e=>({...e,nativeObjectId:"new-window:"+e.nativeObjectId})),
      current.map(e=>({...e,readOnly:true})),
      current.map(e=>({...e,role:"AXCheckBox"})),
    ])assert.ok(stabilizeElementIndices(previous,replacement).every(e=>e.element_index!==5&&e.element_index!==6));
    const aliases=[current[0]!,{...current[0]!,element_index:101}];
    assert.ok(stabilizeElementIndices(previous,aliases).every(e=>e.element_index!==5));
  });

it("rejects invalid native observation budgets before resolving or mutating a target", async () => {
    const {opensky,statePath}=await makeHarness();
    for(const timeout of [0,-1,250.5,1001,NaN]) {
      await assert.rejects(()=>opensky.press_key({app:"Calculator",key:"Return",window_change_timeout_ms:timeout}),/window_change_timeout_ms/);
      await assert.rejects(()=>opensky.click({app:"Calculator",element_index:1,window_change_timeout_ms:timeout}),/window_change_timeout_ms/);
      await assert.rejects(()=>opensky.set_value({app:"Calculator",element_index:1,value:"17",window_change_timeout_ms:timeout}),/window_change_timeout_ms/);
      await assert.rejects(()=>opensky.perform_secondary_action({app:"Calculator",element_index:1,action:"press",window_change_timeout_ms:timeout}),/window_change_timeout_ms/);
    }
    // The fake driver creates this file on its first dispatch.
    await assert.rejects(() => stat(statePath), { code: "ENOENT" });
  });

it("preserves identified windows and uniquely anonymous editable fields across changing values", () => {
    const previous: SnapshotElement[] = [
      {element_index: 0,role:"AXWindow",identifier:"_NS:127",label:"Dictionary – 4 found",labelSource:"title"},
      {element_index: 30,role:"AXTextField",label:"atlas",value:"atlas",labelSource:"value",element_token:"old:30"},
    ];
    const current: SnapshotElement[] = [
      {element_index: 4,role:"AXWindow",identifier:"_NS:127",label:"Dictionary – 5 found",labelSource:"title"},
      {element_index: 50,role:"AXTextField",label:"cedar",value:"cedar",labelSource:"value",element_token:"new:50"},
    ];
    const result=stabilizeElementIndices(previous,current);
    assert.deepEqual(result.map(e=>e.element_index),[0,30]);
    assert.equal(result[1]!.driver_index,50);assert.equal(result[1]!.element_token,"new:50");
    assert.equal(result[1]!.label,"cedar");assert.equal(result[1]!.value,"cedar");
    // A repeated anonymous editor must never borrow either prior index.
    const duplicated=[...previous,{...previous[1]!,element_index:31,value:"other",label:"other"}];
    assert.notEqual(stabilizeElementIndices(duplicated,current)[1]!.element_index,30);
    assert.notEqual(stabilizeElementIndices(duplicated,current)[1]!.element_index,31);
    // Missing provenance keeps the existing conservative behavior. Named
    // fields and display-only content still use their semantic labels.
    assert.notEqual(stabilizeElementIndices(previous,[{...current[1]!,labelSource:undefined}])[0]!.element_index,30);
    assert.notEqual(stabilizeElementIndices([{...previous[1]!,labelSource:"description"}],[{...current[1]!,labelSource:"description"}])[0]!.element_index,30);
    assert.notEqual(stabilizeElementIndices([{...previous[1]!,role:"AXStaticText"}],[{...current[1]!,role:"AXStaticText"}])[0]!.element_index,30);
  });

it("names only single-label anonymous containers and keeps duplicate identity conservative", () => {
    const tree = '- [0] AXOutline (sidebar)\n  - [1] AXRow\n    - [2] AXCell\n      - AXStaticText = "Documents"\n  - [3] AXRow\n    - [4] AXCell\n      - AXStaticText = "Downloads"';
    const before=nameAnonymousContainers(tree,[{element_index:1,role:"AXRow"},{element_index:2,role:"AXCell"},{element_index:3,role:"AXRow"},{element_index:4,role:"AXCell"}]);
    assert.deepEqual(before.map(e=>e.label),["Documents","Documents","Downloads","Downloads"]);
    const current=nameAnonymousContainers(tree.replaceAll('[1]','[21]').replaceAll('[2]','[22]').replaceAll('[3]','[23]').replaceAll('[4]','[24]'),before.map(e=>({element_index:e.element_index+20,role:e.role,element_token:`new:${e.element_index+20}`})));
    const stable=stabilizeElementIndices(before,current);assert.deepEqual(stable.map(e=>e.element_index),[1,2,3,4]);assert.equal(stable[1]!.driver_index,22);assert.equal(stable[1]!.element_token,"new:22");
    // Sibling labels cannot name an empty preceding cell; repeated names,
    // multiple labels, editable descendants and malformed strings are unsafe.
    const empty={element_index:2,role:"AXCell"};
    for(const descendants of ['', '\n      - AXTextField = "Documents"', '\n      - AXStaticText = "Documents"\n      - AXStaticText = "Other"', '\n      - AXStaticText = "broken']) {
      assert.equal(nameAnonymousContainers('- [2] AXCell'+descendants+'\n- AXStaticText = "neighbor"',[empty])[0]!.label,undefined);
    }
    const reused=stabilizeElementIndices(before,[{...current[1]!,label:"Documents"},{...current[1]!,element_index:99,label:"Documents"}]);assert.ok(reused.every(e=>e.element_index!==2));
    assert.equal(nameAnonymousContainers(tree+"\n⚠️ AX tree truncated",[empty])[0]!.label,undefined);
    const named={...empty,label:"Authoritative",identifier:"native-id"};assert.deepEqual(nameAnonymousContainers(tree,[named])[0],named);
  });

it("projects a positively selected visible menu without exposing underlying public rows", () => {
    const tree='- [0] AXWindow "Notes"\n  - [1] AXRow "Owned note"\n  - [2] AXTextArea = "Title"\n- [3] AXMenuBar\n  - [4] AXMenuBarItem "File"\n  - [5] AXMenuBarItem "View"\n    - [6] AXMenu\n      - [7] AXMenuItem "Hide Sidebar"';
    const rows:SnapshotElement[]=[{element_index:0,role:"AXWindow"},{element_index:1,role:"AXRow"},{element_index:2,role:"AXTextArea"},{element_index:3,role:"AXMenuBar"},{element_index:4,role:"AXMenuBarItem",label:"File"},{element_index:5,role:"AXMenuBarItem",label:"View",selected:true,element_token:"new:5"},{element_index:6,role:"AXMenu"},{element_index:7,role:"AXMenuItem"}];
    const active=projectActiveMenu(tree,rows,new Set([6]),new Set([99]));assert.equal(active.active,true);
    assert.ok(active.tree.startsWith('- [5] AXMenuBarItem "View"'));assert.ok(active.tree.includes('[7] AXMenuItem'));assert.ok(!active.tree.includes('Owned note'));
    assert.deepEqual([...active.hiddenIndices].sort((a,b)=>a-b),[0,1,2,3,4,99]);
    assert.equal(projectActiveMenu(tree,rows,new Set()).active,false);
    assert.equal(projectActiveMenu(tree,rows.map(e=>({...e,selected:false})),new Set([6])).tree,tree);
    const ambiguous=tree.replace('  - [4] AXMenuBarItem "File"','  - [4] AXMenuBarItem "File"\n    - [8] AXMenu');
    assert.equal(projectActiveMenu(ambiguous,rows.map(e=>e.element_index===4?{...e,selected:true}:e),new Set([6,8])).active,false);
    // Current tokens survive presentation; no underlying row is in the input map.
    const presented=stabilizeElementIndices(rows.map(e=>({...e,element_token:`old:${e.element_index}`})),rows.filter(e=>!active.hiddenIndices.has(e.element_index)));
    assert.equal(presented.find(e=>e.element_index===5)?.element_token,"new:5");assert.ok(!presented.some(e=>e.element_index===1));
  });

it("app observation skips a visible auxiliary window without a matching AX window", async () => {
    const { opensky, statePath } = await makeHarness();
    await opensky.list_apps();
    const fixture = JSON.parse(await readFile(statePath, "utf8"));
    const calculator = fixture.apps.find((app: { name: string }) => app.name === "Calculator");
    calculator.windows.push({
      window_id: 10726, pid: calculator.pid, title: "", z_index: 30,
      is_on_screen: true, on_current_space: true, axUnresolved: true,
      frame: { x: 40, y: 80, width: 600, height: 300 },
    });
    await writeFile(statePath, JSON.stringify(fixture));

    const state = await opensky.get_app_state({ app: "Calculator", scope: "app", includeScreenshot: false });
    assert.match(state.text, /Calculator/);
    const after = JSON.parse(await readFile(statePath, "utf8"));
    const probes = after.calls.filter((call: { tool: string; args: Record<string, unknown> }) =>
      call.tool === "get_window_state" && call.args.probe_only === true);
    assert.deepEqual(probes.map((call: { args: { window_id: number } }) => call.args.window_id), [10726, 10725]);
    assert.equal(after.calls.filter((call: { tool: string }) => call.tool === "get_window_state").at(-1).args.window_id, 10725);
  });

it("diffs placeholder and description changes independently of editable values", () => {
    const empty: SnapshotElement = { element_index: 3, role: 'AXTextField', label: 'Search',
      value: '', placeholder: 'Find a place', description: 'Search' };
    const populated = { ...empty, value: '  typed value  ' };
    const diff = diffTrees('', [empty], '', [populated]);
    assert.ok(diff.includes('value="  typed value  "'));
    assert.ok(diff.includes('placeholder="Find a place"'));
    assert.ok(!diff.includes('description="Search"'), 'do not repeat the label');
    const changed = { ...empty, placeholder: 'New hint', description: 'Find locations' };
    const metadata = diffTrees('', [empty], '', [changed]);
    assert.ok(metadata.includes('placeholder="New hint"'));
    assert.ok(metadata.includes('description="Find locations"'));
    assert.ok(metadata.includes('value=""'));
    assert.equal(diffTrees('', [changed], '', [changed]), 'No accessibility changes.');
    const cleared = diffTrees('', [populated], '', [empty]);
    assert.ok(cleared.includes('value=""'));
    assert.ok(!cleared.includes('value="Find a place"'));
  });

it("omits generated diff metadata while retaining resource URLs, semantic IDs and literal content", () => {
    const before: SnapshotElement[] = [{element_index:0,role:'AXWindow',label:'Untitled',identifier:'_NS:31'}];
    const after: SnapshotElement[] = [{...before[0]!,label:'Owned.rtf',url:'file:///tmp/Owned.rtf'}];
    const changed=diffTrees('',before,'',after);
    assert.ok(changed.includes(' url="file:///tmp/Owned.rtf"'));
    assert.ok(!changed.includes(' id="_NS:31"'));
    assert.equal(after[0]!.identifier,'_NS:31');
    const body='literal id="_NS:31"\n- [99] AXButton (content)';
    const editor: SnapshotElement={element_index:1,role:'AXTextArea',value:body,identifier:'_NS:42',actions:['showmenu']};
    const added=diffTrees('',[],'',[editor]);
    assert.ok(added.includes(JSON.stringify(body)));
    assert.ok(!added.includes(' id="_NS:42"'));
    assert.ok(added.includes('actions=[showmenu]'));
    assert.equal(editor.identifier,'_NS:42');
    const semantic=diffTrees('',[], '',[{...editor,identifier:'First Text View'}]);
    assert.ok(semantic.includes(' id="First Text View"'));
  });

it("keeps complete added multiline fields and separates literal markers from controls", () => {
    const raw = 'Copper title\nBody line.\n- [9] AXButton (document content)';
    const elements: SnapshotElement[] = [
      {element_index: 7, role: "AXTextArea", label: raw, value: raw,
       formattedValue: '**Copper title**\nBody line.\n- [9] AXButton (document content)', actions: ['showmenu'], settable: true},
      {element_index: 9, role: 'AXButton', label: 'Save', actions: ['press']},
    ];
    const tree = `- [7] AXTextArea = "${raw}"\n- [9] AXButton (Save) [help="Save document" actions=[press]]`;
    const diff = diffTrees('', [], tree, elements);
    assert.match(diff, /^\+ \[7\] AXTextArea/m);
    assert.ok(diff.includes(JSON.stringify(elements[0]!.formattedValue)));
    assert.ok(diff.includes('[actions=[showmenu]] [settable]'));
    assert.match(diff, /^\+ \[9\] AXButton "Save" \[actions=\[press\]\]/m);
    assert.ok(!diff.includes('+ [9] AXButton (document content)'));
    assert.equal(elements[0]!.value, raw);
    const plain = diffTrees('', [], '- AXStaticText = "mentions [9]"\n- [9] AXButton (Save) [help="Save document" actions=[press]]', [elements[1]!]);
    assert.match(plain, /^\+ \[9\] AXButton \(Save\) \[help="Save document"/m);
  });

it("uses explicit native writability with AX-prefixed actions and preserves readonly or unknown fields", () => {
    const tree = [
      '- [1] AXTextField (Search) [settable actions=[press]]',
      '- [2] AXTextField (Readonly) [actions=[press]]',
      '- [3] AXTextField (Unknown) [actions=[press]]',
    ].join("\n");
    const text = enrichTreeSemantics(tree, [
      { element_index: 1, role: "AXTextField", actions: ["AXPress"], settable: true },
      { element_index: 2, role: "AXTextField", actions: ["AXPress"], settable: false },
      { element_index: 3, role: "AXTextField", actions: ["AXPress"] },
    ]);
    assert.match(text, /Search.*settable.*type-directly/);
    assert.doesNotMatch(text, /Readonly.*editable|Readonly.*type-directly|Readonly.*settable/);
    assert.doesNotMatch(text, /Unknown.*editable|Unknown.*type-directly|Unknown.*settable/);
  });

it("compacts private slider metadata without changing values or input bindings", () => {
    const element: SnapshotElement={element_index:72,role:"AXSlider",label:"resize icon",identifier:"_NS:86",value:"24",actions:["increment","decrement"],settable:true,element_token:"fresh:72"};
    const row='- [72] AXSlider (resize icon) [id=_NS:86 actions=[increment,decrement] settable] [value="24"]';
    assert.equal(compactTreeActionHints(row,[element]),'- [72] AXSlider (resize icon) [actions=[increment,decrement] settable] [value="24"]');
    assert.equal(element.identifier,"_NS:86");assert.equal(element.element_token,"fresh:72");
    assert.equal(compactTreeActionHints(row.replace('[value="24"]','[unknown="24"]'),[element]),row.replace('[value="24"]','[unknown="24"]'));
  });

it("retains a visible menu while hiding closed submenus and other menu trees", () => {
    const tree = ['- [0] AXWindow "App"', '- [10] AXMenuBar',
      '  - [11] AXMenuBarItem "File"', '    - [12] AXMenu',
      '      - [13] AXMenuItem "New"', '      - [14] AXMenuItem "Open With"',
      '        - [15] AXMenu', '          - [16] AXMenuItem "Hidden child"',
      '      - [17] AXMenuItem "Close"', '  - [18] AXMenuBarItem "Edit"',
      '    - [19] AXMenu', '      - [20] AXMenuItem "Hidden edit"'].join("\n");
    const open = pruneMenuSubtrees(tree, new Set([12]));
    assert.match(open.tree, /AXMenuItem "New"/);
    assert.match(open.tree, /AXMenuItem "Close"/);
    assert.doesNotMatch(open.tree, /Hidden child|Hidden edit/);
    assert.ok(!open.hiddenIndices.has(13));
    assert.ok(open.hiddenIndices.has(16));
    assert.doesNotMatch(pruneMenuSubtrees(tree).tree, /AXMenuItem/);
  });

it("reopens a closed cached app only on an explicit named app binding", async () => {
    const { opensky, statePath } = await makeHarness();
    const initial = await opensky.get_app_state({app:"Calculator",scope:"app",includeScreenshot:false});
    const fixture = JSON.parse(await readFile(statePath,"utf8"));
    fixture.apps.find((app: any) => app.name === "Calculator").windows = [];
    await writeFile(statePath, JSON.stringify(fixture));
    await assert.rejects(opensky.get_app_state({app:initial.targetHandle,scope:"app",includeScreenshot:false}), /no unambiguous/);
    const before = JSON.parse(await readFile(statePath,"utf8"));
    assert.equal(before.calls.filter((c:any)=>c.tool==="launch_app").length,0);
    const reopened = await opensky.get_app_state({app:"Calculator",scope:"app",includeScreenshot:false});
    assert.match(reopened.text,/AXWindow/);
    assert.notEqual(reopened.targetHandle, initial.targetHandle);
    const after = JSON.parse(await readFile(statePath,"utf8"));
    const launches=after.calls.filter((c:any)=>c.tool==="launch_app");
    assert.equal(launches.length,1);
    assert.deepEqual(launches[0].args,{bundle_id:"com.apple.calculator",session:"opensky"});
  });

it("does not reopen an app's off-Space window or reveal during an exact observation", async () => {
    const { opensky, statePath } = await makeHarness();
    const initial = await opensky.get_app_state({app:"Calculator",scope:"app",includeScreenshot:false});
    const fixture = JSON.parse(await readFile(statePath,"utf8"));
    const window=fixture.apps.find((app:any)=>app.name==="Calculator").windows[0];
    window.is_on_screen=false;window.on_current_space=false;
    await writeFile(statePath,JSON.stringify(fixture));
    await assert.rejects(opensky.get_app_state({app:"Calculator",scope:"app",includeScreenshot:false}),/no unambiguous/);
    await assert.rejects(opensky.get_app_state({app:initial.targetHandle,scope:"app",includeScreenshot:false}),/no unambiguous/);
    const after=JSON.parse(await readFile(statePath,"utf8"));
    assert.equal(after.calls.filter((c:any)=>c.tool==="launch_app").length,0);
  });

it("respects disabled app launch after an already observed window closes", async () => {
    const { driver, statePath, dir } = await makeHarness();
    const observer=createOpenSky({driver,homeDir:join(dir,"read-only-home"),autoLaunch:false,target:"mac",settleDelayMs:0});
    const initial=await observer.get_app_state({app:"Calculator",scope:"app",includeScreenshot:false});
    const fixture=JSON.parse(await readFile(statePath,"utf8"));
    fixture.apps.find((app:any)=>app.name==="Calculator").windows=[];
    await writeFile(statePath,JSON.stringify(fixture));
    await assert.rejects(observer.get_app_state({app:"Calculator",scope:"app",includeScreenshot:false}),/no unambiguous/);
    await assert.rejects(observer.get_app_state({app:initial.targetHandle,scope:"app",includeScreenshot:false}),/no unambiguous/);
    const after=JSON.parse(await readFile(statePath,"utf8"));
    assert.equal(after.calls.filter((c:any)=>c.tool==="launch_app").length,0);
  });

it("routes plain Mac collection clicks through their exact foreground window", async () => {
    const { opensky, statePath } = await makeHarness();
    await opensky.list_apps();
    const fixture = JSON.parse(await readFile(statePath, "utf8"));
    const app = fixture.apps.find((item: { name: string }) => item.name === "Calculator");
    app.elements = [
      { element_index: 0, role: "AXWindow", label: "Collection" },
      { element_index: 1, role: "AXRow", label: "Row", actions: ["press"] },
      { element_index: 2, role: "AXCell", label: "Cell", actions: ["open"] },
      { element_index: 3, role: "AXButton", label: "Button", actions: ["press"] },
    ];
    await writeFile(statePath, JSON.stringify(fixture));
    const observed = await opensky.get_app_state({ app: "Calculator", includeScreenshot: false });
    await opensky.click({ app: observed.targetHandle, element_index: 1 });
    await opensky.click({ app: observed.targetHandle, element_index: 2 });
    await opensky.click({ app: observed.targetHandle, element_index: 3 });
    const after = JSON.parse(await readFile(statePath, "utf8"));
    const clicks = after.calls.filter((call: { tool: string }) => call.tool === "click");
    assert.deepEqual(clicks.map((call: { args: Record<string, unknown> }) => ({
      pid: call.args.pid, window: call.args.window_id, index: call.args.element_index, mode: call.args.delivery_mode,
    })), [
      { pid: app.pid, window: app.windows[0].window_id, index: 1, mode: "foreground" },
      { pid: app.pid, window: app.windows[0].window_id, index: 2, mode: "foreground" },
      { pid: app.pid, window: app.windows[0].window_id, index: 3, mode: undefined },
    ]);
  });

it("routes native Mac index/pixel right-clicks through the context-menu tool and refuses hidden windows", async () => {
    const { opensky, statePath } = await makeHarness();
    await opensky.list_apps();
    const fixture = JSON.parse(await readFile(statePath, "utf8"));
    const app = fixture.apps.find((item: { name: string }) => item.name === "Calculator");
    app.elements = [
      { element_index: 0, role: "AXWindow", label: "Collection" },
      { element_index: 1, role: "AXCell", label: "List", actions: ["press"] },
    ];
    await writeFile(statePath, JSON.stringify(fixture));
    const observed = await opensky.get_app_state({ app: "Calculator", includeScreenshot: false });
    await opensky.click({ app: observed.targetHandle, element_index: 1, mouse_button: "right" });
    await opensky.click({ app: observed.targetHandle, element_index: 1, mouse_button: "middle" });
    const after = JSON.parse(await readFile(statePath, "utf8"));
    const right = after.calls.filter((call: { tool: string }) => call.tool === "right_click");
    assert.equal(right.length, 1);
    assert.equal(right[0].args.pid, app.pid);
    assert.equal(right[0].args.window_id, app.windows[0].window_id);
    assert.equal(right[0].args.element_index, 1);
    assert.equal(typeof right[0].args.element_token, "string");
    assert.equal(typeof right[0].args.snapshot_id, "string");
    assert.ok(after.calls.some((call: { tool: string; args: Record<string, unknown> }) =>
      call.tool === "click" && call.args.button === "middle"));
    await assert.rejects(opensky.click({ app: observed.targetHandle, element_index: 999, mouse_button: "right" }),
      /not present in the latest accessibility snapshot/);
    const current = after.apps.find((item: { pid: number }) => item.pid === app.pid);
    current.windows[0].is_on_screen = false;
    await writeFile(statePath, JSON.stringify(after));
    await assert.rejects(opensky.click({ app: observed.targetHandle, element_index: 1, mouse_button: "right" }),
      /off the current desktop.*no input was sent/);
    const final = JSON.parse(await readFile(statePath, "utf8"));
    assert.equal(final.calls.filter((call: { tool: string }) => call.tool === "right_click").length, 1);
    current.windows[0].is_on_screen = true;
    await writeFile(statePath, JSON.stringify(after));
    await opensky.click({ app: observed.targetHandle, x: 20, y: 30, mouse_button: "r", delivery_mode: "background" });
    const pixel = JSON.parse(await readFile(statePath, "utf8")).calls.filter((call: {tool:string})=>call.tool==="right_click").at(-1);
    assert.deepEqual({pid:pixel.args.pid,window:pixel.args.window_id,x:pixel.args.x,y:pixel.args.y,mode:pixel.args.delivery_mode},
      {pid:app.pid,window:app.windows[0].window_id,x:20,y:30,mode:"background"});
    assert.equal(pixel.args.element_index,undefined);
  });

it("keeps indexed right-click on the existing Linux and Windows routes", async () => {
    for (const target of ["linux", "win"] as const) {
      const { driver, dir, statePath } = await makeHarness();
      const sdk = createOpenSky({ driver, target, homeDir: join(dir, target), autoLaunch: true,
        settleDelayMs: 0, screenshotDir: join(dir, "shots") });
      const observed = await sdk.get_app_state({ app: "Calculator", includeScreenshot: false });
      await sdk.click({ app: observed.targetHandle, element_index: 13, mouse_button: "right" });
      const after = JSON.parse(await readFile(statePath, "utf8"));
      assert.ok(after.calls.some((call: { tool: string; args: Record<string, unknown> }) =>
        call.tool === "click" && call.args.button === "right"));
      assert.equal(after.calls.filter((call: { tool: string }) => call.tool === "right_click").length, 0);
    }
  });

it("requests zero-delay Mac foreground typing while retaining indexed and non-Mac routes", async () => {
    const { opensky, statePath } = await makeHarness();
    const observed = await opensky.get_app_state({ app: "TextEdit", includeScreenshot: false });
    await opensky.type_text({ app: observed.targetHandle, text: "α 😀 packet" });
    await opensky.type_text({ app: observed.targetHandle, text: "indexed", element_index: 2 });
    for (const target of ["linux", "win"] as const) {
      const separate = await makeHarness();
      const other = createOpenSky({ driver: separate.driver, target, homeDir: join(separate.dir, target), settleDelayMs: 0 });
      const state = await other.get_app_state({ app: "TextEdit", includeScreenshot: false });
      await other.type_text({ app: state.targetHandle, text: target });
      const fixture = JSON.parse(await readFile(separate.statePath, "utf8"));
      const call = fixture.calls.find((c: { tool: string }) => c.tool === "type_text");
      assert.equal(call.args.delay_ms, undefined);
      assert.equal(call.args.delivery_mode, undefined);
      await other.close();
    }
    const fixture = JSON.parse(await readFile(statePath, "utf8"));
    const calls = fixture.calls.filter((c: { tool: string }) => c.tool === "type_text");
    assert.equal(calls[0].args.delivery_mode, "foreground");
    assert.equal(calls[0].args.delay_ms, 0);
    assert.equal(calls[0].args.window_id, 2001);
    assert.equal(calls[1].args.delay_ms, undefined);
  });

it("explicit app keyboard scope follows a new front window without moving exact input", async () => {
    const {opensky,statePath}=await makeHarness();
    const initial=await opensky.get_app_state({app:"TextEdit",includeScreenshot:false});
    const state=JSON.parse(await readFile(statePath,"utf8"));
    const app=state.apps.find((a:any)=>a.name==="TextEdit");
    const observedWindow=state.calls.filter((c:any)=>c.tool==="get_window_state").at(-1).args.window_id;
    const original=app.windows.find((w:any)=>w.window_id===observedWindow);
    assert.ok(original);
    const next={...original,window_id:original.window_id+5000,title:"New sibling",z_index:100};
    app.windows.push(next);await writeFile(statePath,JSON.stringify(state));
    await opensky.press_key({app:initial.targetHandle,key:"super+l",scope:"app"});
    await opensky.type_text({app:initial.targetHandle,text:"new window",scope:"app"});
    await opensky.press_key({app:initial.targetHandle,key:"Return"});
    const after=JSON.parse(await readFile(statePath,"utf8"));
    const inputs=after.calls.filter((c:any)=>["hotkey","press_key","type_text"].includes(c.tool));
    assert.deepEqual(inputs.map((c:any)=>c.args.window_id),[next.window_id,next.window_id,original.window_id]);
    assert.ok(inputs.every((c:any)=>c.args.pid===app.pid&&c.args.delivery_mode==="foreground"));
    assert.equal(after.calls.some((c:any)=>c.tool==="launch_app"),false);
    assert.equal(after.calls.some((c:any)=>c.tool==="get_window_state"&&c.args.probe_only!==true&&c.args.window_id===next.window_id),false);
  });

it("app keyboard scope rejects stale observed targets and missing current windows before input", async () => {
    const {opensky,statePath}=await makeHarness();
    const initial=await opensky.get_app_state({app:"TextEdit",includeScreenshot:false});
    await assert.rejects(opensky.press_key({app:initial.targetHandle,key:"Return",scope:"app",element_index:2}),/cannot carry an observed/);
    await assert.rejects(opensky.type_text({app:initial.targetHandle,text:"no",scope:"app",x:10,y:10}),/cannot carry an observed/);
    const fixture=JSON.parse(await readFile(statePath,"utf8"));fixture.apps.find((a:any)=>a.name==="TextEdit").windows=[];
    await writeFile(statePath,JSON.stringify(fixture));
    await assert.rejects(opensky.press_key({app:initial.targetHandle,key:"super+n",scope:"app"}),/no unambiguous/);
    const after=JSON.parse(await readFile(statePath,"utf8"));
    assert.equal(after.calls.some((c:any)=>["hotkey","press_key","type_text","launch_app"].includes(c.tool)),false);
  });
});
