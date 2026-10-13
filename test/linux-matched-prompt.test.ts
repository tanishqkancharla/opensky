import assert from "node:assert/strict";
import { test } from "node:test";
import { matchedLinuxPrompt } from "../evals/parity/linux-prompt.js";

test("Linux task prompts differ only in the interface label and retain the exact task and save target", () => {
  const task = { taskInstruction: "Help me center align the heading in LibreOffice.", appName: "LibreOffice", inputFile: "Constitution_Template_With_Guidelines.docx" };
  const native = matchedLinuxPrompt({ ...task, backend: "native" });
  const sdk = matchedLinuxPrompt({ ...task, backend: "opensky" });
  assert.equal(native.replace("the Computer use plugin", "OpenSky"), sdk);
  assert.ok(native.includes(task.taskInstruction) && native.includes(task.inputFile));
  assert.equal(native.split(/\.(?:\s|$)/).filter(Boolean).length, 2);
  assert.ok(native.length < 300);
  assert.doesNotMatch(native, /import|clipboard|AX|scoring|macro|skill|@oai/);
});
