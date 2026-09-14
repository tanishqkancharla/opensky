import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { AppState, OpenSky, TargetHandle } from "opensky-cua";
import { lifecycleFacade } from "./native-open-facade.js";
import { finishNativeOpen } from "./native-open-outcome.js";
import { test as base } from "./sdk.js";

const exec = promisify(execFile);
const bundleId = "com.apple.TextEdit";
type Identity = { pid: number; bundleId: string; launchedAt: number };
type Inspection = Identity & { windows: Array<{ windowId: number }> };
type OwnedDocument = { handle: TargetHandle; windowId: number; identity: Identity; closed: boolean };
type NativeLifecycle = { directory: string; artifacts: string; sibling: string; requested: string };
type NativeFixtures = { lifecycle: NativeLifecycle; sdk: OpenSky; files: { sibling: string; requested: string } };

function sameIdentity(left: Identity, right: Identity): boolean {
  return left.pid === right.pid && left.bundleId === right.bundleId && left.launchedAt === right.launchedAt;
}

/** Observes OPEN-N01's unchanged public SDK calls without adopting a user app. */
async function withOwnedNativeOpenDocuments<T>(realSdk: OpenSky, artifacts: string, use: (sdk: OpenSky) => Promise<T>): Promise<T> {
  const helperDirectory = await mkdtemp(join(tmpdir(), "opensky-native-open-lifecycle-"));
  const helper = join(helperDirectory, "mac-app-lifecycle");
  let baseline: Identity[] = [];
  const owned: OwnedDocument[] = [];
  let openAttempted = false;
  let ownershipUnknown = false;
  let result: T | undefined;
  let completed = false;
  let actionError: unknown;
  let cleanupError: unknown;
  try {
    await exec("/usr/bin/swiftc", ["-module-cache-path", join(helperDirectory, "swift-cache"), fileURLToPath(new URL("../../evals/parity/mac-app-lifecycle.swift", import.meta.url)), "-o", helper], { timeout: 60_000 });
    const call = async (args: string[]) => exec(helper, args, { timeout: 10_000 });
    const list = async (): Promise<Identity[]> => JSON.parse((await call(["list", bundleId])).stdout) as Identity[];
    const inspect = async (identity: Identity): Promise<Inspection> => JSON.parse((await call(["inspect", String(identity.pid)])).stdout) as Inspection;
    baseline = await list();
    await writeFile(join(artifacts, "textedit-before-open.json"), JSON.stringify({ checkedAt: new Date().toISOString(), applications: baseline }, null, 2));
    const facade = lifecycleFacade(realSdk, {
      open: async ([args]) => {
        openAttempted = true;
        let opened: AppState;
        try { opened = await realSdk.open_target(args); } catch (error) { ownershipUnknown = true; throw error; }
        const windowId = opened.target?.window.id;
        if (!Number.isInteger(windowId) || windowId! <= 0) { ownershipUnknown = true; throw new Error("Public SDK open_target did not return an exact native window identity; fixture cleanup is unproven"); }
        const current = await list();
        const fresh = current.filter(candidate => !baseline.some(previous => sameIdentity(previous, candidate)) && !owned.some(record => sameIdentity(record.identity, candidate)));
        const inspections = await Promise.all(fresh.map(async identity => ({ identity, state: await inspect(identity) })));
        const matches = inspections.filter(({ identity, state }) => sameIdentity(identity, state) && state.windows.some(window => window.windowId === windowId));
        await writeFile(join(artifacts, `textedit-after-open-${owned.length + 1}.json`), JSON.stringify({ checkedAt: new Date().toISOString(), publicTarget: publicIdentity(opened), baseline, current, fresh, inspections, matches }, null, 2));
        if (fresh.length !== 1 || matches.length !== 1 || !sameIdentity(fresh[0]!, matches[0]!.identity)) { ownershipUnknown = true; throw new Error(`SDK TextEdit target ownership is ambiguous: fresh=${fresh.length}, windowMatches=${matches.length}; preserve documents and do not clean up`); }
        const record = { handle: opened.targetHandle, windowId: windowId!, identity: matches[0]!.identity, closed: false };
        owned.push(record);
        await writeFile(join(artifacts, `app-ownership-${owned.length}.json`), JSON.stringify({ recordedAt: new Date().toISOString(), ...record, publicTarget: opened.target }, null, 2));
        return opened;
      },
      close: async ([args]) => {
        await realSdk.close_target(args);
        const record = owned.find(candidate => candidate.handle === args.app);
        if (record) {
          const running = (await list()).find(candidate => sameIdentity(candidate, record.identity));
          if (running && (await inspect(running)).windows.some(window => window.windowId === record.windowId)) throw new Error("Public close_target returned but the independently observed SDK document window remains open");
          record.closed = true;
        }
      },
    });
    try { result = await use(facade); completed = true; } catch (error) { actionError = error; }
  } catch (error) { actionError = error; } finally {
    try {
      if (!openAttempted) {
        await writeFile(join(artifacts, "cleanup.json"), JSON.stringify({ status: "not-opened", safeToRemove: true, owned, baseline, checkedAt: new Date().toISOString() }, null, 2));
      } else {
        const call = async (args: string[]) => exec(helper, args, { timeout: 10_000 });
        const list = async (): Promise<Identity[]> => JSON.parse((await call(["list", bundleId])).stdout) as Identity[];
        const inspect = async (identity: Identity): Promise<Inspection> => JSON.parse((await call(["inspect", String(identity.pid)])).stdout) as Inspection;
        const preCleanup = await list();
        const unexpectedFresh = preCleanup.filter(candidate => !baseline.some(record => sameIdentity(candidate, record)) && !owned.some(record => sameIdentity(candidate, record.identity)));
        for (const record of owned) if (!record.closed) {
          await realSdk.close_target({ app: record.handle });
          const running = (await list()).find(candidate => sameIdentity(candidate, record.identity));
          if (running && (await inspect(running)).windows.some(window => window.windowId === record.windowId)) throw new Error("Fixture close_target returned but its exact SDK document window remains open");
          record.closed = true;
        }
        for (const record of owned) if ((await list()).some(candidate => sameIdentity(candidate, record.identity))) await call(["quit", String(record.identity.pid), record.identity.bundleId, String(record.identity.launchedAt)]);
        const remaining = await list();
        const ownedExited = owned.every(record => !remaining.some(candidate => sameIdentity(candidate, record.identity)));
        const baselinePreserved = baseline.every(record => remaining.some(candidate => sameIdentity(candidate, record)));
        const fullScenario = owned.length === 2 && !ownershipUnknown;
        const safeToRemove = ownedExited && baselinePreserved && !ownershipUnknown && unexpectedFresh.length === 0;
        await writeFile(join(artifacts, "cleanup.json"), JSON.stringify({ status: fullScenario ? "passed" : "partial", safeToRemove, owned, baseline, preCleanup, remaining, ownedExited, baselinePreserved, ownershipUnknown, unexpectedFresh, checkedAt: new Date().toISOString() }, null, 2));
        if (!ownedExited || !baselinePreserved || ownershipUnknown || unexpectedFresh.length || !fullScenario) throw new Error(`Native cleanup verification failed: fullScenario=${fullScenario}, ownedExited=${ownedExited}, baselinePreserved=${baselinePreserved}, ownershipUnknown=${ownershipUnknown}, unexpectedFresh=${unexpectedFresh.length}`);
      }
    } catch (error) {
      cleanupError = error;
      await writeFile(join(artifacts, "cleanup.json"), JSON.stringify({ status: "failed", safeToRemove: false, owned, baseline, error: String(error), checkedAt: new Date().toISOString() }, null, 2));
    } finally {
      await rm(helperDirectory, { recursive: true, force: true });
    }
  }
  return finishNativeOpen(result as T, completed, actionError, cleanupError);
}

