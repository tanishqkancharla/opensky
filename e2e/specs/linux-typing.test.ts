import { expect } from "vitest";
import { test } from "../fixtures/linux-typing.js";

test("TYPE-L01: types once into the selected document and saves the actual text", async ({ app, document, keyboard }) => {
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
  await app.pressKey("CTRL+A");
  await app.typeText("Save this document.");
  await app.pressKey("CTRL+S");
  const state = await app.getAXState({ disableDiffing: true });
  expect(state).toMatch(/\[(\d+)\] push button "Use Word 2007 Format"/);
  await app.click(Number(state.match(/\[(\d+)\] push button "Use Word 2007 Format"/)![1]));
  await expect.poll(() => document.readText(), { timeout: 10_000 }).toBe("Save this document.");
});

test("COORD-L01: a screenshot click edits the font dialog rather than the document behind it", async ({ app }) => {
  const documentState = await app.getAXState({ disableDiffing: true });
  expect(documentState).toMatch(/\[(\d+)\] menu item "Character\.\.\."/);
  await app.click(Number(documentState.match(/\[(\d+)\] menu item "Character\.\.\."/)![1]));
  const dialog = await app.getAXStateAndScreenshot({ disableDiffing: true });
  expect(dialog.state).toContain('dialog = "Character"');
  // Family field in the observed 665 x 551 Character dialog screenshot.
  await app.click([350, 75]);
  await expect(app.getAXState({ disableDiffing: true })).resolves.toContain('dialog = "Character"');
  await app.pressKey("CTRL+A");
  await app.typeText("Liberation Serif");
  await expect(app.getAXState({ disableDiffing: true })).resolves.toContain('text "Liberation Serif"');
});
