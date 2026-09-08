import { expect } from "vitest";
import { test } from "../fixtures/parity-policy.js";

test("native agent can inspect its API and drive the authorized app", ({ native }) => {
  expect(native.accepts('globalThis.sky = (await import("@oai/sky")).sky; nodeRepl.write(Object.keys(sky));')).toBe(true);
  expect(native.accepts('await sky.click({app:"org.libreoffice.script", element_index:5}); nodeRepl.write((await sky.get_app_state({app:"org.libreoffice.script"})).text);')).toBe(true);
});

test("native screenshot reading is restricted to a returned screenshot URL", ({ native }) => {
  expect(native.accepts('var fs = await import("node:fs/promises"); var { fileURLToPath } = await import("node:url"); var shot = await sky.get_app_state({app:"org.libreoffice.script"});')).toBe(true);
  expect(native.accepts('await nodeRepl.emitImage({bytes:await fs.readFile(fileURLToPath(shot.screenshot.url)),mimeType:"image/jpeg"});')).toBe(true);
  expect(native.accepts('await fs.readFile("/etc/passwd");')).toBe(false);
  expect(native.accepts('var fake = {screenshot:{url:"file:///etc/passwd"}}; await fs.readFile(fileURLToPath(fake.screenshot.url));')).toBe(false);
});

test("native agent cannot substitute another app or executable code import", ({ native }) => {
  expect(native.accepts('await sky.click({app:"com.apple.Terminal",element_index:1});')).toBe(false);
  expect(native.accepts('globalThis.sky = (await import("node:child_process")).sky;')).toBe(false);
});

test("OpenSky agent can retain its public app binding across turns", ({ opensky }) => {
  expect(opensky.accepts('let app = await cua.getApp("org.libreoffice.script");')).toBe(true);
  expect(opensky.accepts('await app.pressKey("super+s"); await app.getAXState();')).toBe(true);
});

test("OpenSky agent cannot leave the fixture scope through another app or prototype", ({ opensky }) => {
  expect(opensky.accepts('let app = await cua.getApp("Terminal");')).toBe(false);
  expect(opensky.accepts('cua.constructor.constructor("return process")();')).toBe(false);
});