export const test = base.extend<NativeFixtures>({
  lifecycle: async ({}, use) => {
    if (process.platform !== "darwin") throw new Error("This fixture requires macOS TextEdit.");
    const directory = await mkdtemp(join(tmpdir(), "opensky-native-open-"));
    const artifacts = await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR ?? tmpdir(), "native-open-"));
    const sibling = join(directory, "sibling", "sdk-draft.txt");
    const requested = join(directory, "requested", "sdk-draft.txt");
    await mkdir(join(directory, "sibling")); await mkdir(join(directory, "requested"));
    await writeFile(sibling, "Sibling document must remain open.\n"); await writeFile(requested, "Requested document: α 😀 exact file.\n");
    try { await use({ directory, artifacts, sibling, requested }); }
    finally {
      const cleanup = await readFile(join(artifacts, "cleanup.json"), "utf8").then(JSON.parse).catch(() => null);
      const temporaryRemoved = cleanup?.safeToRemove === true;
      if (temporaryRemoved) await rm(directory, { recursive: true, force: true });
      await writeFile(join(artifacts, "fixture-cleanup.json"), JSON.stringify({ temporaryRemoved, directory, cleanup }, null, 2));
      if (!temporaryRemoved) console.error(`Native open cleanup unproven; preserved ${directory}`);
      console.info(`Native open evidence: ${artifacts}`);
    }
  },
  sdk: async ({ sdk: realSdk, lifecycle }, use) => { await withOwnedNativeOpenDocuments(realSdk, lifecycle.artifacts, use); },
  files: async ({ lifecycle }, use) => { await use({ sibling: lifecycle.sibling, requested: lifecycle.requested }); },
});

function publicIdentity(state: AppState) { return { targetHandle: state.targetHandle, target: state.target, app: state.app }; }
