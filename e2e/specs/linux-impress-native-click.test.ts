import { expect } from "vitest";
import { test } from "../fixtures/linux-impress-native-click.js";

// Hypothesis, not prior native acceptance: the identical physical title click
// followed by Enter also inserts a paragraph break through native input.
test("NATIVE-SHAPE-L01: native title click then Enter splits the title and preserves other text", { timeout: 180_000 }, async ({ native, nativeTitlePoint, nativeScreenshotText, splitTitleTexts, document }) => {
  await native.click(nativeTitlePoint);
  await native.press_key({ key: "Return" });
  await native.press_key({ key: "CTRL+a" });
  await native.get_screenshot();
  await native.press_key({ key: "CTRL+b" });
  await native.press_key({ key: "Escape" });
  await native.press_key({ key: "CTRL+s" });
  await expect.poll(nativeScreenshotText, { timeout: 15_000 }).toMatch(/Use\s+PowerPoint[\s\S]*Format/);
  await native.press_key({ key: "Return" });
  await expect.poll(() => document.changed(), { timeout: 10_000 }).toBe(true);
  await expect.poll(() => document.readTexts(), { timeout: 10_000 }).toEqual(splitTitleTexts);
});
