import { expect } from "vitest";
import { test } from "../fixtures/scoring-profile.js";

const check = test.runIf(Boolean(process.env.OPENSKY_EVAL_TEST_SCORING_PROFILE));

check("admission accepts the complete validated reference set", async ({ profile }) => {
  await expect(profile.admit()).resolves.toMatchObject({ name: "task-preserving-export-v1", referenceCount: 7 });
});
check("admission refuses a changed reference before desktop dispatch", async ({ profile }) => {
  await profile.changeReference();
  await expect(profile.admit()).rejects.toThrow("Frozen scoring reference changed");
});
check("admission refuses a missing reference", async ({ profile }) => {
  await profile.removeReference();
  await expect(profile.admit()).rejects.toThrow("No such file");
});
check("admission refuses a different exporter build", async ({ profile }) => {
  await expect(profile.admit({ wrongOffice: true })).rejects.toThrow("LibreOffice exporter differs");
});
check("admission refuses a changed profile after it was frozen in the campaign plan", async ({ profile }) => {
  const admitted = await profile.admit();
  await profile.changeMetadata();
  await expect(profile.admit({ expectedSha256: admitted.sha256 })).rejects.toThrow("Scoring profile changed after admission");
});
check("an incomplete reference inventory cannot be admitted", async ({ profile }) => {
  await profile.omitReferenceEntry();
  await expect(profile.admit()).rejects.toThrow("complete Impress reference set");
});
check("a profile from different original assets or grading sources cannot be admitted", async ({ profile }) => {
  await profile.changeSourcePin();
  await expect(profile.admit()).rejects.toThrow("Scoring sources or original assets changed");
});
check("scoring exposes raw and adapted image results without altering the saved file", async ({ profile }) => {
  const before = await profile.imageHash();
  await expect(profile.scoreImage()).resolves.toMatchObject({ taskSuccess: true, rawOutcome: { taskSuccess: false }, adaptedOutcome: { taskSuccess: true } });
  await expect(profile.imageHash()).resolves.toBe(before);
});
check("unadapted Writer tasks retain their original outcome", async ({ profile }) => {
  await expect(profile.scoreWriter()).resolves.toMatchObject({ taskSuccess: true, rawOutcome: { taskSuccess: true }, adaptedOutcome: null });
});
check("scoring also refuses a profile changed since admission", async ({ profile }) => {
  const admitted = await profile.admit();
  await profile.changeMetadata();
  await expect(profile.scoreImage(admitted.sha256)).rejects.toThrow("Scoring profile changed after admission");
});
check("the campaign controller refuses changed references before creating or dispatching a run", async ({ profile }) => {
  await profile.changeReference();
  await expect(profile.startCampaign()).rejects.toThrow("Frozen scoring reference changed");
  await expect(profile.campaignWasCreated()).resolves.toBe(false);
});
check("the campaign retains its own verified grading inputs", async ({ profile }) => {
  const admitted = await profile.admit();
  await profile.retainForCampaign();
  await profile.changeReference();
  await expect(profile.admitRetained()).resolves.toEqual(admitted);
});
