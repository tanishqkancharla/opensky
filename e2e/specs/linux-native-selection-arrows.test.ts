import { expect } from "vitest";
import { test } from "../fixtures/linux-native-selection-arrows.js";

// Preserve the original digit-intent assertion. If native also replaces O,
// retained saved output is evidence about the common Writer arrow sequence.
test("SELECT-ARROW-NATIVE-L03: native Find and arrows replace the intended digit", { timeout: 180_000 }, async ({ sky, document }) => {
  await sky.press_key({ key: "CTRL+Home" });
  await sky.press_key({ key: "CTRL+f" });
  await sky.type_text({ text: "H2O" });
  await sky.press_key({ key: "Return" });
  await sky.press_key({ key: "Escape" });
  await sky.press_key({ key: "Right" });
  await sky.press_key({ key: "Left" });
  await sky.press_key({ key: "SHIFT+Right" });
  await sky.get_screenshot();
  await sky.press_key({ key: "Left" });
  await sky.press_key({ key: "SHIFT+Left" });
  await sky.get_screenshot();
  await sky.type_text({ text: "MARK" });
  await sky.press_key({ key: "CTRL+s" });
  await expect.poll(() => document.readText(), { timeout: 10_000 }).toBe("First paragraph must stay unchanged.\nHMARKO—Soak up the Science.\nLast paragraph must stay unchanged.");
});
