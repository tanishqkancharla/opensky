import { expect } from "vitest";
import { test } from "../fixtures/linux-dropdown-repl.js";

test("DROPDOWN-L05: agent cell sequence saves choices through the public REPL", { timeout: 360_000 }, async ({ repl, document }) => {
  await expect(repl.cell('let app = await cua.getApp("LibreOffice"); await app.getAXStateAndScreenshot();')).resolves.toMatchObject({ error: null });
  await expect(repl.cell('await app.click([82,122]); await app.typeText("D2:D29"); await app.pressKey("ENTER"); await app.getAXStateAndScreenshot({query:"Data"});')).resolves.toMatchObject({ error: expect.stringMatching(/App scope cannot be combined with browser query/) });
  await expect(repl.cell('await app.getAXStateAndScreenshot();')).resolves.toMatchObject({ error: null });
  await expect(repl.cell('await app.pressKey("ALT+D"); await app.getAXState();')).resolves.toMatchObject({ error: null });
  await expect(repl.cell(`await app.click(${repl.index("menu item", "Validity...")}); await app.getAXStateAndScreenshot();`)).resolves.toMatchObject({ error: null });
  await expect(repl.cell(`await app.click(${repl.index("combo box", "")}); await app.getAXStateAndScreenshot();`)).resolves.toMatchObject({ error: null });
  await expect(repl.cell('await app.pressKey("ALT+ARROWDOWN"); await app.getAXStateAndScreenshot();')).resolves.toMatchObject({ error: null });
  await expect(repl.cell(`await app.selectText(${repl.index("combo box", "")},"List"); await app.getAXStateAndScreenshot();`)).resolves.toMatchObject({ error: expect.stringMatching(/element has no Text selection interface/) });
  await expect(repl.cell('await app.typeText("List"); await app.getAXStateAndScreenshot();')).resolves.toMatchObject({ error: null });
  await expect(repl.cell(`await app.click(${repl.dialogPoint([440,69])}); await app.getAXStateAndScreenshot();`)).resolves.toMatchObject({ error: null });
  await expect(repl.cell('await app.typeText("List"); await app.pressKey("ENTER"); await app.getAXStateAndScreenshot();')).resolves.toMatchObject({ error: null });
  await expect(repl.cell(`await app.click(${repl.dialogPoint([140,200])}); await app.typeText("Pass\\nFail\\nHeld"); await app.getAXStateAndScreenshot();`)).resolves.toMatchObject({ error: null });
  await expect(repl.cell('await app.click([423,653]); await app.getAXStateAndScreenshot();')).resolves.toMatchObject({ error: expect.stringMatching(/Latest screenshot.*No input was sent/s) });
  await expect(repl.cell(`await app.click(${repl.index("push button", "OK")}); await app.getAXStateAndScreenshot();`)).resolves.toMatchObject({ error: null });
  await expect(repl.cell('await app.pressKey("CTRL+S"); await app.getAXStateAndScreenshot();')).resolves.toMatchObject({ error: null, text: expect.stringMatching(/Use .*Excel.* Format/) });
  await expect(repl.cell('await app.pressKey("ENTER"); await app.getAXStateAndScreenshot();')).resolves.toMatchObject({ error: null });
  await expect.poll(() => document.readChoices(), { timeout: 10_000 }).toEqual(document.expectedChoices);
  await expect(document.readValues()).resolves.toEqual(document.originalValues);
});
