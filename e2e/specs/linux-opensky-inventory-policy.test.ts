import { expect, test } from "vitest";
import { DesktopProgramPolicy } from "../../evals/parity/desktop-program.js";

const isolated = () => new DesktopProgramPolicy({ backend: "opensky", appSelectors: ["LibreOffice Writer"], isolatedDesktop: "linux" });

test("isolated OpenSky agent can recover its authorized app name from genuine inventory", () => {
  const policy = isolated();
  expect(policy.accepts('await cua.getState();')).toBe(true);
  expect(policy.accepts('var inventory = await cua.getState({emit: true}); nodeRepl.write(inventory.apps);')).toBe(true);
  expect(policy.accepts('var app = await cua.getApp("LibreOffice Writer"); await app.getAXState();')).toBe(true);
});

test("inventory does not grant another app, dynamic targeting, filesystem or executable access", () => {
  for (const code of [
    'await cua.getApp("Terminal");',
    'await cua.getApp("LibreOffice");',
    'var name = "LibreOffice Writer"; await cua.getApp(name);',
    'await cua.getState(process.env);',
    'await cua.getState({emit: await import("node:fs/promises")});',
    'await cua.getState(); await import("node:fs/promises");',
    'await cua.getState(); await cua.createBrowserTab("chrome", "https://example.com");',
    'await cua.getState(); await cua.listWindows();',
    'await cua["getState"]();',
    'await cua.getState({}, {});',
  ]) expect(isolated().accepts(code), code).toBe(false);
});

test("ordinary host scopes retain their existing inventory boundary", () => {
  for (const backend of ["opensky", "native"] as const) {
    const policy = new DesktopProgramPolicy({ backend, appSelectors: ["LibreOffice Writer"] });
    expect(policy.accepts('await cua.getState();')).toBe(false);
  }
});
