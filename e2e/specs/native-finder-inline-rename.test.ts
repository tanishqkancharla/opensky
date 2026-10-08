import { access, mkdtemp, mkdir, rm, writeFile, readdir, lstat, rename } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import { test } from "../fixtures/sdk.js";

type Window = { pid: number; window_id: number; app_name: string; is_on_screen: boolean; bounds: { width: number; height: number } };
type Driver = { invoke(tool: string, args: Record<string, unknown>): Promise<{ structured: unknown }> };

test.for(['list','icon'] as const)('FINDER-N06: clicking an already-selected filename preserves its collection behavior in %s view',{timeout:60000},async(mode,{sdk,cua})=>{
 const driver=sdk as unknown as Driver;
 const windows=async()=>((await driver.invoke('list_windows',{})).structured as {windows:Window[]}).windows;
 const before=new Set((await windows()).map(w=>`${w.pid}:${w.window_id}`));
 const root=await mkdtemp(join(tmpdir(),'opensky-selected-file-'));
 const rootBefore=await lstat(root);
 const artifacts=await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR??tmpdir(),'finder-selected-label-cleanup-'));
 let owned:Window|undefined;
 let primaryError:unknown;
 let failed=false;
 const cleanupErrors:unknown[]=[];
 let windowAbsent=!owned;
 let rootRemoved=false;
 const describe=(error:unknown)=>error instanceof Error?{name:error.name,message:error.message,stack:error.stack}:{message:String(error)};
 try{
  await mkdir(join(root,'Drafts'));
  const app=await cua.getApp('Finder');await app.pressKey('super+n');await app.getAXState({emit:false});
  owned=(await windows()).find(w=>w.app_name==='Finder'&&w.is_on_screen&&w.bounds.width>100&&w.bounds.height>100&&!before.has(`${w.pid}:${w.window_id}`));expect(owned).toBeTruthy();
  await app.pressKey('super+shift+g');let state='';
  await expect.poll(async()=>{state=await app.getAXState({disableDiffing:true,emit:false});return state.includes('id=PathTextField');}).toBe(true);
  const path=state.match(/\[(\d+)\] AXTextField[^\n]*id=PathTextField/);expect(path).toBeTruthy();
  await app.setValue(Number(path![1]),root);await app.pressKey('Return');
  await expect.poll(async()=>{state=await app.getAXState({disableDiffing:true,emit:false});return state.includes(`AXWindow "${root.split('/').at(-1)}"`)&&!state.includes('AXSheet');}).toBe(true);
  await app.pressKey(mode==='list'?'super+2':'super+1');state=await app.getAXState({disableDiffing:true,emit:false});
  const field=()=>{const match=state.match(mode==='list'?/\[(\d+)\] AXTextField = "Drafts"/:/\[(\d+)\] AXImage "Drafts"/);expect(match).toBeTruthy();return Number(match![1]);};
  await app.click(field());state=await app.getAXState({disableDiffing:true,emit:false});expect(state).toContain('[selected]');
  if(process.env.OPENSKY_E2E_ARTIFACT_DIR)await writeFile(join(process.env.OPENSKY_E2E_ARTIFACT_DIR,'selected-field-before.txt'),state);
  await app.click(field());state=await app.getAXState({disableDiffing:true,emit:false});expect(state).toContain('[selected]');
  // The label is a selected collection item, not a text editor. Its normal
  // Open shortcut must still navigate instead of editing the filename.
  await app.pressKey('super+o');state=await app.getAXState({disableDiffing:true,emit:false});expect(state).toContain('AXWindow "Drafts"');
  if(process.env.OPENSKY_E2E_ARTIFACT_DIR)await writeFile(join(process.env.OPENSKY_E2E_ARTIFACT_DIR,'selected-field-after.txt'),state);
 }catch(error){
  failed=true;primaryError=error;
 }finally{
  if(owned){
   // A close refusal can still be followed by proven absence. Retain the
   // refusal separately; always attempt the exact read-only absence check.
   try{await driver.invoke('close_window',{pid:owned.pid,window_id:owned.window_id});}catch(error){cleanupErrors.push(error);}
   try{await expect.poll(async()=>(await windows()).some(w=>w.pid===owned!.pid&&w.window_id===owned!.window_id&&w.is_on_screen)).toBe(false);windowAbsent=true;}catch(error){windowAbsent=false;cleanupErrors.push(error);}
  }
  try{
   const current=await lstat(root);
   if(!current.isDirectory()||current.isSymbolicLink()||current.dev!==rootBefore.dev||current.ino!==rootBefore.ino)throw new Error('Finder fixture root identity changed; preserve for recovery');
   if(!failed&&cleanupErrors.length===0){await rm(root,{recursive:true});rootRemoved=true;}
  }catch(error){cleanupErrors.push(error);}
  try{
   await writeFile(join(artifacts,'cleanup.json'),JSON.stringify({app:'Finder selected label fixture',safeToContinue:windowAbsent&&cleanupErrors.length===0,ownedWindow:owned??null,windowAbsent,root:{path:root,device:rootBefore.dev,inode:rootBefore.ino,removed:rootRemoved,retained:!rootRemoved},primaryFailure:failed?describe(primaryError):null,cleanupFailures:cleanupErrors.map(describe)},null,2));
  }catch(error){cleanupErrors.push(error);}
 }
 if(failed&&cleanupErrors.length)throw new AggregateError([primaryError,...cleanupErrors],`Finder selected-label primary failure: ${String(primaryError)}; cleanup also failed: ${cleanupErrors.map(String).join('; ')}`);
 if(failed)throw primaryError;
 if(cleanupErrors.length)throw new AggregateError(cleanupErrors,'Finder selected-label cleanup failed');
});

