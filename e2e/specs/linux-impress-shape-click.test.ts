import { expect } from "vitest";
import { test } from "../fixtures/linux-impress-shape-click.js";

// Characterize the retained real Impress behavior: after either title click,
// Enter inserts a paragraph break. These are not text-preservation workflows.
test("SHAPE-CLICK-L01: indexed title click then Enter splits the title and preserves other text", { timeout: 180_000 }, async ({ app, shapeIndex, splitTitleTexts, document }) => {
  await app.click(shapeIndex);
  await app.pressKey("ENTER");
  await app.pressKey("CTRL+A");
  await app.getAXStateAndScreenshot({ disableDiffing: true });
  // A formatting edit makes both paths save a real edited PPTX, so unchanged
  // input bytes cannot give an early false pass while a save is still pending.
  await app.pressKey("CTRL+B");
  await app.pressKey("ESC");
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*PowerPoint.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.changed(), { timeout: 10_000 }).toBe(true);
  await expect.poll(() => document.readTexts(), { timeout: 10_000 }).toEqual(splitTitleTexts);
});

test("SHAPE-CLICK-L02: coordinate title click then Enter splits the title and preserves other text", { timeout: 180_000 }, async ({ app, titlePoint, splitTitleTexts, document }) => {
  await app.click(titlePoint);
  await app.pressKey("ENTER");
  await app.pressKey("CTRL+A");
  await app.getAXStateAndScreenshot({ disableDiffing: true });
  await app.pressKey("CTRL+B");
  await app.pressKey("ESC");
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*PowerPoint.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.changed(), { timeout: 10_000 }).toBe(true);
  await expect.poll(() => document.readTexts(), { timeout: 10_000 }).toEqual(splitTitleTexts);
});

// One-input control against L01: omit Enter and retain the real formatting/save
// operation. This tests whether the click already permits text editing.
test("SHAPE-CLICK-L03: indexed title click can format text without Enter", { timeout: 180_000 }, async ({ app, shapeIndex, originalTexts, document }) => {
  await app.click(shapeIndex);
  await app.pressKey("CTRL+A");
  await app.getAXStateAndScreenshot({ disableDiffing: true });
  await app.pressKey("CTRL+B");
  await app.pressKey("ESC");
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*PowerPoint.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.changed(), { timeout: 10_000 }).toBe(true);
  await expect.poll(() => document.readTexts(), { timeout: 10_000 }).toEqual(originalTexts);
  await expect(document.readTitleFormatChange()).resolves.toEqual({ before: { bold: false, sizePt: 70 }, after: { bold: true, sizePt: 70 } });
});
