import assert from "node:assert/strict";
import { describe, it } from "bun:test";

import { parseXdotoolKey, toHotkeyKeys } from "../src/keys.js";

describe("parseXdotoolKey", () => {
  it("maps Return and keypad aliases", () => {
    assert.deepEqual(parseXdotoolKey("Return"), { key: "return", modifiers: [] });
    assert.deepEqual(parseXdotoolKey("KP_Enter"), { key: "return", modifiers: [] });
    assert.deepEqual(parseXdotoolKey("KP_0"), { key: "0", modifiers: [] });
    assert.deepEqual(parseXdotoolKey("Up"), { key: "up", modifiers: [] });
  });

  it("parses super+a as cmd+a", () => {
    const parsed = parseXdotoolKey("super+a");
    assert.deepEqual(parsed, { key: "a", modifiers: ["cmd"] });
    assert.deepEqual(toHotkeyKeys(parsed), ["cmd", "a"]);
  });

  it("parses ctrl+shift+s", () => {
    assert.deepEqual(parseXdotoolKey("ctrl+shift+s"), {
      key: "s",
      modifiers: ["ctrl", "shift"],
    });
  });

  it("rejects empty keys", () => {
    assert.throws(() => parseXdotoolKey("  "), /Invalid params/);
  });
});
