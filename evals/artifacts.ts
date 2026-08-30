import { AsyncLocalStorage } from "node:async_hooks";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type EvalArtifactPaths = {
  transcript: string;
  transcriptMarkdown: string;
  judgeEvents: string;
  judgeTranscript: string;
};

const artifactPathsStorage = new AsyncLocalStorage<EvalArtifactPaths>();

export function getEvalArtifactPaths(): EvalArtifactPaths | null {
  return artifactPathsStorage.getStore() ?? null;
}

export async function withEvalArtifactPaths<T>(paths: EvalArtifactPaths, fn: () => Promise<T>): Promise<T> {
  return await artifactPathsStorage.run(paths, fn);
}

export function appendJsonl(path: string | null, record: Record<string, unknown>): void {
  if (!path) return;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(
    path,
    `${JSON.stringify({ timestamp: new Date().toISOString(), ...record }, (_key, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value,
    )}\n`,
  );
}

export function appendMarkdown(path: string | null, markdown: string): void {
  if (!path) return;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, markdown, "utf8");
}

export function recordAgentEvent(event: unknown): void {
  appendJsonl(getEvalArtifactPaths()?.transcript ?? null, { source: "agent", event });
}

export function recordJudgeEvent(event: unknown): void {
  appendJsonl(getEvalArtifactPaths()?.judgeEvents ?? null, { source: "judge", event });
}

export function recordTranscriptMarkdown(opts: {
  source: "agent" | "judge";
  prompt: string;
  transcript: string;
  startedAt: string;
  finishedAt: string;
}): void {
  const paths = getEvalArtifactPaths();
  appendMarkdown(
    opts.source === "agent" ? (paths?.transcriptMarkdown ?? null) : (paths?.judgeTranscript ?? null),
    [
      `## ${opts.source === "agent" ? "Agent" : "Judge"} turn`,
      "",
      `- Started: ${opts.startedAt}`,
      `- Finished: ${opts.finishedAt}`,
      "",
      "### Prompt",
      "",
      "```text",
      opts.prompt.trim(),
      "```",
      "",
      "### Transcript",
      "",
      "```text",
      opts.transcript.trim(),
      "```",
      "",
    ].join("\n"),
  );
}
