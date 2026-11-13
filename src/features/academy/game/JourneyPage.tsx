import { useState } from 'react';
import type { AcademyJourney } from '../../../../supabase/functions/_shared/academyJourney';
import type { InquiryActivityRecord } from '@/features/inquiry-design/types';
import { writeJourney } from './growthService';
import css from './journey.module.css';

/**
 * 리아의 연속 탐구 — 연구 수첩의 한 장 (2026-10-04 사용자 요청: «연구 수첩에서 · 어떤 단계에서도 삭제 · UI 를 더 잘 ·
 * 확정 탐구 연결은 없어도 됨»). ⚠️ 카시안의 «의뢰»가 아니다 — 리아가 도서관에서 찾은 자료로 품은 질문을 스스로 이어 가는 연구다
 * (같은 날 사용자 정정). 그래서 교수·의뢰라는 말을 쓰지 않는다. 저장소의 이름(academy_journeys·journey)은 그대로다.
 *
 * 흐름 = ① 질문 꺼내기(도서관에서 찾은 질문) → ② 실제로 해 보기(내 기록의 활동 하나를 잇는다) → ③ 발견 회고(40~4,000자).
 * 종전의 «나의 확정 탐구 연결» 단계는 뺐다 — 활동을 의뢰에 바로 잇는다(서버 `academy_journey_write`).
 * 모양: 도서관 책갈피가 꽂힌 질문 카드 + 별 세 개의 진행 궤적 + «지금 할 일» 카드. 지우기는 어느 단계에서나 맨 아래에.
 */
const STEPS = [
  { key: 'accept', title: '질문 꺼내기', hint: '도서관에서 찾은 질문' },
  { key: 'try', title: '실제로 해 보기', hint: '내 활동 하나와 잇기' },
  { key: 'reflect', title: '발견 회고', hint: '알게 된 것 정리' },
] as const;

function stepIndex(journey: AcademyJourney | null) {
  if (!journey) return 0;
  if (journey.stage === 'completed') return 3;
  if (journey.stage === 'observed') return 2;
  return 1; // seeking · planned(옛 흐름에서 탐구까지 연결해 둔 의뢰) — 둘 다 «활동을 잇는» 단계
}
const activityLabel = (a: InquiryActivityRecord) => [a.grade ? `${a.grade}학년` : '', a.subject_name || a.category || '활동'].filter(Boolean).join(' · ');
const dayLabel = (iso: string | null | undefined) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }) : ''; };

