import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ownedSessionsStillLive,
  parseOperatorSessions,
  successfulEndSessionId,
  toolFailureReason,
  verifyTargetCleanup,
} from "../evals/acceptance/evidence.js";

describe("acceptance runner helpers", () => {
  it("parses content-free operator session inventories and finds only evaluator-owned leaks", () => {
    const sessions = parseOperatorSessions(JSON.stringify({
      count: 2,
      sessions: [
        { session: "eval-browser-1", state: "active", owner_short_id: "abc" },
        { session: "unrelated-user-session", state: "active", owner_short_id: "def" },
      ],
    }));
    assert.deepEqual(ownedSessionsStillLive(["eval-root", "eval-browser-1"], sessions), ["eval-browser-1"]);
  });

  it("rejects malformed inventories instead of treating them as clean", () => {
    assert.throws(() => parseOperatorSessions("{}"), /sessions array/);
    assert.throws(() => parseOperatorSessions('{"sessions":[{"state":"active"}]}'), /string session id/);
  });

  it("does not treat model-visible caught errors as successful MCP calls", () => {
    assert.match(toolFailureReason({
      status: "completed",
      result: {
        isError: false,
        content: [{ type: "text", text: "Error: target was already closed\nThe exception was caught by the REPL." }],
      },
    }) ?? "", /model-visible caught error/);
    assert.equal(toolFailureReason({
      status: "completed",
      result: { isError: false, content: [{ type: "text", text: "Visible page text containing an error rate" }] },
    }), null);
  });

  it("accepts only exact inactive end-session receipts", () => {
    assert.equal(successfulEndSessionId({
      tool: "end_session",
      args: { session: "owned-1" },
      result: { structured: { session: "owned-1", active: false } },
    }), "owned-1");
    assert.equal(successfulEndSessionId({
      tool: "end_session",
      args: { session: "owned-1" },
      result: { isError: false, content: [{ type: "text", text: "Caught Error: end failed" }] },
    }), null);
    assert.equal(successfulEndSessionId({
      tool: "end_session",
      args: { session: "owned-1" },
      result: { structured: { session: "different", active: false } },
    }), null);
  });

  it("does not promote an ended native session to closed-native-window proof", () => {
    const verification = verifyTargetCleanup({
      targetKind: "native_window",
      sessionCleanupVerified: true,
      hasEvaluatorCreatedPrerequisites: false,
    });

    assert.equal(verification.targetCleanupVerified, false);
    assert.equal(verification.cleanupGateVerified, false);
    assert.equal(verification.ownershipLedgerCanBeRemoved, false);
    assert.equal(verification.workTargetAbsent, "not_proven");
    assert.match(verification.targetVerificationError ?? "", /inactive driver sessions do not prove/);
  });

  it("retains exact-owned browser session cleanup behavior", () => {
    const verified = verifyTargetCleanup({
      targetKind: "exact_browser_session",
      sessionCleanupVerified: true,
      hasEvaluatorCreatedPrerequisites: false,
    });
    assert.equal(verified.targetCleanupVerified, true);
    assert.equal(verified.cleanupGateVerified, true);
    assert.equal(verified.ownershipLedgerCanBeRemoved, true);
    assert.equal(verified.workTargetAbsent, "verified_by_exact_cleanup_and_operator_session_absence");

    const unverified = verifyTargetCleanup({
      targetKind: "exact_browser_session",
      sessionCleanupVerified: false,
      hasEvaluatorCreatedPrerequisites: false,
    });
    assert.equal(unverified.targetCleanupVerified, false);
    assert.equal(unverified.cleanupGateVerified, false);
  });

  it("does not overclaim evaluator-created native prerequisite cleanup", () => {
    const verification = verifyTargetCleanup({
      targetKind: "native_window",
      sessionCleanupVerified: true,
      hasEvaluatorCreatedPrerequisites: true,
      exactNativeWorkTargetAbsent: true,
    });

    assert.equal(verification.targetCleanupVerified, true);
    assert.equal(verification.prerequisiteCleanupVerified, false);
    assert.equal(verification.cleanupGateVerified, false);
    assert.equal(verification.ownershipLedgerCanBeRemoved, false);
    assert.equal(verification.allEvaluatorOwnedPrerequisitesClosed, "not_proven");
    assert.match(verification.targetVerificationError ?? "", /prerequisite absence was not independently proven/);
  });
});
