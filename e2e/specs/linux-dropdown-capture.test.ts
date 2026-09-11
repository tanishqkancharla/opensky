import { expect } from "vitest";
import { test } from "../fixtures/linux-dropdown-capture.js";

test("POPUP-L01: app screenshots show the same open dropdown as the desktop", { timeout: 240_000 }, async ({ app, popupScreenshots }) => {
  await app.pressKey("ALT+ARROWDOWN");
  await expect(popupScreenshots.compareWithDesktop()).resolves.toEqual({ desktopHasContent: true, canvasPreserved: true, beforeMatchesDesktop: true, afterMatchesDesktop: true });
  await app.pressKey("ESC");
});
