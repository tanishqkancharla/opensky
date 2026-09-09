import { test, expect } from "../fixtures/repl-await.js";

test("an awaited action may exceed the CPU limit and later cells remain usable", async ({ repl }) => {
  await repl.evaluate("await timer.wait(90); let count = 1; count += 1;");
  expect((await repl.evaluate("return count")).value).toBe(2);
});

test("unbounded host waits still interrupt a recursive JavaScript microtask chain", async ({ repl }) => {
  await expect(repl.evaluate("async function spin() { await 0; return spin(); } return spin();")).rejects.toThrow(/timed out/);
  await expect(repl.evaluate("return 1")).rejects.toThrow(/evaluator is poisoned/);
});
