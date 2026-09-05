export type AsyncLifecycleState = "open" | "closing" | "closed";

/**
 * A small admission barrier for asynchronous runtimes.
 *
 * close() changes the state synchronously, waits for every operation admitted
 * before that transition, and only then invokes the finalizer. Failed
 * finalization may be retried, but the runtime remains closed to new work.
 */
export class AsyncLifecycle {
  private currentState: AsyncLifecycleState = "open";
  private active = 0;
  private drainPromise: Promise<void> | undefined;
  private resolveDrain: (() => void) | undefined;
  private closeAttempt: Promise<void> | undefined;

  constructor(
    private readonly name: string,
    private readonly finalize: () => Promise<void>,
  ) {}

  get state(): AsyncLifecycleState {
    return this.currentState;
  }

  run<T>(label: string, operation: () => Promise<T>): Promise<T> {
    const release = this.admit(label);
    let result: Promise<T>;
    try {
      result = Promise.resolve(operation());
    } catch (error) {
      release();
      throw error;
    }
    return result.finally(release);
  }

  close(): Promise<void> {
    if (this.currentState === "closed") return Promise.resolve();
    if (this.closeAttempt) return this.closeAttempt;

    // This assignment is deliberately before the first await: no execute or
    // bridge dispatch can be admitted once close() has been called.
    this.currentState = "closing";
    const attempt = (async () => {
      await this.drained();
      await this.finalize();
      this.currentState = "closed";
    })();
    this.closeAttempt = attempt;
    void attempt.catch(() => undefined).finally(() => {
      // Keep admission closed, but let an exact-cleanup finalizer be retried.
      if (this.currentState !== "closed" && this.closeAttempt === attempt) this.closeAttempt = undefined;
    });
    return attempt;
  }

  private admit(label: string): () => void {
    if (this.currentState !== "open") {
      throw new Error(`${this.name} is ${this.currentState}; ${label} was not admitted`);
    }
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      if (this.active === 0) {
        this.resolveDrain?.();
        this.resolveDrain = undefined;
        this.drainPromise = undefined;
      }
    };
  }

  private drained(): Promise<void> {
    if (this.active === 0) return Promise.resolve();
    if (!this.drainPromise) {
      this.drainPromise = new Promise<void>((resolve) => { this.resolveDrain = resolve; });
    }
    return this.drainPromise;
  }
}
