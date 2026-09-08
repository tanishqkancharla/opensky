import { expect } from "vitest";
import { test } from "../fixtures/parity-admission.js";
import { classifyRun } from "../../evals/parity/admission.js";
import { runProfile } from "../../evals/parity/run-profile.js";

test("new evaluations default to native compaction without call or task-time limits", () => {
  expect(runProfile()).toMatchObject({ name: "native-compaction-v1", timeoutMs: null, maxToolCalls: null });
});

test("desktop dispatch refuses an extra call and retains the admission receipt", async ({ allowance }) => {
  expect(allowance.gate.admit()).toBeNull();
  expect(allowance.gate.admit()).toBeNull();
  expect(allowance.gate.admit()).toBe("tool_call_budget_exceeded");
  await expect(allowance.receipt()).resolves.toEqual({ attemptedCalls: 3, admittedCalls: 2, deniedReason: "tool_call_budget_exceeded" });
});

test("an expired task cannot dispatch a desktop call", ({ expired }) => {
  expect(expired.admit()).toBe("run_timeout");
});

test("a proven task allowance ending stays scored", () => {
  expect(classifyRun("tool_call_budget_exceeded", "interrupted", { attemptedCalls: 21, admittedCalls: 20, deniedReason: "tool_call_budget_exceeded" }, 20)).toEqual({ taskLimit: "tool_call_budget_exceeded", infrastructureError: null });
});

test("missing dispatch evidence remains an infrastructure error", () => {
  expect(classifyRun("tool_call_budget_exceeded", "interrupted", null, 20)).toEqual({ taskLimit: null, infrastructureError: "tool_call_budget_exceeded" });
});

test("unrelated interruption remains invalid even with a dispatch receipt", () => {
  expect(classifyRun("unhandled_permission_request", "interrupted", { attemptedCalls: 1, admittedCalls: 1, deniedReason: null }, 20)).toEqual({ taskLimit: null, infrastructureError: "unhandled_permission_request" });
});

test("uncapped evaluation dispatch continues beyond the historical call limit", async ({ uncapped }) => {
  expect(uncapped.gate.admit()).toBeNull();
  await expect(uncapped.receipt()).resolves.toEqual({ attemptedCalls: 21, admittedCalls: 21, deniedReason: null });
});

test("removing limits does not authorize dispatch before the spending reservation", ({ unarmed }) => {
  expect(() => unarmed.admit()).toThrow("not armed");
});

test("a nonexistent call cap cannot produce a scored cutoff", () => {
  expect(classifyRun("tool_call_budget_exceeded", "interrupted", { attemptedCalls: 21, admittedCalls: 20, deniedReason: "tool_call_budget_exceeded" }, null)).toEqual({ taskLimit: null, infrastructureError: "tool_call_budget_exceeded" });
});
