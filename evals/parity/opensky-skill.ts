import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

export type OpenSkySkill = {
  sourcePath: string;
  relativePath: string;
  content: string;
  sha256: string;
};

export type OpenSkyEvaluationPrompt = {
  taskContext: string;
  skillGuide: string;
  prompt: string;
};

/** Load the shipped skill instead of maintaining a second evaluation-only guide. */
export async function loadOpenSkySkill(repo: string): Promise<OpenSkySkill> {
  const sourcePath = join(repo, "skills", "opensky", "SKILL.md");
  const content = await readFile(sourcePath, "utf8");
  return {
    sourcePath,
    relativePath: relative(repo, sourcePath),
    content,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}

/** Persist the exact evaluated instructions alongside the normal invocation. */
export async function writeOpenSkySkillReceipt(artifacts: string, skill: OpenSkySkill): Promise<void> {
  await writeFile(join(artifacts, "opensky-skill-receipt.json"), JSON.stringify({
    relativePath: skill.relativePath,
    sha256: skill.sha256,
    content: skill.content,
  }, null, 2), { flag: "wx", mode: 0o600 });
}

/** Keep benchmark task context separate from the reusable bundled skill. */
export function buildOpenSkyEvaluationPrompt(options: {
  taskInstruction: string;
  platform: string;
  inputFile: string;
  appName: string;
  authorizedApp: string;
  skill: OpenSkySkill;
  completion: string;
}): OpenSkyEvaluationPrompt {
  const taskContext = `Task: ${options.taskInstruction}\nYou are using ${options.platform}. The document ${options.inputFile} is already open in ${options.appName}. The exact authorized app identifier for cua.getApp is ${JSON.stringify(options.authorizedApp)}; use it unchanged. Save your changes to this same file, preserving its existing format and unrelated content. Use only this owned ${options.appName} instance. Do not open other documents/apps, run macros/commands, access network services, use the clipboard, or quit the app. Cleanup is handled afterward.`;
  const skillGuide = `Bundled OpenSky skill (${options.skill.relativePath}, SHA-256 ${options.skill.sha256}):\n${options.skill.content}`;
  return { taskContext, skillGuide, prompt: `${taskContext}\n${skillGuide}\n${options.completion}` };
}
