import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { compileMacSwiftHelper } from "../e2e/fixtures/mac-swift-compiler.js";
const exec = promisify(execFile);

test("warmed module cache recompiles changed source into separate fixture executables", {
  skip: process.platform !== "darwin", timeout: 90_000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "opensky-swift-fresh-source-"));
  try {
    const source = join(directory, "fixture.swift");
    await mkdir(join(directory, "first")); await mkdir(join(directory, "second"));
    await writeFile(source, 'import Foundation\nprint("fixture-v1")\n');
    const first = await compileMacSwiftHelper(source, join(directory, "first", "helper"));
    assert.equal((await exec(first.binary)).stdout.trim(), "fixture-v1");
    await writeFile(source, 'import Foundation\nprint("fixture-v2")\n');
    const second = await compileMacSwiftHelper(source, join(directory, "second", "helper"));
    assert.equal((await exec(second.binary)).stdout.trim(), "fixture-v2");
    assert.equal((await exec(first.binary)).stdout.trim(), "fixture-v1");
    assert.notEqual(first.sourceSHA256, second.sourceSHA256);
    assert.notEqual(first.binary, second.binary);
    assert.equal(first.moduleCache, second.moduleCache);
    assert.equal(second.executableReused, false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
