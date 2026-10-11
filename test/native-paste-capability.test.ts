import assert from "node:assert/strict";
import { it } from "node:test";
import { createOpenSky } from "../src/opensky.js";
import { makeHarness } from "./harness.ts";
it("registry absence is actionable without native paste, typing or clipboard fallback", async () => {
  const { driver, dir, statePath } = await makeHarness();
  driver.listTools = async () => ["list_apps", "type_text", "get_window_state"];
  const { readFile } = await import("node:fs/promises");
  const sdk = createOpenSky({ driver, target: "linux", homeDir: dir + "/linux-paste", settleDelayMs: 0 });
  try {
    const state = await sdk.get_app_state({ app: "Calculator", includeScreenshot: false });
    const capability = await sdk.get_capabilities();
    assert.equal(capability.nativePaste.availability, "unavailable");
    assert.deepEqual(capability.nativePaste.formats, []);
    assert.equal(capability.nativePaste.clipboard, "untouched");
    assert.match(capability.nativePaste.reason!, /absent.*permissions cannot add/);
    const before = JSON.parse(await readFile(statePath, "utf8")).calls;
    for (const text of ["ASCII paste", "Café Ελληνικά 中文 🙂"]) {
      await assert.rejects(sdk.paste({ app: state.targetHandle, text }), { code: "unsupported_native_paste" });
    }
    assert.deepEqual(JSON.parse(await readFile(statePath, "utf8")).calls, before);
  } finally { await sdk.close(); }
});
it("a transport without introspection reports unknown instead of promising Linux paste", async () => {
  const { driver, dir } = await makeHarness();
  const sdk = createOpenSky({ driver: { call: driver.call.bind(driver), ensureDaemon: driver.ensureDaemon.bind(driver), status: driver.status.bind(driver) }, target: "linux", homeDir: dir + "/linux-unknown" });
  try { assert.equal((await sdk.get_capabilities()).nativePaste.availability, "unknown"); }
  finally { await sdk.close(); }
});
