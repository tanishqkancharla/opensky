import { expect } from "vitest";
import { test } from "../fixtures/linux-visible-controls.js";

test("VISIBLE-L01: label identifies the visible editor and hidden tab contents disappear", { timeout: 240_000 }, async ({ app, form, document }) => {
  await expect(form.read()).resolves.not.toContain('label = "Maximum:"');
  await expect(form.read()).resolves.toContain('panel = "Entries"');
  await form.setEntries("Pass\nFail\nHeld");
  await expect(form.read()).resolves.toContain("Pass");
  await form.selectTab("Input Help");
  await expect(form.read()).resolves.not.toContain('panel = "Entries"');
  await expect(form.read()).resolves.not.toContain("Pass");
  await form.selectTab("Criteria");
  await expect(form.read()).resolves.toContain("Pass");
  await form.accept();
  await expect(form.read()).resolves.toContain('frame = "Order_Id_Mark_Pass_Fail.xlsx — LibreOffice Calc"');
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*Excel.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.readChoices(), { timeout: 10_000 }).toEqual(document.expectedChoices);
  await expect(document.readValues()).resolves.toEqual(document.originalValues);
});
