import { expect, test } from "vitest";
import { DesktopProgramPolicy } from "../../evals/parity/desktop-program.js";

const current = () => new DesktopProgramPolicy({ backend: "native", appSelectors: ["LibreOffice"], isolatedDesktop: "linux", nativeFacade: true });

test("current native Linux admits its genuine bootstrap, window observations and bound public input", () => {
  const p = current();
  expect(p.accepts('await import("@oai/cua/tinyskyAlt");')).toBe(true);
  expect(p.accepts('await cua.listWindows(); await cua.getState();')).toBe(true);
  expect(p.accepts('var app = await cua.getApp({windowId: 4194305});')).toBe(true);
  expect(p.accepts('var state = await app.getAXState(); await app.getScreenshot();')).toBe(true);
  expect(p.accepts('await app.click([100,200]); await app.pressKey("CTRL+S");')).toBe(true);
  expect(p.accepts('await app.typeText("hello"); await app.scroll([100,200], "down", {pixels: 200});')).toBe(true);
});

test("native facade remains restricted to an explicitly isolated Linux desktop", () => {
  for (const scope of [
    {backend: "native" as const, appSelectors: ["LibreOffice"], nativeFacade: true},
    {backend: "native" as const, appSelectors: ["LibreOffice"], isolatedDesktop: "linux" as const},
  ]) {
    const p = new DesktopProgramPolicy(scope);
    expect(p.accepts('await import("@oai/cua/tinyskyAlt");')).toBe(false);
    expect(p.accepts('var app = await cua.getApp({windowId: 123});')).toBe(false);
  }
});

test("native getApp preserves the actual window selector shape and rejects invented bindings", () => {
  for (const code of [
    'var app = await cua.getApp("LibreOffice");',
    'var app = await cua.getApp({windowId: 123, launch: true});',
    'var app = await cua.getApp({windowId: 123}, {});',
    'var data = 3; var data = await cua.getApp({windowId: 123});',
  ]) expect(current().accepts(code), code).toBe(false);
  // Data validity is checked by the real native facade, not emulated by the transport guard.
  expect(current().accepts('var app = await cua.getApp({windowId: -1});')).toBe(true);
  expect(current().accepts('var app = await cua.getApp({windowId: 1.5});')).toBe(true);
  const p = current();
  expect(p.accepts('var app = await cua.getApp({windowId: 123});')).toBe(true);
  expect(p.accepts('var app = await cua.getApp({windowId: 456});')).toBe(true);
});

test("current native facade grants no filesystem, command, browser or prototype capabilities", () => {
  for (const code of [
    'await import("node:child_process");',
    'await import("@oai/cua/tinyskyAlt", {with: {type:"json"}});',
    'await cua.createBrowserTab("chrome", "https://example.com");',
    'var fs = await import("node:fs/promises"); await fs.readFile("/tmp/answer.docx");',
    'var app = await cua.getApp({windowId: 123}); await app["click"]([1,2]);',
    'var app = await cua.getApp({windowId: 123}); app.constructor("return process")();',
    'var app = await cua.getApp({windowId: 123}); await app.facade.close();',
  ]) expect(current().accepts(code), code).toBe(false);
});

test("current native helper calls retain lexical app authority and failure invalidation", () => {
  const p = current();
  expect(p.accepts('var app = await cua.getApp({windowId: 123}); async function save(target) { await target.pressKey("CTRL+S"); } await save(app);')).toBe(true);
  p.executionFailed();
  expect(p.accepts('await save(app);')).toBe(false);
  expect(p.accepts('await app.pressKey("CTRL+S");')).toBe(true);
});
