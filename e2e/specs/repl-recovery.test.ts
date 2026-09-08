import { expect } from "vitest";
import { test } from "../fixtures/repl.js";

test("REPL-R01: ordinary errors preserve the ability to use earlier bindings", async ({ repl }) => {
  await expect(repl.evaluate("let value = 7; throw new Error('example failure')")).rejects.toMatchObject({ evaluatorUsable: true });
  expect(await repl.evaluate("return value")).toMatchObject({ value: 7 });
});

test("REPL-R02: a timeout reports that subsequent cells cannot execute", async ({ repl }) => {
  await expect(repl.evaluate("await new Promise(() => {})")).rejects.toMatchObject({ evaluatorUsable: false });
  await expect(repl.evaluate("return 1")).rejects.toMatchObject({ evaluatorUsable: false });
});
