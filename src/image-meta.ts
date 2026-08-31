export interface ImageMeta {
  width: number;
  height: number;
  format: "png" | "jpeg";
}

export function readImageMeta(bytes: Uint8Array): ImageMeta | undefined {
  const png = readPngSize(bytes);
  if (png) return { ...png, format: "png" };
  const jpeg = readJpegSize(bytes);
  if (jpeg) return { ...jpeg, format: "jpeg" };
  return undefined;
}

function readPngSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length < 24) return undefined;
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function readJpegSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const length = view.getUint16(offset + 2);
    if (length < 2) return undefined;
    offset += 2 + length;
  }
  return undefined;
}

export function inferScreenshotScale(
  image: { width: number; height: number },
  frame?: { width: number; height: number },
): number | undefined {
  if (!frame || frame.width <= 0 || frame.height <= 0) {
    return image.width > 0 && image.height > 0 ? 1 : undefined;
  }
  const xScale = image.width / frame.width;
  const yScale = image.height / frame.height;
  const scale = Math.round((xScale + yScale) / 2);
  if (scale >= 2 && scale <= 4) return scale;
  return 1;
}
