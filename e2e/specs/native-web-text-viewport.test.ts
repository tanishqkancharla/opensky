import {mkdtemp, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {expect} from "vitest";
import {test} from "../fixtures/sdk.js";
type Window = {pid:number;window_id:number;app_name:string;is_on_screen:boolean;title:string};
type Driver = {invoke(tool:string,args:Record<string,unknown>):Promise<{structured:unknown}>};
test("WEBTEXT-N01: Dictionary viewport preserves reading, complete recovery and live scrolling",async({sdk,cua})=>{
 const artifacts=await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR??tmpdir(),"dictionary-viewport-"));
 const driver=sdk as unknown as Driver;
 expect((await sdk.list_apps()).some(a=>a.id==='com.apple.Dictionary'&&a.isRunning)).toBe(false);
 const windows=async()=>((await driver.invoke('list_windows',{})).structured as {windows:Window[]}).windows;
 const before=new Set((await windows()).map(w=>`${w.pid}:${w.window_id}`));let owned:Window|undefined;
 const calls:Record<string,unknown>[]=[];const original=sdk.driver.call.bind(sdk.driver);
 sdk.driver.call=async(tool,args={})=>{const result=await original(tool,args);if(tool==='get_window_state'&&args.probe_only!==true){const state=result.structured as Record<string,unknown>;calls.push(state);await writeFile(join(artifacts,`state-${calls.length}.json`),JSON.stringify(state,null,2));}return result;};
 const index=(tree:string,role:string)=>{const rows=tree.split('\n').filter(l=>new RegExp(`\\[\\d+\\] ${role}\\b`).test(l));expect(rows).toHaveLength(1);return Number(rows[0]!.match(/\[(\d+)\]/)![1]);};
 const scrollValue=()=>{const elements=calls.at(-1)!.elements as {role:string;value?:string}[];const bars=elements.filter(e=>e.role==='AXScrollBar');expect(bars).toHaveLength(1);return Number(bars[0]!.value);};
 try{
  await driver.invoke('launch_app',{bundle_id:'com.apple.Dictionary',creates_new_application_instance:true,additional_arguments:['-ApplePersistenceIgnoreState','YES']});
  const app=await cua.getApp('Dictionary');let tree=await app.getAXState({disableDiffing:true,emit:false});
  const fresh=(await windows()).filter(w=>w.app_name==='Dictionary'&&w.is_on_screen&&!before.has(`${w.pid}:${w.window_id}`));expect(fresh).toHaveLength(1);owned=fresh[0]!;
  await app.setValue(index(tree,'AXTextField'),'set');await app.pressKey('ENTER');
  const top=await app.getAXState({disableDiffing:true,emit:false});await writeFile(join(artifacts,'visible-top.txt'),top);
  expect(top).toContain('put, lay, or stand');expect(top).toContain('window text viewport');expect(top).toContain('collectionScope:"all"');expect(scrollValue()).toBe(0);
  const root=index(top,'AXWebArea'),search=index(top,'AXTextField');
  const full=await app.getAXState({collectionScope:'all',emit:false});await writeFile(join(artifacts,'full-current.txt'),full);
  expect(full).not.toContain('window text viewport');expect(full.length).toBeGreaterThan(top.length*3);expect(full).toContain('put, lay, or stand');expect(index(full,'AXWebArea')).toBe(root);expect(index(full,'AXTextField')).toBe(search);
  await app.scroll(root,'down',1);const down=await app.getAXState({disableDiffing:true,emit:false});await writeFile(join(artifacts,'visible-down.txt'),down);
  expect(scrollValue()).toBeGreaterThan(0);expect(down).toContain('window text viewport');expect(down).not.toBe(top);expect(index(down,'AXWebArea')).toBe(root);expect(index(down,'AXTextField')).toBe(search);
  await app.scroll(root,'up',100);const returned=await app.getAXState({disableDiffing:true,emit:false});expect(scrollValue()).toBe(0);expect(returned).toContain('put, lay, or stand');expect(returned).toContain('window text viewport');
  await app.setValue(index(returned,'AXTextField'),'lantern');await app.pressKey('ENTER');tree=await app.getAXState({disableDiffing:true,emit:false});expect(tree).toContain('a lamp with a transparent case');
  await writeFile(join(artifacts,'acceptance.json'),JSON.stringify({owned,topCharacters:top.length,fullCharacters:full.length,downCharacters:down.length,firstDefinitionPreserved:true,completeRecovery:true,scrollMovedAndReturnedToZero:true,searchAndRootIdentityRetained:true,lanternRestored:true},null,2));
 }finally{
  sdk.driver.call=original;
  if(owned){await driver.invoke('close_window',{pid:owned.pid,window_id:owned.window_id});await expect.poll(async()=> (await windows()).some(w=>w.pid===owned!.pid&&w.window_id===owned!.window_id&&w.is_on_screen)).toBe(false);}
  await writeFile(join(artifacts,'cleanup.json'),JSON.stringify({app:'Dictionary viewport fixture',owned,notes:'Parent GUI controller independently verifies exact app exit.'}));
 }
},120_000);
