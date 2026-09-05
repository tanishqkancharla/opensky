export type OperatorSession = Readonly<{
  session: string;
  state?: string;
  transport?: string;
  client_kind?: string;
  owner_short_id?: string;
  idle_seconds?: number;
}>;

export function parseOperatorSessions(stdout: string): OperatorSession[] {
  const parsed = JSON.parse(stdout) as { sessions?: unknown };
  if (!Array.isArray(parsed.sessions)) throw new Error("operator session inventory did not contain a sessions array");
  return parsed.sessions.map((value, index) => {
    if (!value || typeof value !== "object" || typeof (value as { session?: unknown }).session !== "string") {
      throw new Error(`operator session inventory entry ${index} did not contain a string session id`);
    }
    return value as OperatorSession;
  });
}

export function ownedSessionsStillLive(ownedSessionIds: readonly string[], sessions: readonly OperatorSession[]): string[] {
  const owned = new Set(ownedSessionIds);
  return sessions.map((session) => session.session).filter((session) => owned.has(session));
}

export function toolFailureReason(options: {
  status?: unknown;
  error?: unknown;
  result?: unknown;
}): string | null {
  if (options.status === "failed") return "tool status was failed";
  if (options.error !== undefined && options.error !== null) return `tool error: ${String(options.error)}`;
  const result = asRecord(options.result);
  if (!result) return null;
  if (result.isError === true) return "tool result set isError=true";
  const details = asRecord(result.details);
  if (typeof details?.runtimeError === "string" && details.runtimeError.trim()) {
    return `runtime error: ${details.runtimeError.trim()}`;
  }
  const content = Array.isArray(result.content) ? result.content : [];
  for (const block of content) {
    const text = asRecord(block)?.text;
    if (typeof text !== "string") continue;
    const firstLine = text.trimStart().split("\n", 1)[0]?.trim() ?? "";
    if (/^(?:caught\s+|uncaught\s+)?(?:error|exception)(?:\s+(?:executing|evaluating)\s+(?:code|javascript))?\s*:/i.test(firstLine)) {
      return `model-visible caught error: ${firstLine}`;
    }
  }
  return null;
}

export function successfulEndSessionId(call: {
  tool?: unknown;
  args?: unknown;
  result?: unknown;
  error?: unknown;
}): string | null {
  if (call.tool !== "end_session" || toolFailureReason({ error: call.error, result: call.result })) return null;
  const requested = asRecord(call.args)?.session;
  const structured = asRecord(asRecord(call.result)?.structured);
  return typeof requested === "string" && structured?.session === requested && structured.active === false
    ? requested
    : null;
}

export type CleanupTargetKind = "exact_browser_session" | "native_window";

export type TargetCleanupVerification = Readonly<{
  targetCleanupVerified: boolean;
  prerequisiteCleanupVerified: boolean;
  cleanupGateVerified: boolean;
  ownershipLedgerCanBeRemoved: boolean;
  targetVerificationError: string | null;
  workTargetAbsent: "verified_by_exact_cleanup_and_operator_session_absence" | "verified_by_exact_native_window_absence" | "not_proven";
  allEvaluatorOwnedPrerequisitesClosed: "not_applicable" | "verified_for_runtime_owned_targets" | "verified_by_exact_native_window_absence" | "not_proven";
}>;

/**
 * Interpret already-computed session evidence without treating an inactive
 * driver session as proof that a native window disappeared. Exact browser
 * targets are owned by their isolated driver sessions; native windows require
 * separate identity-and-absence evidence.
 */
export function verifyTargetCleanup(options: {
  targetKind: CleanupTargetKind;
  sessionCleanupVerified: boolean;
  hasEvaluatorCreatedPrerequisites: boolean;
  exactNativeWorkTargetAbsent?: boolean;
  exactNativePrerequisitesAbsent?: boolean;
}): TargetCleanupVerification {
  const browserTarget = options.targetKind === "exact_browser_session";
  const targetCleanupVerified = browserTarget
    ? options.sessionCleanupVerified
    : options.exactNativeWorkTargetAbsent === true;
  const prerequisiteCleanupVerified = !options.hasEvaluatorCreatedPrerequisites
    ? true
    : browserTarget
      ? options.sessionCleanupVerified
      : options.exactNativePrerequisitesAbsent === true;
  const cleanupGateVerified = options.sessionCleanupVerified && targetCleanupVerified && prerequisiteCleanupVerified;
  const targetVerificationError = !options.sessionCleanupVerified
    ? null
    : !targetCleanupVerified
      ? "native work-target absence was not independently proven; inactive driver sessions do not prove that a native window closed"
      : !prerequisiteCleanupVerified
        ? "evaluator-created native prerequisite absence was not independently proven"
        : null;
  return {
    targetCleanupVerified,
    prerequisiteCleanupVerified,
    cleanupGateVerified,
    ownershipLedgerCanBeRemoved: cleanupGateVerified,
    targetVerificationError,
    workTargetAbsent: targetCleanupVerified
      ? browserTarget
        ? "verified_by_exact_cleanup_and_operator_session_absence"
        : "verified_by_exact_native_window_absence"
      : "not_proven",
    allEvaluatorOwnedPrerequisitesClosed: !options.hasEvaluatorCreatedPrerequisites
      ? "not_applicable"
      : prerequisiteCleanupVerified
        ? browserTarget
          ? "verified_for_runtime_owned_targets"
          : "verified_by_exact_native_window_absence"
        : "not_proven",
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
