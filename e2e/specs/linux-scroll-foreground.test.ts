import { expect } from "vitest";
import { test } from "../fixtures/linux-scroll-foreground.js";

test("SCROLL-L01: coordinate scroll moves the bound GTK view after its initial background refusal", { timeout: 120_000 }, async ({ target }) => {
  await target.scroll();
  await expect.poll(async () => (await target.status()).target, { timeout: 10_000 }).toBeGreaterThan(0);
});

test("SCROLL-L02: coordinate scroll leaves the nearby scroller and other window unchanged", { timeout: 120_000 }, async ({ target, sibling }) => {
  await target.scroll();
  await expect.poll(() => target.status(), { timeout: 10_000 }).toMatchObject({ nearby: 0 });
  await expect(sibling.status()).resolves.toContain("Sibling offset: 0");
});
