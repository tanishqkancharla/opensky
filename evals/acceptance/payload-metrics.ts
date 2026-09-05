export type PayloadCall = Readonly<{
  args?: unknown;
  result?: unknown;
  error?: unknown;
  modelVisibleResult?: unknown;
}>;

export type PayloadMetrics = Readonly<{
  callCount: number;
  argumentSerializedChars: number;
  resultHostSerializedChars: number;
  totalHostSerializedChars: number;
  modelVisibleTextChars: number;
  modelVisibleImageCount: number;
  modelVisibleImageEncodedChars: number;
  modelVisibleImageEncodedCharsByImage: readonly number[];
}>;

export type PublicToolCallCounts = Readonly<{
  total: number | null;
  failed: number | null;
}>;

/** Read canonical scoring counts without turning absent or malformed fields into zero. */
export function extractPublicToolCallCounts(scoring: unknown): PublicToolCallCounts {
  const efficiency = asRecord(asRecord(scoring)?.efficiencyInputs);
  return {
    total: nonNegativeInteger(efficiency?.publicToolCallCount),
    failed: nonNegativeInteger(efficiency?.failedPublicToolCallCount),
  };
}

export function formatPublicToolCallCounts(total: number | null, failed: number | null): string {
  return `${total ?? "?"} total, ${failed ?? "?"} failed`;
}

/**
 * Count transport characters and model-visible content without estimating tokens.
 * Host serialization includes the complete result envelope; model-visible counts
 * include only content blocks delivered to the model.
 */
export function measurePayload(args: unknown, result: unknown, modelVisibleResult: unknown = result): PayloadMetrics {
  const visible = visibleContent(modelVisibleResult);
  const images = visible.flatMap(imageEncodedChars);
  return {
    callCount: 1,
    argumentSerializedChars: serializedChars(args),
    resultHostSerializedChars: serializedChars(result),
    totalHostSerializedChars: serializedChars(args) + serializedChars(result),
    modelVisibleTextChars: visible.reduce<number>((sum, block) => sum + visibleTextChars(block), 0),
    modelVisibleImageCount: visible.filter(isImageBlock).length,
    modelVisibleImageEncodedChars: images.reduce((sum, chars) => sum + chars, 0),
    modelVisibleImageEncodedCharsByImage: images,
  };
}

export function aggregatePayloadMetrics(calls: readonly PayloadCall[]): PayloadMetrics {
  const measured = calls.map((call) => measurePayload(
    call.args ?? null,
    call.result ?? call.error ?? null,
    call.modelVisibleResult ?? call.result ?? call.error ?? null,
  ));
  const imageSizes = measured.flatMap((item) => item.modelVisibleImageEncodedCharsByImage);
  return {
    callCount: measured.length,
    argumentSerializedChars: sum(measured, "argumentSerializedChars"),
    resultHostSerializedChars: sum(measured, "resultHostSerializedChars"),
    totalHostSerializedChars: sum(measured, "totalHostSerializedChars"),
    modelVisibleTextChars: sum(measured, "modelVisibleTextChars"),
    modelVisibleImageCount: sum(measured, "modelVisibleImageCount"),
    modelVisibleImageEncodedChars: sum(measured, "modelVisibleImageEncodedChars"),
    modelVisibleImageEncodedCharsByImage: imageSizes,
  };
}

function serializedChars(value: unknown): number {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? String(value).length : serialized.length;
  } catch {
    return String(value).length;
  }
}

function visibleContent(result: unknown): unknown[] {
  if (typeof result === "string") return [{ type: "text", text: result }];
  if (Array.isArray(result)) return result;
  const record = asRecord(result);
  return Array.isArray(record?.content) ? record.content : [];
}

function visibleTextChars(block: unknown): number {
  const record = asRecord(block);
  return record?.type === "text" && typeof record.text === "string" ? record.text.length : 0;
}

function isImageBlock(block: unknown): boolean {
  const record = asRecord(block);
  return record?.type === "image" || record?.type === "image_url";
}

function imageEncodedChars(block: unknown): number[] {
  if (!isImageBlock(block)) return [];
  const record = asRecord(block)!;
  if (typeof record.data === "string") return [record.data.length];
  if (typeof record.image === "string") return [encodedDataUrlChars(record.image)];
  const imageUrl = asRecord(record.image_url);
  if (typeof imageUrl?.url === "string") return [encodedDataUrlChars(imageUrl.url)];
  return [0];
}

function encodedDataUrlChars(value: string): number {
  if (!value.startsWith("data:")) return 0;
  const comma = value.indexOf(",");
  return comma < 0 ? 0 : value.length - comma - 1;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function sum(values: readonly PayloadMetrics[], key: keyof PayloadMetrics): number {
  return values.reduce((total, value) => total + Number(value[key]), 0);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
