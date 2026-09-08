import { mkdir, readFile, writeFile, rename, open, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export type Usage = { inputTokens: number; cachedInputTokens: number; outputTokens: number; cacheWriteInputTokens?: number };
type Entry = { id: string; label: string; reservationUsd: number; status: "reserved" | "settled"; chargedEstimateUsd?: number; usage?: Usage; note?: string };
type Ledger = { version: 1; approvedThroughUsd: number; entries: Entry[]; haltedReason?: string };

/** Conservative standard Terra long-context API-equivalent cost, not a bill. */
export function estimatedUsd(usage: Usage): number {
  const numbers = [usage.inputTokens, usage.cachedInputTokens, usage.outputTokens, usage.cacheWriteInputTokens ?? 0];
  if (numbers.some(n => !Number.isSafeInteger(n) || n < 0) || usage.cachedInputTokens > usage.inputTokens) throw new Error("Invalid token usage; retain reservation");
  // Count cache writes at the full write rate in addition to input if the
  // provider's accounting is ambiguous. This deliberately overestimates.
  return ((usage.inputTokens - usage.cachedInputTokens) * 4 + usage.cachedInputTokens * 0.4 + usage.outputTokens * 18 + (usage.cacheWriteInputTokens ?? 0) * 5) / 1_000_000;
}

export class EvaluationBudget {
  constructor(readonly path: string) {}

  async initialize() {
    await mkdir(dirname(this.path), { recursive: true });
    try { await writeFile(this.path, JSON.stringify({ version: 1, approvedThroughUsd: 50, entries: [] }), { flag: "wx", mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  }

  async snapshot() {
    const ledger = JSON.parse(await readFile(this.path, "utf8")) as Ledger;
    if (ledger.version !== 1 || !Number.isFinite(ledger.approvedThroughUsd) || !Array.isArray(ledger.entries)) throw new Error("Invalid spending ledger");
    const chargedEstimateUsd = ledger.entries.reduce((sum, item) => sum + (item.status === "settled" ? item.chargedEstimateUsd! : 0), 0);
    const reservedUsd = ledger.entries.reduce((sum, item) => sum + (item.status === "reserved" ? item.reservationUsd : 0), 0);
    if (![chargedEstimateUsd, reservedUsd].every(n => Number.isFinite(n) && n >= 0)) throw new Error("Invalid spending entries");
    return { ...ledger, chargedEstimateUsd, reservedUsd, availableUsd: ledger.approvedThroughUsd - chargedEstimateUsd - reservedUsd };
  }

  async reserve(label: string, reservationUsd: number): Promise<string> {
    if (!Number.isFinite(reservationUsd) || reservationUsd <= 0) throw new Error("A positive known cost reservation is required");
    return this.mutate(async ledger => {
      if (ledger.haltedReason) throw new Error(ledger.haltedReason);
      if (ledger.entries.some(entry => entry.status === "reserved")) throw new Error("An in-flight or interrupted run needs reconciliation before another dispatch");
      const used = ledger.entries.reduce((sum, entry) => sum + (entry.status === "reserved" ? entry.reservationUsd : entry.chargedEstimateUsd!), 0);
      if (!Number.isFinite(used) || used + reservationUsd >= ledger.approvedThroughUsd) throw new Error(`Spending checkpoint: review required before $${ledger.approvedThroughUsd}`);
      const id = randomUUID(); ledger.entries.push({ id, label, reservationUsd, status: "reserved" }); return id;
    });
  }

  async settle(id: string, usage: Usage, note?: string) {
    const cost = estimatedUsd(usage);
    await this.mutate(async ledger => {
      const entry = ledger.entries.find(entry => entry.id === id);
      if (!entry || entry.status !== "reserved") throw new Error("Unknown or already settled reservation");
      if (cost > entry.reservationUsd) ledger.haltedReason = "Usage exceeded reservation; reconcile before another run";
      Object.assign(entry, { status: "settled", chargedEstimateUsd: cost, usage, note });
    });
  }

  private async mutate<T>(action: (ledger: Ledger) => Promise<T>) {
    // A concurrent controller must retry later, not race the same $50 budget.
    const lock = await open(`${this.path}.lock`, "wx", 0o600);
    try {
      const ledger = JSON.parse(await readFile(this.path, "utf8")) as Ledger;
      if (ledger.version !== 1 || !Array.isArray(ledger.entries) || !Number.isFinite(ledger.approvedThroughUsd)) throw new Error("Invalid spending ledger");
      const result = await action(ledger);
      const temporary = `${this.path}.${randomUUID()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(ledger, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      await rename(temporary, this.path);
      return result;
    } finally { await lock.close(); await unlink(`${this.path}.lock`); }
  }
}
