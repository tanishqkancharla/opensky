import { runStrictCase } from "./strict-process.js";
import { describe, it } from "node:test";
describe("single-tool native-style cua evaluator", () => {
  it("keeps emit:false and plain expressions silent, with explicit ordered nodeRepl output", () =>
    runStrictCase(new URL("./fixtures/strict-cua-cases.ts", import.meta.url), "keeps emit:false and plain expressions silent, with explicit ordered nodeRepl output"));

  it("emits explicit images on every request and retains output before an error", () =>
    runStrictCase(new URL("./fixtures/strict-cua-cases.ts", import.meta.url), "emits explicit images on every request and retains output before an error"));
  it("rejects invalid browser arguments before the bridge can discard them", () =>
    runStrictCase(new URL("./fixtures/strict-cua-cases.ts", import.meta.url), "rejects invalid browser arguments before the bridge can discard them"));

  it("exposes evaluation and waiting, persists JS state, and does not duplicate emitted results", () =>
    runStrictCase(new URL("./fixtures/strict-cua-cases.ts", import.meta.url), "exposes evaluation and waiting, persists JS state, and does not duplicate emitted results"));

  it("emits each requested screenshot once and keeps silent bridge results diagnostic", () =>
    runStrictCase(new URL("./fixtures/strict-cua-cases.ts", import.meta.url), "emits each requested screenshot once and keeps silent bridge results diagnostic"));

  it("keeps the host bridge lexical and rejects process/fs/network escape routes", () =>
    runStrictCase(new URL("./fixtures/strict-cua-cases.ts", import.meta.url), "keeps the host bridge lexical and rejects process/fs/network escape routes"));
});
