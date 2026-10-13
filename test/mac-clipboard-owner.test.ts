import {test} from "node:test";
import assert from "node:assert/strict";
import {ClipboardReplies} from "../e2e/fixtures/clipboard-replies.js";

test("a late timed-out clipboard reply cannot satisfy original-board restoration",async()=>{
  const writes:string[]=[];
  const channel=new ClipboardReplies<{restored?:boolean;markerPreserved?:boolean}>(line=>writes.push(line),20);
  await assert.rejects(channel.request({op:"status"}),/timed out/);
  const restore=channel.request({op:"restore"});
  let settled=false;void restore.then(()=>{settled=true;});
  channel.receive(JSON.stringify({markerPreserved:true}));
  await Promise.resolve();assert.equal(settled,false);
  channel.receive(JSON.stringify({restored:true}));
  assert.deepEqual(await restore,{restored:true});
  assert.deepEqual(writes.map(line=>JSON.parse(line).op),["status","restore"]);
  channel.close();
});
test("worker exit rejects every pending clipboard receipt and future requests",async()=>{
  const channel=new ClipboardReplies(()=>{},1000);
  const seed=assert.rejects(channel.request({op:"seed"}),/exited/);
  const restore=assert.rejects(channel.request({op:"restore"}),/exited/);
  channel.close();await Promise.all([seed,restore]);
  await assert.rejects(channel.request({op:"restore"}),/closed/);
});
test("invalid helper output and failed writes cannot become successful cleanup",async()=>{
  const channel=new ClipboardReplies(()=>{},1000);
  const result=assert.rejects(channel.request({op:"restore"}),/Invalid/);
  channel.receive("withheld invalid response");await result;channel.close();
  const failed=new ClipboardReplies(()=>{throw Error("private data");});
  await assert.rejects(failed.request({op:"restore"}),/write failed; contents withheld/);
  await assert.rejects(failed.request({op:"restore"}),/closed/);
});
