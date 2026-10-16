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

it("registered X11 paste requires exact target-value and leave-clipboard evidence without replay", async () => {
  const completed = { status:"completed", target_value_verified:true, transfer_verified:false,
    clipboard_policy:"leave", clipboard_status:"payload_left", clipboard_restored:false };
  const cases = [
    { outcome:completed, accepted:true },
    { outcome:{...completed,clipboard_status:"newer_writer_observed"}, accepted:true },
    ...[{status:"unknown"},{target_value_verified:false},{transfer_verified:true},
      {clipboard_policy:"restore"},{clipboard_restored:true},{clipboard_status:"unknown"}]
      .map(delta=>({outcome:{...completed,...delta},accepted:false})),
  ];
  for (const {outcome,accepted} of cases) {
    const {driver,dir}=await makeHarness(); driver.listTools=async()=>["native_paste"];
    const sdk=createOpenSky({driver,target:"linux",homeDir:dir+"/supported-x11",settleDelayMs:0});
    try {
      const capability=(await sdk.get_capabilities()).nativePaste;
      assert.equal(capability.availability,"supported");assert.equal(capability.clipboard,"payload-left");
      assert.deepEqual(capability.formats,["text"]);
      const {createCua}=await import("../src/cua.js");
      const app=await createCua(sdk,{emit:()=>undefined}).getApp("TextEdit");
      const original=sdk.driver.call.bind(sdk.driver);const calls:Array<{tool:string,args:Record<string,unknown>}>=[];
      sdk.driver.call=async(tool,args={})=>{calls.push({tool,args});if(tool==="native_paste")return {structured:outcome,text:"receipt",content:[]};return original(tool,args);};
      const action=app.paste("Café Ελληνικά 中文 🙂");
      if(accepted)await action;else await assert.rejects(action,{code:"native_paste_unverified"});
      const inputs=calls.filter(c=>c.tool==="native_paste");assert.equal(inputs.length,1);
      assert.equal(inputs[0].args.pid,900);assert.equal(inputs[0].args.window_id,2001);
      assert.equal(inputs[0].args.delivery_mode,"foreground");assert.equal(inputs[0].args.clipboard_policy,"leave");
      assert.ok(!calls.some(c=>["type_text","hotkey","press_key","clipboard_write"].includes(c.tool)));
    }finally{await sdk.close();}
  }
});
