import { expect } from "vitest";
import { test } from "../fixtures/linux-selection-arrows.js";

test("SELECT-ARROW-L01: direct digit selection replaces only 2", { timeout: 180_000 }, async ({ app, paragraph, document }) => {
  await app.selectText(paragraph, "2", { prefix: "H", suffix: "O" });
  await app.typeText("MARK");
  await app.pressKey("CTRL+S");
  await expect.poll(() => document.readText(), { timeout: 10_000 }).toBe("First paragraph must stay unchanged.\nHMARKO—Soak up the Science.\nLast paragraph must stay unchanged.");
});

// These two cases test the same intended digit outcome through different
// selection entry points. A shared failure may reveal Writer arrow semantics;
// the saved diagnostics retain the actual replaced character without guessing.
test("SELECT-ARROW-L02: retained arrow sequence narrows native Text selection to 2", { timeout: 180_000 }, async ({ app, paragraph, document }) => {
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
  await expect.poll(() => document.readText(), { timeout: 10_000 }).toBe("First paragraph must stay unchanged.\nHMARKO—Soak up the Science.\nLast paragraph must stay unchanged.");
});

test("SELECT-ARROW-L03: same arrow sequence narrows ordinary Find selection to 2", { timeout: 180_000 }, async ({ app, document }) => {
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
  await expect.poll(() => document.readText(), { timeout: 10_000 }).toBe("First paragraph must stay unchanged.\nHMARKO—Soak up the Science.\nLast paragraph must stay unchanged.");
});
