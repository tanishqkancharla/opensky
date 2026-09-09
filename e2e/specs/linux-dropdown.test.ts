import { expect } from "vitest";
import { test } from "../fixtures/linux-dropdown.js";

test("DROPDOWN-L01: multiline text stays in Entries and saves choices for the selected range", { timeout: 240_000 }, async ({ app, dialog, document }) => {
  await app.click(dialog.entriesPoint);
  await expect(dialog.observe()).resolves.toMatchObject({ open: true, choices: [] });
  await app.typeText("Pass\nFail\nHeld");
  await expect(dialog.observe()).resolves.toMatchObject({ open: true, choices: ["Pass", "Fail", "Held"] });
  await app.click(dialog.okPoint);
  await expect(dialog.observe()).resolves.toMatchObject({ open: false });
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*Excel.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.readChoices(), { timeout: 10_000 }).toEqual(document.expectedChoices);
  await expect(document.readValues()).resolves.toEqual(document.originalValues);
});
