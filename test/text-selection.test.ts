import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseTextSelection } from '../src/opensky.js';
import { makeHarness } from './harness.ts';

const selection = (text = '😀', length = text.length) => ({pid: 12, window_id: 34, role: 'AXTextArea', range: {start_utf16: 7, length_utf16: length}, text, text_truncated: false});
test('selection parser rejects wrong scope, incoherent ranges, split Unicode and oversized evidence', () => {
  assert.deepEqual(parseTextSelection(selection(), 12, 34), {role: 'AXTextArea', startUTF16: 7, lengthUTF16: 2, text: '😀', textTruncated: false});
  for (const bad of [selection('😀', 1), selection('\ud83d', 1), selection('a'.repeat(2049)),
    {...selection(), pid: 13}, {...selection(), window_id: 35}, {...selection(), role: 'AXSecureTextField'},
    {...selection(), range: {start_utf16: -1, length_utf16: 2}},
    {...selection(), range: {start_utf16: Number.MAX_SAFE_INTEGER, length_utf16: 2}},
    {...selection(), text_truncated: true}]) assert.equal(parseTextSelection(bad, 12, 34), undefined);
  assert.equal(parseTextSelection({...selection('a'.repeat(2048), 3000), text_truncated: true}, 12, 34)?.textTruncated, true);
});

test('current selection and clearing survive unchanged tree diffs; screenshot-only reads expose no stale selection', async () => {
  const {opensky, driver} = await makeHarness();
  const call = driver.call.bind(driver);
  let selected = true;
  driver.call = async (tool, args) => {
    const result = await call(tool, args);
    if (tool === 'get_window_state' && args?.probe_only !== true) {
      const s = result.structured as Record<string, unknown>;
      s.text_selection = {...selection(selected ? '😀' : '', selected ? 2 : 0), pid: args?.pid, window_id: args?.window_id};
    }
    return result;
  };
  try {
    const first = await opensky.get_app_state({app: 'Calculator', includeScreenshot: false});
    const next = await opensky.get_app_state({app: first.targetHandle, includeScreenshot: false});
    assert.match(next.text, /No accessibility changes\./);
    assert.match(next.text, /Selected text \(UTF-16 7\+2\): "😀"/);
    const pixels = await opensky.get_app_state({app: first.targetHandle, includeAccessibilityTree: false});
    assert.equal(pixels.textSelection, undefined);
    assert.equal(pixels.text, '');
    selected = false;
    const cleared = await opensky.get_app_state({app: first.targetHandle, includeScreenshot: false});
    assert.match(cleared.text, /Text selection: none \(caret 7, UTF-16\)\./);
    assert.equal(cleared.textSelection?.lengthUTF16, 0);
    assert.doesNotMatch(cleared.text, /Selected text/);
  } finally {await opensky.close();}
});
