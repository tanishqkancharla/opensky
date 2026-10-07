import {mkdtemp,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {expect} from 'vitest';
import {test} from '../fixtures/sdk.js';

test('BUTTON-N01: one primary click opens a Safari tab when its native button omits AXPress',async({sdk,cua})=>{
 const directory=await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR??tmpdir(),'native-primary-button-'));
 const calls:any[]=[];let raw:any;const call=sdk.driver.call.bind(sdk.driver);
 sdk.driver.call=async(tool,args={})=>{try{const r=await call(tool,args);calls.push({tool,args,structured:r.structured});if(tool==='get_window_state'&&args.probe_only!==true)raw=r.structured;return r;}catch(error){calls.push({tool,args,error:String(error)});throw error;}};
 try{
  const app=await cua.getApp('Safari');let state='';let serial=0;
  const observe=async(label:string)=>{state=await app.getAXState({emit:false,disableDiffing:true});await writeFile(join(directory,`${serial++}-${label}.txt`),state);};
  await app.pressKey('CMD+N');await observe('one-tab-before');
  expect(state).not.toMatch(/Tab bar, \d+ tabs/);
  const buttons=raw.elements.filter((e:any)=>e.role==='AXButton'&&e.identifier==='NewTabButton');expect(buttons).toHaveLength(1);
  expect(buttons[0].actions).not.toContain('AXPress');
  // Unsupported background delivery must refuse before any primary action.
  // This is the same owner as foreground primary-button behavior, not a duplicate.
  await expect(sdk.driver.call('click',{pid:raw.pid,window_id:raw.window_id,element_token:buttons[0].element_token,action:'press',button:'left',delivery_mode:'background'}))
   .rejects.toMatchObject({code:'background_unavailable',details:{effect:'refused',dispatch_attempted:false}});
  await observe('after-background-refusal');expect(state).not.toMatch(/Tab bar, \d+ tabs/);
  const rows=state.split('\n').filter(l=>l.includes('NewTabButton')&&/\[\d+\]/.test(l));expect(rows).toHaveLength(1);
  const window=raw.window_id,start=calls.length;
  await app.click(Number(rows[0]!.match(/\[(\d+)\]/)![1]));
  const deadline=Date.now()+2500;do{await observe('after-one-click');if(/Tab bar, 2 tabs/.test(state))break;}while(Date.now()<deadline);
  const input=calls.slice(start).filter(c=>['click','double_click','hotkey','press_key'].includes(c.tool));
  await writeFile(join(directory,'acceptance.json'),JSON.stringify({window,afterWindow:raw.window_id,button:buttons[0],input,createdTwoTabs:/Tab bar, 2 tabs/.test(state),raw},null,2));
  expect(input).toHaveLength(1);expect(input[0].tool).toBe('click');expect(input[0].args.window_id).toBe(window);
  expect(raw.window_id).toBe(window);expect(state).toMatch(/Tab bar, 2 tabs/);
 }finally{sdk.driver.call=call;await writeFile(join(directory,'calls.json'),JSON.stringify(calls,null,2));}
 // The leased outer controller owns all exact Safari app/window cleanup.
},45000);
