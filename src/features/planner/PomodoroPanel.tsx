import { useRef, useState } from 'react';
import { Coffee, Pause, Play, RotateCcw, Settings2, Square, Timer } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { finishTimer, initialPomodoro, markFocusSaved, pauseTimer, remainingMs, resumeTimer, startBreak, timerText, type FocusRecord } from './pomodoroModel';
import { saveFocusRecord } from './focusService';
import type { PlannerTask } from './types';
import type { usePomodoro } from './usePomodoro';
import css from './pomodoro.module.css';

export function PomodoroPanel({ timer, tasks, userId, busy, records, recordsError, onRetry, onComplete, onReflect }: {
  timer: ReturnType<typeof usePomodoro>;
  tasks: PlannerTask[];
  userId: string;
  busy: boolean;
  records: FocusRecord[];
  recordsError: boolean;
  onRetry: () => void;
  onComplete: (id: string) => Promise<boolean>;
  onReflect: (id: string, date: string) => void;
}) {
  const { state, now, change } = timer;
  const cache = useQueryClient();
  const [selected, setSelected] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingLock = useRef(false);
  const [error, setError] = useState('');
  const [discard, setDiscard] = useState(false);
  const idle = state.status === 'idle';
  const active = state.status === 'running' || state.status === 'paused';
  const finished = state.status === 'finished';
  const chosenTask = tasks.find(task => task.id === selected) ?? tasks.find(task => task.id === state.task?.id && !task.completed) ?? tasks.find(task => !task.completed);
  const left = remainingMs(state, now);
  const totalSeconds = records.reduce((sum, record) => sum + record.focus_seconds, 0);
  const phaseLabel = state.phase === 'focus' ? '집중' : state.phase === 'longBreak' ? '긴 휴식' : '짧은 휴식';
  const nextBreak = state.cycle > 0 && state.cycle % 4 === 0 && state.pending?.completed ? state.settings.longBreak : state.settings.shortBreak;
  async function save() {
    if (!state.pending || savingLock.current) return;
    savingLock.current = true; setSaving(true); setError('');
    try {
      const record = await saveFocusRecord(state.pending);
      await change(previous => markFocusSaved(previous, record.id));
      await cache.invalidateQueries({ queryKey: ['planner-focus', userId] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : '저장하지 못했습니다. 다시 시도해 주세요.'); }
    finally { savingLock.current = false; setSaving(false); }
  }
  return <section className={css.panel} aria-label="포모도로 집중 타이머" data-phase={state.phase}>
    <div className={css.heading}><div><Timer size={16} /><h2>계획을 실천하는 시간</h2><span>포모도로</span></div><button className={css.settingsButton} disabled={!idle} aria-label="포모도로 시간 설정" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}><Settings2 size={16} /></button></div>
    <div className={css.main}>
      <div className={css.clock}><span>{phaseLabel}{state.status === 'paused' ? ' · 일시정지' : finished ? ' · 종료' : ''}</span><output role="timer" aria-label={`${phaseLabel} 남은 시간`}>{timerText(left)}</output><div className={css.cycles} aria-label={`${state.cycle}회 집중 완료`}>{[0, 1, 2, 3].map(index => <i key={index} data-filled={index < (state.cycle % 4 || (state.cycle ? 4 : 0))} />)}<small>{state.cycle}회</small></div></div>
      <div className={css.plan}>
        {idle ? <label>집중할 계획<select aria-label="집중할 계획" value={chosenTask?.id || ''} disabled={!tasks.length || busy} onChange={e => setSelected(e.target.value)}><option value="" disabled>먼저 계획을 추가해 주세요</option>{tasks.filter(task => !task.completed).map(task => <option value={task.id} key={task.id}>{task.title}</option>)}</select></label> : <div><p className={css.caption}>{state.task?.task_date}의 계획</p><h3>{tasks.find(task => task.id === state.task?.id)?.title ?? state.task?.title}</h3></div>}
        <p className={css.help}>{state.phase !== 'focus' ? '잠시 눈을 쉬고 몸을 움직여 보세요. 휴식이 끝나면 다음 집중을 직접 시작해요.' : `${state.settings.focus}분 집중 → ${state.settings.shortBreak}분 휴식 · 4회 집중 후 ${state.settings.longBreak}분 긴 휴식`}</p>
        <div className={css.controls}>
          {idle && <Button size="sm" disabled={!chosenTask || busy} onClick={() => { setError(''); void timer.start(chosenTask!); }}><Play size={14} />집중 시작</Button>}
          {active && <><Button size="sm" onClick={() => void change(previous => state.status === 'running' ? pauseTimer(previous, Date.now()) : resumeTimer(previous, Date.now()))}>{state.status === 'running' ? <><Pause size={14} />일시정지</> : <><Play size={14} />이어하기</>}</Button><Button size="sm" variant="outline" onClick={() => void change(previous => finishTimer(previous, Date.now()))}><Square size={13} />{state.phase === 'focus' ? '여기까지 기록' : '휴식 마치기'}</Button></>}
          {finished && state.pending && !state.saved && <Button size="sm" disabled={saving} onClick={() => void save()}>{saving ? '저장 중…' : `${Math.floor(state.pending.focus_seconds / 60)}분 ${state.pending.focus_seconds % 60}초 집중 기록 저장`}</Button>}
          {finished && state.saved && <><Button size="sm" disabled={busy} onClick={() => void change(previous => startBreak(previous, Date.now()))}><Coffee size={14} />{nextBreak}분 휴식 시작</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => { setError(''); void onComplete(state.task!.id).then(ok => { if (!ok) setError('계획 완료를 반영하지 못했습니다. 다시 시도해 주세요.'); }); }}>계획 완료 표시</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => onReflect(state.task!.id, state.task!.task_date)}>돌아보기</Button></>}
          {finished && <Button size="sm" variant="ghost" disabled={saving || busy} onClick={() => { if (state.pending && !state.saved) setDiscard(true); else void change(previous => previous.status === 'finished' && (!previous.pending || previous.saved) ? initialPomodoro(previous.settings, previous.cycle) : previous); }}><RotateCcw size={13} />다음 계획</Button>}
        </div>
        {finished && <p className={css.result} role="status">{state.saved ? '집중 기록을 저장했어요. 실제로 끝낸 계획은 완료 표시해 주세요.' : state.pending ? '집중 시간을 확인하고 저장해 주세요. 계획 완료는 직접 표시할 수 있어요.' : '1초 미만의 집중은 기록하지 않았어요. 다음 계획을 선택해 주세요.'}</p>}
      </div>
      <div className={css.summary}><span>선택한 날짜의 실행</span><strong>{Math.floor(totalSeconds / 60)}<small>분</small></strong><p>{records.filter(record => record.completed).length}회 집중 완료</p></div>
    </div>
    {settingsOpen && idle && <div className={css.settings}>{([['focus', '집중'], ['shortBreak', '짧은 휴식'], ['longBreak', '긴 휴식']] as const).map(([key, label]) => <label key={key}>{label} (분)<input type="number" min={1} max={120} value={state.settings[key]} onChange={e => {
      const value = Number(e.target.value);
      if (Number.isInteger(value) && value >= 1 && value <= 120) void change(previous => previous.status === 'idle' ? { ...initialPomodoro({ ...previous.settings, [key]: value }, previous.cycle), task: previous.task } : previous);
    }} /></label>)}</div>}
    {recordsError && <p className={css.error}>저장된 집중 기록을 불러오지 못했습니다. <button onClick={onRetry}>다시 시도</button></p>}
    {!!records.length && <details className={css.history}><summary>집중 기록 {records.length}건</summary><ul>{records.map(record => <li key={record.id}><div><strong>{tasks.find(task => task.id === record.task_id)?.title || '연결된 계획'}</strong><span>{new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(record.started_at))} 시작 · {record.completed ? '집중 완료' : '부분 집중'}</span></div><b>{Math.floor(record.focus_seconds / 60)}분 {record.focus_seconds % 60}초</b></li>)}</ul></details>}
    {error && <p role="alert" className={css.error}>{error}</p>}
    {timer.storageError && <p role="alert" className={css.error}>이 브라우저에 타이머 상태를 보관할 수 없습니다. 화면을 닫기 전에 집중 기록을 저장해 주세요.</p>}
    <Dialog open={discard} onOpenChange={setDiscard}><DialogContent><DialogHeader><DialogTitle>저장하지 않은 집중 기록을 버릴까요?</DialogTitle><DialogDescription>다음 계획으로 넘어가면 이번 집중 기록을 되돌릴 수 없습니다.</DialogDescription></DialogHeader><div className={css.controls}><Button variant="outline" onClick={() => setDiscard(false)}>돌아가기</Button><Button variant="destructive" onClick={() => { void change(previous => previous.sessionId === state.sessionId && previous.status === 'finished' && !previous.saved ? initialPomodoro(previous.settings, previous.cycle) : previous); setDiscard(false); }}>기록 버리기</Button></div></DialogContent></Dialog>
  </section>;
}
