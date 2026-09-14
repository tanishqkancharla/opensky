import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { TargetHandle } from "opensky-cua";
import { nativeTest } from "./sdk.js";
import { withSdkOwnedMacDocument } from "./mac-sdk-document.js";
const exec = promisify(execFile);
const witnessText = "The other document stays unchanged.\n";

type Witness = {
  handle: TargetHandle;
  initialText: string;
  focus(): Promise<void>;
  isFrontmost(): Promise<boolean>;
  read(): Promise<string>;
};

export const test = nativeTest.extend<{ witness: Witness }>({
  // Depend on document so the witness closes before its baseline target does.
  witness: async ({ sdk, document }, use) => {
    if (!document.handle) throw new Error("A separate target must already exist");
    const temporary = await mkdtemp(join(tmpdir(), "opensky-paste-focus-"));
    const artifacts = await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR ?? tmpdir(), "paste-focus-witness-"));
    const path = join(temporary, "focus-witness.txt");
    const helper = join(temporary, "observer");
    await writeFile(path, witnessText);
    try {
      await exec("/usr/bin/swiftc", ["-module-cache-path", join(temporary, "swift-cache"),
        fileURLToPath(new URL("../../evals/parity/mac-app-lifecycle.swift", import.meta.url)), "-o", helper], { timeout: 60_000 });
      await withSdkOwnedMacDocument({ sdk, path, artifacts }, async owned => {
        let observation = 0;
        await use({
          handle: owned.handle,
          initialText: witnessText,
          async focus() { await sdk.bring_to_front({ app: owned.handle }); },
          async isFrontmost() {
            const state = JSON.parse((await exec(helper, ["desktop-state"], { timeout: 10_000 })).stdout);
            await writeFile(join(artifacts, `foreground-${++observation}.json`), JSON.stringify({
              checkedAt: new Date().toISOString(), expectedPid: owned.identity.pid, ...state,
            }, null, 2));
            return state.ready === true && state.frontmostPid === owned.identity.pid;
          },
          read: () => readFile(path, "utf8"),
        });
      });
    } finally {
      const cleanup = await readFile(join(artifacts, "cleanup.json"), "utf8").then(JSON.parse).catch(() => null);
      // Compiler output is always disposable; preserve a document if owned-app
      // cleanup is unproven, so it remains recoverable without data loss.
      await rm(join(temporary, "swift-cache"), { recursive: true, force: true });
      await rm(helper, { force: true });
      if (cleanup?.verifiedExited) await rm(temporary, { recursive: true, force: true });
      await writeFile(join(artifacts, "fixture-cleanup.json"), JSON.stringify({
        temporaryRemoved: cleanup?.verifiedExited === true, cleanup,
      }, null, 2));
    }
  },
});
