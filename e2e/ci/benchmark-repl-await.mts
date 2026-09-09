// Diagnostic benchmark: real strict AsyncRepl plus host timers, no driver or model.
// Run from the repository root: node --import tsx e2e/ci/benchmark-repl-await.mts
import { AsyncRepl } from '../../src/async-repl.js';
const repl = new AsyncRepl({ allowNodeApis: false, strictSandbox: true, timeoutMs: 1000, awaitTimeoutMs: null });
repl.installContextFactory('timer', 'return Object.freeze({ wait: ms => __wait(ms) });', { __wait: (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)) });
await repl.evaluate('await timer.wait(10); return 1;');
for (const [label, code] of [ ['idle-2000ms', 'await timer.wait(2000); return 1;'], ['sequence-100x5ms', 'for (let i = 0; i < 100; i++) await timer.wait(5); return 100;'], ['sequence-100x0ms', 'for (let i = 0; i < 100; i++) await timer.wait(0); return 100;'] ]) {
 const cpu = process.cpuUsage(); const start = performance.now();
 const result = await repl.evaluate(code);
 const wallMs = performance.now() - start; const used = process.cpuUsage(cpu);
 console.log(JSON.stringify({label,wallMs,cpuMs:(used.user+used.system)/1000,value:result.value}));
}
