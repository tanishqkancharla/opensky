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
const record = (name, details) => evidence.results.push({ name, ...details });
const driver = new CuaDriverClient({ binaryPath: process.env.OPENSKY_DRIVER_PATH, socket: process.env.HALO_DRIVER_SOCKET, session: "halo-contract", autoStart: false, timeoutMs: null });
const sdk = createOpenSky({ driver, target: "linux", homeDir: join(out, "sdk-home"), screenshotDir: join(out, "screenshots"), autoLaunch: false, settleDelayMs: 0 });
const cua = createCua(sdk, { emit: () => undefined }); const queue = new DesktopActionQueue();
const browserDriver = new CuaDriverClient({ binaryPath: process.env.OPENSKY_DRIVER_PATH, socket: process.env.HALO_BROWSER_SOCKET, session: "halo-browser-contract", autoStart: false, timeoutMs: null });
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
  await app.getAXState({ emit: false });
  await queue.submit(() => driver.call("hotkey", { scope: "desktop", keys: ["ctrl", "a"] })).wait();
  await poll(async () => (await state()).selected === "replace me" && (await state()).clipboard === "preserved clipboard sentinel Ελληνικά");
  const before = await state(); const capability = await sdk.get_capabilities(); assert.equal(capability.nativePaste.availability, "unavailable");
  for (const text of ["ASCII replacement", "Café Ελληνικά 中文 🙂"]) await assert.rejects(queue.submit(() => app.paste(text)).wait(), { code: "unsupported_native_paste" });
  const after = await state(); assert.equal(after.text, before.text); assert.equal(after.selected, before.selected); assert.equal(after.clipboard, before.clipboard);
  await queue.submit(() => driver.call("hotkey", { scope: "desktop", keys: ["ctrl", "s"] })).wait();
  await poll(async () => (await readFile(join(out, "saved.txt"), "utf8")) === before.text);
  await writeFile(join(out, "paste-refusal-saved.txt"), await readFile(join(out, "saved.txt")));
  record("native-paste-capability", { before, after, capability, saved: before.text, supportedInsertion: false });
  const text = "éΩ中🙂".repeat(250); assert.equal([...text].length, 1000);
  const stop = new AbortController();
  const active = queue.submit(() => driver.call("type_text", { scope: "desktop", text }), { signal: stop.signal });
  await poll(async () => active.query().state === "active");
  const cancelled = queue.submit(() => driver.call("type_text", { scope: "desktop", text: "MUST-NOT-APPEAR" }));
  cancelled.cancel(); await assert.rejects(cancelled.wait(), { code: "desktop_action_cancelled" });
  await assert.rejects(active.wait({ timeoutMs: 500 }), { code: "desktop_wait_timeout" }); stop.abort();
  const partial = await state(); assert.equal(active.query().state, "active"); assert.ok([...partial.text].length < 1000);
  const following = queue.submit(async () => { await driver.call("hotkey", { scope: "desktop", keys: ["ctrl", "s"] }); await poll(async () => (await readFile(join(out, "saved.txt"), "utf8")) === text); return await readFile(join(out, "saved.txt"), "utf8"); });
  assert.equal(following.query().state, "queued"); await active.wait(); assert.equal(await following.wait(), text); await queue.drain();
  const complete = await state(); assert.equal(complete.text, text);
  record("cancel-and-completion", { partial, complete, active: active.query(), cancelled: cancelled.query(), following: following.query(), savedExact: true });
  try {
    // A real sandbox probe is mandatory; no sandbox-disabling flags or elevated container privileges.
    const sandbox = execFileSync("google-chrome-stable", ["--headless", "--disable-gpu", "--no-first-run", "--user-data-dir=" + join(out, "sandbox-probe"), "--dump-dom", "chrome://sandbox"], { timeout: 15000, encoding: "utf8" });
    await writeFile(join(out, "chrome-sandbox.html"), sandbox);
    tab = await queue.submit(() => browserCua.createBrowserTab("chrome", "http://127.0.0.1:8123/")).wait();
    const baseline = await readFile("/proc/self/status", "utf8");
    const baseFilters = Number(baseline.match(/^Seccomp_filters:\s*(\d+)/m)?.[1] ?? 0);
    const rendererEvidence = [];
    for (const pid of (await readdir("/proc")).filter(pid => /^\d+$/.test(pid))) {
      try {
        const argv = (await readFile(`/proc/${pid}/cmdline`, "utf8")).split("\0").filter(Boolean);
        if (!argv.some(arg => arg.includes("/opt/google/chrome/"))) continue;
        assert.ok(!argv.includes("--no-sandbox") && !argv.includes("--disable-setuid-sandbox") && !argv.includes("--disable-seccomp-filter-sandbox"));
        if (!argv.includes("--type=renderer")) continue;
        const status = await readFile(`/proc/${pid}/status`, "utf8");
        assert.match(status, /^NoNewPrivs:\s*1$/m); assert.match(status, /^Seccomp:\s*2$/m);
        assert.ok(Number(status.match(/^Seccomp_filters:\s*(\d+)/m)?.[1] ?? 0) > baseFilters, "renderer has an additional sandbox filter beyond the container baseline");
        rendererEvidence.push({ pid, argv, status });
      } catch (error) { if (!["ENOENT", "ESRCH"].includes(error.code)) throw error; }
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
} catch (error) { evidence.error = String(error); process.exitCode = 1; }
finally {
  try { if (tab) await queue.submit(() => tab.close()).wait(); await queue.close({ timeoutMs: 30000 }); await sdk.close(); await browserSdk.close(); await browserDriver.call("end_session", { session: "halo-browser-contract" }); await driver.call("end_session", { session: "halo-contract" }); evidence.cleanup = "owned browser/session detached; daemon belongs to session supervisor"; } catch (error) { evidence.cleanupError = String(error); process.exitCode = 1; }
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  await writeFile(join(out, "evidence.json"), JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence.results.map(({name, ...data}) => ({ name, verified: data.verified ?? true })), null, 2));
}
