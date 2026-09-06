import { expect } from "vitest";
import { nativeEditorIndex, nativeTest as test, nativeText } from "../fixtures/sdk.js";

// macOS TextEdit on the disposable runner. The oracle is the actual saved file,
// not a driver acknowledgment or a test double's remembered value.
test("PASTE-N01: pastes multiline text into the native document", async ({ sdk, document }) => {
  const state = await sdk.get_app_state({ app: document.handle, includeScreenshot: false, disableDiff: true });
  const editor = nativeEditorIndex(state.text);
  await sdk.press_key({ app: document.handle, element_index: editor, key: "super+a" });
  await sdk.paste({ app: document.handle, text: "First native line\nSecond native line\n", format: "text" });
  await sdk.press_key({ app: document.handle, key: "super+s" });

  await expect.poll(() => document.read()).toBe("First native line\nSecond native line\n");
});

test("SELECT-N01: replaces the disambiguated second occurrence after Unicode text", async ({ sdk, document }) => {
  const state = await sdk.get_app_state({ app: document.handle, includeScreenshot: false, disableDiff: true });
  await sdk.select_text({
    app: document.handle, element_index: nativeEditorIndex(state.text),
    text: "needle", prefix: "two ", suffix: ".", selection_type: "text",
  });
  await sdk.type_text({ app: document.handle, text: "chosen" });
  await sdk.press_key({ app: document.handle, key: "super+s" });

  await expect.poll(() => document.read()).toBe(nativeText.replace("two needle", "two chosen"));
});

for (const { selection, replacement } of [
  { selection: "cursor_before" as const, replacement: "two Xneedle" },
  { selection: "cursor_after" as const, replacement: "two needleX" },
]) {
  test(`SELECT-N-${selection}: inserts at the requested edge without replacing the match`, async ({ sdk, document }) => {
    const state = await sdk.get_app_state({ app: document.handle, includeScreenshot: false, disableDiff: true });
    await sdk.select_text({
      app: document.handle, element_index: nativeEditorIndex(state.text),
      text: "needle", prefix: "two ", suffix: ".", selection_type: selection,
    });
    await sdk.type_text({ app: document.handle, text: "X" });
    await sdk.press_key({ app: document.handle, key: "super+s" });

    await expect.poll(() => document.read()).toBe(nativeText.replace("two needle", replacement));
  });
}
