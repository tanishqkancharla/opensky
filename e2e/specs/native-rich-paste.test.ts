import {withOwnedMacClipboard} from "../fixtures/mac-clipboard-owner.js";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vitest";
import { nativeEditorIndex, test } from "../fixtures/sdk.js";
import { withSdkOwnedMacDocument } from "../fixtures/mac-sdk-document.js";

const cases = [
  { code: "RICH-N01", format: "html" as const, seed: "First boundary\nReplace boundary\nThird boundary",
    select: "Replace boundary", payload: "<b>Replacement HTML</b>",
    expected: "First boundary\nReplacement HTML\nThird boundary", bold: "Replacement HTML" },
  { code: "RICH-N02", format: "html" as const, seed: "Seed boundary", select: "Seed boundary",
    payload: "<p><b>Harbor HTML</b></p><p>Unicode body 😀</p>",
    expected: "Harbor HTML\nUnicode body 😀", bold: "Harbor HTML" },
  { code: "RICH-N03", format: "md" as const, seed: "Seed boundary", select: "Seed boundary",
    payload: "**Harbor Markdown**\n\nUnicode body 😀",
    expected: "Harbor Markdown\nUnicode body 😀", bold: "Harbor Markdown" },
];

for (const scenario of cases) {
  test(`${scenario.code}: rich ${scenario.format} paste persists exact boundaries and bold style`, { timeout: 120_000 }, async ({ sdk }) => {
    const directory = await mkdtemp(join(tmpdir(), "opensky-rich-paste-"));
    const artifacts = await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR ?? tmpdir(), "rich-paste-"));
    const documentArtifacts = join(artifacts, "document");
    await mkdir(documentArtifacts);
    const path = join(directory, "rich-paste.rtf");
    await writeFile(path, `{\\rtf1\\ansi{\\fonttbl{\\f0 Helvetica;}}\\f0\\fs24 ${scenario.seed.replaceAll("\n", "\\par ")}}`);
    try {
      await withSdkOwnedMacDocument({ sdk, path, artifacts: documentArtifacts }, async document => {
        try {
          const before = await sdk.get_app_state({ app: document.handle, includeScreenshot: false, disableDiff: true });
          await sdk.select_text({ app: document.handle, element_index: nativeEditorIndex(before.text), text: scenario.select });
          await withOwnedMacClipboard(scenario.code === "RICH-N01" ? scenario.bold : scenario.expected,true,async clipboard=>{
          await sdk.paste({ app: document.handle, text: scenario.payload, format: scenario.format });
          const after = await sdk.get_app_state({ app: document.handle, includeScreenshot: false, disableDiff: true });
          await writeFile(join(artifacts, "after.txt"), after.text);
          expect(after.text).toContain(`**${scenario.bold}**`);
          await sdk.press_key({ app: document.handle, key: "super+s" });
          const text = execFileSync("/usr/bin/textutil", ["-convert", "txt", "-stdout", path], { encoding: "utf8" });
          const html = execFileSync("/usr/bin/textutil", ["-convert", "html", "-stdout", path], { encoding: "utf8" });
          await writeFile(join(artifacts, "saved.txt"), text);
          await writeFile(join(artifacts, "saved.html"), html);
          await writeFile(join(artifacts, "saved.rtf"), await readFile(path));
          // Block fragments may supply a final paragraph separator. Interior
          // line boundaries, Unicode and selected-only replacement are exact.
          expect(text.trimEnd()).toBe(scenario.expected);
          expect(html).toContain(`<b>${scenario.bold}</b>`);
          expect(await clipboard.markerPreserved()).toBe(true);
          });
        } finally {
          // Even an uncertain paste can modify this exact owned file. Save
          // only for bounded fixture cleanup; it cannot repair a failed test.
          await sdk.press_key({ app: document.handle, key: "super+s" });
        }
      });
    } finally {
      const cleanup = await readFile(join(documentArtifacts, "cleanup.json"), "utf8").then(JSON.parse).catch(() => null);
      if (cleanup?.verifiedExited === true) await rm(directory, { recursive: true, force: true });
      await writeFile(join(artifacts, "fixture-cleanup.json"), JSON.stringify({ temporaryRemoved: cleanup?.verifiedExited === true, cleanup }, null, 2));
    }
  });
}
