import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from 'vitest';
import { test, nativeTest } from '../fixtures/sdk.js';

const cue = 'App window changed; use the indices in this state.';

test('WINDOW-N01: a physical app window transition emits one AX cue after screenshot-only observation, while tabs do not', async ({ sdk, cua }) => {
  const app = await cua.getApp('Safari');
  const windows = async () => ((await sdk.driver.call('list_windows', {})).structured as {windows: Array<{app_name:string;is_on_screen:boolean;bounds:{width:number;height:number};window_id:number}>}).windows
    .filter((w: any) => w.app_name === 'Safari' && w.is_on_screen && w.bounds.width > 100 && w.bounds.height > 100);
  const artifacts = process.env.OPENSKY_E2E_ARTIFACT_DIR!;
  const initial = await app.getAXState({ emit: false, disableDiffing: true });
  const before = await windows();
  expect(before).toHaveLength(1);
  expect(initial).not.toContain(cue);
  await app.pressKey('super+n');
  const image = await app.getScreenshot({ emit: false });
  await writeFile(join(artifacts, 'window-transition.png'), image);
  const second = await windows();
  expect(second).toHaveLength(2);
  expect(second.filter((w: any) => !before.some((old: any) => old.window_id === w.window_id))).toHaveLength(1);
  const changed = await app.getAXState({ emit: false, disableDiffing: true });
  expect(changed.startsWith(cue + '\n')).toBe(true);
  const steady = await app.getAXState({ emit: false, disableDiffing: true });
  expect(steady).not.toContain(cue);
  await app.pressKey('super+t');
  const tab = await app.getAXState({ emit: false });
  expect(tab).not.toContain(cue);
  expect(await windows()).toHaveLength(2);
  await app.pressKey('super+w');
  const closedTab = await app.getAXState({ emit: false });
  expect(closedTab).not.toContain(cue);
  expect(await windows()).toHaveLength(2);
  await app.pressKey('super+w');
  const returned = await app.getAXStateAndScreenshot({ emit: false, disableDiffing: true });
  expect(await windows()).toHaveLength(1);
  expect(returned.state.startsWith(cue + '\n')).toBe(true);
  const originalId = initial.match(/UUID=([^\s\]]+)/)![1];
  expect(returned.state).toContain(`UUID=${originalId}`);
  await writeFile(join(artifacts, 'window-cue-states.json'), JSON.stringify({initial,changed,steady,tab,closedTab,returned:returned.state}, null, 2));
}, 90000);

const exactTest = nativeTest.extend<{documentCleanupSave: boolean}>({documentCleanupSave: false});
exactTest('WINDOW-N02: exact document observation stays exact and emits no app transition cue after opening a sibling', async ({ sdk, cua, document }) => {
  const exact = await cua.getApp(document.handle);
  const before = await exact.getAXState({emit:false,disableDiffing:true});
  await sdk.press_key({app:document.handle,key:'super+n'});
  const siblings = (await document.windows()).filter(w => w.onScreen && w.windowId !== document.windowId && w.title.startsWith('Untitled'));
  expect(siblings).toHaveLength(1);
  const after = await exact.getAXState({emit:false,disableDiffing:true});
  expect(before).not.toContain(cue);
  expect(after).not.toContain(cue);
  expect(after).toContain(document.initialText.trim());
  expect(await document.read()).toBe(document.initialText);
  await writeFile(join(process.env.OPENSKY_E2E_ARTIFACT_DIR!,'exact-document-states.json'),JSON.stringify({before,after,siblings},null,2));
},90000);
