import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import styles from './game.module.css';

const db = supabase as unknown as SupabaseClient;

/** 다시 시작할 수 있는 자리 — 서버 `academy_private.admin_story_reset` 의 순서와 같아야 한다. */
export const STORY_RESET_POINTS = [
  { id: 'prologue', label: '프롤로그부터 (튜토리얼 포함 전부)' },
  { id: 'first_star', label: '제1장 «첫 번째 별»부터 (튜토리얼 포함)' },
  { id: 'library_questions', label: '제2장 도서관 이야기부터' },
  { id: 'dorm_first_plan', label: '제3장 기숙사 이야기부터' },
  { id: 'post_first_letter', label: '제4장 우편국 이야기부터 (막간 포함)' },
  { id: 'sky_first_light', label: '제5장 창가의 하늘부터' },
  { id: 'library_reading', label: '제6장 «설명할 수 있을 때까지»만' },
] as const;
export type StoryResetPoint = typeof STORY_RESET_POINTS[number]['id'];

/**
 * 관리자 전용 «이야기 다시 실행» (2026-10-04 사용자 요청 — 테스트를 위해 진행된 스토리를 튜토리얼까지 다시 실행).
 *
 * 프롤로그·제1장 «다시 보기»는 서버에 쓰지 않는 흉내라 실제 흐름(책갈피·완료·다음 장 열림)을 다시 밟을 수 없다.
 * 이 단추는 **내 계정의** 진행 기록을 고른 장부터 끝까지 지운다 — 그러면 그 장부터 처음처럼 다시 열린다.
 * 보상 코인·내가 만든 계획·설계는 남는다(서버 마이그레이션 20261004150000 주석). 되돌릴 수 없으므로 한 번 더 묻는다.
 */
export function AdminStoryReset({ onDone }: { onDone: (from: StoryResetPoint) => void }) {
  const [from, setFrom] = useState<StoryResetPoint>('first_star');
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const label = STORY_RESET_POINTS.find(p => p.id === from)?.label ?? '';
  async function run() {
    setBusy(true); setMessage(null);
    const { data, error } = await db.rpc('academy_admin_story_reset', { p_from: from });
    setBusy(false); setAsking(false);
    if (error) { setMessage({ tone: 'error', text: error.message || '이야기를 다시 실행하지 못했어요.' }); return; }
    const n = (data as { chapters?: number })?.chapters ?? 0;
    setMessage({ tone: 'ok', text: `${label.split(' (')[0]} 다시 시작해요 · 장 기록 ${n}개를 지웠어요.` });
    onDone(from);
  }
  return <div className={styles.menuGroup} aria-label="이야기 다시 실행 (테스트)">
    <span className={styles.menuGroupTitle}>이야기 다시 실행 · 테스트</span>
    <select className={styles.storyResetSelect} value={from} disabled={busy} aria-label="다시 시작할 장" onChange={e => { setFrom(e.target.value as StoryResetPoint); setAsking(false); }}>
      {STORY_RESET_POINTS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
    </select>
    {asking
      ? <p className={styles.hint}>내 계정에서 «{label.split(' (')[0]}» 이후의 진행 기록을 지우고 처음처럼 다시 열어요. 보상 코인과 내가 만든 계획·설계는 남아요.
          <span className={styles.storyResetActions}><button className={styles.chapterRow} disabled={busy} onClick={() => void run()}>{busy ? '지우는 중…' : '다시 실행하기'}</button><button className={styles.textButton} disabled={busy} onClick={() => setAsking(false)}>그만두기</button></span></p>
      : <button className={styles.chapterRow} onClick={() => setAsking(true)}>이 장부터 다시 실행하기</button>}
    {message && <p className={styles.hint} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</p>}
  </div>;
}