for (const [id, view, shortcut] of [["FINDER-N01", "icon", "super+1"], ["FINDER-N02", "list", "super+2"]] as const) {
  test(`${id}: commits and opens a folder in its exact new ${view} window`, async ({ sdk, cua }) => {
    const driver = sdk as unknown as Driver;
    const windows = async () => ((await driver.invoke("list_windows", {})).structured as { windows: Window[] }).windows
      .filter(window => window.app_name === "Finder");
    const before = await windows();
    const old = new Set(before.map(window => `${window.pid}:${window.window_id}`));
    const name = `CUA-Inline-Probe-${process.pid}-${view}`;
    const documents = join(homedir(), "Documents");
    const path = join(documents, name);
    const namesBefore = new Set(await readdir(documents));
    expect(namesBefore.has(name)).toBe(false);
    const artifacts = await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR ?? tmpdir(), "finder-inline-cleanup-"));
    await writeFile(join(artifacts, "directory-before.json"), JSON.stringify([...namesBefore]));
    let newFolderStartedAt: number | undefined;
    let owned: Window | undefined;
    let cleanupError: unknown;
    try {
      let app = await cua.getApp("Finder");
      await app.pressKey("super+n");
      await app.getAXState();
      owned = (await windows()).find(window => window.is_on_screen && window.bounds.width > 100 && window.bounds.height > 100 && !old.has(`${window.pid}:${window.window_id}`));
      if (!owned) throw new Error("Finder did not open one fresh window");
      const target = { pid: owned.pid, window_id: owned.window_id };
      await driver.invoke("bring_to_front", target);
      await driver.invoke("hotkey", { ...target, keys: ["cmd", "shift", "o"], delivery_mode: "foreground" });
      await driver.invoke("get_window_state", { ...target, include_screenshot: false });
      newFolderStartedAt = Date.now();
      await driver.invoke("hotkey", { ...target, keys: ["cmd", "shift", "n"], delivery_mode: "foreground" });
      const observed = (await driver.invoke("get_window_state", {
        ...target, include_screenshot: false,
      })).structured as { tree_markdown?: string; snapshot_id?: string; elements: Array<{ element_index: number; element_token?: string; role: string; identifier?: string }> };
      const state = String(observed.tree_markdown ?? "");
      await writeFile(join(artifacts, "new-folder-state.txt"), state);
      const matches = [...state.matchAll(/\[(\d+)\] AXTextField[^\n]*\[id=ShrinkToFit Text Field/g)];
      expect(matches).toHaveLength(1);
      const field = observed.elements.find(element => element.element_index === Number(matches[0]![1]));
      expect(field?.role).toBe("AXTextField");
      expect(field?.identifier).toBe("ShrinkToFit Text Field");
      expect(field?.element_token).toBeTruthy();
      await driver.invoke("set_value", { ...target, element_token: field!.element_token, value: name });
      await driver.invoke("press_key", { ...target, key: "Return", delivery_mode: "foreground" });
      await expect.poll(async () => access(path).then(() => true).catch(() => false)).toBe(true);
      await driver.invoke("bring_to_front", target);
      const bound = app;
      await bound.pressKey(shortcut);
      let folder: RegExpMatchArray[] = [];
      await expect.poll(async () => {
        const folderState = await bound.getAXState({ disableDiffing: true });
        folder = [...folderState.matchAll(new RegExp(`\\[(\\d+)\\] (?:AXImage|AXTextField)[^\\n]*${name}`, "g"))];
        return folder.length;
      }).toBe(1);
      await bound.performSecondaryAction(Number(folder[0]![1]), "open");
      await expect.poll(async () => String(((await driver.invoke("get_window_state", {
        ...target, include_screenshot: false, max_elements: 1,
      })).structured as { tree_markdown?: string }).tree_markdown ?? "").includes(`AXWindow "${name}"`)).toBe(true);
    } finally {
      if (owned) {
        try {
          await driver.invoke("close_window", { pid: owned.pid, window_id: owned.window_id }).catch(() => undefined);
          await expect.poll(async () => (await windows()).some(window => window.pid === owned!.pid
            && window.window_id === owned!.window_id && window.is_on_screen), { timeout: 5_000 }).toBe(false);
        } catch (error) { cleanupError = error; }
      }
      // A failed rename assertion can leave the newly created untitled root.
      // Retain a unique absent-before root, even on failure; never remove a
      // preexisting directory or guess when another new directory is present.
      let retained: unknown = null;
      try {
        if (newFolderStartedAt !== undefined) {
          const fresh = (await readdir(documents)).filter(n => !namesBefore.has(n));
          if (fresh.length > 1) throw new Error("Ambiguous new Documents entries; preserve for recovery");
          if (fresh.length === 1) {
            const currentName = fresh[0]!;
            if (currentName !== name && !/^untitled folder(?: \d+)?$/.test(currentName)) throw new Error("Unexpected new Documents entry; preserve for recovery");
            const source = join(documents, currentName);
            const beforeMove = await lstat(source);
            if (!beforeMove.isDirectory() || beforeMove.birthtimeMs < newFolderStartedAt - 10) throw new Error("Fresh root identity not proved");
            const destination = join(artifacts, "retained-root");
            await rename(source, destination);
            const afterMove = await lstat(destination);
            expect([afterMove.dev, afterMove.ino]).toEqual([beforeMove.dev, beforeMove.ino]);
            expect(await access(source).then(() => true).catch(() => false)).toBe(false);
            retained = { source, destination, device: afterMove.dev, inode: afterMove.ino, wholeScopeRetained: true };
          }
        }
      } catch (error) { cleanupError ??= error; }
      await writeFile(join(artifacts, "cleanup.json"), JSON.stringify({ app: "Finder inline fixture", safeToContinue: !cleanupError, retained, error: cleanupError ? String(cleanupError) : null }, null, 2));
      if (cleanupError) throw cleanupError;
    }
  });
}

