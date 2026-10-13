/** Real TigerVNC/XFWM4 covered-window control; no Chrome acceptance claim. */
import assert from "node:assert/strict";
import {writeFile, readFile} from "node:fs/promises";
import {join} from "node:path";
import {spawn, execFileSync} from "node:child_process";
import {setTimeout as sleep} from "node:timers/promises";
import {CuaDriverClient,createOpenSky,createCua} from "../../dist/index.js";
const out=process.env.HALO_ARTIFACTS;
const pid=Number(process.env.HALO_EDITOR_PID), windowId=Number(process.env.HALO_EDITOR_WINDOW);
const driver=new CuaDriverClient({binaryPath:process.env.OPENSKY_DRIVER_PATH,socket:process.env.HALO_DRIVER_SOCKET,session:"halo-capture",autoStart:false,timeoutMs:30000});
const evidence={sdk:process.env.GITHUB_SHA,driver:process.env.HALO_DRIVER_REF,node:process.version,
  environment:`Bookworm TigerVNC/X11 XFWM4 compositor ${process.env.HALO_COMPOSITOR??"off"}, shared D-Bus/AT-SPI, bounded exact editor grants`,
  productionChromeVerified:false,phases:[]};
const active=()=>execFileSync("xdotool",["getactivewindow"],{encoding:"utf8"}).trim();
const poll=async fn=>{for(let i=0;i<100;i++){try{if(await fn())return;}catch(error){if(!["ENOENT","ESRCH"].includes(error.code))throw error;}await sleep(50);}throw Error("Owned fixture postcondition timed out");};
let cover,coverExited=false;
const sdk=createOpenSky({target:"linux",homeDir:join(out,"capture-sdk-home"),screenshotDir:join(out,"capture-sdk-shots"),autoLaunch:false,
 driverOptions:{binaryPath:process.env.OPENSKY_DRIVER_PATH,socket:process.env.HALO_DRIVER_SOCKET,autoStart:false,autoInstall:false,timeoutMs:30000}});
