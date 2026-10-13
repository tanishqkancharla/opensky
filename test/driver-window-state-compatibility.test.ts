import assert from "node:assert/strict";
import {describe,it} from "node:test";
import {fileURLToPath} from "node:url";
import {CuaDriverClient} from "../src/driver.js";
import {StdioMcpDriverClient} from "../src/mcp-driver.js";

const binaryPath=fileURLToPath(new URL("./fixtures/mcp-driver-fixture.mjs",import.meta.url));
describe("native observation response compatibility",()=>{
  for(const backend of ["cli","mcp"] as const) it(`preserves full SDK observations only for an advertised compact contract through ${backend}`,async()=>{
    for(const marker of [undefined,"compact-v1"]){
      const env={...process.env,MCP_FIXTURE_MODE:"token-only",MCP_FIXTURE_WINDOW_STATE_VIEW:marker};
      const options={binaryPath,autoStart:false,env};
      const driver=backend==="cli"?new CuaDriverClient(options):new StdioMcpDriverClient({...options,target:"mac"});
      try{
        const args={pid:42,window_id:73,include_screenshot:false};
        const result=await driver.call("get_window_state",args);
        assert.deepEqual(result.structured?.args,{...args,...(marker?{full_output:true}:{})});
        assert.deepEqual(args,{pid:42,window_id:73,include_screenshot:false},"caller object stays intact");
        for(const explicit of [{full_output:false},{tree_format:"elements"},{since:"latest"}]){
          const call={...args,...explicit};
          assert.deepEqual((await driver.call("get_window_state",call)).structured?.args,call,"explicit caller output shape is preserved");
        }
        assert.deepEqual((await driver.call("echo",{value:1})).structured?.args,{value:1},"other tools are unchanged");
      }finally{if(driver instanceof StdioMcpDriverClient) assert.equal((await driver.closeTransport()).verified,true);}
    }
  });
  it("refuses an unknown advertised observation contract before daemon admission",async()=>{
    const driver=new CuaDriverClient({binaryPath,autoStart:false,env:{...process.env,MCP_FIXTURE_WINDOW_STATE_VIEW:"compact-v99"}});
    await assert.rejects(driver.ensureHelper(),(error:unknown)=>{
      assert.equal((error as {code?:string}).code,"unsupported_driver_observation_contract");return true;
    });
  });
});
