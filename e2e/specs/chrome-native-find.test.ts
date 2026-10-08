import {randomUUID} from "node:crypto";
import {mkdtemp,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {expect} from "vitest";
import {createOpenSky} from "opensky-cua";
import {test} from "../fixtures/sdk.js";
const findTest=test.extend({html:'<main><h1>Find ownership fixture</h1><p>domain one; domain two.</p></main>'});
findTest('FIND-N01: native app scope binds actual Find controls while the main document remains exact',async({sdk,cua,site})=>{
 if(process.platform!=='darwin')throw Error('Requires actual macOS Chrome');
 const directory=await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR??tmpdir(),'chrome-find-ownership-'));
 const driver=(sdk as ReturnType<typeof createOpenSky>).driver;
 const session='find-native-'+randomUUID();let main:any,panel:any;const states:string[]=[];const calls:any[]=[];
 const original=driver.call.bind(driver);driver.call=async(tool,args={})=>{try{const result=await original(tool,args);calls.push({tool,args,structured:result.structured});return result;}catch(error){calls.push({tool,args,error:String(error)});throw error;}};
 const index=(state:string,role:string,name:string)=>{const rows=state.split('\n').filter(l=>l.includes(` ${role} "${name}"`)&&/\[\d+\]/.test(l));expect(rows).toHaveLength(1);return Number(rows[0]!.match(/\[(\d+)\]/)![1]);};
 try{
  const prepared=(await driver.call('browser_prepare',{session,allow_launch:true,profile:{mode:'isolated_new'}})).structured as any;expect(prepared.prepared).toBe(true);
  await expect.poll(async()=>{const windows=((await driver.call('list_windows',{session,pid:prepared.prepared_pid})).structured as any).windows.filter((w:any)=>w.pid===prepared.prepared_pid&&w.is_on_screen&&w.layer===0&&w.bounds.width>100&&w.bounds.height>100);if(windows.length===1)main=windows[0];return windows.length;},{timeout:5000,interval:100}).toBe(1);
  const initial=await sdk.get_app_state({app:'Google Chrome',scope:'app',includeScreenshot:false,disableDiff:true});const mainHandle=initial.targetHandle;
  const app=await cua.getApp('Google Chrome');await app.pressKey('CMD+L');await app.typeText(site.url);await app.pressKey('ENTER');
  await expect.poll(async()=>{const state=await app.getAXState({emit:false,disableDiffing:true});states.push(state);return state;},{timeout:5000,interval:100}).toContain('Find ownership fixture');
  await app.pressKey('CMD+F');await app.pressKey('CMD+A');await app.typeText('domain');
  let state='';await expect.poll(async()=>{state=await app.getAXState({emit:false,disableDiffing:true});states.push(state);return state;},{timeout:5000,interval:100}).toMatch(/Result [01] of 2/);
  // This owned local page can publish two matches before an active match.
  // Establish one explicit first match; never replay an uncertain navigation.
  if(state.includes('Result 0 of 2')){await app.pressKey('ENTER');state=await app.getAXState({emit:false,disableDiffing:true});states.push(state);}
  expect(state).toContain('Result 1 of 2');
  const listed=(await driver.call('list_windows',{pid:main.pid})).structured as any;
  expect(listed.focused_window_id).toBe(main.window_id);
  expect(Number.isInteger(listed.focused_element_window_id)).toBe(true);
  expect(listed.focused_element_window_id).not.toBe(main.window_id);
  panel=listed.windows.find((w:any)=>w.window_id===listed.focused_element_window_id);
  expect(panel.pid).toBe(main.pid);expect(panel.is_on_screen).toBe(true);
  // Main-window snapshots can expose the panel's controls. That never gives a
  // document handle authority to click an element owned by the panel window.
  const exactMain=await sdk.get_app_state({app:mainHandle,includeScreenshot:false,disableDiff:true});
  await expect(sdk.click({app:mainHandle,element_index:index(exactMain.text,'AXButton','Next')})).rejects.toThrow('could not be proven to belong');
  state=await app.getAXState({emit:false,disableDiffing:true});states.push(state);expect(state).toContain('Result 1 of 2');
  await app.click(index(state,'AXButton','Next'));state=await app.getAXState({emit:false,disableDiffing:true});states.push(state);expect(state).toContain('Result 2 of 2');
  await app.click(index(state,'AXButton','Previous'));state=await app.getAXState({emit:false,disableDiffing:true});states.push(state);expect(state).toContain('Result 1 of 2');
  await app.selectText(index(state,'AXTextField','Find'),'domain');
  await app.typeText('documentation');state=await app.getAXState({emit:false,disableDiffing:true});states.push(state);
  expect(state).toMatch(/AXTextField "Find".*(?:= |value=)"documentation"/);
  await app.pressKey('CMD+A');await app.pressKey('BACKSPACE');state=await app.getAXState({emit:false,disableDiffing:true});states.push(state);
  expect(state).not.toMatch(/AXTextField "Find".*(?:= |value=)"(?:domain|documentation)"/);
  await app.click(index(state,'AXButton','Close find bar'));state=await app.getAXState({emit:false,disableDiffing:true});states.push(state);expect(state).not.toContain('Close find bar');expect(state).toContain('domain one; domain two.');
  const clicks=calls.filter(c=>c.tool==='click');expect(clicks).toHaveLength(4);expect(clicks[0].args.window_id).toBe(main.window_id);expect(clicks.slice(1).every(c=>c.args.window_id===panel.window_id&&c.args.pid===main.pid)).toBe(true);
  expect(calls.filter(c=>c.tool==='browser_prepare')).toHaveLength(1);
 }finally{
  driver.call=original;await writeFile(join(directory,'proof.json'),JSON.stringify({main,panel,calls,states},null,2));
  const ended=(await driver.call('end_session',{session})).structured as any;const safeToContinue=ended.session===session&&ended.active===false;await writeFile(join(directory,'cleanup.json'),JSON.stringify({session,ended,safeToContinue},null,2));expect(safeToContinue).toBe(true);
 }
},60000);