let app;
async function capture(phase){
  const started=Date.now();
  console.log(JSON.stringify({phase,stage:"start"}));
  const focusBefore=active();
  const result=await driver.call("get_window_state",{pid,window_id:windowId,full_output:true,include_screenshot:true});
  const images=result.raw?.content?.filter(part=>part.type==="image")??[];
  // CLI --raw projects its MCP image into structured screenshot_png_b64.
  // Preserve both supported carriers without interpreting a missing frame.
  if(!images.length&&typeof result.structured?.screenshot_png_b64==="string"){
    images.push({data:result.structured.screenshot_png_b64,mimeType:"image/png"});
  }
  assert.equal(active(),focusBefore,"background observation must not activate the editor");
  assert.ok(result.text.includes("replace me"),"real AT-SPI editor value remains visible");
  const data={phase,focusBefore,focusAfter:active(),pid,windowId,imageCount:images.length,
    screenshotFrameValid:result.structured?.screenshot_frame_valid,screenshotError:result.structured?.screenshot_error??null};
  if(images.length){assert.equal(images.length,1);assert.equal(images[0].mimeType,"image/png");await writeFile(join(out,`capture-${phase}.png`),Buffer.from(images[0].data,"base64"));}
  evidence.phases.push(data);
  console.log(JSON.stringify({phase,stage:"finished",elapsedMs:Date.now()-started,imageCount:data.imageCount}));
  return data;
}
try{
  assert.equal(JSON.parse(await readFile(join(out,"identity.json"),"utf8")).source,process.env.HALO_DRIVER_REF);
  await poll(async()=> (await driver.status()).running);
  await driver.call("start_session",{session:"halo-capture"});
  execFileSync("wmctrl",["-ir",process.env.HALO_EDITOR_WINDOW,"-e","0,80,100,640,480"]);
  execFileSync("wmctrl",["-ia",process.env.HALO_EDITOR_WINDOW]);
  await sleep(500);
  evidence.backingProbe=JSON.parse(execFileSync("/usr/bin/python3",["e2e/halo/capture-backing.py",String(windowId)],{encoding:"utf8"}));
  // Independent foreground oracle reads the root screen, not this driver or
  // its named pixmap. Compare a text ROI too: equal black/blank frames must not
  // count as preserved application content.
  const geometry=evidence.backingProbe.ancestors[0].geometry;
  const rootScript=`from PIL import ImageGrab,ImageStat
import os,sys,json
x,y,w,h=map(int,sys.argv[2:]);im=ImageGrab.grab(xdisplay=os.environ['DISPLAY']).crop((x,y,x+w,y+h)).convert('RGB');im.save(sys.argv[1]);print(json.dumps({'mean':sum(ImageStat.Stat(im).mean)/3}))`;
  evidence.foregroundReference=JSON.parse(execFileSync("/usr/bin/python3",["-c",rootScript,join(out,"capture-foreground-reference.png"),...[geometry.rootX,geometry.rootY,geometry.width,geometry.height].map(String)],{encoding:"utf8"}));
  assert.ok(evidence.foregroundReference.mean>240,"real foreground GTK editor renders its expected light background");
  const visible=await capture("visible");assert.equal(visible.imageCount,1);
  const referenceScript=`from PIL import Image,ImageChops
import sys,json
a=Image.open(sys.argv[1]).convert('RGB');b=Image.open(sys.argv[2]).convert('RGB')
assert a.size==b.size
def compare(x,y):
 d=ImageChops.difference(x,y);return sum(1 for p in d.getdata() if max(p)>16)/(x.width*x.height)
print(json.dumps({'whole':compare(a,b),'text':compare(a.crop((0,0,120,24)),b.crop((0,0,120,24)))}))`;
  evidence.foregroundReference.matchesDriver=JSON.parse(execFileSync("/usr/bin/python3",["-c",referenceScript,join(out,"capture-foreground-reference.png"),join(out,"capture-visible.png")],{encoding:"utf8"}));
  assert.ok(evidence.foregroundReference.matchesDriver.whole<0.02&&evidence.foregroundReference.matchesDriver.text<0.02,"driver foreground frame matches independent root pixels including the actual text ROI");
  const inventory=(await driver.call("list_apps")).structured;
  const native=(Array.isArray(inventory)?inventory:inventory.apps).find(app=>app.pid===pid);assert.ok(native);
  app=await createCua(sdk,{emit:()=>undefined}).getApp(native.name);
  console.log(JSON.stringify({phase:"public-visible",stage:"start"}));
  assert.ok((await app.getScreenshot({emit:false})).byteLength>0);
  console.log(JSON.stringify({phase:"public-visible",stage:"finished"}));
  // A separate real GTK process covers the owned editor. No driver launch or
  // permission expansion, compositor change, input injection, or clipboard use.
  cover=spawn("/usr/bin/python3",["-c",`import gi
gi.require_version("Gtk","3.0")
from gi.repository import Gtk
w=Gtk.Window(title="Halo Capture Occluder")
w.set_default_size(900,700)
w.add(Gtk.Label(label="Owned capture occluder"))
w.connect("destroy",Gtk.main_quit)
w.show_all()
Gtk.main()`],{stdio:"ignore"});
  cover.on("exit",()=>{coverExited=true;});
  cover.on("error",error=>{coverExited=true;evidence.occluderStartError=String(error);});
  let coverWindow;
  await poll(()=>{const rows=execFileSync("wmctrl",["-lp"],{encoding:"utf8"}).split("\n");const row=rows.find(row=>row.includes("Halo Capture Occluder")&&Number(row.split(/\s+/)[2])===cover.pid);coverWindow=row?.split(/\s+/)[0];return Boolean(coverWindow);});
  execFileSync("wmctrl",["-ir",coverWindow,"-e","0,40,60,900,700"]);execFileSync("wmctrl",["-ia",coverWindow]);
  await poll(()=>Number(active())===Number(coverWindow));await sleep(500);
  const covered=await capture("covered");
  if(process.env.HALO_COMPOSITOR==="on")assert.equal(covered.imageCount,1,"existing compositor backing must preserve covered pixels");
  if(!covered.imageCount){
    const focusBefore=active();
    const partial=await sdk.get_app_state({app:app.toJSON().targetHandle,includeScreenshot:true,disableDiff:true});
    assert.equal(partial.screenshot,null);assert.equal(partial.screenshotError?.code,"window_capture_unavailable");
    assert.match(partial.text,/replace me/);
    await assert.rejects(app.getScreenshot({emit:false}),{code:"window_capture_unavailable",message:/occluded.*bring_to_front/s});
    assert.equal(active(),focusBefore);
    evidence.publicSDK={AXPreserved:true,screenshot:null,screenshotError:partial.screenshotError,facadeTypedRefusal:true,foregroundPreserved:true};
  }
  execFileSync("wmctrl",["-ia",process.env.HALO_EDITOR_WINDOW]);await poll(()=>Number(active())===windowId);await sleep(500);
  const restored=await capture("restored");assert.equal(restored.imageCount,1);
  if(covered.imageCount){
    const script=`from PIL import Image, ImageChops, ImageStat
import sys,json
a=Image.open(sys.argv[1]).convert('RGB');b=Image.open(sys.argv[2]).convert('RGB');c=Image.open(sys.argv[3]).convert('RGB')
def comparison(x,y):
 if x.size!=y.size:return {'dimensionsMatch':False}
 d=ImageChops.difference(x,y);changed=sum(1 for p in d.getdata() if max(p)>16)
 return {'dimensionsMatch':True,'changedPixelFraction':changed/(x.width*x.height),'meanAbsoluteDifference':sum(ImageStat.Stat(d).mean)/3}
print(json.dumps({'covered':comparison(a,b),'restored':comparison(a,c),'sizes':[a.size,b.size,c.size]}))`;
    evidence.pixels=JSON.parse(execFileSync("/usr/bin/python3",["-c",script,...["visible","covered","restored"].map(phase=>join(out,`capture-${phase}.png`))],{encoding:"utf8"}));
    assert.ok(evidence.pixels.restored.dimensionsMatch&&evidence.pixels.restored.changedPixelFraction<0.02,"foreground capture is stable within fixture cursor/paint tolerance");
    assert.ok(evidence.pixels.covered.dimensionsMatch&&evidence.pixels.covered.changedPixelFraction<0.02,"covered capture must preserve the owned target pixels; tolerance is fixture-only, not a product darkness heuristic");
    evidence.pixels.coveredReference=JSON.parse(execFileSync("/usr/bin/python3",["-c",referenceScript,join(out,"capture-foreground-reference.png"),join(out,"capture-covered.png")],{encoding:"utf8"}));
    assert.ok(evidence.pixels.coveredReference.whole<0.02&&evidence.pixels.coveredReference.text<0.02,"covered capture preserves the independently observed application text, not only its blank background");
    evidence.acceptance="preserved target pixels";
  }else{
    assert.equal(covered.screenshotFrameValid,false);
    assert.equal(covered.screenshotError?.code,"window_capture_unavailable");
    assert.match(covered.screenshotError?.reason??covered.screenshotError?.message??"",/occlud|covered|backing|unavailable/i);
    evidence.acceptance="actionable exact-window capture refusal with AT-SPI preserved";
  }
  // A legitimately black fixture stays capturable: product refusal is based
  // on exposure/backing, never pixel darkness. GTK applies its own real CSS.
  await writeFile(join(out,"request-dark-theme"),"owned fixture request");
  await poll(async()=>JSON.parse(await readFile(join(out,"editor-state.json"),"utf8")).theme==="dark");await sleep(500);
  evidence.darkReference=JSON.parse(execFileSync("/usr/bin/python3",["-c",rootScript,join(out,"capture-dark-reference.png"),...[geometry.rootX,geometry.rootY,geometry.width,geometry.height].map(String)],{encoding:"utf8"}));
  const dark=await capture("dark");assert.equal(dark.imageCount,1);
  evidence.darkReference.matchesDriver=JSON.parse(execFileSync("/usr/bin/python3",["-c",referenceScript,join(out,"capture-dark-reference.png"),join(out,"capture-dark.png")],{encoding:"utf8"}));
  assert.ok(evidence.darkReference.matchesDriver.whole<0.02&&evidence.darkReference.matchesDriver.text<0.02,"legitimate dark capture preserves independently observed white text too");
  const stats=JSON.parse(execFileSync("/usr/bin/python3",["-c","from PIL import Image,ImageStat;import sys,json;im=Image.open(sys.argv[1]).convert('RGB');print(json.dumps({'mean':sum(ImageStat.Stat(im).mean)/3}))",join(out,"capture-dark.png")],{encoding:"utf8"}));
  assert.ok(stats.mean<10,"GTK fixture actually rendered black; this threshold is never used in the driver");
  evidence.legitimateDarkFrame={captured:true,mean:stats.mean};
}catch(error){evidence.error=String(error);evidence.code=error.code;process.exitCode=1;}
finally{
  try{
    if(cover&&!coverExited){cover.kill("SIGTERM");try{await poll(()=>coverExited);}catch{cover.kill("SIGKILL");await poll(()=>coverExited);}}
  }catch(error){evidence.occluderCleanupError=String(error);process.exitCode=1;}
  evidence.occluderExited=cover===undefined||coverExited;
  try{await sdk.close();await driver.call("end_session",{session:"halo-capture"});evidence.sessionEnded=true;}catch(error){evidence.cleanupError=String(error);process.exitCode=1;}
  await writeFile(join(out,"capture-evidence.json"),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({acceptance:evidence.acceptance??null,error:evidence.error??null,occluderExited:evidence.occluderExited,productionChromeVerified:false}));
}
