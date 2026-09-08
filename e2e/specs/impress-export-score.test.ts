import { expect } from "vitest";
import { test, impressCases } from "../fixtures/impress-export-score.js";

// Explicit production exporter required. These are saved-file grader acceptance
// checks, not desktop SDK tests or agent campaign results.
for (const task of impressCases) {
  test.runIf(Boolean(process.env.OPENSKY_EVAL_LIBREOFFICE))(
    `${task.name}: exported references distinguish completed, incorrect, and damaged files`,
    async ({ grader }) => {
      const result = await grader.audit(task.id);
      expect(result).toMatchObject({ diagnosticOnly: true, referencePolicy: "task-preserving-export-v1", cleanupVerified: true });
      expect(Object.values(result.controls).every(score => !score.error)).toBe(true);
      expect(result.controls.completed.taskSuccess).toBe(true);
      expect(result.controls.unchanged.taskSuccess).toBe(false);
      expect(result.controls.incorrect.taskSuccess).toBe(false);
      expect(result.controls["damaged-content"]).toMatchObject({ taskSuccess: false, contentMatches: false });
      expect(result.controls["damaged-format"]).toMatchObject({ taskSuccess: false, contentMatches: true });
    }, 600_000,
  );
}
