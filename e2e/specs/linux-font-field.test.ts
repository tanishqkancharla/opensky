import { expect } from "vitest";
import { test } from "../fixtures/linux-font-field.js";

// Preserve the agent's intended saved result in L01 even if its unfocused
// sequence fails. L02 isolates explicit field focus; L03 uses ordinary typing.
test("FONT-FIELD-L01: setValue then Enter changes size without changing slide text", { timeout: 180_000 }, async ({ app, fontField, document }) => {
  await app.setValue(fontField, "60 pt");
  await expect(app.getAXState({ disableDiffing: true })).resolves.toContain('paragraph "Target audience"');
  await expect(app.getAXState({ disableDiffing: true })).resolves.toContain('text "60 pt"');
  await app.pressKey("ENTER");
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState(), { timeout: 15_000 }).toMatch(/Use .*PowerPoint.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.read(), { timeout: 10_000 }).toEqual({ texts: ["Target audience"], distinctNonemptyRunSizesPt: [60] });
});

test("FONT-FIELD-L02: focused setValue and Enter preserve slide text", { timeout: 180_000 }, async ({ app, fontField, document }) => {
  await app.click(fontField);
  await app.setValue(fontField, "60 pt");
  await expect(app.getAXState({ disableDiffing: true })).resolves.toContain('paragraph "Target audience"');
  await expect(app.getAXState({ disableDiffing: true })).resolves.toContain('text "60 pt"');
  await app.pressKey("ENTER");
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState(), { timeout: 15_000 }).toMatch(/Use .*PowerPoint.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.read(), { timeout: 10_000 }).toEqual({ texts: ["Target audience"], distinctNonemptyRunSizesPt: [60] });
});

test("FONT-FIELD-L03: focused typing and Enter preserve slide text", { timeout: 180_000 }, async ({ app, fontField, document }) => {
  await app.click(fontField);
  await app.pressKey("CTRL+A");
  await app.typeText("60");
  await app.pressKey("ENTER");
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState(), { timeout: 15_000 }).toMatch(/Use .*PowerPoint.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.read(), { timeout: 10_000 }).toEqual({ texts: ["Target audience"], distinctNonemptyRunSizesPt: [60] });
});

// Visible part of the size editor in retained before02/before.png (1280x883).
// Native's passing agent used the corresponding visible field coordinates.
test("FONT-FIELD-L04: visible font-field click and typing preserve slide text", { timeout: 180_000 }, async ({ app, document }) => {
  await app.getScreenshot();
  await app.click([1213, 173]);
  await app.pressKey("CTRL+A");
  await app.typeText("60");
  await app.pressKey("ENTER");
  await app.getAXState({ disableDiffing: true });
  await app.getScreenshot();
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState(), { timeout: 15_000 }).toMatch(/Use .*PowerPoint.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.read(), { timeout: 10_000 }).toEqual({ texts: ["Target audience"], distinctNonemptyRunSizesPt: [60] });
});

// Same observation cadence as L04; only the public click target differs.
test("FONT-FIELD-L05: indexed field click with the same observations preserves slide text", { timeout: 180_000 }, async ({ app, fontField, document }) => {
  await app.getScreenshot();
  await app.click(fontField);
  await app.pressKey("CTRL+A");
  await app.typeText("60");
  await app.pressKey("ENTER");
  await app.getAXState({ disableDiffing: true });
  await app.getScreenshot();
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState(), { timeout: 15_000 }).toMatch(/Use .*PowerPoint.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.read(), { timeout: 10_000 }).toEqual({ texts: ["Target audience"], distinctNonemptyRunSizesPt: [60] });
});

// Exact source-derived indexed center versus raw AT-SPI center. The retained
// before02 probe reports a 17px client-origin rebase on already-screen bounds.
test("FONT-FIELD-L06: rebased center click preserves slide text", { timeout: 180_000 }, async ({ app, document }) => {
  await app.getScreenshot();
  await app.click([1227, 190]);
  await app.pressKey("CTRL+A");
  await app.typeText("60");
  await app.pressKey("ENTER");
  await app.getAXState({ disableDiffing: true });
  await app.getScreenshot();
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState(), { timeout: 15_000 }).toMatch(/Use .*PowerPoint.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.read(), { timeout: 10_000 }).toEqual({ texts: ["Target audience"], distinctNonemptyRunSizesPt: [60] });
});


test("FONT-FIELD-L07: raw screen center click preserves slide text", { timeout: 180_000 }, async ({ app, document }) => {
  await app.getScreenshot();
  await app.click([1227, 173]);
  await app.pressKey("CTRL+A");
  await app.typeText("60");
  await app.pressKey("ENTER");
  await app.getAXState({ disableDiffing: true });
  await app.getScreenshot();
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState(), { timeout: 15_000 }).toMatch(/Use .*PowerPoint.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.read(), { timeout: 10_000 }).toEqual({ texts: ["Target audience"], distinctNonemptyRunSizesPt: [60] });
});
