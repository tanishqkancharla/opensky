import { expect } from "vitest";
import { test, expandedCases } from "../fixtures/osworld-expanded-score.js";

for (const task of expandedCases) {
  test(`${task.name}: unchanged file fails its task`, async ({ scorer, outputs }) => {
    await expect(scorer.score(outputs.original[task.id]!)).resolves.toMatchObject({ taskSuccess: false, upstreamScore: 0 });
  });
  test(`${task.name}: completed file satisfies its task`, async ({ scorer, outputs }) => {
    await expect(scorer.score(outputs.completed[task.id]!)).resolves.toMatchObject({ taskSuccess: true, upstreamScore: 1 });
  });
}

test("a stacked chart does not satisfy the clustered-column request", async ({ scorer, outputs }) => {
  await expect(scorer.score(outputs.stackedChart)).resolves.toMatchObject({ taskSuccess: false, upstreamScore: 1, formatMatches: false });
});
test("a chart cannot conceal changed source data", async ({ scorer, outputs }) => {
  await expect(scorer.score(outputs.changedSource)).resolves.toMatchObject({ taskSuccess: false, upstreamScore: 1, contentMatches: false });
});
test("a chart cannot conceal an unrequested sheet", async ({ scorer, outputs }) => {
  await expect(scorer.score(outputs.extraSheet)).resolves.toMatchObject({ taskSuccess: false, upstreamScore: 1, contentMatches: false });
});
