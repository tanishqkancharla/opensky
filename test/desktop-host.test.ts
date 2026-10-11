import assert from "node:assert/strict";
import { it } from "node:test";
import { DesktopActionQueue, createOpenSkyHost } from "../src/desktop-host.js";
import { OpenSkyError } from "../src/errors.js";
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => resolve = yes); return { promise, resolve }; }
it("cancels queued actions before the operation can produce an effect", async () => {
  const queue = new DesktopActionQueue(), gate = deferred<void>(), started = deferred<void>(); let effects = 0;
  const first = queue.submit(async () => { started.resolve(); await gate.promise; }); await started.promise;
  const stop = new AbortController(); const second = queue.submit(() => ++effects, { signal: stop.signal }); stop.abort();
  assert.equal(second.query().state, "cancelled");
  await assert.rejects(second.wait(), { code: "desktop_action_cancelled" }); assert.equal(effects, 0);
  gate.resolve(); await first.wait(); await queue.drain(); assert.equal(effects, 0);
});
it("an active Stop and caller timeout retain completion and fence conflicting work", async () => {
  const queue = new DesktopActionQueue(), gate = deferred<void>(), started = deferred<void>(), stop = new AbortController(); let document = "", observed = "";
  const active = queue.submit(async () => { document = "prefix"; started.resolve(); await gate.promise; document = "all1000"; return document; }, { signal: stop.signal });
  await started.promise; const next = queue.submit(() => observed = document); stop.abort();
  await assert.rejects(active.wait({ timeoutMs: 10 }), { code: "desktop_wait_timeout" });
  assert.equal(active.query().state, "active"); assert.equal(active.query().stopRequested, true); assert.equal(next.query().state, "queued"); assert.equal(document, "prefix");
  gate.resolve(); assert.equal(await queue.wait(active.id), "all1000"); await next.wait(); await queue.drain(); assert.equal(observed, "all1000");
});
it("completion uncertainty cannot be converted into successful drain or new admission", async () => {
  const queue = new DesktopActionQueue(), started = deferred<void>(), gate = deferred<void>(); let effects = 0;
  const job = queue.submit(async () => { started.resolve(); await gate.promise; throw new OpenSkyError("socket lost", "driver_transport_timeout", { delivery: "unknown" }); });
  await started.promise; const pending = queue.submit(() => ++effects); const drain = queue.drain(); const refused = assert.rejects(drain, { code: "desktop_completion_unknown" }); gate.resolve();
  await assert.rejects(job.wait(), { code: "driver_transport_timeout" }); await refused;
  assert.equal(job.query().state, "unknown"); assert.equal(job.query().endedAt, undefined); assert.equal(effects, 0); assert.equal(pending.query().state, "queued");
  assert.throws(() => queue.submit(() => ++effects), { code: "desktop_admission_closed" }); assert.throws(() => queue.forget(job.id), { code: "desktop_action_retained" });
  pending.cancel(); await assert.rejects(queue.drain(), { code: "desktop_completion_unknown" });
});
it("pre-aborted submissions never execute and close cancels queued work while retaining active work", async () => {
  const queue = new DesktopActionQueue(), stop = new AbortController(); stop.abort(); let effects = 0;
  const cancelled = queue.submit(() => ++effects, { signal: stop.signal }); await assert.rejects(cancelled.wait(), { code: "desktop_action_cancelled" }); await queue.drain(); assert.equal(effects, 0);
  const gate = deferred<void>(), started = deferred<void>(); const active = queue.submit(async () => { started.resolve(); await gate.promise; }); await started.promise;
  const pending = queue.submit(() => ++effects); await assert.rejects(queue.close({ timeoutMs: 10 }), { code: "desktop_wait_timeout" });
  assert.equal(active.query().state, "active"); assert.equal(pending.query().state, "cancelled"); assert.throws(() => queue.submit(() => 1), { code: "desktop_admission_closed" });
  gate.resolve(); await active.wait(); await queue.close(); assert.equal(effects, 0);
});
it("host factory refuses transport deadlines instead of hiding them", () => {
  assert.throws(() => createOpenSkyHost({ driverOptions: { timeoutMs: 500 } } as never), { code: "invalid_params" });
});
