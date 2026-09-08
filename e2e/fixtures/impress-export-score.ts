import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test as base } from "vitest";
import { expandedCases } from "./osworld-expanded-score.js";

const exec = promisify(execFile);
export const impressCases = expandedCases.slice(8, 13);
type Score = { taskSuccess: boolean; contentMatches: boolean; error?: string };
type Audit = {
  diagnosticOnly: boolean;
  referencePolicy: string;
  cleanupVerified: boolean;
  controls: Record<"unchanged" | "completed" | "incorrect" | "damaged-content" | "damaged-format", Score>;
};

export const test = base.extend<{
  grader: { audit(taskId: string): Promise<Audit> };
}>({
  grader: async ({}, use) => {
    const temporary = await mkdtemp(join(tmpdir(), "opensky-impress-grader-"));
    try {
      await use({ audit: async taskId => {
        const office = process.env.OPENSKY_EVAL_LIBREOFFICE;
        if (!office) throw new Error("OPENSKY_EVAL_LIBREOFFICE must select the production exporter");
        const output = join(process.env.OPENSKY_EVAL_CONTROL_ARTIFACTS ?? temporary, taskId);
        return JSON.parse((await exec(process.env.OPENSKY_EVAL_PYTHON ?? "python3", [
          fileURLToPath(new URL("./impress-export-controls.py", import.meta.url)),
          "--task", taskId, "--libreoffice", office, "--output", output,
        ], { env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }, maxBuffer: 2 * 1024 * 1024 })).stdout);
      } });
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  },
});
