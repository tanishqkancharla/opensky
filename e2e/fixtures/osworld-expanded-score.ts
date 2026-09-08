import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test as base } from "vitest";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../../evals/parity/osworld/", import.meta.url));
type Output = { task: string; path: string };
type Score = { taskSuccess: boolean; upstreamScore: number; contentMatches: boolean; formatMatches: boolean };
export const expandedCases = [
  {
    "id": "035f41ba-6653-43ab-aa63-c86d449d62e5",
    "name": "gross profit formulas"
  },
  {
    "id": "0cecd4f3-74de-457b-ba94-29ad6b5dafb6",
    "name": "sheet names and order"
  },
  {
    "id": "4188d3a4-077d-46b7-9c86-23e1a036f6c1",
    "name": "frozen headers"
  },
  {
    "id": "01b269ae-2111-4a07-81fd-3fcd711993b0",
    "name": "fill blank cells"
  },
  {
    "id": "51b11269-2ca8-4b2a-9163-f21758420e78",
    "name": "sort by amount"
  },
  {
    "id": "ecb0df7a-4e8d-4a03-b162-053391d3afaf",
    "name": "validation choices"
  },
  {
    "id": "12382c62-0cd1-4bf2-bdc8-1d20bf9b2371",
    "name": "clustered column chart"
  },
  {
    "id": "37608790-6147-45d0-9f20-1137bb35703d",
    "name": "split name and rank fields"
  },
  {
    "id": "9cf05d24-6bd9-4dae-8967-f67d88f5d38a",
    "name": "green slide background"
  },
  {
    "id": "5cfb9197-e72b-454b-900e-c06b0c802b40",
    "name": "table headings"
  },
  {
    "id": "9ec204e4-f0a3-42f8-8458-b772a6797cab",
    "name": "duplicate slides"
  },
  {
    "id": "3161d64e-3120-47b4-aaad-6a764a92493b",
    "name": "text box font sizes"
  },
  {
    "id": "2b94c692-6abb-48ae-ab0b-b3e8a19cb340",
    "name": "image placement"
  },
  {
    "id": "0ed39f63-6049-43d4-ba4d-5fa2fe04a951",
    "name": "replace text"
  },
  {
    "id": "ec71221e-ac43-46f9-89b8-ee7d80f7e1c5",
    "name": "indent selected lines"
  }
];
const expandedTaskIds = expandedCases.map(task => task.id);

export const test = base.extend<{
  outputs: { original: Record<string, Output>; completed: Record<string, Output>; stackedChart: Output; changedSource: Output; extraSheet: Output };
  scorer: { score(output: Output): Promise<Score> };
}>({
  outputs: async ({}, use) => {
    const temporary = await mkdtemp(join(tmpdir(), "opensky-expanded-grader-"));
    try {
      // Saved files are the grader's public inputs. Constructed specimens
      // verify grading only; they are never counted as GUI acceptance.
      await exec(process.env.OPENSKY_EVAL_PYTHON ?? "python3", ["-c", `
import json,sys
from pathlib import Path
from pptx import Presentation
from openpyxl import load_workbook
root,out=Path(sys.argv[1]),Path(sys.argv[2])
t="2b94c692-6abb-48ae-ab0b-b3e8a19cb340"
p=Presentation(root/t/"201_6.pptx")
for shape in p.slides[1].shapes:
 if shape.shape_type==13: shape.left=p.slide_width-shape.width
p.save(out/"moved-image.pptx")
t="12382c62-0cd1-4bf2-bdc8-1d20bf9b2371"
ev=json.loads((root/t/"upstream-task.json").read_text())["evaluator"]
gold=root/t/ev["expected"]["dest"]
for mutation in ["stacked", "changed-source", "extra-sheet"]:
 w=load_workbook(gold)
 if mutation=="stacked": w["Sheet2"]._charts[0].grouping="stacked"
 elif mutation=="changed-source": w["Sheet1"]["A2"]="wrong week"
 else: w.create_sheet("unrequested data")
 w.save(out/(mutation+".xlsx"))
`, root, temporary], { timeout: 15_000 });
      const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
      const original: Record<string, Output> = {}, completed: Record<string, Output> = {};
      for (const id of expandedTaskIds) {
        const task = manifest.tasks.find((task: { id: string }) => task.id === id);
        const upstream = JSON.parse(await readFile(join(root, id, "upstream-task.json"), "utf8"));
        const expected = Array.isArray(upstream.evaluator.expected) ? upstream.evaluator.expected[0] : upstream.evaluator.expected;
        original[id] = { task: id, path: join(root, id, task.inputFile) };
        completed[id] = { task: id, path: id === "2b94c692-6abb-48ae-ab0b-b3e8a19cb340" ? join(temporary, "moved-image.pptx") : join(root, id, expected.dest) };
      }
      const chart = (file: string) => ({ task: "12382c62-0cd1-4bf2-bdc8-1d20bf9b2371", path: join(temporary, file) });
      await use({ original, completed, stackedChart: chart("stacked.xlsx"), changedSource: chart("changed-source.xlsx"), extraSheet: chart("extra-sheet.xlsx") });
    } finally { await rm(temporary, { recursive: true, force: true }); }
  },
  scorer: async ({}, use) => {
    await use({ score: async output => JSON.parse((await exec(process.env.OPENSKY_EVAL_PYTHON ?? "python3", [join(root, "score.py"), output.task, output.path], { timeout: 15_000 })).stdout) });
  },
});
