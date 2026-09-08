import { expect } from "vitest";
import { test } from "../fixtures/libreoffice.js";

// SET-023: expected to fail on runtime aa31c70ee. This is a real SDK
// observation regression, not an agent evaluation or a passing contract mock.
test("DIALOG-N01: saving an edited DOCX exposes the format confirmation", async ({ app }) => {
  await app.typeText("OpenSky save probe ");
  await app.pressKey("super+s");
  await expect.poll(() => app.getAXState({ emit: false, disableDiffing: true })).toContain("Use Word 2010–365 Document Format");
});
