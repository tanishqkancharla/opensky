import { PNG } from "pngjs";
import { expect, test as base } from "vitest";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { assertDisposableLinuxDesktop, withOwnedLinuxApp } from "../../evals/parity/linux-app.js";
import { prepareLinuxBenchmarkApp } from "../../evals/parity/linux-benchmark-app.js";
import { readWorkbook } from "./linux-dropdown.js";
import { withOwnedCuaRepl } from "./cua-repl-client.js";

type Replay = {
  cell(code: string): Promise<{ error: string | null; text: string }>;
  index(role: string, label: string): number;
  dialogPoint(point: [number, number]): string;
};
type Document = { readChoices(): Promise<unknown>; readValues(): Promise<unknown>; expectedChoices: unknown; originalValues: unknown };
const root = fileURLToPath(new URL("../../", import.meta.url));
const filename = "Order_Id_Mark_Pass_Fail.xlsx";
const source = join(root, "evals/parity/osworld/ecb0df7a-4e8d-4a03-b162-053391d3afaf", filename);

export const test = base.extend<{ owned: { repl: Replay; document: Document }; repl: Replay; document: Document }>({
  owned: async ({ task }, use) => {
    assertDisposableLinuxDesktop();
    expect(createHash("sha256").update(await readFile(source)).digest("hex")).toBe("c72c9bb3446ecebf1b10fd4e48833670683aaff02b20cfd10309e5b1626de5fa");
    const artifacts = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "dropdown", task.name.split(":")[0]);
    await mkdir(artifacts, { recursive: true });
    const temporary = await mkdtemp(join(tmpdir(), "opensky-dropdown-repl-"));
    const path = join(temporary, filename);
    let launched = false;
    try {
      await copyFile(source, path);
      const originalValues = (await readWorkbook(source)).values;
      const launch = await prepareLinuxBenchmarkApp({ category: "libreoffice_calc", document: path, temporary, artifacts });
      launched = true;
      await withOwnedLinuxApp(launch.options, async () => {
        try {
          await withOwnedCuaRepl(join(artifacts, "repl"), async client => {
            const indices = new Map<string, number>();
            let imageSize: { width: number; height: number } | undefined;
            const repl: Replay = {
              async cell(code) {
                const result = await client.cell(code);
                for (const block of result.content) {
                  if (block.type === "image") {
                    const image = PNG.sync.read(Buffer.from(block.data, "base64"));
                    imageSize = { width: image.width, height: image.height };
                  }
                }
                const texts = result.content.filter((block: any) => block.type === "text").map((block: any) => block.text as string);
                for (const text of texts) {
                  if (/^- (?:dialog|frame) = /m.test(text)) indices.clear();
                  for (const line of text.split("\n")) {
                    const match = line.match(/\[(\d+)\] (.+?) "([^"\n]*)"/);
                    if (match) {
                      const key = `${match[2]}:${match[3]}`;
                      // Reuse the first observed identity just as the retained
                      // agent reused Validity, combo and OK indices across cells.
                      if (!indices.has(key)) indices.set(key, Number(match[1]));
                    }
                  }
                }
                return { error: result.isError ? texts.join("\n") : null, text: texts.join("\n") };
              },
              dialogPoint([x, y]) {
                if (!imageSize || imageSize.width > 600 || imageSize.height > 600) throw new Error("Expected the observed cropped Validity dialog");
                // Same visible control in the retained 474x455 dialog image;
                // remote GTK font metrics change its screenshot dimensions.
                return JSON.stringify([Math.round(x * imageSize.width / 474), Math.round(y * imageSize.height / 455)]);
              },
              index(role, label) {
                const value = indices.get(`${role}:${label}`);
                if (value === undefined) throw new Error(`No observed ${role} ${JSON.stringify(label)}`);
                return value;
              },
            };
            const expectedChoices = Object.fromEntries(Array.from({ length: 28 }, (_, index) => [`D${index + 2}`, [{ type: "list", choices: ["Pass", "Fail", "Held"], arrowVisible: true }]]));
            await use({ repl, document: { originalValues, expectedChoices, readChoices: async () => (await readWorkbook(path)).choices, readValues: async () => (await readWorkbook(path)).values } });
          });
        } finally {
          await copyFile(path, join(artifacts, filename));
          await writeFile(join(artifacts, "saved-workbook.json"), JSON.stringify(await readWorkbook(path), null, 2));
        }
      });
    } finally {
      const cleanup = await readFile(join(artifacts, "cleanup.json"), "utf8").then(JSON.parse).catch(() => null);
      if (!launched || cleanup?.verifiedExited) await rm(temporary, { recursive: true, force: true });
      await writeFile(join(artifacts, "temporary-cleanup.json"), JSON.stringify({ removed: await readFile(path).then(() => false, () => true) }));
    }
  },
  repl: async ({ owned }, use) => use(owned.repl),
  document: async ({ owned }, use) => use(owned.document),
});
