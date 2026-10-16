import {mkdtemp,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {expect} from 'vitest';
import {test} from '../fixtures/sdk.js';

test('ROWS-N01: a native process viewport exposes search and tabs, filters actual rows and retains explicit all recovery',async({sdk,cua})=>{
 const directory=await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR??tmpdir(),'native-process-viewport-'));
 const call=sdk.driver.call.bind(sdk.driver);const calls:any[]=[];let raw:any;
 sdk.driver.call=async(tool,args={})=>{const r=await call(tool,args);calls.push({tool,args});if(tool==='get_window_state'&&Array.isArray((r.structured as any)?.elements)&&(r.structured as any).elements.length)raw=r.structured;return r;};
 try{
  const app=await cua.getApp('Activity Monitor');let state='',serial=0;
  const observe=async(label:string,all=false)=>{state=await app.getAXState({emit:false,disableDiffing:true,...(all?{collectionScope:'all' as const}:{})});await writeFile(join(directory,`${serial++}-${label}.txt`),state);};
  const search=()=>{
   const groups=raw.elements.filter((e:any)=>e.role==='AXGroup'&&e.help?.includes('Show only processes'));expect(groups).toHaveLength(1);
   const fields=raw.elements.filter((e:any)=>e.role==='AXTextField'&&e.parent_index===groups[0].element_index);expect(fields).toHaveLength(1);
   // Volatile _NS identifiers are intentionally hidden in public text. Resolve
   // the currently observed search group and its unique direct editable child.
   const lines=state.split('\n'),starts=lines.map((l,i)=>l.includes('AXGroup')&&l.includes('Show only processes')?i:-1).filter(i=>i>=0);expect(starts).toHaveLength(1);
   const start=starts[0]!,depth=lines[start]!.match(/^ */)![0].length;
   let end=start+1;while(end<lines.length&&(!/^ *- /.test(lines[end]!)||lines[end]!.match(/^ */)![0].length>depth))end++;
   const rows=lines.slice(start+1,end).filter(l=>l.match(/^ */)![0].length===depth+2&&/\[\d+\] AXTextField/.test(l));expect(rows).toHaveLength(1);return Number(rows[0]!.match(/\[(\d+)\]/)![1]);
  };
  await observe('visible-before');const visibleCharacters=state.length,visibleElements=raw.elements.length;
  expect(state).not.toContain('PARTIAL TREE');expect(state).toContain('AXRadioButton (CPU)');expect(raw.collapsed_rows).toBeGreaterThan(0);expect(visibleCharacters).toBeLessThan(50000);expect(state).toContain('getAXState({collectionScope:"all"})');expect(state).not.toContain('native_row_scope:');
  await app.setValue(search(),'Activity Monitor');await observe('self-process');
  const processRows=raw.elements.filter((e:any)=>e.role==='AXRow');expect(processRows).toHaveLength(1);
  expect(raw.elements.some((e:any)=>e.role==='AXTextField'&&e.parent_index===processRows[0].element_index&&e.value==='Activity Monitor')).toBe(true);
  await writeFile(join(directory,'filtered.png'),await app.getScreenshot({emit:false}));
  await app.setValue(search(),'');await observe('visible-restored');expect(raw.collapsed_rows).toBeGreaterThan(0);
  await observe('all-recovery',true);const allCharacters=state.length,allElements=raw.elements.length;
  expect(raw.truncated).toBe(false);expect(raw.collapsed_rows??0).toBe(0);expect(allElements).toBeGreaterThan(visibleElements*3);
  await observe('visible-again');expect(state.length).toBeLessThan(50000);expect(raw.collapsed_rows).toBeGreaterThan(0);expect(state).toContain('AXRadioButton (CPU)');
  await writeFile(join(directory,'acceptance.json'),JSON.stringify({visibleCharacters,visibleElements,allCharacters,allElements,defaultHasSearchAndCpu:true,actualSelfProcessFilterObserved:true,allRecovery:true,calls},null,2));
 }finally{sdk.driver.call=call;}
 // Leased desktop controller owns the fresh Activity Monitor process and exit.
},60000);
