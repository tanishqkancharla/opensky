import assert from "node:assert/strict";
import { test } from "node:test";
import { displayUrlAttribute } from "../src/display-url.js";

test("short destination metadata stays exact, including query and fragment", () => {
  for (const url of ["https://example.org/", "https://example.org/search?q=a%20b#results", "https://example.org/資料"]) {
    assert.equal(displayUrlAttribute(url), ` url=${JSON.stringify(url)}`);
  }
  assert.equal(displayUrlAttribute(undefined), "");
  assert.equal(displayUrlAttribute(""), "");
});

test("long URLs are explicit bounded previews, independent of site or URL structure", () => {
  for (const url of [
    `https://example.org/search?token=${"x".repeat(2000)}`,
    `https://docs.example.net/${"deep/".repeat(200)}#section`,
    `https://example.org/${"💧".repeat(200)}`,
  ]) {
    const attribute = displayUrlAttribute(url);
    assert.ok(attribute.startsWith(" urlPreview="));
    const preview = JSON.parse(attribute.slice(" urlPreview=".length));
    assert.equal(Array.from(preview).length, 200);
    assert.ok(preview.endsWith("…"));
    assert.equal(preview, `${Array.from(url).slice(0, 199).join("")}…`);
    assert.notEqual(preview, url);
  }
});

test("preview boundaries are explicit and output escapes quotes and line breaks", () => {
  assert.equal(displayUrlAttribute("a".repeat(200)), ` url=${JSON.stringify("a".repeat(200))}`);
  assert.ok(displayUrlAttribute("a".repeat(201)).startsWith(" urlPreview="));
  assert.equal(displayUrlAttribute('https://example.org/"\n'), ' url="https://example.org/\\\"\\n"');
});
