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
