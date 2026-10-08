import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseXdotoolKey, toHotkeyKeys, toMacDriverKey } from "../src/keys.js";

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

  it("keeps platform modifier aliases and removes repeated aliases", () => {
    assert.deepEqual(parseXdotoolKey("alt+option+o"), { key: "o", modifiers: ["option"] });
    assert.deepEqual(parseXdotoolKey("alt+option+o", "linux"), { key: "o", modifiers: ["alt"] });
    assert.deepEqual(parseXdotoolKey("cmd+super+f", "linux"), { key: "f", modifiers: ["super"] });
    assert.deepEqual(parseXdotoolKey("alt+o", "win"), { key: "o", modifiers: ["option"] });
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


describe("Remaining verified campaign contracts", () => {
it("translates named plus for both standalone keys and modifier chords", () => {
    assert.deepEqual(toMacDriverKey(parseXdotoolKey("plus")), {key: "=", modifiers: ["shift"]});
    assert.deepEqual(toMacDriverKey(parseXdotoolKey("CMD+plus")), {key: "=", modifiers: ["cmd", "shift"]});
    assert.deepEqual(toHotkeyKeys(toMacDriverKey(parseXdotoolKey("cmd+shift+plus"))), ["cmd", "shift", "="]);
    assert.deepEqual(parseXdotoolKey("plus"), {key: "plus", modifiers: []});
  });

it("adds the physical Shift+8 for asterisk while preserving explicit modifiers", () => {
    assert.deepEqual(toMacDriverKey(parseXdotoolKey("asterisk")), {key: "8", modifiers: ["shift"]});
    assert.deepEqual(toMacDriverKey(parseXdotoolKey("ctrl+shift+asterisk")), {key: "8", modifiers: ["ctrl", "shift"]});
  });

it("maps named minus and slash to physical keys while preserving modifiers", () => {
    assert.deepEqual(toMacDriverKey(parseXdotoolKey("minus")), {key: "-", modifiers: []});
    assert.deepEqual(toMacDriverKey(parseXdotoolKey("SLASH")), {key: "/", modifiers: []});
    assert.deepEqual(toMacDriverKey(parseXdotoolKey("ctrl+minus")), {key: "-", modifiers: ["ctrl"]});
    assert.deepEqual(toMacDriverKey(parseXdotoolKey("super+shift+slash")), {key: "/", modifiers: ["cmd", "shift"]});
    assert.deepEqual(parseXdotoolKey("minus"), {key: "minus", modifiers: []});
    assert.deepEqual(parseXdotoolKey("slash"), {key: "slash", modifiers: []});
  });

it("leaves generic parsing and literal punctuation unchanged", () => {
    assert.deepEqual(parseXdotoolKey("asterisk"), {key: "asterisk", modifiers: []});
    for (const key of ["*", "-", "/", "Return", "super+a", "equals", "hyphen"]) {
      const parsed = parseXdotoolKey(key);
      assert.deepEqual(toMacDriverKey(parsed), parsed);
    }
  });
});
