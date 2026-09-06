import assert, { AssertionError } from "node:assert/strict";
import { test } from "node:test";

import { executeProbeCase, ProbeCaseCleanupError } from "../evals/probe-case-loop.js";

// These are orchestration contract fixtures, not real-driver acceptance evidence.
test("a cleanly closed assertion failure permits the serial probe loop to continue", async () => {
  const events: string[] = [];
  const failures: string[] = [];
  for (const name of ["first", "second"]) {
    const outcome = await executeProbeCase({
      run: async () => {
        events.push(`run:${name}`);
        if (name === "first") {
          throw new AssertionError({ message: "fixture mismatch", actual: false, expected: true });
        }
      },
      cleanup: async () => {
        events.push(`cleanup:${name}`);
        return true;
      },
    });
    if (outcome.assertionFailure) failures.push(outcome.assertionFailure.message);
  }

  assert.deepEqual(events, ["run:first", "cleanup:first", "run:second", "cleanup:second"]);
  assert.deepEqual(failures, ["fixture mismatch"]);
});

test("unverified cleanup stops admission before the next serial case", async () => {
  const events: string[] = [];
  await assert.rejects(async () => {
    for (const name of ["first", "second"]) {
      await executeProbeCase({
        run: async () => {
          events.push(`run:${name}`);
          throw new AssertionError({ message: "fixture mismatch", actual: false, expected: true });
        },
        cleanup: async () => {
          events.push(`cleanup:${name}`);
          return false;
        },
      });
    }
  }, (error) => error instanceof ProbeCaseCleanupError && error.code === "probe_case_cleanup_unverified");

  assert.deepEqual(events, ["run:first", "cleanup:first"]);
});

test("an assertion wrapping an operational failure remains terminal after cleanup", async () => {
  const delivery = new Error("delivery unknown");
  const wrapped = new AssertionError({ message: "unexpected refusal", actual: delivery, expected: /does not support/ });
  let cleaned = false;

  await assert.rejects(() => executeProbeCase({
    run: async () => { throw wrapped; },
    cleanup: async () => { cleaned = true; return true; },
  }), (error) => error === wrapped);
  assert.equal(cleaned, true);
});
