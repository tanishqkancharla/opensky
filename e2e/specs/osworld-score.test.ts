import { expect } from "vitest";
import { test } from "../fixtures/osworld-score.js";

test("an unchanged heading fails the heading task", async ({ scorer, outputs }) => {
  await expect(scorer.score(outputs.originalHeading)).resolves.toMatchObject({ taskSuccess: false, upstreamScore: 0 });
});
test("a centered heading with preserved content passes", async ({ scorer, outputs }) => {
  await expect(scorer.score(outputs.correctHeading)).resolves.toMatchObject({ taskSuccess: true, upstreamScore: 1 });
});
test("centering cannot conceal corruption of unrelated table content", async ({ scorer, outputs }) => {
  await expect(scorer.score(outputs.corruptHeading)).resolves.toMatchObject({ taskSuccess: false, upstreamScore: 1, completeDocumentTextMatches: false });
});
test("the original mixed-case document fails the lowercase task", async ({ scorer, outputs }) => {
  await expect(scorer.score(outputs.originalCase)).resolves.toMatchObject({ taskSuccess: false, upstreamScore: 0 });
});
test("the upstream gold document passes the lowercase task", async ({ scorer, outputs }) => {
  await expect(scorer.score(outputs.correctCase)).resolves.toMatchObject({ taskSuccess: true, upstreamScore: 1 });
});
test("lowercasing paragraphs alone leaves the full-document task incomplete", async ({ scorer, outputs }) => {
  await expect(scorer.score(outputs.partialCase)).resolves.toMatchObject({ taskSuccess: false, upstreamScore: 1, completeDocumentTextMatches: false });
});

for (const specimen of ["originalFont", "originalSubscript", "originalStrike"] as const) {
  test(`${specimen} does not already satisfy its task`, async ({ scorer, outputs }) => {
    await expect(scorer.score(outputs[specimen])).resolves.toMatchObject({ taskSuccess: false, upstreamScore: 0 });
  });
}
for (const specimen of ["correctFont", "correctSubscript", "correctStrike"] as const) {
  test(`${specimen} satisfies the saved-document task`, async ({ scorer, outputs }) => {
    await expect(scorer.score(outputs[specimen])).resolves.toMatchObject({ taskSuccess: true, upstreamScore: 1 });
  });
}
for (const specimen of ["partialFont", "partialSubscript"] as const) {
  test(`${specimen} cannot pass with only a subset formatted`, async ({ scorer, outputs }) => {
    await expect(scorer.score(outputs[specimen])).resolves.toMatchObject({ taskSuccess: false, upstreamScore: 1, formatMatches: false });
  });
}
