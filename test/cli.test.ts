import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "bun:test";

import { makeHarness } from "./harness.ts";

const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

describe("opensky CLI", () => {
  it("prints help and version", async () => {
    const help = await runCli(["--help"]);
    assert.equal(help.code, 0);
    assert.match(help.stdout, /async Node REPL/);
    const version = await runCli(["--version"]);
    assert.equal(version.code, 0);
    assert.match(version.stdout, /\d+\.\d+\.\d+/);
  });

  it("evals sky.list_apps through the mock driver", async () => {
    const harness = await makeHarness();
    const result = await runCli(["eval", "--json", "await sky.list_apps()"], {
      env: {
        ...harness.env,
        CUA_DRIVER_PATH: harness.driverPath,
        OPENSKY_HOME: join(harness.dir, "home"),
        OPENSKY_AUTOSTART: "0",
      },
    });
    assert.equal(result.code, 0, result.stderr);
    const payload = JSON.parse(result.stdout) as { ok: boolean; value: Array<{ displayName?: string }> };
    assert.equal(payload.ok, true);
    assert.ok(payload.value.some((app) => app.displayName === "Calculator"));
  });

  it("runs a full calculator click loop in one eval", async () => {
    const harness = await makeHarness();
    const code = `
      const before = await sky.get_app_state({ app: "Calculator", disableDiff: true });
      await sky.click({ app: "Calculator", element_index: 13, mouse_button: 0 });
      const after = await sky.get_app_state({ app: "Calculator" });
      return { before: before.text, after: after.text, shot: before.screenshot.url };
    `;
    const result = await runCli(["eval", "--json", code], {
      env: {
        ...harness.env,
        CUA_DRIVER_PATH: harness.driverPath,
        OPENSKY_HOME: join(harness.dir, "home"),
        OPENSKY_AUTOSTART: "0",
      },
    });
    assert.equal(result.code, 0, `${result.stderr}\n${result.stdout}`);
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      value: { before: string; after: string; shot: string };
    };
    assert.equal(payload.ok, true);
    assert.match(payload.value.before, /\[13]/);
    assert.ok(payload.value.shot.startsWith("file:"));
  });

  it("installs the skill into a temp project", async () => {
    const harness = await makeHarness();
    const cwd = join(harness.dir, "proj");
    await mkdir(cwd, { recursive: true });
    const result = await runCli(["skill", "add"], { cwd, env: harness.env });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Installed opensky skill/);
    const skill = await readFile(join(cwd, ".cursor", "skills", "opensky", "SKILL.md"), "utf8");
    assert.match(skill, /name: opensky/);
    assert.match(skill, /opensky eval/);
  });
});

function runCli(args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: options.cwd ?? process.cwd(),
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}
