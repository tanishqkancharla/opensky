import { expect } from "vitest";
import { expectedFormats, test } from "../fixtures/linux-sdk-clipboard.js";

test("PASTE-L02: public SDK paste preserves every original X11 clipboard format", { timeout: 180_000 }, async ({ app, paragraph, document, clipboard }) => {
  await clipboard.seed();
  await app.selectText(paragraph, "😀 café é one needle; two needle.");
  await app.paste("First native line\nSecond native line", { format: "text" });
  await app.pressKey("CTRL+S");
  await expect.poll(() => document.readText()).toBe("First paragraph must stay unchanged.\nFirst native line\nSecond native line\nLast paragraph must stay unchanged.");
  await expect(clipboard.read()).resolves.toMatchObject({ targets: expect.arrayContaining(Object.keys(expectedFormats)), formats: expectedFormats });
});

test("PASTE-L03: public SDK paste restores an originally empty clipboard", { timeout: 180_000 }, async ({ app, paragraph, document, clipboard }) => {
  await clipboard.clear();
  await app.selectText(paragraph, "😀 café é one needle; two needle.");
  await app.paste("First native line\nSecond native line", { format: "text" });
  await app.pressKey("CTRL+S");
  await expect.poll(() => document.readText()).toBe("First paragraph must stay unchanged.\nFirst native line\nSecond native line\nLast paragraph must stay unchanged.");
  await expect(clipboard.read()).resolves.toEqual({ owner: 0, targets: [], formats: {} });
});