test("FINDER-N03: clicking Documents in the sidebar navigates the exact new window", async ({ sdk, cua }) => {
  const driver = sdk as unknown as Driver;
  const allWindows = async () => ((await driver.invoke("list_windows", {})).structured as { windows: Window[] }).windows;
  const windows = async () => (await allWindows()).filter(window => window.app_name === "Finder");
  const before = new Set((await windows()).map(window => `${window.pid}:${window.window_id}`));
  const exec = promisify(execFile);
  const temporary = await mkdtemp(join(tmpdir(), "opensky-sidebar-focus-"));
  const helper = join(temporary, "mac-app-lifecycle");
  let owned: Window | undefined;
  try {
    await exec("/usr/bin/swiftc", ["-module-cache-path", join(temporary, "swift-cache"),
      fileURLToPath(new URL("../../evals/parity/mac-app-lifecycle.swift", import.meta.url)), "-o", helper], { timeout: 60_000 });
    const desktop = async () => JSON.parse((await exec(helper, ["desktop-state"], { timeout: 10_000 })).stdout) as { ready: boolean; frontmostPid: number };
    const app = await cua.getApp("Finder");
    await app.pressKey("super+n");
    await app.getAXState();
    owned = (await windows()).find(window => window.is_on_screen && window.bounds.width > 100 && window.bounds.height > 100 && !before.has(`${window.pid}:${window.window_id}`));
    if (!owned) throw new Error("Finder did not open one fresh window");
    const target = { pid: owned.pid, window_id: owned.window_id };
    await driver.invoke("hotkey", { ...target, keys: ["cmd", "shift", "f"], delivery_mode: "foreground" });
    const initial = await app.getAXState({ disableDiffing: true });
    if (!initial.includes("AXOutline (sidebar)")) {
      await app.pressKey("super+alt+s");
      await app.getAXState();
    }
    // Prove the missing state from the agent run: a live ordinary app other
    // than Finder is frontmost. Only activate it; never edit or close it.
    const other = (await allWindows()).find(window => window.pid !== owned!.pid && window.is_on_screen
      && window.bounds.width > 100 && window.bounds.height > 100
      && !["OpenSkyDriver", "ChatGPT Computer Use", "Window Server"].includes(window.app_name));
    if (!other) throw new Error("Sidebar background fixture requires another visible ordinary app");
    const identity = JSON.parse((await exec(helper, ["inspect", String(other.pid)], { timeout: 10_000 })).stdout) as { bundleId: string; launchedAt: number };
    if (!identity.bundleId || !Number.isFinite(identity.launchedAt)) throw new Error("Other app has no exact lifecycle identity");
    await exec(helper, ["activate", String(other.pid), identity.bundleId, String(identity.launchedAt)], { timeout: 10_000 });
    await expect.poll(async () => (await desktop()).frontmostPid, { timeout: 5_000 }).toBe(other.pid);
    const bound = app;
    const state = await bound.getAXState({ disableDiffing: true });
    expect(state).toContain('AXWindow "Recents"');
    const documents = [...state.matchAll(/\[(\d+)\] AXCell[^\n]*\n\s*- AXStaticText = "Documents"/g)];
    expect(documents).toHaveLength(1);
    const beforeClick = await desktop();
    expect(beforeClick.ready).toBe(true);
    expect(beforeClick.frontmostPid).toBe(other.pid);
    if (process.env.OPENSKY_E2E_ARTIFACT_DIR) await writeFile(join(process.env.OPENSKY_E2E_ARTIFACT_DIR,
      `finder-sidebar-background-${process.pid}.json`), JSON.stringify({ beforeClick, target, other }, null, 2));
    await bound.click(Number(documents[0]![1]));
    await expect.poll(async () => String(((await driver.invoke("get_window_state", {
      ...target, include_screenshot: false, max_elements: 1,
    })).structured as { tree_markdown?: string }).tree_markdown ?? "").includes('AXWindow "Documents"'),
    { timeout: 3_000 }).toBe(true);
  } finally {
    if (owned) {
      await driver.invoke("close_window", { pid: owned.pid, window_id: owned.window_id }).catch(() => undefined);
      await expect.poll(async () => (await windows()).some(window => window.pid === owned!.pid
        && window.window_id === owned!.window_id && window.is_on_screen), { timeout: 5_000 }).toBe(false);
      if (process.env.OPENSKY_E2E_ARTIFACT_DIR) await writeFile(join(process.env.OPENSKY_E2E_ARTIFACT_DIR,
        `finder-sidebar-cleanup-${process.pid}.json`), JSON.stringify({ owned, verifiedClosed: true }, null, 2));
    }
    await rm(temporary, { recursive: true, force: true });
  }
});

