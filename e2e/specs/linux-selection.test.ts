import { expect } from "vitest";
import { test } from "../fixtures/linux-selection.js";

test("SELECT-L01: replaces only the contextual match after Unicode in a later paragraph", async ({ app, paragraph, document }) => {
  await app.selectText(paragraph, "needle", { prefix: "two ", suffix: "." });
  await app.typeText("chosen");
  await app.pressKey("CTRL+S");
  await expect.poll(() => document.readText()).toBe("First paragraph must stay unchanged.\n😀 café é one needle; two chosen.\nLast paragraph must stay unchanged.");
});

test("SELECT-L02: places the insertion point before the contextual match", async ({ app, paragraph, document }) => {
  await app.selectText(paragraph, "needle", { prefix: "two ", suffix: ".", selectionType: "cursor_before" });
  await app.typeText("BEFORE ");
  await app.pressKey("CTRL+S");
  await expect.poll(() => document.readText()).toBe("First paragraph must stay unchanged.\n😀 café é one needle; two BEFORE needle.\nLast paragraph must stay unchanged.");
});

test("SELECT-L03: places the insertion point after the contextual match", async ({ app, paragraph, document }) => {
  await app.selectText(paragraph, "needle", { prefix: "two ", suffix: ".", selectionType: "cursor_after" });
  await app.typeText(" AFTER");
  await app.pressKey("CTRL+S");
  await expect.poll(() => document.readText()).toBe("First paragraph must stay unchanged.\n😀 café é one needle; two needle AFTER.\nLast paragraph must stay unchanged.");
});


test("SELECT-L04: strikethrough applies to the selected paragraph without changing its text", async ({ app, paragraph, strikeButton, document }) => {
  await app.selectText(paragraph, "😀 café é one needle; two needle.");
  await app.getAXState({ disableDiffing: true });
  await app.click(strikeButton);
  await app.pressKey("CTRL+S");
  await expect.poll(() => document.readStruckText()).toEqual(["", "😀 café é one needle; two needle.", ""]);
  await expect.poll(() => document.readText()).toBe("First paragraph must stay unchanged.\n😀 café é one needle; two needle.\nLast paragraph must stay unchanged.");
});
