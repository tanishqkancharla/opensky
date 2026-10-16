import assert from "node:assert/strict";
import {writeFile,readFile} from "node:fs/promises";
import {join} from "node:path";
import {CuaDriverClient} from "../../src/driver.js";
import {createCuaReplToolRuntime} from "../../evals/cua-repl-tool.js";
import {withEvalArtifactPaths,recordAgentEvent} from "../../evals/artifacts.js";
const out=process.env.HALO_ARTIFACTS;
const driver=new CuaDriverClient({binaryPath:process.env.OPENSKY_DRIVER_PATH,socket:process.env.HALO_DRIVER_SOCKET,session:"halo-strict",autoStart:false,timeoutMs:null});
const runtime=createCuaReplToolRuntime(driver,"linux",{homeDir:join(out,"strict-sdk-home"),autoLaunch:false});
const evidence={sdk:process.env.GITHUB_SHA,node:process.version,phases:[],driver:process.env.HALO_DRIVER_REF};
const paths={transcript:join(out,"strict-agent.jsonl"),transcriptMarkdown:join(out,"strict-agent.md"),judgeEvents:join(out,"strict-judge.jsonl"),judgeTranscript:join(out,"strict-judge.md")};
const text=result=>result.content.filter(x=>x.type==="text").map(x=>x.text).join("\n");
try{
 await driver.call("start_session",{session:"halo-strict"});
 const inventory=(await driver.call("list_apps")).structured;
 const app=(Array.isArray(inventory)?inventory:inventory.apps).find(x=>x.pid===Number(process.env.HALO_EDITOR_PID));assert.ok(app);
 await withEvalArtifactPaths(paths,async()=>{
  const first=await runtime.tools[0].execute("strict-initial",{code:`var app = await cua.getApp(${JSON.stringify(app.name)});`});await writeFile(join(out,"strict-initial-result.json"),JSON.stringify(first,null,2));assert.equal(first.isError,undefined);assert.match(text(first),/replace me/);recordAgentEvent({phase:"initial",observed:true});evidence.phases.push("initial-real-AX");
  const next=await runtime.tools[0].execute("strict-next",{code:"await 0; await app.getAXState({disableDiffing:true});"});await writeFile(join(out,"strict-next-result.json"),JSON.stringify(next,null,2));assert.equal(next.isError,undefined);assert.match(text(next),/replace me/);recordAgentEvent({phase:"next",observed:true});evidence.phases.push("retained-bound-app-after-realm-await");
 });
 const lines=(await readFile(paths.transcript,"utf8")).trim().split("\n").map(JSON.parse);assert.deepEqual(lines.map(x=>x.event.phase),["initial","next"]);evidence.artifactScopePreserved=true;
}catch(error){evidence.error=String(error);evidence.errorStack=error.stack;process.exitCode=1;}
finally{
 try{await runtime.close();await driver.call("end_session",{session:"halo-strict"});evidence.ownSessionsDetached=true;}catch(error){evidence.cleanupError=String(error);process.exitCode=1;}
 await writeFile(join(out,"strict-bridge-evidence.json"),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}
