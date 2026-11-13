import { useContext, useEffect, useRef, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { GameWorkshop } from './GameWorkshop';
import { gameAsset } from './gameAsset';
import { ScenePanel } from './GameSurface';
import { fetchDormitory, writeDormitory, type DormTask, type DormGoal, type DormItem } from './dormitoryService';
import { workshopReference, workshopSlots, type WorkshopSlot } from './workshopModel';
import { equipment, itemSupported, seoulDay, offsetDay } from './dormitoryModel';
import { WardrobeContext } from './wardrobeContext';
import css from './dormitory.module.css';
import { PlannerBook, snapshotPage, type BookRibbon, type PageTurn } from './PlannerBook';
import { BookWeek } from './BookWeek';
import { BookDay } from './BookDay';
import { BookGoals } from './BookGoals';
import { BookMonth } from './BookMonth';
import { readStoredString, writeStoredString } from '@/lib/safeLocalStorage';
import { GoalSheetForm, TaskSheetForm } from './PlannerSheetForms';
import { GuideHint, guideMark } from './GuideHint';

/** 기숙사의 세 화면. 방(«기숙사 감상» 패널)은 2026-10-03 에 없앴다 — 기숙사도 다른 건물처럼 세계 장면이고, 플래너·옷장·공방·세린·창가는 세계의 핫스팟이다. */
export type DormView = 'planner' | 'wardrobe' | 'shop';
/** 책의 쪽 — 리본 순서이자 넘기는 방향의 기준. 시간별 계획은 하루 쪽 안에, 달력은 «월별 일정» 쪽으로(2026-10-03 사용자 결정). */
const BOOK_TABS = ['week', 'day', 'month', 'goals'] as const;
type BookTab = typeof BOOK_TABS[number];
export function GameDormitory({ view, userId, studentId, readOnly, onClose, onView, chapterGuide, onChapterReturn, onRecordSaved, skyGuide, backLabel }: { backLabel?: string; skyGuide?: { onReturn: () => void }; view: DormView; userId: string; studentId: string | null; readOnly: boolean; onClose: () => void; onView: (view: DormView) => void; chapterGuide?: { phase: 'goal' | 'plan'; goalId: string | null; goalTitle: string | null }; onChapterReturn?: () => void; onRecordSaved?: (action: string, id: string) => Promise<void> }) {
  const cache = useQueryClient();
  const [params, setParams] = useSearchParams();
  const orderId = params.get('order');
  // 공방으로 바로 들어오면(기숙사의 «공방 주문서 쓰기» 핫스팟 · 배송함 딥링크) 맞춤 제작 · 배송함부터 — 없앤 방 메뉴의 공방 아이콘이 그랬다(2026-09-13 결정 유지).
  const [shopMode, setShopMode] = useState<'catalog' | 'orders'>(() => params.get('workshop') === 'orders' || view === 'shop' ? 'orders' : 'catalog');
  useEffect(() => { if (orderId) setShopMode('orders'); }, [orderId]);
  const [day, setDay] = useState(seoulDay);
  const query = useQuery({ queryKey: ['academy-dormitory', userId, readOnly, studentId, day], queryFn: () => fetchDormitory(day, readOnly ? studentId : null), refetchInterval: 30_000, retry: 1,
    // 날짜를 바꿀 때마다 질의 열쇠가 바뀐다 — 새 날을 받는 동안 옛 자료를 쥐고 있어야 책 전체가 «펼치는 중» 안내로 바뀌었다 돌아오는 깜빡임이 없다(2026-10-03 사용자 제보).
    placeholderData: keepPreviousData });
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [message, setMessage] = useState(''); const [error, setError] = useState('');
  useEffect(() => { if (!message) return; const timer = window.setTimeout(() => setMessage(''), 4000); return () => window.clearTimeout(timer); }, [message]);
  // 플래너는 플래너로(2026-10-03 사용자 결정) — 인장을 찍어도 «하늘의 별 보기»로 이끌지 않고, 코인도 책 위에 띄우지 않는다.
  const [task, setTask] = useState<Partial<DormTask> | null>(null);
  const [goal, setGoal] = useState<Partial<DormGoal> | null>(null);
  /** 시간표 쪽이 "작성 중인 계획의 시간을 고르는" 용도로 펼쳐졌는가 (2026-09-14 사용자 지시). 평소엔 끌기가 새 계획을 만든다. */
  const [pickForForm, setPickForForm] = useState(false);
  // 별빛 플래너(2026-10-03 오버홀) — 처음 펼치는 쪽은 «이번 주». 장(章) 안내 중이면 그 장이 정한 쪽이 이긴다(아래 effect).
  // 시간별 계획은 서랍이 아니라 책의 넷째 쪽이다(같은 날 사용자 요청 «시간별 계획도 방식 바꿔줘»).
  const [tab, setTabState] = useState<BookTab>(() => { const v = readStoredString('academy-planner:view:v1'); return (BOOK_TABS as readonly string[]).includes(v ?? '') ? v as BookTab : 'week'; });
  const setTab = (next: BookTab) => { setTabState(next); writeStoredString('academy-planner:view:v1', next); };
  /** 책장 넘김 — 쪽이 바뀌기 «직전»에 떠 둔 사본(PlannerBook 이 넘긴다). */
  const [turn, setTurn] = useState<PageTurn | null>(null);
  // 애니메이션이 끝나지 않는 경우(움직임 줄이기·휴대폰은 사본을 감춘다)에도 사본을 놓아 준다.
  useEffect(() => { if (!turn) return; const timer = window.setTimeout(() => setTurn(null), 900); return () => window.clearTimeout(timer); }, [turn]);
  const turnPage = (dir: 'next' | 'prev') => setTurn(snapshotPage(dir));
  /** 리본 순서(이번 주 → 하루 → 목표 → 시간표)가 넘기는 방향을 정한다. */
  const flipTo = (next: BookTab) => { if (next === tab) return; turnPage(BOOK_TABS.indexOf(next) > BOOK_TABS.indexOf(tab) ? 'next' : 'prev'); setTab(next); };
  const flipDay = (next: string, dir: 'next' | 'prev') => { if (!next || busy || next === day) return; turnPage(dir); changeDay(next); };
  const chapterPhase = chapterGuide?.phase;
  // 제5장 «실천을 표시해 주세요» 안내(skyGuide)는 하루 쪽에 있다 — 그 장면에서는 이번 주 쪽 대신 하루 쪽으로 연다.
  const skyGuided = !!skyGuide;
  useEffect(() => { if (skyGuided) setTabState('day'); }, [skyGuided]);
  useEffect(() => {
    if (!chapterPhase) return;
    // 장 안내가 정한 쪽은 «마지막으로 본 쪽»으로 저장하지 않는다 — 장이 끝나면 학생이 고른 쪽으로 돌아간다.
    setTabState(chapterPhase === 'goal' ? 'goals' : 'day');
    if (chapterPhase === 'plan') setDay(offsetDay(seoulDay(), 1));
  }, [chapterPhase]);
  const [category, setCategory] = useState<WorkshopSlot | 'legacy'>('ria');
  const [selected, setSelected] = useState<DormItem | null>(null);
  const [purchase, setPurchase] = useState<DormItem | null>(null);
  const worn = useContext(WardrobeContext);
  async function write(action: string, payload: Record<string, unknown>, options: { silent?: boolean } = {}) {
    if (readOnly || lock.current) return false;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const result = await writeDormitory(action, payload);
      await cache.invalidateQueries({ queryKey: ['academy-dormitory', userId] });
      await cache.invalidateQueries({ queryKey: ['academy-chapter', userId] });
      // 책 위에서 바로 적기·인장·옮기기는 화면이 곧바로 바뀌므로 «반영했어요» 를 띄우지 않는다. 보상은 늘 알린다(코인이 떠오른다).
      if (!options.silent) setMessage('기숙사 기록에 반영했어요.');
      if (result?.id) await onRecordSaved?.(action, result.id);
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : '기록하지 못했어요. 다시 시도해 주세요.'); if (action === 'purchase') { setPurchase(null); setSelected(null); await cache.invalidateQueries({ queryKey: ['academy-dormitory', userId] }); } return false; }
    finally { lock.current = false; setBusy(false); }
  }
  function changeDay(value: string) { if (!value || busy) return; setDay(value); if (!pickForForm) setTask(null); setError(''); }
  function newTask(start_time = '', end_time = '', goalId?: string) {
    setTask({ title: '', task_date: day, priority: chapterGuide?.phase === 'plan' ? 'high' : 'medium', memo: '', start_time, end_time, related_goal_id: goalId ?? chapterGuide?.goalId ?? '' });
    setPickForForm(false); flipTo('day');
  }
  function leave() {
    if (busy) return;
    if (pickForForm) { setPickForForm(false); return; }
    if (task || goal) { setTask(null); setGoal(null); return; }
    onClose();
  }
  function changeView(next: DormView) { setSelected(null); setPurchase(null); setPickForForm(false); onView(next); }
  /** 리본 — 쪽을 바꾸면 펼쳐 둔 양식은 접는다(양식은 그 쪽의 것이다). */
  function openTab(next: BookTab) { setTask(null); setGoal(null); setPickForForm(false); flipTo(next); }
  const data = query.data; const tasks = (data?.tasks.filter(t => t.task_date === day) ?? []).sort((a, b) => Number(!a.start_time) - Number(!b.start_time) || (a.start_time || '').localeCompare(b.start_time || ''));
  const owned = selected && data?.items.find(i => i.item_id === selected.id);
  /**
   * 기본 모습(2026-09-14 사용자 지시): 옷장의 각 칸 맨 앞에 **기본 의상·기본 방** 타일을 둔다.
   * 카탈로그 행이 아니라 `workshopReference` 의 원화이므로 별도 선택 상태로 다룬다.
   * 고르면 미리보기가 기본 원화로 바뀌고, 그 칸에 입고 있는 물건이 있으면 벗기(unequip)로 돌아간다.
   */
  const [baseSelected, setBaseSelected] = useState(false);
  const slotOf = (itemId: number) => data?.catalog.find(i => i.id === itemId)?.academy_slot ?? null;
  const equippedInSlot = category !== 'legacy' ? data?.items.find(o => o.is_equipped && slotOf(o.item_id) === category) : undefined;
  const preview = { ...equipment(data), ...(baseSelected && category !== 'legacy' ? { [category]: workshopReference[category] } : selected?.academy_slot && selected.academy_asset && itemSupported(selected.academy_asset) ? { [selected.academy_slot]: selected.asset_url || selected.academy_asset } : {}) };
  const filtered = data?.catalog.filter(i => category === 'legacy' ? !i.academy_slot && data.items.some(o => o.item_id === i.id) : i.academy_slot === category && itemSupported(i.academy_asset) && (view === 'wardrobe' ? data.items.some(o => o.item_id === i.id) : i.is_active || data.items.some(o => o.item_id === i.id))) ?? [];
  // 밤하늘 보기 리본은 2026-10-03 에 뺐다 — 하늘은 기숙사 창가 핫스팟(세계)과 핵심 기능 줄에서 연다.
  const ribbons: BookRibbon[] = [
    { id: 'week', icon: '✦', label: '이번 주', pressed: tab === 'week', disabled: busy, onClick: () => openTab('week') },
    { id: 'day', icon: '☀', label: '하루 계획', pressed: tab === 'day', disabled: busy, onClick: () => openTab('day') },
    { id: 'month', icon: '☾', label: '월별 일정', pressed: tab === 'month', disabled: busy, onClick: () => openTab('month') },
    { id: 'goals', icon: '✧', label: '나의 목표', pressed: tab === 'goals', disabled: busy, onClick: () => openTab('goals') },
  ];
  // 리아의 한마디 — 지금 쪽에서 해 볼 만한 조작 하나를 말한다(설명서 대신 옆에서 말 거는 사람).
  const riaLine = !data ? null : tab === 'week' ? '할 일에 인장을 찍어 보세요. 줄을 끌어 다른 날로 옮길 수도 있어요.'
    : tab === 'goals' ? '목표를 세우고 이번 주 쪽으로 가면, 그 목표의 일들이 별자리로 이어져요.'
    : tab === 'month' ? '날짜를 고르면 그날의 일이 오른쪽에 펼쳐져요. 두 번 누르면 하루 계획으로 넘어가요.'
    : pickForForm ? '시간표에서 시작부터 끝까지 끌면 양식에 시간이 들어가요.' : tasks.length ? `이 날은 ${tasks.length}개 중 ${tasks.filter(t => t.completed).length}개를 했어요.` : '빈 하루예요. 작은 일 하나면 충분해요.';
  const guides = skyGuide || chapterGuide ? <>
    {skyGuide && <aside className={css.chapterGuide} aria-label="세린의 플래너 안내"><strong>세린 · 실천한 계획의 빛</strong><p>목표에 연결해 이미 실천한 계획으로 바로 시작할 수 있어요. 반짝이는 «세린과 빛 확인하기»를 눌러 주세요. 오늘 한 일이 있다면 줄 앞의 인장을 먼저 찍어도 돼요.</p><button disabled={busy} onClick={skyGuide.onReturn} data-guide={guideMark(!readOnly)}>세린과 빛 확인하기</button><GuideHint show={!readOnly}>세린 · 여기를 눌러요</GuideHint></aside>}
    {chapterGuide && <aside className={css.chapterGuide} aria-label="세린의 플래너 안내"><strong>세린 · {chapterGuide.phase === 'goal' ? '내가 직접 할 수 있는 작은 목표' : '목표를 위한 첫 실천'}</strong><p>{chapterGuide.phase === 'goal' ? '반짝이는 «＋ 이유까지 적어 목표 세우기»를 눌러 목표와 그 목표를 세운 이유를 함께 적어 보실래요? 거창한 결과보다 확인할 수 있는 행동 하나면 충분해요.' : `반짝이는 «＋ 계획 적기»를 눌러 “${chapterGuide.goalTitle ?? '나의 목표'}”에 연결할 중요한 일 하나와 시작·마침 시간을 정해 볼까요? 내일 날짜를 펼쳐 두었어요. 달력에서 다른 날도 고를 수 있어요.`}</p><button disabled={busy} onClick={onChapterReturn}>세린과 이야기 이어가기</button></aside>}
  </> : null;
  // 장 안내 중에는 «이 장이 받는 양식»을 여는 단추를 반짝여 가리킨다. 빠른 줄(제목만 적기)·끌어 적기로 만든 목표·계획은
  // 이유나 목표·시간이 비어 장 조건을 못 채워, 학생은 같은 대사로 되돌아오기만 했다(2026-10-15 제보).
  const newGuide = (phase: 'goal' | 'plan') => chapterPhase === phase && !readOnly ? <GuideHint>세린 · 여기를 눌러요</GuideHint> : undefined;
  const taskForm = task && data ? <TaskSheetForm task={task} onChange={setTask} goals={data.goals} busy={busy} readOnly={readOnly} picking={pickForForm} onPickTime={() => setPickForForm(true)}
    requireTime={chapterGuide?.phase === 'plan'} onInvalid={setError} onCancel={() => setTask(null)}
    onSubmit={async () => { if (await write('save_task', { ...task, task_date: day })) setTask(null); }} /> : null;
  const goalForm = goal && data ? <GoalSheetForm goal={goal} onChange={setGoal} goals={data.goals} busy={busy} readOnly={readOnly}
    requireReason={chapterGuide?.phase === 'goal'} onCancel={() => setGoal(null)}
    onSubmit={async () => { if (await write('save_goal', { ...goal })) setGoal(null); }} /> : null;
  return <ScenePanel key="planner" title={view === 'planner' ? '기숙사 플래너' : view === 'shop' ? '기숙사 주문서' : '기숙사 옷장'} onClose={leave} backLabel={backLabel} className={css.scene}>
    <img className={css.backdrop} src={gameAsset(worn.room)} alt="" />
    <header className={css.heading}><span>STARLIGHT DORMITORY · RIA’S ROOM</span><h2>{view === 'planner' ? '별빛 기숙사' : view === 'shop' ? '왕립 공방의 주문서' : '리아의 옷장'}</h2></header>
    {readOnly && <p className={css.notice}>학생 시점 미리보기 · 계획과 꾸미기를 살펴볼 수 있어요. 기록과 코인은 변경되지 않아요.</p>}
    {query.isPending ? <p className={css.notice} role="status">기숙사 기록을 펼치고 있어요…</p> : query.isError ? <div className={css.notice} role="alert"><p>{query.error.message}</p><button onClick={() => void query.refetch()}>다시 펼치기</button></div> : data && <>
      {view === 'shop' && <nav className={css.shopTabs} aria-label="공방 주문 방식"><button aria-pressed={shopMode === 'catalog'} onClick={() => setShopMode('catalog')}>진열된 작품</button><button aria-pressed={shopMode === 'orders'} onClick={() => setShopMode('orders')}>맞춤 제작 · 배송함</button></nav>}
      {view === 'shop' && shopMode === 'orders' ? <GameWorkshop coins={data.coins} userId={userId} studentId={studentId} readOnly={readOnly} orderId={orderId} onWardrobe={() => changeView('wardrobe')} onAll={() => setParams(previous => { const next = new URLSearchParams(previous); next.delete('order'); return next; })} /> : view === 'planner' ? <PlannerBook ribbons={ribbons} riaImage={gameAsset(worn.ria)} riaLine={riaLine} turn={turn} onTurnEnd={() => setTurn(null)}>
        {tab === 'week' ? <BookWeek userId={userId} write={write} initialDay={day} busy={busy} readOnly={readOnly} studentCode={readOnly ? studentId : null} onFlip={turnPage}
          onOpenDay={next => { changeDay(next); flipTo('day'); }} onEdit={t => { setDay(t.task_date); setTask(t); flipTo('day'); }} />
        : tab === 'goals' ? <BookGoals goals={data.goals} plans={data.plans ?? []} busy={busy} readOnly={readOnly} write={write}
          onEdit={g => setGoal(g)} onNew={preset => setGoal({ title: '', description: '', is_completed: false, horizon: preset?.horizon ?? 'short', parent_goal_id: preset?.parent_goal_id ?? null })} onPlanForGoal={id => newTask('', '', id)} guides={guides} newGuide={newGuide('goal')} editor={goal ? goalForm : undefined} />
        : tab === 'month' ? <BookMonth userId={userId} studentCode={readOnly ? studentId : null} day={day} busy={busy} readOnly={readOnly} write={write}
          onSelectDay={changeDay} onChangeMonth={flipDay} onOpenDay={d => { changeDay(d); flipTo('day'); }} onEdit={t => { setDay(t.task_date); setTask(t); flipTo('day'); }} />
        : <BookDay day={day} tasks={tasks} windowTasks={data.tasks} goals={data.goals} busy={busy} readOnly={readOnly} write={write}
          onChangeDay={flipDay} onEdit={t => setTask(t)} onNew={() => newTask()}
          pickMode={pickForForm && !!task} onPick={(start, end) => { if (task) setTask({ ...task, start_time: start, end_time: end }); setPickForForm(false); }} onCancelPick={() => setPickForForm(false)}
          onCopyNext={t => { const nextDay = offsetDay(day, 1); turnPage('next'); setTask({ ...t, id: undefined, task_date: nextDay, completed: false, feedback: '' }); setDay(nextDay); }}
          guides={guides} newGuide={newGuide('plan')} editor={task ? taskForm : undefined} />}
      </PlannerBook> : <div className={css.shop}>
        <div className={css.fitting}><img className={css.roomPreview} src={gameAsset(preview.room)} alt="방 꾸미기 미리보기" />{/* 방 꾸미기·이전 소장품 칸에서는 방만 보인다 (2026-09-14 사용자 지시) — 종전엔 사람 칸이 아니어도 리아로 폴백해 방 위에 리아가 함께 그려졌다. */}
        {category !== 'room' && category !== 'legacy' && <img className={category === 'ria' || category === 'serin' ? css.ria : css.luon} src={gameAsset(preview[category])} alt={`${workshopSlots[category]} 미리보기`} />}<span className={css.previewLabel}>{selected || baseSelected ? '착용 미리보기 · 적용하려면 아래에서 선택' : '현재 꾸민 모습'}</span></div>
        <div className={css.catalog}><div className={css.coin}>✦ 보유 코인 {data.coins}</div><nav className={css.tabs}>{[...Object.entries(workshopSlots).map(([key, label]) => [key, label.replace(' · 헤어', '').replace('기숙사 방', '방 꾸미기')]), ['legacy','이전 소장품']].map(([key,label]) => <button key={key} aria-pressed={category === key} onClick={() => {setCategory(key as typeof category);setSelected(null);setBaseSelected(false);setPurchase(null);}}>{label}</button>)}</nav>
          {category === 'legacy' && <p>이전에 모은 물건들을 그대로 보관하고 있어요. 아카데미 의상과 가구는 각 전용 칸에서 골라주세요.</p>}
          <div className={css.itemGrid}>{view === 'wardrobe' && category !== 'legacy' && <button key="base" aria-pressed={baseSelected} onClick={() => {setBaseSelected(true);setSelected(null);setPurchase(null);}}><img src={gameAsset(workshopReference[category])} alt="" /><strong>{category === 'room' ? '기본 방' : '기본 의상'}</strong><small>{equippedInSlot ? '옷장에 보관' : '지금 모습'}</small></button>}{filtered.map(i => <button key={i.id} aria-pressed={selected?.id === i.id} onClick={() => {setSelected(i);setBaseSelected(false);setPurchase(null);}}>{itemSupported(i.academy_asset) ? <img src={gameAsset(i.asset_url || i.academy_asset!)} alt="" /> : <span>◇</span>}<strong>{i.name}</strong><small>{data.items.some(o => o.item_id===i.id) ? '소장 중' : `${i.price} 코인`}</small></button>)}</div>
          {!filtered.length && <p>아직 이 칸에 소장한 물건이 없어요. 공방 주문서에서 마음에 드는 물건을 골라보세요.</p>}
          {baseSelected && category !== 'legacy' && <div className={css.itemDetail}><h3>{category === 'room' ? '기본 방' : `${workshopSlots[category].replace(' 의상 · 헤어', '')}의 기본 의상`}</h3><p>{category === 'room' ? '처음 들어왔을 때의 방 모습이에요.' : '아카데미에 처음 왔을 때의 모습이에요. 언제든 이 모습으로 돌아올 수 있어요.'}</p>{equippedInSlot ? <button disabled={readOnly || busy} onClick={() => void write('unequip', { item_id: equippedInSlot.item_id })}>{category === 'room' ? '기본 방으로 되돌리기' : '기본 의상으로 갈아입기'}</button> : <small>지금 이 모습이에요.</small>}</div>}
          {selected && <div className={css.itemDetail}><h3>{selected.name}</h3><p>{selected.description}</p>{itemSupported(selected.academy_asset) && <>{!owned && selected.is_commissioner ? <button disabled={busy} onClick={() => { setShopMode('orders'); changeView('shop'); }}>내 작품은 배송함에서 수령하기</button> : owned ? <button disabled={readOnly || busy} onClick={() => void write(owned.is_equipped ? 'unequip' : 'equip',{item_id:selected.id})}>{owned.is_equipped ? '기본 모습으로 돌아가기' : selected.academy_slot === 'room' ? '방에 적용하기' : '이 의상 입기'}</button> : <button disabled={readOnly || busy || data.coins < selected.price} onClick={() => setPurchase(selected)}>{data.coins < selected.price ? '코인이 조금 더 필요해요' : `${selected.price}코인으로 주문하기`}</button>}</>}
          {purchase && <div className={css.confirm}><p>{purchase.name}을 주문하면 {purchase.price}코인이 사용돼요. 주문할까요?</p><button disabled={busy || readOnly} onClick={async () => {if(await write('purchase',{item_id:purchase.id,expected_price:purchase.price}))setPurchase(null);}}>주문 확정</button><button disabled={busy} onClick={() => setPurchase(null)}>다시 살펴보기</button></div>}</div>}
        </div>
      </div>}
    </>}
    {view !== 'planner' && <nav className={css.dock} aria-label="꾸미기와 공방 메뉴">
      <button disabled={busy} aria-pressed={view === 'wardrobe'} onClick={() => changeView('wardrobe')}><span aria-hidden="true">♧</span>옷장 · 방 꾸미기</button>
      <button disabled={busy} aria-pressed={view === 'shop'} onClick={() => changeView('shop')}><span aria-hidden="true">♜</span>공방 주문서</button>
    </nav>}
    {(error || message) && <p className={css.feedback} role={error ? 'alert' : 'status'}>{error || message}</p>}
  </ScenePanel>;
}
