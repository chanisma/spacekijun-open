import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ExamScheduleInput,
  ScheduleRunResult,
  SolverProgress,
  WorkerInbound,
  WorkerOutbound,
} from '../types';
// Vite ?worker import
// eslint-disable-next-line import/no-unresolved
import SolverWorker from '../algorithm/solver.worker?worker';

export type RunStatus = 'idle' | 'running' | 'done' | 'error';

export function useExamScheduleRun() {
  const workerRef = useRef<Worker | null>(null);
  const [status, setStatus] = useState<RunStatus>('idle');
  const [progress, setProgress] = useState<SolverProgress | null>(null);
  const [result, setResult] = useState<ScheduleRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const start = useCallback((input: ExamScheduleInput) => {
    workerRef.current?.terminate();
    const worker = new SolverWorker();
    workerRef.current = worker;
    setStatus('running');
    setProgress({ phase: 'init', current: 0, total: 1 });
    setResult(null);
    setError(null);
    worker.onmessage = (ev: MessageEvent<WorkerOutbound>) => {
      const msg = ev.data;
      if (msg.type === 'progress') setProgress(msg.progress);
      else if (msg.type === 'result') {
        setResult(msg.result);
        setStatus('done');
      } else if (msg.type === 'error') {
        setError(msg.message);
        setStatus('error');
      }
    };
    worker.onerror = (e) => {
      setError(e.message ?? 'Worker error');
      setStatus('error');
    };
    worker.onmessageerror = () => {
      setError('Worker 메시지 직렬화 오류');
      setStatus('error');
    };
    const inbound: WorkerInbound = { type: 'run', input };
    worker.postMessage(inbound);
  }, []);

  const cancel = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setStatus('idle');
  }, []);

  return { status, progress, result, error, start, cancel };
}
