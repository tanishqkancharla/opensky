import { inspect } from "node:util";
import type { AsyncRepl } from "./async-repl.js";

export type ReplOutput =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: "image/png" | "image/jpeg" | "image/webp" };

export type ImageInput = string | Uint8Array | { bytes: Uint8Array; mimeType?: string };
export interface NodeReplOutput {
  write(value: unknown): void;
  emitImage(value: ImageInput): Promise<void>;
}

/** Explicit output is never deduplicated: the caller requested this attachment. */
export function createNodeReplOutput(emit: (output: ReplOutput) => void): NodeReplOutput {
  return Object.freeze({
    write(value: unknown): void {
      emit({ type: "text", text: typeof value === "string" ? value : inspect(value, { depth: 5, colors: false }) });
    },
    async emitImage(value: ImageInput): Promise<void> {
      emit(imageOutput(value));
    },
  });
}

/** No filesystem/network authority or host objects are exposed to the VM. */
export function installNodeReplOutput(repl: AsyncRepl, emit: (output: ReplOutput) => void): void {
  const output = createNodeReplOutput(emit);
  repl.installContextFactory("nodeRepl", `
    const send = (payload) => {
      const response = JSON.parse(__output(JSON.stringify(payload)));
      if (response.error) throw new Error(response.error);
    };
    return Object.freeze({
      write(value) {
        // Serialize inside the VM; host code never invokes a VM getter/toJSON.
        let encoded;
        try { encoded = JSON.stringify(value); } catch { encoded = undefined; }
        send(encoded === undefined ? {kind:"text", text:String(value)} : {kind:"value", encoded});
      },
      async emitImage(value) {
        if (typeof value === "string") return send({kind:"image", value});
        const bytes = value instanceof Uint8Array ? value : value?.bytes;
        if (!(bytes instanceof Uint8Array)) throw new Error("emitImage expects image bytes, a data URL, or {bytes, mimeType}");
        send({kind:"image", bytes:Array.from(bytes), mimeType:value instanceof Uint8Array ? undefined : value.mimeType});
      },
    });
  `, {
    __output: (request: unknown): string => {
      try {
        if (typeof request !== "string") throw new Error("Invalid output request");
        const payload = JSON.parse(request);
        if (payload.kind === "text") output.write(payload.text);
        else if (payload.kind === "value") output.write(JSON.parse(payload.encoded));
        else if (payload.kind === "image") {
          // The parser is synchronous so no host Promise leaks through the membrane.
          emit(imageOutput(typeof payload.value === "string" ? payload.value : {
            bytes: Uint8Array.from(payload.bytes), mimeType: payload.mimeType,
          }));
        } else throw new Error("Invalid output kind");
        return "{}";
      } catch (error) {
        return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
      }
    },
  });
}

export function imageOutput(value: ImageInput): Extract<ReplOutput, { type: "image" }> {
  let bytes: Buffer;
  let declaredType: string | undefined;
  if (typeof value === "string") {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
    if (!match || match[2]!.length % 4 !== 0) {
      throw new Error("emitImage requires PNG/JPEG/WebP bytes or a base64 data URL; file and network URLs need a host asset resolver");
    }
    declaredType = match[1];
    bytes = Buffer.from(match[2]!, "base64");
  } else {
    const raw = ArrayBuffer.isView(value) ? value : value?.bytes;
    if (!raw || !ArrayBuffer.isView(raw) || Object.prototype.toString.call(raw) !== "[object Uint8Array]") {
      throw new Error("emitImage expects image bytes, a data URL, or {bytes, mimeType}");
    }
    bytes = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
    declaredType = "mimeType" in value ? value.mimeType : undefined;
  }
  const mimeType = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png"
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg"
    : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" ? "image/webp"
    : undefined;
  if (!mimeType || (declaredType !== undefined && declaredType !== mimeType)) {
    throw new Error("emitImage requires recognized PNG/JPEG/WebP bytes matching the declared MIME type");
  }
  return { type: "image", mimeType, data: bytes.toString("base64") };
}
