import { expect, test } from "vitest";
import { LexicalState } from "../../evals/parity/lexical-state.js";

test("snapshot rollback restores provenance while retaining safely monotonic allocation", () => {
  const state = new LexicalState();
  state.declare("target", { app: true });
  const checkpoint = state.snapshot();
  state.write("target", { app: false, numeric: true });
  const discarded = state.declare("discarded");
  state.restore(checkpoint);
  expect(state.read("target")).toMatchObject({ app: true, numeric: false });
  expect(state.read("discarded")).toBeUndefined();
  expect(state.declare("next")).toBeGreaterThan(discarded);
});

test("function capture writes the outer binding by ID without changing the caller shadow", () => {
  const state = new LexicalState();
  const outer = state.declare("path", { screenshotPath: false });
  const declarationScope = state.globalScopeId;
  const caller = state.enterBlock();
  const shadow = state.declare("path", { screenshotPath: false });
  const functionCaller = state.enterFunction(declarationScope);
  expect(state.resolve("path")).toBe(outer);
  state.write("path", { screenshotPath: true });
  state.leaveScope(functionCaller);
  expect(state.readById(outer)).toMatchObject({ screenshotPath: true });
  expect(state.readById(shadow)).toMatchObject({ screenshotPath: false });
  expect(state.resolve("path")).toBe(shadow);
  state.leaveScope(caller);
});

test("a reserved global forward binding resolves through the declaration frame, never a caller shadow", () => {
  const state = new LexicalState();
  const path = state.reserve("path");
  const declarationScope = state.globalScopeId;
  state.writeById(path, { ordinaryDefined: true, screenshotPath: false });
  const caller = state.enterBlock();
  const local = state.declare("path", { screenshotPath: true });
  const functionCaller = state.enterFunction(declarationScope);
  expect(state.resolve("path")).toBe(path);
  expect(state.read("path")).toMatchObject({ screenshotPath: false });
  state.leaveScope(functionCaller);
  expect(state.resolve("path")).toBe(local);
  expect(state.read("path")).toMatchObject({ screenshotPath: true });
  state.leaveScope(caller);
});

test("branch join intersects authority and retains only jointly declared globals", () => {
  const root = new LexicalState();
  root.declare("shared", { app: true, numeric: true });
  const base = root.snapshot();
  const left = root.clone(); left.write("shared", { numeric: false }); left.declare("both", { app: true }); left.declare("leftOnly", { app: true });
  const right = root.clone(); right.write("shared", { app: false }); right.declare("both", { app: true }); right.declare("rightOnly", { app: true });
  const joined = LexicalState.join(base, left.snapshot(), right.snapshot());
  expect(joined.read("shared")).toMatchObject({ app: false, numeric: false });
  expect(joined.read("both")).toMatchObject({ app: true });
  expect(joined.read("leftOnly")).toBeUndefined();
  expect(joined.read("rightOnly")).toBeUndefined();
});
