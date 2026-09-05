#!/usr/bin/env node
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { withEvalArtifactPaths } from "./artifacts.js";
import {
  getEvalCases,
  withEvalFileRegistration,
  type EvalCaseRecord,
  type EvalHarnessName,
  type EvalScore,
} from "./eval-case.js";
import { ComputerUseHarness, type ModelSelector } from "./harness.js";
import { claimEvalVm } from "./vm.js";
import { CuaDriverClient } from "../src/driver.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const evalsRoot = here;
const HARNESSES: EvalHarnessName[] = ["opensky", "cua-driver", "codex"];
const DEFAULT_MODEL: ModelSelector = "openai/gpt-5.6-terra";

type CliOptions = {
  outputDir: string;
  harnesses: EvalHarnessName[];
  model: ModelSelector;
  fileFilters: string[];
  namePattern: string | null;
  timeoutMs: number;
  local: boolean;
  list: boolean;
};

const HELP = `opensky evals — compare computer-use harnesses on Cua Fleet VMs

Usage:
  npm run evals -- [--harness opensky,cua-driver,codex] [--model openai/gpt-5.6-terra]
  npm run evals -- terminal-echo.eval.ts --harness opensky

Options:
  --harness <id[,id]>   opensky | cua-driver | codex   (default: all three)
  --model <provider/id> Agent and judge model            (default: openai/gpt-5.6-terra)
  -t <pattern>           Filter cases by name
  --output <dir>        Run directory (default: evals/runs/<timestamp>)
  --timeout <ms>        Per-case timeout (default: 180000)
  --help, -h             Show this help
  --local               Use this machine's real Cua Driver (no Fleet or VM)
  --list                Validate and list cases without running agents or GUI

Environment:
  FLEETS_TOKEN or CUA_CLIENT_ID + CUA_CLIENT_SECRET
  CUA_POOL_NAME          Fleet pool name (default: opensky-evals)
  CUA_EVAL_IMAGE         Fleet image (default: Cua Omarchy Linux)
  CUA_EVAL_OS            linux | macos | windows
  OPENAI_API_KEY         For Pi gpt-5.6-terra
`;

