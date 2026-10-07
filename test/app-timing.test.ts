import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { recordDriverCalls } from "../e2e/fixtures/app-timing.js";
import type { DriverClient, DriverResult } from "../src/types.js";

test("passive driver trace preserves exact calls/results and excludes image/AX payloads", async () => {
  const artifacts = await mkdtemp(join(tmpdir(), "opensky-call-trace-"));
  try {
    const calls: unknown[] = [];
    const result: DriverResult = { text: "Clicked font field", raw: { secret: "RAW PAYLOAD" },
      structured: { pid: 7, window_id: 12, frame: { x: 13, y: 14, width: 665, height: 551 },
        path: "x11_atspi", hit: { role: "text", name: "Family:", action: "focus" },
        windows: [{ pid: 7, window_id: 12, title: "Character", bounds: { x: 13, y: 14 }, z_index: 9, ignored: "NO" }],
        screenshot: { data: "IMAGE PAYLOAD" }, elements: [{ name: "AX PAYLOAD" }] } };
    const ownership = { kind: "cli-explicit" } as const;
    const driver: DriverClient = { sessionOwnership: ownership,
      async call(tool,args) { calls.push({tool,args}); return result; },
      async status() { return { running: true, text: "same" }; }, async ensureDaemon() {} };
    recordDriverCalls(driver, artifacts);
    const args = { pid: 7, window_id: 12, x: 350, y: 75, button: "left", count: 1 };
    assert.equal(await driver.call("click", args), result);
    assert.deepEqual(calls,[{tool:"click",args}]);assert.equal(driver.sessionOwnership,ownership);
    const text = await readFile(join(artifacts,"driver-calls.jsonl"),"utf8");
    const trace=JSON.parse(text);assert.deepEqual(trace.args,args);
    assert.equal(trace.structured.window_id,12);assert.equal(trace.structured.hit.name,"Family:");
    assert.equal(trace.windows[0].title,"Character");assert.equal(trace.windows[0].ignored,undefined);
    assert.equal(trace.request,1);assert.equal(trace.passed,true);
    for (const payload of ["RAW PAYLOAD","IMAGE PAYLOAD","AX PAYLOAD"]) assert.ok(!text.includes(payload));
    assert.deepEqual(await driver.status(),{running:true,text:"same"});
  } finally { await rm(artifacts,{recursive:true,force:true}); }
});

test("passive driver trace retains and rethrows the same refusal without input replay", async () => {
  const artifacts = await mkdtemp(join(tmpdir(), "opensky-call-trace-"));
  try {
    const refusal=Object.assign(new Error("Exact window gone"),{code:"window_not_found",details:{code:"window_not_found",window_id:12}});let calls=0;
    const driver: DriverClient={async call(){calls++;throw refusal;},async status(){return {running:true,text:""};},async ensureDaemon(){}};
    recordDriverCalls(driver,artifacts);
    await assert.rejects(driver.call("click",{pid:7,window_id:12,x:350,y:75}),error=>error===refusal);
    assert.equal(calls,1);
    const trace=JSON.parse(await readFile(join(artifacts,"driver-calls.jsonl"),"utf8"));
    assert.equal(trace.passed,false);assert.equal(trace.args.window_id,12);assert.match(trace.error,/Exact window gone/);assert.equal(trace.code,"window_not_found");assert.equal(trace.refusal.window_id,12);
  } finally {await rm(artifacts,{recursive:true,force:true});}
});
