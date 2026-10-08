import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const cacheRoot = fileURLToPath(new URL("../.compiler-cache/", import.meta.url));
const moduleCache = join(cacheRoot, "swift-modules");

async function privateDirectory(path: string): Promise<void> {
  await mkdir(path, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  const state = await lstat(path);
  if (!state.isDirectory() || state.isSymbolicLink() ||
      state.uid !== process.getuid?.() || (state.mode & 0o022) !== 0) {
    throw new Error("Swift fixture module cache must be a private directory owned by the current user");
  }
}

/** Cache compiler-managed imported modules, never a fixture executable.
 * swiftc validates module dependencies/toolchain compatibility itself. Every
 * call compiles the current source into the caller's isolated helper path.
 */
export async function compileMacSwiftHelper(source: string, binary: string) {
  if (process.platform !== "darwin") throw new Error("Mac Swift fixtures require macOS");
  await privateDirectory(cacheRoot);
  await privateDirectory(moduleCache);
  const hash = async () => createHash("sha256").update(await readFile(source)).digest("hex");
  const sourceSHA256 = await hash();
  const started = performance.now();
  await exec("/usr/bin/swiftc", ["-module-cache-path", moduleCache, source, "-o", binary], { timeout: 60_000 });
  if (sourceSHA256 !== await hash()) throw new Error("Swift fixture source changed during compilation");
  return { compiler: "/usr/bin/swiftc", source, sourceSHA256, moduleCache, binary,
    elapsedMilliseconds: performance.now() - started, executableReused: false };
}
