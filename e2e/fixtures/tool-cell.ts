import { test as base, expect } from "vitest";
import { setTimeout } from "node:timers/promises";
import { AsyncToolCell } from "../../evals/async-tool-cell.js";

export const test = base.extend<{ cells: AsyncToolCell; delayedResult: () => Promise<{ content: { type: string; text: string }[] }> }>({
  cells: async ({}, use) => use(new AsyncToolCell()),
  delayedResult: async ({}, use) => use(async () => {
    await setTimeout(65_000);
    return { content: [{ type: "text", text: "Finished the original operation." }] };
  }),
});
export { expect };
