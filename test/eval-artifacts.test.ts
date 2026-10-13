import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { AsyncRepl } from "../src/async-repl.js";
import { getEvalArtifactPaths, withEvalArtifactPaths, bindEvalArtifactPaths, recordAgentEvent, recordJudgeEvent, type EvalArtifactPaths } from "../evals/artifacts.js";

it("keeps nested, concurrent and callback artifact owners through strict realm awaits", async () => {
  const directory = await mkdtemp(join(tmpdir(), "opensky-artifact-context-"));
  const paths = (name: string): EvalArtifactPaths => ({
    transcript: join(directory, name + ".jsonl"), transcriptMarkdown: join(directory, name + ".md"),
    judgeEvents: join(directory, name + "-judge.jsonl"), judgeTranscript: join(directory, name + "-judge.md") });
  const a = paths("a"), b = paths("b");
  try {
    await withEvalArtifactPaths(a, async () => {
      assert.equal(getEvalArtifactPaths(), a);
      await withEvalArtifactPaths(b, async () => { await Promise.resolve(); assert.equal(getEvalArtifactPaths(), b); });
      assert.equal(getEvalArtifactPaths(), a);
      const repl = new AsyncRepl({ allowNodeApis: false, strictSandbox: true });
      repl.installContextFactory("bridge", "return Object.freeze({ owner: () => __owner() });", {
        __owner: () => getEvalArtifactPaths()?.transcript });
      assert.equal((await repl.evaluate("await 0; return bridge.owner()")).value, a.transcript);
    });
    assert.equal(getEvalArtifactPaths(), null);
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    const first = withEvalArtifactPaths(a, async () => { await wait; recordAgentEvent({ owner: "a" }); });
    await withEvalArtifactPaths(b, async () => { recordAgentEvent({ owner: "b" }); release(); await first; assert.equal(getEvalArtifactPaths(), b); });
    assert.equal(JSON.parse((await readFile(a.transcript, "utf8")).trim()).event.owner, "a");
    assert.equal(JSON.parse((await readFile(b.transcript, "utf8")).trim()).event.owner, "b");
    assert.equal(getEvalArtifactPaths(), null);
    // Stream subscribers may be invoked by timers/emitters after registration
    // scope has returned, or while a different run is active.
    const unowned = bindEvalArtifactPaths(() => recordAgentEvent({ owner: "unowned" }));
    const subscriber = await withEvalArtifactPaths(a, async () =>
      bindEvalArtifactPaths((event: { owner: string }) => {
        recordAgentEvent(event); recordJudgeEvent(event); return getEvalArtifactPaths();
      }));
    await withEvalArtifactPaths(b, async () => {
      assert.equal(subscriber({ owner: "a-subscriber" }), a);
      unowned();
      assert.equal(getEvalArtifactPaths(), b);
      await new Promise<void>(resolve => setTimeout(() => {
        assert.equal(subscriber({ owner: "a-timer" }), a); resolve();
      }, 0));
      assert.equal(getEvalArtifactPaths(), b);
    });
    const agentOwners = (await readFile(a.transcript, "utf8")).trim().split("\n")
      .map(line => JSON.parse(line).event.owner);
    assert.deepEqual(agentOwners, ["a", "a-subscriber", "a-timer"]);
    const judgeOwners = (await readFile(a.judgeEvents, "utf8")).trim().split("\n")
      .map(line => JSON.parse(line).event.owner);
    assert.deepEqual(judgeOwners, ["a-subscriber", "a-timer"]);
    assert.equal((await readFile(b.transcript, "utf8")).trim().split("\n").length, 1);
    assert.equal(getEvalArtifactPaths(), null);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
