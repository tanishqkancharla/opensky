import { test as base } from "vitest";
import { AsyncRepl } from "../../src/async-repl.js";

export const test = base.extend<{ repl: AsyncRepl }>({
  repl: async ({}, use) => {
    // Real evaluator; a shorter host timeout keeps the timeout scenario cheap.
    // No driver, fake clock, substituted VM, or GUI fixture is involved.
    await use(new AsyncRepl({ allowNodeApis: false, strictSandbox: true, timeoutMs: 100 }));
  },
});
