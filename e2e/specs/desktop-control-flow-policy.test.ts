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

opensky("OpenSky admits the retained named async fill helper with captured app authority", ({ policy }) => {
  expect(policy.accepts(`
    const app = await cua.getApp("Fixture");
    async function fillDown(anchor, blanks) {
      await app.click(anchor);
      for (let i = 0; i < blanks; i++) await app.pressKey("shift+Down");
      await app.pressKey("ctrl+d");
    }
    await fillDown(1115, 11);
    await fillDown(1271, 5);
    await app.getAXState({disableDiffing:true});
  `)).toBe(true);
});

native("native admits the equivalent named async helper with a captured public desktop API", ({ policy }) => {
  expect(policy.accepts(`
    async function fillDown(anchor, blanks) {
      await sky.click({x: anchor, y: 200});
      for (let i = 0; i < blanks; i++) await sky.press_key({key: "SHIFT+ARROWDOWN"});
      await sky.press_key({key: "CTRL+d"});
    }
    await fillDown(1115, 11);
  `)).toBe(true);
});

opensky("named async helper parameters derive app authority at the call site and persist across cells", ({ policy }) => {
  expect(policy.accepts(`
    const app = await cua.getApp("Fixture");
    async function pressMany(target, count) {
      for (let i = 0; i < count; i++) await target.pressKey("ENTER");
    }
  `)).toBe(true);
  expect(policy.accepts('await pressMany(app, 2);')).toBe(true);
});

opensky("named async helpers reject fabricated parameter authority and rebinding", ({ policy }) => {
  expect(policy.accepts(`
    const app = await cua.getApp("Fixture");
    const fabricated = {pressKey: "not callable"};
    async function press(target) { await target.pressKey("ENTER"); }
  `)).toBe(true);
  expect(policy.accepts('await press(fabricated);')).toBe(false);
  expect(policy.accepts('await press(app);')).toBe(true);
  expect(policy.accepts('press = 0;')).toBe(true);
  expect(policy.accepts('await press(app);')).toBe(false);
});

opensky("helper-local parameter shadows cannot retain captured app authority", ({ policy }) => {
  expect(policy.accepts(`
    const app = await cua.getApp("Fixture");
    async function shadow(app) { await app.pressKey("ENTER"); }
    const fabricated = {};
    await shadow(fabricated);
  `)).toBe(false);
});

native("a hoisted helper declaration replaces an earlier safe body before the call", ({ policy }) => {
  expect(policy.accepts('async function act(){ await sky.press_key({key:"Return"}); }')).toBe(true);
  expect(policy.accepts('await act(); async function act(){ await import("node:child_process"); }')).toBe(false);
});

nativeApp("a helper resolves its declaration capture instead of a caller-local shadow", ({ policy }) => {
  expect(policy.accepts(`
    const fs = await import("node:fs/promises");
    const path = "/not-an-observed-screenshot";
    async function show() { await nodeRepl.emitImage(await fs.readFile(path)); }
  `)).toBe(true);
  expect(policy.accepts(`
    {
      const state = await sky.get_app_state({app:"Fixture"});
      const path = state.screenshot.url;
      await show();
    }
  `)).toBe(false);
});

nativeApp("a helper keeps a declaration-scoped screenshot capture when no caller shadow exists", ({ policy }) => {
  expect(policy.accepts(`
    const fs = await import("node:fs/promises");
    const state = await sky.get_app_state({app:"Fixture"});
    const path = state.screenshot.url;
    async function show() { await nodeRepl.emitImage(await fs.readFile(path)); }
  `)).toBe(true);
  expect(policy.accepts('await show();')).toBe(true);
});

opensky("a failed cell invalidates stored helper bodies", ({ policy }) => {
  expect(policy.accepts('const app = await cua.getApp("Fixture"); async function press() { await app.pressKey("ENTER"); }')).toBe(true);
  policy.executionFailed();
  expect(policy.accepts('await press();')).toBe(false);
});

