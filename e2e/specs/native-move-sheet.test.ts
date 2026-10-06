import {expect} from "vitest";
import {nativeTest} from "../fixtures/sdk.js";
import {writeFile} from "node:fs/promises";
import {join} from "node:path";

const test=nativeTest.extend<{documentCleanupSave:boolean}>({documentCleanupSave:false,documentText:"Move To exact parent fixture.\n"});
function control(state:string, matches:(line:string)=>boolean):number {
 const rows=state.split("\n").filter(matches);
 expect(rows).toHaveLength(1);
 return Number(rows[0]!.match(/\[(\d+)\]/)![1]);
}

test("SHEET-N02: app scope observes and cancels Move To on the exact parent amid sibling documents",async({sdk,cua,document})=>{
 await sdk.press_key({app:document.handle,key:"super+n"});
 const sibling=await sdk.get_app_state({app:document.handle,scope:"app",includeScreenshot:false,disableDiff:true});
 expect(sibling.targetHandle).not.toBe(document.handle);
 await sdk.bring_to_front({app:document.handle});
 const app=await cua.getApp("TextEdit");
 let state=await app.getAXState({emit:false,disableDiffing:true});
 expect(state).toContain(document.initialText.trim());
 await app.click(control(state,line=>line.includes('AXMenuBarItem "File"')));
 await expect.poll(async()=>{state=await app.getAXState({emit:false,disableDiffing:true});return state;},{timeout:2000,interval:100}).toContain("moveDocument:");
 await app.click(control(state,line=>line.includes('AXMenuItem "Move To')&&line.includes('moveDocument:')));
 state=await app.getAXState({emit:false,disableDiffing:true});
 const listed=(await sdk.driver.call("list_windows",{pid:document.identity.pid})).structured as any;
 expect(listed.focused_sheet_parent_window_id).toBe(document.windowId);
 expect(listed.focused_window_id).not.toBe(document.windowId);
 expect(state).toContain("AXSheet");
 expect(state).toContain(document.initialText.trim());
 const observed=await sdk.get_app_state({app:document.handle,scope:"app",includeScreenshot:false,disableDiff:true});
 expect(observed.text).toContain("AXSheet");
 expect(observed.text).toContain(document.initialText.trim());
 state=await app.getAXState({emit:false,disableDiffing:true});
 await app.click(control(state,line=>line.includes('AXButton "Cancel"')));
 const after=await app.getAXState({emit:false,disableDiffing:true});
 expect(after).not.toContain("AXSheet");
 expect(after).toContain(document.initialText.trim());
 expect(await document.read()).toBe(document.initialText);
 await writeFile(join(process.env.OPENSKY_E2E_ARTIFACT_DIR!,"sheet-parent-proof.json"),JSON.stringify({listed,state,after,originalUnchanged:true},null,2));
});
