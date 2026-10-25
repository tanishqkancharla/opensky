import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {CuaDriverClient,createOpenSky,createCua} from '../../dist/index.js';

// A fresh fixture owns this negative contract. Never try coordinates or typing
// after the ref request: refusal is not permission to replay an action.
const out=process.env.HALO_ARTIFACTS;
const pid=Number(process.env.HALO_GTK4_PID),windowId=Number(process.env.HALO_GTK4_WINDOW);
const evidence={sdk:process.env.GITHUB_SHA,driver:process.env.HALO_DRIVER_REF,pid,windowId,accepted:false,calls:[],samples:[]};
const state=async()=>JSON.parse(await readFile(join(out,'state.json'),'utf8'));
const fresh=async()=>{
 const prior=(await state()).sampleSequence;
 for(let i=0;i<100;i++){const value=await state();if(value.sampleSequence>prior)return value;await sleep(50);}
 throw Error('Fresh independent application sample unavailable');
};
const client=new CuaDriverClient({binaryPath:process.env.OPENSKY_DRIVER_PATH,socket:process.env.HALO_DRIVER_SOCKET,autoInstall:false,autoStart:false,timeoutMs:null,session:'gtk4-refusal-owner'});
const call=client.call.bind(client);
client.call=async(tool,args={})=>{
 const started=performance.now();
 try{
  const result=await call(tool,args);
  evidence.calls.push({tool,args,elapsedMs:performance.now()-started,...(tool==='click'?{result:result.structured}:{})});
  return result;
 }catch(error){
  evidence.calls.push({tool,args,elapsedMs:performance.now()-started,error:{code:error.code,message:error.message,details:error.details}});
  throw error;
 }
};
const sdk=createOpenSky({driver:client,target:'linux',homeDir:join(out,'sdk-home'),screenshotDir:join(out,'shots'),autoLaunch:false,settleDelayMs:0});
const cua=createCua(sdk,{emit:()=>{}});
const unchanged=value=>{
 assert.equal(value.pid,pid);assert.equal(value.active,true);
 assert.equal(value.entryFocused,false);assert.equal(value.inputText,'');assert.equal(value.entryActivations,0);
 assert.deepEqual(value.counts,{One:0,Dot:0,Two:0});assert.deepEqual(value.events,[]);
 assert.deepEqual(value.popup,{visible:false,mapped:false,activations:0});
};
try{
 await mkdir(join(out,'shots'),{recursive:true});
 assert.equal(JSON.parse(await readFile(join(out,'identity.json'),'utf8')).source,process.env.HALO_DRIVER_REF);
 const inventory=(await client.call('list_apps')).structured;
 const apps=Array.isArray(inventory)?inventory:inventory.apps;
 const native=apps.find(app=>app.pid===pid);assert.ok(native,'Exact owned GTK4 app discovered');
 const app=await cua.getApp(native.name);
 const observe=async name=>{
  const value=await app.getAXStateAndScreenshot({emit:false,disableDiffing:true});
  assert.ok(value.screenshot,'Real application pixels required');
  await writeFile(join(out,name+'.txt'),value.state);await writeFile(join(out,name+'.png'),value.screenshot);
  return value;
 };
 const observation=await observe('before');
 const lines=observation.state.split('\n').filter(line=>line.includes('Receipt input')&&/entry|text/i.test(line)&&/\[\d+\]/.test(line));
 assert.equal(lines.length,1,'Unique freshly observed owned entry');
 const index=Number(lines[0].match(/\[(\d+)\]/)[1]);
 evidence.before=await fresh();unchanged(evidence.before);
 // Collect actual application effects even when the old driver returns normally.
 try{await app.click(index,{deliveryMode:'foreground'});evidence.returnedNormally=true;}
 catch(error){evidence.refusal={code:error.code,message:error.message,details:error.details};}
 for(let i=0;i<5;i++)evidence.samples.push(await fresh());
 await observe('after');
 evidence.savedText=await readFile(join(out,'typed.txt'),'utf8');
 for(const sample of evidence.samples)unchanged(sample);
 assert.equal(evidence.savedText,'');
 const clicks=evidence.calls.filter(item=>item.tool==='click');assert.equal(clicks.length,1);
 const request=clicks[0].args;
 assert.equal(request.pid,pid);assert.equal(request.window_id,windowId);assert.equal(request.delivery_mode,'foreground');
 assert.equal(request.element_index,index);assert.ok(request.snapshot_id);assert.ok(request.element_token);
 assert.equal(evidence.calls.filter(item=>['press_key','type_text','native_paste'].includes(item.tool)).length,0);
 assert.equal(evidence.refusal?.code,'native_focus_unavailable','SDK must reject explicit toolkit NotSupported instead of returning unverified success');
 const details=evidence.refusal.details;
 assert.equal(details.effect,'refused');assert.equal(details.verified,false);
 assert.equal(details.native_error,'org.freedesktop.DBus.Error.NotSupported');
 assert.equal(details.ax_action,'grab_focus');assert.equal(details.pointer_input_sent,false);assert.equal(details.text_input_sent,false);
 assert.match(evidence.refusal.message,/window activation.*may already have changed window focus/);
 evidence.accepted=true;
}catch(error){evidence.error={code:error.code,message:error.message,stack:error.stack};try{evidence.atFailure=await fresh();}catch{}}
finally{
 try{await sdk.close();evidence.sessionDetached=true;}catch(error){evidence.detachError=error.message;}
 await writeFile(join(out,'gtk4-refusal-evidence.json'),JSON.stringify(evidence,null,2));
 console.log(JSON.stringify({accepted:evidence.accepted,refusalCode:evidence.refusal?.code,returnedNormally:evidence.returnedNormally,samples:evidence.samples.length,error:evidence.error?.message}));
 if(!evidence.accepted||!evidence.sessionDetached)process.exitCode=1;
}
