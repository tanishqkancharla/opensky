import { expect } from "vitest";
import { desktopSetupTest } from "../fixtures/linux-desktop-setup.js";

const calc = desktopSetupTest({
  taskId: "01b269ae-2111-4a07-81fd-3fcd711993b0",
  file: "Student_Level_Fill_Blank.xlsx", mode: "--calc",
});

// Release campaign arm 12 wrote C12 while targeting the preceding blanks.
// Observe both indices once: extra observations between edits would change
// the sequence whose saved outcome this regression is intended to exercise.
calc("FILL-L01: indexed edits preserve every untargeted cell", { timeout: 180_000 }, async ({ app, document }) => {
  const sheet = await app.getAXState({ disableDiffing: true });
  expect(sheet).toMatch(/\[(\d+)\] table cell "C10"/);
  expect(sheet).toMatch(/\[(\d+)\] table cell "C11"/);
  await app.click(Number(sheet.match(/\[(\d+)\] table cell "C10"/)![1]));
  await app.typeText("Arnold Shawarma");
  await app.pressKey("ENTER");
  await app.click(Number(sheet.match(/\[(\d+)\] table cell "C11"/)![1]));
  await app.typeText("Arnold Shawarma");
  await app.pressKey("ENTER");
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*Excel.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.readWorkbookChanges(), { timeout: 10_000 }).toEqual({
    sheetNamesUnchanged: true,
    changes: [
      { sheet: "Sheet1", cell: "C10", before: null, after: "Arnold Shawarma" },
      { sheet: "Sheet1", cell: "C11", before: null, after: "Arnold Shawarma" },
    ],
  });
});

const visibleCalc = desktopSetupTest({
  taskId: "01b269ae-2111-4a07-81fd-3fcd711993b0",
  file: "Student_Level_Fill_Blank.xlsx", mode: "--calc",
  observedScreenshotSize: { width: 1280, heights: [881, 883] },
});

// Name box observed at these coordinates in the retained Linux Calc screenshots.
visibleCalc("FILL-L02: name-box edits preserve every untargeted cell", { timeout: 180_000 }, async ({ app, document }) => {
  await app.getScreenshot();
  await app.click([70, 122]);
  await app.pressKey("CTRL+A");
  await app.typeText("C10");
  await app.pressKey("ENTER");
  await app.typeText("Arnold Shawarma");
  await app.pressKey("ENTER");
  await app.click([70, 122]);
  await app.pressKey("CTRL+A");
  await app.typeText("C11");
  await app.pressKey("ENTER");
  await app.typeText("Arnold Shawarma");
  await app.pressKey("ENTER");
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*Excel.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.readWorkbookChanges(), { timeout: 10_000 }).toEqual({
    sheetNamesUnchanged: true,
    changes: [
      { sheet: "Sheet1", cell: "C10", before: null, after: "Arnold Shawarma" },
      { sheet: "Sheet1", cell: "C11", before: null, after: "Arnold Shawarma" },
    ],
  });
});

// Diagnostic only: screenshots preserve the retained AX indices.
calc("FILL-D01: observe the selected cell around consecutive indexed edits", { timeout: 180_000 }, async ({ app, document }) => {
  const sheet = await app.getAXState({ disableDiffing: true });
  expect(sheet).toMatch(/\[(\d+)\] table cell "C10"/);
  expect(sheet).toMatch(/\[(\d+)\] table cell "C11"/);
  await app.click(Number(sheet.match(/\[(\d+)\] table cell "C10"/)![1]));
  await app.typeText("Arnold Shawarma");
  await app.pressKey("ENTER");
  await app.getScreenshot();
  await app.click(Number(sheet.match(/\[(\d+)\] table cell "C11"/)![1]));
  await app.getScreenshot();
  await app.typeText("Arnold Shawarma");
  await app.pressKey("ENTER");
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*Excel.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.readWorkbookChanges(), { timeout: 10_000 }).toEqual({
    sheetNamesUnchanged: true,
    changes: [
      { sheet: "Sheet1", cell: "C10", before: null, after: "Arnold Shawarma" },
      { sheet: "Sheet1", cell: "C11", before: null, after: "Arnold Shawarma" },
    ],
  });
});

