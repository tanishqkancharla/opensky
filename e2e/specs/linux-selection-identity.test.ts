import { expect } from "vitest";
import { fullRange, targetText, test } from "../fixtures/linux-selection-identity.js";

test("SELECT-IDENTITY-L01: public SDK selectText remains bound to the observed entry after an independent visible insertion", { timeout: 120_000 }, async ({ app, observer, insert, observeOriginalUnselected, proveOrdinalDrift, status }) => {
  const original = await observeOriginalUnselected();
  await observer.click(insert);
  await proveOrdinalDrift(original);
  await app.selectText(original, targetText);
  await expect.poll(status, { timeout: 10_000 }).toContain(`selection_drift=applied selection_target=original selection_range=${fullRange}`);
});

test("SELECT-IDENTITY-L02: public SDK selectText selects the observed entry when its tree is unchanged", { timeout: 120_000 }, async ({ app, observeOriginalUnselected, status }) => {
  const original = await observeOriginalUnselected();
  await app.selectText(original, targetText);
  await expect.poll(status, { timeout: 10_000 }).toContain(`selection_drift=armed selection_target=original selection_range=${fullRange}`);
});
