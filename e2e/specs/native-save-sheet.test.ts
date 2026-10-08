import { expect } from "vitest";
import { nativeTest } from "../fixtures/sdk.js";

// A document-bound handle may act on its own attached sheet, while unrelated
// same-process windows still require their own exact target.
const test = nativeTest.extend<{ documentCleanupSave: boolean }>({ documentCleanupSave: false });

function indexOf(state: string, pattern: RegExp): number {
  const match = state.match(pattern);
  if (!match) throw new Error(`Missing Save sheet control: ${pattern}`);
  return Number(match[1]);
}

test("SHEET-N01: document handle edits and cancels its attached Save sheet", async ({ cua, document }) => {
  const app = await cua.getApp(document.handle);
  // Save As presents a sheet on this exact saved document. Opening a second
  // untitled window would test a sibling sheet through the wrong bound handle.
  await app.pressKey("super+alt+shift+s");

  const sheet = await app.getAXState({ disableDiffing: true });
  expect(sheet).toContain("AXSheet (save)");
  const name = indexOf(sheet, /\[(\d+)\] AXTextField[^\n]*\[id=saveAsNameTextField/);
  await app.setValue(name, "OpenSky modal probe");
  const renamed = await app.getAXState({ disableDiffing: true });
  expect(renamed).toContain('AXTextField = "OpenSky modal probe"');
  const cancel = indexOf(renamed, /\[(\d+)\] AXButton "Cancel"/);
  await app.click(cancel);
  expect(await app.getAXState({ disableDiffing: true })).not.toContain("AXSheet (save)");
});
