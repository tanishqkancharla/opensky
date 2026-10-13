import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect} from 'vitest';
import {test} from '../fixtures/sdk.js';

test('TAB-N01: same-title native tabs retain physical identity and emit selection changes before exact close',async({cua})=>{
 const directory=await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR??tmpdir(),'native-tab-identity-'));
 const app=await cua.getApp('Safari');
 const state=()=>app.getAXState({disableDiffing:true,emit:false});
 const tabs=(tree:string)=>tree.split('\n').filter(l=>l.includes('AXRadioButton')&&l.includes('TabBarTab')).map(line=>({index:Number(line.match(/\[(\d+)\]/)![1]),selected:line.includes('[value="1"]')}));
 const page=async(url:string)=>{
  let tree='';for(let n=0;n<4;n++){tree=await state();if(tree.includes(`AXWebArea (Example Domain) [url="${url}/"]`))return tree;}
  throw new Error(`Actual page did not load ${url}`);
 };
 const navigate=async(url:string)=>{await app.pressKey('META+L');await app.typeText(url);await app.pressKey('ENTER');return page(url);};
 await navigate('https://example.org');
 await app.pressKey('META+T');expect(tabs(await state())).toHaveLength(2);
 const before=await navigate('https://example.net');const beforeTabs=tabs(before);
 expect(beforeTabs).toHaveLength(2);expect(beforeTabs.map(t=>t.selected)).toEqual([false,true]);
 await app.click(beforeTabs[0]!.index);const diff=await app.getAXState({emit:false});const after=await page('https://example.org');const afterTabs=tabs(after);
 await writeFile(join(directory,'before.txt'),before);await writeFile(join(directory,'diff.txt'),diff);await writeFile(join(directory,'after.txt'),after);
 expect(afterTabs.map(t=>t.index)).toEqual(beforeTabs.map(t=>t.index));
 expect(afterTabs.map(t=>t.selected)).toEqual([true,false]);
 for(const tab of afterTabs)expect(diff).toContain(`~ [${tab.index}] AXRadioButton`);
 // Freshly observed inactive second tab must close the net tab, preserving org.
 await app.performSecondaryAction(afterTabs[1]!.index,'close tab');const closed=await page('https://example.org');
 await writeFile(join(directory,'after-close.txt'),closed);
 expect(tabs(closed).length).toBeLessThanOrEqual(1);
},90000);
