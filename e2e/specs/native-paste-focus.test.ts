import { expect } from "vitest";
import { test } from "../fixtures/native-paste-focus.js";
import { nativeEditorIndex } from "../fixtures/sdk.js";

test("PASTE-N02: pastes once into its target and restores the other foreground app", async ({ sdk, document, witness }) => {
  const target = await sdk.get_app_state({ app: document.handle, includeScreenshot: false, disableDiff: true });
  await sdk.press_key({ app: document.handle, element_index: nativeEditorIndex(target.text), key: "super+a" });
  await witness.focus();
  await expect.poll(() => witness.isFrontmost()).toBe(true);
  await sdk.paste({ app: document.handle, text: "One targeted paste\nSecond line\n", format: "text" });
  await expect.poll(() => witness.isFrontmost()).toBe(true);
  await sdk.press_key({ app: document.handle, key: "super+s" });
  await expect.poll(() => document.read()).toBe("One targeted paste\nSecond line\n");
  await expect(witness.read()).resolves.toBe(witness.initialText);
  await expect(sdk.get_app_state({ app: witness.handle, includeScreenshot: false, disableDiff: true })).resolves.toMatchObject({ text: expect.stringContaining(witness.initialText.trim()) });
  await expect(sdk.get_app_state({ app: witness.handle, includeScreenshot: false, disableDiff: true })).resolves.toMatchObject({ text: expect.not.stringContaining("One targeted paste") });
});
