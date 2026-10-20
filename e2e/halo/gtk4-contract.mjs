import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {CuaDriverClient,createOpenSky,createCua} from '../../dist/index.js';
const out=process.env.HALO_ARTIFACTS,pid=Number(process.env.HALO_GTK4_PID),windowId=Number(process.env.HALO_GTK4_WINDOW);
const evidence={sdk:process.env.GITHUB_SHA,driver:process.env.HALO_DRIVER_REF,pid,windowId,accepted:false,calls:[],results:[],explicitForegroundAuthorized:true};
const state=async()=>JSON.parse(await readFile(join(out,'state.json'),'utf8'));
const fresh=async()=>{const prior=(await state()).sampleSequence;for(let i=0;i<100;i++){const value=await state();if(value.sampleSequence>prior)return value;await sleep(50);}throw Error('Fresh app sample unavailable');};
const client=new CuaDriverClient({binaryPath:process.env.OPENSKY_DRIVER_PATH,socket:process.env.HALO_DRIVER_SOCKET,autoInstall:false,autoStart:false,timeoutMs:null,session:'gtk4-owner'});
const call=client.call.bind(client);client.call=async(tool,args={})=>{const start=performance.now();try{const result=await call(tool,args);evidence.calls.push({tool,args,elapsedMs:performance.now()-start,result:result.structured});return result;}catch(e){evidence.calls.push({tool,args,elapsedMs:performance.now()-start,error:{code:e.code,message:e.message,details:e.details}});throw e;}};
const sdk=createOpenSky({driver:client,target:'linux',homeDir:join(out,'sdk-home'),screenshotDir:join(out,'shots'),autoLaunch:false,settleDelayMs:0});const cua=createCua(sdk,{emit:()=>{}});
try{
 await mkdir(join(out,'shots'),{recursive:true});
 assert.equal(JSON.parse(await readFile(join(out,'identity.json'),'utf8')).source,process.env.HALO_DRIVER_REF);
 const inventory=(await client.call('list_apps')).structured;const apps=Array.isArray(inventory)?inventory:inventory.apps;const native=apps.find(a=>a.pid===pid);assert.ok(native,'Exact owned GTK4 app discovered');
 const app=await cua.getApp(native.name);const counts={One:0,Dot:0,Two:0};
 for(const name of ['One','Dot','Two']){
  const observation=await app.getAXStateAndScreenshot({emit:false,disableDiffing:true});
  await writeFile(join(out,`before-${name}.txt`),observation.state);
  assert.ok(observation.screenshot,'Real GTK4 pixels required');await writeFile(join(out,`before-${name}.png`),observation.screenshot);
  const lines=observation.state.split('\n').filter(line=>line.includes(name)&&/button/i.test(line)&&/\[\d+\]/.test(line));
  assert.equal(lines.length,1,'Unique observed GTK4 button '+name);const index=Number(lines[0].match(/\[(\d+)\]/)[1]);
  const before=await fresh();assert.deepEqual(before.counts,counts);
  await app.click(index,{deliveryMode:'foreground'});counts[name]++;
  let after;for(let i=0;i<100;i++){after=await fresh();if(after.counts[name]===counts[name])break;await sleep(20);}
  assert.deepEqual(after.counts,counts,'Only exact requested button changed');evidence.results.push({name,index,before,after});
 }
 const final=await app.getAXStateAndScreenshot({emit:false,disableDiffing:true});await writeFile(join(out,'after.txt'),final.state);await writeFile(join(out,'after.png'),final.screenshot);
 assert.match(final.state,/One:1/);assert.match(final.state,/Dot:1/);assert.match(final.state,/Two:1/);
 const clicks=evidence.calls.filter(c=>c.tool==='click');assert.equal(clicks.length,3);assert.ok(clicks.every(c=>c.args.pid===pid&&c.args.window_id===windowId&&c.args.delivery_mode==='foreground'));
 evidence.final=await fresh();assert.deepEqual(evidence.final.events,['One','Dot','Two']);evidence.accepted=true;
}catch(e){evidence.error={code:e.code,message:e.message,details:e.details,stack:e.stack};try{evidence.atFailure=await fresh();}catch{};process.exitCode=1;}
finally{try{await sdk.close();evidence.sessionDetached=true;}catch(e){evidence.detachError=e.message;process.exitCode=1;}await writeFile(join(out,'gtk4-evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({accepted:evidence.accepted,error:evidence.error,pid,windowId,results:evidence.results.length}));}
