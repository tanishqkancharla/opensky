import { expect } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test as base } from "./linux-dropdown.js";

type Form = {
  read(): Promise<string>;
  setEntries(value: string): Promise<void>;
  selectTab(name: string): Promise<void>;
  accept(): Promise<void>;
};

export const test = base.extend<{ form: Form }>({
  form: async ({ app, dialog, task }, use) => {
    void dialog;
    const directory = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "visible-controls", task.name.split(":")[0]);
    await mkdir(directory, { recursive: true });
    let sequence = 0;
    const read = async () => {
      const tree = await app.getAXState({ disableDiffing: true });
      await writeFile(resolve(directory, `observation-${++sequence}.txt`), tree);
      await writeFile(resolve(directory, `observation-${sequence}.png`), await app.getScreenshot());
      return tree;
    };
    const namedIndex = async (role: string, name: string) => {
      const lines = (await read()).split("\n").filter(line => line.includes(`] ${role} ${JSON.stringify(name)}`));
      expect(lines).toHaveLength(1);
      return Number(lines[0]!.match(/\[(\d+)\]/)![1]);
    };
    await use({ read,
      setEntries: async value => {
        const lines = (await read()).split("\n");
        const panels = lines.flatMap((line, index) => /- panel = "Entries"$/.test(line) ? [index] : []);
        expect(panels).toHaveLength(1);
        const start = panels[0]!;
        const depth = lines[start]!.search(/\S/);
        const children: string[] = [];
        for (const line of lines.slice(start + 1)) {
          if (line.trim() && line.search(/\S/) <= depth) break;
          if (/\[\d+\] text /.test(line)) children.push(line);
        }
        expect(children).toHaveLength(1);
        await app.setValue(Number(children[0]!.match(/\[(\d+)\]/)![1]), value);
      },
      selectTab: async name => app.click(await namedIndex("page tab", name)),
      accept: async () => app.click(await namedIndex("push button", "OK")),
    });
  },
});
