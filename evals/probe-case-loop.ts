import { AssertionError } from "node:assert";

export interface ProbeCaseExecution {
  run(): Promise<void>;
  /** Return true only for exact, positively verified cleanup of this case. */
  cleanup(): Promise<boolean>;
}

export interface ProbeCaseOutcome {
  assertionFailure?: AssertionError;
}

/**
 * Run one real-probe case and close its admission boundary before returning.
 * Contract fixtures for this helper are orchestration tests, not driver acceptance.
 */
export async function executeProbeCase(execution: ProbeCaseExecution): Promise<ProbeCaseOutcome> {
  let runError: unknown;
  try {
    await execution.run();
  } catch (error) {
    runError = error;
  }

  let cleanupVerified = false;
  try {
    cleanupVerified = await execution.cleanup();
  } catch (error) {
    throw new ProbeCaseCleanupError("Case cleanup threw before exact cleanup was proven", error, runError);
  }
  if (!cleanupVerified) {
    throw new ProbeCaseCleanupError("Case cleanup was not positively verified", undefined, runError);
  }
  if (runError === undefined) return {};
  if (!isContinuableAssertion(runError)) throw runError;
  return { assertionFailure: runError };
}

/** Assertions wrapping an operational error are not safe evidence to continue. */
export function isContinuableAssertion(error: unknown): error is AssertionError {
  return error instanceof AssertionError && !(error.actual instanceof Error);
}

export class ProbeCaseCleanupError extends Error {
  readonly code = "probe_case_cleanup_unverified";

  constructor(message: string, cause?: unknown, readonly runError?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ProbeCaseCleanupError";
  }
}
