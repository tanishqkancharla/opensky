import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { inferScreenshotScale, readImageMeta } from "../src/image-meta.js";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("image metadata", () => {
  it("reads PNG dimensions", () => {
    const meta = readImageMeta(PNG_1X1);
    assert.equal(meta?.format, "png");
    assert.equal(meta?.width, 1);
    assert.equal(meta?.height, 1);
  });

  it("infers retina scale from the window frame", () => {
    assert.equal(inferScreenshotScale({ width: 396, height: 700 }, { width: 198, height: 350 }), 2);
    assert.equal(inferScreenshotScale({ width: 198, height: 350 }, { width: 198, height: 350 }), 1);
  });
});
