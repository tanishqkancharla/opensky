import type { DriverClient, DriverResult } from "../src/types.js";

export const DRIVER_TAPE_VERSION = 1 as const;

export type DriverCallMetrics = {
  durationMs: number;
  serializedCharacters: number;
  structuredCharacters: number;
  treeCharacters: number;
  returnedElementCount?: number;
  totalElementCount?: number;
};

export type DriverTapeCall = {
  tool: string;
  args: Record<string, unknown>;
  result?: DriverResult;
  error?: string;
  observed?: DriverCallMetrics;
};

export type DriverTape = {
  version: typeof DRIVER_TAPE_VERSION;
  provenance?: Record<string, unknown>;
  calls: DriverTapeCall[];
};

/** Records the unmodified DriverClient result while canonicalizing volatile call arguments. */
export class RecordingDriverClient implements DriverClient {
  readonly tape: DriverTape;

  constructor(
    private readonly delegate: DriverClient,
    provenance?: Record<string, unknown>,
  ) {
    this.tape = { version: DRIVER_TAPE_VERSION, provenance, calls: [] };
  }

  async call(tool: string, args: Record<string, unknown> = {}): Promise<DriverResult> {
    const started = performance.now();
    try {
      const result = await this.delegate.call(tool, args);
      this.tape.calls.push({
        tool,
        args: canonicalizeDriverArgs(args),
        result,
        observed: measureDriverResult(result, performance.now() - started),
      });
      return result;
    } catch (error) {
      this.tape.calls.push({
        tool,
        args: canonicalizeDriverArgs(args),
        error: error instanceof Error ? error.message : String(error),
        observed: {
          durationMs: roundMs(performance.now() - started),
          serializedCharacters: 0,
          structuredCharacters: 0,
          treeCharacters: 0,
        },
      });
      throw error;
    }
  }

  status(): Promise<{ running: boolean; text: string }> {
    return this.delegate.status();
  }

  ensureDaemon(): Promise<void> {
    return this.delegate.ensureDaemon();
  }
}

/** Strict, zero-latency replay of a recorded DriverClient call sequence. */
export class ReplayDriverClient implements DriverClient {
  private cursor = 0;

  constructor(readonly tape: DriverTape) {
    if (tape.version !== DRIVER_TAPE_VERSION) {
      throw new Error(`Unsupported driver tape version ${String(tape.version)}.`);
    }
  }

  async call(tool: string, args: Record<string, unknown> = {}): Promise<DriverResult> {
    const index = this.cursor;
    const expected = this.tape.calls[index];
    if (!expected) {
      throw new Error(`Driver tape exhausted at call ${index}: received ${tool}.`);
    }
    const actualArgs = canonicalizeDriverArgs(args);
    if (expected.tool !== tool || stableJson(expected.args) !== stableJson(actualArgs)) {
      throw new Error(
        [
          `Driver tape mismatch at call ${index}.`,
          `Expected: ${expected.tool} ${stableJson(expected.args)}`,
          `Received: ${tool} ${stableJson(actualArgs)}`,
        ].join("\n"),
      );
    }
    this.cursor += 1;
    if (expected.error !== undefined) throw new Error(expected.error);
    if (!expected.result) throw new Error(`Driver tape call ${index} has neither result nor error.`);
    return structuredClone(expected.result);
  }

  async status(): Promise<{ running: boolean; text: string }> {
    return { running: true, text: "recorded driver replay" };
  }

  async ensureDaemon(): Promise<void> {}

  assertExhausted(): void {
    if (this.cursor !== this.tape.calls.length) {
      throw new Error(
        `Driver tape has ${this.tape.calls.length - this.cursor} unused call(s), starting at call ${this.cursor}.`,
      );
    }
  }
}

export function canonicalizeDriverArgs(args: Record<string, unknown>): Record<string, unknown> {
  return canonicalize(args, "") as Record<string, unknown>;
}

function canonicalize(value: unknown, key: string): unknown {
  if (value === undefined) return undefined;
  if (key === "screenshot_out_file" && typeof value === "string") return "<SCREENSHOT_OUT>";
  if (Array.isArray(value)) return value.map((item) => canonicalize(item, ""));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([itemKey, item]) => [itemKey, canonicalize(item, itemKey)]),
    );
  }
  return value;
}

function measureDriverResult(result: DriverResult, durationMs: number): DriverCallMetrics {
  const structured = asRecord(result.structured);
  const tree = typeof structured?.tree_markdown === "string"
    ? structured.tree_markdown
    : typeof structured?.text === "string"
      ? structured.text
      : "";
  return {
    durationMs: roundMs(durationMs),
    serializedCharacters: serializedLength(result),
    structuredCharacters: serializedLength(result.structured),
    treeCharacters: tree.length,
    returnedElementCount: finiteNumber(structured?.returned_element_count) ??
      (Array.isArray(structured?.elements) ? structured.elements.length : undefined),
    totalElementCount: finiteNumber(structured?.total_element_count) ?? finiteNumber(structured?.element_count),
  };
}

function serializedLength(value: unknown): number {
  return JSON.stringify(value)?.length ?? 0;
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value, ""));
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function roundMs(value: number): number {
  return Math.round(value * 1000) / 1000;
}
