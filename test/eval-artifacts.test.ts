import { it } from "node:test";
import { runStrictCase } from "./strict-process.js";

it("keeps nested, concurrent and callback artifact owners through strict realm awaits", () =>
  runStrictCase(new URL("./fixtures/strict-artifact-case.ts", import.meta.url), "keeps nested, concurrent and callback artifact owners through strict realm awaits"));
