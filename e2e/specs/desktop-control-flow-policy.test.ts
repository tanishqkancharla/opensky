import { expect, test } from "vitest";
import { DesktopProgramPolicy } from "../../evals/parity/desktop-program.js";

const native = test.extend<{ policy: DesktopProgramPolicy }>({
  policy: async ({}, use) => use(new DesktopProgramPolicy({ backend: "native", appSelectors: [], isolatedDesktop: "linux" })),
});
const nativeApp = test.extend<{ policy: DesktopProgramPolicy }>({
  policy: async ({}, use) => use(new DesktopProgramPolicy({ backend: "native", appSelectors: ["Fixture"] })),
});
const opensky = test.extend<{ policy: DesktopProgramPolicy }>({
  policy: async ({}, use) => use(new DesktopProgramPolicy({ backend: "opensky", appSelectors: ["Fixture"], isolatedDesktop: "linux" })),
});

native("native desktop programs admit ordinary indexed for loops and conditional UI calls", ({ policy }) => {
  expect(policy.accepts(`
    const rows = [["Benedict", "Cucumberbach", "Manager"], ["Parin", "", "Accountant"]];
    for (let i = 0; i < rows.length; i++) {
      const y = 208 + i * 17;
      await sky.click({x: 310, y});
      await sky.type_text({text: rows[i][0]});
      await sky.press_key({key: "Tab"});
      if (rows[i][1]) await sky.type_text({text: rows[i][1]});
      await sky.press_key({key: "Tab"});
      await sky.type_text({text: rows[i][2] + " #" + (i + 1)});
    }
    await sky.press_key({key: "CTRL+s"});
  `)).toBe(true);
});

opensky("OpenSky programs admit for-of and while blocks over ordinary local data", ({ policy }) => {
  expect(policy.accepts(`
    const app = await cua.getApp("Fixture");
    const rows = ["one", "two"];
    for (const row of rows) {
      await app.typeText(row + "!");
      await app.pressKey("TAB");
    }
    let i = 0;
    while (i < rows.length) {
      if (i === 1) await app.click([100 + i, 200]);
      i++;
    }
  `)).toBe(true);
});

opensky("numeric loop bindings persist across real REPL cells", ({ policy }) => {
  expect(policy.accepts('const app = await cua.getApp("Fixture"); let i = 0;')).toBe(true);
  expect(policy.accepts('while (i < 2) { await app.click([100 + i, 200]); i++; }')).toBe(true);
});

opensky("a failed cell clears numeric loop evidence", ({ policy }) => {
  expect(policy.accepts('const app = await cua.getApp("Fixture"); let i = 0;')).toBe(true);
  policy.executionFailed();
  expect(policy.accepts('while (i < 2) { await app.click([100 + i, 200]); i++; }')).toBe(false);
});

nativeApp("branch and loop joins do not export screenshot authority", ({ policy }) => {
  expect(policy.accepts('const fs = await import("node:fs/promises"); let shot; if (true) { shot = await sky.get_app_state({app:"Fixture"}); }')).toBe(true);
  expect(policy.accepts('await fs.readFile(shot.screenshot.url);')).toBe(false);
  expect(policy.accepts('let loopShot; while (false) { loopShot = await sky.get_app_state({app:"Fixture"}); }')).toBe(true);
  expect(policy.accepts('await fs.readFile(loopShot.screenshot.url);')).toBe(false);
});

nativeApp("branch-local observations remain usable only inside their branch", ({ policy }) => {
  expect(policy.accepts(`
    const fs = await import("node:fs/promises");
    if (true) {
      const shot = await sky.get_app_state({app:"Fixture"});
      await nodeRepl.emitImage({bytes: await fs.readFile(shot.screenshot.url), mimeType: "image/jpeg"});
    }
  `)).toBe(true);
  expect(policy.accepts('await fs.readFile(shot.screenshot.url);')).toBe(false);
});

nativeApp("a shadowed screenshot binding cannot authorize its outer fabricated value", ({ policy }) => {
  expect(policy.accepts('const fs = await import("node:fs/promises"); let shot = {screenshot:{url:"file:///etc/passwd"}}; { const shot = await sky.get_app_state({app:"Fixture"}); await fs.readFile(shot.screenshot.url); }')).toBe(true);
  expect(policy.accepts('await fs.readFile(shot.screenshot.url);')).toBe(false);
});

opensky("conditional bindings cannot leak or shadow authorized app scope", ({ policy }) => {
  expect(policy.accepts('const app = await cua.getApp("Fixture");')).toBe(true);
  expect(policy.accepts('if (true) { const app = await cua.getApp("Fixture"); await app.click([1, 2]); } await app.pressKey("ENTER");')).toBe(true);
  expect(policy.accepts('if (true) { const hidden = await cua.getApp("Fixture"); } await hidden.pressKey("ENTER");')).toBe(false);
  expect(policy.accepts('if (true) await cua.getApp("Other");')).toBe(false);
});

nativeApp("a conditional overwrite clears saved screenshot paths after the join", ({ policy }) => {
  expect(policy.accepts('const fs = await import("node:fs/promises"); let shot = await sky.get_app_state({app:"Fixture"}); let imagePath = shot.screenshot.url;')).toBe(true);
  expect(policy.accepts('if (true) imagePath = "/etc/passwd";')).toBe(true);
  expect(policy.accepts('await fs.readFile(imagePath);')).toBe(false);
});

nativeApp("a for-loop back edge cannot reuse a screenshot path overwritten in its body", ({ policy }) => {
  expect(policy.accepts(`
    const fs = await import("node:fs/promises");
    const shot = await sky.get_app_state({app:"Fixture"});
    let path = shot.screenshot.url;
    for (let i = 0; i < 2; i++) {
      await fs.readFile(path);
      path = "/etc/passwd";
    }
  `)).toBe(false);
});

nativeApp("a while-loop retests filesystem authority after its body changes the path", ({ policy }) => {
  expect(policy.accepts(`
    const fs = await import("node:fs/promises");
    const shot = await sky.get_app_state({app:"Fixture"});
    let path = shot.screenshot.url;
    while (await fs.readFile(path)) path = "/etc/passwd";
  `)).toBe(false);
});

nativeApp("a for-of back edge cannot reuse a screenshot path overwritten in its body", ({ policy }) => {
  expect(policy.accepts(`
    const fs = await import("node:fs/promises");
    const shot = await sky.get_app_state({app:"Fixture"});
    let path = shot.screenshot.url;
    for (const row of ["first", "second"]) {
      await fs.readFile(path);
      path = "/etc/passwd";
    }
  `)).toBe(false);
});

nativeApp("loop analysis converges through cascading screenshot-path aliases", ({ policy }) => {
  expect(policy.accepts(`
    const fs = await import("node:fs/promises");
    const shot = await sky.get_app_state({app:"Fixture"});
    let a = shot.screenshot.url;
    let b = shot.screenshot.url;
    let c = shot.screenshot.url;
    for (let i = 0; i < 4; i++) {
      await fs.readFile(a);
      a = b;
      b = c;
      c = "/etc/passwd";
    }
  `)).toBe(false);
});
