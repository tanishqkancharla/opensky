import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { nativeTest } from "./sdk.js";
const exec = promisify(execFile);
type DesktopState = { ready: boolean; frontmostPid: number | null; frontmostBundleId: string | null };

/** Independent, read-only observation of the user's visible foreground app. */
export const test = nativeTest.extend<{ foreground: { read(): Promise<DesktopState> } }>({
  foreground: async ({}, use) => {
    const temporary = await mkdtemp(join(tmpdir(), "opensky-foreground-observer-"));
    const artifacts = await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR ?? tmpdir(), "foreground-observer-"));
    const helper = join(temporary, "observer");
    let observation = 0;
    try {
      await exec("/usr/bin/swiftc", ["-module-cache-path", join(temporary, "swift-cache"),
        fileURLToPath(new URL("../../evals/parity/mac-app-lifecycle.swift", import.meta.url)), "-o", helper], { timeout: 60_000 });
      await use({ async read() {
        const state = JSON.parse((await exec(helper, ["desktop-state"], { timeout: 10_000 })).stdout) as DesktopState;
        await writeFile(join(artifacts, `foreground-${++observation}.json`), JSON.stringify({ checkedAt: new Date().toISOString(), ...state }, null, 2));
        if (!state.ready || !Number.isInteger(state.frontmostPid)) throw new Error("Desktop or foreground identity unavailable; no acceptance can be claimed");
        return state;
      } });
    } finally {
      await rm(temporary, { recursive: true, force: true });
      await writeFile(join(artifacts, "cleanup.json"), JSON.stringify({ temporaryRemoved: true, readOnly: true }));
    }
  },
});
