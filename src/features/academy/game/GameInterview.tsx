import { sourceStudent, isExperience } from './experienceService';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { InquiryWorkspace } from '@/features/inquiry-design/types';
import { FOUR_SENTENCES, STAR_F, linkedInterviewActivities, interviewRubric, type InterviewQuestion, type InterviewEvaluation } from '../../../../supabase/functions/_shared/academyInterview';
import { generateInterviewQuestion, evaluateInterviewAnswer } from '../interviewService';
import styles from './game.module.css';

export function GameInterview({ workspace, initialSourceId, readOnly }: { workspace: InquiryWorkspace; initialSourceId?: string; readOnly: boolean }) {
  const sources = workspace.kgEntities.filter(e => ['Interest', 'Thread', 'Activity'].includes(e.type ?? ''));
  const [sourceId, setSourceId] = useState(() => sources.some(e => e.entity_id === initialSourceId) ? initialSourceId! : sources[0]?.entity_id ?? '');
  const activities = useMemo(() => linkedInterviewActivities(sourceId, workspace.kgEntities, workspace.kgRelations), [sourceId, workspace.kgEntities, workspace.kgRelations]);
  const [activityIds, setActivityIds] = useState(() => linkedInterviewActivities(sourceId, workspace.kgEntities, workspace.kgRelations).slice(0, 12).map(a => a.entity_id));
  const [question, setQuestion] = useState<InterviewQuestion | null>(null);
  const [answer, setAnswer] = useState('');
  const [evaluatedAnswer, setEvaluatedAnswer] = useState('');
  const [aspiration, setAspiration] = useState('');
  const [evaluation, setEvaluation] = useState<InterviewEvaluation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const input = { studentId: sourceStudent(workspace.student?.id ?? '') ?? '', academyExperience: isExperience(workspace.student?.id), kgVersionId: workspace.kgVersion?.id ?? '', sourceId, activityIds, aspiration };
  const available = !readOnly && !busy && !!input.studentId && !!input.kgVersionId && !!activityIds.length;
  async function ask(evaluate = false) {
    if (!available || evaluate && (!question || answer.trim().length < 20)) return;
    const requestId = ++generation.current; setBusy(true); setError('');
    try {
      if (evaluate && question) {
        const snapshot = answer.trim();
        const result = await evaluateInterviewAnswer(input, question.question, snapshot);
        if (requestId !== generation.current) return;
        setEvaluation(result); setEvaluatedAnswer(snapshot);
      } else {
        const result = await generateInterviewQuestion(input);
        if (requestId !== generation.current) return;
        setQuestion(result); setAnswer(''); setEvaluation(null);
      }
    } catch (reason) { if (requestId === generation.current) setError(reason instanceof Error ? reason.message : '교수가 답변을 준비하지 못했어요.'); }
    finally { if (requestId === generation.current) setBusy(false); }
  }
  const reset = () => { setQuestion(null); setAnswer(''); setEvaluation(null); setError(''); };
  return <div className={styles.interviewChamber}>
    <aside><h3>교수에게 들려줄 별의 이야기</h3><label>어떤 기록에서 이야기를 시작할까요?<select aria-label="면담할 관심사·탐구 흐름·활동" value={sourceId} disabled={busy} onChange={e => { setSourceId(e.target.value); setActivityIds(linkedInterviewActivities(e.target.value, workspace.kgEntities, workspace.kgRelations).slice(0, 12).map(a => a.entity_id)); reset(); }}>{!sources.length && <option value="">아직 면담할 활동이 없어요</option>}{sources.map(source => <option key={source.entity_id} value={source.entity_id}>{source.label}</option>)}</select></label><div className={styles.evidenceChoices}>{activities.map(a => <label key={a.entity_id}><input type="checkbox" checked={activityIds.includes(a.entity_id)} disabled={busy || !activityIds.includes(a.entity_id) && activityIds.length >= 12} onChange={e => { setActivityIds(ids => e.target.checked ? [...ids, a.entity_id] : ids.filter(id => id !== a.entity_id)); reset(); }} />{a.label}</label>)}</div>{!activities.length && <p>연결된 활동이 없어요. 다른 별을 골라 주세요.</p>}<label>희망 전공·진로 (선택)<input aria-label="희망 전공·진로" value={aspiration} maxLength={200} disabled={busy} onChange={e => { setAspiration(e.target.value); reset(); }} /></label><button className={styles.goldButton} disabled={!available} onClick={() => void ask()}>{question ? '기록에서 다른 질문 받기' : '교수에게 내 기록 건네기'}</button><details><summary>내 생각을 잘 전달하는 방법</summary>{FOUR_SENTENCES.map(r => <p key={r.id}><strong>{r.label}</strong> · {r.guide}</p>)}<p>구체적인 경험을 묻는 대화에서는:</p>{STAR_F.map(r => <p key={r.id}><strong>{r.label}</strong> · {r.guide}</p>)}</details></aside>
    <section><div className={styles.professorSpeech}><span className={styles.kicker}>CASSIAN · TO RIA</span><p>{question?.question ?? '리아, 네가 탐구하며 남긴 기록을 읽어 보고 싶구나. 그 안의 선택과 생각에서 이야기를 시작해 보자.'}</p>{question && <small>{question.intent}</small>}</div>
      {question && <><label>리아의 답변<textarea aria-label="리아의 면담 답변" value={answer} onChange={e => setAnswer(e.target.value)} maxLength={6000} disabled={busy} placeholder="내가 생각한 결론과 이유, 실제 근거를 차근차근 들려주세요." /></label><button className={styles.goldButton} disabled={!available || answer.trim().length < 20} onClick={() => void ask(true)}>{evaluation ? '고친 답변에 대한 조언 듣기' : '교수에게 답변 들려주기'}</button><small>20~6,000자 · {answer.length}자</small></>}
      {busy && <p role="status">카시안이 리아의 기록을 읽고 생각하고 있어요…</p>}{error && <p className={styles.error} role="alert">{error}</p>}
      {evaluation && <section aria-label="교수의 답변 평가"><h3>{answer.trim() !== evaluatedAnswer ? '수정 전 답변에 대한 조언' : '카시안의 조언'}</h3><p>{evaluation.kind === 'experience' ? '구체적 경험이 담긴 답변이어서 4문장 뼈대와 STAR+F를 함께 살펴보았단다.' : '질문에 대한 생각과 근거를 4문장 뼈대에 비추어 살펴보았단다.'}</p><div className={styles.feedbackGrid}>{evaluation.criteria.map(row => <div key={row.id}><strong>{interviewRubric(evaluation.kind ?? 'general').find(r => r.id === row.id)?.label}</strong><small>{row.score} / 4</small><p>{row.evidence}</p><p>{row.feedback}</p></div>)}</div><p><strong>잘한 점</strong> · {evaluation.strength}</p><p><strong>다음에 보완할 점</strong> · {evaluation.improvement}</p><blockquote>{evaluation.followUp}</blockquote><button className={styles.mapButton} disabled={busy} onClick={() => { setQuestion({ question: evaluation.followUp, intent: '앞선 답변의 근거와 생각을 더 깊게 알아봅니다.' }); setAnswer(''); setEvaluation(null); }}>이어서 교수의 질문에 답하기</button><p className={styles.chatNote}>연습용 AI 조언이며 실제 입시 점수가 아닙니다.</p></section>}
    </section>
  </div>;
}
