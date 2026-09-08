import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const exec = promisify(execFile);
export type ScoringProfile = {
  name: string;
  sha256: string;
  office: { sha256: string; version: string; executable: string };
  referenceCount: number;
  references: Record<string, string>;
  adaptedTaskIds: string[];
};

/** Read-only admission: verifies every frozen reference and the actual exporter
 * before any app setup, model dispatch or spending reservation. */
export async function verifyScoringProfile(options: {
  python: string; officeExecutable: string; profilePath: string; expectedSha256?: string;
}): Promise<ScoringProfile> {
  const profile: ScoringProfile = JSON.parse((await exec(options.python, [
    fileURLToPath(new URL("./osworld/scoring_profile.py", import.meta.url)),
    "verify", "--profile", options.profilePath, "--libreoffice", options.officeExecutable,
  ], { env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }, timeout: 30_000 })).stdout);
  if (options.expectedSha256 && profile.sha256 !== options.expectedSha256) throw new Error("Scoring profile changed after admission");
  return profile;
}

/** Copy only verified grading inputs, so the campaign remains self-contained
 * even if the preparation directory changes. Reverify the copy before use. */
export async function retainScoringProfile(options: {
  python: string; officeExecutable: string; profilePath: string; destination: string; expectedSha256: string;
}) {
  const profile = await verifyScoringProfile(options);
  await mkdir(options.destination, { recursive: false });
  const retained = join(options.destination, "profile.json");
  await copyFile(options.profilePath, retained);
  for (const name of Object.keys(profile.references)) {
    const destination = join(options.destination, "references", name);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(dirname(options.profilePath), "references", name), destination);
  }
  await verifyScoringProfile({ ...options, profilePath: retained });
  return retained;
}
