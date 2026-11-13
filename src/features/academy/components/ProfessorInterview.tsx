import { useEffect, useMemo, useRef, useState } from 'react';
import { GraduationCap, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { InquiryWorkspace } from '@/features/inquiry-design/types';
import { FOUR_SENTENCES, STAR_F, interviewRubric, linkedInterviewActivities, type InterviewEvaluation, type InterviewQuestion } from '../../../../supabase/functions/_shared/academyInterview';
import { evaluateInterviewAnswer, generateInterviewQuestion } from '../interviewService';
import styles from '../academy.module.css';

interface Props { workspace: InquiryWorkspace; open: boolean; onOpenChange: (open: boolean) => void; initialSourceId?: string; readOnly: boolean }

/** The parent keys by user/student/version. Draft answers stay in memory, never in shared browser storage. */
export function ProfessorInterview({ workspace, open, onOpenChange, initialSourceId, readOnly }: Props) {
  const sources = useMemo(() => workspace.kgEntities.filter(e => ['Interest', 'Thread', 'Activity'].includes(e.type ?? '')), [workspace.kgEntities]);
  const [sourceId, setSourceId] = useState(() => sources.some(s => s.entity_id === initialSourceId) ? initialSourceId! : sources[0]?.entity_id ?? '');
  const activities = useMemo(() => linkedInterviewActivities(sourceId, workspace.kgEntities, workspace.kgRelations), [sourceId, workspace.kgEntities, workspace.kgRelations]);
  const [activityIds, setActivityIds] = useState<string[]>(() => linkedInterviewActivities(sourceId, workspace.kgEntities, workspace.kgRelations).slice(0, 12).map(a => a.entity_id));
  const [aspiration, setAspiration] = useState('');
  const [question, setQuestion] = useState<InterviewQuestion | null>(null);
  const [answer, setAnswer] = useState('');
  const [submittedAnswer, setSubmittedAnswer] = useState('');
  const [evaluation, setEvaluation] = useState<InterviewEvaluation | null>(null);
  const [busy, setBusy] = useState<'question' | 'evaluate' | null>(null);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const wasOpen = useRef(false);
  // Use the graph selection on first opening; preserve an existing interview when reopening it.
  useEffect(() => {
    const justOpened = open && !wasOpen.current;
    wasOpen.current = open;
    if (!justOpened || question || busy || !initialSourceId || !sources.some(s => s.entity_id === initialSourceId)) return;
    setSourceId(initialSourceId);
    setActivityIds(linkedInterviewActivities(initialSourceId, workspace.kgEntities, workspace.kgRelations).slice(0, 12).map(a => a.entity_id));
  }, [open, initialSourceId, sources, workspace.kgEntities, workspace.kgRelations, question, busy]);
  useEffect(() => () => { requestId.current += 1; }, []);
  const reset = () => { setQuestion(null); setAnswer(''); setSubmittedAnswer(''); setEvaluation(null); setError(''); };
  const input = { studentId: workspace.student?.id ?? '', kgVersionId: workspace.kgVersion?.id ?? '', sourceId, activityIds, aspiration };
  const available = !readOnly && !!input.studentId && !!input.kgVersionId && activityIds.length > 0 && !busy;
  const generate = async () => {
    if (!available) return;
    const id = ++requestId.current;
    setBusy('question'); setError('');
    try {
      const result = await generateInterviewQuestion(input);
      if (requestId.current !== id) return;
      setQuestion(result); setAnswer(''); setSubmittedAnswer(''); setEvaluation(null);
      requestAnimationFrame(() => answerRef.current?.focus());
    } catch (e) { if (requestId.current === id) setError(e instanceof Error ? e.message : '질문을 준비하지 못했습니다.'); }
    finally { if (requestId.current === id) setBusy(null); }
  };
  const evaluate = async () => {
    if (!available || !question || answer.trim().length < 20) return;
    const id = ++requestId.current;
    const snapshot = answer.trim();
    setBusy('evaluate'); setError('');
    try {
      const result = await evaluateInterviewAnswer(input, question.question, snapshot);
      if (requestId.current !== id) return;
      setEvaluation(result); setSubmittedAnswer(snapshot);
    } catch (e) { if (requestId.current === id) setError(e instanceof Error ? e.message : '평가를 받지 못했습니다.'); }
    finally { if (requestId.current === id) setBusy(null); }
  };
  const rubric = interviewRubric(evaluation?.kind ?? 'general');
  const changed = !!evaluation && answer.trim() !== submittedAnswer;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-5xl bg-[#faf7f1]">
    <DialogHeader><DialogTitle className="flex items-center gap-2 text-[#513c60]"><GraduationCap size={23} /> 별의 연구시설 · 교수 면담</DialogTitle><DialogDescription>나의 실제 탐구 경험으로 대학 면접을 연습합니다. 답변과 평가는 이 화면을 떠나면 사라집니다.</DialogDescription></DialogHeader>
    <div className={styles.interview}>
      {readOnly && <p className={styles.note}>역할 미리보기에서는 AI 면담 요청을 할 수 없습니다.</p>}
      <div className={styles.interviewGrid}>
        <aside>
          <label htmlFor="interview-source">어떤 별의 이야기를 나눌까요?</label>
          <select id="interview-source" value={sourceId} disabled={!!busy} onChange={e => { setSourceId(e.target.value); setActivityIds(linkedInterviewActivities(e.target.value, workspace.kgEntities, workspace.kgRelations).slice(0, 12).map(a => a.entity_id)); reset(); }}>
            {!sources.length && <option value="">아직 선택할 별이 없습니다</option>}
            {(['Interest', 'Thread', 'Activity'] as const).map(type => <optgroup key={type} label={{ Interest: '관심사 · Interest', Thread: '탐구 흐름 · Thread', Activity: '활동 · Activity' }[type]}>{sources.filter(s => s.type === type).map(s => <option key={s.entity_id} value={s.entity_id}>{s.label}</option>)}</optgroup>)}
          </select>
          <p className={styles.muted}>질문의 근거가 될 연결 활동 · {activityIds.length}/12개 선택</p>
          <div className={styles.relatedActivities}>{activities.length ? activities.map(a => <label key={a.entity_id} className="flex items-start gap-2"><input type="checkbox" className="!mb-0 !mt-1 !w-auto" checked={activityIds.includes(a.entity_id)} disabled={!!busy || (!activityIds.includes(a.entity_id) && activityIds.length >= 12)} onChange={e => { setActivityIds(current => e.target.checked ? [...current, a.entity_id] : current.filter(id => id !== a.entity_id)); reset(); }} /><span>{a.label}</span></label>) : <p>이 별과 직접 연결된 활동이 없어요. 다른 관심사나 개별 활동을 골라 주세요.</p>}</div>
          <label htmlFor="interview-aspiration">희망 전공·진로 (선택)</label><input id="interview-aspiration" placeholder="예: 생명과학, 환경 문제 연구" value={aspiration} maxLength={200} disabled={!!busy} onChange={e => { setAspiration(e.target.value); reset(); }} />
          <button className={styles.primaryButton} disabled={!available} onClick={() => void generate()}>{busy === 'question' ? <Loader2 size={16} className="animate-spin" /> : <GraduationCap size={16} />}{busy === 'question' ? '교수가 질문을 준비하고 있어요…' : question ? '다른 질문 받기' : '교수에게 질문 받기'}</button>
          <details className="mt-5 text-xs leading-7" open={!question}><summary className="cursor-pointer font-semibold">답변의 뼈대 살펴보기</summary>{FOUR_SENTENCES.map(r => <p key={r.id}><strong>{r.id} {r.label}</strong> · {r.guide}</p>)}{<><p className="mt-3 font-semibold">경험은 STAR+F로 구체화하세요.</p>{STAR_F.map(r => <p key={r.id}><strong>{r.id} · {r.label}</strong> {r.guide}</p>)}</>}<p className={styles.muted}>정확히 네 문장일 필요는 없어요. 핵심은 답변의 내용과 흐름입니다.</p></details>
        </aside>
        <section>
          <div className={styles.professor}><p className={styles.eyebrow}>A CONVERSATION WITH YOUR PROFESSOR</p><p>{question?.question ?? '“그대의 별자리에 담긴 경험을 들려주겠어요? 왼쪽에서 이야기를 나눌 별과 활동을 골라 주세요.”'}</p>{question && <p className={styles.muted}>질문의 의도 · {question.intent}</p>}</div>
          {question && <div className="mt-5"><label htmlFor="interview-answer">나의 답변</label><textarea ref={answerRef} id="interview-answer" value={answer} disabled={!!busy} maxLength={6000} placeholder="결론 → 이유 → 나의 경험 → 전공·진로와의 연결 순서로 이야기해 보세요." onChange={e => setAnswer(e.target.value)} /><div className={styles.interviewFooter}><button className={styles.primaryButton} disabled={!available || answer.trim().length < 20} onClick={() => void evaluate()}>{busy === 'evaluate' && <Loader2 size={16} className="animate-spin" />}{busy === 'evaluate' ? '교수가 답변을 읽고 있어요…' : evaluation ? '수정한 답변 다시 평가받기' : '교수의 조언 받기'}</button><span className={styles.muted}>{answer.length}/6,000자 · 최소 20자</span></div></div>}
          {busy && <p role="status" className="mt-3 text-xs text-[#80668b]">면담을 준비하고 있습니다. 창을 닫아도 이 장소에 머무르면 결과를 다시 볼 수 있어요.</p>}
          {error && <p role="alert" className={styles.error}>{error}</p>}
          {evaluation && <section aria-label="교수의 답변 평가" aria-live="polite" className="mt-6"><h3 className="font-semibold">✦ {changed ? '수정 전 답변에 대한 조언' : '교수의 답변 조언'}</h3><p className={styles.muted}>연습용 AI 피드백 · 항목별 0~4단계 · 실제 입시 점수가 아닙니다.</p>{changed && <p className={styles.note}>답변이 바뀌었어요. 다시 평가받으면 수정한 내용에 대한 조언을 받을 수 있습니다.</p>}<div className={styles.rubric}>{evaluation.criteria.map(row => <div key={row.id}><span className={styles.score}>{row.score} / 4</span><strong>{row.id} · {rubric.find(r => r.id === row.id)?.label}</strong><p>답변 근거: {row.evidence}</p><p>{row.feedback}</p></div>)}</div><div className={styles.professor}><strong>잘한 점</strong><p>{evaluation.strength}</p><strong className="mt-4 block">다음 답변에서 보완할 점</strong><p>{evaluation.improvement}</p><strong className="mt-4 block">한 걸음 더 생각할 질문</strong><p>{evaluation.followUp}</p></div><button className={`${styles.primaryButton} mt-4`} disabled={!!busy || readOnly} onClick={() => { setQuestion({ question: evaluation.followUp, intent: '이전 답변의 근거와 성찰을 더 깊이 확인합니다.' }); setAnswer(''); setEvaluation(null); setSubmittedAnswer(''); requestAnimationFrame(() => answerRef.current?.focus()); }}>후속 질문에 답하기 →</button></section>}
        </section>
      </div>
    </div>
  </DialogContent></Dialog>;
}
