import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AsyncLifecycle } from "../evals/async-lifecycle.js";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("AsyncLifecycle", () => {
  it("stops admission synchronously and drains admitted work before finalizing", { timeout: 1_000 }, async () => {
    const work = deferred<void>();
    const events: string[] = [];
    const lifecycle = new AsyncLifecycle("test runtime", async () => { events.push("finalize"); });
    const admitted = lifecycle.run("first", async () => {
      events.push("start");
      await work.promise;
      events.push("finish");
    });

    const closing = lifecycle.close();
    assert.equal(lifecycle.state, "closing");
    assert.throws(() => lifecycle.run("late", async () => { events.push("late"); }), /was not admitted/);
    assert.deepEqual(events, ["start"]);

    work.resolve();
    await Promise.all([admitted, closing]);
    assert.deepEqual(events, ["start", "finish", "finalize"]);
    assert.equal(lifecycle.state, "closed");
  });

  it("blocks a later nested action after closing starts", { timeout: 1_000 }, async () => {
    const betweenActions = deferred<void>();
    const events: string[] = [];
    const lifecycle = new AsyncLifecycle("test runtime", async () => { events.push("finalize"); });
    const cell = lifecycle.run("cell", async () => {
      events.push("first action");
      await betweenActions.promise;
      assert.throws(
        () => lifecycle.run("second action", async () => { events.push("second action"); }),
        /was not admitted/,
      );
      events.push("cell settled");
    });

    const closing = lifecycle.close();
    betweenActions.resolve();
    await Promise.all([cell, closing]);
    assert.deepEqual(events, ["first action", "cell settled", "finalize"]);
  });

  it("rejects a queued operation's dispatch when it reaches the closed gate", { timeout: 1_000 }, async () => {
    const firstCellDone = deferred<void>();
    const events: string[] = [];
    const lifecycle = new AsyncLifecycle("test runtime", async () => { events.push("finalize"); });
    const firstCell = lifecycle.run("first cell", async () => {
      events.push("first cell");
      await firstCellDone.promise;
    });
    const queuedCell = lifecycle.run("queued cell", async () => {
      await firstCell;
      assert.throws(
        () => lifecycle.run("queued dispatch", async () => { events.push("queued dispatch"); }),
        /was not admitted/,
      );
      events.push("queued cell settled");
    });

    const closing = lifecycle.close();
    firstCellDone.resolve();
    await Promise.all([firstCell, queuedCell, closing]);
    assert.deepEqual(events, ["first cell", "queued cell settled", "finalize"]);
  });

  it("waits for an admitted create-like callback to register before finalizing", { timeout: 1_000 }, async () => {
    const created = deferred<string>();
    const owned: string[] = [];
    const finalizedOwned: string[][] = [];
    const lifecycle = new AsyncLifecycle("test runtime", async () => { finalizedOwned.push([...owned]); });
    const create = lifecycle.run("create target", async () => {
      owned.push(await created.promise);
    });

    const closing = lifecycle.close();
    assert.deepEqual(finalizedOwned, [], "cleanup must not snapshot ownership while creation is in flight");
    created.resolve("session-created-before-close");
    await Promise.all([create, closing]);
    assert.deepEqual(finalizedOwned, [["session-created-before-close"]]);
  });

  it("preserves an admitted rejection while still draining before cleanup", { timeout: 1_000 }, async () => {
    const failed = deferred<void>();
    let finalized = false;
    const lifecycle = new AsyncLifecycle("test runtime", async () => { finalized = true; });
    const operation = lifecycle.run("failing dispatch", async () => {
      await failed.promise;
      throw new Error("dispatch failed");
    });
    const closing = lifecycle.close();

    failed.resolve();
    await assert.rejects(operation, /dispatch failed/);
    await closing;
    assert.equal(finalized, true);
  });

  it("coalesces concurrent close and permits exact-cleanup retry after failure", { timeout: 1_000 }, async () => {
    let attempts = 0;
    const firstAttempt = deferred<void>();
    const lifecycle = new AsyncLifecycle("test runtime", async () => {
      attempts += 1;
      if (attempts === 1) await firstAttempt.promise;
    });

    const firstClose = lifecycle.close();
    assert.equal(lifecycle.close(), firstClose);
    firstAttempt.reject(new Error("cleanup failed"));
    await assert.rejects(firstClose, /cleanup failed/);
    await Promise.resolve();
    assert.equal(lifecycle.state, "closing");

    await lifecycle.close();
    assert.equal(attempts, 2);
    assert.equal(lifecycle.state, "closed");
    await lifecycle.close();
    assert.equal(attempts, 2);
  });
});
