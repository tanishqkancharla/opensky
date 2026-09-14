import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import type { AppState, OpenSky, TargetHandle } from "opensky-cua";

const exec = promisify(execFile);
const bundleId = "com.apple.TextEdit";

type Identity = { pid: number; bundleId: string; launchedAt: number };
type Window = { title: string; windowId: number; onScreen: boolean };
type Inspection = Identity & { finishedLaunching: boolean; activationPolicy: number; windows: Window[] };
type OwnedDocument = { handle: TargetHandle; path: string; windowId: number; identity: Identity };

function sameIdentity(left: Identity, right: Identity): boolean {
  return left.pid === right.pid && left.bundleId === right.bundleId && left.launchedAt === right.launchedAt;
}

/**
 * Opens one TextEdit document through the public SDK, then independently proves
 * that its returned window belongs to a fresh NSRunningApplication receipt.
 * This fixture observer never opens, adopts, or targets a user TextEdit process.
 */
export async function withSdkOwnedMacDocument<T>(options: {
  sdk: OpenSky;
  path: string;
  artifacts: string;
}, use: (document: OwnedDocument) => Promise<T>): Promise<T> {
  if (process.platform !== "darwin") throw new Error("This fixture requires macOS");
  const temporary = await mkdtemp(join(tmpdir(), "opensky-sdk-document-lifecycle-"));
  const helper = join(temporary, "mac-app-lifecycle");
  let actionError: unknown;
  let result: T | undefined;
  let owned: OwnedDocument | undefined;
  let baseline: Identity[] = [];
  let openAttempted = false;
  try {
    await exec("/usr/bin/swiftc", [
      "-module-cache-path", join(temporary, "swift-cache"),
      fileURLToPath(new URL("../../evals/parity/mac-app-lifecycle.swift", import.meta.url)),
      "-o", helper,
    ], { timeout: 60_000 });
    const call = async (args: string[]) => exec(helper, args, { timeout: 10_000 });
    const desktop = JSON.parse((await call(["desktop-state"])).stdout) as { ready: boolean; reasons: string[] };
    await writeFile(join(options.artifacts, "desktop-before.json"), JSON.stringify({ checkedAt: new Date().toISOString(), ...desktop }, null, 2));
    if (!desktop.ready) throw new Error(`Local GUI evaluation paused: ${desktop.reasons.join(", ")}. Make the desktop visible and unlocked before rerunning.`);

    const list = async (): Promise<Identity[]> => JSON.parse((await call(["list", bundleId])).stdout) as Identity[];
    const inspect = async (identity: Identity): Promise<Inspection> =>
      JSON.parse((await call(["inspect", String(identity.pid)])).stdout) as Inspection;
    baseline = await list();
    await writeFile(join(options.artifacts, "textedit-before-open.json"), JSON.stringify({ checkedAt: new Date().toISOString(), applications: baseline }, null, 2));

    openAttempted = true;
    const opened = await options.sdk.open_target({ app: "TextEdit", targets: [options.path], includeScreenshot: false });
    const windowId = opened.target?.window.id;
    if (!Number.isInteger(windowId) || windowId! <= 0) {
      throw new Error("Public SDK open_target did not return an exact native window identity; no fixture input will be sent");
    }
    const current = await list();
    const fresh = current.filter(candidate => !baseline.some(previous => sameIdentity(previous, candidate)));
    const inspections = await Promise.all(fresh.map(async identity => ({ identity, state: await inspect(identity) })));
    const matches = inspections.filter(({ identity, state }) =>
      sameIdentity(identity, state) && identity.bundleId === bundleId && state.windows.some(window => window.windowId === windowId));
    await writeFile(join(options.artifacts, "textedit-after-open.json"), JSON.stringify({
      checkedAt: new Date().toISOString(), opened: publicIdentity(opened), baseline, current, fresh, inspections, matches,
    }, null, 2));
    if (fresh.length !== 1 || matches.length !== 1 || !sameIdentity(fresh[0]!, matches[0]!.identity)) {
      throw new Error(`SDK TextEdit target ownership is ambiguous: fresh=${fresh.length}, windowMatches=${matches.length}; no fixture input will be sent`);
    }

    const identity = matches[0]!.identity;
    const ownedDocument: OwnedDocument = { handle: opened.targetHandle, path: options.path, windowId: windowId!, identity };
    owned = ownedDocument;
    // Persist the public handle and independently observed process/window pair
    // before readiness activation or any test input. This known-owned process
    // can now receive exact cleanup even when readiness subsequently fails.
    await writeFile(join(options.artifacts, "app-ownership.json"), JSON.stringify({
      recordedAt: new Date().toISOString(), handle: ownedDocument.handle, path: ownedDocument.path, windowId, identity,
      publicTarget: opened.target, independentWindow: matches[0]!.state.windows.find(window => window.windowId === windowId),
    }, null, 2));
    let readiness: Inspection | undefined;
    let activation: unknown;
    const deadline = Date.now() + 30_000;
    do {
      readiness = await inspect(identity);
      const window = readiness.windows.find(candidate => candidate.windowId === windowId);
      if (readiness.finishedLaunching && window?.onScreen) break;
      if (activation === undefined && window) {
        activation = JSON.parse((await call(["activate", String(identity.pid), identity.bundleId, String(identity.launchedAt)])).stdout);
      }
      await delay(250);
    } while (Date.now() < deadline);
    const ready = readiness?.finishedLaunching === true && readiness.windows.some(window => window.windowId === windowId && window.onScreen);
    await writeFile(join(options.artifacts, "fixture-readiness.json"), JSON.stringify({ ready, activation, identity, windowId, state: readiness }, null, 2));
    if (!ready) throw new Error("SDK-owned TextEdit document did not become visible; selection test not started");

    result = await use(ownedDocument);
  } catch (error) {
    actionError = error;
  }

  if (owned) {
    try {
      const desktop = JSON.parse((await exec(helper, ["desktop-state"], { timeout: 10_000 })).stdout) as { ready: boolean; reasons: string[] };
      await writeFile(join(options.artifacts, "desktop-after.json"), JSON.stringify({ checkedAt: new Date().toISOString(), ...desktop }, null, 2));
      if (!desktop.ready) throw new Error(`Local GUI evaluation ended with unavailable desktop: ${desktop.reasons.join(", ")}`);
    } catch (error) {
      actionError = actionError ? new AggregateError([actionError, error], "Native document action and post-action desktop check failed") : error;
    }
  }

  let cleanupError: unknown;
  if (owned) {
    try {
      // `close_target` is the public, exact document close. Only after its
      // successful return and an independent window check may the fixture quit
      // the exact fresh process recorded above.
      await options.sdk.close_target({ app: owned.handle });
      const call = async (args: string[]) => exec(helper, args, { timeout: 10_000 });
      const list = async (): Promise<Identity[]> => JSON.parse((await call(["list", bundleId])).stdout) as Identity[];
      const running = (await list()).find(candidate => sameIdentity(candidate, owned!.identity));
      let afterClose: Inspection | undefined;
      if (running) {
        afterClose = JSON.parse((await call(["inspect", String(running.pid)])).stdout) as Inspection;
        if (afterClose.windows.some(window => window.windowId === owned!.windowId)) {
          throw new Error("Public close_target returned but the independently observed document window remains open");
        }
      }
      let quit: unknown = { skipped: "process_exited_after_document_close" };
      if (running) quit = JSON.parse((await call(["quit", String(owned.identity.pid), owned.identity.bundleId, String(owned.identity.launchedAt)])).stdout);
      const remaining = await list();
      const verifiedExited = !remaining.some(candidate => sameIdentity(candidate, owned!.identity));
      if (!verifiedExited) throw new Error("Verified SDK-owned TextEdit process remained running after cooperative quit");
      await writeFile(join(options.artifacts, "cleanup.json"), JSON.stringify({
        status: "passed", handle: owned.handle, windowId: owned.windowId, identity: owned.identity,
        closeTarget: "verified", afterClose, quit, verifiedExited, remaining,
        baselinePreservation: baseline.map(identity => ({ identity, stillPresent: remaining.some(candidate => sameIdentity(candidate, identity)) })),
        checkedAt: new Date().toISOString(),
      }, null, 2));
    } catch (error) {
      cleanupError = error;
      await writeFile(join(options.artifacts, "cleanup.json"), JSON.stringify({
        status: "failed", handle: owned.handle, windowId: owned.windowId, identity: owned.identity,
        error: String(error), checkedAt: new Date().toISOString(),
      }, null, 2));
    }
  } else {
    await writeFile(join(options.artifacts, "cleanup.json"), JSON.stringify({
      status: openAttempted ? "failed" : "passed", launched: openAttempted ? "unproven" : false, verifiedExited: !openAttempted,
      reason: openAttempted
        ? "No exact fresh SDK target identity was recorded; fixture will not close or quit any process."
        : "Desktop preflight or helper setup prevented any public open_target attempt.",
      baselinePreservation: baseline,
    }, null, 2));
  }
  await rm(temporary, { recursive: true, force: true });
  if (actionError && cleanupError) throw new AggregateError([actionError, cleanupError], "Native document action and cleanup failed");
  if (cleanupError) throw cleanupError;
  if (actionError) throw actionError;
  return result as T;
}

function publicIdentity(state: AppState) {
  return { targetHandle: state.targetHandle, target: state.target, app: state.app };
}
