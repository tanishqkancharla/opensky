import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("shipped driver asset metadata matches the selected fork and package exports", async () => {
  const read = async (name: string) => JSON.parse(await readFile(new URL("../" + name, import.meta.url), "utf8"));
  const [manifest, source, pkg] = await Promise.all([read("driver-assets.json"), read("driver-source.json"), read("package.json")]);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.sdkVersion, pkg.version);
  assert.equal(manifest.sourceCommit, source.verifiedCommit);
  assert.equal(manifest.automaticInstallation, false);
  assert.ok(pkg.files.includes("driver-assets.json"));
  assert.equal(pkg.exports["./driver-assets.json"], "./driver-assets.json");
  assert.ok(manifest.assets.some((asset: { platform: string; arch: string }) => asset.platform === "linux" && asset.arch === "x64"));
  for (const asset of manifest.assets) {
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
    assert.match(asset.binarySHA256, /^[a-f0-9]{64}$/);
    assert.ok(asset.file.includes(source.verifiedCommit));
    assert.equal(asset.url, `https://github.com/tanishqkancharla/opensky/releases/download/${asset.releaseTag}/${asset.file}`);
    assert.equal(asset.platform, "linux"); assert.equal(asset.arch, "x64");
    assert.equal(asset.abi.codename, "bookworm");
    assert.equal(asset.qualification.nativeAccepted, true);
    assert.equal(asset.qualification.sandboxedBookwormBrowserAccepted, false);
    assert.equal(asset.qualification.unrestrictedPermissions, false);
    assert.equal(asset.qualification.rustBuildInConsumer, false);
  }
});
