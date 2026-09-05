import { mkdir, writeFile } from 'node:fs/promises';
import { CuaDriverClient } from '../src/driver.js';
import { createOpenSky } from '../src/opensky.js';
import { execFileSync } from 'node:child_process';

// An actual owned Chrome tab, AX observation and screenshot: no model and no mock.
const dir = 'evals/runs/ci';
await mkdir(dir, { recursive: true });
const version = (command: string, args: string[]) => {
  try { return execFileSync(command, args, { encoding: 'utf8' }).trim(); }
  catch { return null; }
};
await writeFile(`${dir}/provenance.json`, JSON.stringify({
  commit: process.env.GITHUB_SHA ?? version('git', ['rev-parse', 'HEAD']),
  node: process.version, platform: process.platform, architecture: process.arch,
  driver: version(process.env.CUA_DRIVER_BINARY ?? 'cua-driver', ['--version']),
  driverPin: process.env.CUA_DRIVER_RS_VERSION ?? null,
  model: 'openai/gpt-5.6-terra', reasoning: 'medium', capturedAt: new Date().toISOString(),
}, null, 2));
const session = `opensky-ci-probe-${process.pid}`;
const driver = new CuaDriverClient({ session, binaryPath: process.env.CUA_DRIVER_BINARY, autoInstall: false });
const sky = createOpenSky({ driver, session, homeDir: `${dir}/probe-home` });
let failure: unknown;
let cleanupFailure: unknown;
try {
  const state = await sky.open_target({ app: 'Google Chrome', targets: ['https://example.com'], includeScreenshot: true });
  if (!state.text.includes('Example Domain') || !state.screenshot) throw new Error('Real AX and screenshot probe did not both succeed');
  await writeFile(`${dir}/capability.json`, JSON.stringify({ passed: true, text: state.text, permissions: await driver.permissionStatus() }, null, 2));
} catch (error) {
  failure = error;
  await writeFile(`${dir}/capability.json`, JSON.stringify({ passed: false, classification: 'infrastructure', error: String(error), permissions: await driver.permissionStatus().catch(() => null) }, null, 2));
} finally {
  try { await sky.close(); }
  catch (error) { cleanupFailure = error; }
  await writeFile(`${dir}/probe-cleanup.json`, JSON.stringify({ succeeded: !cleanupFailure, error: cleanupFailure ? String(cleanupFailure) : null }));
}
if (cleanupFailure) throw cleanupFailure;
if (failure) throw failure;
