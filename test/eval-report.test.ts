import { expect, test } from 'bun:test';
import { renderReport } from '../evals/report.js';

test('missing scores are not a passing eval', () => {
  expect(renderReport(null)).toContain('not a passing evaluation');
});
test('zero criteria and partial scores fail, errors stay separate', () => {
  const results = [
    { name: 'empty', status: 'completed', score: { passed: 0, total: 0 } },
    { name: 'partial', status: 'completed', score: { passed: 1, total: 2 } },
    { name: 'blocked', status: 'error', score: { passed: 0, total: 0 } },
    { name: 'good', status: 'completed', score: { passed: 2, total: 2 } },
  ].map(row => ({ ...row, harness: 'opensky', durationMs: 1000 }));
  const report = renderReport({ model: 'test', results });
  expect(report).toContain('| empty | opensky | FAIL');
  expect(report).toContain('| partial | opensky | FAIL');
  expect(report).toContain('| blocked | opensky | ERROR');
  expect(report).toContain('| good | opensky | PASS');
});
