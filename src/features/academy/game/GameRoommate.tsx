import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CharacterPanel } from './CharacterPanel';
import { SelfAssessment, AssessmentResult } from './SelfAssessment';
import { continueRoommate, deleteSelfAssessment, fetchRoommate } from './roommateService';
import { assessmentNames, assessmentDescriptions, selfDimensions, periodIntents, type AssessmentKind, type SelfAssessment as Assessment } from '../../../../supabase/functions/_shared/academyRoommate';
import { learningTypeProfile } from '../../../../supabase/functions/_shared/academyLearningType';
import css from './roommate.module.css';
import styles from './game.module.css';

export function GameRoommate({ userId, studentId, readOnly, reduced, onClose }: { userId: string; studentId: string | null; readOnly: boolean; reduced: boolean; onClose: () => void }) {
  const cache = useQueryClient();
  const key = ['academy-roommate', userId, readOnly, studentId];
  const query = useQuery({ queryKey: key, queryFn: () => fetchRoommate(readOnly ? studentId : null), refetchInterval: q => q.state.data?.conversations.some(c => c.status === 'generating') ? 1500 : 30000, retry: 1 });
  const [mode, setMode] = useState<'home' | 'assessment' | 'result' | 'daily'>('home');
  const [kind, setKind] = useState<AssessmentKind>('big5');
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Assessment | null>(null);
  const [pastDay, setPastDay] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [remove, setRemove] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const lock = useRef(false), alive = useRef(true), end = useRef<HTMLDivElement>(null);
  const data = query.data, day = pastDay || data?.day || '';
  const record = data?.conversations.find(c => c.day === day);
  const message = drafts[day] ?? '';
  const inFlight = record?.status === 'generating' && !!record.lease_until && new Date(record.lease_until).getTime() > clock;
  const isPast = !!data && day !== data.day;
  useEffect(() => { alive.current = true; const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => { alive.current = false; window.clearInterval(timer); }; }, []);
  useEffect(() => { if (mode === 'daily') end.current?.scrollIntoView({ block: 'nearest' }); }, [record?.turns.length, mode, busy]);
  async function refresh() { await cache.invalidateQueries({ queryKey: key }); await cache.invalidateQueries({ queryKey: ['academy-growth', userId] }); }
  async function send() {
    if (readOnly || lock.current || inFlight || isPast || !data || query.isError) return;
    const text = record?.status === 'ready' ? message.trim() : null;
    if (record?.question && record.status === 'ready' && !text) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const next = await continueRoommate(day, record?.revision ?? 0, text);
      await refresh();
      if (!alive.current) return;
      if ((text && next.turns.slice(record?.turns.length ?? 0).some(t => t.role === 'user' && t.content === text)) || (!text && record?.pending_message === message && next.status === 'ready')) setDrafts(d => ({ ...d, [day]: '' }));
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : '잠시 후 다시 말 걸어 줘.'); await refresh(); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  function home() { if (!lock.current) { setMode('home'); setError(''); setRemove(false); } }
  return <CharacterPanel npc="serin" title="세린과 나를 알아가는 시간" reduced={reduced} className={styles.chatPanel} onClose={() => { if (!lock.current) onClose(); }}>
    {mode !== 'home' && <button className={styles.textButton} disabled={busy} onClick={home}>← 세린의 이야기로</button>}
    {readOnly && <p className={styles.preview}>학생 시점 열람 · 검사 응답과 AI 대화는 학생 본인만 할 수 있어요.</p>}
    {query.isPending ? <p role="status">세린이 수첩을 꺼내고 있어요…</p> : query.isError ? <p role="alert">{query.error.message} <button onClick={() => void query.refetch()}>다시 펼치기</button></p> : data && <>
      {mode === 'home' && <><span className={styles.kicker}>SERIN · 이야기를 듣는 룸메이트 선배</span><h2>오늘은 어떤 마음이세요?</h2><p>“리아, 오늘은 어떻게 지내셨어요? 어떤 마음이든 편하게 들려주세요. 천천히 듣고 싶어요.”</p><div className={css.menu}>
        <button onClick={() => { setMode('daily'); setPastDay(''); }}>{data.conversations.some(c => c.day === data.day) ? '오늘 나눈 마음 이야기 이어가기' : '오늘의 마음 이야기'}<small>{periodIntents[data.period]} · 한국 시간 기준 하루 한 질문</small></button>
        {attempt > 0 && <button onClick={() => setMode('assessment')}>작성 중인 문장 이어서 보기</button>}
        {(['big5', 'learning_type', 'learning'] as const).map(k => <button key={k} onClick={() => { setKind(k); setAttempt(a => a + 1); setMode('assessment'); }}>{assessmentNames[k]}<small>{assessmentDescriptions[k]}</small></button>)}
      </div><section className={css.history}><h3>나를 알아간 수첩</h3>{!data.assessments.length && <p>아직 검사 기록이 없어요. 원하실 때 시작해도 괜찮아요.</p>}{data.assessments.map(a => <button className={styles.mapButton} key={a.id} onClick={() => { setResult(a); setMode('result'); }}>{new Date(a.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })} · {assessmentNames[a.kind]}</button>)}</section></>}
      {attempt > 0 && <div hidden={mode !== 'assessment'}><SelfAssessment key={`${kind}:${attempt}`} kind={kind} readOnly={readOnly} onClose={home} onBusy={value => { lock.current = value; setBusy(value); }} onSaved={a => { setResult(a); setMode('result'); setAttempt(0); void refresh(); }} /></div>}
      {mode === 'result' && result && <><AssessmentResult assessment={result} /><button className={styles.goldButton} onClick={() => { setMode('daily'); setPastDay(''); if (result.kind === 'learning_type' && !drafts[data.day]) { const p = learningTypeProfile(result.scores); setDrafts(d => ({ ...d, [data.day]: `나의 학습 유형 결과는 ${p.name}이야. 주요 성향: ${p.main.join(', ') || '양쪽 균형'}. 함께 나타난 성향: ${p.mixed.join(', ') || '없음'}. 축별 응답: ${selfDimensions.learning_type.map(axis => `${axis.name} ${result.scores[axis.id]}/5`).join(', ')}. 이 결과를 내 경험과 함께 생각해 보고 싶어.` })); } }}>{result.kind === 'learning_type' ? '이 학습 유형을 세린과 이야기하기' : '세린에게 지금의 마음 들려주기'}</button><button className={styles.textButton} disabled={readOnly || busy} onClick={() => setRemove(true)}>이 검사 기록 지우기</button>{remove && <div><p>이 검사 응답과 결과를 지울까요? 이미 나눈 대화 내용은 남아 있어요.</p><button className={styles.mapButton} disabled={busy || readOnly} onClick={async () => { if (lock.current || readOnly) return; lock.current = true; setBusy(true); try { await deleteSelfAssessment(result.id); await refresh(); setResult(null); setMode('home'); setRemove(false); } catch (e) { setError((e as Error).message); } finally { lock.current = false; setBusy(false); } }}>확인하고 기록 지우기</button><button className={styles.textButton} disabled={busy} onClick={() => setRemove(false)}>남겨 두기</button></div>}</>}
      {mode === 'daily' && <><h2>세린과 마음 나누기</h2><label>함께한 날<select aria-label="세린과 대화한 날짜" disabled={busy || !!inFlight} value={pastDay} onChange={e => { setPastDay(e.target.value); setError(''); }}><option value="">오늘 · {data.day}</option>{data.conversations.filter(c => c.day !== data.day).map(c => <option key={c.day} value={c.day}>{c.day}</option>)}</select></label><p className={css.period}>{periodIntents[record?.period ?? data.period]}부터 시작한 이야기</p>
        <div className={styles.chatLog} role="log" aria-label="세린과 마음 대화 기록" aria-live="polite">{!record && <p>“차 한 잔 내려 드릴게요. 이야기하고 싶으실 때 불러 주세요.”</p>}{record?.turns.map((t, i) => <div key={i} className={styles.chatBubble} data-speaker={t.role} data-kind={t.kind}><small>{t.role === 'user' ? '리아' : '세린'}{t.kind === 'question' ? ' · 오늘의 질문' : ''}</small><p>{t.content}</p></div>)}{(busy || inFlight) && <p role="status">“천천히 계셔도 괜찮아요. 건넬 말을 생각하고 있어요.”</p>}<div ref={end} /></div>
        {!isPast && (!record?.question ? <button className={styles.goldButton} disabled={readOnly || busy || !!inFlight} onClick={() => void send()}>{record ? '세린의 말 이어서 듣기' : '세린, 이야기해 줘'}</button> : <form onSubmit={e => { e.preventDefault(); void send(); }}><label htmlFor="serin-answer">세린에게 들려줄 마음</label><textarea id="serin-answer" rows={3} maxLength={2000} value={record.pending_message ?? message} disabled={readOnly || busy || !!inFlight || record.status !== 'ready'} onChange={e => setDrafts(d => ({ ...d, [day]: e.target.value }))} placeholder="짧은 한마디도 괜찮아요. 검사 결과에 대한 느낌을 말해도 좋아요." /><button className={styles.goldButton} disabled={readOnly || busy || !!inFlight || (record.status === 'ready' && !message.trim())}>{record.status === 'ready' ? '내 마음 들려주기' : '멈춘 이야기 이어가기'}</button></form>)}
        <p className={styles.chatNote}>말을 걸 때 AI가 질문을 만들어요. 한국 시간 자정마다 새 하루가 시작되며, 질문·답변·기다리는 대화가 계정에 저장돼요. 세린은 룸메이트 선배 역할의 AI이며 전문 상담을 대신하지 않아요.</p>
      </>}
    </>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </CharacterPanel>;
}
