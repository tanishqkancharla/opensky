import { expect } from "vitest";
import { test } from "../fixtures/linux-office.js";

test("OFFICE-L01: centers and saves the heading while preserving document text", async ({ desktop, document }) => {
  await desktop.pressKey("CTRL+HOME");
  await desktop.pressKey("CTRL+E");
  await desktop.pressKey("CTRL+S");
  await expect.poll(() => desktop.observe(), { timeout: 15_000, interval: 250 }).toContain("Use Word 2007 Format");
  await desktop.pressKey("Return");
  await desktop.observe();
  await expect.poll(() => document.grade(), { timeout: 10_000 }).toMatchObject({
    taskSuccess: true,
    completeDocumentTextMatches: true,
  });
});
