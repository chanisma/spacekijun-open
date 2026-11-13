import { useRef, useState } from 'react';
import { assessmentNames, selfDimensions, selfItems, type AssessmentKind, type SelfAssessment as Assessment } from '../../../../supabase/functions/_shared/academyRoommate';
import { learningTypeProfile } from '../../../../supabase/functions/_shared/academyLearningType';
import { saveSelfAssessment } from './roommateService';
import css from './roommate.module.css';
import styles from './game.module.css';

export function SelfAssessment({ kind, readOnly, onSaved, onClose, onBusy }: { kind: AssessmentKind; readOnly: boolean; onSaved: (assessment: Assessment) => void; onClose: () => void; onBusy: (busy: boolean) => void }) {
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(crypto.randomUUID());
  const lock = useRef(false);
  const items = selfItems[kind], item = items[index];
  async function finish() {
    if (readOnly || lock.current || Object.keys(answers).length !== items.length) return;
    lock.current = true; setBusy(true); onBusy(true); setError('');
    try { const result = await saveSelfAssessment(kind, answers, request.current); onSaved(result); }
    catch (e) { setError(e instanceof Error ? e.message : '기록을 보관하지 못했어요.'); }
    finally { lock.current = false; setBusy(false); onBusy(false); }
  }
  return <section className={css.assessment} aria-label={assessmentNames[kind]}>
    <span className={styles.kicker}>SERIN'S LITTLE NOTEBOOK</span><h2>{assessmentNames[kind]}</h2>
    {!started ? <><p>“정답을 찾는 시간이 아니야. 요즘의 너에게 얼마나 가까운지 천천히 골라 줘.”</p><p>{kind === 'learning_type' ? '최근 한 달, 새로운 것을 배울 때 편했던 방식을 돌아보는 12문장이야. 주요 유형과 혼합 성향을 함께 살펴볼 거야. 검증된 심리검사가 아니라 지금의 선호를 알아보는 자기성찰이야. 과목이나 상황에 따라 달라져도 괜찮아.' : kind === 'big5' ? '최근 한 달의 평소 모습을 돌아보는 20문장이야. Big Five를 참고해 새로 만든 자기성찰용 문항이며, 검증된 심리검사나 진단은 아니야.' : '최근 2주의 공부 습관을 돌아보는 16문장이야. 타고난 학습유형이나 능력을 정하는 검사가 아니라, 지금 쓰는 방법과 시도해 볼 방법을 찾아보는 시간이야.'}</p><p>응답과 결과는 내 계정에 보관돼. 세린과 대화할 때 최근 결과를 참고할 수 있고, 관리자 학생 미리보기에서도 열람할 수 있어. 결과 기록은 언제든 지울 수 있어.</p><button className={styles.goldButton} disabled={readOnly} onClick={() => setStarted(true)}>알겠어, 나를 돌아볼게</button></> : <>
      <p className={css.progress}>{index + 1} / {items.length} · 답한 문장 {Object.keys(answers).length}개</p>
      <fieldset disabled={readOnly || busy} className={css.question} key={item.id}><legend>{item.text}</legend>
        {['전혀 그렇지 않다', '그렇지 않은 편이다', '중간이다', '그런 편이다', '매우 그렇다'].map((label, i) => <label key={label} data-selected={answers[item.id] === i + 1}><input type="radio" name={item.id} value={i + 1} checked={answers[item.id] === i + 1} onChange={() => { setAnswers(a => ({ ...a, [item.id]: i + 1 })); request.current = crypto.randomUUID(); }} /><span>{i + 1}</span>{label}</label>)}
      </fieldset>
      <div className={css.actions}><button className={styles.mapButton} disabled={busy || index === 0} onClick={() => setIndex(i => i - 1)}>이전 문장</button>{index < items.length - 1 ? <button className={styles.goldButton} disabled={busy || !answers[item.id]} onClick={() => setIndex(i => i + 1)}>다음 문장</button> : <button className={styles.goldButton} disabled={readOnly || busy || Object.keys(answers).length !== items.length} onClick={() => void finish()}>{busy ? '수첩에 보관하는 중…' : '나의 결과 펼치기'}</button>}</div>
    </>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <button className={styles.textButton} disabled={busy} onClick={onClose}>잠시 쉬기 · 세린에게 돌아가기</button>
  </section>;
}

export function AssessmentResult({ assessment }: { assessment: Assessment }) {
  const profile = assessment.kind === 'learning_type' ? learningTypeProfile(assessment.scores) : null;
  return <section className={css.result} aria-label="자기이해 검사 결과"><h2>{assessmentNames[assessment.kind]}</h2><p>{new Date(assessment.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}에 돌아본 나</p><p>“이건 네가 오늘 들려준 모습이야. 꼭 맞지 않는 부분이 있다면 그 느낌도 소중하게 생각해 줘.”</p><p>{assessment.kind === 'learning_type' ? '유형 이름은 지금 응답에서 나타난 선호를 표현한 별명이야. 능력이나 가장 효과적인 학습법을 정하는 결과는 아니야. 다른 방식도 경험하며 너에게 맞는 방법을 찾아봐.' : assessment.kind === 'big5' ? '어느 쪽도 더 좋은 성격은 아니야. 상황과 시기에 따라 다른 모습이 나올 수 있어.' : '이 점수는 최근 습관을 얼마나 자주 사용하는지에 대한 응답이야. 능력 점수나 고정된 학습유형은 아니야.'}</p>
    {profile && <article className={css.typeCard} aria-label="학습 유형 요약"><span aria-hidden="true" className={css.typeEmblem}>✦</span><small>지금 나의 주요 유형</small><h3>{profile.name}</h3>{profile.main.length > 0 && <p>{profile.main.join(' · ')}</p>}<p>함께 나타난 성향 · {profile.mixed.length ? profile.mixed.join(' · ') : '주요 유형 외에 뚜렷하게 기운 성향은 없어요.'}</p>{profile.balanced.length > 0 && <p>양쪽을 함께 살펴볼 축 · {profile.balanced.join(' · ')}</p>}<h4>이번 주 시도해 볼 학습 방법</h4><ul>{profile.methods.map(method => <li key={method}>{method}</li>)}</ul><p>편안했던 점과 자료 없이 설명할 수 있었던 점을 각각 적어 봐. 선호와 실제 이해를 함께 확인하는 거야.</p></article>}
    {selfDimensions[assessment.kind].map(d => <article key={d.id}><h3>{d.name} <small>{assessment.scores[d.id]?.toFixed(2)} / 5</small></h3><div className={css.scale} role="meter" aria-label={d.name} aria-valuemin={1} aria-valuemax={5} aria-valuenow={assessment.scores[d.id]}><span style={{ left: `${(assessment.scores[d.id] - 1) / 4 * 100}%` }}>✦</span></div><div className={css.poles}><span>{d.left}</span><span>{d.right}</span></div><p>{d.reflection}</p><small>작은 시도 · {d.practice}</small></article>)}
    <p>문항 응답을 방향에 맞춰 평균 낸 값이며, 다른 학생과 비교한 백분위가 아니에요. 모든 문항에 같은 답을 했다면 상황을 떠올리며 다시 살펴봐도 좋아요.</p>
  </section>;
}
