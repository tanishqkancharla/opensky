import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

/** Diagnostic only: never dismiss a dialog, save a document, or affect its score. */
export async function captureLinuxFinalObservation(artifacts: string, nativePackageRoot: string | undefined): Promise<void> {
  const startedAt = new Date().toISOString();
  const screenshotFile = "final-state.jpg";
  let status: "captured" | "unavailable" = "unavailable";
  let error: string | null = null;
  try {
    if (!nativePackageRoot) throw new Error("OPENSKY_NATIVE_PROBE_PACKAGE is unavailable");
    // Use the same independent full-desktop observer for both arms, including
    // when the evaluated SDK cannot safely accept another call. A child process
    // bounds this read-only diagnostic without imposing a deadline on the agent.
    await exec(process.execPath, ["--input-type=module", "-e", `
      import { readFile, writeFile } from "node:fs/promises";
      import { join } from "node:path";
      import { pathToFileURL } from "node:url";
      const [packageRoot, output] = process.argv.slice(1);
      const metadata = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
      const { sky } = await import(pathToFileURL(join(packageRoot, metadata.main)).href);
      const image = (await sky.get_screenshot())[0];
      if (!image?.bytes?.length) throw new Error("Desktop observer returned no screenshot bytes");
      await writeFile(output, image.bytes, { flag: "wx" });
    `, nativePackageRoot, join(artifacts, screenshotFile)], { timeout: 15_000, killSignal: "SIGKILL", maxBuffer: 64 * 1024 });
    status = "captured";
  } catch (cause) {
    error = String(cause);
  }
  const observation = {
    status, startedAt, finishedAt: new Date().toISOString(),
    observer: "native-desktop-screenshot", purpose: "post-agent diagnostic before grading and cleanup",
    screenshot: status === "captured" ? screenshotFile : null, error,
  };
  try {
    await writeFile(join(artifacts, "final-observation.json"), JSON.stringify(observation, null, 2), { flag: "wx" });
  } catch (cause) {
    // Keep diagnostic failure separate from the agent's saved-file outcome.
    console.error("Could not retain final observation receipt", observation, String(cause));
  }
}
