import {mkdtemp,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {expect} from 'vitest';
import {test} from '../fixtures/sdk.js';
import {createOpenSky,createCua} from 'opensky-cua';

const plusTest=test.extend({html:'<title>Named plus proof</title><main>Owned Chrome keyboard fixture</main>'});
plusTest('KEY-S04: named plus chords change zoom once on the exact owned Chrome window',async({tab,site})=>{
 if(process.platform!=='darwin')throw Error('Requires actual macOS Chrome');
 const directory=await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR??tmpdir(),'named-plus-chord-'));
 const initial=await tab.getAXState({emit:false,disableDiffing:true});
 expect(initial).toContain('Owned Chrome keyboard fixture');
 // A separate native facade avoids treating the typed fixture's Chrome alias as browser content.
 const sdk=createOpenSky({homeDir:join(directory,'native-home'),autoLaunch:false,driverOptions:{binaryPath:process.env.OPENSKY_DRIVER_BINARY,socket:process.env.OPENSKY_DRIVER_SOCKET,autoInstall:false,autoStart:false}});
 const calls:any[]=[];const states:string[]=[];let owner:any=null;const original=sdk.driver.call.bind(sdk.driver);
 try{
 const app=await createCua(sdk).getApp('Google Chrome');
 const windows=((await sdk.driver.call('list_windows',{})).structured as any).windows.filter((w:any)=>w.app_name==='Google Chrome'&&w.is_on_screen&&w.layer===0&&w.bounds.width>100&&w.bounds.height>100);
 expect(windows).toHaveLength(1);
 owner=windows[0];
 sdk.driver.call=async(tool,args={})=>{const result=await original(tool,args);if(['hotkey','press_key'].includes(tool))calls.push({tool,args,structured:result.structured});return result;};
  for(const [key,zoom] of [['CMD+plus','110'],['cmd+shift+plus','125'],['cmd+minus','110'],['cmd+0','100']]){
   await app.pressKey(key);
   const state=await app.getAXState({emit:false,disableDiffing:true});states.push(state);
   expect(state).toContain(`Zoom: ${zoom}%`);
   expect(state).toContain(`url="${site.url}"`);
  }
  expect(calls.map(c=>c.tool)).toEqual(['hotkey','hotkey','hotkey','hotkey']);
  expect(calls.map(c=>c.args.keys)).toEqual([['cmd','shift','='],['cmd','shift','='],['cmd','-'],['cmd','0']]);
  expect(calls.every(c=>c.args.pid===owner.pid&&c.args.window_id===owner.window_id&&c.args.delivery_mode==='foreground')).toBe(true);
 }finally{
  sdk.driver.call=original;
  await writeFile(join(directory,'proof.json'),JSON.stringify({owner,calls,states},null,2));
  await sdk.close();
 }
},60000);
