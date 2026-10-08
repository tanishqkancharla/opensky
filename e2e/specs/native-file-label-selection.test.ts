import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {expect} from 'vitest';
import {test} from '../fixtures/sdk.js';

test('FILE-N01: a native file label selects once without editable-focus failure and opens only on advertised Open',async({sdk,cua})=>{
 const directory=await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR??tmpdir(),'file-label-'));
 const path=join(directory,'Requested.rtf'),body='{\\rtf1\\ansi File label requested document 105}';
 await writeFile(path,body);const expected=pathToFileURL(path).href;
 const calls:any[]=[];let raw:any;const call=sdk.driver.call.bind(sdk.driver);
 sdk.driver.call=async(tool,args={})=>{try{const result=await call(tool,args);calls.push({tool,args,structured:result.structured});if(tool==='get_window_state'&&args.probe_only!==true)raw=result.structured;return result;}catch(error){calls.push({tool,args,error:String(error)});throw error;}};
 try{
  const app=await cua.getApp('TextEdit');let serial=0,state='';
  const observe=async(label:string)=>{state=await app.getAXState({emit:false,disableDiffing:true});await writeFile(join(directory,`${serial++}-${label}.txt`),state);return state;};
  const ready=async(label:string,predicate:(s:string)=>boolean)=>{const deadline=Date.now()+5000;do{await observe(label);if(predicate(state))return;}while(Date.now()<deadline);throw Error(`Observed ${label} missing after one input`);};
  const current=(pattern:RegExp)=>{const rows=state.split('\n').filter(l=>pattern.test(l)&&/\[\d+\]/.test(l));expect(rows).toHaveLength(1);return Number(rows[0]!.match(/\[(\d+)\]/)![1]);};
  await observe('untitled');await app.pressKey('super+o');await ready('open',s=>s.includes('id=open-panel'));
  await app.pressKey('super+shift+g');await ready('goto',s=>s.includes('id=PathTextField'));
  await app.setValue(current(/AXTextField.*id=PathTextField/),path);await app.pressKey('Return');
  await ready('filename',s=>s.includes(expected)&&s.includes('AXTextField = "Requested.rtf"')&&!s.includes('id=PathTextField'));
  const filename=()=>raw.elements.filter((e:any)=>e.role==='AXTextField'&&e.document_url===expected);
  expect(filename()).toHaveLength(1);expect(filename()[0].actions).toContain('AXOpen');expect(typeof filename()[0].selected).toBe("boolean");const selectedBefore=filename()[0].selected;
  const target=current(/AXTextField = "Requested.rtf"/),start=calls.length;let clickError:string|null=null;
  try{await app.click(target);}catch(error){clickError=String(error);}await observe('after-one-click');
  const primaryCalls=calls.slice(start).filter(c=>['click','double_click','press_key'].includes(c.tool));
  await writeFile(join(directory,'primary-acceptance.json'),JSON.stringify({selectedBefore,clickError,primaryCalls,raw},null,2));
  expect(primaryCalls).toHaveLength(1);expect(primaryCalls[0].tool).toBe('click');
  expect(clickError).toBeNull();expect(filename()[0].selected).toBe(true);expect(state).toContain('id=open-panel');
  const openStart=calls.length;let openError:string|null=null;
  try{await app.performSecondaryAction(current(/AXTextField = "Requested.rtf"/),'open');}catch(error){openError=String(error);}await observe('after-one-open');
  const openCalls=calls.slice(openStart).filter(c=>['click','double_click','press_key'].includes(c.tool));
  await writeFile(join(directory,'acceptance.json'),JSON.stringify({expected,target,clickError,openError,primaryCalls,openCalls,raw},null,2));
  expect(openError).toBeNull();expect(openCalls).toHaveLength(1);expect(openCalls[0].tool).toBe('double_click');
  expect(state).not.toContain('id=open-panel');expect(state).toContain(expected);expect(state).toContain('File label requested document 105');
  expect(createHash('sha256').update(await readFile(path)).digest('hex')).toBe(createHash('sha256').update(body).digest('hex'));
 }finally{sdk.driver.call=call;await writeFile(join(directory,'calls.json'),JSON.stringify(calls,null,2));}
 // Controller owns the fresh app process and cleanup; fixture file retained as evidence.
},60000);
