import { expect } from "vitest";
import { test } from "../fixtures/linux-selection-arrows.js";

test("SELECT-ARROW-L01: direct digit selection replaces only 2", { timeout: 180_000 }, async ({ app, paragraph, document }) => {
  await app.selectText(paragraph, "2", { prefix: "H", suffix: "O" });
  await app.typeText("MARK");
  await app.pressKey("CTRL+S");
  await expect.poll(() => document.readText(), { timeout: 10_000 }).toBe("First paragraph must stay unchanged.\nHMARKO—Soak up the Science.\nLast paragraph must stay unchanged.");
});

// Native control CI34548153115 replaces O with this exact Find/arrow sequence.
// Preserve that observed native behavior across both selection entry points.
// Original digit-intent failures remain in selection-arrows-before-01.
test("SELECT-ARROW-L02: Text selection and arrows match the native selected O", { timeout: 180_000 }, async ({ app, paragraph, document }) => {
  await app.selectText(paragraph, "H2O");
  await app.pressKey("ARROWRIGHT");
  await app.pressKey("ARROWLEFT");
  await app.pressKey("SHIFT+ARROWRIGHT");
  await app.getAXState();
  await app.pressKey("ARROWLEFT");
  await app.pressKey("SHIFT+ARROWLEFT");
  await app.getAXState();
  await app.typeText("MARK");
  await app.pressKey("CTRL+S");
  await expect.poll(() => document.readText(), { timeout: 10_000 }).toBe("First paragraph must stay unchanged.\nH2MARK—Soak up the Science.\nLast paragraph must stay unchanged.");
});

test("SELECT-ARROW-L03: Find and arrows match the native selected O", { timeout: 180_000 }, async ({ app, document }) => {
  await app.pressKey("CTRL+HOME");
  await app.pressKey("CTRL+F");
  await app.typeText("H2O");
  await app.pressKey("ENTER");
  await app.pressKey("ESC");
  await app.pressKey("ARROWRIGHT");
  await app.pressKey("ARROWLEFT");
  await app.pressKey("SHIFT+ARROWRIGHT");
  await app.getAXState();
  await app.pressKey("ARROWLEFT");
  await app.pressKey("SHIFT+ARROWLEFT");
  await app.getAXState();
  await app.typeText("MARK");
  await app.pressKey("CTRL+S");
  await expect.poll(() => document.readText(), { timeout: 10_000 }).toBe("First paragraph must stay unchanged.\nH2MARK—Soak up the Science.\nLast paragraph must stay unchanged.");
});
