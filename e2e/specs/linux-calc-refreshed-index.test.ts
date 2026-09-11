import { expect } from "vitest";
import { desktopSetupTest } from "../fixtures/linux-desktop-setup.js";

const calc = desktopSetupTest({
  taskId: "01b269ae-2111-4a07-81fd-3fcd711993b0",
  file: "Student_Level_Fill_Blank.xlsx", mode: "--calc",
});

// Preserve the agent's actual formula-toolbar panel click before the edit/Undo
// sequence. REFRESH-L02 instead uses Ctrl+Home to isolate workbook state.
calc("REFRESH-L03: edits a fresh blank-cell index after the agent's panel and undo sequence", { timeout: 180_000 }, async ({ app, document }) => {
  const initial = await app.getAXStateAndScreenshot();
  expect(initial.state).toMatch(/tool bar = "Formula Tool Bar"\n\s+- \[(\d+)\] panel/);
  await app.click(Number(initial.state.match(/tool bar = "Formula Tool Bar"\n\s+- \[(\d+)\] panel/)![1]));
  await app.typeText("B2:B6");
  await app.pressKey("ENTER");
  await app.pressKey("CTRL+D");
  await expect(app.getAXState({ query: "B3" })).rejects.toThrow("App scope cannot be combined with browser query/context");
  await app.getAXState();
  await app.pressKey("CTRL+Z");
  await app.pressKey("CTRL+Z");
  await app.getAXState();
  const sheet = await app.getAXState({ disableDiffing: true });
  expect(sheet).toMatch(/\[(\d+)\] table cell "B3"/);
  await app.click(Number(sheet.match(/\[(\d+)\] table cell "B3"/)![1]));
  await app.typeText("Primary");
  await app.pressKey("ENTER");
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*Excel.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.readWorkbookChanges()).toEqual({
    sheetNamesUnchanged: true,
    changes: [{ sheet: "Sheet1", cell: "B3", before: null, after: "Primary" }],
  });
});

calc("REFRESH-L01: edits a blank cell using its freshly observed index", { timeout: 180_000 }, async ({ app, document }) => {
  const sheet = await app.getAXState({ disableDiffing: true });
  expect(sheet).toMatch(/\[(\d+)\] table cell "B3"/);
  await app.click(Number(sheet.match(/\[(\d+)\] table cell "B3"/)![1]));
  await app.typeText("Primary");
  await app.pressKey("ENTER");
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*Excel.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.readWorkbookChanges()).toEqual({
    sheetNamesUnchanged: true,
    changes: [{ sheet: "Sheet1", cell: "B3", before: null, after: "Primary" }],
  });
});

// The agent's accidental A1 edit/fill-down was undone before it observed B3.
// Drive that same workbook state through public actions, then use a fresh index.
calc("REFRESH-L02: edits a freshly observed blank cell after undoing fill-down", { timeout: 180_000 }, async ({ app, document }) => {
  await app.getAXStateAndScreenshot();
  await app.pressKey("CTRL+HOME");
  await app.typeText("B2:B6");
  await app.pressKey("ENTER");
  await app.pressKey("CTRL+D");
  await app.getAXState();
  await app.pressKey("CTRL+Z");
  await app.pressKey("CTRL+Z");
  await app.getAXState();
  const sheet = await app.getAXState({ disableDiffing: true });
  expect(sheet).toMatch(/\[(\d+)\] table cell "B3"/);
  await app.click(Number(sheet.match(/\[(\d+)\] table cell "B3"/)![1]));
  await app.typeText("Primary");
  await app.pressKey("ENTER");
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*Excel.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.readWorkbookChanges()).toEqual({
    sheetNamesUnchanged: true,
    changes: [{ sheet: "Sheet1", cell: "B3", before: null, after: "Primary" }],
  });
});
