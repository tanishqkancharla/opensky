import { expect } from "vitest";
import { test as base } from "../fixtures/linux-dropdown.js";

const test = base.extend({ listSelection: "typed" as const });

test("DROPDOWN-L04: an out-of-image click leaves observed OK able to save validation", { timeout: 240_000 }, async ({ app, dialog, document }) => {
  await app.click(dialog.entriesPoint);
  await app.typeText("Pass\nFail\nHeld");
  await app.getAXStateAndScreenshot();
  await expect(app.click([423, 653])).rejects.toThrow(/Latest screenshot.*No input was sent/s);
  await app.click(dialog.initialOkIndex);
  await app.getAXStateAndScreenshot();
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*Excel.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.readChoices(), { timeout: 10_000 }).toEqual(document.expectedChoices);
  await expect(document.readValues()).resolves.toEqual(document.originalValues);
});
