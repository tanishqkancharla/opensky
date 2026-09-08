import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as base } from "vitest";
import { EvaluationBudget } from "../../evals/parity/budget.js";

export const test = base.extend<{ budget: EvaluationBudget; secondClient: EvaluationBudget }>({
  budget: async ({}, use) => {
    const directory = await mkdtemp(join(tmpdir(), "opensky-budget-"));
    const budget = new EvaluationBudget(join(directory, "ledger.json"));
    await budget.initialize();
    try { await use(budget); } finally { await rm(directory, { recursive: true, force: true }); }
  },
  secondClient: async ({ budget }, use) => { await use(new EvaluationBudget(budget.path)); },
});
