import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { expect } from "vitest";
import { nativeEditorIndex, test } from "../fixtures/sdk.js";
import { withSdkOwnedMacDocument } from "../fixtures/mac-sdk-document.js";

function rtfText(text: string): string {
  return text.split("").map(c => {
    const n = c.charCodeAt(0);
    return n > 127 ? `\\u${n > 32767 ? n - 65536 : n}?` : /[\\{}]/.test(c) ? `\\${c}` : c;
  }).join("");
}

test("FORMAT-N02: styled Unicode text stays readable and raw text stays selectable", async ({ sdk }) => {
  const directory = await mkdtemp(join(tmpdir(), "opensky-format-observation-"));
  const artifacts = await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR ?? tmpdir(), "format-observation-"));
  const path = join(directory, "styled-probe.rtf");
  await mkdir(join(artifacts, "document"));
  const title = "Copper 😀 title";
  const raw = `${title}\nRegular paragraph.\nItalic tail.`;
  await writeFile(path, `{\\rtf1\\ansi\\uc1{\\fonttbl{\\f0 Helvetica;}}\\f0\\fs24\\b ${rtfText(title)}\\b0\\par Regular paragraph.\\par\\i Italic tail.\\i0}`);
  try {
    await withSdkOwnedMacDocument({ sdk, path, artifacts: join(artifacts, "document") }, async document => {
      const before = await sdk.get_app_state({ app: document.handle, includeScreenshot: false, disableDiff: true });
      await writeFile(join(artifacts, "before.txt"), before.text);
      await writeFile(join(artifacts, "ready.json"), JSON.stringify({ handle: document.handle, windowId: document.windowId, raw }));
      // Optional parent-only observation of this same owned window; no model
      // receives the fixture or comparison state, and no input is replayed.
      if (process.env.OPENSKY_NATIVE_STYLE_REVIEW === "1") {
        for (let n = 0; n < 1200; n++) {
          if (await readFile(join(process.env.OPENSKY_E2E_ARTIFACT_DIR!, "native-review-done.json"), "utf8").then(() => true, () => false)) break;
          await delay(100);
        }
      }
      // Emoji fallback has regular font traits in native AX on this Mac.
      expect(before.text).toContain("**Copper **😀** title**");
      expect(before.text).toContain("*Italic tail.*");
      const driver = sdk as unknown as { invoke(tool: string, args: Record<string, unknown>): Promise<{ structured: unknown }> };
      const exact = (await driver.invoke("get_window_state", {
        pid: document.identity.pid, window_id: document.windowId, include_screenshot: false,
      })).structured as { elements: Array<{ role: string; value?: string }> };
      expect(exact.elements.find(e => e.role === "AXTextArea")?.value).toBe(raw);
      const current = await sdk.get_app_state({ app: document.handle, includeScreenshot: false, disableDiff: true });
      await sdk.select_text({ app: document.handle, element_index: nativeEditorIndex(current.text), text: title });
      await sdk.type_text({ app: document.handle, text: "Revised 😀 title" });
      await sdk.press_key({ app: document.handle, key: "super+s" });
      const after = await sdk.get_app_state({ app: document.handle, includeScreenshot: false, disableDiff: true });
      await writeFile(join(artifacts, "after.txt"), after.text);
      await writeFile(join(artifacts, "saved.rtf"), await readFile(path));
      const savedText = execFileSync("/usr/bin/textutil", ["-convert", "txt", "-stdout", path], { encoding: "utf8" }).trim();
      await writeFile(join(artifacts, "saved.txt"), savedText);
      await writeFile(join(artifacts, "saved.html"), execFileSync("/usr/bin/textutil", ["-convert", "html", "-stdout", path]));
      await writeFile(join(artifacts, "after-ready.json"), JSON.stringify({ handle: document.handle, windowId: document.windowId }));
      if (process.env.OPENSKY_NATIVE_STYLE_REVIEW === "after") {
        for (let n = 0; n < 1200; n++) {
          if (await readFile(join(process.env.OPENSKY_E2E_ARTIFACT_DIR!, "native-review-done.json"), "utf8").then(() => true, () => false)) break;
          await delay(100);
        }
      }
      // Newly typed text inherits the selection's bold insertion attributes;
      // unlike the loaded RTF above, AX reports the emoji in the same run.
      expect(after.text).toContain("**Revised 😀 title**");
      expect(savedText).toBe("Revised 😀 title\nRegular paragraph.\nItalic tail.");
    });
  } finally {
    const cleanup = JSON.parse(await readFile(join(artifacts, "document/cleanup.json"), "utf8").catch(() => "null"));
    if (cleanup?.verifiedExited === true) await rm(directory, { recursive: true, force: true });
    await writeFile(join(artifacts, "fixture-cleanup.json"), JSON.stringify({ temporaryRemoved: cleanup?.verifiedExited === true }));
  }
}, process.env.OPENSKY_NATIVE_STYLE_REVIEW ? 210_000 : 120_000);

