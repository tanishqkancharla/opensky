import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderReport } from '../evals/report.js';

test('missing scores are not a passing eval', () => {
  assert.ok(renderReport(null).includes('not a passing evaluation'));
});
test('zero criteria and partial scores fail, errors stay separate', () => {
  const results = [
    { name: 'empty', status: 'completed', score: { passed: 0, total: 0 } },
    { name: 'partial', status: 'completed', score: { passed: 1, total: 2 } },
    { name: 'blocked', status: 'error', score: { passed: 0, total: 0 } },
    { name: 'good', status: 'completed', score: { passed: 2, total: 2 } },
  ].map(row => ({ ...row, harness: 'opensky', durationMs: 1000 }));
  const report = renderReport({ model: 'test', results });
  assert.ok(report.includes('| empty | opensky | FAIL'));
  assert.ok(report.includes('| partial | opensky | FAIL'));
  assert.ok(report.includes('| blocked | opensky | ERROR'));
  assert.ok(report.includes('| good | opensky | PASS'));
});
