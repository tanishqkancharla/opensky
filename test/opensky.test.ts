import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, it } from "bun:test";

import {
  diffTrees,
  findWithContext,
  mapApps,
  normalizeDirection,
  normalizeMouseButton,
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
        },
      ],
    });
    assert.equal(apps[0].id, "com.apple.calculator");
    assert.equal(apps[0].displayName, "Calculator");
    assert.equal(apps[0].isRunning, true);
    assert.equal(typeof apps[0].lastUsedDate, "number");
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
    assert.match(text, /Added:/);
    assert.match(text, /Changed:/);
  });
});

describe("OpenSky against cua-driver", () => {
  it("lists apps and launches a cold app from get_app_state", async () => {
    const { opensky } = await makeHarness();
    const apps = await opensky.list_apps();
    assert.ok(apps.some((app) => app.displayName === "Calculator"));
    assert.ok(apps.some((app) => app.id === "com.apple.calculator"));

    const notes = await opensky.get_app_state({ app: "Notes", disableDiff: true });
    assert.equal(notes.app, "Notes");
    assert.match(notes.text, /AXWindow/);
    assert.ok(notes.screenshot?.url.startsWith("file:"));
  });

  it("returns a full tree then a diff", async () => {
    const { opensky } = await makeHarness();
    const first = await opensky.get_app_state({ app: "Calculator", disableDiff: true });
    assert.match(first.text, /\[13]/);
    await opensky.click({ app: "Calculator", element_index: 13, mouse_button: 0 });
    const second = await opensky.get_app_state({ app: "Calculator" });
    assert.match(second.text, /Changed:|No accessibility changes|Full tree/);
  });

  it("clicks, types, pastes, sets values, scrolls, and presses keys", async () => {
    const { opensky, driver } = await makeHarness();
    await opensky.get_app_state({ app: "TextEdit", disableDiff: true });

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
    await opensky.drag({
      app: "TextEdit",
      from_x: 100,
      from_y: 100,
      to_x: 200,
      to_y: 100,
    });
    await opensky.perform_secondary_action({ app: "TextEdit", element_index: 0, action: "Raise" });
    await opensky.perform_secondary_action({ app: "TextEdit", element_index: 2, action: "Show Menu" });

    const raw = await driver.call("list_apps", {});
    assert.ok(raw.structured);

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
    const { opensky } = await makeHarness();
    const state = await opensky.get_app_state({ app: "Calculator", disableDiff: true });
    assert.ok(state.screenshot);
    const bytes = await readFile(fileURLToPath(state.screenshot.url));
    assert.ok(bytes.length > 10);
    assert.equal(bytes[0], 0x89);
  });
});
