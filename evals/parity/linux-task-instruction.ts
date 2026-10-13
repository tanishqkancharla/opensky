/** Task wording revisions are separate from the immutable scoring manifest. */
export function effectiveLinuxTaskInstruction(task: { id: string; instruction: string }, revisions: unknown): string {
  if (!Array.isArray(revisions)) throw new Error("Task revisions must be an array");
  const matches = revisions.filter(entry => entry && entry.taskId === task.id);
  if (!matches.length) return task.instruction;
  const revision = matches[0];
  if (matches.length !== 1 || revision.upstreamInstruction !== task.instruction
      || !Number.isInteger(revision.revision) || revision.revision < 2
      || typeof revision.instruction !== "string" || !revision.instruction.trim()) {
    throw new Error("Task wording revision has stale or ambiguous provenance");
  }
  return revision.instruction;
}
