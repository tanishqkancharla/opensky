import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { buildOpenSkyEvaluationPrompt, loadOpenSkySkill, writeOpenSkySkillReceipt } from "../evals/parity/opensky-skill.js";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("OpenSky evaluations load the shipped skill, preserve it in a receipt, and vary only task context", async () => {
  const skill = await loadOpenSkySkill(repo);
  assert.equal(skill.relativePath, "skills/opensky/SKILL.md");
  assert.equal(skill.sha256, createHash("sha256").update(skill.content).digest("hex"));
  assert.match(skill.content, /preloaded `cua` object through a\n`cua_repl`-style tool/i);
  assert.doesNotMatch(skill.content, /\bLibreOffice\b|\bCalculator\b|\bTextEdit\b|\bImpress\b/);

  const common = { taskInstruction: "Apply the requested change.", platform: "Test OS", inputFile: "fixture.bin", skill,
    completion: "Finish when saved, or report the specific blocker." };
  const first = buildOpenSkyEvaluationPrompt({ ...common, appName: "Target One" });
  const second = buildOpenSkyEvaluationPrompt({ ...common, appName: "Target Two" });
  assert.equal(first.skillGuide, second.skillGuide);
  assert.equal(second.prompt.replace(second.taskContext, first.taskContext), first.prompt);
  assert.match(first.skillGuide, new RegExp(skill.sha256));
  assert.match(first.skillGuide, /Bundled OpenSky skill/);

  const artifacts = await mkdtemp(join(tmpdir(), "opensky-skill-receipt-"));
  await writeOpenSkySkillReceipt(artifacts, skill);
  const receipt = JSON.parse(await readFile(join(artifacts, "opensky-skill-receipt.json"), "utf8"));
  assert.deepEqual(receipt, { relativePath: skill.relativePath, sha256: skill.sha256, content: skill.content });
});
