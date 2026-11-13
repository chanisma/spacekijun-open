import { useState, type CSSProperties, type ReactNode } from 'react';
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from 'lucide-react';
import { GOAL_LABELS, goalColor, goalHorizon, goalTree, seoulDay } from '@/features/planner/plannerModel';
import type { PlannerGoal, PlannerPlan } from '@/features/planner/types';
import type { PlannerWrite } from '@/features/planner/usePlannerWeek';
import { BookPage, BookSpread } from './PlannerBook';
import { QuillLine } from './InkLine';
import { usePlannerTheme } from './plannerTheme';

export interface GoalPreset { horizon: 'long' | 'short'; parent_goal_id?: string | null }
/**
 * 별빛 플래너 — 목표 쪽 (2026-10-03, 같은 날 두 층으로 — 사용자 요청 «큰 목표와 단기 목표»).
 * 왼쪽 쪽 = «이어가는 중 / 이룬 목표 / 보관함» 갈래. 이어가는 중에서는 **장기 목표가 띠**로 서고 그 아래에
 *   묶인 단기 목표 카드가 매달린다(띠마다 깃펜 줄로 단기 목표를 바로 적는다). 어디에도 묶이지 않은 단기 목표는 맨 아래.
 * 오른쪽 쪽 = 고른 목표 한 장. 장기 목표면 단기 목표들의 진척, 단기 목표면 «어느 장기 목표에 묶을까»를 바로 고친다.
 * 이름(장기/단기)은 `GOAL_LABELS` 한 곳 — 바꾸려면 거기만 고친다.
 */