test("FINDER-N04: opens the File menu for the exact new Finder window", async ({ sdk, cua }) => {
  const driver = sdk as unknown as Driver;
  const windows = async () => ((await driver.invoke("list_windows", {})).structured as { windows: Window[] }).windows
    .filter(window => window.app_name === "Finder");
  const before = new Set((await windows()).map(window => `${window.pid}:${window.window_id}`));
  let owned: Window | undefined;
  let app: Awaited<ReturnType<typeof cua.getApp>> | undefined;
  try {
    app = await cua.getApp("Finder");
    await app.pressKey("super+n");
    const state = await app.getAXState({ disableDiffing: true });
    owned = (await windows()).find(window => window.is_on_screen && window.bounds.width > 100
      && window.bounds.height > 100 && !before.has(`${window.pid}:${window.window_id}`));
    if (!owned) throw new Error("Finder did not open one fresh window");
    const file = [...state.matchAll(/\[(\d+)\] AXMenuBarItem "File"/g)];
    expect(file).toHaveLength(1);
    await app.click(Number(file[0]![1]));
    await expect.poll(async () => /\[\d+\] AXMenuItem "New Finder Window"/.test(
      await app!.getAXState({ disableDiffing: true }),
    )).toBe(true);
    await app.pressKey("Escape");
    expect(await app.getAXState({ disableDiffing: true })).not.toMatch(/\[\d+\] AXMenuItem "New Finder Window"/);
  } finally {
    await app?.pressKey("Escape").catch(() => undefined);
    if (owned) {
      await driver.invoke("close_window", { pid: owned.pid, window_id: owned.window_id }).catch(() => undefined);
      await expect.poll(async () => (await windows()).some(window => window.pid === owned!.pid
        && window.window_id === owned!.window_id && window.is_on_screen), { timeout: 5_000 }).toBe(false);
    }
  }
});

