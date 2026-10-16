import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';import {test} from 'node:test';
import {verifyDriverBuild} from '../e2e/halo/verify-driver-build.mjs';
test('immutable driver reuse rejects changed bytes, unit evidence, identity or requested source',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'halo-driver-proof-'));const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
 const pin={source:'driver-source',binarySHA256:hash('known binary'),unitLogSHA256:hash('original unit evidence')};
 const reset=async()=>{await writeFile(join(dir,'opensky-driver'),'known binary');await writeFile(join(dir,'platform-linux-unit.log'),'original unit evidence');await writeFile(join(dir,'identity.json'),JSON.stringify({source:pin.source}));};
 try{
  await reset();assert.equal((await verifyDriverBuild(dir,pin,pin.source)).freshDriverUnits,false);
  await assert.rejects(verifyDriverBuild(dir,pin,'different-source'),/requested driver/);
  for(const [file,value,error]of [['opensky-driver','changed binary',/byte hash/],['platform-linux-unit.log','changed unit evidence',/unit evidence/],['identity.json','{"source":"wrong"}',/identity differs/]]as const){await reset();await writeFile(join(dir,file),value);await assert.rejects(verifyDriverBuild(dir,pin,pin.source),error);}
 }finally{await rm(dir,{recursive:true,force:true});}
});
