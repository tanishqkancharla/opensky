import { expect, test } from "vitest";
import { effectiveLinuxTaskInstruction } from "../../evals/parity/linux-task-instruction.js";
import { matchedLinuxPrompt } from "../../evals/parity/linux-prompt.js";
const task = { id: "fixture", instruction: "Original wording." };
const revision = { taskId: task.id, upstreamInstruction: task.instruction, instruction: "Clarified wording.", revision: 2 };

test("unrevised tasks retain their original instruction", () => {
  expect(effectiveLinuxTaskInstruction(task, [])).toBe(task.instruction);
  expect(effectiveLinuxTaskInstruction({ ...task, id: "other" }, [revision])).toBe(task.instruction);
});
test("one provenance-checked revision applies identically to both backend prompts", () => {
  const instruction = effectiveLinuxTaskInstruction(task, [revision]);
  const prompt = (backend: "native" | "opensky") => matchedLinuxPrompt({ backend, taskInstruction: instruction, appName: "LibreOffice Writer", inputFile: "fixture.docx" });
  expect(prompt("native").replace("the Computer use plugin", "OpenSky")).toBe(prompt("opensky"));
  expect(instruction).toBe(revision.instruction);
});
test("stale original wording, duplicate revisions and invalid revision records fail closed", () => {
  for (const revisions of [[revision, revision], [{ ...revision, upstreamInstruction: "different" }],
    [{ ...revision, revision: 1 }], [{ ...revision, revision: 2.1 }], [{ ...revision, instruction: " " }], null]) {
    expect(() => effectiveLinuxTaskInstruction(task, revisions)).toThrow(/revision/);
  }
});
