import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as base } from "./sdk.js";

export const test = base.extend<{ files: { sibling: string; requested: string } }>({
  files: async ({ sdk }, use) => {
    if (process.platform !== "darwin") throw new Error("This fixture requires macOS TextEdit.");
    const directory = await mkdtemp(join(tmpdir(), "opensky-native-open-"));
    const sibling = join(directory, "sibling", "sdk-draft.txt");
    const requested = join(directory, "requested", "sdk-draft.txt");
    await mkdir(join(directory, "sibling"));
    await mkdir(join(directory, "requested"));
    await writeFile(sibling, "Sibling document must remain open.\n");
    await writeFile(requested, "Requested document: α 😀 exact file.\n");
    try {
      await use({ sibling, requested });
    } finally {
      // This scenario opens at most two SDK-owned targets. The public app
      // alias addresses the newest owned handle; it never closes unowned apps.
      // Preserve files and recovery state if exact close cannot be verified.
      try {
        for (let i = 0; i < 2; i++) {
          try { await sdk.close_target({ app: "TextEdit" }); }
          catch (error) {
            if (error instanceof Error && error.message.startsWith("No driver-owned exact target")) break;
            throw error;
          }
        }
        // A failed open can leave a window without an SDK handle. Retain the
        // small temporary files even then, rather than delete an open document.
        console.info(`Native open documents: ${directory}`);
      } catch (error) {
        console.error(`Native open cleanup unproven; preserved ${directory}`);
        throw error;
      }
    }
  },
});
