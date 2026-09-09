import { randomUUID } from "node:crypto";

type Response = { content: any[]; details?: any; isError?: boolean };
type Cell = { id: string; completion: Promise<Response>; result?: Response; delivered: boolean };

/** One action batch, with bounded observation waits and no operation deadline. */
export class AsyncToolCell {
  private current?: Cell;

  async start(operation: () => Promise<Response>, waitMs = 30_000): Promise<Response> {
    this.validateWait(waitMs);
    if (this.current && !this.current.delivered) return this.running(this.current, true);
    const cell: Cell = { id: randomUUID(), completion: undefined!, delivered: false };
    this.current = cell;
    cell.completion = Promise.resolve().then(operation).catch(error => ({
      isError: true, content: [{ type: "text", text: String(error) }],
    })).then(result => { cell.result = result; return result; });
    return this.wait(cell.id, waitMs);
  }

  async wait(id: string, waitMs = 30_000): Promise<Response> {
    this.validateWait(waitMs);
    const cell = this.current;
    if (!cell || cell.id !== id) return {
      isError: true, content: [{ type: "text", text: "Unknown cell ID; no action was started or replayed." }],
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!cell.result && waitMs > 0) await Promise.race([
        cell.completion,
        new Promise<void>(resolve => { timer = setTimeout(resolve, waitMs); }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
    if (!cell.result) return this.running(cell);
    const replayed = cell.delivered;
    cell.delivered = true;
    return { ...cell.result, details: { ...cell.result.details, cellId: id, cellStatus: "completed", replayed } };
  }

  private running(cell: Cell, refused = false): Response {
    return {
      ...(refused ? { isError: true } : {}),
      content: [{ type: "text", text: `${refused ? "New code was not started. " : ""}Cell ${cell.id} is pending. Call cua_repl_wait with cell_id "${cell.id}" until completed; do not resubmit the code. The original batch continues without a deadline.` }],
      details: { cellId: cell.id, cellStatus: "running" },
    };
  }

  private validateWait(ms: number) {
    if (!Number.isSafeInteger(ms) || ms < 0 || ms > 30_000) throw new Error("yield_time_ms must be an integer from 0 to 30000");
  }
}