test("FINDER-N05: indexed right-click opens a sidebar cell context menu", async ({ sdk, cua }) => {
  const driver = sdk as unknown as Driver;
  const windows = async () => ((await driver.invoke("list_windows", {})).structured as { windows: Window[] }).windows
    .filter(window => window.app_name === "Finder");
  const before = new Set((await windows()).map(window => `${window.pid}:${window.window_id}`));
  let owned: Window | undefined;
  let app: Awaited<ReturnType<typeof cua.getApp>> | undefined;
  try {
    app = await cua.getApp("Finder");
    await app.pressKey("super+n");
    let state = await app.getAXState({ disableDiffing: true });
    owned = (await windows()).find(window => window.is_on_screen && window.bounds.width > 100
      && window.bounds.height > 100 && !before.has(`${window.pid}:${window.window_id}`));
    if (!owned) throw new Error("Finder did not open one fresh window");
    await driver.invoke("bring_to_front", { pid: owned.pid, window_id: owned.window_id });
    if (!state.includes("AXOutline (sidebar)")) {
      await app.pressKey("super+alt+s");
      state = await app.getAXState({ disableDiffing: true });
    }
    const documents = [...state.matchAll(/\[(\d+)\] AXCell[^\n]*\n\s*- AXStaticText = "Documents"/g)];
    expect(documents).toHaveLength(1);
    await app.click(Number(documents[0]![1]), { mouseButton: "right" });
    const menu = await app.getAXState({ disableDiffing: true });
    expect(menu).toMatch(/\[\d+\] AXMenuItem/);
    if (process.env.OPENSKY_E2E_ARTIFACT_DIR) await writeFile(join(process.env.OPENSKY_E2E_ARTIFACT_DIR,
      `finder-right-click-${process.pid}.txt`), menu);
    await app.pressKey("Escape");
    expect(await app.getAXState({ disableDiffing: true })).not.toMatch(/\[\d+\] AXMenuItem/);
  } finally {
    await app?.pressKey("Escape").catch(() => undefined);
    if (owned) {
      await driver.invoke("close_window", { pid: owned.pid, window_id: owned.window_id }).catch(() => undefined);
      await expect.poll(async () => (await windows()).some(window => window.pid === owned!.pid
        && window.window_id === owned!.window_id && window.is_on_screen), { timeout: 5_000 }).toBe(false);
      if (process.env.OPENSKY_E2E_ARTIFACT_DIR) await writeFile(join(process.env.OPENSKY_E2E_ARTIFACT_DIR,
        `finder-right-click-cleanup-${process.pid}.json`), JSON.stringify({ owned, verifiedClosed: true }, null, 2));
    }
  }
});