nativeApp("a forward global capture cannot borrow a caller-local screenshot path", ({ policy }) => {
  expect(policy.accepts('const fs = await import("node:fs/promises"); async function show() { await nodeRepl.emitImage(await fs.readFile(path)); }')).toBe(true);
  expect(policy.accepts('const path = "/not-an-observed-screenshot";')).toBe(true);
  expect(policy.accepts('{ const state = await sky.get_app_state({app:"Fixture"}); const path = state.screenshot.url; await show(); }')).toBe(false);
});

opensky("a helper retains an authorized outer capture through a caller-local shadow", ({ policy }) => {
  expect(policy.accepts('const target = await cua.getApp("Fixture"); async function press() { await target.pressKey("ENTER"); }')).toBe(true);
  expect(policy.accepts('{ const target = "ordinary local text"; await press(); }')).toBe(true);
});

opensky("a helper observes reassignment of its captured global binding", ({ policy }) => {
  expect(policy.accepts('let target = await cua.getApp("Fixture"); async function press() { await target.pressKey("ENTER"); }')).toBe(true);
  expect(policy.accepts('target = await cua.getApp("Fixture"); await press();')).toBe(true);
});

nativeApp("returning from a helper restores the caller's local path authority", ({ policy }) => {
  expect(policy.accepts('const fs = await import("node:fs/promises"); const state = await sky.get_app_state({app:"Fixture"}); const path = state.screenshot.url; async function noop() { await sky.press_key({app:"Fixture", key:"Return"}); }')).toBe(true);
  expect(policy.accepts('{ const path = "/not-an-observed-screenshot"; await noop(); await nodeRepl.emitImage(await fs.readFile(path)); }')).toBe(false);
});

nativeApp("a helper updates its captured path without overwriting a caller shadow", ({ policy }) => {
  expect(policy.accepts('const fs = await import("node:fs/promises"); const state = await sky.get_app_state({app:"Fixture"}); let path = state.screenshot.url; async function clearPath() { path = "/not-an-observed-screenshot"; }')).toBe(true);
  expect(policy.accepts('{ const path = state.screenshot.url; await clearPath(); await nodeRepl.emitImage(await fs.readFile(path)); }')).toBe(true);
  expect(policy.accepts('await nodeRepl.emitImage(await fs.readFile(path));')).toBe(false);
});

nativeApp("a rejected cell cannot promote a helper's captured path", ({ policy }) => {
  expect(policy.accepts('const fs = await import("node:fs/promises"); const state = await sky.get_app_state({app:"Fixture"}); let path = "/not-an-observed-screenshot"; async function show() { await nodeRepl.emitImage(await fs.readFile(path)); }')).toBe(true);
  expect(policy.accepts('path = state.screenshot.url; await import("node:child_process");')).toBe(false);
  expect(policy.accepts('await show();')).toBe(false);
});

opensky("a helper's skipped var header shadows an outer app in its own function scope", ({ policy }) => {
  expect(policy.accepts('const target = await cua.getApp("Fixture"); async function press() { if (false) { for (var target of []) {} } await target.pressKey("ENTER"); }')).toBe(true);
  expect(policy.accepts('await press();')).toBe(false);
  expect(policy.accepts('await target.pressKey("ENTER");')).toBe(true);
});

opensky("a failed cell clears numeric loop evidence", ({ policy }) => {
  expect(policy.accepts('const app = await cua.getApp("Fixture"); let i = 0;')).toBe(true);
  policy.executionFailed();
  expect(policy.accepts('while (i < 2) { await app.click([100 + i, 200]); i++; }')).toBe(false);
});

