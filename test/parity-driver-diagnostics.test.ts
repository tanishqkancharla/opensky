import test from "node:test";
import assert from "node:assert/strict";
import { DriverDiagnostics } from "../evals/parity/driver-diagnostics.js";
function observe(d: DriverDiagnostics, pid = 9, window_id = 22, id = "s1", token = "s1:7", extra = {}) {
 d.end(d.begin("get_window_state", { pid, window_id }), { structured: { pid, window_id, snapshot_id: id, elements: [{ element_index: 7, element_token: token, role: "AXButton", identifier: "NewTabButton", native_object_id: "object7", actions: [], frame: {x: 10,y: 20,w: 30,h: 40}, label: "private", value: "private", ...extra }] } });
}
test("token lineage preserves helper index despite public index remap, and never asserts effect", () => {
 const d = new DriverDiagnostics();d.setCell("rpc-8");observe(d);
 const start = d.begin("click", {pid:9,window_id:22,element_index:23,element_token:"s1:7",snapshot_id:"s1",action:"press",text:"secret"});
 d.end(start,{ structured:{route:"accessibility",effect:"unverifiable",delivery:{mode:"foreground",secret:"private"},tree_markdown:"private"}});
 const c = d.artifact().calls.at(-1)!;assert.equal(c.cell,"rpc-8");assert.equal((c.target as any).element_index,23);assert.equal((c.binding as any).element.element_index,7);assert.equal((c.binding as any).status,"matched");assert.equal((c.outcome as any).effect,"unverifiable");assert.ok(!JSON.stringify(d.artifact()).includes("private"));assert.ok(!JSON.stringify(d.artifact()).includes("secret"));
});
test("same token in a different PID/window or snapshot cannot supply authority; probes preserve full observation", () => {
 const d = new DriverDiagnostics();observe(d);
 const args={pid:9,window_id:22,element_token:"s1:7",snapshot_id:"s1"};
 assert.equal((d.begin("click",{...args,pid:10}).binding as any).status,"no_exact_window_snapshot");
 assert.equal((d.begin("click",{...args,window_id:23}).binding as any).status,"no_exact_window_snapshot");
 assert.equal((d.begin("click",{...args,snapshot_id:"s2"}).binding as any).status,"snapshot_mismatch");
 d.end(d.begin("get_window_state",args),{structured:{pid:9,window_id:22,probe_only:true}});
 assert.equal((d.begin("click",args).binding as any).status,"matched");
 observe(d,9,22,"s2","s2:7");assert.equal((d.begin("click",{...args,snapshot_id:"s2"}).binding as any).status,"token_not_in_latest_snapshot");
});
test("bounded retention reports missing evidence explicitly and preserves outcome errors", () => {
 const d = new DriverDiagnostics(2,1,1);observe(d);observe(d,9,23,"s2","s2:8");
 const start=d.begin("click",{pid:9,window_id:22,element_token:"s1:7"});assert.equal((start.binding as any).status,"no_exact_window_snapshot");
 const e=Object.assign(new Error("private"),{code:"ax_action_outcome_unknown",details:{ax_error:-25204}});
 d.end(start,undefined,e);assert.equal(d.artifact().dropped,1);assert.equal(d.artifact().calls.length,2);
 const e2=new DriverDiagnostics();e2.end(e2.begin("click",{}),undefined,e);assert.equal((e2.calls[0].error as any).code,"ax_action_outcome_unknown");assert.equal((e2.calls[0].binding as any).status,"no_element_token");assert.ok(!JSON.stringify(e2.artifact()).includes("private"));
});

test("structured uncertain outcome is retained without guessing codes or copying private errors", () => {
 const d=new DriverDiagnostics();
 const error=Object.assign(new Error("private error body"),{details:{path:"ax",effect:"unknown",dispatch_attempted:true,verified:false,retry:"observe_before_deciding", ax_error:{private:"private"}, delivery:{mode:"foreground",private:"private"},tree:"private",text:"private"}});
 d.end(d.begin("click",{}),undefined,error);
 const e=d.calls[0].error as any;assert.equal(e.code,undefined);assert.equal(e.axError,undefined);
 assert.deepEqual(e.outcome,{path:"ax",route:undefined,effect:"unknown",retry:"observe_before_deciding",verified:false,dispatchAttempted:true,deliveryMode:"foreground"});
 assert.ok(!JSON.stringify(d.artifact()).includes("private"));
});

test("capture recovery records finite counts and depth/budget without UI or private error bodies", () => {
 const d=new DriverDiagnostics();
 const start=d.begin("get_window_state",{pid:9,window_id:22,max_depth:3,timeout_ms:5000,include_accessibility_tree:true,text:"private"});
 d.end(start,{structured:{probe_only:true,window_matched:true,truncated:true,truncation_reason:"timeout",degraded:false,elements_complete:false,nodes_pending:17,nodes_visited:83,returned_element_count:83,total_element_count:100,element_count:Infinity,degraded_reason:"private error body",tree_markdown:"private",text:"private",value:"private"}});
 const c=d.calls[0];assert.deepEqual(c.target,{pid:9,window_id:22,max_depth:3,timeout_ms:5000,include_accessibility_tree:true});
 const o=c.outcome as any;assert.equal(o.probe_only,true);assert.equal(o.window_matched,true);assert.equal(o.truncated,true);assert.equal(o.truncation_reason,"timeout");assert.equal(o.nodes_pending,17);assert.equal(o.returned_element_count,83);assert.equal(o.total_element_count,100);assert.equal(o.element_count,undefined);assert.equal(o.degraded_reason,undefined);
 assert.ok(!JSON.stringify(d.artifact()).includes("private"));
});
