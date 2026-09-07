import { expect } from "vitest";
import { actionIndex, test } from "../fixtures/sdk.js";
import { stalePage } from "../fixtures/site.js";

const staleTest = test.extend({ html: stalePage });
staleTest("STALE-B01: refuses an obsolete control without clicking another control", async ({ tab, site }) => {
  const before = await tab.getAXState({ emit: false, disableDiffing: true });
  const discarded = actionIndex(before, "button", "Discard control");
  await tab.click(actionIndex(before, "button", "Retire disposable control"));
  await expect.poll(async () => (await site.read()).phase).toBe("retired");

  // Intentionally stale reference: rejection cases are separate from workflows.
  await expect(tab.click(discarded)).rejects.toThrow();
  expect(await tab.getAXState({ emit: false })).toContain("Discarded: 0; replacement: 0; sibling: 0; retire: 1");
});
