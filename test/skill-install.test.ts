import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "bun:test";

import { installSkill, skillDestinations, uninstallSkill } from "../src/skill-install.js";

describe("skill install", () => {
  it("computes project and global destinations", () => {
    const project = skillDestinations({ cwd: "/tmp/proj", home: "/tmp/home", global: false, agents: ["cursor"] });
    assert.deepEqual(project, ["/tmp/proj/.cursor/skills/opensky"]);
    const user = skillDestinations({ cwd: "/tmp/proj", home: "/tmp/home", global: true, agents: ["cursor"] });
    assert.deepEqual(user, ["/tmp/home/.cursor/skills/opensky"]);
  });

  it("copies SKILL.md into agent directories", async () => {
    const dir = await mkdtemp(join(tmpdir(), "opensky-skill-"));
    const result = await installSkill({
      cwd: dir,
      global: false,
      agents: ["cursor", "agents"],
    });
    assert.equal(result.destinations.length, 2);
    const markdown = await readFile(join(dir, ".cursor", "skills", "opensky", "SKILL.md"), "utf8");
    assert.match(markdown, /canonical loop/i);
    const removed = await uninstallSkill({ cwd: dir, global: false, agents: ["cursor", "agents"] });
    assert.equal(removed.length, 2);
  });
});