export function JourneyPage({ journey, activities, canStart, readOnly, onChanged }: {
  journey: AcademyJourney | null; activities: InquiryActivityRecord[]; canStart: boolean; readOnly: boolean; onChanged: () => Promise<unknown>;
}) {
  const [activityId, setActivityId] = useState(journey?.activity_id ?? '');
  const [changing, setChanging] = useState(false);
  const [reflection, setReflection] = useState(journey?.reflection ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const at = stepIndex(journey);
  const linked = journey?.activity_id ? activities.find(a => a.id === journey.activity_id) ?? null : null;
  const [question, reason] = (journey?.source_question ?? '').split(/\n궁금해진 이유:\s*/);
  const length = [...reflection.trim()].length;

  async function act(action: 'start' | 'observe' | 'complete' | 'abandon', extra: { activityId?: string; reflection?: string } = {}, ok?: string) {
    if (busy || readOnly) return;
    setBusy(true); setMessage(null);
    try {
      await writeJourney(action, journey?.revision ?? 0, extra);
      await onChanged();
      setChanging(false); setConfirmDelete(false);
      if (action === 'abandon') { setActivityId(''); setReflection(''); }
      if (ok) setMessage({ tone: 'ok', text: ok });
    } catch (e) { setMessage({ tone: 'error', text: e instanceof Error ? e.message : '연속 탐구를 보관하지 못했어요. 다시 시도해 주세요.' }); }
    finally { setBusy(false); }
  }

  return <article className={css.page} aria-label="리아의 연속 탐구">
    <span className={css.kicker}>RIA'S CONTINUING INQUIRY{journey ? ` · ${dayLabel(journey.created_at)} 시작` : ''}</span>
    <h3 className={css.title}>질문이 별이 되는 여정</h3>

    {/* 도서관에서 찾은 질문 — 책갈피가 꽂힌 카드 한 장 */}
    <section className={css.letter} aria-label="도서관에서 찾은 나의 질문">
      <span className={css.seal} aria-hidden="true">❦</span>
      <p className={css.letterFrom}>도서관에서 찾은 나의 질문</p>
      {journey ? <>
        <blockquote>{question}</blockquote>
        {reason && <p className={css.reason}><em>궁금해진 이유</em>{reason}</p>}
      </> : <p className={css.letterBody}>도서관에서 자료를 읽으며 품은 질문을, 실제로 해 본 일과 이어 가 보세요. 해 보고 나서 알게 된 것을 적으면 그 질문은 하늘의 별이 돼요.</p>}
    </section>

    {/* 진행 궤적 — 별 세 개 */}
    <ol className={css.track} aria-label="연속 탐구 진행">
      {STEPS.map((step, i) => {
        const state = i < at ? 'done' : i === at ? 'current' : 'todo'; // at: 0 = 시작 전 · 1 = 시작함 · 2 = 활동 이음 · 3 = 마침
        return <li key={step.key} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
          <span className={css.star} aria-hidden="true">{state === 'done' ? '✦' : i + 1}</span>
          <strong>{step.title}</strong><small>{step.hint}</small>
        </li>;
      })}
    </ol>

    {/* 지금 할 일 */}
    <section className={css.task} data-stage={journey?.stage ?? 'none'}>
      {!journey && <>
        <h4>연속 탐구 시작하기</h4>
        {canStart ? <p>시작하면 도서관에서 기록한 질문과 궁금해진 이유가 이 수첩에 옮겨 적혀요.</p> : <p>제2장(도서관 이야기)에서 나의 질문을 기록하면 시작할 수 있어요.</p>}
        <button className={css.primary} disabled={readOnly || busy || !canStart} onClick={() => void act('start', {}, '연속 탐구를 시작했어요. 이 질문과 이어지는 활동을 해 보고 연결해 주세요.')}>이 질문으로 연속 탐구 시작하기</button>
      </>}

      {journey && at === 1 && <>
        <h4>실제로 해 본 활동을 이어 주세요</h4>
        <p>이 질문을 품고 직접 해 본 수업 활동·체험·탐구 하나를 골라요. «무엇을 실제로 했는지»가 회고의 출발점이에요.</p>
        <ActivityPicker activities={activities} value={activityId} onChange={setActivityId} disabled={readOnly || busy} />
        <button className={css.primary} disabled={readOnly || busy || !activityId} onClick={() => void act('observe', { activityId }, '활동을 이었어요. 이제 무엇을 알게 되었는지 적어 보세요.')}>이 활동으로 이어 가기</button>
      </>}

      {journey && at === 2 && <>
        <h4>무엇을 알게 되었나요?</h4>
        <ActivityCard activity={linked} />
        {changing ? <div className={css.change}>
          <ActivityPicker activities={activities} value={activityId} onChange={setActivityId} disabled={readOnly || busy} />
          <div className={css.row}><button className={css.secondary} disabled={readOnly || busy || !activityId || activityId === journey.activity_id} onClick={() => void act('observe', { activityId }, '다른 활동으로 바꿨어요.')}>이 활동으로 바꾸기</button><button className={css.text} onClick={() => setChanging(false)}>그만두기</button></div>
        </div> : !readOnly && <button className={css.text} onClick={() => { setActivityId(journey.activity_id ?? ''); setChanging(true); }}>다른 활동으로 바꾸기</button>}
        <label className={css.field}>발견한 내용과 나의 생각
          <textarea value={reflection} maxLength={4000} disabled={readOnly || busy} onChange={e => setReflection(e.target.value)}
            placeholder="무엇을 직접 해 보았나요? 예상과 달랐던 점, 도움이 된 방법, 나에 대해 알게 된 점을 들려주세요." />
          <small data-ok={length >= 40 || undefined}>{length} / 40자 이상</small>
        </label>
        <button className={css.primary} disabled={readOnly || busy || length < 40} onClick={() => void act('complete', { reflection })}>회고 남기기</button>
      </>}

      {journey && at === 3 && <div className={css.done}>
        <span className={css.reward} aria-hidden="true">✦</span>
        <h4>회고의 별을 밝혔어요</h4>
        <small>{dayLabel(journey.completed_at)}</small>
        <ActivityCard activity={linked} />
        <blockquote>{journey.reflection}</blockquote>
      </div>}
    </section>

    {message && <p className={css.message} data-tone={message.tone} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</p>}

    {journey && !readOnly && <footer className={css.footer}>
      {confirmDelete ? <div className={css.confirm} role="group" aria-label="연속 탐구 지우기 확인">
        <p>이 연속 탐구를 지울까요? 이어 둔 활동과 회고가 사라지고{journey.stage === 'completed' ? ', 밝힌 회고의 별도 꺼져요' : ''}. 언제든 다시 시작할 수 있어요.</p>
        <div className={css.row}><button className={css.danger} disabled={busy} onClick={() => void act('abandon', {}, '연속 탐구를 지웠어요. 준비되면 다시 시작할 수 있어요.')}>연속 탐구 지우기</button><button className={css.text} disabled={busy} onClick={() => setConfirmDelete(false)}>남겨 두기</button></div>
      </div> : <button className={css.text} onClick={() => setConfirmDelete(true)}>이 연속 탐구 지우기</button>}
    </footer>}
  </article>;
}

function ActivityPicker({ activities, value, onChange, disabled }: { activities: InquiryActivityRecord[]; value: string; onChange: (id: string) => void; disabled: boolean }) {
  if (!activities.length) return <p className={css.empty}>아직 불러올 수 있는 활동 기록이 없어요. 생활기록부 활동이 올라오면 여기서 고를 수 있어요.</p>;
  return <ul className={css.picker} role="radiogroup" aria-label="이을 활동">
    {activities.map(a => <li key={a.id}><label data-checked={value === a.id || undefined}>
      <input type="radio" name="journey-activity" value={a.id} checked={value === a.id} disabled={disabled} onChange={() => onChange(a.id)} />
      <span><strong>{activityLabel(a)}</strong><small>{a.content?.slice(0, 120) ?? ''}{(a.content?.length ?? 0) > 120 ? '…' : ''}</small></span>
    </label></li>)}
  </ul>;
}
function ActivityCard({ activity }: { activity: InquiryActivityRecord | null }) {
  if (!activity) return <p className={css.empty}>이어 둔 활동 기록을 찾지 못했어요(기록이 바뀌었을 수 있어요).</p>;
  return <div className={css.activity}><span>이어 둔 활동</span><strong>{activityLabel(activity)}</strong><p>{activity.content}</p></div>;
}
