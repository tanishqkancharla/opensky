import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { installSkill, skillDestinations, uninstallSkill } from "../dist/skill-install.js";

describe("skill install", () => {
  it("computes project and global destinations", () => {
    const project = skillDestinations({ cwd: "/tmp/proj", home: "/tmp/home", global: false, agents: ["cursor"] });
    assert.deepEqual(project, ["/tmp/proj/.cursor/skills/ccua"]);
    const user = skillDestinations({ cwd: "/tmp/proj", home: "/tmp/home", global: true, agents: ["cursor"] });
    assert.deepEqual(user, ["/tmp/home/.cursor/skills/ccua"]);
  });

  it("copies SKILL.md into agent directories", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ccua-skill-"));
    const result = await installSkill({
      cwd: dir,
      global: false,
      agents: ["cursor", "agents"],
    });
    assert.equal(result.destinations.length, 2);
    const markdown = await readFile(join(dir, ".cursor", "skills", "ccua", "SKILL.md"), "utf8");
    assert.match(markdown, /canonical loop/i);
    const removed = await uninstallSkill({ cwd: dir, global: false, agents: ["cursor", "agents"] });
    assert.equal(removed.length, 2);
  });
});
