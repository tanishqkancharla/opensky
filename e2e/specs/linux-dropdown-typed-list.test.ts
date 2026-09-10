import { expect } from "vitest";
import { test as base } from "../fixtures/linux-dropdown.js";

const test = base.extend({ listSelection: "typed" as const });

test("DROPDOWN-L03: choosing List by typing saves the displayed choices", { timeout: 240_000 }, async ({ app, dialog, document }) => {
  await app.click(dialog.entriesPoint);
  await app.typeText("Pass\nFail\nHeld");
  await expect(dialog.observe()).resolves.toMatchObject({ open: true, choices: ["Pass", "Fail", "Held"] });
  await app.click(dialog.initialOkIndex);
  await expect(dialog.observe()).resolves.toMatchObject({ open: false });
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*Excel.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.readChoices(), { timeout: 10_000 }).toEqual(document.expectedChoices);
  await expect(document.readValues()).resolves.toEqual(document.originalValues);
});
