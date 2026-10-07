/** Real clipboard fixture: original items/bytes remain in the private helper process. */
import {spawn} from "node:child_process";
import {createInterface} from "node:readline";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {compileMacSwiftHelper} from "./mac-swift-compiler.js";
type Receipt={ok?:boolean;restored?:boolean;allOriginalItemsAndFormatsVerified?:boolean;markerPreserved?:boolean;error?:string};
export async function withOwnedMacClipboard<T>(payload:string,rich:boolean,use:(fixture:{markerPreserved():Promise<boolean>})=>Promise<T>):Promise<T>{
  if(process.platform!=="darwin"||process.env.CUA_TEST_ALLOW_CLIPBOARD!=="1")throw Error("Real clipboard fixture requires Mac and explicit CUA_TEST_ALLOW_CLIPBOARD=1");
  const artifacts=await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR??tmpdir(),"mac-clipboard-"));
  const temporary=await mkdtemp(join(tmpdir(),"opensky-clipboard-owner-"));
  const helper=join(temporary,"clipboard-owner"),receiptPath=join(artifacts,"cleanup.json");
  let worker:ReturnType<typeof spawn>|undefined,closed=false,restoration:Receipt|undefined,actionError:unknown,cleanupError:unknown,result:T|undefined;
  await writeFile(receiptPath,JSON.stringify({app:"Owned Mac clipboard fixture",status:"pending",safeToContinue:false,originalDataLogged:false}));
  let request:((input:Record<string,unknown>)=>Promise<Receipt>)|undefined;
  try{
    await writeFile(join(artifacts,"compiler.json"),JSON.stringify(await compileMacSwiftHelper(fileURLToPath(new URL("./mac-clipboard-owner.swift",import.meta.url)),helper),null,2));
    worker=spawn(helper,[],{stdio:["pipe","pipe","pipe"]});
    worker.stderr?.resume();
    const pending:Array<{resolve:(value:Receipt)=>void;reject:(error:Error)=>void}>=[];
    createInterface({input:worker.stdout!}).on("line",line=>{const waiter=pending.shift();try{waiter?.resolve(JSON.parse(line));}catch{waiter?.reject(Error("Invalid clipboard fixture response; contents withheld"));}});
    worker.on("error",()=>{for(const waiter of pending.splice(0))waiter.reject(Error("Clipboard fixture worker failed"));});
    worker.on("close",()=>{closed=true;for(const waiter of pending.splice(0))waiter.reject(Error("Clipboard fixture worker exited"));});
    request=async(input)=>{
      if(closed)throw Error("Clipboard fixture worker is closed");
      const reply=await new Promise<Receipt>((resolve,reject)=>{pending.push({resolve,reject});worker!.stdin!.write(JSON.stringify(input)+"\n");});
      if(!reply.ok)throw Error(reply.error??"Clipboard fixture refused; contents withheld");return reply;
    };
    const seeded=await request({op:"seed",marker:"OpenSky owned clipboard keeper marker",payload,multiple:true,rich});
    if(!seeded.markerPreserved)throw Error("Seeded clipboard items/formats were not verified");
    result=await use({markerPreserved:async()=>Boolean((await request!({op:"status"})).markerPreserved)});
  }catch(error){actionError=error;}
  finally{
    try{
      if(request)restoration=await request({op:"restore"});
      worker?.stdin?.end();
      if(worker&&!closed)await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error("Clipboard fixture did not exit")),5000);worker!.once("close",()=>{clearTimeout(timeout);resolve();});});
      if(worker&&(!restoration?.restored||!restoration.allOriginalItemsAndFormatsVerified||!closed))throw Error("Original clipboard cleanup not verified; contents withheld");
      await rm(temporary,{recursive:true,force:true});
    }catch(error){cleanupError=error;worker?.stdin?.end();}
    await writeFile(receiptPath,JSON.stringify({app:"Owned Mac clipboard fixture",status:cleanupError?"failed":"passed",safeToContinue:!cleanupError,originalDataLogged:false,originalItemsAndFormatsRestored:restoration?.allOriginalItemsAndFormatsVerified??false,workerExited:closed,temporaryRemoved:!cleanupError,error:cleanupError?String(cleanupError):undefined},null,2));
  }
  if(actionError&&cleanupError)throw new AggregateError([actionError,cleanupError],"Paste owner and private clipboard cleanup failed");
  if(actionError)throw actionError;if(cleanupError)throw cleanupError;return result as T;
}
