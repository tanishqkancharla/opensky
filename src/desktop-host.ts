import { randomUUID } from "node:crypto";
import { createOpenSky, OpenSky } from "./opensky.js";
import { createCua, CuaFacade } from "./cua.js";
import { OpenSkyError } from "./errors.js";
import type { OpenSkyOptions } from "./types.js";

export type DesktopActionState = "queued" | "active" | "completed" | "failed" | "cancelled" | "unknown";
export interface DesktopActionSnapshot {
  id: string; label?: string; state: DesktopActionState; stopRequested: boolean;
  startedAt?: string; endedAt?: string;
}
export interface DesktopWaitOptions { signal?: AbortSignal; timeoutMs?: number }
export interface DesktopAction<T> {
  readonly id: string;
  query(): DesktopActionSnapshot;
  cancel(): DesktopActionSnapshot;
  wait(options?: DesktopWaitOptions): Promise<T>;
}
interface Job<T = unknown> {
  snapshot: DesktopActionSnapshot; operation: () => Promise<T> | T;
  result: Promise<T>; resolve(value: T): void; reject(error: unknown): void;
  detach?: () => void;
}
function wait<T>(result: Promise<T>, options: DesktopWaitOptions, snapshot: () => unknown): Promise<T> {
  if (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0 || options.timeoutMs > 2_147_483_647)) {
    return Promise.reject(new OpenSkyError("timeoutMs must be a positive integer no greater than 2147483647", "invalid_params"));
  }
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => { clearTimeout(timer); options.signal?.removeEventListener("abort", aborted); };
    const fail = (code: string) => { cleanup(); reject(new OpenSkyError("Stopped waiting; the action was not replayed, cancelled in flight, or rolled back. Query the action and await completion before conflicting work.", code, snapshot())); };
    const aborted = () => fail("desktop_wait_aborted");
    if (options.signal?.aborted) { aborted(); return; }
    options.signal?.addEventListener("abort", aborted, { once: true });
    if (options.timeoutMs !== undefined) timer = setTimeout(() => fail("desktop_wait_timeout"), options.timeoutMs);
    result.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}
function uncertain(error: unknown): boolean {
  if (error instanceof OpenSkyError && typeof error.details === "object" && error.details !== null && "delivery" in error.details && error.details.delivery === "not_dispatched") return false;
  if (error instanceof OpenSkyError) return error.code === undefined || ["driver_transport_timeout", "driver_transport_error", "driver_transport_closed"].includes(error.code) ||
    (typeof error.details === "object" && error.details !== null && "delivery" in error.details && error.details.delivery === "unknown");
  return error instanceof Error && "code" in error && ["EPIPE", "ECONNRESET", "ETIMEDOUT"].includes(String(error.code));
}

/** One queue per shared desktop. Every host tool/extension must use it. */
export class DesktopActionQueue {
  private jobs = new Map<string, Job>();
  private pending: Job[] = [];
  private active?: Job;
  private blocked?: Job;
  private admissionClosed = false;
  private drainWaiters: Array<{resolve(): void; reject(error: unknown): void}> = [];

