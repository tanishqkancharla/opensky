import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CuaDriverClient } from "../src/driver.js";
import { createSky } from "../src/sky.js";

const fixtureDriver = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "cua-driver.mjs");

export async function makeHarness() {
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
  });
  const sky = createSky({
    driver,
    homeDir: join(dir, "home"),
    screenshotDir: join(dir, "shots"),
    autoLaunch: true,
    target: "mac",
    pasteModifier: "cmd",
  });
  return { dir, sky, driver, driverPath, env, statePath, logPath };
}
