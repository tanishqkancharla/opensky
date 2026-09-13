import { expect } from "vitest";
import { expectedFormats, selectPasteTarget, test } from "../fixtures/linux-sdk-clipboard.js";

const preservedDocument = "First paragraph must stay unchanged.\n😀 café é one needle; two needle.\nLast paragraph must stay unchanged.";

test("PASTE-L04: public SDK paste refuses a snapshot raced by a new real X11 owner", { timeout: 180_000 }, async ({ app, document, clipboard, observeParagraph }) => {
  await clipboard.seedRace();
  await selectPasteTarget(app, observeParagraph);
  await expect(app.paste("First native line\nSecond native line", { format: "text" })).rejects.toThrow("Clipboard changed during snapshot");
  await expect(app.getAXState({ disableDiffing: true })).resolves.toContain("😀 café é one needle; two needle.");
  await expect(app.getAXState({ disableDiffing: true })).resolves.not.toContain("First native line");
  await app.pressKey("CTRL+S");
  await expect.poll(() => document.readText()).toBe(preservedDocument);
  await clipboard.assertReplacementOwnership();
});

test("PASTE-L02: public SDK paste preserves every original X11 clipboard format", { timeout: 180_000 }, async ({ app, document, clipboard, observeParagraph }) => {
  await clipboard.seed();
  await selectPasteTarget(app, observeParagraph);
  await app.paste("First native line\nSecond native line", { format: "text" });
  await app.pressKey("CTRL+S");
  await expect.poll(() => document.readText()).toBe("First paragraph must stay unchanged.\nFirst native line\nSecond native line\nLast paragraph must stay unchanged.");
  await expect(clipboard.read()).resolves.toMatchObject({ targets: expect.arrayContaining(Object.keys(expectedFormats)), formats: expectedFormats });
});

test("PASTE-L03: public SDK paste restores an originally empty clipboard", { timeout: 180_000 }, async ({ app, document, clipboard, observeParagraph }) => {
  await clipboard.clear();
  await selectPasteTarget(app, observeParagraph);
  await app.paste("First native line\nSecond native line", { format: "text" });
  await app.pressKey("CTRL+S");
  await expect.poll(() => document.readText()).toBe("First paragraph must stay unchanged.\nFirst native line\nSecond native line\nLast paragraph must stay unchanged.");
  await expect(clipboard.read()).resolves.toEqual({ owner: 0, targets: [], formats: {} });
});
