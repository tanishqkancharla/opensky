import { expect } from "vitest";
import { test } from "../fixtures/linux-selection.js";

test("PASTE-L01: pastes multiline text into the selected native paragraph", async ({ app, paragraph, document }) => {
  await app.selectText(paragraph, "😀 café é one needle; two needle.");
  await app.paste("First native line\nSecond native line", { format: "text" });
  await app.pressKey("CTRL+S");
  await expect.poll(() => document.readText()).toBe("First paragraph must stay unchanged.\nFirst native line\nSecond native line\nLast paragraph must stay unchanged.");
});
