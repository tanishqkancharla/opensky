#!/usr/bin/env bun
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createOpenSky } from "../src/opensky.js";
import type { AppState, OpenSkyTarget } from "../src/types.js";
import { ReplayDriverClient, type DriverTape } from "./driver-tape.js";

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
  const driver = new ReplayDriverClient(tape);
  const tempHome = await mkdtemp(join(tmpdir(), "opensky-replay-"));
  const opensky = createOpenSky({
    driver,
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
    screenshot: state.screenshot ? "<SCREENSHOT>" : null,
  }));
  const projectedCharacters = canonicalStates.reduce((sum, state) => sum + state.text.length, 0);
  return {
    name: scenario.name,
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
}

async function main(argv = process.argv.slice(2)): Promise<number> {
  const scenarioPath = argv[0] ?? join(here, "fixtures", "real-driver", "github-repository", "scenario.json");
  const scenario = JSON.parse(await readFile(resolve(scenarioPath), "utf8")) as ReplayScenario;
  const report = await replayScenario(scenarioPath);
  const expectedPath = resolve(dirname(resolve(scenarioPath)), scenario.expected);
  const expected = `${JSON.stringify(JSON.parse(await readFile(expectedPath, "utf8")), null, 2)}\n`;
  const actual = `${JSON.stringify(report, null, 2)}\n`;
  if (actual !== expected) {
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
