#!/usr/bin/env bun
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createOpenSky } from "../src/opensky.js";
import type { AppState, OpenSkyTarget } from "../src/types.js";
import {
  ReplayDriverClient,
  type DriverTape,
  type ReplayCompatibilityReceipt,
} from "./driver-tape.js";

const RETROSPECTIVE_REPLAY_BASE_SESSION = "opensky-retrospective-replay-v1-base";

type ReplayOperation =
  | {
      method: "get_app_state";
      args: { app: string; disableDiff?: boolean; includeScreenshot?: boolean; includeAppChrome?: boolean };
    }
  | {
      method: "open_target";
      args: { app: string; targets: string[]; includeScreenshot?: boolean };
    };

export type ReplayScenario = {
  name: string;
  target: OpenSkyTarget;
  tape: string;
  expected: string;
  preferTypedBrowser?: boolean;
  operations: ReplayOperation[];
};

export type ReplayReport = {
  name: string;
  replay: {
    classification: "retrospective_driver_tape";
    acceptanceEvidence: false;
    compatibility: ReplayCompatibilityReceipt;
  };
  states: Array<Omit<AppState, "screenshot"> & { screenshot: null | string }>;
  metrics: {
    driverCalls: number;
    rawTreeCharacters: number;
    projectedCharacters: number;
    reductionRatio: number | null;
  };
};

const here = dirname(fileURLToPath(import.meta.url));

export async function replayScenario(scenarioPath: string): Promise<ReplayReport> {
  const absoluteScenario = resolve(scenarioPath);
  const scenarioDir = dirname(absoluteScenario);
  const scenario = JSON.parse(await readFile(absoluteScenario, "utf8")) as ReplayScenario;
  const tape = JSON.parse(await readFile(resolve(scenarioDir, scenario.tape), "utf8")) as DriverTape;
  const driver = new ReplayDriverClient(tape, {
    compatibility: {
      kind: "v1_implicit_base_session",
      baseSession: RETROSPECTIVE_REPLAY_BASE_SESSION,
    },
  });
  const tempHome = await mkdtemp(join(tmpdir(), "opensky-replay-"));
  try {
    const opensky = createOpenSky({
      driver,
      session: RETROSPECTIVE_REPLAY_BASE_SESSION,
      target: scenario.target,
      homeDir: tempHome,
      screenshotDir: join(tempHome, "screenshots"),
      settleDelayMs: 0,
      degradedRetryMs: 0,
      preferTypedBrowser: scenario.preferTypedBrowser,
    });
    const states: AppState[] = [];
    for (const operation of scenario.operations) {
      states.push(operation.method === "open_target"
        ? await opensky.open_target(operation.args)
        : await opensky.get_app_state(operation.args));
    }
    driver.assertExhausted();

    const rawTreeCharacters = tape.calls.reduce(
      (sum, call) => sum + (call.observed?.treeCharacters ?? treeCharacters(call.result?.structured)),
      0,
    );
    const canonicalStates = states.map((state) => ({
      ...state,
      targetHandle: "<TARGET_HANDLE>" as AppState["targetHandle"],
      target: state.target
        ? { ...state.target, handle: "<TARGET_HANDLE>" as AppState["targetHandle"] }
        : undefined,
      screenshot: state.screenshot ? "<SCREENSHOT>" : null,
    }));
    const projectedCharacters = canonicalStates.reduce((sum, state) => sum + state.text.length, 0);
    return {
      name: scenario.name,
      replay: {
        classification: "retrospective_driver_tape",
        acceptanceEvidence: false,
        compatibility: driver.compatibilityReceipt!,
      },
      states: canonicalStates,
      metrics: {
        driverCalls: tape.calls.length,
        rawTreeCharacters,
        projectedCharacters,
        reductionRatio: rawTreeCharacters > 0
          ? Math.round((projectedCharacters / rawTreeCharacters) * 10000) / 10000
          : null,
      },
    };
  } finally {
    // Replay is inert: remove only its private local state. Calling close()
    // would invent end_session calls that do not exist in the frozen tape.
    await rm(tempHome, { recursive: true, force: true });
  }
}

async function main(argv = process.argv.slice(2)): Promise<number> {
  const scenarioPath = argv[0] ?? join(here, "fixtures", "real-driver", "github-repository", "scenario.json");
  const scenario = JSON.parse(await readFile(resolve(scenarioPath), "utf8")) as ReplayScenario;
  const report = await replayScenario(scenarioPath);
  const expectedPath = resolve(dirname(resolve(scenarioPath)), scenario.expected);
  const expected = `${JSON.stringify(JSON.parse(await readFile(expectedPath, "utf8")), null, 2)}\n`;
  const actual = `${JSON.stringify(report, null, 2)}\n`;
  // Frozen v1 expected files describe only the historical projection. The
  // additive replay receipt is printed, but is not retroactively written into
  // or treated as new acceptance evidence for those fixtures.
  const historicalProjection = `${JSON.stringify({
    name: report.name,
    states: report.states,
    metrics: report.metrics,
  }, null, 2)}\n`;
  if (historicalProjection !== expected) {
    process.stderr.write(`Replay output differs from ${expectedPath}.\n`);
    process.stdout.write(actual);
    return 1;
  }
  process.stdout.write(actual);
  return 0;
}

function treeCharacters(value: unknown): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  const record = value as Record<string, unknown>;
  if (typeof record.tree_markdown === "string") return record.tree_markdown.length;
  return typeof record.text === "string" ? record.text.length : 0;
}

if (import.meta.main) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
