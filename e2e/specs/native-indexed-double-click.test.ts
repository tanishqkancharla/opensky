import {mkdtemp,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {expect} from 'vitest';
import {test} from '../fixtures/sdk.js';

test('DOUBLE-N01: one indexed Font Book double-click opens the exact typeface detail',async({sdk,cua})=>{
 const directory=await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR??tmpdir(),'indexed-double-click-'));
 const calls:any[]=[];const invoke=sdk.driver.call.bind(sdk.driver);
 sdk.driver.call=async(tool,args={})=>{try{const result=await invoke(tool,args);calls.push({tool,args,structured:result.structured});return result;}catch(error){calls.push({tool,args,error:String(error)});throw error;}};
 try{
  const app=await cua.getApp('Font Book');let state='',serial=0;
  const observe=async(label:string)=>{state=await app.getAXState({emit:false,disableDiffing:true});await writeFile(join(directory,`${serial++}-${label}.txt`),state);};
  const index=(part:string)=>{const rows=state.split('\n').filter(l=>l.includes(part)&&/\[\d+\]/.test(l));expect(rows).toHaveLength(1);return Number(rows[0]!.match(/\[(\d+)\]/)![1]);};
  await observe('initial');
  if(state.includes('AXButton (Go back)')){await app.click(index('AXButton (Go back)'));await observe('collection');}
  await app.click(index('AXRadioButton (View as Grid)'));await observe('grid');
  await app.setValue(index('placeholder="Search"'),'Helvetica');await observe('filtered-grid');
  expect(state).toContain('AXGroup (Show Helvetica)');expect(state).not.toContain('Repertoire');
  const window=(calls.filter(c=>c.tool==='get_window_state'&&c.args.probe_only!==true).at(-1).structured as any).window_id;
  const start=calls.length;let inputError:string|null=null;
  try{await app.click(index('AXGroup (Show Helvetica)'),{clickCount:2});}catch(error){inputError=String(error);}
  await observe('after-one-double-click');
  await writeFile(join(directory,'after.png'),await app.getScreenshot({emit:false}));
  const input=calls.slice(start).filter(c=>['click','double_click','press_key','hotkey','bring_to_front'].includes(c.tool));
  await writeFile(join(directory,'acceptance.json'),JSON.stringify({inputError,window,input,openedExactTypeface:/AXWindow "Helvetica.*6 styles/.test(state),hasRepertoire:state.includes('Collapse Repertoire')},null,2));
  expect(inputError).toBeNull();expect(input).toHaveLength(1);expect(input[0].tool).toBe('double_click');
  expect(input[0].args).toMatchObject({window_id:window,delivery_mode:'foreground'});expect(input[0].args.element_token).toMatch(/^s[0-9a-f]+:\d+$/);
  expect(state).toMatch(/AXWindow "Helvetica.*6 styles/);expect(state).toContain('Collapse Repertoire');
  await app.click(index('AXButton (Go back)'));await observe('returned');
  await app.setValue(index('placeholder="Search"'),'');await observe('search-cleared');
 }finally{sdk.driver.call=invoke;await writeFile(join(directory,'calls.json'),JSON.stringify(calls,null,2));}
 // Exact cold Font Book process/window cleanup belongs to the leased desktop controller.
},60000);
