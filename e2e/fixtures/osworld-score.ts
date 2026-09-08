import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test as base } from "vitest";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../../evals/parity/osworld/", import.meta.url));
const heading = "3ef2b351-8a84-4ff2-8724-d86eae9b842e";
const lowercase = "d53ff5ee-3b1a-431e-b2be-30ed2673079b";
type Output = { task: string; path: string };
type Score = { taskSuccess: boolean; upstreamScore: number; completeDocumentTextMatches: boolean };

export const test = base.extend<{
  outputs: Record<"originalHeading" | "correctHeading" | "corruptHeading" | "originalCase" | "correctCase" | "partialCase", Output>;
  scorer: { score(output: Output): Promise<Score> };
}>({
  outputs: async ({}, use) => {
    const temporary = await mkdtemp(join(tmpdir(), "opensky-grader-"));
    try {
      // Real document files are the scorer's public input; these are test
      // specimens, not GUI acceptance evidence or mocked service responses.
      await exec(process.env.OPENSKY_EVAL_PYTHON ?? "python3", ["-c", `
from pathlib import Path
from docx import Document
from docx.enum.text import WD_PARAGRAPH_ALIGNMENT
import sys
root, out = Path(sys.argv[1]), Path(sys.argv[2])
d = Document(root / "${heading}/Constitution_Template_With_Guidelines.docx")
d.paragraphs[0].alignment = WD_PARAGRAPH_ALIGNMENT.CENTER
d.save(out / "correct-heading.docx")
d.tables[0].cell(0, 0).text = "changed unrelated content"
d.save(out / "corrupt-heading.docx")
d = Document(root / "${lowercase}/presentation_instruction_2023_Feb_Gold.docx")
d.tables[0].cell(0, 0).text = "Grammar  5%"
d.save(out / "partial-case.docx")
`, root, temporary], { timeout: 15_000 });
      await use({
        originalHeading: { task: heading, path: join(root, heading, "Constitution_Template_With_Guidelines.docx") },
        correctHeading: { task: heading, path: join(temporary, "correct-heading.docx") },
        corruptHeading: { task: heading, path: join(temporary, "corrupt-heading.docx") },
        originalCase: { task: lowercase, path: join(root, lowercase, "presentation_instruction_2023_Feb.docx") },
        correctCase: { task: lowercase, path: join(root, lowercase, "presentation_instruction_2023_Feb_Gold.docx") },
        partialCase: { task: lowercase, path: join(temporary, "partial-case.docx") },
      });
    } finally { await rm(temporary, { recursive: true, force: true }); }
  },
  scorer: async ({}, use) => {
    await use({ score: async output => JSON.parse((await exec(process.env.OPENSKY_EVAL_PYTHON ?? "python3", [join(root, "score.py"), output.task, output.path], { timeout: 15_000 })).stdout) });
  },
});
