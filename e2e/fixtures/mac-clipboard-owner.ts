/** Real clipboard fixture: original items/bytes remain in the private helper process. */
import {ClipboardReplies} from "./clipboard-replies.js";
import {spawn} from "node:child_process";
import {createInterface} from "node:readline";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {compileMacSwiftHelper} from "./mac-swift-compiler.js";
type Receipt={ok?:boolean;restored?:boolean;allOriginalItemsAndFormatsVerified?:boolean;markerPreserved?:boolean;newerMarkerPreserved?:boolean;copied?:boolean;insertionObserved?:boolean;payloadObservedBeforeCopy?:boolean;error?:string};
export async function withOwnedMacClipboard<T>(payload:string,rich:boolean,use:(fixture:{markerPreserved():Promise<boolean>;prepareCompetingCopy(target:{pid:number;launchedAt:number;windowId:number;path:string}):Promise<void>;copyAfterInsertion():Promise<Receipt>;newerMarkerPreserved():Promise<boolean>})=>Promise<T>):Promise<T>{
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
    const replies=new ClipboardReplies<Receipt>(line=>{worker!.stdin!.write(line);});
    createInterface({input:worker.stdout!}).on("line",line=>replies.receive(line));
    worker.stdin?.on("error",()=>replies.close(Error("Clipboard fixture write failed; contents withheld")));
    worker.on("error",()=>replies.close(Error("Clipboard fixture worker failed")));
    worker.on("close",()=>{closed=true;replies.close();});
    request=async input=>{
      const reply=await replies.request(input);
      if(!reply.ok)throw Error(reply.error??"Clipboard fixture refused; contents withheld");return reply;
    };
    const seeded=await request({op:"seed",marker:"OpenSky owned clipboard keeper marker",payload,multiple:true,rich});
    if(!seeded.markerPreserved)throw Error("Seeded clipboard items/formats were not verified");
    result=await use({
      markerPreserved:async()=>Boolean((await request!({op:"status"})).markerPreserved),
      prepareCompetingCopy:async target=>{await request!({op:"prepare_copy",...target});},
      copyAfterInsertion:async()=>{
        const receipt=await request!({op:"copy_after_insert"});
        await writeFile(join(artifacts,"competing-copy.json"),JSON.stringify(receipt,null,2));
        return receipt;
      },
      newerMarkerPreserved:async()=>Boolean((await request!({op:"status"})).newerMarkerPreserved),
    });
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