  submit<T>(operation: () => Promise<T> | T, options: { signal?: AbortSignal; label?: string } = {}): DesktopAction<T> {
    if (this.admissionClosed || this.blocked) throw new OpenSkyError("Desktop admission is closed or completion is unknown; no action was queued", "desktop_admission_closed", this.blocked?.snapshot);
    const snapshot: DesktopActionSnapshot = { id: randomUUID(), label: options.label, state: "queued", stopRequested: false };
    let resolve!: (value: T) => void, reject!: (error: unknown) => void;
    const result = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    void result.catch(() => undefined);
    const job: Job<T> = { snapshot, operation, result, resolve, reject };
    this.jobs.set(snapshot.id, job as Job); this.pending.push(job as Job);
    const abort = () => this.cancel(snapshot.id);
    if (options.signal?.aborted) abort();
    else if (options.signal) { options.signal.addEventListener("abort", abort, { once: true }); job.detach = () => options.signal!.removeEventListener("abort", abort); }
    queueMicrotask(() => this.pump());
    return { id: snapshot.id, query: () => this.query(snapshot.id), cancel: () => this.cancel(snapshot.id), wait: options => wait(result, options ?? {}, () => this.query(snapshot.id)) };
  }
  query(id: string): DesktopActionSnapshot { return { ...this.job(id).snapshot }; }
  wait<T = unknown>(id: string, options: DesktopWaitOptions = {}): Promise<T> { return wait(this.job(id).result as Promise<T>, options, () => this.query(id)); }
  cancel(id: string): DesktopActionSnapshot {
    const job = this.job(id);
    if (job.snapshot.state === "queued") {
      job.snapshot.stopRequested = true; job.snapshot.state = "cancelled"; job.snapshot.endedAt = new Date().toISOString(); job.detach?.();
      job.reject(new OpenSkyError("Queued action cancelled before dispatch; no input was sent", "desktop_action_cancelled", { actionId: id, delivery: "not_dispatched" }));
      queueMicrotask(() => this.pump());
    } else if (job.snapshot.state === "active" || job.snapshot.state === "unknown") job.snapshot.stopRequested = true;
    return this.query(id);
  }
  forget(id: string): void {
    const job = this.job(id);
    if (!["completed", "failed", "cancelled"].includes(job.snapshot.state)) throw new OpenSkyError("Cannot forget active, queued, or uncertain work", "desktop_action_retained");
    this.jobs.delete(id);
  }
  drain(options: DesktopWaitOptions = {}): Promise<void> {
    if (this.blocked) return Promise.reject(this.blockedError());
    const drained = !this.active && !this.pending.some(job => job.snapshot.state === "queued") ? Promise.resolve() :
      new Promise<void>((resolve, reject) => this.drainWaiters.push({ resolve, reject }));
    return wait(drained, options, () => ({ active: this.active?.snapshot, queued: this.pending.filter(job => job.snapshot.state === "queued").map(job => job.snapshot.id) }));
  }
  close(options: DesktopWaitOptions = {}): Promise<void> {
    this.admissionClosed = true;
    for (const job of this.pending) if (job.snapshot.state === "queued") this.cancel(job.snapshot.id);
    return this.drain(options);
  }
  private job(id: string): Job { const job = this.jobs.get(id); if (!job) throw new OpenSkyError("Unknown host action id", "desktop_action_not_found"); return job; }
  private blockedError(): OpenSkyError { return new OpenSkyError("Driver transport lost completion proof. The desktop remains fenced; drain is not proven. Do not replay input or restart admission based on a timeout.", "desktop_completion_unknown", this.blocked?.snapshot); }
  private pump(): void {
    if (this.active || this.blocked) return;
    let job: Job | undefined;
    while ((job = this.pending.shift())) if (job.snapshot.state === "queued") break;
    if (!job || job.snapshot.state !== "queued") { for (const waiter of this.drainWaiters.splice(0)) waiter.resolve(); return; }
    this.active = job; job.snapshot.state = "active"; job.snapshot.startedAt = new Date().toISOString();
    let operation: Promise<unknown>;
    try { operation = Promise.resolve(job.operation()); } catch (error) { operation = Promise.reject(error); }
    void operation.then(value => { job!.snapshot.state = "completed"; job!.resolve(value); }, error => {
      job!.snapshot.state = uncertain(error) ? "unknown" : "failed";
      if (job!.snapshot.state === "unknown") this.blocked = job;
      job!.reject(error);
    }).finally(() => {
      if (job!.snapshot.state !== "unknown") job!.snapshot.endedAt = new Date().toISOString();
      job!.detach?.(); this.active = undefined;
      if (this.blocked) { for (const waiter of this.drainWaiters.splice(0)) waiter.reject(this.blockedError()); }
      else this.pump();
    });
  }
}

export interface OpenSkyHostContext { sdk: OpenSky; cua: CuaFacade }
export type OpenSkyHostOptions = Omit<OpenSkyOptions, "driver" | "transport" | "driverOptions"> & {
  driverOptions?: Omit<NonNullable<OpenSkyOptions["driverOptions"]>, "timeoutMs">;
};
/** Persistent Node host; workers receive opaque IDs, never own the daemon/SDK. */
export class OpenSkyHost {
  private queue = new DesktopActionQueue();
  private context: OpenSkyHostContext;
  constructor(options: OpenSkyHostOptions = {}) {
    const raw = options as OpenSkyOptions;
    if (raw.driver || raw.transport || raw.driverOptions?.timeoutMs !== undefined) throw new OpenSkyError("OpenSkyHost owns its CLI transport with no operation deadline; use per-wait deadlines instead", "invalid_params");
    const sdk = createOpenSky({ ...options, driverOptions: { ...options.driverOptions, timeoutMs: null } });
    this.context = { sdk, cua: createCua(sdk, { emit: () => undefined }) };
  }
  submit<T>(operation: (context: OpenSkyHostContext) => Promise<T> | T, options?: { signal?: AbortSignal; label?: string }): DesktopAction<T> {
    return this.queue.submit(() => operation(this.context), options);
  }
  query(id: string): DesktopActionSnapshot { return this.queue.query(id); }
  wait<T = unknown>(id: string, options?: DesktopWaitOptions): Promise<T> { return this.queue.wait<T>(id, options); }
  cancel(id: string): DesktopActionSnapshot { return this.queue.cancel(id); }
  forget(id: string): void { this.queue.forget(id); }
  drain(options?: DesktopWaitOptions): Promise<void> { return this.queue.drain(options); }
  async close(options?: DesktopWaitOptions): Promise<void> { await this.queue.close(options); await this.context.sdk.close(); }
}
export function createOpenSkyHost(options: OpenSkyHostOptions = {}): OpenSkyHost { return new OpenSkyHost(options); }
