import { test, expect } from "../fixtures/linux-repl-cell.js";

test("REPL-L01: a yielded desktop batch finishes once and later input saves the document", { timeout: 240_000 }, async ({ repl, app, document, keyboard }) => {
  const batch = await repl.start(`let editor = await cua.getApp("LibreOffice");
    await editor.pressKey("CTRL+A");
    await editor.typeText("One. "); await editor.typeText("Two. ");
    await editor.typeText("Three. "); await editor.typeText("Four. ");
    await editor.typeText("Five. "); await editor.typeText("Six. ");
    await editor.typeText("Seven. "); await editor.typeText("Eight. ");
    await editor.typeText("Nine.");`);
  expect(batch).toMatchObject({ structuredContent: { cellStatus: "running" } });
  await expect(repl.finish(batch.structuredContent!.cellId)).resolves.toMatchObject({ isError: false, structuredContent: { cellStatus: "completed" } });
  const save = await repl.start('await editor.pressKey("CTRL+S");');
  await expect(repl.finish(save.structuredContent!.cellId)).resolves.toMatchObject({ isError: false, structuredContent: { cellStatus: "completed" } });
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toContain("Use Word 2007 Format");
  await app.pressKey("ENTER");
  await expect.poll(() => document.readText()).toBe("One. Two. Three. Four. Five. Six. Seven. Eight. Nine.");
  await expect(keyboard.unchanged()).resolves.toBe(true);
});
