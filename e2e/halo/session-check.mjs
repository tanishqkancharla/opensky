/** Public CLI/MCP session admission controls, independent of capture/Chrome. */
import {createOpenSky,CuaDriverClient} from '../../dist/index.js';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const out=process.env.HALO_ARTIFACTS,results=[];
const state=async()=>JSON.parse(await readFile(join(out,'editor-state.json'),'utf8'));
const focus=()=>execFileSync('xdotool',['getactivewindow'],{encoding:'utf8'}).trim();
const identity=JSON.parse(await readFile(join(out,'identity.json'),'utf8'));
assert.equal(identity.source,process.env.HALO_DRIVER_REF);
const readiness=new CuaDriverClient({binaryPath:process.env.OPENSKY_DRIVER_PATH,socket:process.env.HALO_DRIVER_SOCKET,autoStart:false,autoInstall:false});
let ready=false;
for(let i=0;i<100;i++){
 if((await readiness.status()).running){ready=true;break;}
 await new Promise(resolve=>setTimeout(resolve,50));
}
assert.equal(ready,true,'supervised native daemon must be ready before session admission');
for(const transport of ['cli','mcp'])for(const mode of ['automatic','explicit']){
 const home=await mkdtemp(join(out,`session-${transport}-${mode}-`));
 const sdk=createOpenSky({homeDir:home,target:'linux',transport,autoLaunch:false,
  ...(mode==='explicit'?{session:`halo-session-${transport}-${Date.now()}`} : {}),
  driverOptions:{binaryPath:process.env.OPENSKY_DRIVER_PATH,socket:process.env.HALO_DRIVER_SOCKET,autoStart:false,autoInstall:false}});
 const before=await state(),focusBefore=focus();
 const result={transport,mode,sdk:process.env.GITHUB_SHA,driver:identity.source,inputDispatched:false};
 try{
  await sdk.list_apps();await sdk.driver.call('end_session',{});
  const apps=await sdk.list_apps();assert.ok(Array.isArray(apps));
  const after=await state();
  for(const key of ['text','selected','clipboard','pid'])assert.deepEqual(after[key],before[key]);
  assert.equal(focus(),focusBefore);
  result.automaticRecovery=true;result.editorTextSelectionClipboardPreserved=true;result.foregroundPreserved=true;
 }catch(error){result.automaticRecovery=false;result.error=String(error);result.code=error.code;throw error;}
 finally{await sdk.close();results.push(result);await writeFile(join(out,'session-admission.json'),JSON.stringify(results,null,2));}
}
console.log(JSON.stringify({sessionAdmissionVerified:results.length===4,productionChromeVerified:false}));
