/// <reference lib="webworker" />
import type { WorkerInbound, WorkerOutbound } from '../types';
import { runSolverPipeline } from './solver';
import { probeFeasibility } from './probe';
import { initCpSatSolver } from './cpSatSolver';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener('message', async (ev: MessageEvent<WorkerInbound>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'run') {
      // 정확 수리를 사용하는 전략은 HiGHS(WASM)를 먼저 로드.
      // 실패해도 폴백 경로가 있다 (cpSatSeed→min-conflicts, exact 수리→Kempe만).
      if (msg.input.options.strategy === 'coordinated' || msg.input.options.strategy === 'cp-sat' || msg.input.options.runMode === 'exact') {
        try {
          await initCpSatSolver();
        } catch {
          /* 로드 실패 → 폴백 */
        }
      }
      const result = runSolverPipeline(msg.input, (progress) => {
        const out: WorkerOutbound = { type: 'progress', progress };
        ctx.postMessage(out);
      }, 2, msg.initial);
      const out: WorkerOutbound = { type: 'result', result };
      ctx.postMessage(out);
    } else if (msg.type === 'probe') {
      const report = probeFeasibility(msg.input);
      const out: WorkerOutbound = { type: 'probe-result', report };
      ctx.postMessage(out);
    }
  } catch (e) {
    const out: WorkerOutbound = {
      type: 'error',
      message: e instanceof Error ? e.message : String(e),
    };
    ctx.postMessage(out);
  }
});

export {};
