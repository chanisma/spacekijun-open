import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Coins, Stamp } from 'lucide-react';
import { ScenePanel } from './GameSurface';
import { STUDY_DAILY_CAP, STUDY_REWARD, claimStudy, fetchStudy, studyClaimable } from './studyService';
import css from './study.module.css';

const dateLabel = (day: string) => new Date(`${day}T00:00:00+09:00`).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' });
const shiftDay = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const attendanceLabels = { attended: '참석', excused: '사유 결석', supplement: '보충 대상', pending: '출석 미확인' };

export function GameStudyLedger({ userId, studentId, readOnly, onClose }: { userId: string; studentId: string | null; readOnly: boolean; onClose: () => void }) {
  const [week, setWeek] = useState<string | null>(null), [busy, setBusy] = useState(false), [feedback, setFeedback] = useState(''), [error, setError] = useState('');
  const lock = useRef(false), cache = useQueryClient();
  const key = ['academy-study', userId, readOnly, studentId, week];
  const query = useQuery({ queryKey: key, queryFn: () => fetchStudy(week, readOnly ? studentId : null), retry: 1, refetchInterval: 30000 });
  const state = query.data;
  const attended = state?.entries.filter(e => e.eligible) ?? [];
  // 받을 수 있는 것 = 서버 규칙(지난주까지 · 하루 최대 2회 = 10코인)으로 센다 — studyClaimable
  const rule = state ? studyClaimable(state) : null;
  const pending = rule?.claimable.size ?? 0;
  const unclaimedAttended = attended.filter(e => !e.claimed).length;
  const minutes = attended.reduce((sum, e) => sum + (e.minutes ?? 0), 0);
  const unknownTime = attended.filter(e => e.minutes === null).length;
  async function claim() {
    if (!state || readOnly || lock.current || !pending) return;
    lock.current = true; setBusy(true); setError(''); setFeedback('');
    try {
      const result = await claimStudy(state.week);
      setFeedback(result.reward ? `엘리안이 참석 ${result.count}회의 인장을 찍었습니다. ${result.reward}코인을 받았어요.` : '이 주의 보상은 모두 받았어요.');
    } catch (e) { setError((e as Error).message); }
    finally {
      await Promise.all([cache.invalidateQueries({ queryKey: ['academy-study', userId] }), cache.invalidateQueries({ queryKey: ['academy-dormitory', userId] })]);
      lock.current = false; setBusy(false);
    }
  }
  function turn(next: string) { setWeek(next); setFeedback(''); setError(''); }
  return <ScenePanel title="왕립 도서관 자습 기록장" backLabel="← 왕립 도서관으로" onClose={onClose} className={css.scene}>
    <div className={css.ledger}>
      <aside className={css.index}>
        <BookOpen size={30} aria-hidden="true" /><small>ROYAL LIBRARY · STUDY LOG</small><h2>쌓여 가는 시간</h2>
        <p>“리아가 꾸준히 남긴 시간을 함께 펼쳐 보죠.”<br /><span>— 사서 엘리안</span></p>
        {state && <>
          <label>기록을 펼칠 주<select aria-label="기록을 펼칠 주" value={state.week} disabled={busy} onChange={e => turn(e.target.value)}>
            {Array.from({ length: Math.round((Date.parse(state.latest_week) - Date.parse(state.first_week)) / 604800000) + 1 }, (_, i) => shiftDay(state.latest_week, -i * 7)).map(w => <option key={w} value={w}>{dateLabel(w)} ~ {dateLabel(shiftDay(w, 6))}</option>)}
          </select></label>
          <nav aria-label="자습 기록 주 이동"><button disabled={busy || state.week <= state.first_week} onClick={() => turn(shiftDay(state.week, -7))}>← 이전 주</button><button disabled={busy || state.week >= state.latest_week} onClick={() => turn(shiftDay(state.week, 7))}>다음 주 →</button></nav>
          <p className={css.wallet}><Coins size={18} aria-hidden="true" /> 보유 {state.coins}코인</p>
        </>}
        <small>2026년 9월 7일부터 기록합니다.<br />참석 1회마다 {STUDY_REWARD}코인(하루 최대 {STUDY_DAILY_CAP * STUDY_REWARD}코인) — 10월 9일부터는 출석이 확인되면 저절로 들어와요.<br />인장 버튼은 빠진 보상을 받는 곳이에요(지난주 기록까지).</small>
        {readOnly && <p className={css.preview}>학생 시점 미리보기 · 보상은 학생 본인만 받을 수 있어요.</p>}
      </aside>
      <article className={css.page} aria-label="주별 자습 참여 이력" tabIndex={0}>
        {query.isPending ? <p role="status">엘리안이 자습 기록장을 펼칩니다…</p> : query.isError ? <p role="alert">{query.error.message} <button onClick={() => void query.refetch()}>다시 펼치기</button></p> : state && <>
          <header><small>나의 자습 참여 이력</small><h3>{dateLabel(state.week)} ~ {dateLabel(shiftDay(state.week, 6))}</h3><button disabled={busy} onClick={() => void query.refetch()}>새 기록 확인</button></header>
          {readOnly && !studentId ? <p>미리 볼 학생을 선택하면 자습 기록이 펼쳐집니다.</p> : <>
            <div className={css.summary}><span>참석 <strong>{attended.length}회</strong></span><span>참석 교시 시간 <strong>{Math.floor(minutes / 60)}시간 {minutes % 60}분</strong></span><span>받은 보상 <strong>{state.claimed_coins}코인</strong></span></div>
            <p className={css.note}>시간은 등록된 교시의 시작·종료 시각 기준이며 실제 체류 시간을 측정한 값은 아니에요.{unknownTime > 0 && ` 시간 정보가 없는 참석 ${unknownTime}회는 합계에서 제외했어요.`}</p>
            <button className={css.claim} disabled={readOnly || busy || !pending} onClick={() => void claim()}><Stamp size={20} aria-hidden="true" />{busy ? '인장을 찍는 중…' : pending ? `참석 ${pending}회 · ${pending * STUDY_REWARD}코인 받기` : rule?.expired && unclaimedAttended ? '받을 수 있는 기한이 지났어요' : '받을 보상이 없어요'}</button>
            <p className={css.note}>참석이 확인된 회차만 받을 수 있어요. 받은 회차에는 다시 지급되지 않아요. 하루 최대 {STUDY_DAILY_CAP}회({STUDY_DAILY_CAP * STUDY_REWARD}코인)까지, 지난주 기록까지만 받을 수 있어요(한 주가 지나면 그 전 주 보상은 사라져요).</p>
            {feedback && <p role="status" className={css.feedback}>{feedback}</p>}{error && <p role="alert" className={css.error}>{error}</p>}
            {!state.entries.length ? <p className={css.empty}>이 주에는 아직 자습 기록이 없어요.<br />참여한 시간이 기록되면 이 페이지에 차곡차곡 남습니다.</p> : <ol className={css.entries}>{state.entries.map(e => <li key={e.id}>
              <div><time dateTime={e.day}>{dateLabel(e.day)}</time><h4>{e.room}</h4><p>{e.period}{e.start_time && e.end_time ? ` · ${e.start_time}–${e.end_time}` : ' · 시간 정보 없음'}</p></div>
              <div className={css.stamps}><span data-attended={e.attendance === 'attended'}>{attendanceLabels[e.attendance]}</span><small>{e.claimed ? `${STUDY_REWARD}코인 수령 완료` : !e.eligible ? '보상 대기' : rule?.capped.has(e.id) ? `하루 최대 ${STUDY_DAILY_CAP * STUDY_REWARD}코인` : rule?.expired ? '기한 지남' : `${STUDY_REWARD}코인 수령 가능`}</small></div>
            </li>)}</ol>}
          </>}
        </>}
      </article>
    </div>
  </ScenePanel>;
}