const identityCalc = desktopSetupTest({
  taskId: "01b269ae-2111-4a07-81fd-3fcd711993b0",
  file: "Student_Level_Fill_Blank.xlsx", mode: "--calc", calcCellIdentityDiagnostics: true,
});
identityCalc("FILL-D02: observe the selected cell around consecutive indexed edits", { timeout: 180_000 }, async ({ app, document }) => {
  const sheet = await app.getAXState({ disableDiffing: true });
  expect(sheet).toMatch(/\[(\d+)\] table cell "C10"/);
  expect(sheet).toMatch(/\[(\d+)\] table cell "C11"/);
  await app.click(Number(sheet.match(/\[(\d+)\] table cell "C10"/)![1]));
  await app.typeText("Arnold Shawarma");
  await app.pressKey("ENTER");
  await app.getScreenshot();
  await app.click(Number(sheet.match(/\[(\d+)\] table cell "C11"/)![1]));
  await app.getScreenshot();
  await app.typeText("Arnold Shawarma");
  await app.pressKey("ENTER");
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*Excel.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.readWorkbookChanges(), { timeout: 10_000 }).toEqual({
    sheetNamesUnchanged: true,
    changes: [
      { sheet: "Sheet1", cell: "C10", before: null, after: "Arnold Shawarma" },
      { sheet: "Sheet1", cell: "C11", before: null, after: "Arnold Shawarma" },
    ],
  });
});

// Keep the name box focused until the indexed click transfers input to C10.
visibleCalc("FILL-L03: an indexed cell click moves typing out of the name box", { timeout: 180_000 }, async ({ app, document }) => {
  const sheet = await app.getAXState({ disableDiffing: true });
  expect(sheet).toMatch(/\[(\d+)\] table cell "C10"/);
  await app.getScreenshot();
  await app.click([70, 122]);
  await app.pressKey("CTRL+A");
  await app.click(Number(sheet.match(/\[(\d+)\] table cell "C10"/)![1]));
  await app.typeText("Arnold Shawarma");
  await app.pressKey("ENTER");
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*Excel.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.readWorkbookChanges(), { timeout: 10_000 }).toEqual({
    sheetNamesUnchanged: true,
    changes: [
      { sheet: "Sheet1", cell: "C10", before: null, after: "Arnold Shawarma" },
    ],
  });
});

// A normal single click must replace a marked range with the requested cell.
visibleCalc("FILL-L04: an indexed cell click replaces a pre-existing marked range", { timeout: 180_000 }, async ({ app, document }) => {
  const sheet = await app.getAXState({ disableDiffing: true });
  expect(sheet).toMatch(/\[(\d+)\] table cell "C10"/);
  await app.getScreenshot();
  await app.click([70, 122]);
  await app.pressKey("CTRL+A");
  await app.typeText("C10:C11");
  await app.pressKey("ENTER");
  await app.getScreenshot();
  await app.click(Number(sheet.match(/\[(\d+)\] table cell "C10"/)![1]));
  await app.typeText("Arnold Shawarma");
  await app.pressKey("ENTER");
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*Excel.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.readWorkbookChanges(), { timeout: 10_000 }).toEqual({
    sheetNamesUnchanged: true,
    changes: [
      { sheet: "Sheet1", cell: "C10", before: null, after: "Arnold Shawarma" },
    ],
  });
});

const mergedCalc = desktopSetupTest({
  taskId: "4188d3a4-077d-46b7-9c86-23e1a036f6c1",
  file: "Freeze_row_column.xlsx", mode: "--calc",
});

