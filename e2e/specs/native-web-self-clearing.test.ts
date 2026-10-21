import { expect } from "vitest";
import { test } from "../fixtures/sdk.js";
import { compileMacSwiftHelper } from "../fixtures/mac-swift-compiler.js";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
const exec = promisify(execFile);
type Receipt = { kind: string; received: string; value: string; focused: boolean; events: Array<{data: string; trusted: boolean}> };

test("TYPE-W02: consumed self-clearing WebKit input never recommends retrying from zero", async ({ sdk }) => {
  if (process.platform !== "darwin") throw new Error("TYPE-W02 requires an explicitly provisioned Mac desktop");
  const artifacts = await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR ?? tmpdir(), "self-clearing-web-"));
  const temporary = await mkdtemp(join(tmpdir(), "opensky-self-clearing-web-"));
  const bundle = join(temporary, "OwnedWeb.app");
  const binary = join(bundle, "Contents/MacOS/OwnedWeb");
  const output = join(artifacts, "application-state.json");
  const result: Record<string, unknown> = { inputDispatches: 0, applicationEffectsVerified: false };
  let child: ChildProcess | undefined;
  let cleanupError: unknown;
  const application = async () => JSON.parse(await readFile(output, "utf8")) as Receipt;
  try {
    await mkdir(join(bundle, "Contents/MacOS"), {recursive:true});
    await writeFile(join(bundle, "Contents/Info.plist"), `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>OwnedWeb</string><key>CFBundleIdentifier</key><string>com.opensky.fixture.web.${randomUUID()}</string><key>CFBundleName</key><string>Owned Web Input</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`);
    const compilation = await compileMacSwiftHelper(fileURLToPath(new URL("../fixtures/mac-self-clearing-web.swift", import.meta.url)), binary);
    await writeFile(join(artifacts,"compiler-setup.json"),JSON.stringify(compilation,null,2));
    await exec("/usr/bin/codesign",["--force","--sign","-",bundle]);
    child=spawn(binary,[],{env:{...process.env,OPENSKY_SELF_CLEARING_WEB_OUTPUT:output},stdio:["ignore","ignore","pipe"]});
    const launched=child; let startupError: unknown;
    launched.on("error",error=>{startupError=error;});
    let stderr=""; launched.stderr?.on("data",data=>{stderr=(stderr+String(data)).slice(-8000);});
    await expect.poll(async()=>{if(startupError)throw startupError;return (await application().catch(()=>undefined))?.kind;},{timeout:20_000}).toBe("ready");
    const before=await application();expect(before.received).toBe("");expect(before.value).toBe("");expect(before.focused).toBe(true);
    const pid=launched.pid!;
    const windows=(await sdk.driver.call("list_windows",{pid})).structured as { windows: Array<{pid:number;layer:number;window_id:number}> };
    const owned=windows.windows.filter(window=>window.pid===pid&&window.layer===0);expect(owned).toHaveLength(1);const windowId=owned[0]!.window_id;
    result.pid=pid;result.windowId=windowId;result.before=before;
    const state=(await sdk.driver.call("get_window_state",{pid,window_id:windowId,include_screenshot:true,native_row_scope:"visible"})).structured as {tree_markdown:string};
    await writeFile(join(artifacts,"before-window-state.json"),JSON.stringify(state,null,2));expect(state.tree_markdown).toContain("Receipt input");
    const text="Alpha87";result.payload=text;result.inputDispatches=1;
    let response: Record<string,unknown>|undefined, failure: unknown;
    try {response=(await sdk.driver.call("type_text",{pid,window_id:windowId,text,delivery_mode:"foreground",delay_ms:50})).structured as Record<string,unknown>;}
    catch(error) {failure=error;const details=error as {code?:string;details?:unknown};result.error={message:String(error),code:details.code,details:details.details};}
    await expect.poll(async()=>(await application()).received).toBe(text);
    const after=await application();result.after=after;expect(after.value).toBe("");expect(after.events).toHaveLength(text.length);expect(after.events.every(event=>event.trusted)).toBe(true);result.applicationEffectsVerified=true;
    const observed=(await sdk.driver.call("get_window_state",{pid,window_id:windowId,include_screenshot:true,native_row_scope:"visible"})).structured as {tree_markdown:string};
    await writeFile(join(artifacts,"after-window-state.json"),JSON.stringify(observed,null,2));expect(observed.tree_markdown).toContain(text);
    result.response=response;expect(failure).toBeUndefined();expect(response?.effect).toBe("unverifiable");
    for(const field of ["delivered_chars","retry_from_character","retryable"])expect(Object.hasOwn(response!,field)).toBe(false);
    expect(response?.verified).not.toBe(true);result.passed=true;
    await writeFile(join(artifacts,"application-stderr.txt"),stderr);
  } finally {
    try {
      if(child?.pid&&child.exitCode===null&&child.signalCode===null) {
        const command=(await exec("/bin/ps",["-p",String(child.pid),"-o","command="])).stdout.trim();
        if(command!==binary)throw new Error("Owned WebKit process identity changed; cleanup refused");
        child.kill("SIGTERM");
        const deadline=Date.now()+8000;
        while(child.exitCode===null&&child.signalCode===null&&Date.now()<deadline)await delay(50);
        if(child.exitCode===null&&child.signalCode===null)throw new Error("Owned WebKit process did not exit");
      }
      await rm(temporary,{recursive:true});result.ownedProcessExited=true;result.ownedBundleRemoved=true;
    } catch(error) {cleanupError=error;result.cleanupError=String(error);}
    await writeFile(join(artifacts,"acceptance.json"),JSON.stringify(result,null,2));
    if(cleanupError)throw cleanupError;
  }
},60_000);
