import { expect } from "vitest";
import { test } from "../fixtures/parity-budget.js";

test("a second controller cannot dispatch while a run is unreconciled", async ({ budget, secondClient }) => {
  await budget.reserve("interrupted smoke run", 5);
  await expect(secondClient.reserve("next run", 5)).rejects.toThrow("reconciliation");
});

test("completed usage releases unused reservation across clients", async ({ budget, secondClient }) => {
  const reservation = await budget.reserve("smoke", 5);
  await budget.settle(reservation, { inputTokens: 100_000, cachedInputTokens: 0, outputTokens: 0 });
  await expect(secondClient.snapshot()).resolves.toMatchObject({ chargedEstimateUsd: 0.4, reservedUsd: 0, availableUsd: 49.6 });
});

test("dispatch stops before the next run reaches the review threshold", async ({ budget }) => {
  const reservation = await budget.reserve("completed campaign", 45);
  await budget.settle(reservation, { inputTokens: 11_000_000, cachedInputTokens: 0, outputTokens: 0 });
  await expect(budget.reserve("would reach fifty", 6)).rejects.toThrow("review required before $50");
});

test("missing usage cannot silently clear a reservation", async ({ budget, secondClient }) => {
  const reservation = await budget.reserve("lost usage event", 5);
  await expect(budget.settle(reservation, { inputTokens: NaN, cachedInputTokens: 0, outputTokens: 0 })).rejects.toThrow("Invalid token usage");
  await expect(secondClient.reserve("next run", 5)).rejects.toThrow("reconciliation");
});

test("a reservation overrun halts future dispatch and records its full estimate", async ({ budget, secondClient }) => {
  const reservation = await budget.reserve("underestimated run", 1);
  await budget.settle(reservation, { inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 0 });
  await expect(secondClient.snapshot()).resolves.toMatchObject({ chargedEstimateUsd: 4, reservedUsd: 0 });
  await expect(secondClient.reserve("next run", 5)).rejects.toThrow("Usage exceeded reservation");
});

test("a remote worker claims the existing reservation without granting another allowance", async ({ budget, secondClient }) => {
  const reservation = await budget.reserve("remote smoke", 5);
  await secondClient.claim(reservation, "ci-run-123");
  await expect(budget.snapshot()).resolves.toMatchObject({ reservedUsd: 5, availableUsd: 45 });
  await expect(budget.claim(reservation, "ci-run-456")).rejects.toThrow("already claimed");
});

test("a remote worker cannot invent a reservation or reuse settled spending", async ({ budget }) => {
  await expect(budget.claim("unknown", "ci-run")).rejects.toThrow("missing");
  const reservation = await budget.reserve("finished remote smoke", 5);
  await budget.settle(reservation, { inputTokens: 100_000, cachedInputTokens: 0, outputTokens: 0 });
  await expect(budget.claim(reservation, "ci-retry")).rejects.toThrow("settled");
});

test("terminal runs with incomplete usage consume the full allowance before another dispatch", async ({ budget, secondClient }) => {
  const reservation = await budget.reserve("interrupted remote run", 5);
  await budget.settleConservatively(reservation, "CI run completed; interrupted receipt retained");
  await expect(secondClient.snapshot()).resolves.toMatchObject({ chargedEstimateUsd: 5, reservedUsd: 0, availableUsd: 45 });
  await expect(secondClient.claim(reservation, "retry")).rejects.toThrow("settled");
  await expect(secondClient.reserve("next task", 5)).resolves.toBeTypeOf("string");
});
