import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createOpenSky } from "../src/opensky.js";
import { SessionStore } from "../src/session-store.js";
import { BrowserSessionLeaseStore } from "../src/browser-session-leases.js";
import type { DriverClient, DriverResult } from "../src/types.js";

// Contract-only adversarial boundary; no desktop helper is invoked.
class SharedDriver implements DriverClient {
  readonly sessionOwnership = { kind: "mcp-proxy" as const, instanceId: "shared-test-proxy" };
  calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
  disposed = 0;
  hold?: Promise<void>;
  async call(tool: string, args: Record<string, unknown> = {}): Promise<DriverResult> {
    this.calls.push({ tool, args });
    if (tool === "list_apps") await this.hold;
    const structured = tool === "end_session" ? { session: args.session, active: false }
      : tool === "close_window" ? { status: "closed", pid: args.pid, window_id: args.window_id }
      : { apps: [] };
    return { structured, text: JSON.stringify(structured), raw: structured };
  }
  async status() { return { running: true, text: "contract" }; }
  async ensureDaemon() {}
  async closeTransport() { this.disposed++; }
}
async function home(t: { after(fn: () => Promise<void>): void }) {
  const path = await mkdtemp(join(tmpdir(), "opensky-owned-transport-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}
const handle = `tgt_${randomUUID()}`;
async function persistTarget(path: string, browser: boolean) {
  const target = {
    handle, openedAt: 1, query: "Test", name: "Test", pid: 4123, windowId: 45,
    ...(browser ? { browser: { session: "foreign-session", targetId: "foreign-target", tabId: "foreign-tab", managed: true } }
      : { nativeCloseAuthority: { kind: "request_created_exact_window", proof: "macos_new_application_instance", pid: 4123, windowId: 45 } }),
  };
  await writeFile(join(path, "session.json"), JSON.stringify({ version: 2, targets: { [handle]: target }, aliases: { test: handle }, trees: {}, managedBrowserSessions: [] }));
}
test("shared injected transport uses distinct base labels and is never disposed by either consumer", async t => {
  const driver = new SharedDriver();
  const a = createOpenSky({ driver, homeDir: await home(t) });
  const b = createOpenSky({ driver, homeDir: await home(t) });
  await a.list_apps(); await b.list_apps();
  const [first, second] = driver.calls;
  assert.notEqual(first?.args.session, second?.args.session);
  await a.close();
  assert.deepEqual(driver.calls.filter(c => c.tool === "end_session").map(c => c.args.session), [first?.args.session]);
  await b.list_apps(); await b.close();
  assert.equal(driver.disposed, 0);
  assert.deepEqual(new Set(driver.calls.filter(c => c.tool === "end_session").map(c => c.args.session)), new Set([first?.args.session, second?.args.session]));
});
test("close stops new public and exposed-driver calls and waits for admitted work", async t => {
  const driver = new SharedDriver(); let release!: () => void;
  driver.hold = new Promise<void>(resolve => { release = resolve; });
  const sky = createOpenSky({ driver, homeDir: await home(t) });
  const work = sky.list_apps(); const closing = sky.close();
  await assert.rejects(sky.list_apps(), /not admitted/);
  await assert.rejects(sky.driver.call("list_apps"), /not admitted/);
  await assert.rejects(sky.driver.status(), /not admitted/);
  await assert.rejects(sky.driver.ensureDaemon(), /not admitted/);
  assert.equal(driver.calls.some(c => c.tool === "end_session"), false);
  release(); await work; await closing;
  assert.equal(driver.calls.filter(c => c.tool === "end_session").length, 1);
});
test("drain timeout retains admission closure and never finalizes unsettled work", async t => {
  const driver = new SharedDriver(); let release!: () => void;
  driver.hold = new Promise<void>(resolve => { release = resolve; });
  const sky = createOpenSky({ driver, homeDir: await home(t), drainTimeoutMs: 10 });
  const work = sky.list_apps();
  await assert.rejects(sky.close(), /cleanup is not proven/);
  assert.equal(driver.calls.some(c => c.tool === "end_session"), false);
  await assert.rejects(sky.invoke("list_apps"), /not admitted/);
  release(); await work; await sky.close();
});
test("foreign restored browser aliases cannot observe or dispatch any target operation", async t => {
  const path = await home(t); await persistTarget(path, true);
  const driver = new SharedDriver(); const sky = createOpenSky({ driver, homeDir: path });
  const operations = [
    () => sky.get_app_state({ app: handle }),
    () => sky.get_app_state({ app: "Test", query: "query" }),
    () => sky.click({ app: handle, element_index: 1 }),
    () => sky.type_text({ app: handle, text: "text" }),
    () => sky.scroll({ app: handle, direction: "down" }),
    () => sky.navigate({ app: handle, url: "https://example.com" }),
    () => sky.close_target({ app: handle }),
  ];
  for (const operation of operations) await assert.rejects(operation());
  assert.deepEqual(driver.calls, []);
  await sky.close();
  assert.ok(driver.calls.every(c => c.tool === "end_session" && c.args.session !== "foreign-session"));
});
test("foreign restored native close authority cannot close a window through a new proxy", async t => {
  const path = await home(t); await persistTarget(path, false);
  const driver = new SharedDriver(); const sky = createOpenSky({ driver, homeDir: path });
  await assert.rejects(sky.close_target({ app: handle }), /not owned|transport/);
  assert.deepEqual(driver.calls, []);
  await sky.close();
});
test("concurrent first target calls share a single persisted-state load", async t => {
  const path = await home(t); await persistTarget(path, true);
  const original = SessionStore.prototype.load; let loads = 0; let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  SessionStore.prototype.load = async function () { loads++; await held; return original.call(this); };
  t.after(() => { SessionStore.prototype.load = original; });
  const sky = createOpenSky({ driver: new SharedDriver(), homeDir: path });
  const calls = Promise.allSettled([sky.get_app_state({ app: handle }), sky.get_app_state({ app: handle })]);
  assert.equal(loads, 1); release(); await calls;
  await sky.close(); assert.equal(loads, 1);
});
test("dead foreign proxy lease remains unresolved and never receives a forged cleanup call", async t => {
  const path = await home(t);
  await new BrowserSessionLeaseStore(path, randomUUID(), 2_147_483_646, undefined,
    { kind: "mcp-proxy", instanceId: "old-proxy" }).reserve("foreign-session");
  const driver = new SharedDriver(); const sky = createOpenSky({ driver, homeDir: path });
  await assert.rejects(sky.close(), /Unresolved browser ownership/);
  assert.ok(driver.calls.every(c => c.args.session !== "foreign-session"));
  await assert.rejects(sky.list_apps(), /not admitted/);
});
test("whole-method close waits for ledger persistence after the last completed driver call", async t => {
  const path = await home(t); await persistTarget(path, false);
  const saved = JSON.parse(await readFile(join(path, "session.json"), "utf8"));
  saved.targets[handle].contentScope = "web";
  await writeFile(join(path, "session.json"), JSON.stringify(saved));
  const driver = new SharedDriver();
  const cliBoundary: DriverClient = {
    sessionOwnership: { kind: "cli-explicit" },
    call: driver.call.bind(driver), status: driver.status.bind(driver), ensureDaemon: driver.ensureDaemon.bind(driver),
  };
  let entered!: () => void; let release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  const original = SessionStore.prototype.save;
  SessionStore.prototype.save = async function (state) { entered(); await held; return original.call(this, state); };
  t.after(() => { SessionStore.prototype.save = original; });
  const sky = createOpenSky({ driver: cliBoundary, homeDir: path, settleDelayMs: 0 });
  const operation = sky.get_app_state({ app: handle, includeAppChrome: true, includeScreenshot: false });
  const rejected = assert.rejects(operation, /not admitted/);
  await started;
  let closed = false; const closing = sky.close().then(() => { closed = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(closed, false);
  assert.deepEqual(driver.calls, []);
  release(); await rejected; await closing;
  assert.deepEqual(driver.calls.map(call => call.tool), ["end_session"]);
});
