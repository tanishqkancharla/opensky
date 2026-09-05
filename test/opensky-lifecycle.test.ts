import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { createOpenSky, type OpenSky } from "../src/opensky.js";
import type { DriverCall, DriverClient, DriverResult, PersistedSession } from "../src/types.js";

/**
 * Pure contract fixtures for the library lifecycle boundary. These tests do
 * not launch a helper, driver, browser, or GUI and are not acceptance evidence.
 */

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function result(structured: unknown): DriverResult {
  return { structured, text: JSON.stringify(structured), raw: structured };
}

function isCode(code: string): (error: unknown) => boolean {
  return (error) => {
    assert.equal((error as { code?: unknown }).code, code);
    return true;
  };
}

class LifecycleContractDriver implements DriverClient {
  readonly sessionOwnership = { kind: "mcp-proxy" as const, instanceId: "shared-contract-proxy" };
  readonly calls: DriverCall[] = [];
  readonly statusEntered: string[] = [];
  ensureDaemonCalls = 0;
  closeTransportCalls = 0;
  failEndSessionCount = 0;
  holdListApps: ReturnType<typeof deferred> | undefined;
  readonly listAppsEntered = deferred<void>();
  afterHeldListApps: (() => Promise<void>) | undefined;

  async call(tool: string, args: Record<string, unknown> = {}): Promise<DriverResult> {
    this.calls.push({ tool, args: { ...args } });
    if (tool === "list_apps") {
      this.listAppsEntered.resolve();
      if (this.holdListApps) await this.holdListApps.promise;
      await this.afterHeldListApps?.();
      return result({ apps: [] });
    }
    if (tool === "end_session") {
      if (this.failEndSessionCount > 0) {
        this.failEndSessionCount -= 1;
        throw new Error("injected end_session failure");
      }
      return result({ session: args.session, active: false });
    }
    if (tool === "list_windows") return result({ windows: [] });
    return result({ status: "ok" });
  }

  async status(): Promise<{ running: boolean; text: string }> {
    this.statusEntered.push("status");
    return { running: true, text: "running" };
  }

  async ensureDaemon(): Promise<void> {
    this.ensureDaemonCalls += 1;
  }

  // Not part of DriverClient: this spy proves an injected transport remains caller-owned.
  async closeTransport(): Promise<void> {
    this.closeTransportCalls += 1;
  }
}

async function temporaryHome(label: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `opensky-lifecycle-${label}-`));
}

async function removeHomes(...homes: string[]): Promise<void> {
  await Promise.all(homes.map((home) => rm(home, { recursive: true, force: true })));
}

