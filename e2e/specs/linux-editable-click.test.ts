import { expect } from "vitest";
import { test } from "../fixtures/linux-editable-click.js";

test("CLICK-L03: clicking an editable title focuses it without accepting the dialog", { timeout: 240_000 }, async ({ app, dialog, document, titleField }) => {
  await app.click(titleField.index);
  await expect(titleField.observe()).resolves.toContain('dialog = "Validity"');
  await app.pressKey("CTRL+A");
  await app.typeText(titleField.replacement);
  await expect(titleField.observe()).resolves.toContain(JSON.stringify(titleField.replacement));
  await app.click(dialog.okPoint);
  await expect(dialog.observe()).resolves.toMatchObject({ open: false });
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*Excel.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.readPromptTitles(), { timeout: 10_000 }).toEqual(titleField.expectedTitles);
  await expect(document.readChoices()).resolves.toEqual(document.expectedChoices);
  await expect(document.readValues()).resolves.toEqual(document.originalValues);
});
