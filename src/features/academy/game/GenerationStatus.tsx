import { useEffect, useState } from 'react';
import { retryGeneration, type GenerationJob } from './generationService';
import styles from './game.module.css';
import { readStoredJson, writeStoredJson } from '@/lib/safeLocalStorage';

/**
 * 설계 의뢰 현황 = 연구대 오른쪽 아래의 **포스트잇** (2026-09-14 한 줄 요약 → 2026-10-03 쪽지).
 * 상세 단계는 하단 대기 화면(`ResearchProgress`)이 맡고, 쪽지는 «무엇이 어디까지 왔나»와 다음 동작 하나만 말한다.
 */
const STAGE_LABEL: Record<GenerationJob['stage'], string> = { design: '교수가 설계 작성', graph: '별자리에 연결', save: '수첩에 보관' };

function useElapsed(startedAt: number, live: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [live]);
  const s = Math.max(0, Math.floor((now - startedAt) / 1000));
  return `${Math.floor(s / 60)}분 ${s % 60}초`;
}

/**
 * 포스트잇 한 장 (2026-10-03 사용자 요청 — «누군가가 포스트잇에 의뢰 결과물이 도착했다고 붙여 놓은 것처럼, 확인하고 뗄 수도 있게»).
 * 진행 중 = 노란 쪽지에 카시안의 메모(단계·경과), 완성 = «설계도가 도착했어요» + 펼치기 + 떼기, 멈춤 = 분홍 쪽지 + 다시 시도.
 * 떼면 이 사람 화면에서만 사라진다(로컬 기억) — 설계도는 연구 수첩에 그대로 있다.
 */
export function GenerationStatus({ job, opened = false, onRefresh, onOpen, onClose, onPeel, index = 0 }: { job: GenerationJob; opened?: boolean; onRefresh: () => Promise<unknown>; onOpen: (job: GenerationJob) => void; onClose?: () => void; onPeel?: (job: GenerationJob) => void; index?: number }) {
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [peeling, setPeeling] = useState(false);
  const live = job.status === 'queued' || job.status === 'running' || job.status === 'retry';
  const elapsed = useElapsed(Date.parse(job.created_at), live);
  const title = job.design?.title || `${job.input.target.name} · 새 별의 설계 의뢰`;
  const state = job.status === 'failed' ? '잠시 멈췄어요' : job.status === 'retry' ? '다시 준비하는 중' : '쓰는 중';
  const done = job.status === 'completed';
  return <article className={styles.postit} data-status={job.status} data-peeling={peeling || undefined} data-tilt={index % 3} aria-label="교수에게 맡긴 설계 의뢰"
    onAnimationEnd={e => { if (peeling && e.target === e.currentTarget) onPeel?.(job); }}>
    <span className={styles.postitTape} aria-hidden="true" />
    <span className={styles.postitFrom}>{done ? '카시안 교수 → 리아' : job.status === 'failed' ? '카시안 교수의 쪽지' : '카시안 교수 · 작업 중'}</span>
    <strong className={styles.postitHead}>{done ? '설계도가 도착했어요!' : job.status === 'failed' ? '조금 막혔어요' : `${STAGE_LABEL[job.stage]} ${state}…`}</strong>
    <p className={styles.postitTitle} title={title}>«{title}»</p>
    {live && <small className={styles.postitMeta}>{elapsed} 지났어요 · 화면을 닫아도 계속 써요</small>}
    {done && <small className={styles.postitMeta}>떼어도 설계도는 연구 수첩에 남아요</small>}
    <div className={styles.postitActions}>
      {done && (opened
        ? <button type="button" className={styles.postitButton} onClick={onClose}>설계도 접기</button>
        : <button type="button" className={styles.postitButton} onClick={() => onOpen(job)}>설계도 펼치기</button>)}
      {job.status === 'failed' && <button type="button" className={styles.postitButton} disabled={retrying} onClick={async () => { setRetrying(true); setError(''); try { await retryGeneration(job.id); await onRefresh(); } catch (e) { setError(e instanceof Error ? e.message : '다시 시도하지 못했어요.'); } finally { setRetrying(false); } }}>멈춘 단계부터 다시 시도</button>}
      {(done || job.status === 'failed') && onPeel && <button type="button" className={styles.postitPeel} onClick={() => setPeeling(true)}>✓ 확인하고 떼기</button>}
    </div>
    {error && <p role="alert" className={styles.postitError}>{error}</p>}
  </article>;
}

const PEELED_KEY = 'academy-generation-peeled:v1';
const isIdList = (value: unknown): value is string[] => Array.isArray(value) && value.every(v => typeof v === 'string');
/**
 * 연구대 오른쪽 아래의 **포스트잇 묶음** (2026-10-03 — 종전엔 접히는 상자 하나에 한 줄씩이었다).
 * 세 장까지 겹쳐 붙이고 나머지는 «N장 더» 로 접는다. 뗀 쪽지는 이 브라우저에 기억한다(최근 60장 — 서버 상태가 아니라
 * 보기 편의라 `localStorage` 가 맞다). 보일 것이 없으면 아무것도 그리지 않는다.
 * `openedDraftId` 가 어느 의뢰의 설계도가 지금 펼쳐져 있는지 알려 주고, 그 쪽지의 동작은 "접기" 가 된다.
 */
export function GenerationBrief({ jobs, error, openedDraftId = null, onRetryRead, onRefresh, onOpen, onClose }: { jobs: GenerationJob[]; error: boolean; openedDraftId?: string | null; onRetryRead: () => void; onRefresh: () => Promise<unknown>; onOpen: (job: GenerationJob) => void; onClose: () => void }) {
  const [peeled, setPeeled] = useState<string[]>(() => readStoredJson(PEELED_KEY, [], isIdList));
  const [expanded, setExpanded] = useState(false);
  const visible = jobs.filter(j => !peeled.includes(j.id));
  if (!visible.length && !error) return null;
  const peel = (job: GenerationJob) => {
    const next = [job.id, ...peeled.filter(id => id !== job.id)].slice(0, 60);
    setPeeled(next); writeStoredJson(PEELED_KEY, next);
    if (openedDraftId && job.draft_id === openedDraftId) onClose();
  };
  const shown = expanded ? visible : visible.slice(0, 3);
  return <div className={styles.postits} aria-label="설계 의뢰 현황">
    {error && <p role="alert" className={styles.postitError}>의뢰 상태를 확인하지 못했어요. 서버에 접수된 작업은 계속 진행됩니다. <button type="button" className={styles.postitButton} onClick={onRetryRead}>다시 확인하기</button></p>}
    {shown.map((job, i) => <GenerationStatus key={job.id} job={job} index={i} opened={!!openedDraftId && job.draft_id === openedDraftId} onRefresh={onRefresh} onOpen={onOpen} onClose={onClose} onPeel={peel} />)}
    {visible.length > 3 && <button type="button" className={styles.postitMore} aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>{expanded ? '쪽지 겹쳐 두기' : `쪽지 ${visible.length - 3}장 더 보기`}</button>}
  </div>;
}
