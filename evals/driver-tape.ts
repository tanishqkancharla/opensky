import type { DriverClient, DriverResult } from "../src/types.js";
import { OpenSkyError } from "../src/errors.js";

export const DRIVER_TAPE_VERSION = 1 as const;
const ERROR_DETAILS_MAX_CHARS = 16_384;
const ERROR_LABEL_MAX_CHARS = 256;

/** Present only for OpenSkyError; additive to the legacy message string. */
export type DriverTapeErrorMetadata = {
  name: string;
  code?: string;
  details?: unknown;
};

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
  errorMetadata?: DriverTapeErrorMetadata;
  observed?: DriverCallMetrics;
};

export type DriverTape = {
  version: typeof DRIVER_TAPE_VERSION;
  provenance?: Record<string, unknown>;
  calls: DriverTapeCall[];
};

export type ReplayCompatibility = {
  /** Replay-only bridge for v1 calls recorded before OpenSky supplied its base session explicitly. */
  kind: "v1_implicit_base_session";
  baseSession: string;
};

export type ReplayCompatibilityReceipt = ReplayCompatibility & {
  appliedCallIndices: number[];
};

/** Records the unmodified DriverClient result while canonicalizing volatile call arguments. */
export class RecordingDriverClient implements DriverClient {
  readonly tape: DriverTape;

  get sessionOwnership(): DriverClient["sessionOwnership"] { return this.delegate.sessionOwnership; }

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
        ...(error instanceof OpenSkyError ? { errorMetadata: errorMetadata(error) } : {}),
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
  private readonly appliedCompatibilityCalls: number[] = [];

  constructor(
    readonly tape: DriverTape,
    private readonly options: { compatibility?: ReplayCompatibility } = {},
  ) {
    if (tape.version !== DRIVER_TAPE_VERSION) {
      throw new Error(`Unsupported driver tape version ${String(tape.version)}.`);
    }
    if (options.compatibility &&
        (options.compatibility.kind !== "v1_implicit_base_session" || !options.compatibility.baseSession)) {
      throw new Error("Replay compatibility requires a non-empty deterministic baseSession.");
    }
  }

  get compatibilityReceipt(): ReplayCompatibilityReceipt | undefined {
    const compatibility = this.options.compatibility;
    return compatibility ? { ...compatibility, appliedCallIndices: [...this.appliedCompatibilityCalls] } : undefined;
  }

  async call(tool: string, args: Record<string, unknown> = {}): Promise<DriverResult> {
    const index = this.cursor;
    const expected = this.tape.calls[index];
    if (!expected) {
      throw new Error(`Driver tape exhausted at call ${index}: received ${tool}.`);
    }
    const actualArgs = canonicalizeDriverArgs(args);
    const exactArgs = stableJson(expected.args) === stableJson(actualArgs);
    const compatibleBaseSession = !exactArgs && this.matchesImplicitBaseSession(expected.args, actualArgs);
    if (expected.tool !== tool || (!exactArgs && !compatibleBaseSession)) {
      throw new Error(
        [
          `Driver tape mismatch at call ${index}.`,
          `Expected: ${expected.tool} ${stableJson(expected.args)}`,
          `Received: ${tool} ${stableJson(actualArgs)}`,
        ].join("\n"),
      );
    }
    if (expected.errorMetadata !== undefined) {
      const metadata = expected.errorMetadata;
      if (typeof expected.error !== "string" || !metadata || typeof metadata !== "object" ||
          typeof metadata.name !== "string" || metadata.name.length > ERROR_LABEL_MAX_CHARS ||
          (metadata.code !== undefined && (typeof metadata.code !== "string" || metadata.code.length > ERROR_LABEL_MAX_CHARS))) {
        throw new OpenSkyError(`Invalid driver tape error metadata at call ${index}.`, "driver_tape_error_metadata_invalid");
      }
      const replayed = new OpenSkyError(expected.error, metadata.code,
        metadata.details === undefined ? undefined : boundedErrorDetails(metadata.details));
      replayed.name = metadata.name;
      if (compatibleBaseSession) this.appliedCompatibilityCalls.push(index);
      this.cursor += 1;
      throw replayed;
    }
    if (compatibleBaseSession) this.appliedCompatibilityCalls.push(index);
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

  private matchesImplicitBaseSession(
    expectedArgs: Record<string, unknown>,
    actualArgs: Record<string, unknown>,
  ): boolean {
    const compatibility = this.options.compatibility;
    if (!compatibility || compatibility.kind !== "v1_implicit_base_session") return false;
    if (Object.prototype.hasOwnProperty.call(expectedArgs, "session")) return false;
    if (actualArgs.session !== compatibility.baseSession) return false;
    const { session: _baseSession, ...withoutSession } = actualArgs;
    return stableJson(expectedArgs) === stableJson(withoutSession);
  }
}

function errorMetadata(error: OpenSkyError): DriverTapeErrorMetadata {
  const field = (key: string) => Object.getOwnPropertyDescriptor(error, key)?.value;
  const name = field("name");
  const code = field("code");
  const details = field("details");
  return {
    name: typeof name === "string" ? name.slice(0, ERROR_LABEL_MAX_CHARS) : "Error",
    ...(typeof code === "string" && code.length <= ERROR_LABEL_MAX_CHARS ? { code } : {}),
    ...(details !== undefined ? { details: boundedErrorDetails(details) } : {}),
  };
}

/** No getters/toJSON, stack, environment, causes, or arbitrary class instances. */
function boundedErrorDetails(value: unknown): unknown {
  const ancestors = new Set<object>();
  let nodes = 0;
  let chars = 0;
  function copy(input: unknown, depth: number): unknown {
    if (++nodes > 512 || depth > 8) throw new Error("details_limit");
    if (input === null || typeof input === "boolean") return input;
    if (typeof input === "number" && Number.isFinite(input)) return input;
    if (typeof input === "string") {
      chars += input.length;
      if (chars > ERROR_DETAILS_MAX_CHARS) throw new Error("details_limit");
      return input;
    }
    if (!input || typeof input !== "object") throw new Error("non_json_details");
    if (ancestors.has(input)) throw new Error("cyclic_details");
    if (!Array.isArray(input) && Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) {
      throw new Error("non_json_details");
    }
    ancestors.add(input);
    const keys = Object.keys(input);
    if (keys.length > 512) throw new Error("details_limit");
    if (Array.isArray(input)) {
      if (input.length > 512) throw new Error("details_limit");
      if (keys.length !== input.length || keys.some((key, index) => key !== String(index))) throw new Error("non_json_details");
    }
    const output: any = Array.isArray(input) ? [] : Object.create(null);
    for (const key of keys) {
      if (["stack", "env", "environment", "cause", "causes"].includes(key.toLowerCase())) continue;
      chars += key.length;
      if (chars > ERROR_DETAILS_MAX_CHARS) throw new Error("details_limit");
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !("value" in descriptor)) throw new Error("non_json_details");
      output[key] = copy(descriptor.value, depth + 1);
    }
    ancestors.delete(input);
    return output;
  }
  try {
    const copied = copy(value, 0);
    const serialized = JSON.stringify(copied);
    if (serialized.length > ERROR_DETAILS_MAX_CHARS) return { omitted: "details_limit" };
    return JSON.parse(serialized);
  } catch (error) {
    const reason = error instanceof Error && ["details_limit", "non_json_details", "cyclic_details"].includes(error.message)
      ? error.message : "non_json_details";
    return { omitted: reason };
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
