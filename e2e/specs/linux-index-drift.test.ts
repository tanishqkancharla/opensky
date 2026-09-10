import { expect } from "vitest";
import { test } from "../fixtures/linux-index-drift.js";

test("INDEX-L01: enabling an earlier control cannot redirect a retained OK target to Cancel", { timeout: 120_000 }, async ({ app, controls }) => {
  await app.click(controls.enableIndex);
  const outcome = await controls.clickRetainedOk();
  await expect.poll(() => controls.visibleStatus(), { timeout: 5_000 }).toMatchObject({ earlierEnabled: true, action: outcome === "stale" ? "none" : "OK" });
});

test("INDEX-L02: removing the observed OK control cannot activate its replacement", { timeout: 120_000 }, async ({ app, controls }) => {
  await app.click(controls.removeIndex);
  await expect(controls.clickRetainedOk()).resolves.toBe("stale");
  await expect.poll(() => controls.visibleStatus(), { timeout: 5_000 }).toMatchObject({ earlierEnabled: false, action: "none", okPresent: false });
});
