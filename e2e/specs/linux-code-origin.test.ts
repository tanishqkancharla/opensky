import { expect } from "vitest";
import { test } from "../fixtures/linux-code-origin.js";

test("ORIGIN-L01: indexed replacement fields work in a displaced Code window", { timeout: 180_000 }, async ({ app, findField, replaceField, document }) => {
  await app.click(findField);
  await app.pressKey("CTRL+A");
  await app.typeText("Original");
  await app.click(replaceField);
  await app.pressKey("CTRL+A");
  await app.typeText("Updated");
  await app.pressKey("CTRL+ALT+ENTER");
  await app.pressKey("ESC");
  await app.pressKey("CTRL+S");
  await expect.poll(() => document.read(), { timeout: 10_000 }).toBe("Updated text\nKeep this line\n");
});
