import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {createOpenSky} from "../src/opensky.js";
import {createCua} from "../src/cua.js";
import {OpenSkyError} from "../src/errors.js";
import {makeHarness} from "./harness.ts";

test("Linux facade preserves explicit click delivery and exact observation tokens", async()=>{
 const {driver,dir,statePath}=await makeHarness();
 const sdk=createOpenSky({driver,target:"linux",homeDir:join(dir,"linux-foreground"),settleDelayMs:0});
 try{
  const app=await createCua(sdk,{emit:()=>{}}).getApp("Calculator");
  for(const deliveryMode of [undefined,"background","foreground"] as const){
   await app.getAXState({emit:false,disableDiffing:true});
   await app.click(13,deliveryMode===undefined?{}:{deliveryMode});
  }
  const calls=JSON.parse(await readFile(statePath,"utf8")).calls;
  const inputs=calls.filter((c:any)=>c.tool==="click");assert.equal(inputs.length,3);
  assert.deepEqual(inputs.map((c:any)=>c.args.delivery_mode),[undefined,"background","foreground"]);
  const observed=calls.find((c:any)=>c.tool==="get_window_state");
  for(const c of inputs){assert.equal(c.args.pid,observed.args.pid);assert.equal(c.args.window_id,observed.args.window_id);assert.match(c.args.element_token,/^s[0-9]+:13$/);assert.equal(c.args.action,undefined);}
  await app.getAXState({emit:false,disableDiffing:true});
  await assert.rejects(app.click(99999,{deliveryMode:"foreground"}),/not present in the latest accessibility snapshot/);
  assert.equal(JSON.parse(await readFile(statePath,"utf8")).calls.filter((c:any)=>c.tool==="click").length,3);
 }finally{await sdk.close();}
});

test("Linux explicit foreground refusal is final and is never replayed", async()=>{
 const {driver,dir}=await makeHarness();const call=driver.call.bind(driver);let dispatched=0;
 driver.call=async(tool,args={})=>{if(tool==="click"){dispatched++;assert.equal(args.delivery_mode,"foreground");throw new OpenSkyError("outside bounded grant","bounded_resource_outside_manifest",{delivery:"not_dispatched"});}return call(tool,args);};
 const sdk=createOpenSky({driver,target:"linux",homeDir:join(dir,"linux-refusal"),settleDelayMs:0});
 try{const app=await createCua(sdk,{emit:()=>{}}).getApp("Calculator");await app.getAXState({emit:false});await assert.rejects(app.click(13,{deliveryMode:"foreground"}),{code:"bounded_resource_outside_manifest"});assert.equal(dispatched,1);}finally{await sdk.close();}
});
