#!/usr/bin/env bun
/**
 * Claim a Cua Fleet macOS VM and run OpenSky against the real desktop helper.
 *
 *   set -a && source .env && set +a
 *   CUA_EVAL_OS=macos bun evals/macos-compat.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createOpenSky } from "../src/opensky.js";
import { FleetMcpDriver } from "./mcp-driver.js";
import { claimEvalVm, type EvalVm } from "./vm.js";

type Check = { name: string; ok: boolean; detail: string };

const outDir = join("evals", "runs", `macos-compat-${new Date().toISOString().replace(/[:.]/g, "-")}`);

async function main(): Promise<number> {
  process.env.CUA_EVAL_OS ||= "macos";
  process.env.CUA_POOL_NAME ||= "opensky-macos-evals";
  await mkdir(outDir, { recursive: true });
  process.stdout.write(`Claiming macOS Fleet VM (pool ${process.env.CUA_POOL_NAME})…\n`);
  const vm = await claimEvalVm();
  const checks: Check[] = [];
  try {
    process.stdout.write(`Claimed ${vm.name} os=${vm.os} base=${vm.baseUrl}\n`);
    checks.push(await checkGuestOs(vm));
    checks.push(await checkDesktopHelper(vm));
    const driver = new FleetMcpDriver(vm);
    const opensky = createOpenSky({
      driver,
      target: "mac",
      autoLaunch: true,
      session: `opensky-macos-${Date.now()}`,
      homeDir: join(outDir, "opensky-home"),
      screenshotDir: join(outDir, "shots"),
    });
    await vm.shell("mkdir -p /tmp/opensky-macos-shots");
    checks.push(await checkListApps(opensky));
    checks.push(await checkCalculatorDiffs(opensky));
    checks.push(await checkTextEditWindow(opensky));
    const screenshot = await vm.screenshot();
    await writeFile(join(outDir, "desktop.png"), screenshot);
    checks.push({
      name: "desktop screenshot",
      ok: screenshot.length > 1000,
      detail: `${screenshot.length} bytes → ${join(outDir, "desktop.png")}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    checks.push({ name: "macos vm session", ok: false, detail: message });
  } finally {
    await vm.close().catch(() => undefined);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    os: process.env.CUA_EVAL_OS,
    pool: process.env.CUA_POOL_NAME,
    image: process.env.CUA_EVAL_IMAGE ?? "(default macos tahoe)",
    passed: checks.filter((item) => item.ok).length,
    total: checks.length,
    checks,
  };
  await writeFile(join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`\n${render(summary)}\nWrote ${join(outDir, "summary.json")}\n`);
  return summary.passed === summary.total && summary.total > 0 ? 0 : 1;
}

async function checkGuestOs(vm: EvalVm): Promise<Check> {
  const uname = await vm.shell("uname -s && sw_vers");
  const text = `${uname.stdout}\n${uname.stderr}`.trim();
  const ok = /Darwin/i.test(text) || /macOS|Mac OS X/i.test(text);
  return { name: "guest is macOS", ok, detail: text.slice(0, 500) || `success=${uname.success}` };
}

async function checkDesktopHelper(vm: EvalVm): Promise<Check> {
  const result = await vm.shell("opensky-driver --version");
  const text = `${result.stdout}\n${result.stderr}`.trim();
  return {
    name: "OpenSky Driver present",
    ok: result.success && /^opensky-driver\s+\S+/.test(result.stdout.trim()),
    detail: text.slice(0, 800) || "Build and install OpenSky Driver from the fork in the VM before this check. No upstream fallback.",
  };
}

async function checkListApps(opensky: ReturnType<typeof createOpenSky>): Promise<Check> {
  const apps = await opensky.list_apps();
  const names = apps.map((app) => app.displayName ?? app.id);
  const calculator = apps.find((app) => /calculator/i.test(`${app.displayName} ${app.id}`));
  const textEdit = apps.find((app) => /textedit/i.test(`${app.displayName} ${app.id}`));
  const kernel = apps.filter((app) => /^(init|kthreadd)$/i.test(app.displayName ?? ""));
  const ok = Boolean(calculator) && kernel.length === 0;
  return {
    name: "list_apps finds Calculator and filters kernel processes",
    ok,
    detail: JSON.stringify(
      {
        count: apps.length,
        calculator: calculator?.id ?? calculator?.displayName,
        textEdit: textEdit?.id ?? textEdit?.displayName,
        sample: names.slice(0, 12),
        useCount: calculator?.useCount,
        lastUsedDate: calculator?.lastUsedDate,
      },
      null,
      2,
    ),
  };
}

async function checkCalculatorDiffs(opensky: ReturnType<typeof createOpenSky>): Promise<Check> {
  const first = await opensky.get_app_state({ app: "Calculator", disableDiff: true });
  const seven = findElementIndex(first.text, /AXButton.*"7"|AXButton 7\b|label":"7"/i) ?? findElementIndex(first.text, /\b7\b/);
  if (seven === undefined) {
    return {
      name: "Calculator incremental diffs",
      ok: false,
      detail: `Could not find button 7.\napp=${first.app}\n${first.text.slice(0, 1500)}`,
    };
  }
  await opensky.click({ app: "Calculator", element_index: seven, mouse_button: 0 });
  const second = await opensky.get_app_state({ app: "Calculator" });
  const changed = /Changed:|Added:|Removed:/.test(second.text);
  const noChange = /No accessibility changes/.test(second.text);
  const ok = changed && !noChange;
  return {
    name: "Calculator incremental diffs",
    ok,
    detail: [
      `app=${first.app}`,
      `screenshot=${JSON.stringify(first.screenshot)}`,
      `clicked element_index=${seven}`,
      `second:\n${second.text.slice(0, 1200)}`,
    ].join("\n"),
  };
}

async function checkTextEditWindow(opensky: ReturnType<typeof createOpenSky>): Promise<Check> {
  const state = await opensky.get_app_state({ app: "TextEdit", disableDiff: true });
  const empty = !state.text.trim();
  const tiny = (state.screenshot?.height ?? 0) > 0 && (state.screenshot?.height ?? 0) < 40;
  const hasDocument = /AXTextArea|AXTextField|text/i.test(state.text);
  const ok = !empty && !tiny && hasDocument;
  return {
    name: "TextEdit selects the document window",
    ok,
    detail: [
      `app=${state.app}`,
      `screenshot=${JSON.stringify(state.screenshot)}`,
      `empty=${empty} tiny=${tiny} hasDocument=${hasDocument}`,
      state.text.slice(0, 1200),
    ].join("\n"),
  };
}

function findElementIndex(tree: string, pattern: RegExp): number | undefined {
  for (const line of tree.split("\n")) {
    if (!pattern.test(line)) continue;
    const match = /\[(\d+)\]/.exec(line);
    if (match) return Number(match[1]);
  }
  return undefined;
}

function render(summary: { passed: number; total: number; checks: Check[] }): string {
  const lines = [`# macOS Fleet OpenSky checks`, "", `${summary.passed}/${summary.total} passed`, ""];
  for (const check of summary.checks) {
    lines.push(`- ${check.ok ? "PASS" : "FAIL"} ${check.name}`);
    lines.push(`  ${check.detail.split("\n").join("\n  ")}`);
    lines.push("");
  }
  return lines.join("\n");
}

if (import.meta.main) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}
