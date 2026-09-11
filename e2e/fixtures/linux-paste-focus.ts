import { expect } from "vitest";
import { createCua } from "../../src/index.js";
import type { App } from "../../src/cua.js";
import { test as windowTest } from "./linux-selection-guards.js";

// The existing owned-window fixture leaves the target document in front.
// Bind the consumer App before the test brings its sibling forward.
export const test = windowTest.extend<{ app: App }>({
  app: async ({ sdk }, use) => {
    const app = await createCua(sdk).getApp("LibreOffice");
    await expect(app.getAXState({ disableDiffing: true })).resolves.toContain("Target document contains needle.");
    await use(app);
  },
});
