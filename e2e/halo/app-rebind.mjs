/** Real native process replacement, explicit executable grant, one SDK lifetime. */
import assert from "node:assert/strict";
import {spawn,execFileSync} from "node:child_process";
import {readFile,writeFile,mkdir,realpath,stat} from "node:fs/promises";
import {join} from "node:path";
import {setTimeout as sleep} from "node:timers/promises";
import {createOpenSky,createCua} from "../../dist/index.js";
const out=process.env.HALO_ARTIFACTS,binary=join(process.cwd(),"driver/libs/cua-driver/rust/target/release/cua-driver"),socket=join(process.env.XDG_RUNTIME_DIR,"rebind.sock");
const evidence={sdk:process.env.GITHUB_SHA,driver:process.env.HALO_DRIVER_REF,node:process.version,phases:[],children:[],calls:[],modelCalls:0};
let sdk;
async function poll(check,timeout=10000){const end=Date.now()+timeout;do{try{if(await check())return;}catch(error){if(error.code!=="ENOENT")throw error;}await sleep(50);}while(Date.now()<end);throw Error("Owned application postcondition timed out");}
function child(name,command,args,env=process.env){
 const process=spawn(command,args,{env,stdio:["ignore","pipe","pipe"]});
 const receipt={name,pid:process.pid,exit:null};evidence.children.push(receipt);let stdout="",stderr="";
 process.stdout.on("data",b=>stdout+=b);process.stderr.on("data",b=>stderr+=b);
 const exited=new Promise(resolve=>process.once("exit",(code,signal)=>{receipt.exit={code,signal};resolve();}));
 return {process,receipt,exited,logs:async()=>{await writeFile(join(out,name+".stdout"),stdout);await writeFile(join(out,name+".stderr"),stderr);}};
}
const owned=[];
async function stop(item){
 if(item.receipt.exit===null)item.process.kill("SIGTERM");
 const end=Date.now()+5000;while(item.receipt.exit===null&&Date.now()<end)await sleep(25);
 if(item.receipt.exit===null){item.receipt.forced=true;item.process.kill("SIGKILL");}else item.receipt.forced=false;
 await item.exited;await item.logs();assert.equal(item.receipt.forced,false,"Exact owned child must exit without force");
}
async function editor(label){
 const directory=join(out,label);await mkdir(directory);const item=child(label,"/usr/bin/python3",["e2e/halo/editor.py"],{...process.env,HALO_ARTIFACTS:directory});owned.push(item);
 const state=async()=>JSON.parse(await readFile(join(directory,"editor-state.json"),"utf8"));
 await poll(async()=>{if(item.receipt.exit!==null)throw Error("Owned GTK editor exited");return(await state()).pid===item.receipt.pid;});
 const raw=execFileSync("xdotool",["search","--sync","--onlyvisible","--pid",String(item.receipt.pid),"--name","^Halo Contract Editor$"],{encoding:"utf8",timeout:5000});
 const windows=raw.trim().split(/\s+/);assert.equal(windows.length,1);const window=Number(windows[0]);assert.ok(Number.isInteger(window)&&window>0);
 execFileSync("wmctrl",["-ia",String(window)]);await poll(async()=>(await state()).focused===true);
 item.directory=directory;item.state=state;item.window=window;
 const proc=await readFile(`/proc/${item.receipt.pid}/stat`,"utf8");item.receipt.startTicks=proc.slice(proc.lastIndexOf(")")+2).split(" ")[19];item.receipt.executable=await realpath(`/proc/${item.receipt.pid}/exe`);item.receipt.window=window;
 return item;
}
try{
 assert.equal(process.platform,"linux");assert.equal(process.getuid()===0,false);
 const identity=JSON.parse(execFileSync(binary,["--opensky-driver-identity"],{encoding:"utf8"}));assert.equal(identity.source,process.env.HALO_DRIVER_REF);
 const python=await realpath("/usr/bin/python3");
 // This separate fixture grants only this canonical executable's native windows,
 // display/clipboard-text write, and the listed tools. It does not broaden the
 // existing PID/window-only native contract or enable launch/termination tools.
 const grant=`version: 3
expires_after: 10m
idle_timeout: 5m
resources:
  apps:
    - executable: ${JSON.stringify(python)}
      launch: false
      windows: all
      terminate: deny
  desktop:
    display: true
  clipboard:
    write: [text]
allow:
  tools: [start_session, end_session, list_apps, list_windows, get_window_state, native_paste, hotkey, bring_to_front]
`;
 const manifest=join(out,"rebind-grants.yaml");await writeFile(manifest,grant);
 const first=await editor("original");
 const daemon=child("driver",binary,["--socket",socket,"serve","--no-overlay","--permission-mode","bounded","--capability-manifest",manifest,"--approve-capability-manifest"]);owned.push(daemon);
 await poll(async()=>{if(daemon.receipt.exit!==null)throw Error("Owned driver exited");return(await stat(socket)).isSocket();});
 sdk=createOpenSky({homeDir:join(out,"sdk-home"),target:"linux",autoLaunch:false,driverOptions:{binaryPath:binary,socket,autoInstall:false,autoStart:false}});
 const invoke=sdk.driver.call.bind(sdk.driver);sdk.driver.call=async(tool,args={})=>{try{const r=await invoke(tool,args);evidence.calls.push({tool,args,structured:r.structured});return r;}catch(error){evidence.calls.push({tool,args,error:{message:error.message,code:error.code,details:error.details}});throw error;}};
 const cua=createCua(sdk),old=await cua.getApp("python3");evidence.originalHandle=old.targetHandle;evidence.phases.push("original-canonical-binding");
 await stop(first);evidence.phases.push("original-process-exited");
 const replacement=await editor("replacement");assert.notEqual(first.receipt.pid,replacement.receipt.pid);
 const inventory=await cua.listApps({emit:false});assert.ok(inventory.some(a=>a.displayName==="python3"&&a.isRunning));evidence.inventory=inventory;
 const fresh=await cua.getApp("python3");evidence.replacementHandle=fresh.targetHandle;assert.notEqual(fresh.targetHandle,old.targetHandle);
 const memory=JSON.parse(await readFile(join(out,"sdk-home/session.json"),"utf8"));
 assert.equal(memory.targets[old.targetHandle].pid,first.receipt.pid);assert.equal(memory.targets[fresh.targetHandle].pid,replacement.receipt.pid);assert.equal(memory.targets[fresh.targetHandle].windowId,replacement.window);
 evidence.phases.push("replacement-canonical-binding");
 await assert.rejects(old.getAXState());await assert.rejects(old.paste("MUST NOT APPEAR"));
 assert.equal(evidence.calls.filter(c=>c.tool==="native_paste"||c.tool==="hotkey").length,0);
 const before=await replacement.state();await poll(async()=>(replacement.state()).then(s=>s.sampleSequence>before.sampleSequence));assert.equal((await replacement.state()).text,"replace me");
 evidence.phases.push("retained-handle-refuses-before-input");
 assert.equal(Number(execFileSync("xdotool",["getactivewindow"],{encoding:"utf8"}).trim()),replacement.window);
 await sdk.driver.call("hotkey",{scope:"desktop",keys:["ctrl","a"]});await poll(async()=>(await replacement.state()).selected==="replace me");
 const payload="Restarted canonical binding: Café Ελληνικά 中文 🙂\nsecond line";
 await fresh.paste(payload);await poll(async()=>(await replacement.state()).text===payload);
 const paste=evidence.calls.filter(c=>c.tool==="native_paste");assert.equal(paste.length,1);assert.equal(paste[0].args.pid,replacement.receipt.pid);assert.equal(paste[0].args.window_id,replacement.window);
 assert.equal(Number(execFileSync("xdotool",["getactivewindow"],{encoding:"utf8"}).trim()),replacement.window);
 await sdk.driver.call("hotkey",{scope:"desktop",keys:["ctrl","s"]});await poll(async()=>(await readFile(join(replacement.directory,"saved.txt"),"utf8"))===payload);
 assert.deepEqual(await readFile(join(replacement.directory,"saved.txt")),Buffer.from(payload));evidence.savedText=payload;evidence.savedBytes=Buffer.byteLength(payload);evidence.clipboardBehavior="payload left";assert.equal((await replacement.state()).clipboard,payload);
 evidence.phases.push("replacement-exact-unicode-saved");evidence.accepted=true;
}catch(error){evidence.error={message:error.message,code:error.code};process.exitCode=1;}
finally{
 try{await sdk?.close();evidence.sessionDetached=true;}catch(error){evidence.closeError=String(error);process.exitCode=1;}
 for(const item of owned.slice().reverse())try{await stop(item);}catch(error){evidence.cleanupError=String(error);process.exitCode=1;}
 evidence.allOwnedChildrenExitedUnforced=evidence.children.every(c=>c.exit!==null&&c.forced===false);
 if(!evidence.allOwnedChildrenExitedUnforced)process.exitCode=1;
 await writeFile(join(out,"app-rebind-evidence.json"),JSON.stringify(evidence,null,2));console.log(JSON.stringify({accepted:evidence.accepted,error:evidence.error,phases:evidence.phases,cleanup:evidence.allOwnedChildrenExitedUnforced}));
}
