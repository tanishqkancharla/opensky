import { expect } from "vitest";
import { test } from "../fixtures/linux-hybrid-selection-arrows.js";

// Hold initial selection and desktop setup constant. Saved replacement is the
// visible oracle. Predictions preserve the original failure, not a success regrade.
test("HYBRID-ARROW-L01: OpenSky keys after the shared selection replace O", { timeout: 180_000 }, async ({ app, paragraph, document }) => {
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

test("HYBRID-ARROW-L02: native keys after the same selection replace O", { timeout: 180_000 }, async ({ app, sky, paragraph, document }) => {
  await app.selectText(paragraph, "H2O");
  await app.getAXState();
  await sky.press_key({ key: "Right" });
  await sky.press_key({ key: "Left" });
  await sky.press_key({ key: "Left" });
  await sky.press_key({ key: "SHIFT+Right" });
  await sky.type_text({ text: "MARK" });
  await sky.press_key({ key: "CTRL+s" });
  await expect.poll(() => document.readText(), { timeout: 10_000 }).toBe("First paragraph must stay unchanged.\nH2MARK—Soak up the Science.\nLast paragraph must stay unchanged.");
});

test("HYBRID-ARROW-L03: native replacement after direct digit selection edits only 2", { timeout: 180_000 }, async ({ app, sky, paragraph, document }) => {
  await app.selectText(paragraph, "2", { prefix: "H", suffix: "O" });
  await app.getAXState();
  await sky.type_text({ text: "MARK" });
  await sky.press_key({ key: "CTRL+s" });
  await expect.poll(() => document.readText(), { timeout: 10_000 }).toBe("First paragraph must stay unchanged.\nHMARKO—Soak up the Science.\nLast paragraph must stay unchanged.");
});
