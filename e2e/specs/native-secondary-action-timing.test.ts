import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect } from 'vitest';
import { test } from '../fixtures/sdk.js';

type Window = { pid: number; window_id: number; app_name: string; is_on_screen: boolean; bounds: { width: number; height: number } };
type Driver = { invoke(tool: string, args: Record<string, unknown>): Promise<{ structured: unknown }> };
const index = (tree: string, match: (line: string) => boolean) => {
  const rows = tree.split('\n').filter(l => /\[\d+\]/.test(l) && match(l));
  expect(rows).toHaveLength(1);
  return Number(rows[0]!.match(/\[(\d+)\]/)![1]);
};
const median = (times: number[]) => [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)]!;

// Observe actual dispatch unchanged; retained timing evidence cannot refresh mappings.
function captureDispatch(sdk: unknown) {
  const driver = (sdk as { driver: { call(tool: string, args?: Record<string, unknown>): Promise<unknown> } }).driver;
  const original = driver.call.bind(driver);
  const calls: Array<{ tool: string; args: Record<string, unknown>; milliseconds: number; error?: string }> = [];
  driver.call = async (tool, args = {}) => {
    const started = performance.now(); let error: string | undefined;
    try { return await original(tool, args); }
    catch (caught) { error = String(caught); throw caught; }
    finally { if (tool === 'click' || tool === 'press_key') calls.push({ tool, args, milliseconds: performance.now() - started, error }); }
  };
  return calls;
}


test('ACT-N01: advertised native press keeps digit delivery and bounds auxiliary observation', async ({ sdk, cua }) => {
  const driver = sdk as unknown as Driver;
  const directory = await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR ?? tmpdir(), 'secondary-press-'));
  expect((await sdk.list_apps()).some(a => a.id === 'com.apple.calculator' && a.isRunning)).toBe(false);
  const windows = async () => ((await driver.invoke('list_windows', {})).structured as { windows: Window[] }).windows;
  const before = new Set((await windows()).map(w => `${w.pid}:${w.window_id}`));
  let owned: Window | undefined;
  const times: number[] = [];
  const dispatch = captureDispatch(sdk);
  try {
    await driver.invoke('launch_app', { bundle_id: 'com.apple.calculator', creates_new_application_instance: true, additional_arguments: ['-ApplePersistenceIgnoreState', 'YES'] });
    const app = await cua.getApp('Calculator');
    let tree = await app.getAXState({ disableDiffing: true, emit: false });
    const fresh = (await windows()).filter(w => w.app_name === 'Calculator' && w.is_on_screen
      && w.bounds.width > 100 && w.bounds.height > 100 && !before.has(`${w.pid}:${w.window_id}`));
    expect(fresh).toHaveLength(1); owned = fresh[0]!;
    await app.click(index(tree, l => l.includes('AXButton (All Clear)')));
    tree = await app.getAXState({ disableDiffing: true, emit: false });
    expect(tree).toContain('AXStaticText = "0" (Edit field)');
    for (const digit of ['1', '2', '3']) {
      const button = index(tree, l => l.includes(`AXButton (${digit})`) && l.includes('press'));
      const started = performance.now(); await app.performSecondaryAction(button, 'press'); times.push(performance.now() - started);
      tree = await app.getAXState({ disableDiffing: true, emit: false });
      await writeFile(join(directory, `after-${digit}.txt`), tree);
      expect(tree).toContain(`AXStaticText = "${digit === '1' ? '1' : digit === '2' ? '12' : '123'}" (Edit field)`);
    }
    await writeFile(join(directory, 'acceptance.json'), JSON.stringify({ times, median: median(times), owned, finalDigits: '123' }, null, 2));
    expect(median(times)).toBeLessThan(1100);
  } finally {
    await writeFile(join(directory, 'timings.json'), JSON.stringify({ times, owned, dispatch }, null, 2));
    if (owned) {
      await driver.invoke('close_window', { pid: owned.pid, window_id: owned.window_id });
      await expect.poll(async () => (await windows()).some(w => w.pid === owned!.pid && w.window_id === owned!.window_id && w.is_on_screen)).toBe(false);
    }
    await writeFile(join(directory, 'cleanup.json'), JSON.stringify({ app: 'Calculator secondary press fixture',
      owned, safeToContinue: !owned || !(await windows()).some(w => w.pid === owned!.pid && w.window_id === owned!.window_id && w.is_on_screen) }));
  }
}, 60000);

