import { expect } from "vitest";
import { test } from "../fixtures/linux-targeted-return.js";

const expectedSaved = {
  texts: ["Target audience"],
  distinctNonemptyRunSizesPt: [60],
  xmlParagraphs: [["Target audience"]],
};

test("TARGETED-RETURN-L01: facade extra target argument reproduces the ambient Return", { timeout: 180_000 }, async ({ app, fontField, document, observe, capture }) => {
  await app.setValue(fontField, "60 pt");
  // This is the exact public SDK call recorded in arm 21. The facade declares
  // one argument, so the extra index is intentionally ignored at runtime.
  await (app.pressKey as (key: string, ignoredTarget: number) => Promise<void>)("Return", fontField);
  await observe("after-targeted-return");
  await capture("after-targeted-return");
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*PowerPoint.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.read(), { timeout: 10_000 }).toEqual(expectedSaved);
});

test("TARGETED-RETURN-L02: low-level targeted Return commits 60 pt without changing the headline", { timeout: 180_000 }, async ({ app, fontField, document, pressTargetedReturn, observe, capture }) => {
  await app.setValue(fontField, "60 pt");
  await pressTargetedReturn();
  await observe("after-targeted-return");
  await capture("after-targeted-return");
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toMatch(/Use .*PowerPoint.* Format/);
  await app.pressKey("ENTER");
  await expect.poll(() => document.read(), { timeout: 10_000 }).toEqual(expectedSaved);
});
