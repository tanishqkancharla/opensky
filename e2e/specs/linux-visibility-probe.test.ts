import { test } from "../fixtures/linux-visibility-probe.js";

test("OBSERVE-D01: capture real List dialog visibility and label relationships", { timeout: 180_000 }, async ({ probe }) => {
  await probe.capture();
});