test('ACT-N02: native text confirmation commits actual Safari navigation with bounded observation', async ({ sdk, cua }) => {
  const driver = sdk as unknown as Driver;
  const directory = await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR ?? tmpdir(), 'secondary-confirm-'));
  expect((await sdk.list_apps()).some(a => a.id === 'com.apple.Safari' && a.isRunning)).toBe(false);
  const windows = async () => ((await driver.invoke('list_windows', {})).structured as { windows: Window[] }).windows;
  const before = new Set((await windows()).map(w => `${w.pid}:${w.window_id}`));
  let owned: Window | undefined;
  const times: number[] = [];
  const dispatch = captureDispatch(sdk);
  try {
    await driver.invoke('launch_app', { bundle_id: 'com.apple.Safari', creates_new_application_instance: true, additional_arguments: ['-ApplePersistenceIgnoreState', 'YES'] });
    const app = await cua.getApp('Safari');
    let tree = await app.getAXState({ disableDiffing: true, emit: false });
    const fresh = (await windows()).filter(w => w.app_name === 'Safari' && w.is_on_screen
      && w.bounds.width > 100 && w.bounds.height > 100 && !before.has(`${w.pid}:${w.window_id}`));
    expect(fresh).toHaveLength(1); owned = fresh[0]!;
    for (const domain of ['example.com', 'example.org', 'example.com']) {
      await app.setValue(index(tree, l => l.includes('id=WEB_BROWSER_ADDRESS_AND_SEARCH_FIELD')), `https://${domain}`);
      tree = await app.getAXState({ disableDiffing: true, emit: false });
      const field = index(tree, l => l.includes('id=WEB_BROWSER_ADDRESS_AND_SEARCH_FIELD'));
      const started = performance.now(); await app.performSecondaryAction(field, 'confirm'); times.push(performance.now() - started);
      tree = await app.getAXState({ disableDiffing: true, emit: false });
      await writeFile(join(directory, `after-${times.length}.txt`), tree);
      const loaded = new RegExp(`AXWebArea[^\\n]*url="https://${domain.replaceAll('.', '\\.')}[/]"`);
      // Native keyboard completion does not imply asynchronous network/AX readiness.
      // Preserve the first read above; subsequent observations never repeat input.
      if (!loaded.test(tree)) {
        await expect.poll(async () => {
          tree = await app.getAXState({disableDiffing:true,emit:false});
          return tree;
        }, {timeout:10000,interval:100}).toMatch(loaded);
        await writeFile(join(directory, `loaded-${times.length}.txt`), tree);
      }
      expect(tree).toMatch(loaded);
    }
    await writeFile(join(directory, 'acceptance.json'), JSON.stringify({ times, median: median(times), owned, domains: ['example.com', 'example.org', 'example.com'] }, null, 2));
    expect(median(times)).toBeLessThan(1100);
  } finally {
    await writeFile(join(directory, 'timings.json'), JSON.stringify({ times, owned, dispatch }, null, 2));
    if (owned) {
      await driver.invoke('close_window', { pid: owned.pid, window_id: owned.window_id });
      await expect.poll(async () => (await windows()).some(w => w.pid === owned!.pid && w.window_id === owned!.window_id && w.is_on_screen)).toBe(false);
    }
    await writeFile(join(directory, 'cleanup.json'), JSON.stringify({ app: 'Safari secondary confirm fixture',
      owned, safeToContinue: !owned || !(await windows()).some(w => w.pid === owned!.pid && w.window_id === owned!.window_id && w.is_on_screen) }));
  }
}, 90000);