export function BookGoals({ goals, plans, busy, readOnly, write, onEdit, onNew, onPlanForGoal, guides, editor, newGuide }: {
  goals: PlannerGoal[]; plans: PlannerPlan[]; busy: boolean; readOnly: boolean; write: PlannerWrite;
  onEdit: (goal: PlannerGoal) => void; onNew: (preset?: GoalPreset) => void; onPlanForGoal: (goalId: string) => void; guides?: ReactNode; editor?: ReactNode;
  /** 장 안내 중 «＋ 이유까지 적어 목표 세우기» 를 눌러야 할 때 — 단추를 반짝이고 옆에 이 말을 붙인다(아카데미 전용). */
  newGuide?: ReactNode;
}) {
  const { css, words } = usePlannerTheme();
  const groups = {
    active: goals.filter(g => !g.is_archived && !g.is_completed),
    done: goals.filter(g => !g.is_archived && g.is_completed),
    archived: goals.filter(g => g.is_archived),
  };
  const [view, setView] = useState<keyof typeof groups>('active');
  const shown = groups[view];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const selected = shown.find(g => g.id === selectedId) ?? shown[0] ?? null;
  const locked = busy || readOnly;
  const plansOf = (id: string) => plans.filter(p => p.goal_id === id && !p.is_archived);
  const tree = goalTree(goals);
  const ownPractice = (id: string) => plansOf(id).reduce((n, p) => n + p.practice_count, 0);
  /** 장기 목표의 실천 = 자기에게 바로 묶인 계획 + 단기 목표들의 계획. */
  const practices = (goal: PlannerGoal) => [goal, ...(goalHorizon(goal) === 'long' ? tree.childrenOf(goal.id) : [])].reduce((n, g) => n + ownPractice(g.id), 0);
  const activeLongs = tree.longs.filter(g => !g.is_archived && !g.is_completed);
  // 단기 목표는 묶인 장기 목표의 색을 따른다 — 한 갈래가 한 색이라 하늘·이번 주 쪽에서도 같은 무리로 읽힌다.
  const tone = (goal: PlannerGoal) => ({ ['--goal' as string]: goalColor(goalHorizon(goal) === 'short' && goal.parent_goal_id ? goal.parent_goal_id : goal.id) }) as CSSProperties;
  const saveGoal = (payload: Record<string, unknown>) => write('save_goal', payload, { silent: true });

  const seal = (goal: PlannerGoal) => <button type="button" role="checkbox" aria-checked={goal.is_completed} className={css.seal} disabled={locked} aria-label={`${goal.title} ${goal.is_completed ? '목표 완료 취소' : '목표 완료'}`} onClick={() => void write('complete_goal', { id: goal.id, completed: !goal.is_completed })}>
    <span aria-hidden="true">{goal.is_completed ? '✦' : ''}</span>
  </button>;
  const stars = (count: number) => <span className={css.goalStars} aria-label={`실천 ${count}번`}>{Array.from({ length: Math.min(count, 12) }, (_, i) => <i key={i} />)}{count > 12 && <b>+{count - 12}</b>}{!count && <small>아직 실천 기록이 없어요</small>}</span>;
  const card = (goal: PlannerGoal) => <li key={goal.id} className={css.goalCard} data-selected={selected?.id === goal.id} data-complete={goal.is_completed} data-horizon={goalHorizon(goal)} style={tone(goal)}>
    {seal(goal)}
    <button type="button" className={css.goalOpen} onClick={() => setSelectedId(goal.id)} aria-pressed={selected?.id === goal.id}>
      {view !== 'active' && <small className={css.horizonTag}>{GOAL_LABELS[goalHorizon(goal)]}</small>}
      <strong>{goal.title}</strong>{stars(practices(goal))}
    </button>
  </li>;

  const isLong = selected ? goalHorizon(selected) === 'long' : false;
  const children = selected && isLong ? tree.childrenOf(selected.id).filter(g => !g.is_archived) : [];
  const parent = selected?.parent_goal_id ? goals.find(g => g.id === selected.parent_goal_id) ?? null : null;
  const loose = tree.loose.filter(g => !g.is_archived && !g.is_completed);

  return <BookSpread>
    <BookPage side="left" label="왼쪽 쪽 · 나의 별자리">
      <header className={css.weekHead}>
        <span className={css.kicker}>{words.brand} · 나의 목표</span>
        <h3>나의 목표<em>{groups.active.length}개 이어가는 중</em></h3>
        <p className={css.ribbonNote}>{GOAL_LABELS.long}는 큰 그림, {GOAL_LABELS.short}는 이번 달·이번 학기에 닿을 수 있는 걸음이에요. 계획은 {GOAL_LABELS.short}에 묶어요.</p>
      </header>
      <nav className={css.goalTabs} aria-label="목표 갈래">
        {([['active', '이어가는 중'], ['done', '이룬 목표'], ['archived', '보관함']] as const).map(([key, label]) =>
          <button key={key} type="button" aria-pressed={view === key} onClick={() => { setView(key); setSelectedId(null); setRemoving(null); }}>{label}<b>{groups[key].length}</b></button>)}
      </nav>
      {view === 'active' ? <>
        {!readOnly && <QuillLine label={`새 ${GOAL_LABELS.long} 적기`} placeholder={`${GOAL_LABELS.long} — 예: 생명을 연구하는 사람 되기`} disabled={busy} onSubmit={title => saveGoal({ title, description: '', horizon: 'long' })} />}
        {activeLongs.map(long => {
          const kids = tree.childrenOf(long.id).filter(g => !g.is_archived && !g.is_completed);
          const doneKids = tree.childrenOf(long.id).filter(g => !g.is_archived && g.is_completed).length;
          return <section key={long.id} className={css.longGroup} style={tone(long)} aria-label={`${GOAL_LABELS.long} ${long.title}`}>
            <div className={css.longBanner} data-selected={selected?.id === long.id}>
              {seal(long)}
              <button type="button" className={css.goalOpen} onClick={() => setSelectedId(long.id)} aria-pressed={selected?.id === long.id}>
                <small className={css.horizonTag}>{GOAL_LABELS.long}</small><strong>{long.title}</strong>
                <span className={css.longMeta}>{GOAL_LABELS.short} {kids.length + doneKids}개 중 {doneKids}개 이룸 · 실천 {practices(long)}번</span>
              </button>
            </div>
            {!!kids.length && <ul className={css.goalCards} aria-label={`${long.title}의 ${GOAL_LABELS.short}`}>{kids.map(card)}</ul>}
            {!readOnly && <QuillLine label={`${long.title}에 ${GOAL_LABELS.short} 적기`} placeholder={`이 ${GOAL_LABELS.long}로 가는 ${GOAL_LABELS.short} 하나…`} disabled={busy} onSubmit={title => saveGoal({ title, description: '', horizon: 'short', parent_goal_id: long.id })} />}
          </section>;
        })}
        <section className={css.looseGroup} aria-label={activeLongs.length ? `${GOAL_LABELS.long}에 묶지 않은 ${GOAL_LABELS.short}` : GOAL_LABELS.short}>
          <h4>{activeLongs.length ? `${GOAL_LABELS.long}에 묶지 않은 ${GOAL_LABELS.short}` : GOAL_LABELS.short}</h4>
          {loose.length ? <ul className={css.goalCards} aria-label="목표 목록">{loose.map(card)}</ul> : <p className={css.paperState}>{groups.active.length ? `모든 ${GOAL_LABELS.short}가 ${GOAL_LABELS.long}에 묶여 있어요.` : '관심 있는 것, 해 보고 싶은 것을 목표로 남겨 보세요.'}</p>}
          {!readOnly && <QuillLine label={`새 ${GOAL_LABELS.short} 적기`} placeholder="이루고 싶은 것 하나 적기…" disabled={busy} onSubmit={title => saveGoal({ title, description: '', horizon: 'short' })} />}
          {!readOnly && <div className={css.pageActions}><button type="button" className={css.inkButton} disabled={locked} onClick={() => onNew({ horizon: 'short' })} data-guide={newGuide ? 'active' : undefined}>＋ 이유까지 적어 목표 세우기</button>{newGuide}</div>}
        </section>
      </> : <>
        <ul className={css.goalCards} aria-label={view === 'archived' ? '보관한 목표' : '이룬 목표'}>{shown.map(card)}</ul>
        {!shown.length && <p className={css.paperState}>{view === 'archived' ? '보관한 목표가 없어요. 잠시 내려놓고 싶은 목표는 «보관하기»로 여기에 둘 수 있어요.' : `아직 이룬 목표가 없어요. 목표 카드의 ${words.stamp} 여기로 와요.`}</p>}
      </>}
    </BookPage>

    <BookPage side="right" label="오른쪽 쪽 · 나의 목표">
      {guides && <div className={css.guideNote}>{guides}</div>}
      {editor ? <div className={css.noteCard}>{editor}</div> : selected ? <article key={selected.id} className={css.goalSheet} style={tone(selected)}>
        <span className={css.kicker}>{GOAL_LABELS[goalHorizon(selected)]} · {selected.is_archived ? '보관한 목표' : selected.is_completed ? '이룬 목표' : '이어 가는 목표'}</span>
        <h3>{selected.title}</h3>
        <section aria-label="세운 이유"><h4>이 목표를 세운 이유</h4><p>{selected.description?.trim() || '아직 이유를 적지 않았어요. «고쳐 적기»에서 남겨 두면, 흔들릴 때 다시 읽을 수 있어요.'}</p></section>
        {isLong ? <section aria-label={`묶인 ${GOAL_LABELS.short}`}><h4>이 {GOAL_LABELS.long}로 가는 {GOAL_LABELS.short} · {children.filter(c => c.is_completed).length} / {children.length}</h4>
          {children.length ? <ul className={css.planList}>{children.map(c => <li key={c.id}><button type="button" className={css.childLink} onClick={() => { if (c.is_completed) setView('done'); setSelectedId(c.id); }}>{c.is_completed ? '✦ ' : '· '}{c.title}</button><i aria-label={`실천 ${practices(c)}번`}>{'✦'.repeat(Math.min(practices(c), 10)) || '·'}</i></li>)}</ul> : <p>아직 묶인 {GOAL_LABELS.short}가 없어요. 이번 달·이번 학기에 닿을 수 있는 걸음 하나를 적어 보세요.</p>}
          {!readOnly && !selected.is_archived && <QuillLine label={`${selected.title}에 ${GOAL_LABELS.short} 더하기`} placeholder={`${GOAL_LABELS.short} 하나 더…`} disabled={busy} onSubmit={title => saveGoal({ title, description: '', horizon: 'short', parent_goal_id: selected.id })} />}
        </section> : <section aria-label={`묶인 ${GOAL_LABELS.long}`}><h4>어느 {GOAL_LABELS.long}로 가는 걸음인가요?</h4>
          {readOnly ? <p>{parent?.title ?? `묶인 ${GOAL_LABELS.long}가 없어요.`}</p> : <select className={css.parentPick} aria-label={`${selected.title}을 묶을 ${GOAL_LABELS.long}`} disabled={locked || selected.is_archived} value={selected.parent_goal_id ?? ''}
            onChange={e => void saveGoal({ id: selected.id, title: selected.title, description: selected.description ?? '', is_completed: selected.is_completed, parent_goal_id: e.target.value })}>
            <option value="">묶지 않음</option>
            {tree.longs.filter(g => !g.is_archived || g.id === selected.parent_goal_id).map(g => <option key={g.id} value={g.id} disabled={g.is_archived}>{g.title}</option>)}
          </select>}
          {!readOnly && !activeLongs.length && <p className={css.sheetHint}>{GOAL_LABELS.long}를 먼저 하나 세우면 여기서 묶을 수 있어요.</p>}
        </section>}
        <section aria-label="이어 가는 계획"><h4>{isLong ? '바로 묶인 계획' : '이어 가는 계획'} · 실천 {ownPractice(selected.id)}번</h4>
          {plansOf(selected.id).length ? <ul className={css.planList}>{plansOf(selected.id).map(p => <li key={p.id}><span>{p.title}</span><i aria-label={`실천 ${p.practice_count}번`}>{'✦'.repeat(Math.min(p.practice_count, 10))}{p.practice_count > 10 ? ` +${p.practice_count - 10}` : ''}{!p.practice_count && '·'}</i></li>)}</ul> : <p>{isLong ? `계획은 보통 ${GOAL_LABELS.short}에 묶어요. 이 목표에 바로 묶은 계획은 아직 없어요.` : '아직 이 목표에 이어진 계획이 없어요.'}</p>}
          {!readOnly && !selected.is_archived && <QuillLine label={`${selected.title}에 오늘 할 일 적기`} placeholder="이 목표를 위해 오늘 할 일…" disabled={busy}
            onSubmit={title => write('save_task', { title, task_date: seoulDay(), priority: 'medium', related_goal_id: selected.id, memo: '', start_time: '', end_time: '' }, { silent: true })} />}
        </section>
        {!readOnly && <div className={css.sheetActions}>
          <button type="button" disabled={locked || selected.is_archived} aria-label={`${selected.title} 이 목표에 계획 적기`} onClick={() => onPlanForGoal(selected.id)}><Plus size={14} aria-hidden="true" />자세히 계획 적기</button>
          <button type="button" disabled={locked} aria-label={`${selected.title} 살펴보고 고쳐 적기`} onClick={() => onEdit(selected)}><Pencil size={14} aria-hidden="true" />고쳐 적기</button>
          <button type="button" disabled={locked} aria-label={`${selected.title} ${selected.is_archived ? '목표 다시 꺼내기' : words.archive}`} onClick={() => void write('archive_goal', { id: selected.id, archived: !selected.is_archived })}>{selected.is_archived ? <ArchiveRestore size={14} aria-hidden="true" /> : <Archive size={14} aria-hidden="true" />}{selected.is_archived ? '다시 꺼내기' : '보관하기'}</button>
          <button type="button" disabled={locked} aria-label={`${selected.title} 목표 지우기`} onClick={() => setRemoving(removing === selected.id ? null : selected.id)}><Trash2 size={14} aria-hidden="true" />지우기</button>
        </div>}
        {removing === selected.id && <div className={css.stickyNote} data-tone="warn"><p>{isLong && children.length ? `이 ${GOAL_LABELS.long}를 지울까요? 묶인 ${GOAL_LABELS.short} ${children.length}개는 지워지지 않고 풀려나요.` : '이 목표를 지울까요? 연결된 계획과 쪽지는 남아 있어요.'}</p><div><button type="button" disabled={locked} onClick={async () => { if (await write('delete_goal', { id: selected.id })) { setRemoving(null); setSelectedId(null); } }}>목표 삭제 확정</button><button type="button" disabled={busy} onClick={() => setRemoving(null)}>남겨 두기</button></div></div>}
      </article> : <div className={css.paperState}><p>왼쪽 쪽에 목표를 하나 적으면 여기에 펼쳐져요.</p>{!readOnly && <button type="button" className={css.inkButton} onClick={() => onNew({ horizon: 'long' })}>＋ {GOAL_LABELS.long} 세우기</button>}</div>}
    </BookPage>
  </BookSpread>;
}
