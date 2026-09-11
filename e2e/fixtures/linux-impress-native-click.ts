import { expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test as shapeTest } from "./linux-impress-shape-click.js";
import { withNativeSky, type NativeSky } from "./native-keyboard-control.js";

const exec = promisify(execFile);
type Session = { sky: NativeSky; point: { x: number; y: number }; screenshotText(): Promise<string> };
type Fixtures = { nativeSession: Session; native: NativeSky; nativeTitlePoint: { x: number; y: number }; nativeScreenshotText(): Promise<string> };

export const test = shapeTest.extend<Fixtures>({
  nativeSession: async ({ task, ownedWindow, titlePoint }, use) => {
    const artifacts = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "shape-click", task.name.split(":")[0]);
    const geometry = async () => {
      const [pid, active, raw] = await Promise.all([
        exec("xdotool", ["getwindowpid", ownedWindow.xid]),
        exec("xdotool", ["getactivewindow"]),
        exec("xdotool", ["getwindowgeometry", "--shell", ownedWindow.xid]),
      ]);
      expect(Number(pid.stdout.trim())).toBe(ownedWindow.pid);
      expect(BigInt(active.stdout.trim())).toBe(BigInt(ownedWindow.xid));
      const fields = Object.fromEntries(raw.stdout.trim().split("\n").map(line => line.split("=")));
      const bounds = { x: Number(fields.X), y: Number(fields.Y), width: Number(fields.WIDTH), height: Number(fields.HEIGHT) };
      expect(Object.values(bounds).every(Number.isFinite)).toBe(true);
      expect(bounds.width).toBe(ownedWindow.screenshotWidth);
      expect(bounds.height).toBe(ownedWindow.screenshotHeight);
      return { pid: ownedWindow.pid, xid: ownedWindow.xid, activeXid: active.stdout.trim(), bounds };
    };
    await withNativeSky(artifacts, async sky => {
      let actionError: unknown;
      try {
        const before = await geometry();
        const nativeImage = await sky.get_screenshot();
        const tsv = (await exec("tesseract", [nativeImage, "stdout", "--psm", "11", "tsv"], { timeout: 10_000 })).stdout;
        await writeFile(join(artifacts, "native-title.tsv"), tsv);
        const rows = tsv.trim().split("\n").slice(1).map(line => line.split("\t"));
        const page = rows.find(row => row[0] === "1");
        expect(page?.slice(8, 10).map(Number)).toEqual([1280, 900]);
        const words = ["Target", "audience"].map(word => {
          const matches = rows.filter(row => row[11] === word && Number(row[6]) > before.bounds.x + 200 &&
            Number(row[6]) < before.bounds.x + 520 && Number(row[7]) > before.bounds.y + 290 && Number(row[7]) < before.bounds.y + 390);
          expect(matches).toHaveLength(1);
          return matches[0]!;
        });
        const textBounds = {
          left: Math.min(...words.map(row => Number(row[6]))), top: Math.min(...words.map(row => Number(row[7]))),
          right: Math.max(...words.map(row => Number(row[6]) + Number(row[8]))),
          bottom: Math.max(...words.map(row => Number(row[7]) + Number(row[9]))),
        };
        const point = { x: before.bounds.x + titlePoint[0], y: before.bounds.y + titlePoint[1] };
        expect(point.x).toBeGreaterThanOrEqual(textBounds.left);
        expect(point.x).toBeLessThanOrEqual(textBounds.right);
        expect(point.y).toBeGreaterThanOrEqual(textBounds.top);
        expect(point.y).toBeLessThanOrEqual(textBounds.bottom);
        const after = await geometry();
        expect(after).toEqual(before);
        await writeFile(join(artifacts, "native-point-verification.json"), JSON.stringify({
          before, after, appScreenshotPoint: titlePoint, nativePoint: point, nativeTextBounds: textBounds,
          nativeScreenshot: nativeImage, method: "Owned X11 client origin plus app screenshot point, independently inside native screenshot OCR title; no assumed equal coordinates", verified: true,
        }, null, 2));
        const screenshotText = async () => {
          const image = await sky.get_screenshot();
          const text = (await exec("tesseract", [image, "stdout", "--psm", "11"], { timeout: 10_000 })).stdout;
          await writeFile(image + ".txt", text);
          return text;
        };
        await use({ sky, point, screenshotText });
      } catch (error) { actionError = error; }
      finally {
        try { await sky.get_screenshot(); }
        catch (error) { await appendFile(join(artifacts, "native-final-capture-error.txt"), String(error)); }
      }
      if (actionError) throw actionError;
    });
  },
  native: async ({ nativeSession }, use) => use(nativeSession.sky),
  nativeTitlePoint: async ({ nativeSession }, use) => use(nativeSession.point),
  nativeScreenshotText: async ({ nativeSession }, use) => use(nativeSession.screenshotText),
});
