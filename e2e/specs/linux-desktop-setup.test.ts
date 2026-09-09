import { expect } from "vitest";
import { desktopSetupTest } from "../fixtures/linux-desktop-setup.js";

const calc = desktopSetupTest({
  taskId: "035f41ba-6653-43ab-aa63-c86d449d62e5", file: "IncomeStatement2.xlsx", mode: "--calc" as const,
});
const impress = desktopSetupTest({
  taskId: "5cfb9197-e72b-454b-900e-c06b0c802b40", file: "33_1.pptx", mode: "--impress" as const,
});

calc("SETUP-L02: reads the income statement in Calc", { timeout: 120_000 }, async ({ app }) => {
  await app.pressKey("CTRL+HOME");
  await expect(app.getAXState({ disableDiffing: true })).resolves.toContain("Net Sales");
});

impress("SETUP-L03: reads the first slide in Impress", { timeout: 120_000 }, async ({ app }) => {
  await expect(app.getAXState({ disableDiffing: true })).resolves.toContain("VIRTUAL QUIZ");
});

const code = desktopSetupTest({
  taskId: "0ed39f63-6049-43d4-ba4d-5fa2fe04a951", file: "vscode_replace_text.txt", mode: "--code",
});

code("SETUP-L04: reads the benchmark text in VS Code", { timeout: 120_000 }, async ({ app }) => {
  await expect(app.getAXState({ disableDiffing: true })).resolves.toContain("In order to evaluate");
});

calc("CALC-L01: edits an observed cell and saves its calculated value", { timeout: 120_000 }, async ({ app, document }) => {
  const sheet = await app.getAXState({ disableDiffing: true });
  expect(sheet).toMatch(/\[(\d+)\] table cell "E2"/);
  await app.click(Number(sheet.match(/\[(\d+)\] table cell "E2"/)![1]));
  await app.typeText("=B2-C2");
  await app.pressKey("ENTER");
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*Excel.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.readCell("E2"), { timeout: 10_000 }).toEqual({ formula: "B2-C2", value: "75000" });
});

calc("CALC-L02: edits a newly observed cell after scrolling the sheet", { timeout: 120_000 }, async ({ app, document }) => {
  await app.pressKey("CTRL+HOME");
  await app.pressKey("PAGEDOWN");
  const sheet = await app.getAXState({ disableDiffing: true });
  expect(sheet).toMatch(/\[(\d+)\] table cell "E50"/);
  await app.click(Number(sheet.match(/\[(\d+)\] table cell "E50"/)![1]));
  await app.typeText("42");
  await app.pressKey("ENTER");
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*Excel.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.readCell("E50"), { timeout: 10_000 }).toEqual({ formula: null, value: "42" });
});

// Coordinates observed in campaign arm 22's 1280×881 screenshot and the remote
// calc-coordinate-before-02 1280×883 screenshot. Both controls occupy these pixels.
const screenshotCalc = desktopSetupTest({
  taskId: "035f41ba-6653-43ab-aa63-c86d449d62e5", file: "IncomeStatement2.xlsx", mode: "--calc",
  observedScreenshotSize: { width: 1280, heights: [881, 883] },
});

screenshotCalc("CALC-L03: uses the visible name box to edit and save a cell", { timeout: 180_000 }, async ({ app, document }) => {
  await app.getScreenshot();
  await app.click([79, 122]);
  await app.pressKey("CTRL+A");
  await app.typeText("E2");
  await app.pressKey("ENTER");
  await app.typeText("=B2-C2");
  await app.pressKey("ENTER");
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*Excel.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.readCell("E2"), { timeout: 10_000 }).toEqual({ formula: "B2-C2", value: "75000" });
});

screenshotCalc("CALC-L04: adds and saves a sheet with the visible plus button", { timeout: 180_000 }, async ({ app, document }) => {
  await app.getScreenshot();
  await app.click([116, 844]);
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toContain('"Sheet2"');
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*Excel.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.readSheetNames(), { timeout: 10_000 }).toEqual(["Sheet1", "Sheet2"]);
});

// Replay attempt 23's range entry after selecting E2 from the current observation.
// The remote desktop and CI have different font metrics, so cell pixel centers differ.
screenshotCalc("CALC-L05: fills and saves the range selected through the name box", { timeout: 240_000 }, async ({ app, document }) => {
  await app.getScreenshot();
  const sheet = await app.getAXState({ disableDiffing: true });
  expect(sheet).toMatch(/\[(\d+)\] table cell "E2"/);
  await app.click(Number(sheet.match(/\[(\d+)\] table cell "E2"/)![1]));
  await app.typeText("=B2-C2-D2");
  await app.pressKey("ENTER");
  await app.click([70, 123]);
  await app.pressKey("CTRL+A");
  await app.typeText("E2:E10");
  await app.pressKey("ENTER");
  await app.pressKey("CTRL+D");
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*Excel.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.readCell("E2"), { timeout: 10_000 }).toMatchObject({ formula: "B2-C2-D2" });
  await expect.poll(() => document.readCell("E10"), { timeout: 10_000 }).toMatchObject({ formula: "B10-C10-D10" });
});

screenshotCalc("CALC-L06: a double click edits the existing cell value in place", { timeout: 180_000 }, async ({ app, document }) => {
  await app.getScreenshot();
  // B2's value in the retained 1280×883 Calc screenshot.
  await app.click([145, 185], { clickCount: 2 });
  await app.pressKey("HOME");
  await app.typeText("9");
  await app.pressKey("ENTER");
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*Excel.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.readCell("B2"), { timeout: 10_000 }).toEqual({ formula: null, value: "978000" });
  await expect(document.readCell("A2")).resolves.toEqual({ formula: null, value: "2015" });
});
