import { expect } from "vitest";
import { nativeActionIndex, test } from "../fixtures/libreoffice.js";

// SET-023: real SDK observations/actions and saved-document outcomes.
test("DIALOG-N01: saving an edited DOCX exposes the format confirmation", async ({ app }) => {
  await app.typeText("OpenSky save probe ");
  await app.pressKey("super+s");
  await expect.poll(() => app.getAXState({ emit: false, disableDiffing: true })).toContain("Use Word 2010–365 Document Format");
});

test("DIALOG-N02: confirming DOCX format saves the edit and returns to the document", async ({ savePrompt, savedDocument }) => {
  const state = await savePrompt.getAXState({ emit: false, disableDiffing: true });
  await savePrompt.click(nativeActionIndex(state, "AXButton", "Use Word 2010–365 Document Format"));
  await expect.poll(() => savedDocument.readText()).toEqual(savedDocument.expectedText);
  await expect.poll(() => savePrompt.getAXState({ emit: false })).toContain("OpenSky save probe Guidelines on drawing up a Constitution");
});

test("DIALOG-N03: app dialog observation preserves an earlier exact document handle", async ({ savePrompt, savedDocument, sdk }) => {
  expect((await sdk.get_app_state({ app: savedDocument.originalHandle, includeScreenshot: false, disableDiff: true })).text).toContain('AXWindow "save-dialog.docx"');
  expect((await savePrompt.getAXState({ emit: false, disableDiffing: true }))).toContain("Use Word 2010–365 Document Format");
});
