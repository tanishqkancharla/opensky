import { expect } from "vitest";
import { test } from "../fixtures/linux-dropdown-consumer.js";

// Preserve normal AutoInput. The pre-Enter image/AX is evidence of the actual
// editor content, including any selected completion; it is not inferred from
// the typeText argument. A failure here does not by itself attribute a driver bug.
test("DROPDOWN-C01: commits a typed allowed value after two preceding values", { timeout: 240_000 }, async ({ app, document, expectedValues }) => {
  await app.typeText("Fail");
  await app.pressKey("ENTER");
  await app.typeText("Fail");
  await app.pressKey("ENTER");
  await app.typeText("Pass");
  await app.getAXStateAndScreenshot({ disableDiffing: true });
  await app.pressKey("ENTER");
  await expect(app.getAXStateAndScreenshot({ disableDiffing: true })).resolves.toMatchObject({ state: expect.not.stringMatching(/alert = "Error"|Invalid value/) });
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*Excel.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.readValues(), { timeout: 10_000 }).toEqual(expectedValues);
  await expect(document.readChoices()).resolves.toEqual(document.expectedChoices);
});

test("DROPDOWN-C02: commits an allowed dropdown choice after two preceding values", { timeout: 240_000 }, async ({ app, document, expectedValues }) => {
  await app.typeText("Fail");
  await app.pressKey("ENTER");
  await app.typeText("Fail");
  await app.pressKey("ENTER");
  await app.pressKey("ALT+ARROWDOWN");
  await app.getAXStateAndScreenshot({ disableDiffing: true });
  await app.pressKey("HOME");
  await app.pressKey("ENTER");
  await expect(app.getAXStateAndScreenshot({ disableDiffing: true })).resolves.toMatchObject({ state: expect.not.stringMatching(/alert = "Error"|Invalid value/) });
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*Excel.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.readValues(), { timeout: 10_000 }).toEqual(expectedValues);
  await expect(document.readChoices()).resolves.toEqual(document.expectedChoices);
});

test("DROPDOWN-C03: rejects the selected AutoInput suffix before committing an allowed value", { timeout: 240_000 }, async ({ app, document, expectedValues }) => {
  await app.typeText("Fail");
  await app.pressKey("ENTER");
  await app.typeText("Fail");
  await app.pressKey("ENTER");
  await app.typeText("Pass");
  await app.getAXStateAndScreenshot({ disableDiffing: true });
  await app.pressKey("BACKSPACE");
  await app.getAXStateAndScreenshot({ disableDiffing: true });
  await app.pressKey("ENTER");
  await expect(app.getAXStateAndScreenshot({ disableDiffing: true })).resolves.toMatchObject({ state: expect.not.stringMatching(/alert = "Error"|Invalid value/) });
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*Excel.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.readValues(), { timeout: 10_000 }).toEqual(expectedValues);
  await expect(document.readChoices()).resolves.toEqual(document.expectedChoices);
});
