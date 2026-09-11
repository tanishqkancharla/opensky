import { test } from "../fixtures/linux-dropdown-popup.js";

// Diagnostic completion only: retained app/root/app images require independent
// inspection. This does not assert that black pixels represent a SDK defect.
test("DROPDOWN-D01: observes the same open popup through app and desktop captures", { timeout: 240_000 }, async ({ app, popupObserver }) => {
  await app.pressKey("ALT+ARROWDOWN");
  await popupObserver.capture();
  await app.pressKey("ESC");
});
