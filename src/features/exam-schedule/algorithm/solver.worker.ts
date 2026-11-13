/// <reference lib="webworker" />
import type { WorkerInbound, WorkerOutbound } from '../types';
import { runSolver } from './solver';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener('message', (ev: MessageEvent<WorkerInbound>) => {
  const msg = ev.data;
  if (msg.type === 'run') {
    try {
      const result = runSolver(msg.input, (progress) => {
        const out: WorkerOutbound = { type: 'progress', progress };
        ctx.postMessage(out);
      });
      const out: WorkerOutbound = { type: 'result', result };
      ctx.postMessage(out);
    } catch (e) {
      const out: WorkerOutbound = {
        type: 'error',
        message: e instanceof Error ? e.message : String(e),
      };
      ctx.postMessage(out);
    }
  }
});

export {};
