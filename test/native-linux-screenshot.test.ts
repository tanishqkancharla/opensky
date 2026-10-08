import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createOpenSky } from "../src/opensky.js";
import { createCua } from "../src/cua.js";
import { makeHarness } from "./harness.ts";

async function captureHarness(target: "linux" | "mac") {
  const { driver, dir, statePath } = await makeHarness();
  const original = driver.call.bind(driver);
  let current = "";
  let capture = false;
  let failure: "degraded" | "invalid-frame" | "throw" | undefined;
  let changed = false;
  const reads: Record<string, unknown>[] = [];
  const inputs: Record<string, unknown>[] = [];
  driver.call = async (tool, args) => {
    if (tool === "click") {
      inputs.push(args!);
      assert.equal(args?.snapshot_id, current, "input uses the current driver snapshot");
      assert.ok(String(args?.element_token).startsWith(`${current}:`));
    }
    if (tool === "get_window_state" && args?.probe_only !== true) {
      reads.push(args!);
      capture = args?.include_screenshot === true;
      if (capture && failure === "throw") throw new Error("capture transport failure");
    }
    const retained = tool === "get_window_state" && capture && target === "mac" && args?.include_accessibility_tree === false
      ? JSON.parse(await readFile(statePath, "utf8")).snapshots : undefined;
    const result = await original(tool, args);
    if (retained) {
      const fixture = JSON.parse(await readFile(statePath, "utf8"));
      fixture.snapshots = retained;
      await writeFile(statePath, JSON.stringify(fixture));
    }
    if (tool === "get_window_state" && args?.probe_only !== true) {
      const state = result.structured as Record<string, any>;
      // The Linux capture-only contract retires the old semantic snapshot.
      // Mac capture-only leaves it usable. A combined read publishes fresh tokens.
      if (!(capture && target === "mac" && args?.include_accessibility_tree === false)) current = String(state.snapshot_id);
      if (capture && args?.include_accessibility_tree === false) {
        delete state.snapshot_id; state.elements = []; state.tree_markdown = "";
      } else if (changed) {
        const element = state.elements.find((element: any) => element.element_index === 13);
        element.value = "changed while capturing";
        state.tree_markdown = state.tree_markdown.replace(/\[13\][^\n]*/, '[13] AXButton 7 value="changed while capturing"');
      }
      if (capture && failure === "degraded") state.degraded = true;
      if (capture && failure === "invalid-frame") state.screenshot_frame_valid = false;
    }
    return result;
  };
  const opensky = createOpenSky({ driver, target, homeDir: join(dir, `${target}-capture`), screenshotDir: join(dir, "shots"), settleDelayMs: 0 });
  const app = await createCua(opensky).getApp("Calculator", { emit: false });
  return { opensky, app, reads, inputs, setFailure: (value: typeof failure) => { failure = value; }, setChanged: () => { changed = true; } };
}

test("Linux screenshot refreshes exact button tokens without consuming the visible AX diff", async () => {
  const h = await captureHarness("linux");
  try {
    const before = await h.app.getAXState({ disableDiffing: true, emit: false });
    assert.match(before, /\[13\] AXButton/);
    h.setChanged();
    const count = h.reads.length;
    const pixels = await h.app.getScreenshot({ emit: false });
    assert.ok(pixels.byteLength > 0);
    assert.equal(h.reads.length, count + 1, "one atomic AX and image collection");
    assert.equal(h.reads.at(-1)!.include_accessibility_tree, undefined);
    const diff = await h.app.getAXState({ emit: false });
    assert.match(diff, /changed while capturing/, "screenshot does not consume the last visible AX baseline");
    await h.app.click(13);
    assert.equal(h.inputs.length, 1);
  } finally { await h.opensky.close(); }
});

test("Linux screenshot then indexed click uses fresh bindings without another AX read", async () => {
  const h = await captureHarness("linux");
  try {
    await h.app.getAXState({ disableDiffing: true, emit: false });
    await h.app.getScreenshot({ emit: false });
    const count = h.reads.length;
    await h.app.click(13);
    assert.equal(h.reads.length, count);
    assert.equal(h.inputs.length, 1);
  } finally { await h.opensky.close(); }
});

for (const failure of ["degraded", "invalid-frame", "throw"] as const) {
  test(`Linux ${failure} screenshot clears retired input authority`, async () => {
    const h = await captureHarness("linux");
    try {
      await h.app.getAXState({ disableDiffing: true, emit: false });
      h.setFailure(failure);
      await assert.rejects(h.app.getScreenshot({ emit: false }));
      await assert.rejects(h.app.click(13), /not present in the latest accessibility snapshot/);
      assert.equal(h.inputs.length, 0, "no input replay after failed capture");
    } finally { await h.opensky.close(); }
  });
}

test("Mac screenshot retains its existing capture-only route and button binding", async () => {
  const h = await captureHarness("mac");
  try {
    await h.app.getAXState({ disableDiffing: true, emit: false });
    await h.app.getScreenshot({ emit: false });
    assert.equal(h.reads.at(-1)!.include_accessibility_tree, false);
    await h.app.click(13);
    assert.equal(h.inputs.length, 1);
  } finally { await h.opensky.close(); }
});


test("Linux shared context action is stated once without dropping controls or fresh tokens", async () => {
  const { driver, dir } = await makeHarness();
  const original = driver.call.bind(driver);
  const source = '- [0] frame "Calculator" [actions=[showContextMenu]]\n  - [13] push button "7 [actions=[showContextMenu]]" [actions=[press,showContextMenu]]';
  let current = "";
  driver.call = async (tool, args) => {
    if (tool === "click") assert.equal(args?.snapshot_id, current);
    const result = await original(tool, args);
    if (tool === "get_window_state" && args?.probe_only !== true) {
      const state = result.structured as Record<string, any>;
      current = state.snapshot_id;
      const button = state.elements.find((e: any) => e.element_index === 13);
      state.tree_markdown = source;
      state.elements = [
        { ...state.elements[0], element_index: 0, role: "frame", label: "Calculator", actions: ["showContextMenu"] },
        { ...button, role: "push button", label: "7 [actions=[showContextMenu]]", actions: ["press", "showContextMenu"] },
      ];
    }
    return result;
  };
  const opensky = createOpenSky({ driver, target: "linux", homeDir: join(dir, "shared-context"), settleDelayMs: 0 });
  try {
    const app = await createCua(opensky).getApp("Calculator", { emit: false });
    const state = await app.getAXState({ disableDiffing: true, emit: false });
    assert.match(state, /Every indexed control in this view also supports showContextMenu/);
    assert.match(state, /\[13\] push button "7 \[actions=\[showContextMenu\]\]" \[actions=\[press\]\]/, "literal label remains untouched");
    await app.click(13);
  } finally { await opensky.close(); }
});
