import { expect } from "vitest";
import { test } from "../fixtures/linux-typing.js";

test("TYPE-L01: types once into the selected document and saves the actual text", async ({ app, document }) => {
  await app.pressKey("CTRL+A");
  await app.typeText("A café near Dublin Zoo — typed through OpenSky.");
  await app.pressKey("CTRL+S");
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toContain("Use Word 2007 Format");
  await app.pressKey("ENTER");
  await expect.poll(() => document.readText(), { timeout: 10_000 }).toBe("A café near Dublin Zoo — typed through OpenSky.");
});
