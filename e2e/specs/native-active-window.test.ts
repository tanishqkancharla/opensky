import { expect } from "vitest";
import { nativeTest } from "../fixtures/sdk.js";

// All windows belong to the fresh process proved by the native document fixture.
// Opening the second document uses the same public keyboard action as a person.
const test = nativeTest.extend<{ secondWindow: void }>({
  secondWindow: async ({ sdk, document }, use) => {
    await sdk.press_key({ app: document.handle, key: "super+n" });
    try { await use(); }
    finally {
      const active = await sdk.get_app_state({ app: document.handle, scope: "app", includeScreenshot: false, disableDiff: true });
      if (active.targetHandle !== document.handle && active.text.includes('AXWindow "Untitled')) {
        await sdk.press_key({ app: active.targetHandle, key: "super+w" });
        const state = await sdk.get_app_state({ app: document.handle, scope: "app", includeScreenshot: false, disableDiff: true });
        const discard = state.text.match(/\[(\d+)\] AXButton "(?:Don[’']t Save|Delete)"/);
        if (discard) await sdk.click({ app: state.targetHandle, element_index: Number(discard[1]) });
      }
    }
  },
});

test("FOCUS-N01: app observations and input follow the newly focused document", async ({ sdk, cua, document, secondWindow }) => {
  const app = await cua.getApp(document.handle);
  expect(await app.getAXState({ disableDiffing: true })).toContain('AXWindow "Untitled');
  await app.typeText("Only the second document receives this text.");
  expect(await app.getAXState({ disableDiffing: true })).toContain("Only the second document receives this text.");
  expect((await sdk.get_app_state({ app: document.handle, includeScreenshot: false, disableDiff: true })).text).toContain(document.initialText.trim());
  expect(await document.read()).toBe(document.initialText);
});
