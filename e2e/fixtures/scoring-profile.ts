import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test as base } from "vitest";
import { retainScoringProfile, verifyScoringProfile, type ScoringProfile } from "../../evals/parity/scoring-profile.js";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../../evals/parity/osworld/", import.meta.url));
type Outcome = { taskSuccess: boolean };
type Result = Outcome & { rawOutcome: Outcome; adaptedOutcome: Outcome | null; scoringProfile: ScoringProfile };

export const test = base.extend<{
  profile: {
    admit(options?: { wrongOffice?: boolean; expectedSha256?: string }): Promise<ScoringProfile>;
    changeReference(): Promise<void>; removeReference(): Promise<void>;
    changeMetadata(): Promise<void>; omitReferenceEntry(): Promise<void>; changeSourcePin(): Promise<void>;
    scoreImage(expectedSha256?: string): Promise<Result>;
    scoreWriter(): Promise<Result>;
    imageHash(): Promise<string>;
    startCampaign(): Promise<unknown>;
    campaignWasCreated(): Promise<boolean>;
    retainForCampaign(): Promise<void>;
    admitRetained(): Promise<ScoringProfile>;
  };
}>({
  profile: async ({}, use) => {
    const path = process.env.OPENSKY_EVAL_TEST_SCORING_PROFILE;
    const office = process.env.OPENSKY_EVAL_LIBREOFFICE;
    const python = process.env.OPENSKY_EVAL_PYTHON;
    const controls = process.env.OPENSKY_EVAL_CONTROL_ARTIFACTS;
    if (!path || !office || !python || !controls) throw new Error("Set real scoring profile, Python, LibreOffice executable and control artifact paths");
    const temporary = await mkdtemp(join(tmpdir(), "opensky-scoring-profile-"));
    try {
      await cp(dirname(path), temporary, { recursive: true });
      const profilePath = join(temporary, "profile.json");
      const metadata = JSON.parse(await readFile(profilePath, "utf8"));
      const firstReference = Object.keys(metadata.references)[0]!;
      const reference = join(temporary, "references", firstReference);
      const imageTask = "2b94c692-6abb-48ae-ab0b-b3e8a19cb340";
      const imagePath = join(temporary, "agent-image.pptx");
      await cp(join(controls, imageTask, "completed/completed.pptx"), imagePath);
      const score = async (taskId: string, artifact: string, expectedSha256?: string): Promise<Result> => JSON.parse((await exec(python, [
        join(root, "score.py"), taskId, artifact, "--profile", profilePath,
        ...(expectedSha256 ? ["--expected-profile-sha256", expectedSha256] : []),
      ], { env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } })).stdout);
      const saveMetadata = () => writeFile(profilePath, JSON.stringify(metadata));
      const campaignDirectory = join(temporary, "campaign");
      const retainedDirectory = join(temporary, "retained");
      await use({
        admit: async options => verifyScoringProfile({ python, officeExecutable: options?.wrongOffice ? python : office, profilePath, expectedSha256: options?.expectedSha256 }),
        changeReference: async () => { await writeFile(reference, "changed reference file"); },
        removeReference: () => rm(reference),
        changeMetadata: async () => { metadata.adaptation += " changed"; await saveMetadata(); },
        omitReferenceEntry: async () => { delete metadata.references[firstReference]; await saveMetadata(); },
        changeSourcePin: async () => { metadata.sources["manifest.json"] = "0".repeat(64); await saveMetadata(); },
        scoreImage: expectedSha256 => score(imageTask, imagePath, expectedSha256),
        scoreWriter: () => score("d53ff5ee-3b1a-431e-b2be-30ed2673079b", join(root, "d53ff5ee-3b1a-431e-b2be-30ed2673079b/presentation_instruction_2023_Feb_Gold.docx")),
        imageHash: async () => createHash("sha256").update(await readFile(imagePath)).digest("hex"),
        startCampaign: () => exec(process.execPath, ["--import", "tsx", join(root, "../campaign.ts"), "2", campaignDirectory], {
          cwd: join(root, "../../.."),
          env: { ...process.env, OPENSKY_EVAL_PYTHON: python,
            OPENSKY_EVAL_LIBREOFFICE: dirname(dirname(dirname(office))),
            OPENSKY_EVAL_SCORING_PROFILE: profilePath,
            // This refusal test has no authority to spend or open an app even
            // if admission regresses. Leave GUI prerequisites unavailable.
            OPENSKY_DRIVER_BINARY: "", OPENSKY_NATIVE_REPL_CONFIG: "",
          },
        }),
        campaignWasCreated: async () => readFile(join(campaignDirectory, "plan.json")).then(() => true).catch(error => {
          if (error.code === "ENOENT") return false;
          throw error;
        }),
        retainForCampaign: async () => {
          const options = { python, officeExecutable: office, profilePath };
          const admitted = await verifyScoringProfile(options);
          await retainScoringProfile({ ...options, destination: retainedDirectory, expectedSha256: admitted.sha256 });
        },
        admitRetained: () => verifyScoringProfile({ python, officeExecutable: office, profilePath: join(retainedDirectory, "profile.json") }),
      });
    } finally { await rm(temporary, { recursive: true, force: true }); }
  },
});
