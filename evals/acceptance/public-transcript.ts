/** Human-readable projection only. Never use this lossy view for scoring. */
export function projectPublicTranscript(value: unknown): unknown {
  return project(value, false);
}

function project(value: unknown, byteContext: boolean): unknown {
  if (typeof value === "string") {
    return value.replace(/data:image\/[a-zA-Z0-9.+-]+(?:;[a-zA-Z0-9=.+-]+)*,[^\s"'<>)]*/g,
      url => `[encoded image omitted: ${url.length} chars]`);
  }
  if (value instanceof ArrayBuffer) return bytes(value.byteLength);
  if (ArrayBuffer.isView(value)) return bytes(value.byteLength);
  if (Array.isArray(value)) {
    if (byteContext && value.every(isByte)) return bytes(value.length);
    return value.map(item => project(item, byteContext));
  }
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (record.type === "thinking" || record.type === "reasoning" || record.type === "redacted_thinking") {
    return { type: record.type, omitted: "private reasoning" };
  }
  if (record.type === "Buffer" && Array.isArray(record.data) && record.data.every(isByte)) {
    return bytes(record.data.length);
  }
  const keys = Object.keys(record);
  if ((byteContext || keys.length >= 16 && imageMagic(record)) && keys.length > 0 && keys.every((key, index) => key === String(index) && isByte(record[key]))) {
    return bytes(keys.length);
  }
  const imageBlock = record.type === "image" || record.type === "image_url";
  const imageMime = typeof record.mimeType === "string" && record.mimeType.startsWith("image/");
  return Object.fromEntries(keys.map(key => {
    const child = record[key];
    if (["thinkingSignature", "thoughtSignature", "reasoningSignature"].includes(key)) {
      return [key, "[private signature omitted]"];
    }
    const binary = key === "__cuaBytes" || key === "bytes" || key === "screenshot" ||
      key === "screenshotBytes" || key === "imageBytes" ||
      ((imageBlock || imageMime) && (key === "data" || key === "image"));
    if ((imageBlock || imageMime) && (key === "data" || key === "image") &&
        typeof child === "string" && child.length > 0 && !child.startsWith("data:") &&
        isBase64(child)) {
      return [key, `[encoded image omitted: ${child.length} chars]`];
    }
    return [key, project(child, binary)];
  }));
}
function isByte(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255;
}
function bytes(length: number): string { return `[binary payload omitted: ${length} bytes]`; }
function isBase64(value: string): boolean {
  if (value.length % 4 !== 0) return false;
  let end = value.length;
  if (value[end - 1] === "=") end--;
  if (value[end - 1] === "=") end--;
  for (let i = 0; i < end; i++) {
    const c = value.charCodeAt(i);
    if (!(c >= 65 && c <= 90 || c >= 97 && c <= 122 || c >= 48 && c <= 57 || c === 43 || c === 47)) return false;
  }
  return true;
}
function imageMagic(record: Record<string, unknown>): boolean {
  // Serialized Uint8Array return values can appear as details.result, with no
  // screenshot key. Require an image file signature plus a contiguous byte
  // object; ordinary numeric task objects are otherwise preserved.
  const starts = (prefix: number[]) => prefix.every((byte, i) => record[String(i)] === byte);
  return starts([137, 80, 78, 71, 13, 10, 26, 10]) || starts([255, 216, 255]) ||
    starts([71, 73, 70, 56]) || starts([82, 73, 70, 70]) &&
      [87, 69, 66, 80].every((byte, i) => record[String(i + 8)] === byte);
}

export function timelineFileName(value: string | undefined): string {
  if (value === undefined) return "timeline-full.md";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/.test(value) || value.includes("..")) {
    throw new Error("EVAL_TIMELINE_FILE must be a simple .md basename without traversal");
  }
  return value;
}
