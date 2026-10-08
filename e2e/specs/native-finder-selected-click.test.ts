import { mkdtemp, mkdir, rm, writeFile, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vitest";
import { test } from "../fixtures/sdk.js";

type Window = { pid: number; window_id: number; app_name: string; is_on_screen: boolean; bounds: { width: number; height: number } };
type Driver = { invoke(tool: string, args: Record<string, unknown>): Promise<{ structured: unknown }> };

test.for(['list','icon'] as const)('FINDER-N06: clicking an already-selected filename preserves its collection behavior in %s view',{timeout:60000},async(mode,{sdk,cua})=>{
 const driver=sdk as unknown as Driver;
 const windows=async()=>((await driver.invoke('list_windows',{})).structured as {windows:Window[]}).windows;
 const before=new Set((await windows()).map(w=>`${w.pid}:${w.window_id}`));
 const root=await mkdtemp(join(tmpdir(),'opensky-selected-file-'));
 const rootBefore=await lstat(root);
 const artifacts=await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR??tmpdir(),'finder-selected-label-cleanup-'));
 let owned:Window|undefined;
 let primaryError:unknown;
 let failed=false;
 const cleanupErrors:unknown[]=[];
 let windowAbsent=!owned;
 let rootRemoved=false;
 const describe=(error:unknown)=>error instanceof Error?{name:error.name,message:error.message,stack:error.stack}:{message:String(error)};
 try{
  await mkdir(join(root,'Drafts'));
  const app=await cua.getApp('Finder');await app.pressKey('super+n');await app.getAXState({emit:false});
  owned=(await windows()).find(w=>w.app_name==='Finder'&&w.is_on_screen&&w.bounds.width>100&&w.bounds.height>100&&!before.has(`${w.pid}:${w.window_id}`));expect(owned).toBeTruthy();
  await app.pressKey('super+shift+g');let state='';
  await expect.poll(async()=>{state=await app.getAXState({disableDiffing:true,emit:false});return state.includes('id=PathTextField');}).toBe(true);
  const path=state.match(/\[(\d+)\] AXTextField[^\n]*id=PathTextField/);expect(path).toBeTruthy();
  await app.setValue(Number(path![1]),root);await app.pressKey('Return');
  await expect.poll(async()=>{state=await app.getAXState({disableDiffing:true,emit:false});return state.includes(`AXWindow "${root.split('/').at(-1)}"`)&&!state.includes('AXSheet');}).toBe(true);
  await app.pressKey(mode==='list'?'super+2':'super+1');state=await app.getAXState({disableDiffing:true,emit:false});
  const field=()=>{const match=state.match(mode==='list'?/\[(\d+)\] AXTextField = "Drafts"/:/\[(\d+)\] AXImage "Drafts"/);expect(match).toBeTruthy();return Number(match![1]);};
  await app.click(field());state=await app.getAXState({disableDiffing:true,emit:false});expect(state).toContain('[selected]');
  if(process.env.OPENSKY_E2E_ARTIFACT_DIR)await writeFile(join(process.env.OPENSKY_E2E_ARTIFACT_DIR,'selected-field-before.txt'),state);
  await app.click(field());state=await app.getAXState({disableDiffing:true,emit:false});expect(state).toContain('[selected]');
  // The label is a selected collection item, not a text editor. Its normal
  // Open shortcut must still navigate instead of editing the filename.
  await app.pressKey('super+o');state=await app.getAXState({disableDiffing:true,emit:false});expect(state).toContain('AXWindow "Drafts"');
  if(process.env.OPENSKY_E2E_ARTIFACT_DIR)await writeFile(join(process.env.OPENSKY_E2E_ARTIFACT_DIR,'selected-field-after.txt'),state);
 }catch(error){
  failed=true;primaryError=error;
 }finally{
  if(owned){
   // A close refusal can still be followed by proven absence. Retain the
   // refusal separately; always attempt the exact read-only absence check.
   try{await driver.invoke('close_window',{pid:owned.pid,window_id:owned.window_id});}catch(error){cleanupErrors.push(error);}
   try{await expect.poll(async()=>(await windows()).some(w=>w.pid===owned!.pid&&w.window_id===owned!.window_id&&w.is_on_screen)).toBe(false);windowAbsent=true;}catch(error){windowAbsent=false;cleanupErrors.push(error);}
  }
  try{
   const current=await lstat(root);
   if(!current.isDirectory()||current.isSymbolicLink()||current.dev!==rootBefore.dev||current.ino!==rootBefore.ino)throw new Error('Finder fixture root identity changed; preserve for recovery');
   if(!failed&&cleanupErrors.length===0){await rm(root,{recursive:true});rootRemoved=true;}
  }catch(error){cleanupErrors.push(error);}
  try{
   await writeFile(join(artifacts,'cleanup.json'),JSON.stringify({app:'Finder selected label fixture',safeToContinue:windowAbsent&&cleanupErrors.length===0,ownedWindow:owned??null,windowAbsent,root:{path:root,device:rootBefore.dev,inode:rootBefore.ino,removed:rootRemoved,retained:!rootRemoved},primaryFailure:failed?describe(primaryError):null,cleanupFailures:cleanupErrors.map(describe)},null,2));
  }catch(error){cleanupErrors.push(error);}
 }
 if(failed&&cleanupErrors.length)throw new AggregateError([primaryError,...cleanupErrors],`Finder selected-label primary failure: ${String(primaryError)}; cleanup also failed: ${cleanupErrors.map(String).join('; ')}`);
 if(failed)throw primaryError;
 if(cleanupErrors.length)throw new AggregateError(cleanupErrors,'Finder selected-label cleanup failed');
});
