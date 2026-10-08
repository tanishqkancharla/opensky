import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {expect} from 'vitest';
import {test} from '../fixtures/sdk.js';
import {compileMacSwiftHelper} from '../fixtures/mac-swift-compiler.js';
const exec=promisify(execFile);

test('SELECTION-OBS-N04: Notes embedded editor selection uses its exact associated window and survives read-only observations',async({sdk,cua})=>{
 if(process.platform!=='darwin')throw Error('This real Notes gate requires macOS');
 // The campaign provides its strict, pre-proved reversible archive adapter.
 // Without it, no saved note is created or deleted by this regression.
 const archiveHelper=process.env.OPENSKY_NOTES_ARCHIVE_HELPER;
 if(!archiveHelper)throw Error('OPENSKY_NOTES_ARCHIVE_HELPER must identify the approved exact-UUID same-account archive adapter');
 const artifacts=process.env.OPENSKY_E2E_ARTIFACT_DIR!;
 const source=join(artifacts,'notes-selection-source');await mkdir(source);
 const temporary=await mkdtemp(join(tmpdir(),'opensky-notes-selection-'));
 const helper=join(temporary,'lifecycle'),readback=join(temporary,'readback');
 const title=`OpenSky Selection ${randomUUID()}`,body=`${title}\nRegular probe body.`;
 const calls:any[]=[],states:string[]=[];
 let identity:{pid:number;bundleId:string;launchedAt:number}|undefined,ownedId:string|undefined,creationAttempted=false;
 let cleanup:any={app:'Notes saved selection regression',safeToContinue:false};
 const index=(line:string)=>{const match=line.match(/\[(\d+)\]/);if(!match)throw Error('Current index missing');return Number(match[1]);};
 const ids=(state:string)=>new Set([...state.matchAll(/Note\[id=([A-Fa-f0-9-]{36})\]/g)].map(m=>m[1]!));
 try{
  const compilation = [
   await compileMacSwiftHelper(fileURLToPath(new URL('../../evals/parity/mac-app-lifecycle.swift',import.meta.url)),helper),
   await compileMacSwiftHelper(fileURLToPath(new URL('../fixtures/notes-selection-readback.swift',import.meta.url)),readback),
  ];
  await writeFile(join(source,'compilation.json'),JSON.stringify(compilation,null,2));
  expect(JSON.parse((await exec(helper,['list','com.apple.Notes'])).stdout)).toEqual([]);
  identity=JSON.parse((await exec(helper,['launch','/System/Applications/Notes.app','com.apple.Notes','["-ApplePersistenceIgnoreState","YES"]','{}'],{timeout:30000})).stdout);
  await exec(helper,['activate',String(identity!.pid),identity!.bundleId,String(identity!.launchedAt)]);
  const app=await cua.getApp('Notes');
  const snap=async(label:string,code?:string)=>{
   const state=await app.getAXState({emit:false,disableDiffing:true});states.push(state);
   await writeFile(join(source,`${label}.txt`),state);
   if(code){calls.push({type:'mcpToolCall',status:'completed',arguments:{code},result:{content:[{type:'text',text:state}]}});await writeFile(join(source,'result.json'),JSON.stringify({actualGUIRegression:true,items:calls},null,2));}
   return state;
  };
  const restored=await snap('restored');
  const defaults=restored.split('\n').filter(l=>/AXRow \[selectable\] \[label="Notes"(?: selected)?\]/.test(l));
  expect(defaults).toHaveLength(1);await app.click(index(defaults[0]!));
  const before=await snap('baseline','Current default Notes folder full observation before creating one saved note');
  expect(before).toContain('[label="Notes" selected]');
  expect(before).not.toContain(title);
  const old=ids(before),buttons=before.split('\n').filter(l=>l.includes('AXButton (New Note)'));
  expect(buttons).toHaveLength(1);
  await writeFile(join(source,'prompt.txt'),`Open Notes; create a new note; type the title '${title}'; type the body 'Regular probe body.'; select the title; make it bold.`);
  creationAttempted=true;const newIndex=index(buttons[0]!);await app.click(newIndex);
  let state=await snap('created',`await app.click(${newIndex}); await app.getAXState();`);
  const fresh=[...ids(state)].filter(id=>!old.has(id));expect(fresh).toHaveLength(1);ownedId=fresh[0]!;
  await writeFile(join(source,'ownership.json'),JSON.stringify({identity,ownedId,title,body,beforeIds:[...old]},null,2));
  await app.typeText(body);state=await snap('typed',`await app.typeText(${JSON.stringify(body)}); await app.getAXState();`);
  const editor=(state:string)=>{const rows=state.split('\n').filter(l=>l.includes('AXTextArea')&&l.includes(title));expect(rows).toHaveLength(1);return index(rows[0]!);};
  await app.selectText(editor(state),title);await app.pressKey('CMD+B');state=await snap('styled','Current owned title selection and bold command followed by full actual read');
  // Focus belongs outside the quoted multiline value, which must stay literal.
  expect(state).toContain(`AXTextArea = "**${title}**\nRegular probe body."`);
  expect(state).not.toContain(`**${title}** [focused]`);
  await app.selectText(editor(state),title);
  const selected=await sdk.get_app_state({app:'Notes',includeScreenshot:false});
  // Store the actual pre-assertion state so an old-driver failure is inspectable.
  await writeFile(join(source,'selected.json'),JSON.stringify(selected,null,2));
  const windows=(await sdk.driver.call('list_windows',{pid:identity!.pid})).structured as {focused_window_id:number;windows:any[]};
  const exact=windows.windows.filter(w=>w.pid===identity!.pid&&w.window_id===windows.focused_window_id&&w.is_on_screen&&w.bounds.width>100&&w.bounds.height>100);expect(exact).toHaveLength(1);
  const rawPath=join(source,'selected-raw.json');
  await exec(readback,[String(identity!.pid),String(identity!.launchedAt),String(exact[0].window_id),body,rawPath],{timeout:15000});
  const raw=JSON.parse(await readFile(rawPath,'utf8'));
  expect(raw.focused.AXRole.text).toBe('AXTextArea');expect(raw.focused.pid).toBe(identity!.pid);
  expect(raw.focused.AXSelectedText.text).toBe(title);
  expect(raw.focused.selectionRange).toEqual({startUTF16:0,lengthUTF16:title.length});
  expect(raw.focused.windowAttribute).toMatchObject({role:'AXWindow',pid:identity!.pid,windowId:exact[0].window_id,windowError:0});
  expect(selected.textSelection).toEqual({role:'AXTextArea',startUTF16:0,lengthUTF16:title.length,text:title,textTruncated:false});
  const footer=`Selected text (UTF-16 0+${title.length}): ${JSON.stringify(title)}`;
  expect(selected.text).toContain(footer);
  const same=await app.getAXState({emit:false});expect(same).toContain(footer);
  const pixels=await sdk.get_app_state({app:selected.targetHandle,includeAccessibilityTree:false});
  expect(pixels.textSelection).toBeUndefined();expect(pixels.text).toBe('');
  const after=await sdk.get_app_state({app:selected.targetHandle,includeScreenshot:false});
  expect(after.textSelection).toEqual(selected.textSelection);
  await writeFile(join(source,'observation-evidence.json'),JSON.stringify({selected,same,after,raw},null,2));
  // Exercise the same owned note through the two list scopes; retain both full
  // graphs before asserting the incremental cue, so failures are reproducible.
  const allFolders=(await snap('reparent-default-before')).split('\n').filter(l=>/AXRow \[selectable\] \[label="All Google"(?: selected)?\]/.test(l));
  expect(allFolders).toHaveLength(1);await app.click(index(allFolders[0]!));
  const allBefore=await snap('reparent-all-before');
  expect(allBefore).toContain('[label="All Google" selected]');
  const defaultFolders=allBefore.split('\n').filter(l=>/AXRow \[selectable\] \[label="Notes"(?: selected)?\]/.test(l));
  expect(defaultFolders).toHaveLength(1);await app.click(index(defaultFolders[0]!));
  const folderDiff=await app.getAXState({emit:false});
  await writeFile(join(source,'reparent-default-diff.txt'),folderDiff);
  const defaultAfter=await snap('reparent-default-after');
  const relation=(tree:string)=>{
   const lines=tree.split('\n'),matches=lines.flatMap((line,n)=>line.includes(`Note[id=${ownedId}]`)?[n]:[]);
   expect(matches).toHaveLength(1);const n=matches[0]!,line=lines[n]!,indent=line.match(/^\s*/)![0].length;
   const ancestors=lines.slice(0,n).reverse().filter(l=>/^\s*- \[\d+\]/.test(l)&&l.match(/^\s*/)![0].length<indent);
   expect(ancestors.length).toBeGreaterThan(0);return {child:index(line),parent:index(ancestors[0]!)};
  };
  const previous=relation(allBefore),current=relation(defaultAfter);
  await writeFile(join(source,'reparent-evidence.json'),JSON.stringify({identity,ownedId,previous,current,diffIncludesOwnedId:folderDiff.includes(`Note[id=${ownedId}]`),folderDiffCharacters:folderDiff.length},null,2));
  expect(defaultAfter).toContain('[label="Notes" selected]');
  expect(defaultAfter).toContain(`AXTextArea = "**${title}**\nRegular probe body."`);
  expect(previous.child).toBe(current.child);expect(previous.parent).not.toBe(current.parent);
  expect(folderDiff).toContain(`Note[id=${ownedId}]`);
  expect(folderDiff.split('\n').filter(line=>line.startsWith(`~ [${current.child}]`)&&line.includes(`Note[id=${ownedId}]`)&&line.endsWith(`[parent=${current.parent}]`))).toHaveLength(1);
 }finally{
  if(ownedId){
   const archive=join(source,'archive');await mkdir(archive);
   try{
    await exec(process.execPath,[archiveHelper,archive,ownedId,source],{cwd:dirname(dirname(archiveHelper)),timeout:70000});
    const receipt=JSON.parse(await readFile(join(archive,'artifact-cleanup.json'),'utf8'));
    expect(receipt.verified).toBe(true);expect(receipt.sameAccountMove).toBe(true);
    expect(receipt.fullStyledBodyPreserved).toBe(true);expect(receipt.defaultFolderReset).toBe(true);
    expect(receipt.safeToContinue).toBe(true);expect(receipt.ownedIds).toEqual([ownedId]);
    cleanup={...receipt,app:'Notes saved selection regression',safeToContinue:true};
   }catch(error){cleanup.error=String(error);}
  }else cleanup.safeToContinue=!creationAttempted;
  if(identity){
   try{const stopped=JSON.parse((await exec(helper,['quit',String(identity.pid),identity.bundleId,String(identity.launchedAt)],{timeout:12000})).stdout);cleanup.appExited=stopped.exited===true;cleanup.safeToContinue&&=cleanup.appExited;}
   catch(error){cleanup.safeToContinue=false;cleanup.error=String(error);}
  }
  await writeFile(join(artifacts,'notes-selection-cleanup.json'),JSON.stringify(cleanup,null,2));
  if(cleanup.safeToContinue)await rm(temporary,{recursive:true,force:true});
  expect(cleanup.safeToContinue).toBe(true);
 }
},180000);
