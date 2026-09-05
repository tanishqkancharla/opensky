import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseXdotoolKey, toHotkeyKeys } from "../src/keys.js";

describe("parseXdotoolKey", () => {
  it("maps Return and keypad aliases", () => {
    assert.deepEqual(parseXdotoolKey("Return"), { key: "return", modifiers: [] });
    assert.deepEqual(parseXdotoolKey("KP_Enter"), { key: "return", modifiers: [] });
    assert.deepEqual(parseXdotoolKey("KP_0"), { key: "0", modifiers: [] });
    assert.deepEqual(parseXdotoolKey("Up"), { key: "up", modifiers: [] });
    assert.deepEqual(parseXdotoolKey("RightArrow"), { key: "right", modifiers: [] });
  });

  it("parses super+a as cmd+a", () => {
    const parsed = parseXdotoolKey("super+a");
    assert.deepEqual(parsed, { key: "a", modifiers: ["cmd"] });
    assert.deepEqual(toHotkeyKeys(parsed), ["cmd", "a"]);
  });

  it("normalizes macOS command aliases for menu shortcuts", () => {
    for (const alias of ["cmd", "command", "super", "meta", "win"]) {
      const parsed = parseXdotoolKey(`${alias}+f`);
      assert.deepEqual(parsed, { key: "f", modifiers: ["cmd"] });
      assert.deepEqual(toHotkeyKeys(parsed), ["cmd", "f"]);
    }
    assert.deepEqual(toHotkeyKeys(parseXdotoolKey("super+z")), ["cmd", "z"]);
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