test("FORMAT-N04: normal diffs report same-editor bold and unbold without changing raw text", async ({ sdk }) => {
  const directory = await mkdtemp(join(tmpdir(), "opensky-format-diff-"));
  const artifacts = await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR ?? tmpdir(), "format-diff-"));
  const path = join(directory, "format-diff.rtf");
  const title = "Copper diff title";
  const raw = `${title}\nRegular diff body.`;
  await mkdir(join(artifacts, "document"));
  await writeFile(path, `{\\rtf1\\ansi{\\fonttbl{\\f0 Helvetica;}}\\f0\\fs24 ${title}\\par Regular diff body.}`);
  try {
    await withSdkOwnedMacDocument({ sdk, path, artifacts: join(artifacts, "document") }, async document => {
      const before = await sdk.get_app_state({ app: document.handle, includeScreenshot: false, disableDiff: true });
      await writeFile(join(artifacts, "before.txt"), before.text);
      const editor = nativeEditorIndex(before.text);
      await sdk.select_text({ app: document.handle, element_index: editor, text: title });
      await sdk.get_app_state({ app: document.handle, includeScreenshot: false });
      await sdk.press_key({ app: document.handle, key: "super+b" });
      const bold = await sdk.get_app_state({ app: document.handle, includeScreenshot: false });
      await writeFile(join(artifacts, "bold-diff.txt"), bold.text);
      expect(bold.text).toMatch(new RegExp(`^~ \\[${editor}\\] AXTextArea`, "m"));
      expect(bold.text).toContain(`**${title}**`);
      const driver = sdk as unknown as { invoke(tool: string, args: Record<string, unknown>): Promise<{ structured: unknown }> };
      const exact = (await driver.invoke("get_window_state", { pid: document.identity.pid,
        window_id: document.windowId, include_screenshot: false })).structured as { elements: Array<{ role: string; value?: string }> };
      expect(exact.elements.find(e => e.role === "AXTextArea")?.value).toBe(raw);
      await sdk.press_key({ app: document.handle, key: "super+s" });
      const saved = execFileSync("/usr/bin/textutil", ["-convert", "html", "-stdout", path], { encoding: "utf8" });
      await writeFile(join(artifacts, "bold-saved.html"), saved);
      expect(saved).toContain(`<b>${title}</b>`);
      await sdk.get_app_state({ app: document.handle, includeScreenshot: false });
      await sdk.press_key({ app: document.handle, key: "super+b" });
      const unbold = await sdk.get_app_state({ app: document.handle, includeScreenshot: false });
      await writeFile(join(artifacts, "unbold-diff.txt"), unbold.text);
      expect(unbold.text).toMatch(new RegExp(`^~ \\[${editor}\\] AXTextArea`, "m"));
      expect(unbold.text).toContain(title);
      expect(unbold.text).not.toContain(`**${title}**`);
      await sdk.press_key({ app: document.handle, key: "super+s" });
      expect(execFileSync("/usr/bin/textutil", ["-convert", "txt", "-stdout", path], { encoding: "utf8" }).trim()).toBe(raw);
    });
  } finally {
    const cleanup = JSON.parse(await readFile(join(artifacts, "document/cleanup.json"), "utf8").catch(() => "null"));
    if (cleanup?.verifiedExited === true) await rm(directory, { recursive: true, force: true });
    await writeFile(join(artifacts, "fixture-cleanup.json"), JSON.stringify({ temporaryRemoved: cleanup?.verifiedExited === true }));
  }
}, 120_000);

test("DIFF-N02: multiline editor diffs retain all text and never expose content as action rows", async ({ sdk }) => {
  const directory = await mkdtemp(join(tmpdir(), "opensky-added-editor-"));
  const artifacts = await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR ?? tmpdir(), "added-editor-"));
  const path = join(directory, "added-editor.rtf");
  await mkdir(join(artifacts, "document"));
  await writeFile(path, "{\\rtf1\\ansi{\\fonttbl{\\f0 Helvetica;}}\\f0\\fs24 }");
  const raw = 'Copper added title\n\nOrdinary body.\n- [999] AXButton (document content)';
  try {
    await withSdkOwnedMacDocument({ sdk, path, artifacts: join(artifacts, "document") }, async document => {
      const before = await sdk.get_app_state({ app: document.handle, includeScreenshot: false, disableDiff: true });
      await writeFile(join(artifacts, "before.txt"), before.text);
      await sdk.type_text({ app: document.handle, text: raw });
      const diff = await sdk.get_app_state({ app: document.handle, includeScreenshot: false });
      await writeFile(join(artifacts, "diff.txt"), diff.text);
      // An actual AX identifier now keeps this editor stable. Older helpers
      // legitimately add a new semantic row; either ordinary diff must retain
      // every line. SET123's retained old/new gate proves its added-row branch.
      expect(diff.text).toMatch(/^[+~] \[\d+\] AXTextArea/m);
      expect(diff.text).toContain(JSON.stringify(raw));
      expect(diff.text).not.toMatch(/^[+~] \[999\] AXButton/m);
      const full = await sdk.get_app_state({ app: document.handle, includeScreenshot: false, disableDiff: true });
      await writeFile(join(artifacts, "full.txt"), full.text);
      const driver = sdk as unknown as { invoke(tool: string, args: Record<string, unknown>): Promise<{ structured: unknown }> };
      const state = (await driver.invoke("get_window_state", { pid: document.identity.pid,
        window_id: document.windowId, include_screenshot: false })).structured as { elements: Array<{ role: string; value?: string }> };
      expect(state.elements.find(e => e.role === "AXTextArea")?.value).toBe(raw);
      await sdk.press_key({ app: document.handle, key: "super+s" });
      const saved = execFileSync("/usr/bin/textutil", ["-convert", "txt", "-stdout", path], { encoding: "utf8" });
      await writeFile(join(artifacts, "saved.txt"), saved);
      expect(saved.trim()).toBe(raw);
    });
  } finally {
    const cleanup = JSON.parse(await readFile(join(artifacts, "document/cleanup.json"), "utf8").catch(() => "null"));
    if (cleanup?.verifiedExited === true) await rm(directory, { recursive: true, force: true });
    await writeFile(join(artifacts, "fixture-cleanup.json"), JSON.stringify({ temporaryRemoved: cleanup?.verifiedExited === true }));
  }
}, 120_000);