mergedCalc("FILL-L05: an indexed merged-cell edit preserves other values and all merges", { timeout: 180_000 }, async ({ app, document }) => {
  const sheet = await app.getAXState({ disableDiffing: true });
  expect(sheet).toMatch(/\[(\d+)\] table cell "A1"/);
  await app.click(Number(sheet.match(/\[(\d+)\] table cell "A1"/)![1]));
  await app.getScreenshot();
  await app.typeText("Monthly item summary");
  await app.pressKey("ENTER");
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*Excel.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.readWorkbookChanges(), { timeout: 10_000 }).toEqual({
    sheetNamesUnchanged: true,
    changes: [
      { sheet: "Sheet1", cell: "A1", before: "                                Month\nItem                                   ", after: "Monthly item summary" },
    ],
  });
  await expect(document.readMergedRanges()).resolves.toEqual({ Sheet1: ["A1:B1", "A2:A5", "A6:A9"] });
});

const movedCalc = desktopSetupTest({
  taskId: "01b269ae-2111-4a07-81fd-3fcd711993b0",
  file: "Student_Level_Fill_Blank.xlsx", mode: "--calc",
  windowPlacement: { x: 200, y: 100, width: 960, height: 700 },
});

movedCalc("FILL-L06: consecutive indexed edits preserve other cells in a moved window", { timeout: 180_000 }, async ({ app, document }) => {
  const sheet = await app.getAXState({ disableDiffing: true });
  expect(sheet).toMatch(/\[(\d+)\] table cell "C10"/);
  expect(sheet).toMatch(/\[(\d+)\] table cell "C11"/);
  await app.click(Number(sheet.match(/\[(\d+)\] table cell "C10"/)![1]));
  await app.typeText("Arnold Shawarma");
  await app.pressKey("ENTER");
  await app.click(Number(sheet.match(/\[(\d+)\] table cell "C11"/)![1]));
  await app.typeText("Arnold Shawarma");
  await app.pressKey("ENTER");
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*Excel.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.readWorkbookChanges(), { timeout: 10_000 }).toEqual({
    sheetNamesUnchanged: true,
    changes: [
      { sheet: "Sheet1", cell: "C10", before: null, after: "Arnold Shawarma" },
      { sheet: "Sheet1", cell: "C11", before: null, after: "Arnold Shawarma" },
    ],
  });
});

// Diagnostic only: the same moved-window actions with read-only identity
// probes before input/after the first Enter, and screenshots around clicks.
const movedIdentityCalc = desktopSetupTest({
  taskId: "01b269ae-2111-4a07-81fd-3fcd711993b0",
  file: "Student_Level_Fill_Blank.xlsx", mode: "--calc", calcCellIdentityDiagnostics: true,
  windowPlacement: { x: 200, y: 100, width: 960, height: 700 },
});

movedIdentityCalc("FILL-D03: inspect cell identity and selection in a moved window", { timeout: 180_000 }, async ({ app, document }) => {
  const sheet = await app.getAXState({ disableDiffing: true });
  expect(sheet).toMatch(/\[(\d+)\] table cell "C10"/);
  expect(sheet).toMatch(/\[(\d+)\] table cell "C11"/);
  await app.getScreenshot();
  await app.click(Number(sheet.match(/\[(\d+)\] table cell "C10"/)![1]));
  await app.getScreenshot();
  await app.typeText("Arnold Shawarma");
  await app.pressKey("ENTER");
  await app.getScreenshot();
  await app.click(Number(sheet.match(/\[(\d+)\] table cell "C11"/)![1]));
  await app.getScreenshot();
  await app.typeText("Arnold Shawarma");
  await app.pressKey("ENTER");
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*Excel.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.readWorkbookChanges(), { timeout: 10_000 }).toEqual({
    sheetNamesUnchanged: true,
    changes: [
      { sheet: "Sheet1", cell: "C10", before: null, after: "Arnold Shawarma" },
      { sheet: "Sheet1", cell: "C11", before: null, after: "Arnold Shawarma" },
    ],
  });
});