async function main(argv = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(argv);
  if (!options) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }

  const files = await discoverEvalFiles(options.fileFilters);
  if (files.length === 0) throw new Error("No eval files matched.");
  const cases = selectCases(await importEvalFiles(files), options.namePattern);
  if (cases.length === 0) throw new Error("No eval cases matched.");
  if (process.env.CI && cases.some((item) => item.only)) throw new Error("evalCase.only is forbidden in CI");
  if (options.list) {
    for (const item of cases) process.stdout.write(`${item.name}\n`);
    return 0;
  }

  await mkdir(options.outputDir, { recursive: true });
  const startedAt = new Date().toISOString();
  const results: CaseResult[] = [];
  if (options.local) {
    if (options.harnesses.some((name) => name !== "opensky")) throw new Error("--local currently supports --harness opensky only; native parity needs a provisioned native plugin.");
    const driver = new CuaDriverClient({ binaryPath: process.env.CUA_DRIVER_BINARY, socket: process.env.CUA_DRIVER_SOCKET, autoInstall: false, autoStart: false });
    const status = await driver.status();
    const permissions = await driver.permissionStatus();
    await writeFile(join(options.outputDir, "preflight.json"), JSON.stringify({ status, permissions }, null, 2));
    if (!status.running) throw new Error("Infrastructure failure: real Cua Driver is not running. See preflight.json.");
    // AX/screenshot capability is exercised by the real cases; never replace it with a mock.
  }

  for (const evalCase of cases) {
    for (const harnessName of options.harnesses) {
      process.stdout.write(`\n▶ ${evalCase.name} [${harnessName}]\n`);
      const result = await runCase(evalCase, harnessName, options);
      results.push(result);
      await writeFile(join(options.outputDir, "summary.json"), `${JSON.stringify(buildSummary(results, options, startedAt), null, 2)}\n`);
      if (result.status === "completed") {
        process.stdout.write(
          `✓ ${evalCase.name} [${harnessName}] ${result.score.passed}/${result.score.total} (${result.score.percent}%)\n`,
        );
      } else {
        process.stdout.write(`✗ ${evalCase.name} [${harnessName}]\n${result.error ?? "error"}\n`);
      }
      // An error can include uncertain cleanup. Do not expose the next case to leftovers.
      if (result.status === "error") break;
    }
    if (results.at(-1)?.status === "error") break;
  }

  const summary = buildSummary(results, options, startedAt);
  await writeFile(join(options.outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(join(options.outputDir, "summary.md"), `${renderSummaryMarkdown(summary)}\n`);
  process.stdout.write(`\n${renderSummaryMarkdown(summary)}\n`);
  process.stdout.write(`Wrote ${relative(repoRoot, options.outputDir)}/summary.json\n`);
  return results.some((result) => result.status !== "completed" || result.score.total === 0 || result.score.passed !== result.score.total) ? 1 : 0;
}

type CaseResult = {
  name: string;
  harness: EvalHarnessName;
  status: "completed" | "error";
  durationMs: number;
  score: { passed: number; total: number; percent: number };
  criteria: EvalScore["criteria"];
  error?: string;
  artifacts: { result: string; transcript: string; transcriptMarkdown: string };
};

async function runCase(
  evalCase: EvalCaseRecord,
  harnessName: EvalHarnessName,
  options: CliOptions,
): Promise<CaseResult> {
  const id = slug(`${evalCase.name}-${harnessName}`);
  const caseDir = join(options.outputDir, "cases", id);
  await mkdir(caseDir, { recursive: true });
  const artifactPaths = {
    transcript: join(caseDir, "transcript.jsonl"),
    transcriptMarkdown: join(caseDir, "transcript.md"),
    judgeEvents: join(caseDir, "judge-events.jsonl"),
    judgeTranscript: join(caseDir, "judge-transcript.md"),
  };
  const started = Date.now();
  let vm: Awaited<ReturnType<typeof claimEvalVm>> | null = null;
  try {
    if (!options.local) vm = await claimEvalVm();
    const workspace = join(caseDir, "workspace");
    await mkdir(workspace, { recursive: true });
    const harness = new ComputerUseHarness({
      cwd: workspace,
      model: options.model,
      harness: harnessName,
      vm: vm ?? undefined,
      timeoutMs: options.timeoutMs,
    });
    const score = await withEvalArtifactPaths(artifactPaths, async () => {
        const returned = await evalCase.run({ harness });
        if (!returned) {
          throw new Error("evalCase must return response.score([...]).");
        }
        return returned;
      });
    const result: CaseResult = {
      name: evalCase.name,
      harness: harnessName,
      status: "completed",
      durationMs: Date.now() - started,
      score: { passed: score.passed, total: score.total, percent: score.percent },
      criteria: score.criteria,
      artifacts: {
        result: relative(options.outputDir, join(caseDir, "result.json")),
        transcript: relative(options.outputDir, artifactPaths.transcript),
        transcriptMarkdown: relative(options.outputDir, artifactPaths.transcriptMarkdown),
      },
    };
    await writeFile(join(caseDir, "result.json"), `${JSON.stringify({ ...result, score }, null, 2)}\n`);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result: CaseResult = {
      name: evalCase.name,
      harness: harnessName,
      status: "error",
      durationMs: Date.now() - started,
      score: { passed: 0, total: 0, percent: 0 },
      criteria: [],
      error: message,
      artifacts: {
        result: relative(options.outputDir, join(caseDir, "result.json")),
        transcript: relative(options.outputDir, artifactPaths.transcript),
        transcriptMarkdown: relative(options.outputDir, artifactPaths.transcriptMarkdown),
      },
    };
    await writeFile(join(caseDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
    return result;
  } finally {
    await vm?.close();
  }
}

function buildSummary(results: CaseResult[], options: CliOptions, startedAt: string) {
  const byHarness: Record<string, { passed: number; total: number; cases: number; errors: number }> = {};
  for (const harness of options.harnesses) {
    byHarness[harness] = { passed: 0, total: 0, cases: 0, errors: 0 };
  }
  for (const result of results) {
    const bucket = byHarness[result.harness] ?? (byHarness[result.harness] = { passed: 0, total: 0, cases: 0, errors: 0 });
    bucket.cases += 1;
    if (result.status === "error") bucket.errors += 1;
    bucket.passed += result.score.passed;
    bucket.total += result.score.total;
  }
  return {
    generatedAt: new Date().toISOString(),
    commit: process.env.GITHUB_SHA ?? null,
    runId: process.env.GITHUB_RUN_ID ?? null,
    environment: options.local ? "local-real-driver" : "fleet",
    startedAt,
    model: options.model,
    harnesses: options.harnesses,
    outputDir: options.outputDir,
    byHarness,
    results,
  };
}

function renderSummaryMarkdown(summary: ReturnType<typeof buildSummary>): string {
  const lines = ["# opensky evals", "", `Model: \`${summary.model}\``, ""];
  for (const [harness, stats] of Object.entries(summary.byHarness)) {
    const percent = stats.total ? Math.round((stats.passed / stats.total) * 100) : 0;
    lines.push(`- **${harness}**: ${stats.passed}/${stats.total} criteria (${percent}%), ${stats.errors} errors`);
  }
  return lines.join("\n");
}

function parseArgs(argv: string[]): CliOptions | null {
  const fileFilters: string[] = [];
  let harnesses = [...HARNESSES];
  let model: ModelSelector = DEFAULT_MODEL;
  let namePattern: string | null = null;
  let outputDir: string | null = null;
  let timeoutMs = 180_000;
  let local = false;
  let list = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") return null;
    if (arg === "--") continue;
    if (arg === "--local") { local = true; continue; }
    if (arg === "--list") { list = true; continue; }
    if (arg === "--harness" || arg.startsWith("--harness=")) {
      const value = arg === "--harness" ? argv[++i] : arg.slice("--harness=".length);
      harnesses = value.split(",").map((item) => parseHarness(item.trim()));
    } else if (arg === "--model" || arg.startsWith("--model=")) {
      const value = arg === "--model" ? argv[++i] : arg.slice("--model=".length);
      model = parseModel(value);
    } else if (arg === "-t" || arg === "--name") {
      namePattern = argv[++i] ?? null;
    } else if (arg === "--output" || arg.startsWith("--output=")) {
      outputDir = arg === "--output" ? argv[++i] : arg.slice("--output=".length);
    } else if (arg === "--timeout" || arg.startsWith("--timeout=")) {
      const value = arg === "--timeout" ? argv[++i] : arg.slice("--timeout=".length);
      timeoutMs = Number(value);
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown flag: ${arg}`);
    } else {
      fileFilters.push(arg);
    }
  }
  return {
    local,
    list,
    outputDir: outputDir ? resolve(outputDir) : join(evalsRoot, "runs", timestamp()),
    harnesses,
    model,
    fileFilters,
    namePattern,
    timeoutMs,
  };
}

function parseHarness(value: string): EvalHarnessName {
  if (value === "opensky" || value === "cua-driver" || value === "codex") return value;
  throw new Error(`Unknown harness "${value}". Use opensky, cua-driver, or codex.`);
}

function parseModel(value: string): ModelSelector {
  const slash = value.indexOf("/");
  if (slash <= 0 || slash === value.length - 1) {
    throw new Error(`Invalid model "${value}". Expected provider/model.`);
  }
  return value as ModelSelector;
}

async function collectEvalFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "runs" && entry.name !== "scripts" && entry.name !== "node_modules") {
      files.push(...(await collectEvalFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith(".eval.ts")) {
      files.push(path);
    }
  }
  return files.sort();
}

async function discoverEvalFiles(fileFilters: string[]): Promise<string[]> {
  const files = await collectEvalFiles(evalsRoot);
  if (fileFilters.length === 0) return files;
  return files.filter((file) => fileFilters.some((filter) => file.includes(filter)));
}

async function importEvalFiles(files: string[]): Promise<EvalCaseRecord[]> {
  for (const file of files) {
    await withEvalFileRegistration(file, async () => {
      await import(pathToFileURL(file).href);
    });
  }
  return getEvalCases();
}

function selectCases(cases: EvalCaseRecord[], namePattern: string | null): EvalCaseRecord[] {
  const filtered = namePattern
    ? cases.filter((item) => item.name.toLowerCase().includes(namePattern.toLowerCase()))
    : cases;
  const only = filtered.filter((item) => item.only);
  return only.length > 0 ? only : filtered;
}

function slug(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "case";
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

if (import.meta.main) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
