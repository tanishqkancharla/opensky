import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const runFile=promisify(execFile);
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
 if(process.env.HALO_POPUP_PROBE==='1'){
  evidence.popup={accepted:false,environment:'TigerVNC/X11, bounded grants, no uinput/MPX request'};
  const observe=async name=>{const value=await app.getAXStateAndScreenshot({emit:false,disableDiffing:true});await writeFile(join(out,name+'.txt'),value.state);await writeFile(join(out,name+'.png'),value.screenshot);return value.state;};
  const indexOf=(text,name,role)=>{const lines=text.split('\n').filter(line=>line.includes(name)&&role.test(line)&&/\[\d+\]/.test(line));assert.equal(lines.length,1,'Unique observed '+name);return Number(lines[0].match(/\[(\d+)\]/)[1]);};
  const waitFor=async predicate=>{for(let i=0;i<100;i++){const value=await fresh();if(predicate(value))return value;await sleep(20);}throw Error('Owned popup application effect deadline');};
  const initial=await fresh();assert.equal(initial.inputText,'');assert.equal(initial.popup.mapped,false);assert.equal(initial.popup.activations,0);
  const before=await observe('popup-before');await app.click(indexOf(before,'Open owned popup',/button/i),{deliveryMode:'foreground'});
  evidence.popup.opened=await waitFor(s=>s.popup.visible&&s.popup.mapped);await observe('popup-open');
  const callCount=evidence.calls.length;
  await assert.rejects(client.call('press_key',{pid,window_id:windowId,key:'Escape',delivery_mode:'background'}),{code:'background_unavailable'});
  const refused=await fresh();assert.equal(refused.popup.mapped,true);assert.equal(refused.popup.activations,0);assert.equal(refused.inputText,'');
  evidence.popup.backgroundRefused={before:evidence.popup.opened,after:refused,call:evidence.calls[callCount]};
  await app.pressKey('Escape');evidence.popup.closed=await waitFor(s=>!s.popup.visible&&!s.popup.mapped);assert.equal(evidence.popup.closed.popup.activations,0);
  const closed=await observe('popup-closed');
  const raw=await runFile('/usr/bin/python3',['e2e/halo/gtk4-atspi.py'],{timeout:10000,maxBuffer:1024*1024});await writeFile(join(out,'atspi-before-entry.json'),raw.stdout);
  const geometry=await runFile('xwininfo',['-id',String(windowId)],{timeout:5000});await writeFile(join(out,'xwininfo-before-entry.txt'),geometry.stdout);
  const beforeEntry=await fresh();await app.click(indexOf(closed,'Receipt input',/entry|text/i),{deliveryMode:'foreground'});
  evidence.entryClick={before:beforeEntry,after:await fresh()};await observe('entry-after-click');
  const post=await runFile('/usr/bin/python3',['e2e/halo/gtk4-atspi.py'],{timeout:10000,maxBuffer:1024*1024});await writeFile(join(out,'atspi-after-entry.json'),post.stdout);
  const entryState=await fresh();evidence.entryClick.after=entryState;
  if(!entryState.entryFocused)throw Error('Observed entry ref click did not focus; no typing or keyboard fallback dispatched');
  const focused=await waitFor(s=>s.entryFocused&&s.active);assert.equal(focused.inputText,'');
  const payload='Popup ASCII café Ελληνικά 日本語 🙂';
  await client.call('type_text',{pid,window_id:windowId,text:payload,delivery_mode:'foreground'});
  evidence.popup.typed=await waitFor(s=>s.inputText===payload);const saved=await readFile(join(out,'typed.txt'));assert.deepEqual(saved,Buffer.from(payload,'utf8'));
  assert.equal(evidence.popup.typed.popup.activations,0);assert.equal(evidence.popup.typed.popup.mapped,false);
  evidence.popup.payload=payload;evidence.popup.savedUTF8Bytes=saved.length;evidence.popup.savedHex=saved.toString('hex');await observe('popup-final');
  const keys=evidence.calls.filter(c=>c.tool==='press_key');assert.equal(keys.length,2);assert.equal(keys[1].args.delivery_mode,'foreground');assert.equal(keys[1].args.pid,pid);assert.equal(keys[1].args.window_id,windowId);
  const typing=evidence.calls.filter(c=>c.tool==='type_text');assert.equal(typing.length,1);assert.equal(typing[0].args.delivery_mode,'foreground');assert.equal(typing[0].args.pid,pid);assert.equal(typing[0].args.window_id,windowId);
  evidence.popup.accepted=true;
 }
 evidence.final=await fresh();assert.deepEqual(evidence.final.events,['One','Dot','Two']);evidence.accepted=true;
}catch(e){evidence.error={code:e.code,message:e.message,details:e.details,stack:e.stack};try{evidence.atFailure=await fresh();}catch{};process.exitCode=1;}
finally{try{await sdk.close();evidence.sessionDetached=true;}catch(e){evidence.detachError=e.message;process.exitCode=1;}await writeFile(join(out,'gtk4-evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({accepted:evidence.accepted,error:evidence.error,pid,windowId,results:evidence.results.length}));}
