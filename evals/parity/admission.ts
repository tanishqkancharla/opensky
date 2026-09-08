import { readFileSync, writeFileSync, renameSync } from "node:fs";

export type TaskLimit = "tool_call_budget_exceeded" | "run_timeout";
type Receipt = { attemptedCalls: number; admittedCalls: number; deniedReason: TaskLimit | null };

/** Enforce the evaluation allowance before forwarding a cell to either real
 * backend. The receipt is external harness evidence, never agent context. */
export class DesktopAdmission {
  private receipt: Receipt = { attemptedCalls: 0, admittedCalls: 0, deniedReason: null };
  constructor(private configPath: string, private receiptPath: string) { this.persist(); }

  admit(): TaskLimit | null {
    const config = JSON.parse(readFileSync(this.configPath, "utf8"));
    if (!Number.isSafeInteger(config.maxCalls) || config.maxCalls < 1 ||
        !Number.isSafeInteger(config.deadline) || config.deadline < 1) throw new Error("Evaluation dispatch allowance is not armed");
    this.receipt.attemptedCalls++;
    const reason = this.receipt.deniedReason ??
      (Date.now() >= config.deadline ? "run_timeout" :
        this.receipt.admittedCalls >= config.maxCalls ? "tool_call_budget_exceeded" : null);
    if (reason) this.receipt.deniedReason = reason;
    else this.receipt.admittedCalls++;
    this.persist();
    return reason;
  }

  private persist() {
    writeFileSync(`${this.receiptPath}.tmp`, JSON.stringify(this.receipt), { mode: 0o600 });
    renameSync(`${this.receiptPath}.tmp`, this.receiptPath);
  }
}

export function configuredAdmission() {
  const config = process.env.PARITY_DISPATCH_POLICY;
  const receipt = process.env.PARITY_DISPATCH_RECEIPT;
  if (!config && !receipt) return undefined; // Read-only startup probes.
  if (!config || !receipt) throw new Error("Incomplete evaluation dispatch configuration");
  return new DesktopAdmission(config, receipt);
}

export function limitResponse(reason: TaskLimit) {
  return { isError: true, structuredContent: { parityTaskLimit: reason },
    content: [{ type: "text", text: `Evaluation task allowance exhausted: ${reason}. This call was not sent to the desktop. Stop now.` }] };
}

/** A declared task allowance ending is a scored failure, provided the actual
 * transport proves admission was bounded. Other interruptions remain invalid. */
export function classifyRun(interruption: string | undefined, turnStatus: string, receipt: Receipt | null, maxCalls: number) {
  const bounded = receipt && Number.isSafeInteger(receipt.admittedCalls) && receipt.admittedCalls >= 0 && receipt.admittedCalls <= maxCalls;
  const taskLimit = interruption === "run_timeout" || interruption === "tool_call_budget_exceeded" ? interruption : null;
  if (taskLimit && bounded && (taskLimit === "run_timeout" || receipt.deniedReason === taskLimit)) {
    return { taskLimit, infrastructureError: null };
  }
  return { taskLimit: null, infrastructureError: interruption ?? (turnStatus !== "completed" ? turnStatus : null) };
}
