import { expect } from "vitest";
import { test } from "../fixtures/linux-subscript35-selection.js";

// Positive direct-selection control. Setup and the target paragraph are the
// same real disposable Writer document used by the earlier arrow diagnostics.
test("SUBSCRIPT35-L01: direct digit selection replaces only 2", { timeout: 180_000 }, async ({ app, paragraph, document }) => {
  await app.selectText(paragraph, "2", { prefix: "H", suffix: "O" });
  await app.getAXState();
  await app.typeText("MARK");
  await app.pressKey("CTRL+S");
  await expect.poll(() => document.readText(), { timeout: 10_000 }).toBe("First paragraph must stay unchanged.\nHMARKO—Soak up the Science.\nLast paragraph must stay unchanged.");
});

// Diagnostic prediction from paid arm35's saved O subscripts, not a new native
// contract or proof of cause. Keep its exact four-arrow sequence and initial
// observation. Replacement makes the selected character independently visible.
// A failed prediction remains evidence; do not repair/retry the gesture here.
test("SUBSCRIPT35-D01: replay arm35 four arrows and identify the selected O", { timeout: 180_000 }, async ({ app, paragraph, document }) => {
  await app.selectText(paragraph, "H2O");
  await app.getAXState();
  await app.pressKey("ARROWRIGHT");
  await app.pressKey("ARROWLEFT");
  await app.pressKey("ARROWLEFT");
  await app.pressKey("SHIFT+ARROWRIGHT");
  await app.typeText("MARK");
  await app.pressKey("CTRL+S");
  await expect.poll(() => document.readText(), { timeout: 10_000 }).toBe("First paragraph must stay unchanged.\nH2MARK—Soak up the Science.\nLast paragraph must stay unchanged.");
});
