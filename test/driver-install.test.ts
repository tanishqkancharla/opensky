import assert from "node:assert/strict";
import { describe, it } from "bun:test";

import { CuaDriverClient } from "../src/driver.js";

describe("desktop helper auto-install", () => {
  it("does not download when autoInstall is false", async () => {
    const driver = new CuaDriverClient({
      autoInstall: false,
      autoStart: false,
      binaryPath: "/tmp/opensky-missing-helper",
    });
    await assert.rejects(driver.ensureHelper(), /opensky desktop helper is not installed/);
  });

  it("does not download when an explicit --driver path is missing", async () => {
    const driver = new CuaDriverClient({
      autoStart: false,
      binaryPath: "/tmp/opensky-missing-helper",
    });
    await assert.rejects(driver.ensureHelper(), /opensky desktop helper is not installed/);
  });
});
