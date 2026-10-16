import assert from 'node:assert/strict';
import {readFile,writeFile,copyFile,mkdir,chmod} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function verifyDriverBuild(directory,pin,requestedSource){
  assert.equal(pin.source,requestedSource,'Reusable build source must match the requested driver');
  const [binary,log,identity]=await Promise.all([readFile(join(directory,'opensky-driver')),readFile(join(directory,'platform-linux-unit.log')),readFile(join(directory,'identity.json'),'utf8').then(JSON.parse)]);
  assert.equal(digest(binary),pin.binarySHA256,'Reusable driver byte hash differs');
  assert.equal(digest(log),pin.unitLogSHA256,'Original driver unit evidence differs');
  assert.equal(identity.source,pin.source,'Reusable driver identity differs');
  return {...pin,mode:'verified-immutable-build-reuse',freshDriverUnits:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [directory,requestedSource,target,receipt]=process.argv.slice(2);
  const pin=JSON.parse(await readFile(new URL('../../.github/halo-linux-driver-build.json',import.meta.url),'utf8'));
  const proof=await verifyDriverBuild(directory,pin,requestedSource);
  // No executable is installed or run before all original-source/byte proofs pass.
  await mkdir(dirname(target),{recursive:true});await mkdir(dirname(receipt),{recursive:true});
  await copyFile(join(directory,'opensky-driver'),target);await chmod(target,0o700);
  await copyFile(join(directory,'platform-linux-unit.log'),join(dirname(receipt),'platform-linux-unit.log'));
  await writeFile(receipt,JSON.stringify(proof,null,2)+'\n');
}
