import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export function renderReport(summary: any): string {
  if (!Array.isArray(summary?.results) || !summary.results.length) return '# OpenSky evals\n\nNo scored cases. Infrastructure/setup failure; not a passing evaluation.\n';
  const lines = ['# OpenSky evals', '', `Model: ${summary.model}`, '', '| Case | Harness | Status | Criteria | Seconds |', '|---|---|---|---|---|'];
  for (const row of summary.results) {
    const status = row.status !== 'completed' ? 'ERROR' : row.score.total > 0 && row.score.passed === row.score.total ? 'PASS' : 'FAIL';
    lines.push(`| ${String(row.name).replaceAll('|', '\\|')} | ${row.harness} | ${status} | ${row.score.passed}/${row.score.total} | ${(row.durationMs / 1000).toFixed(1)} |`);
  }
  lines.push('', 'Scores are evidence-based judge criteria, not independent proof of desktop state. See raw transcripts and cleanup records in the run artifact.', 'Compare matching model, driver version, case definitions and runner images only.');
  return lines.join('\n');
}
if (import.meta.main) {
  const summary = await readFile(join(process.argv[2] ?? 'evals/runs/ci', 'summary.json'), 'utf8').then(JSON.parse).catch(() => null);
  console.log(renderReport(summary));
}
