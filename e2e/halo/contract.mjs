import assert from "node:assert/strict";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { DesktopActionQueue, CuaDriverClient, createOpenSky, createCua } from "../../dist/index.js";
const out = process.env.HALO_ARTIFACTS;
const evidence = { sdk: process.env.GITHUB_SHA, driver: process.env.HALO_DRIVER_REF, node: process.version, wholeNode22Suite: process.env.HALO_NODE22_WHOLE_OUTCOME, results: [] };
const state = async () => JSON.parse(await readFile(join(out, "editor-state.json"), "utf8"));
const poll = async (predicate, timeout = 10000) => {
  const deadline = Date.now() + timeout; do { try { if (await predicate()) return; } catch (error) { if (error.code !== "ENOENT") throw error; } await sleep(50); } while (Date.now() < deadline);
  throw new Error("Application postcondition did not become true");
};
// Refusal checks need a sample taken after the request, not unchanged stale JSON.
const freshState = async () => {
  const sequence=(await state()).sampleSequence;assert.ok(Number.isInteger(sequence));
  let observed;await poll(async()=>{observed=await state();return observed.sampleSequence>sequence;});return observed;
};
const record = (name, details) => evidence.results.push({ name, ...details });
const driver = new CuaDriverClient({ binaryPath: process.env.OPENSKY_DRIVER_PATH, socket: process.env.HALO_DRIVER_SOCKET, session: "halo-contract", autoStart: false, timeoutMs: null });
const sdk = createOpenSky({ driver, target: "linux", homeDir: join(out, "sdk-home"), screenshotDir: join(out, "screenshots"), autoLaunch: false, settleDelayMs: 0 });
const cua = createCua(sdk, { emit: () => undefined }); const queue = new DesktopActionQueue();
const browserDriver = new CuaDriverClient({ binaryPath: process.env.OPENSKY_DRIVER_PATH, socket: process.env.HALO_BROWSER_SOCKET, session: "halo-browser-contract", autoStart: false, timeoutMs: null });
const browserPreparations=[];
const processStart=stat=>stat.slice(stat.lastIndexOf(")")+2).trim().split(/\s+/)[19];
const browserCall=browserDriver.call.bind(browserDriver);
browserDriver.call=async(tool,args={})=>{
  const result=await browserCall(tool,args);
  if(tool==="browser_prepare"&&result.structured?.prepared===true){
    const pid=Number(result.structured.prepared_pid);assert.ok(Number.isSafeInteger(pid)&&pid>0);
    const receipt={session:args.session,prepared:result.structured,startTimeTicks:processStart(await readFile(`/proc/${pid}/stat`,"utf8"))};
    browserPreparations.push(receipt);await writeFile(join(out,"browser-prepare-receipts.json"),JSON.stringify(browserPreparations,null,2));
  }
  return result;
};
const browserSdk = createOpenSky({ driver: browserDriver, target: "linux", homeDir: join(out, "browser-sdk-home"), screenshotDir: join(out, "browser-screenshots"), autoLaunch: false, settleDelayMs: 0 });
const browserCua = createCua(browserSdk, { emit: () => undefined });
let tab, browser = { clicks: 0, scrollY: 0, focused: false, trusted: false };
const page = `<!doctype html><title>Halo Browser Contract</title><style>body{height:4000px;margin:0}button{position:absolute;left:40px;top:40px;width:180px;height:80px}</style><button>Count trusted click</button><script>
let clicks=0; function report(trusted=false){fetch('/report',{method:'POST',body:JSON.stringify({clicks,scrollY:scrollY,focused:document.hasFocus(),trusted})})}
document.querySelector('button').onclick=e=>{clicks++;report(e.isTrusted)}; addEventListener('scroll',()=>report()); addEventListener('focus',()=>report()); report();</script>`;
const server = createServer(async (req, res) => { if (req.url === "/report") { let text = ""; for await (const chunk of req) text += chunk; browser = JSON.parse(text); await writeFile(join(out, "browser-state.json"), text); res.end("ok"); } else { res.setHeader("content-type", "text/html"); res.end(page); } });
await new Promise(resolve => server.listen(8123, "127.0.0.1", resolve));
try {
  assert.equal(JSON.parse(await readFile(join(out, "identity.json"), "utf8")).source, process.env.HALO_DRIVER_REF);
  await poll(async () => (await driver.status()).running && (await browserDriver.status()).running);
  await driver.call("start_session", { session: "halo-contract" });
  await browserDriver.call("start_session", { session: "halo-browser-contract" });
  const apps = await sdk.list_apps(); await writeFile(join(out, "apps.json"), JSON.stringify(apps, null, 2));
  const inventory = (await driver.call("list_apps")).structured;
  const nativeApps = Array.isArray(inventory) ? inventory : inventory.apps;
  await writeFile(join(out, "native-process-inventory.json"), JSON.stringify(nativeApps, null, 2));
  const native = nativeApps.find(app => app.pid === Number(process.env.HALO_EDITOR_PID)); assert.ok(native, "GTK editor was discovered");
  const app = await cua.getApp(native.name);
  const beforeAX = await app.getAXState({ disableDiffing: true, emit: false });
  await writeFile(join(out, "editor-before.ax.txt"), beforeAX);
  assert.match(beforeAX, /replace me/, "real AT-SPI snapshot exposes editor contents");
  await queue.submit(() => driver.call("hotkey", { scope: "desktop", keys: ["ctrl", "a"] })).wait();
  await poll(async () => (await state()).selected === "replace me" && (await state()).clipboard === "preserved clipboard sentinel Ελληνικά");
  const before = await state(); const capability = await sdk.get_capabilities();
  assert.equal(capability.nativePaste.availability, "supported");
  assert.equal(capability.nativePaste.clipboard, "payload-left");
  assert.deepEqual(capability.nativePaste.formats, ["text"]);
  const exact = {pid:Number(process.env.HALO_EDITOR_PID),window_id:Number(process.env.HALO_EDITOR_WINDOW),text:"must not paste",format:"text",clipboard_policy:"leave"};
  await assert.rejects(queue.submit(()=>driver.call("native_paste",{...exact,delivery_mode:"background"})).wait(),{code:"foreground_required"});
  const nativeOnly = process.env.HALO_NATIVE_CONTRACT_ONLY === "1";
  // Native-only mode grants this operation/target without clipboard access.
  // Full mode keeps the separate browser-only domain: tool admission refuses
  // native input before any clipboard or platform operation can begin.
  const deniedNativeTool = queue.submit(()=>browserDriver.call("native_paste",{...exact,delivery_mode:"foreground"}));
  await assert.rejects(deniedNativeTool.wait(), nativeOnly
    ? {code:"bounded_resource_outside_manifest"}
    : error => {
      assert.equal(error.code,"permission_denied");
      assert.equal(error.details.delivery,"not_dispatched");
      assert.equal(error.message,"Permission denied: tool 'native_paste' is outside the capability manifest");
      return true;
    });
  assert.equal(deniedNativeTool.query().state,"failed");
  await queue.drain();
  // Write access never implies permission to expose existing clipboard text.
  await assert.rejects(queue.submit(()=>driver.call("clipboard_read",{include_text:true})).wait(),{code:"bounded_resource_outside_manifest"});
  const refused=await freshState();assert.equal(refused.text,before.text);assert.equal(refused.selected,before.selected);assert.equal(refused.clipboard,before.clipboard);
  record("native-paste-preinput-refusals",{before,after:refused,missingForeground:true,missingClipboardGrant:nativeOnly,browserDomainNativeToolDenied:!nativeOnly,nativeToolRefusal:deniedNativeTool.query(),writeDoesNotGrantRead:true});
  const pasteCalls=[];const originalSDKCall=sdk.driver.call.bind(sdk.driver);
  sdk.driver.call=async(tool,args={})=>{
    try {const result=await originalSDKCall(tool,args);if(tool==="native_paste")pasteCalls.push({tool,args,structured:result.structured});return result;}
    catch(error){if(tool==="native_paste")pasteCalls.push({tool,args,error:{code:error.code,details:error.details}});throw error;}
  };
  for(const [index,payload] of ["ASCII replacement\nsecond line","Café Ελληνικά 中文 🙂\nsecond line"].entries()) {
    const initial=await state();await queue.submit(()=>driver.call("hotkey",{scope:"desktop",keys:["ctrl","a"]})).wait();
    await poll(async()=>(await state()).selected===initial.text);
    await queue.submit(()=>app.paste(payload)).wait();await poll(async()=>(await state()).text===payload);
    await queue.submit(()=>driver.call("hotkey",{scope:"desktop",keys:["ctrl","s"]})).wait();
    await poll(async()=>(await readFile(join(out,"saved.txt"),"utf8"))===payload);
    const after=await state();assert.equal(after.clipboard,payload);assert.equal(after.selected,"");
    const call=pasteCalls.at(-1);assert.equal(call.args.pid,exact.pid);assert.equal(call.args.window_id,exact.window_id);
    assert.equal(call.args.delivery_mode,"foreground");assert.equal(call.args.clipboard_policy,"leave");
    assert.equal(call.structured.target_value_verified,true);assert.equal(call.structured.transfer_verified,false);
    await writeFile(join(out,`paste-${index}-saved.txt`),payload);
    record("native-paste-insertion",{initial,payload,after,saved:payload,driverReceipt:call.structured});
  }
  await writeFile(join(out,"request-partial-paste"),"private app prefix limit");
  const partialPayload="partial application result Ω";
  await queue.submit(()=>driver.call("hotkey",{scope:"desktop",keys:["ctrl","a"]})).wait();
  const pasteStop=new AbortController();
  const uncertainAction=queue.submit(()=>app.paste(partialPayload),{signal:pasteStop.signal});
  await assert.rejects(uncertainAction.wait({timeoutMs:500}),{code:"desktop_wait_timeout"});
  pasteStop.abort();const pasteAtDeadline={action:uncertainAction.query(),application:await freshState()};
  assert.equal(pasteAtDeadline.action.state,"active");
  await assert.rejects(uncertainAction.wait(),{code:"native_paste_unverified"});
  await poll(async()=>(await state()).text==="par");const partialPaste=await state();
  assert.equal(partialPaste.clipboard,partialPayload);assert.equal(pasteCalls.length,3,"two successes and one uncertain input; no replay");
  const uncertain=pasteCalls.at(-1).error;assert.equal(uncertain.details.effect,"unknown");
  assert.equal(uncertain.details.input_dispatched,true);assert.equal(uncertain.details.clipboard_may_have_changed,true);
  await queue.submit(()=>driver.call("hotkey",{scope:"desktop",keys:["ctrl","s"]})).wait();
  await poll(async()=>(await readFile(join(out,"saved.txt"),"utf8"))==="par");
  await writeFile(join(out,"paste-partial-saved.txt"),await readFile(join(out,"saved.txt")));
  record("native-paste-partial",{payload:partialPayload,after:partialPaste,saved:"par",error:uncertain,pasteAtDeadline,oneDispatch:true});
  const {unlink}=await import("node:fs/promises");await unlink(join(out,"request-partial-paste"));
  await writeFile(join(out,"native-paste-calls.json"),JSON.stringify(pasteCalls,null,2));
  // Preserve the original long-Unicode cancellation/completion owner: replace
  // the known current buffer, then verify queued input cancellation and drain.
  await queue.submit(()=>driver.call("hotkey",{scope:"desktop",keys:["ctrl","a"]})).wait();
  await poll(async()=>(await state()).selected==="par");
  const text = "éΩ中🙂".repeat(250); assert.equal([...text].length, 1000);
  const stop = new AbortController();
  const active = queue.submit(() => driver.call("type_text", { scope: "desktop", text }), { signal: stop.signal });
  await poll(async () => active.query().state === "active");
  const cancelled = queue.submit(() => driver.call("type_text", { scope: "desktop", text: "MUST-NOT-APPEAR" }));
  cancelled.cancel(); await assert.rejects(cancelled.wait(), { code: "desktop_action_cancelled" });
  await assert.rejects(active.wait({ timeoutMs: 500 }), { code: "desktop_wait_timeout" }); stop.abort();
  const partial = await state(); const atDeadline = active.query(); assert.equal(atDeadline.state, "active"); assert.ok([...partial.text].length < 1000);
  const following = queue.submit(async () => { await driver.call("hotkey", { scope: "desktop", keys: ["ctrl", "s"] }); await poll(async () => (await readFile(join(out, "saved.txt"), "utf8")) === text); return await readFile(join(out, "saved.txt"), "utf8"); });
  assert.equal(following.query().state, "queued"); await active.wait(); assert.equal(await following.wait(), text); await queue.drain();
  const complete = await state(); assert.equal(complete.text, text);
  const afterAX = await app.getAXState({ disableDiffing: true, emit: false });
  await writeFile(join(out, "editor-after.ax.txt"), afterAX); assert.match(afterAX, /éΩ中🙂/);
  record("cancel-and-completion", { atDeadline, partial, complete, active: active.query(), cancelled: cancelled.query(), following: following.query(), savedExact: true });
  if (process.env.HALO_NATIVE_CONTRACT_ONLY === "1") {
    evidence.scope = "native-only";
    record("foreground-browser", { verified: false, status: "not_run", reason: "Explicit native-only contract; sandboxed Chrome acceptance remains separate" });
  } else {
  try {
    // A real sandbox probe is mandatory; no sandbox-disabling flags or elevated container privileges.
    const sandbox = execFileSync("google-chrome-stable", ["--headless", "--disable-gpu", "--no-first-run", "--user-data-dir=" + join(process.env.XDG_RUNTIME_DIR, "sandbox-probe"), "--dump-dom", "chrome://sandbox"], { timeout: 15000, encoding: "utf8" });
    await writeFile(join(out, "chrome-sandbox.html"), sandbox);
    tab = await queue.submit(() => browserCua.createBrowserTab("chrome", "http://127.0.0.1:8123/")).wait();
    // The existing page-report postcondition proves the renderer has started
    // before its process/sandbox audit; retain raw owned records before asserting.
    await poll(async () => JSON.parse(await readFile(join(out, "browser-state.json"), "utf8")).clicks === 0);
    assert.equal(browserPreparations.length,1);
    const rootPID=Number(browserPreparations[0].prepared.prepared_pid),processes=[];
    for(const pid of (await readdir("/proc")).filter(pid=>/^\d+$/.test(pid))){
      try{
        const stat=await readFile(`/proc/${pid}/stat`,"utf8"),status=await readFile(`/proc/${pid}/status`,"utf8");
        const argv=(await readFile(`/proc/${pid}/cmdline`,"utf8")).split("\0").filter(Boolean);
        const startTimeTicks=processStart(stat);
        if(startTimeTicks!==processStart(await readFile(`/proc/${pid}/stat`,"utf8")))continue;
        processes.push({pid:Number(pid),parentPID:Number(status.match(/^PPid:\s*(\d+)/m)?.[1]),startTimeTicks,argv,status});
      }catch(error){if(!["ENOENT","ESRCH"].includes(error.code))throw error;}
    }
    const ownedPIDs=new Set([rootPID]);let changed=true;
    while(changed){changed=false;for(const process of processes)if(ownedPIDs.has(process.parentPID)&&!ownedPIDs.has(process.pid)){ownedPIDs.add(process.pid);changed=true;}}
    const owned=processes.filter(process=>ownedPIDs.has(process.pid));
    await writeFile(join(out,"owned-browser-process-audit.json"),JSON.stringify({rootPID,prepared:browserPreparations[0],owned},null,2));
    assert.equal(owned.find(process=>process.pid===rootPID)?.startTimeTicks,browserPreparations[0].startTimeTicks,"owned root process identity changed");
    const baseline = await readFile("/proc/self/status", "utf8");
    const baseFilters = Number(baseline.match(/^Seccomp_filters:\s*(\d+)/m)?.[1] ?? 0);
    const rendererEvidence = [];
    for(const {pid,argv,status}of owned){
      assert.ok(!/(?:^|\s)--(?:no-sandbox|disable-setuid-sandbox|disable-seccomp-filter-sandbox)(?=\s|$)/.test(argv.join(" ")));
      if(!argv.includes("--type=renderer"))continue;
      assert.match(status,/^NoNewPrivs:\s*1$/m);assert.match(status,/^Seccomp:\s*2$/m);
      assert.ok(Number(status.match(/^Seccomp_filters:\s*(\d+)/m)?.[1]??0)>baseFilters,"renderer has an additional sandbox filter beyond the host baseline");
      rendererEvidence.push({pid,argv,status});
    }
    assert.ok(rendererEvidence.length > 0, "owned Chrome has a sandboxed renderer");
    await writeFile(join(out, "renderer-sandbox.json"), JSON.stringify({ baseline, rendererEvidence }, null, 2));
    await poll(async () => JSON.parse(await readFile(join(out, "browser-state.json"), "utf8")).clicks === 0); execFileSync("wmctrl", ["-ia", process.env.HALO_EDITOR_WINDOW]); await poll(async () => (await state()).focused);
    const focusBefore = execFileSync("xdotool", ["getwindowfocus"], { encoding: "utf8" }).trim();
    await writeFile(join(out, "browser-before.png"), await tab.getScreenshot({ emit: false }));
    await assert.rejects(queue.submit(() => tab.click([80, 80])).wait(), error => ["browser_input_trust_unavailable", "route_unavailable"].includes(error.code));
    assert.equal(browser.clicks, 0); assert.equal(execFileSync("xdotool", ["getwindowfocus"], { encoding: "utf8" }).trim(), focusBefore);
    await tab.getScreenshot({ emit: false }); await queue.submit(() => tab.click([80, 80], { deliveryMode: "foreground" })).wait();
    await poll(() => browser.clicks === 1); assert.equal(browser.trusted, true);
    await assert.rejects(queue.submit(() => tab.click([80, 80], { deliveryMode: "foreground" })).wait(), /fresh exact-tab screenshot/);
    assert.equal(browser.clicks, 1); const clicked = { ...browser }; await tab.getScreenshot({ emit: false });
    await queue.submit(() => tab.scroll([300, 300], "down", 1, { deliveryMode: "foreground" })).wait(); await poll(() => browser.scrollY > 0);
    await writeFile(join(out, "browser-after.png"), await tab.getScreenshot({ emit: false }));
    record("foreground-browser", { clicked, scrolled: { ...browser }, focusBefore, focusAfter: execFileSync("xdotool", ["getwindowfocus"], { encoding: "utf8" }).trim(), staleRefusal: true, absentOptInRefusal: true });
  } catch (error) { record("foreground-browser", { verified: false, error: String(error), code: error.code }); throw error; }
  }
} catch (error) { evidence.error = String(error); evidence.errorCode = error.code; evidence.errorStack = error.stack; process.exitCode = 1; }
finally {
  try { if (tab) await queue.submit(() => tab.close()).wait(); await queue.close({ timeoutMs: 30000 }); await sdk.close(); await browserSdk.close(); await browserDriver.call("end_session", { session: "halo-browser-contract" }); await driver.call("end_session", { session: "halo-contract" }); evidence.cleanup = "owned browser/session detached; daemon belongs to session supervisor"; } catch (error) { evidence.cleanupError = String(error); process.exitCode = 1; }
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  await writeFile(join(out, "evidence.json"), JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence.results.map(({name, ...data}) => ({ name, verified: data.verified ?? true })), null, 2));
}
