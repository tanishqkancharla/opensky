import { expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { PNG } from "pngjs";
import { test as base } from "./linux-dropdown.js";

const exec = promisify(execFile);
type Field = { index: number; replacement: string; expectedTitles: Record<string, string[]>; observe(): Promise<string> };

// A real LibreOffice field advertising activate is necessary here. The Entries
// multiline editor can have no activation action and miss the defect entirely.
export const test = base.extend<{ titleField: Field }>({
  titleField: async ({ app, dialog, task }, use) => {
    const artifacts = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "dropdown", task.name.split(":")[0], "editable");
    await mkdir(artifacts, { recursive: true });
    let sequence = 0;
    const observe = async () => {
      const stem = join(artifacts, `observation-${++sequence}`);
      await writeFile(`${stem}.png`, await app.getScreenshot());
      const state = await app.getAXState({ disableDiffing: true });
      await writeFile(`${stem}.txt`, state);
      return state;
    };
    await app.click(dialog.entriesPoint);
    await app.typeText("Pass\nFail\nHeld");
    const tabs = (await observe()).split("\n").filter(line => /\[\d+\] page tab "Input Help"/.test(line));
    expect(tabs).toHaveLength(1);
    await app.click(Number(tabs[0]!.match(/\[(\d+)\]/)![1]));
    await expect(observe()).resolves.toMatch(/page tab "Input Help".*\[selected\]/);

    const image = await app.getScreenshot();
    const imagePath = join(artifacts, "title-location.png");
    await writeFile(imagePath, image);
    const tsv = (await exec("tesseract", [imagePath, "stdout", "--psm", "11", "tsv"], { timeout: 10_000 })).stdout;
    await writeFile(join(artifacts, "title-location.tsv"), tsv);
    const labels = tsv.trimEnd().split("\n").slice(1).map(line => line.split("\t"))
      .filter(fields => fields[0] === "5" && fields[11]?.trim() === "Title:");
    expect(labels).toHaveLength(1);
    const label = labels[0]!;
    const x = Number(label[6]) + Number(label[8]) + 100;
    const y = Number(label[7]) + Number(label[9]) / 2;
    const png = PNG.sync.read(Buffer.from(image));
    expect(x).toBeLessThan(png.width);
    expect(y).toBeLessThan(png.height);
    const pixel = (Math.floor(y) * png.width + Math.floor(x)) * 4;
    expect([...png.data.subarray(pixel, pixel + 3)]).toEqual([255, 255, 255]);
    await app.click([x, y]);
    await app.typeText("OpenSky original help title");
    await app.pressKey("TAB");
    const fields = (await observe()).split("\n").filter(line =>
      /\[\d+\] text /.test(line) && line.includes('"OpenSky original help title"'));
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatch(/actions=\[[^\]]*\bactivate\b/);
    const replacement = "Choose the order result";
    await use({ index: Number(fields[0]!.match(/\[(\d+)\]/)![1]), replacement, observe,
      expectedTitles: Object.fromEntries(Array.from({ length: 28 }, (_, index) => [`D${index + 2}`, [replacement]])) });
  },
});
