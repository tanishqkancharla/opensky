import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Node's test runner itself enables promise execution tracking. Positive strict
// assertions run unchanged in a compatible, externally bounded standalone host.
export function runStrictCase(fixture: URL, name: string): void {
  const child = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(fixture), name], {
    encoding: "utf8", timeout: 10_000, killSignal: "SIGKILL",
  });
  assert.equal(child.error, undefined, String(child.error));
  assert.equal(child.signal, null, child.stderr);
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), { status: "passed", name });
}

export async function runStrictFixture(url: string, cases: Record<string, () => Promise<void>>): Promise<void> {
  if (fileURLToPath(url) !== process.argv[1]) return;
  const name = process.argv[2];
  assert.ok(Object.hasOwn(cases, name), `unknown strict positive case: ${name}`);
  await cases[name]!();
  console.log(JSON.stringify({ status: "passed", name }));
}
