import { OpenSkyError } from "./errors.js";

export type AsyncLifecycleState = "open" | "closing" | "closed";

/** Stop admission synchronously, drain whole operations, then retry exact finalization. */
export class AsyncLifecycle {
  private currentState: AsyncLifecycleState = "open";
  private active = 0;
  private drainPromise: Promise<void> | undefined;
  private resolveDrain: (() => void) | undefined;
  private closeAttempt: Promise<void> | undefined;

  constructor(
    private readonly name: string,
    private readonly finalize: () => Promise<void>,
    private readonly drainTimeoutMs?: number,
  ) {
    if (drainTimeoutMs !== undefined && (!Number.isSafeInteger(drainTimeoutMs) || drainTimeoutMs <= 0)) {
      throw new Error("drainTimeoutMs must be a positive safe integer");
    }
  }

  get state(): AsyncLifecycleState { return this.currentState; }

  run<T>(label: string, operation: () => Promise<T>): Promise<T> {
    if (this.currentState !== "open") {
      throw new OpenSkyError(`${this.name} is ${this.currentState}; ${label} was not admitted`, "runtime_closed");
    }
    this.active += 1;
    let result: Promise<T>;
    const release = () => {
      this.active -= 1;
      if (this.active === 0) {
        this.resolveDrain?.();
        this.resolveDrain = undefined;
        this.drainPromise = undefined;
      }
    };
    try { result = Promise.resolve(operation()); }
    catch (error) { release(); throw error; }
    return result.finally(release);
  }

  close(): Promise<void> {
    if (this.currentState === "closed") return Promise.resolve();
    if (this.closeAttempt) return this.closeAttempt;
    this.currentState = "closing";
    const attempt = (async () => {
      await this.drained();
      await this.finalize();
      this.currentState = "closed";
    })();
    this.closeAttempt = attempt;
    void attempt.catch(() => undefined).finally(() => {
      if (this.currentState !== "closed" && this.closeAttempt === attempt) this.closeAttempt = undefined;
    });
    return attempt;
  }

  private async drained(): Promise<void> {
    if (this.active === 0) return;
    this.drainPromise ??= new Promise<void>(resolve => { this.resolveDrain = resolve; });
    if (this.drainTimeoutMs === undefined) return this.drainPromise;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.drainPromise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new OpenSkyError(
            `${this.name} work did not drain within ${this.drainTimeoutMs}ms; cleanup is not proven. ` +
              "Admission remains closed and ownership is retained; no finalizer ran.",
            "runtime_drain_timeout",
          )), this.drainTimeoutMs);
        }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
  }
}
