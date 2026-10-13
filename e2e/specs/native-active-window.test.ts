import { expect } from "vitest";
import { nativeTest } from "../fixtures/sdk.js";

// All windows belong to the fresh process proved by the native document fixture.
// Opening the second document uses the same public keyboard action as a person.
const test = nativeTest.extend<{ secondWindow: void; documentCleanupSave: boolean }>({
  documentCleanupSave: false,
  secondWindow: async ({ sdk, document }, use) => {
    await sdk.press_key({ app: document.handle, key: "super+n" });
    await use();
  },
});

test("FOCUS-N01: app scope follows the focused document while the document handle stays exact", async ({ sdk, cua, document, secondWindow }) => {
  const focused = await sdk.get_app_state({ app: document.handle, scope: "app", includeScreenshot: false, disableDiff: true });
  const siblings = (await document.windows()).filter(window =>
    window.onScreen && window.title.startsWith("Untitled") && window.windowId !== document.windowId);
  expect(siblings).toHaveLength(1);
  expect(focused.targetHandle).not.toBe(document.handle);
  const app = await cua.getApp(focused.targetHandle);
  expect(await app.getAXState({ disableDiffing: true })).toContain('AXWindow "Untitled');
  await app.typeText("Only the second document receives this text.");
  expect(await app.getAXState({ disableDiffing: true })).toContain("Only the second document receives this text.");
  expect((await sdk.get_app_state({ app: document.handle, includeScreenshot: false, disableDiff: true })).text).toContain(document.initialText.trim());
  expect(await document.read()).toBe(document.initialText);
});
