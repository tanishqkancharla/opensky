import { createServer } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect } from 'vitest';
import { test } from '../fixtures/sdk.js';

test('AX-N01: one Safari reload applies once without opening an unrelated toolbar menu', async ({ cua }) => {
  const directory = await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR ?? tmpdir(), 'ax-reload-outcome-'));
  const counts = { first: 0, second: 0 };
  const requests: Array<{ path: string; count: number }> = [];
  const server = createServer((req, res) => {
    const key = req.url === '/first' ? 'first' : req.url === '/second' ? 'second' : null;
    if (!key) { res.writeHead(404); res.end(); return; }
    counts[key]++; requests.push({ path: req.url!, count: counts[key] });
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    res.end(`<html><title>Owned outcome ${key}</title><body><h1>Effect receipt ${key} ${counts[key]}</h1></body></html>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  let serial = 0;
  try {
    const app = await cua.getApp('Safari');
    const state = async () => {
      const tree = await app.getAXState({ disableDiffing: true, emit: false });
      await writeFile(join(directory, `${serial++}-state.txt`), tree); return tree;
    };
    const index = (tree: string, id: string) => {
      const rows = tree.split('\n').filter(row => row.includes(`id=${id}`) && /\[\d+\]/.test(row));
      expect(rows).toHaveLength(1); return Number(rows[0]!.match(/\[(\d+)\]/)![1]);
    };
    const loaded = async (key: 'first' | 'second') => {
      let tree = '';
      await expect.poll(async () => {
        tree = await state();
        return tree.includes(`${base}/${key}`) && tree.includes(`Effect receipt ${key} ${counts[key]}`)
          && tree.includes('id=ReloadButton');
      }, { timeout: 10_000 }).toBe(true);
      return tree;
    };
    let tree = await state();
    await app.setValue(index(tree, 'WEB_BROWSER_ADDRESS_AND_SEARCH_FIELD'), `${base}/first`);
    await app.pressKey('ENTER'); tree = await loaded('first');
    await app.click(index(tree, 'NewTabButton')); tree = await state();
    await app.setValue(index(tree, 'WEB_BROWSER_ADDRESS_AND_SEARCH_FIELD'), `${base}/second`);
    await app.pressKey('ENTER'); tree = await loaded('second');
    const first = tree.split('\n').filter(row => /AXRadioButton.*id=TabBarTab\?/.test(row) && row.includes('Owned outcome first'));
    expect(first).toHaveLength(1);
    await app.click(Number(first[0]!.match(/\[(\d+)\]/)![1])); tree = await loaded('first');
    const countBefore = counts.first; let error: null | { message: string; details: unknown } = null;
    // Exactly one dispatch; neither a caught error nor an unchanged URL replays it.
    try { await app.click(index(tree, 'ReloadButton')); }
    catch (e) {
      error = { message: String(e), details: (e as { details?: unknown }).details };
      expect(error.message).toContain('AX action outcome unknown');
      expect(error.message).toContain('may already have taken effect');
      expect(error.message).toContain('do not automatically replay');
      expect(error.details).toMatchObject({ effect: 'unknown', verified: false, dispatch_attempted: true });
    }
    tree = await loaded('first');
    expect(counts.first - countBefore).toBe(1);
    expect(tree).toContain(`Effect receipt first ${countBefore + 1}`);
    await writeFile(join(directory, 'acceptance.json'), JSON.stringify({ requests, countBefore, countAfter: counts.first,
      requestDelta: counts.first - countBefore, unexpectedMenu: /RecentlyClosedTabsMenu|Customize Toolbar/.test(tree), error, unknownOutcomeBranchExercised: error !== null,
      limits: 'Actual no-store HTTP request and displayed receipt prove one effect. AXCannotComplete is intermittent; success is allowed, and unexercised error-branch coverage is reported explicitly.' }, null, 2));
    expect(tree).not.toMatch(/RecentlyClosedTabsMenu|Customize Toolbar/);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  // Exact owned Safari process/window cleanup belongs to the GUI controller.
}, 60_000);
