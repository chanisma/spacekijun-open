import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Placement,
  ProbeReport,
  SolverProgress,
  TimetableInput,
  TimetableRunResult,
  WorkerInbound,
  WorkerOutbound,
} from '../types';
// Vite ?worker import — 솔버를 별도 스레드에서 실행해 UI 블로킹 방지
import SolverWorker from '../algorithm/solver.worker?worker';
import { checkExactSolver, runExactSolver } from '../services/exactSolverService';

export type RunStatus = 'idle' | 'running' | 'done' | 'error';

export function useTimetableRun() {
  const workerRef = useRef<Worker | null>(null);
  const probeRef = useRef<Worker | null>(null);
  const exactRef = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const [status, setStatus] = useState<RunStatus>('idle');
  const [progress, setProgress] = useState<SolverProgress | null>(null);
  const [result, setResult] = useState<TimetableRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [probeStatus, setProbeStatus] = useState<RunStatus>('idle');
  const [probeReport, setProbeReport] = useState<ProbeReport | null>(null);

  useEffect(() => {
    return () => {
      exactRef.current?.abort();
      workerRef.current?.terminate();
      workerRef.current = null;
      probeRef.current?.terminate();
      probeRef.current = null;
    };
  }, []);

  const start = useCallback((input: TimetableInput, initial?: Placement[]) => {
    const token = ++generation.current;
    exactRef.current?.abort();
    const controller = new AbortController();
    exactRef.current = controller;
    workerRef.current?.terminate();
    setStatus('running');
    setProgress({ phase: 'init', current: 0, total: 1 });
    setResult(null);
    setError(null);
    const fail = (e: unknown) => {
      if (token !== generation.current || controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    };
    const exact = async (placements?: Placement[]) => {
      const result = await runExactSolver(input, placements, controller.signal, p => {
        if (token === generation.current) setProgress(p);
      });
      if (token === generation.current && !controller.signal.aborted) { setResult(result); setStatus('done'); }
    };
    void (async () => {
      if (input.options.strategy === 'staged-cpsat') {
        const timeout = setTimeout(() => controller.abort(), 8000);
        try { await checkExactSolver(controller.signal); }
        catch { if (token === generation.current) { setError('정확 탐색 서비스에 연결할 수 없습니다. 로컬 계산 서비스를 실행하거나 브라우저 공동 탐색을 선택해 주세요.'); setStatus('error'); } return; }
        finally { clearTimeout(timeout); }
        if (controller.signal.aborted || token !== generation.current) return;
        if (initial) { await exact(initial); return; }
      }
      const worker = new SolverWorker();
      workerRef.current = worker;
      worker.onmessage = (ev: MessageEvent<WorkerOutbound>) => {
        if (token !== generation.current || controller.signal.aborted) return;
        const msg = ev.data;
        if (msg.type === 'progress') setProgress(msg.progress);
        else if (msg.type === 'result') {
          worker.terminate();
          workerRef.current = null;
          if (input.options.strategy === 'staged-cpsat' && msg.result.diagnostics.preflight?.feasible !== false) {
            void exact(msg.result.candidates[0]?.placements).catch(fail);
            return;
          }
          setResult(msg.result);
          setStatus('done');
        } else if (msg.type === 'error') {
          setError(msg.message);
          setStatus('error');
        }
      };
      worker.onerror = (e) => {
        if (token !== generation.current || controller.signal.aborted) return;
        setError(e.message ?? 'Worker error');
        setStatus('error');
      };
      const seedInput = input.options.strategy === 'staged-cpsat'
        ? { ...input, options: { ...input.options, strategy: 'coordinated' as const, runMode: 'quick' as const } } : input;
      const inbound: WorkerInbound = { type: 'run', input: seedInput, initial };
      worker.postMessage(inbound);
    })().catch(fail);
  }, []);

  const cancel = useCallback(() => {
    generation.current++;
    exactRef.current?.abort();
    workerRef.current?.terminate();
    workerRef.current = null;
    setStatus('idle');
    setProgress(null);
  }, []);

  // 공강 진단 — 본 솔버와 별도 워커에서 빠른 채색 시도로 학년별 무충돌 가능성 측정
  const probe = useCallback((input: TimetableInput) => {
    probeRef.current?.terminate();
    const worker = new SolverWorker();
    probeRef.current = worker;
    setProbeStatus('running');
    setProbeReport(null);
    worker.onmessage = (ev: MessageEvent<WorkerOutbound>) => {
      const msg = ev.data;
      if (msg.type === 'probe-result') {
        setProbeReport(msg.report);
        setProbeStatus('done');
        worker.terminate();
        probeRef.current = null;
      } else if (msg.type === 'error') {
        setProbeStatus('error');
        worker.terminate();
        probeRef.current = null;
      }
    };
    worker.onerror = () => {
      setProbeStatus('error');
    };
    const inbound: WorkerInbound = { type: 'probe', input };
    worker.postMessage(inbound);
  }, []);

  return { status, progress, result, error, start, cancel, probe, probeStatus, probeReport };
}
