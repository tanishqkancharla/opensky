import { expect } from "vitest";
import { test } from "../fixtures/linux-native-selection-arrows.js";

// CI34548153115 independently saved H2MARK with this exact native sequence.
// Preserve its observed selection behavior; retain the original failed hypothesis.
test("SELECT-ARROW-NATIVE-L03: native Find and arrows replace the selected O", { timeout: 180_000 }, async ({ sky, document }) => {
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
  await expect.poll(() => document.readText(), { timeout: 10_000 }).toBe("First paragraph must stay unchanged.\nH2MARK—Soak up the Science.\nLast paragraph must stay unchanged.");
});