native("native for-of var headers keep ordinary values across cells and empty iterables", ({ policy }) => {
  expect(policy.accepts(`
    var rows = [["Benedict", "Cucumberbatch", "Manager"], ["Parin", "", "Accountant"]];
    for (var row of rows) {
      await sky.type_text({text: row[0]});
      await sky.press_key({key: "Tab"});
      if (row[1]) await sky.type_text({text: row[1]});
      await sky.press_key({key: "Tab"});
      await sky.type_text({text: row[2]});
    }
  `)).toBe(true);
  expect(policy.accepts('for (var row of []) { await sky.type_text({text:"Unexpected"}); } await sky.type_text({text:row[0]});')).toBe(true);
});

native("var for-of headers persist through branches and enclosing lexical loops", ({ policy }) => {
  expect(policy.accepts('if (true) { for (var row of [["A"]]) {} }')).toBe(true);
  expect(policy.accepts('nodeRepl.write(row[0]);')).toBe(true);
  expect(policy.accepts('if (false) { for (var emptyRow of [["B"]]) {} }')).toBe(true);
  expect(policy.accepts('nodeRepl.write(emptyRow);')).toBe(true);
  expect(policy.accepts('for (let i = 0; i < 1; i++) { for (var nestedRow of [["C"]]) {} }')).toBe(true);
  expect(policy.accepts('nodeRepl.write(nestedRow[0]);')).toBe(true);
});

opensky("OpenSky for-of headers admit ordinary fixed array destructuring", ({ policy }) => {
  expect(policy.accepts(`
    const app = await cua.getApp("Fixture");
    const rowsA = [[1079, "Bey", "Twice", "Director"]];
    for (const [cell, first, last, rank] of rowsA) {
      await app.click(cell);
      await app.typeText(first);
      await app.pressKey("Tab");
      await app.typeText(last);
      await app.pressKey("Tab");
      await app.typeText(rank);
      await app.pressKey("Return");
    }
    await app.getAXState({disableDiffing:true});
  `)).toBe(true);
});

nativeApp("var loop headers clear overwritten screenshot and import authority", ({ policy }) => {
  expect(policy.accepts('var fs = await import("node:fs/promises"); const shot = await sky.get_app_state({app:"Fixture"}); var imagePath = shot.screenshot.url;')).toBe(true);
  expect(policy.accepts('for (var imagePath of ["file:///etc/passwd"]) {}')).toBe(true);
  expect(policy.accepts('await fs.readFile(imagePath);')).toBe(false);
  expect(policy.accepts('for (var fs of ["not an import"]) {}')).toBe(true);
  expect(policy.accepts('await fs.readFile(shot.screenshot.url);')).toBe(false);
});

nativeApp("a skipped branch still exports an untrusted var loop binding", ({ policy }) => {
  expect(policy.accepts('const fs = await import("node:fs/promises"); if (false) { for (var path of ["/etc/passwd"]) {} }')).toBe(true);
  expect(policy.accepts('await fs.readFile(path);')).toBe(false);
});

opensky("lexical loop headers restore an outer app and var headers clear app and numeric authority", ({ policy }) => {
  expect(policy.accepts('const app = await cua.getApp("Fixture"); let i = 0; const rows = [["local"]]; for (const [app] of rows) {} await app.pressKey("ENTER");')).toBe(true);
  expect(policy.accepts('var app = await cua.getApp("Fixture"); var i = 0; for (var app of []) {}')).toBe(true);
  expect(policy.accepts('await app.pressKey("ENTER");')).toBe(false);
  expect(policy.accepts('for (var i of []) {}')).toBe(true);
  expect(policy.accepts('while (i < 2) { i++; }')).toBe(false);
});

opensky("for-of headers reject unsupported destructuring forms", ({ policy }) => {
  expect(policy.accepts('const rows = [["x"]]; for (const {row} of rows) {}')).toBe(false);
  expect(policy.accepts('const rows = [["x"]]; for (const [row = "fallback"] of rows) {}')).toBe(false);
  expect(policy.accepts('const rows = [["x"]]; for (const [...row] of rows) {}')).toBe(false);
  expect(policy.accepts('const rows = [["x"]]; for (const [[row]] of rows) {}')).toBe(false);
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
