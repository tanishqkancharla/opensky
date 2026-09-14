import { expect } from "vitest";
import { nativeTest } from "../fixtures/sdk.js";

const test = nativeTest.extend({
  documentText: "Earlier target: needle.\n" + "A café 😀 stays unchanged.\n".repeat(80) + "Final target: needle.\n",
});

test("SELECT-N02: replaces a contextual match beyond a long Unicode prefix", async ({ sdk, document }) => {
  await sdk.select_text({ app: document.handle, element_index: document.editorIndex, text: "needle", prefix: "Final target: ", suffix: ".", selection_type: "text" });
  await sdk.type_text({ app: document.handle, text: "chosen" });
  await sdk.press_key({ app: document.handle, key: "super+s" });
  await expect.poll(() => document.read()).toBe(document.initialText.replace("Final target: needle", "Final target: chosen"));
});