describe("OpenSky library lifecycle", () => {
  it("closes admission synchronously, drains a held operation, and refuses later nested dispatch", { timeout: 2_000 }, async () => {
    const home = await temporaryHome("drain");
    const driver = new LifecycleContractDriver();
    const held = deferred<void>();
    driver.holdListApps = held;
    const sky = createOpenSky({ driver, homeDir: home, drainTimeoutMs: 1_000 });
    let nestedError: unknown;
    driver.afterHeldListApps = async () => {
      try {
        await sky.driver.call("list_windows", {});
      } catch (error) {
        nestedError = error;
      }
    };

    try {
      const read = sky.list_apps();
      await driver.listAppsEntered.promise;
      const closing = sky.close();
      assert.equal(sky.close(), closing, "concurrent close calls must share one attempt");

      await assert.rejects(() => sky.list_apps(), isCode("runtime_closed"));
      await assert.rejects(() => sky.driver.call("list_windows", {}), isCode("runtime_closed"));
      await assert.rejects(() => sky.driver.status(), isCode("runtime_closed"));
      await assert.rejects(() => sky.driver.ensureDaemon(), isCode("runtime_closed"));
      assert.equal(driver.calls.some((call) => call.tool === "end_session"), false);

      held.resolve();
      await read;
      await closing;
      assert.equal((nestedError as { code?: unknown })?.code, "runtime_closed");
      assert.equal(driver.calls.some((call) => call.tool === "list_windows"), false);
      assert.equal(driver.statusEntered.length, 0);
      assert.equal(driver.ensureDaemonCalls, 0);
      assert.equal(driver.calls.filter((call) => call.tool === "end_session").length, 1);
    } finally {
      held.resolve();
      await sky.close().catch(() => undefined);
      await removeHomes(home);
    }
  });

  it("isolates sessionless calls for two users of one caller-owned driver", { timeout: 2_000 }, async () => {
    const firstHome = await temporaryHome("shared-a");
    const secondHome = await temporaryHome("shared-b");
    const driver = new LifecycleContractDriver();
    const first = createOpenSky({ driver, homeDir: firstHome });
    const second = createOpenSky({ driver, homeDir: secondHome });

    try {
      await first.list_apps();
      await second.list_apps();
      const [firstSession, secondSession] = driver.calls
        .filter((call) => call.tool === "list_apps")
        .map((call) => String(call.args.session));
      assert.match(firstSession!, /^opensky-\d+-[0-9a-f]{8}$/);
      assert.match(secondSession!, /^opensky-\d+-[0-9a-f]{8}$/);
      assert.notEqual(firstSession, secondSession);

      await first.driver.call("list_windows", { session: "exact-browser-session" });
      assert.equal(driver.calls.at(-1)?.args.session, "exact-browser-session", "explicit browser labels stay exact");

      await first.close();
      assert.deepEqual(
        driver.calls.filter((call) => call.tool === "end_session").map((call) => call.args.session),
        [firstSession],
      );
      assert.equal(driver.closeTransportCalls, 0, "an injected driver remains caller-owned");

      await second.list_apps();
      assert.equal(driver.calls.at(-1)?.args.session, secondSession, "closing one wrapper must not end the other");
      await second.close();
      assert.deepEqual(
        driver.calls.filter((call) => call.tool === "end_session").map((call) => call.args.session),
        [firstSession, secondSession],
      );
      assert.equal(driver.closeTransportCalls, 0);
    } finally {
      await first.close().catch(() => undefined);
      await second.close().catch(() => undefined);
      await removeHomes(firstHome, secondHome);
    }
  });

  it("keeps admission closed and skips finalization after a drain timeout until an explicit retry", { timeout: 2_000 }, async () => {
    const home = await temporaryHome("timeout");
    const driver = new LifecycleContractDriver();
    const held = deferred<void>();
    driver.holdListApps = held;
    const sky = createOpenSky({ driver, homeDir: home, drainTimeoutMs: 30 });

    try {
      const read = sky.list_apps();
      await driver.listAppsEntered.promise;
      await assert.rejects(() => sky.close(), isCode("runtime_drain_timeout"));
      assert.equal(driver.calls.some((call) => call.tool === "end_session"), false);
      await assert.rejects(() => sky.list_apps(), isCode("runtime_closed"));
      await assert.rejects(() => sky.driver.call("list_windows", {}), isCode("runtime_closed"));

      held.resolve();
      await read;
      await sky.close();
      assert.equal(driver.calls.filter((call) => call.tool === "end_session").length, 1);
    } finally {
      held.resolve();
      await sky.close().catch(() => undefined);
      await removeHomes(home);
    }
  });

  it("retries the same exact base-session cleanup after finalization fails without reopening admission", { timeout: 2_000 }, async () => {
    const home = await temporaryHome("retry");
    const driver = new LifecycleContractDriver();
    driver.failEndSessionCount = 1;
    const sky = createOpenSky({ driver, homeDir: home });

    try {
      await sky.list_apps();
      const baseSession = driver.calls.find((call) => call.tool === "list_apps")?.args.session;
      await assert.rejects(() => sky.close(), /injected end_session failure/);
      await assert.rejects(() => sky.list_apps(), isCode("runtime_closed"));
      await sky.close();
      await sky.close();
      assert.deepEqual(
        driver.calls.filter((call) => call.tool === "end_session").map((call) => call.args.session),
        [baseSession, baseSession],
      );
    } finally {
      await sky.close().catch(() => undefined);
      await removeHomes(home);
    }
  });

  it("single-flights simultaneous session-store loads through the internal test seam", { timeout: 2_000 }, async () => {
    const home = await temporaryHome("load");
    const driver = new LifecycleContractDriver();
    const sky = createOpenSky({ driver, homeDir: home });
    const loadRelease = deferred<void>();
    let loads = 0;
    const emptySession: PersistedSession = {
      version: 2,
      targets: {},
      aliases: {},
      trees: {},
      managedBrowserSessions: [],
    };
    const internal = sky as OpenSky & {
      store: { load(): Promise<PersistedSession> };
      ensureLoaded(): Promise<void>;
    };
    internal.store.load = async () => {
      loads += 1;
      await loadRelease.promise;
      return emptySession;
    };

    try {
      const first = internal.ensureLoaded();
      const second = internal.ensureLoaded();
      assert.equal(loads, 1);
      loadRelease.resolve();
      await Promise.all([first, second]);
      assert.equal(loads, 1);
      await internal.ensureLoaded();
      assert.equal(loads, 1);
    } finally {
      loadRelease.resolve();
      await sky.close().catch(() => undefined);
      await removeHomes(home);
    }
  });
});
