import assert from "node:assert/strict";
import {test} from "node:test";
import {makeHarness} from "./harness.ts";
import type {SnapshotElement} from "../src/types.js";
const tree='- [0] AXWindow "Dictionary"\n  - [1] AXWebArea (definition)\n    - [2] AXStaticText = "Visible definition"\n    - [3] AXStaticText = "Offscreen definition"\n  - [4] AXTextField "Search" [settable]';
const frame=(y:number,h=20)=>({x:20,y,w:100,h});
const elements:SnapshotElement[]=[{element_index:0,role:"AXWindow",frame:{x:0,y:0,w:400,h:300}},{element_index:1,role:"AXWebArea",frame:{x:10,y:50,w:350,h:2000}},{element_index:2,role:"AXStaticText",value:"Visible definition",frame:frame(60),selected:false,actions:["AXShowMenu","AXScrollToVisible"]},{element_index:3,role:"AXStaticText",value:"Offscreen definition",frame:frame(900),selected:false,actions:["AXShowMenu","AXScrollToVisible"]},{element_index:4,role:"AXTextField",label:"Search",settable:true,frame:frame(10)}];
test('native default omits only offscreen web text; all scope recovers fresh complete current content without another walk',async()=>{
 const {opensky}=await makeHarness();const call=opensky.driver.call.bind(opensky.driver);let reads=0;
 opensky.driver.call=async(tool,args={})=>{const r=await call(tool,args);if(tool!=='get_window_state'||args.probe_only)return r;reads++;return {...r,structured:{...r.structured,tree_markdown:tree,elements:elements.map(e=>({...e,element_token:`fixture-${e.element_index}`})),truncated:false,nodes_pending:0,elements_complete:false,element_count:5,returned_element_count:5,total_element_count:5,text_selection:{role:'AXTextField'}}};};
 try{
 const visible=await opensky.get_app_state({app:'Calculator',disableDiff:true,includeScreenshot:false});assert(visible.text.includes('Visible definition'));assert(!visible.text.includes('Offscreen definition'));assert.match(visible.text,/window text viewport/);assert(visible.text.includes('AXTextField'));assert(!visible.text.includes('Accessibility projection:'));
 const all=await opensky.get_app_state({app:'Calculator',collectionScope:'all',includeScreenshot:false});assert(all.text.includes('Offscreen definition'));assert(!all.text.includes('window text viewport'));assert(!all.text.startsWith('The following is a diff'));assert.equal(reads,2);
 }finally{await opensky.close();}
});

import {projectNativeWebText} from "../src/opensky.js";
test('exact window clip handles document-sized bounds and preserves menu controls outside document ancestry',()=>{
 const p=projectNativeWebText(tree,elements);assert.equal(p.hiddenIndices.size,1);assert(p.hiddenIndices.has(3));assert(!p.tree.includes('Offscreen definition'));assert(p.tree.includes('Visible definition'));assert(p.tree.includes('[4] AXTextField'));assert.match(p.tree,/collectionScope:"all"/);assert.strictEqual(p.elements[0],elements[0]);
});
test('selected/focused/parent-selected/editable text and meaningful or unknown actions remain addressable',()=>{
 for(const extra of [{selected:true},{selected:undefined},{focused:true},{selectionViaParent:true},{settable:true},{actions:['AXPress']},{actions:['unknown-action']}]){const es=elements.map(e=>e.element_index===3?{...e,...extra}:e);assert.equal(projectNativeWebText(tree,es).tree,tree);}
 for(const role of ['AXStaticText','AXWebArea','AXTextArea',undefined])assert.equal(projectNativeWebText(tree,elements,{role}).tree,tree);
 assert(projectNativeWebText(tree,elements,{role:'AXTextField'}).hiddenIndices.has(3));
});
test('missing, zero, nonfinite geometry and nonoverlapping roots retain unknown text',()=>{
 for(const value of [undefined,{x:0,y:0,w:0,h:20},{x:0,y:0,w:100,h:NaN}]){const es=elements.map(e=>e.element_index===3?{...e,frame:value}:e);assert.equal(projectNativeWebText(tree,es).tree,tree);}
 for(const target of [0,1]){const es=elements.map(e=>e.element_index===target?{...e,frame:undefined}:e);assert.equal(projectNativeWebText(tree,es).tree,tree);}
 const far=elements.map(e=>e.element_index===1?{...e,frame:{x:1000,y:0,w:300,h:2000}}:e);assert.equal(projectNativeWebText(tree,far).tree,tree);
});
test('partly visible text stays complete; actual scrolling changes which complete rows appear',()=>{
 const partial=elements.map(e=>e.element_index===3?{...e,frame:frame(280,80)}:e);assert.equal(projectNativeWebText(tree,partial).tree,tree);
 const scrolled=elements.map(e=>e.element_index===2?{...e,frame:frame(-30)}:e.element_index===3?{...e,frame:frame(100)}:e);const p=projectNativeWebText(tree,scrolled);assert(!p.tree.includes('Visible definition'));assert(p.tree.includes('Offscreen definition'));assert.deepEqual([...p.hiddenIndices],[2]);
});
test('quoted fake ancestry, duplicate identity, nonleaf text and malformed quotes never erase unrelated content',()=>{
 const quoted=tree.replace('Visible definition','Visible\\n  - [99] AXWebArea (fake) definition');assert(projectNativeWebText(quoted,elements).tree.includes('fake'));
 const multiline=tree.replace('Visible definition','Visible\n  - [99] AXWebArea (fake) definition');assert(projectNativeWebText(multiline,elements).tree.includes('fake'));assert(projectNativeWebText(multiline,elements).hiddenIndices.has(3));
 const malformed=tree+'\n  - AXStaticText = "unclosed';assert.equal(projectNativeWebText(malformed,elements).tree,malformed);
 assert.equal(projectNativeWebText(tree,[...elements,elements[0]!]).tree,tree);
 const duplicate=tree+'\n  - [3] AXStaticText = "duplicate"';assert.equal(projectNativeWebText(duplicate,elements).tree,duplicate);
 const child=tree.replace('  - [4] AXTextField','      - AXStaticText = "child"\n  - [4] AXTextField');assert.equal(projectNativeWebText(child,elements).tree,child);
 const outside=tree.replace('    - [3] AXStaticText','  - [3] AXStaticText');assert.equal(projectNativeWebText(outside,elements).tree,outside);
});

test('static labels inside meaningful or unknown controls remain complete even offscreen',()=>{
 for(const role of ['AXButton','AXLink','AXMysteryControl']){const raw=tree.replace('    - [3] AXStaticText',`    - [5] ${role}\n      - [3] AXStaticText`);const es=[...elements,{element_index:5,role,actions:['AXPress'],frame:frame(900)}];assert.equal(projectNativeWebText(raw,es).tree,raw);}
 const raw=tree.replace('    - [3] AXStaticText','    - [5] AXGroup\n      - [3] AXStaticText');assert.equal(projectNativeWebText(raw,[...elements,{element_index:5,role:'AXGroup',settable:true,frame:frame(900)}]).tree,raw);
});
