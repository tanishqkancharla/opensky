import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { after } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CuaDriverClient } from "../src/driver.js";
import { createOpenSky } from "../src/opensky.js";

const fixtureDriver = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "cua-driver.mjs");

export async function makeHarness(options: { degradedRetryMs?: number } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "opensky-"));
  const statePath = join(dir, "state.json");
  const logPath = join(dir, "calls.json");
  const driverPath = join(dir, "cua-driver");
  const source = await readFile(fixtureDriver, "utf8");
  await writeFile(driverPath, source, { mode: 0o755 });
  await chmod(driverPath, 0o755);
  const env = {
    ...process.env,
    CUA_MOCK_STATE: statePath,
    CUA_MOCK_LOG: logPath,
    OPENSKY_HOME: join(dir, "home"),
    OPENSKY_AUTOSTART: "0",
  };
  const driver = new CuaDriverClient({
    binaryPath: driverPath,
    autoStart: false,
    env,
    timeoutMs: 8_000,
    session: "opensky",
  });
  const opensky = createOpenSky({
    driver,
    session: "opensky",
    homeDir: join(dir, "home"),
    screenshotDir: join(dir, "shots"),
    autoLaunch: true,
    target: "mac",
    pasteModifier: "cmd",
    settleDelayMs: 0,
    degradedRetryMs: options.degradedRetryMs ?? 50,
  });
  // This fixture owns the private directory and mock session. Register cleanup
  // with the calling test so failed assertions also release their resources.
  after(async () => {
    try { await opensky.close(); }
    finally { await rm(dir, { recursive: true, force: true }); }
  });
  return { dir, opensky, driver, driverPath, env, statePath, logPath };
}
