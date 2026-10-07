import { expect } from "vitest";
import { test, prepareSaveDocument, saveButtonIndex } from "../fixtures/linux-typing.js";

test("TYPE-L01: types once into the selected document and saves the actual text", async ({ app, document, keyboard }) => {
  await app.pressKey("CTRL+A");
  await app.typeText("A café near Dublin Zoo — 中文 😀.");
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toContain("Use Word 2007 Format");
  await app.pressKey("ENTER");
  await expect.poll(() => document.readText(), { timeout: 10_000 }).toBe("A café near Dublin Zoo — 中文 😀.");
  await expect(keyboard.unchanged()).resolves.toBe(true);
});

test("TYPE-L03: saves every Unicode character when the application briefly stalls", { timeout: 120_000 }, async ({ app, document, keyboard }) => {
  await app.pressKey("CTRL+A");
  await app.typeText("A café near Dublin Zoo — 中文 😀.");
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toContain("Use Word 2007 Format");
  await app.pressKey("ENTER");
  await expect.poll(() => document.readText(), { timeout: 10_000 }).toBe("A café near Dublin Zoo — 中文 😀.");
  await expect(keyboard.unchanged()).resolves.toBe(true);
});

test("KEY-L01: a menu accelerator does not insert its letter into the document", async ({ app, document }) => {
  await app.pressKey("CTRL+A");
  await app.typeText("Keep this text.");
  await app.pressKey("ALT+O");
  await app.pressKey("ESCAPE");
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toContain("Use Word 2007 Format");
  await app.pressKey("ENTER");
  await expect.poll(() => document.readText(), { timeout: 10_000 }).toBe("Keep this text.");
});

test("CLICK-L01: a freshly observed save button saves the document", async ({ app, document }) => {
  const expected = await prepareSaveDocument(app, "Save this document.");
  const state = await app.getAXState({ disableDiffing: true });
  await app.click(saveButtonIndex(state));
  await expect.poll(() => document.readText(), { timeout: 10_000 }).toBe(expected);
});

test("COORD-L01: a screenshot click edits the font dialog rather than the document behind it", { timeout: 120_000 }, async ({ app }) => {
  await app.pressKey("ALT+O");
  const documentState = await app.getAXState({ disableDiffing: true });
  expect(documentState).toMatch(/\[(\d+)\] menu item "Character\.\.\."/);
  await app.click(Number(documentState.match(/\[(\d+)\] menu item "Character\.\.\."/)![1]));
  const dialog = await app.getAXStateAndScreenshot({ disableDiffing: true });
  expect(dialog.state).toContain('dialog = "Character"');
  // Family field in the observed Character dialog screenshot.
  await app.click([350, 75]);
  await expect(app.getAXState({ disableDiffing: true })).resolves.toContain('dialog = "Character"');
  await app.pressKey("CTRL+A");
  await app.typeText("Liberation Serif");
  // LibreOffice names this editable after its value and exposes Family as a
  // separate label. Require one exact editable value; a font-list cell or an
  // appended old value must not satisfy the assertion.
  const edited = await app.getAXState({ disableDiffing: true });
  expect(edited).toContain('dialog = "Character"');
  expect(edited.match(/^\s*- \[\d+\] text "[^"]*" value="Liberation Serif"(?: |$)/gm)).toHaveLength(1);
});

test("SHOT-L01: a screenshot preserves the observed save button target", { timeout: 120_000 }, async ({ app, document }) => {
  const expected = await prepareSaveDocument(app, "Save after observing a screenshot.");
  const state = await app.getAXState({ disableDiffing: true });
  const index = saveButtonIndex(state);
  await app.getScreenshot();
  await app.click(index);
  await expect.poll(() => document.readText(), { timeout: 10_000 }).toBe(expected);
});

test("SHOT-L02: a screenshot of the new dialog targets its font field", { timeout: 120_000 }, async ({ app }) => {
  await app.pressKey("ALT+O");
  const state = await app.getAXState({ disableDiffing: true });
  expect(state).toMatch(/\[(\d+)\] menu item "Character\.\.\."/);
  await app.click(Number(state.match(/\[(\d+)\] menu item "Character\.\.\."/)![1]));
  await app.getScreenshot();
  // Coordinates in the Character dialog, observed by the preceding screenshot.
  await app.click([350, 75]);
  await app.pressKey("CTRL+A");
  await app.typeText("Liberation Serif");
  await expect(app.getAXState({ disableDiffing: true })).resolves.toContain('dialog = "Character"');
  // LibreOffice names this editable after its value and exposes Family as a
  // separate label. Require one exact editable value; a font-list cell or an
  // appended old value must not satisfy the assertion.
  const edited = await app.getAXState({ disableDiffing: true });
  expect(edited).toContain('dialog = "Character"');
  expect(edited.match(/^\s*- \[\d+\] text "[^"]*" value="Liberation Serif"(?: |$)/gm)).toHaveLength(1);
});

test("COORD-L02: rejects a point outside the observed dialog and accepts a corrected save click", { timeout: 120_000 }, async ({ app, document }) => {
  await app.pressKey("CTRL+A");
  await app.typeText("Save after correcting the screenshot coordinates.");
  await app.pressKey("CTRL+S");
  await app.getScreenshot();
  // This point was used in agent25: inside the document, below its small dialog image.
  await expect(app.click([448, 588])).rejects.toMatchObject({ code: "invalid_params", message: expect.stringContaining("Latest screenshot is") });
  await expect(app.getAXState({ disableDiffing: true })).resolves.toContain("Use Word 2007 Format");
  await app.getScreenshot();
  await app.click([450, 172]);
  await expect.poll(() => document.readText(), { timeout: 10_000 }).toBe("Save after correcting the screenshot coordinates.");
});

test("COORD-L03: a fresh document observation replaces the old dialog's coordinate bounds", { timeout: 120_000 }, async ({ app, document }) => {
  await app.pressKey("CTRL+A");
  await app.typeText("A document after its dialog closes.");
  await app.pressKey("CTRL+S");
  await app.getScreenshot();
  await app.click([450, 172]);
  await expect(app.getAXState({ disableDiffing: true })).resolves.not.toContain("Use Word 2007 Format");
  await app.click([400, 500]);
  await app.pressKey("CTRL+END");
  await app.typeText(" Still editable.");
  await app.pressKey("CTRL+S");
  await expect.poll(() => document.readText(), { timeout: 10_000 }).toBe("A document after its dialog closes. Still editable.");
});

// One ordinary input event large enough to exercise slow real keyboard delivery.
const longDocument = "The quick brown fox jumps over the lazy dog. ".repeat(100);

test("TYPE-L02: saves a long document entered in one typing action", { timeout: 240_000 }, async ({ app, document, keyboard }) => {
  await app.pressKey("CTRL+A");
  await app.typeText(longDocument);
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toContain("Use Word 2007 Format");
  await app.pressKey("ENTER");
  await expect.poll(() => document.readText(), { timeout: 10_000 }).toBe(longDocument);
  await expect(keyboard.unchanged()).resolves.toBe(true);
});
