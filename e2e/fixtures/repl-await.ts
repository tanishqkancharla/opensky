import { test as base, expect } from "vitest";
import { AsyncRepl } from "../../src/async-repl.js";

export const test = base.extend<{ repl: AsyncRepl }>({
  repl: async ({}, use) => {
    const repl = new AsyncRepl({ allowNodeApis: false, strictSandbox: true, timeoutMs: 30, awaitTimeoutMs: null });
    const timers = new Set<ReturnType<typeof setTimeout>>();
    repl.installContextFactory("timer", "return Object.freeze({ wait: ms => __wait(ms) });", {
      __wait: (ms: number) => new Promise<void>(resolve => {
        const handle = setTimeout(() => { timers.delete(handle); resolve(); }, ms);
        timers.add(handle);
      }),
    });
    try { await use(repl); }
    finally { for (const handle of timers) clearTimeout(handle); }
  },
});
export { expect };
