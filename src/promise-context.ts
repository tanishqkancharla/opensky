import { createRequire } from "node:module";

// Context attribution must survive cross-realm promises without enabling Node's
// legacy async_hooks promise stack, which VM timeout termination can corrupt.
// One isolate-wide hook holds only weak promise/owner references.
type Frame = { owner: WeakRef<object>; value: unknown; parent?: Frame };
type Hooks = { createHook(callbacks: {
  init(promise: Promise<unknown>, parent?: Promise<unknown>): void;
  before(promise: Promise<unknown>): void;
  after(promise: Promise<unknown>): void;
}): () => void };
const frames = new WeakMap<Promise<unknown>, Frame>();
const stack: Array<Frame | undefined> = [];
let current: Frame | undefined;
let installed = false;
function ensureHooks(): void {
  if (installed) return;
  const hooks = (createRequire(import.meta.url)("node:v8") as { promiseHooks?: Hooks }).promiseHooks;
  if (!hooks) throw new Error("Promise context tracking requires V8 promise hooks");
  hooks.createHook({
    init(promise, parent) {
      const frame = current ?? (parent && frames.get(parent));
      if (frame) frames.set(promise, frame);
    },
    before(promise) { stack.push(current); current = frames.get(promise); },
    after() { current = stack.pop(); },
  });
  installed = true;
}
export class PromiseContext<T> {
  getStore(): T | undefined {
    for (let frame = current; frame; frame = frame.parent) {
      if (frame.owner.deref() === this) return frame.value as T;
    }
    return undefined;
  }
  run<R>(value: T, callback: () => R): R {
    ensureHooks();
    const previous = current, depth = stack.length;
    current = { owner: new WeakRef(this), value, parent: previous };
    try { return callback(); }
    finally {
      // VM termination can skip a promise's after hook. Repair only our local
      // attribution stack at every timed turn; the evaluator revokes/poisons.
      current = previous;
      stack.length = depth;
    }
  }
}
