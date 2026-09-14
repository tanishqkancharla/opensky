import { expect } from "vitest";
import { test } from "../fixtures/native-foreground.js";
import { nativeEditorIndex } from "../fixtures/sdk.js";

test("PASTE-N03: pastes once and returns focus to the already-frontmost app", async ({ sdk, document, foreground }) => {
  const prior = await foreground.read();
  expect(prior.frontmostBundleId).not.toBe("com.apple.TextEdit");
  const target = await sdk.get_app_state({ app: document.handle, includeScreenshot: false, disableDiff: true });
  await sdk.press_key({ app: document.handle, element_index: nativeEditorIndex(target.text), key: "super+a" });
  await expect.poll(async () => (await foreground.read()).frontmostPid).toBe(prior.frontmostPid);
  await sdk.paste({ app: document.handle, text: "One targeted paste\nSecond line\n", format: "text" });
  await expect.poll(async () => (await foreground.read()).frontmostPid).toBe(prior.frontmostPid);
  await sdk.press_key({ app: document.handle, key: "super+s" });
  await expect.poll(() => document.read()).toBe("One targeted paste\nSecond line\n");
});
