#!/usr/bin/env node
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CuaDriverClient } from "../src/driver.js";
import { createOpenSky } from "../src/opensky.js";

const url = process.argv[2] ?? "https://www.amazon.com";
const includeScreenshot = process.env.OPENSKY_SCREENSHOT === "1";
const session = process.env.OPENSKY_SESSION ?? `opensky-smoke-${process.pid}`;
const home = await mkdtemp(join(tmpdir(), "opensky-real-smoke-"));
const opensky = createOpenSky({
  driver: new CuaDriverClient({ session }),
  session,
  homeDir: home,
  screenshotDir: join(home, "screenshots"),
  settleDelayMs: 800,
});

try {
  process.stderr.write(`[smoke] opening ${url} in ${session}\n`);
  const state = await opensky.open_target({
    app: "Google Chrome",
    targets: [url],
    includeScreenshot,
  });
  process.stderr.write(`[smoke] observed ${state.text.length} model-facing characters\n`);
  process.stdout.write(`${JSON.stringify({
    ...state,
    screenshot: state.screenshot ? { url: state.screenshot.url } : null,
  }, null, 2)}\n`);
} finally {
  process.stderr.write(`[smoke] closing ${session}\n`);
  await opensky.close();
  process.stderr.write(`[smoke] cleanup complete\n`);
}
