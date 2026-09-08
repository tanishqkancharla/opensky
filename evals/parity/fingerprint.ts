import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, delimiter } from "node:path";
import { platform, release, arch } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest("hex");
}

/** Fingerprint actual code/assets, including uncommitted work. Never serialize
 * auth configuration or environment values into portable result artifacts. */
export async function recordEnvironment(options: { repo: string; appPath: string; driver: string; nativeConfig?: string; artifacts: string }) {
  const files: Record<string, string> = {};
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === "__pycache__" || entry.name.endsWith(".pyc")) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files[relative(options.repo, path)] = await sha256(path);
    }
  }
  await walk(join(options.repo, "src"));
  await walk(join(options.repo, "dist"));
  await walk(join(options.repo, "evals/parity"));
  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
  const command = async (name: string, args: string[]) => (await exec(name, args, { cwd: options.repo, timeout: 10_000 })).stdout.trim();
  const nativeConfig = options.nativeConfig ? JSON.parse(await readFile(options.nativeConfig, "utf8")) : undefined;
  let nativeReference = null;
  if (nativeConfig) {
    const servicePath = nativeConfig.env?.SKY_CUA_SERVICE_PATH;
    const moduleDirectories = String(nativeConfig.env?.NODE_REPL_NODE_MODULE_DIRS ?? "").split(delimiter);
    if (!servicePath || !moduleDirectories[0]) throw new Error("Native backend identity unavailable; do not dispatch an unversioned reference");
    const packageRoot = join(moduleDirectories[0], "@oai/sky");
    const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
    const clientFiles: Record<string, string> = {};
    async function hashClient(directory: string) {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await hashClient(path);
        else if (entry.isFile() && entry.name.endsWith(".js")) clientFiles[relative(packageRoot, path)] = await sha256(path);
      }
    }
    await hashClient(join(packageRoot, "dist"));
    const executable = await command("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleExecutable", join(servicePath, "Contents/Info.plist")]);
    nativeReference = {
      nodeReplSha256: await sha256(nativeConfig.command), skyVersion: packageJson.version,
      clientFiles: Object.fromEntries(Object.entries(clientFiles).sort(([a], [b]) => a.localeCompare(b))),
      serviceExecutableSha256: await sha256(join(servicePath, "Contents/MacOS", executable)),
      serviceInfoPlistSha256: await sha256(join(servicePath, "Contents/Info.plist")),
    };
  }
  await writeFile(join(options.artifacts, "environment.json"), JSON.stringify({
    capturedAt: new Date().toISOString(), platform: platform(), release: release(), architecture: arch(), node: process.version,
    sdkCommit: await command("git", ["rev-parse", "HEAD"]),
    worktreeDirty: !!(await command("git", ["status", "--porcelain"])),
    codeAndAssetsSha256: createHash("sha256").update(JSON.stringify(sorted)).digest("hex"), files: sorted,
    driver: { sha256: await sha256(options.driver), identity: JSON.parse(await command(options.driver, ["--opensky-driver-identity"])) },
    libreOffice: {
      version: await command("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleShortVersionString", join(options.appPath, "Contents/Info.plist")]),
      executableSha256: await sha256(join(options.appPath, "Contents/MacOS/soffice")),
      infoPlistSha256: await sha256(join(options.appPath, "Contents/Info.plist")),
    },
    nativeReference,
  }, null, 2));
}
