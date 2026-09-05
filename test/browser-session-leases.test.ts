import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, writeFile, rename, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { BrowserSessionLeaseStore } from "../src/browser-session-leases.js";

const deadPid = 2_147_483_646;
const now = () => new Date("2026-09-05T00:00:00Z");
const proxy = (instanceId = "proxy-one") => ({ kind: "mcp-proxy" as const, instanceId });
async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const home = await mkdtemp(join(tmpdir(), "opensky-transport-leases-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  return home;
}
async function records(home: string) {
  const dir = join(home, "browser-session-leases");
  return Promise.all((await readdir(dir)).filter(name => name.endsWith(".lease")).map(async name => {
    const path = join(dir, name);
    return { path, record: JSON.parse(await readFile(join(path, "lease.json"), "utf8")) };
  }));
}
test("new CLI and proxy records preserve their explicit transport; only reserver releases", async t => {
  const home = await fixture(t);
  const cli = new BrowserSessionLeaseStore(home, randomUUID());
  const mcp = new BrowserSessionLeaseStore(home, randomUUID(), process.pid, now, proxy());
  await cli.reserve("cli"); await mcp.reserve("mcp");
  const saved = await records(home);
  assert.deepEqual(saved.map(x => [x.record.session, x.record.version, x.record.transport]).sort(),
    [["cli", 2, { kind: "cli-explicit" }], ["mcp", 2, proxy()]]);
  await cli.release("mcp"); await mcp.release("cli");
  assert.equal((await records(home)).length, 2);
  await cli.release("cli"); await mcp.release("mcp");
  assert.deepEqual(await mcp.unresolvedLeases(), []);
});
test("CLI recovers dead v1 leases without changing historical transport meaning", async t => {
  const home = await fixture(t);
  await new BrowserSessionLeaseStore(home, randomUUID(), deadPid).reserve("old");
  const old = (await records(home))[0]!;
  old.record.version = 1; delete old.record.transport;
  await writeFile(join(old.path, "lease.json"), JSON.stringify(old.record));
  const mcp = new BrowserSessionLeaseStore(home, randomUUID(), process.pid, now, proxy());
  assert.deepEqual(await mcp.claimDeadOwners(), []);
  assert.equal((await mcp.unresolvedLeases())[0]?.reason, "transport-mismatch");
  const cli = new BrowserSessionLeaseStore(home, randomUUID());
  assert.deepEqual(await cli.claimDeadOwners(), ["old"]);
  assert.deepEqual((await records(home))[0]?.record.transport, { kind: "cli-explicit" });
  await cli.release("old");
});
test("dead proxy leases are never adopted by replacement proxy or CLI, even with same label", async t => {
  const home = await fixture(t);
  await new BrowserSessionLeaseStore(home, randomUUID(), deadPid, now, proxy()).reserve("old-proxy");
  for (const transport of [{ kind: "cli-explicit" } as const, proxy("replacement"), proxy()]) {
    const next = new BrowserSessionLeaseStore(home, randomUUID(), process.pid, now, transport);
    assert.deepEqual(await next.claimDeadOwners(), []);
    await next.release("old-proxy");
    const unresolved = await next.unresolvedLeases();
    assert.equal(unresolved.length, 1);
    assert.equal(unresolved[0]?.ownerMayBeAlive, false);
  }
  assert.equal((await records(home)).length, 1);
});
test("same live proxy/runtime may reopen its own record but never a sibling runtime", async t => {
  const home = await fixture(t); const id = randomUUID();
  await new BrowserSessionLeaseStore(home, id, process.pid, now, proxy()).reserve("own");
  const sibling = new BrowserSessionLeaseStore(home, randomUUID(), process.pid, now, proxy());
  assert.deepEqual(await sibling.claimDeadOwners(), []);
  assert.equal((await sibling.unresolvedLeases())[0]?.ownerMayBeAlive, true);
  const own = new BrowserSessionLeaseStore(home, id, process.pid, now, proxy());
  assert.deepEqual(await own.claimDeadOwners(), ["own"]);
  await own.release("own");
  assert.deepEqual(await own.unresolvedLeases(), []);
});
test("legacy import stays CLI even from proxy store and does not overwrite opaque record", async t => {
  const home = await fixture(t);
  const mcp = new BrowserSessionLeaseStore(home, randomUUID(), process.pid, now, proxy());
  await mcp.importLegacy("legacy", deadPid);
  assert.deepEqual((await records(home))[0]?.record.transport, { kind: "cli-explicit" });
  assert.deepEqual(await mcp.claimDeadOwners(), []);
  const saved = (await records(home))[0]!;
  await writeFile(join(saved.path, "lease.json"), "not json");
  await mcp.importLegacy("legacy", deadPid);
  assert.equal(await readFile(join(saved.path, "lease.json"), "utf8"), "not json");
  assert.equal((await mcp.unresolvedLeases())[0]?.reason, "malformed");
});
test("malformed, unknown transport and temporary crash records remain visible and untouched", async t => {
  const home = await fixture(t);
  const cli = new BrowserSessionLeaseStore(home, randomUUID());
  await new BrowserSessionLeaseStore(home, randomUUID(), deadPid).reserve("unknown");
  const saved = (await records(home))[0]!;
  saved.record.transport = { kind: "future" };
  await writeFile(join(saved.path, "lease.json"), JSON.stringify(saved.record));
  await mkdir(join(home, "browser-session-leases", "interrupted.tmp"));
  assert.deepEqual(await cli.claimDeadOwners(), []);
  const unresolved = await cli.unresolvedLeases();
  assert.equal(unresolved.length, 2);
  assert.ok(unresolved.every(x => x.reason === "malformed" && x.ownerMayBeAlive === null));
  assert.equal((await readdir(join(home, "browser-session-leases"))).length, 2);
});
test("rename-before-record-write crash uses directory owner liveness for CLI recovery", async t => {
  const home = await fixture(t);
  await new BrowserSessionLeaseStore(home, randomUUID()).reserve("crash");
  const old = (await records(home))[0]!;
  const parts = old.path.split("/").at(-1)!.split(".");
  parts[1] = String(deadPid); parts[2] = randomUUID();
  await rename(old.path, join(home, "browser-session-leases", parts.join(".")));
  const next = new BrowserSessionLeaseStore(home, randomUUID());
  assert.deepEqual(await next.claimDeadOwners(), ["crash"]);
  await next.release("crash");
  assert.deepEqual(await next.unresolvedLeases(), []);
});
test("proxy record/path mismatch and post-reservation tampering cannot grant release authority", async t => {
  const home = await fixture(t); const id = randomUUID();
  const own = new BrowserSessionLeaseStore(home, id, process.pid, now, proxy());
  await own.reserve("tampered");
  const saved = (await records(home))[0]!;
  saved.record.owner.runtimeId = randomUUID();
  await writeFile(join(saved.path, "lease.json"), JSON.stringify(saved.record));
  const reopened = new BrowserSessionLeaseStore(home, id, process.pid, now, proxy());
  assert.deepEqual(await reopened.claimDeadOwners(), []);
  await assert.rejects(own.release("tampered"), /retained/);
  assert.equal((await own.unresolvedLeases()).length, 1);
  assert.equal((await own.unresolvedLeases())[0]?.reason, "malformed");
  assert.equal((await own.unresolvedLeases())[0]?.ownerMayBeAlive, null);
});
