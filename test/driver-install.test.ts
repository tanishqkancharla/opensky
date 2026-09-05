import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, mkdir, symlink, rm, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { appBundleForDriver, CuaDriverClient } from "../src/driver.js";

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

  it("honors binary aliases and their explicit precedence without executing a helper", async () => {
    const env = {
      CUA_DRIVER_BINARY: process.execPath,
      CUA_DRIVER_PATH: "/tmp/opensky-missing-legacy-helper",
      OPENSKY_DRIVER: "/tmp/opensky-missing-opensky-helper",
    };
    assert.equal(await new CuaDriverClient({ env }).resolveBinary(), process.execPath);
    assert.equal(await new CuaDriverClient({ env, binaryPath: "/tmp/opensky-missing-helper" }).resolveBinary(), null);
    assert.equal(await new CuaDriverClient({ env: { CUA_DRIVER_PATH: process.execPath, OPENSKY_DRIVER: "/missing" } }).resolveBinary(), process.execPath);
    assert.equal(await new CuaDriverClient({ env: { OPENSKY_DRIVER: process.execPath } }).resolveBinary(), process.execPath);
  });

  it("never falls back or downloads when an environment-selected helper is missing", async () => {
    for (const key of ["CUA_DRIVER_BINARY", "CUA_DRIVER_PATH", "OPENSKY_DRIVER"]) {
      const env = { ...process.env };
      delete env.CUA_DRIVER_BINARY;
      delete env.CUA_DRIVER_PATH;
      delete env.OPENSKY_DRIVER;
      env[key] = "/tmp/opensky-missing-helper";
      const driver = new CuaDriverClient({ env });
      assert.equal(await driver.resolveBinary(), null);
      await assert.rejects(driver.ensureHelper(), /opensky desktop helper is not installed/);
    }
  });

  it("derives the app only from the selected binary's resolved Contents/MacOS ancestry", async () => {
    const root = await mkdtemp(join(tmpdir(), "opensky-bundle-resolution-"));
    try {
      const app = join(root, "Custom Driver.app");
      const executable = join(app, "Contents", "MacOS", "custom-driver");
      await mkdir(join(app, "Contents", "MacOS"), { recursive: true });
      await writeFile(executable, "path-resolution fixture; never executed");
      const link = join(root, "driver-link");
      await symlink(executable, link);
      assert.equal(await appBundleForDriver(link), await realpath(app));
      assert.equal(await appBundleForDriver(process.execPath), undefined);
      assert.equal(await appBundleForDriver(join(root, "missing")), undefined);
      const nested = join(app, "Contents", "MacOS", "nested", "driver");
      await mkdir(nested, { recursive: true });
      assert.equal(await appBundleForDriver(nested), undefined);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
