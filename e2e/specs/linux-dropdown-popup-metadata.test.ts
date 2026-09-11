import { test } from "../fixtures/linux-dropdown-popup-metadata.js";

// Metadata diagnostic only; missing ownership is evidence, not permission to
// capture or composite a different window. No product route is changed.
test("DROPDOWN-D02: records popup ownership and geometry around the capture bracket", { timeout: 240_000 }, async ({ app, popupObserver }) => {
  await app.pressKey("ALT+ARROWDOWN");
  await popupObserver.capture();
  await app.pressKey("ESC");
});
