/** Frozen profiles keep calibration evidence separate from historical scores.
 * The independent dollar ledger remains in force under every profile. */
export function runProfile(name = "native-compaction-v1") {
  if (name === "fixed-v1") return { name, purpose: "historical bounded task score", timeoutMs: 240_000, maxToolCalls: 20 };
  if (name === "native-compaction-v1") return { name, purpose: "task completion with Codex native compaction and independent spending checkpoints", timeoutMs: null, maxToolCalls: null };
  throw new Error(`Unknown evaluation profile: ${name}`);
}
