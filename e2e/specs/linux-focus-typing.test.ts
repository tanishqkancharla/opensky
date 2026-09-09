import { expect } from "vitest";
import { test } from "../fixtures/linux-focus-typing.js";

test("FOCUS-L01: types into the active document and leaves its sibling unchanged", { timeout: 180_000 }, async ({ target, sibling }) => {
  await target.activate();
  await target.pressKey("CTRL+END");
  await target.typeText(" Added once.");
  await target.pressKey("CTRL+S");
  await sibling.save();
  await expect.poll(() => target.readText()).toBe("Target document. Added once.");
  await expect.poll(() => sibling.readText()).toBe("Sibling document.");
});

test("FOCUS-L02: edits the requested document while its sibling keeps focus", { timeout: 180_000 }, async ({ target, sibling }) => {
  await target.activate();
  await target.pressKey("CTRL+END");
  await sibling.activate();
  await target.typeText(" Target only.");
  await expect(sibling.hasFocus()).resolves.toBe(true);
  await target.pressKey("CTRL+S");
  await sibling.save();
  await expect.poll(() => target.readText()).toBe("Target document. Target only.");
  await expect.poll(() => sibling.readText()).toBe("Sibling document.");
});

test("FOCUS-L03: a document typing request cannot write into its active Find dialog", { timeout: 180_000 }, async ({ target, sibling, modal }) => {
  await target.activate();
  await target.pressKey("CTRL+H");
  await modal.typeText("Keep this search");
  await expect(modal.readState()).resolves.toContain("Keep this search");
  await expect(target.typeText("FORBIDDEN DOCUMENT INPUT")).rejects.toThrow();
  await expect(modal.readState()).resolves.toContain("Keep this search");
  await expect(modal.readState()).resolves.not.toContain("FORBIDDEN DOCUMENT INPUT");
  await modal.close();
  await target.pressKey("CTRL+S");
  await sibling.save();
  await expect.poll(() => target.readText()).toBe("Target document.");
  await expect.poll(() => sibling.readText()).toBe("Sibling document.");
});

// A raw public-SDK index remains application-wide. It must still belong to
// the window named by the click request, even within the same process.
test("FOCUS-L04: a document click cannot activate its dialog's Close button", { timeout: 180_000 }, async ({ target, sibling, modal }) => {
  await target.activate();
  await target.pressKey("CTRL+H");
  await modal.typeText("Keep this search");
  const dialog = await modal.readTree();
  expect(dialog).toMatch(/\[(\d+)\] push button "Close"/);
  await expect(target.click(Number(dialog.match(/\[(\d+)\] push button "Close"/)![1]))).rejects.toThrow();
  await expect(modal.readState()).resolves.toContain("Keep this search");
  await modal.close();
  await target.pressKey("CTRL+S");
  await sibling.save();
  await expect.poll(() => target.readText()).toBe("Target document.");
  await expect.poll(() => sibling.readText()).toBe("Sibling document.");
});
