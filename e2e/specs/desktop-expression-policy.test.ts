import { expect, test } from "vitest";
import { AsyncRepl } from "../../src/async-repl.js";
import { DesktopProgramPolicy } from "../../evals/parity/desktop-program.js";

const native = test.extend<{ policy: DesktopProgramPolicy }>({
  policy: async ({}, use) => use(new DesktopProgramPolicy({ backend: "native", appSelectors: [], isolatedDesktop: "linux" })),
});
const opensky = test.extend<{ policy: DesktopProgramPolicy }>({
  policy: async ({}, use) => use(new DesktopProgramPolicy({ backend: "opensky", appSelectors: ["Fixture"], isolatedDesktop: "linux" })),
});

native("native agents can calculate a click position from observed coordinates", ({ policy }) => {
  expect(policy.accepts('var left = 100; var right = 500;')).toBe(true);
  expect(policy.accepts('await sky.click({x: (left + right) / 2, y: 208 + 3 * 17});')).toBe(true);
});

opensky("OpenSky agents can calculate coordinates and choose text with ordinary expressions", ({ policy }) => {
  expect(policy.accepts('var app = await cua.getApp("Fixture"); var row = 3;')).toBe(true);
  expect(policy.accepts('await app.click([100 + 25, 208 + row * 17]); await app.typeText(row > 0 ? `Row ${row}` : "No rows");')).toBe(true);
});

native("observation-derived expressions remain available in subsequent cells", ({ policy }) => {
  expect(policy.accepts('var images = await sky.get_screenshot(); var width = images[0].width ?? 1280;')).toBe(true);
  expect(policy.accepts('var center = width / 2;')).toBe(true);
  expect(policy.accepts('await sky.click({x: center, y: 100});')).toBe(true);
});

native("all conditional and short-circuit branches retain the document-access boundary", ({ policy }) => {
  expect(policy.accepts('var fs = await import("node:fs/promises");')).toBe(true);
  expect(policy.accepts('var text = true ? "visible" : await fs.readFile("/tmp/answer.docx");')).toBe(false);
  expect(policy.accepts('var text = "visible" || await fs.readFile("/tmp/answer.docx");')).toBe(false);
  expect(policy.accepts('var text = `Result: ${await fs.readFile("/tmp/answer.docx")}`;')).toBe(false);
});

native("calculated strings cannot become screenshot-read authority", ({ policy }) => {
  expect(policy.accepts('var fs = await import("node:fs/promises"); var directory = "/tmp/";')).toBe(true);
  expect(policy.accepts('await fs.readFile(directory + "answer.docx");')).toBe(false);
});

opensky("expressions cannot construct an unauthorized app or executable property", ({ policy }) => {
  expect(policy.accepts('var app = await cua.getApp("Fixture");')).toBe(true);
  expect(policy.accepts('await cua.getApp("Other" + " App");')).toBe(false);
  expect(policy.accepts('await app["con" + "structor"]("return process")();')).toBe(false);
});

for (const backend of ["opensky", "native"] as const) {
  const scope = { backend, appSelectors: ["Fixture"], isolatedDesktop: "linux" as const, ...(backend === "native" ? { nativeFacade: true } : {}) };
  const selector = backend === "native" ? '{windowId:123}' : '"Fixture"';
  test(`${backend}: fresh scoped app assignment follows actual persistent REPL semantics`, async () => {
    const repl = new AsyncRepl({ allowNodeApis: false, strictSandbox: true });
    repl.installContextFactory("cua", 'return {getApp: async () => ({getAXState: async () => "fixture"})};');
    const binding = `app = await cua.getApp(${selector});`;
    await repl.evaluate(binding);
    expect((await repl.evaluate('return await app.getAXState();')).value).toBe("fixture");
    const policy = new DesktopProgramPolicy(scope);
    expect(policy.accepts(binding)).toBe(true);
    expect(policy.accepts('await app.getAXState();')).toBe(true);
    policy.executionFailed();
    expect(policy.accepts(`app = await cua.getApp(${selector});`)).toBe(true);
  });

  test(`${backend}: implicit app binding does not promote data, scopes or protected globals`, () => {
    for (const code of [
      'unobserved = 3;',
      `process = await cua.getApp(${selector});`,
      `cua = await cua.getApp(${selector});`,
      `var data = 3; data = await cua.getApp(${selector});`,
      `{ hidden = await cua.getApp(${selector}); }`,
      `app = await cua.getApp(${selector}); let app;`,
      'app = await cua.getApp("Other");',
    ]) expect(new DesktopProgramPolicy(scope).accepts(code), code).toBe(false);
    const policy = new DesktopProgramPolicy(scope);
    expect(policy.accepts('app = await cua.getApp("Other");')).toBe(false);
    expect(policy.accepts('await app.getAXState();')).toBe(false);
  });
}
