import {test} from "node:test";
import assert from "node:assert/strict";
import {projectNativeCollectionRows} from "../src/native-collection-viewport.js";
import type {SnapshotElement} from "../src/types.js";
const tree = '- AXWindow "Notes"\n  - AXTable (My Notes as List)\n    - [1] AXRow [selected]\n      - [2] AXCell\n        - AXStaticText = "Visible note"\n    - [3] AXRow\n      - [4] AXCell\n        - AXStaticText = "Offscreen note"\n    - [5] AXRow\n      - [6] AXCell\n        - AXStaticText = "Selected offscreen note"\n    - [7] AXScrollBar\n  - [8] AXTextArea = "Complete editor body"';
const elements:SnapshotElement[] = Array.from({length:8},(_,i)=>({element_index:i+1,role:[1,3,5].includes(i+1)?"AXRow":"AXCell",element_token:`token-${i+1}`}));
const scope={source:"AXVisibleRows",web_content:false,role:"AXTable",depth:1,row_element_indices:[1,3,5],visible_row_element_indices:[1],selected_row_element_indices:[5]};
test('attested viewport omits offscreen row subtrees while preserving selected state, non-row controls and exact tokens',()=>{
 const p=projectNativeCollectionRows(tree,elements,[scope]);
 assert(!p.tree.includes('"Offscreen note"'));assert(p.tree.includes('"Selected offscreen note"'));
 assert(p.tree.includes('[7] AXScrollBar'));assert(p.tree.includes('Complete editor body'));
 assert.match(p.tree,/1 visible of 3 loaded rows; 1 offscreen rows omitted; offscreen selection retained/);
 assert.match(p.tree,/collectionScope:"all"/);assert.deepEqual([...p.hiddenIndices],[3,4]);
 assert.deepEqual(p.elements.map(e=>e.element_index),[1,2,5,6,7,8]);assert.strictEqual(p.elements[0],elements[0]);
});
test('missing, unsupported, malformed, duplicate and stale membership retains full evidence',()=>{
 for(const value of [undefined,[],[{}],[{...scope,web_content:true}],[{...scope,source:"guessed"}],[{...scope,visible_row_element_indices:[99]}],[{...scope,row_element_indices:[1,1,5]}],[{...scope,selected_row_element_indices:[99]}],[{...scope,visible_row_element_indices:[1.5]}],[{...scope,row_element_indices:[1,3],selected_row_element_indices:[]}]]){
  const p=projectNativeCollectionRows(tree,elements,value);assert.equal(p.tree,tree);assert.deepEqual(p.elements,elements);assert.equal(p.hiddenIndices.size,0);
 }
});
test('a full visible set preserves unaltered complete loaded rows',()=>{
 const p=projectNativeCollectionRows(tree,elements,[{...scope,visible_row_element_indices:[1,3,5]}]);assert.equal(p.tree,tree);assert.deepEqual(p.elements,elements);
});
test('empty authoritative viewport still preserves selected rows and provides honest recovery guidance',()=>{
 const p=projectNativeCollectionRows(tree,elements,[{...scope,visible_row_element_indices:[]}]);assert(!p.tree.includes('Visible note'));assert(p.tree.includes('Selected offscreen note'));assert.match(p.tree,/0 visible of 3 loaded rows; 2 offscreen rows omitted/);
});
test('inconsistent source order, row roles, duplicated indices and physical parent boundaries refuse projection',()=>{
 assert.equal(projectNativeCollectionRows(tree,elements,[{...scope,row_element_indices:[3,1,5]}]).tree,tree);
 assert.equal(projectNativeCollectionRows(tree,elements.filter(e=>e.element_index!==3),[scope]).tree,tree);
 assert.equal(projectNativeCollectionRows(tree,[...elements,elements[0]],[scope]).tree,tree);
 const changed=tree.replace('    - [5] AXRow','  - AXTable (Other)\n    - [5] AXRow');assert.equal(projectNativeCollectionRows(changed,elements,[scope]).tree,changed);
});

test('multiline native action descriptions remain inside their row and never become a parent boundary',()=>{
 const raw=tree.replace('[1] AXRow [selected]','[1] AXRow [actions=[name:trash\ntarget:0x0\nselector:(null)]] [selected]').replace('[3] AXRow','[3] AXRow [actions=[name:trash\ntarget:0x0\nselector:(null)]]');
 const p=projectNativeCollectionRows(raw,elements,[scope]);assert.match(p.tree,/collection viewport/);assert(!p.tree.includes('Offscreen note'));assert(p.tree.includes('Selected offscreen note'));assert(p.tree.includes('Complete editor body'));
});

import {makeHarness} from './harness.ts';
test('viewport projection does not trigger incomplete-walk recollection, and all scope returns a full fresh loaded view',async()=>{
 const {opensky}=await makeHarness();const original=opensky.driver.call.bind(opensky.driver);const depths:unknown[]=[];
 opensky.driver.call=async(tool,args={})=>{const r=await original(tool,args);if(tool!=='get_window_state'||args.probe_only)return r;
 depths.push(args.max_depth);return {...r,structured:{...r.structured,tree_markdown:tree,elements:elements.map(e=>({...e,element_token:'fixture-'+e.element_index})),native_collections:[scope],element_count:8,total_element_count:8,returned_element_count:8,elements_complete:false,truncated:false,nodes_pending:0}};};
 try {
 const visible=await opensky.get_app_state({app:'Calculator',disableDiff:true,includeScreenshot:false});
 assert.match(visible.text,/collection viewport/);assert(!visible.text.includes('Offscreen note'));assert(!visible.text.includes('Accessibility projection:'));
 const all=await opensky.get_app_state({app:'Calculator',collectionScope:'all',includeScreenshot:false});
 assert(all.text.includes('Offscreen note'));assert(!all.text.includes('collection viewport'));assert(!all.text.startsWith('The following is a diff'));
 assert.deepEqual(depths,[undefined,undefined]);
 } finally {await opensky.close();}
});
