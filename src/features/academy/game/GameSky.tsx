import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScenePanel } from './GameSurface';
import { fetchDormitory } from './dormitoryService';
import { seoulDay } from './dormitoryModel';
import { writeSky, type SkyPlacement } from './skyService';
import { belongsEdges, buildSkyNodes, clusters, DEFAULT_SKY_FILTER, normalizePosition, type SkyEdge, type SkyFilter, type SkyNode } from './skyGraph';
import { GOAL_LABELS } from '@/features/planner/plannerModel';
import { useSkySimulation } from './useSkySimulation';
import styles from './game.module.css';
import css from './sky.module.css';

/**
 * 창가의 하늘 — **노력의 지식그래프** (2026-10-02 개편).
 *
 * 하늘은 하나다. 목표가 큰 별, 계획이 작은 별, 실천을 남기면 켜지고 되풀이하면 밝아진다.
 * 옵시디언의 그래프처럼 별을 끌면 이어진 별이 따라오고(d3-force), 뜻이 비슷한 별끼리는
 * 임베딩 유사도의 끌림(점선)으로 모인다. 자리를 저장하지 않는다 — 배치는 살아 있는 물리이고
 * 학생이 쌓는 것은 자리가 아니라 실천이다. 종전의 «여러 하늘 × 별자리 그리기»(격자·별 놓기·
 * 두 별 잇기)는 걷어냈다(`docs/features/academy-sky-planner.md` §11).
 *
 * 왼쪽 위 = 보는 방식·찾기·거르기, 왼쪽 아래 = 범례, 오른쪽 아래 = 고른 별의 기록
 * (망원경 지도와 같은 자리 규칙·같은 색).
 */
const ZOOM_MIN = 0.35, ZOOM_MAX = 3, ZOOM_STEP = 1.3;
const nodeColor = (n: SkyNode) => `hsl(${n.hue} ${n.kind === 'goal' ? 62 : 70}% ${n.kind === 'goal' ? 76 : 70}%)`;
const shortTitle = (title: string, max: number) => (title.length > max ? `${title.slice(0, max - 1)}…` : title);
interface Transform { k: number; x: number; y: number }

export function GameSky({ userId, studentId, readOnly, reduced, onClose, nameGoalId, onPlaced, onChapterReturn, backLabel = '← 플래너로 돌아가기' }: {
  userId: string; studentId: string | null; readOnly: boolean; reduced: boolean; onClose: () => void; backLabel?: string;
  nameGoalId?: string | null; onPlaced?: (placement: SkyPlacement) => Promise<void>; onChapterReturn?: () => void;
}) {
  const cache = useQueryClient(), lock = useRef(false);
  const query = useQuery({ queryKey: ['academy-dormitory', userId, readOnly, studentId, seoulDay()], queryFn: () => fetchDormitory(seoulDay(), readOnly ? studentId : null) });
  const goals = useMemo(() => query.data?.goals ?? [], [query.data?.goals]);
  const plans = useMemo(() => query.data?.plans ?? [], [query.data?.plans]);
  const [filter, setFilter] = useState<SkyFilter>(DEFAULT_SKY_FILTER);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(nameGoalId ? `goal:${nameGoalId}` : null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const nodes = useMemo(() => buildSkyNodes(goals, plans, filter), [goals, plans, filter]);
  const nodeById = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
  const structure = useMemo(() => belongsEdges(nodes), [nodes]);
  // 선은 구조만(계획 → 목표, 단기 → 장기) — 뜻이 비슷한 별을 잇던 임베딩 끌림은 2026-10-03 에 걷었다(skyGraph.ts 머리글).
  const edges = structure;
  const groups = useMemo(() => clusters(nodes, edges), [nodes, edges]);
  const clusterCount = useMemo(() => new Set(groups.values()).size, [groups]);

  const board = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 960, height: 560 });
  useLayoutEffect(() => {
    const el = board.current;
    if (!el) return;
    const measure = () => { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) setSize({ width: Math.round(r.width), height: Math.round(r.height) }); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const sim = useSkySimulation(nodes, edges, size, reduced);
  const positions = sim.positions();
  void sim.version;

  const [transform, setTransform] = useState<Transform>({ k: 1, x: 0, y: 0 });
  const fit = useCallback(() => {
    const points = [...positions.values()].filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (!points.length) { setTransform({ k: 1, x: 0, y: 0 }); return; }
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const p of points) { x1 = Math.min(x1, p.x! - 40); y1 = Math.min(y1, p.y! - 40); x2 = Math.max(x2, p.x! + 40); y2 = Math.max(y2, p.y! + 40); }
    const k = Math.max(ZOOM_MIN, Math.min(1.6, Math.min(size.width / (x2 - x1), size.height / (y2 - y1))));
    setTransform({ k, x: size.width / 2 - k * (x1 + x2) / 2, y: size.height / 2 - k * (y1 + y2) / 2 });
  }, [positions, size.width, size.height]);
  const fitRef = useRef(fit); fitRef.current = fit;
  const nodeKey = nodes.map(n => n.id).join('|');
  // 처음 그릴 때와 별 목록이 바뀔 때 한 번 전체 보기 — 물리가 자리를 잡은 뒤에(동작 줄이기는 즉시).
  useEffect(() => {
    if (!nodeKey) return;
    const timer = window.setTimeout(() => fitRef.current(), reduced ? 30 : 1100);
    return () => window.clearTimeout(timer);
  }, [nodeKey, reduced]);
  // 틀 크기가 바뀌면(휴대폰 회전·창 크기) 다시 전체 보기 — 안 그러면 별이 화면 밖에 남는다.
  useEffect(() => { const timer = window.setTimeout(() => fitRef.current(), reduced ? 30 : 500); return () => window.clearTimeout(timer); }, [size.width, size.height, reduced]);
  const centerOn = useCallback((id: string) => {
    const p = positions.get(id);
    if (!p || p.x == null || p.y == null) return;
    setTransform(t => ({ k: Math.max(t.k, 1), x: size.width / 2 - Math.max(t.k, 1) * p.x!, y: size.height / 2 - Math.max(t.k, 1) * p.y! }));
  }, [positions, size.width, size.height]);
  const zoomAt = useCallback((factor: number, at: { x: number; y: number }) => {
    setTransform(t => { const k = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, t.k * factor)); return { k, x: at.x - (at.x - t.x) * (k / t.k), y: at.y - (at.y - t.y) * (k / t.k) }; });
  }, []);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const r = el.getBoundingClientRect(); zoomAt(e.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP, { x: e.clientX - r.left, y: e.clientY - r.top }); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // 끌기·이동. 별 위에서 시작하면 그 별을 끌고(물리가 따라온다), 빈 하늘이면 화면을 민다.
  const gesture = useRef<{ kind: 'node' | 'pan'; id?: string; startX: number; startY: number; moved: boolean; origin: Transform } | null>(null);
  const [panning, setPanning] = useState(false);
  const toSim = useCallback((clientX: number, clientY: number, t: Transform) => { const r = svg.current!.getBoundingClientRect(); return { x: (clientX - r.left - t.x) / t.k, y: (clientY - r.top - t.y) / t.k }; }, []);
  const transformRef = useRef(transform); transformRef.current = transform;
  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const target = (e.target as Element).closest<SVGGElement>('[data-node]');
    gesture.current = { kind: target ? 'node' : 'pan', id: target?.dataset.node, startX: e.clientX, startY: e.clientY, moved: false, origin: transformRef.current };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.startX, dy = e.clientY - g.startY;
    if (!g.moved && Math.hypot(dx, dy) < 4) return;
    if (g.kind === 'node' && g.id) {
      const p = toSim(e.clientX, e.clientY, transformRef.current);
      if (!g.moved) sim.dragStart(g.id, p.x, p.y); else sim.dragMove(g.id, p.x, p.y);
    } else { if (!g.moved) setPanning(true); setTransform({ ...g.origin, x: g.origin.x + dx, y: g.origin.y + dy }); }
    g.moved = true;
  }
  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const g = gesture.current; gesture.current = null; setPanning(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!g) return;
    if (g.kind === 'node' && g.id) { if (g.moved) sim.dragEnd(g.id); else select(g.id); }
  }
  function select(id: string | null) { setSelected(current => (current === id ? null : id)); setError(''); }

  const node = selected ? nodeById.get(selected) ?? null : null;
  const goal = node ? goals.find(g => g.id === (node.kind === 'goal' ? node.ref : node.goalId)) : undefined;
  const plan = node?.kind === 'plan' ? plans.find(p => p.id === node.ref) : undefined;
  useEffect(() => { setName(goal?.constellation_name ?? ''); }, [goal?.id, goal?.constellation_name]);
  useEffect(() => { if (selected && !nodeById.has(selected)) setSelected(null); }, [selected, nodeById]);
  const neighbors = useMemo(() => {
    if (!node) return null;
    const set = new Set<string>([node.id]);
    for (const e of edges) { if (e.source === node.id) set.add(e.target); if (e.target === node.id) set.add(e.source); }
    return set;
  }, [node, edges]);
  const linkedGoals = useMemo(() => (node?.kind === 'goal' ? nodes.filter(n => n.kind === 'goal' && n.id !== node.id && (n.parentGoalId === node.ref || node.parentGoalId === n.ref)) : []), [node, nodes]);
  const hits = useMemo(() => { const q = search.trim().toLocaleLowerCase(); return q ? nodes.filter(n => n.title.toLocaleLowerCase().includes(q) || (n.goalTitle ?? '').toLocaleLowerCase().includes(q)).slice(0, 8) : []; }, [search, nodes]);

  async function mutate(work: () => Promise<unknown>, done = '하늘에 기록했어요.') {
    if (readOnly || lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try { await work(); setMessage(done); }
    catch (e) { setError((e as Error).message); }
    finally {
      await Promise.all([cache.invalidateQueries({ queryKey: ['academy-dormitory', userId] }), cache.invalidateQueries({ queryKey: ['academy-chapter', userId] })]);
      lock.current = false; setBusy(false);
    }
  }
  const litCount = nodes.filter(n => n.kind === 'plan' && n.lit).length, planCount = nodes.filter(n => n.kind === 'plan').length, goalCount = nodes.filter(n => n.kind === 'goal').length;
  const showPlanLabels = nodes.length <= 80 || transform.k >= 1.1;
  const toggleFilter = (key: keyof SkyFilter) => setFilter(f => ({ ...f, [key]: !f[key] }));

  return <ScenePanel title="창가의 하늘" backLabel={backLabel} onClose={() => { if (!busy) onClose(); }} reduced={reduced} className={css.skyScene}>
    <header className={styles.facilityHeader}><div><span className={styles.kicker}>RIA'S WINDOW · 노력의 하늘</span><h2>창가의 하늘 · 나의 노력이 모이는 곳</h2><p>“작은 실천은 겉으로 드러나든 아니든 리아의 일부가 된단다.”</p></div></header>
    {readOnly && <p className={css.notice}>학생 시점 열람 · 별은 본인의 실천으로만 켜져요.</p>}
    <div ref={board} className={css.board} data-reduced={reduced} aria-label="나의 노력의 하늘">
      {query.isPending ? <p className={css.empty} role="status">하늘의 기록을 읽고 있어요…</p> : query.isError ? <p className={css.empty} role="alert">{query.error.message} <button className={css.quiet} onClick={() => void query.refetch()}>다시 읽기</button></p> : <>
        <svg ref={svg} className={css.sky} data-panning={panning} role="application" aria-label="목표와 계획의 별 지도 — 별을 끌어 옮기고, 눌러 기록을 봅니다" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
            <g>{edges.map(e => { const a = positions.get(e.source), b = positions.get(e.target); if (!a || !b || a.x == null || b.x == null) return null; return <line key={e.id} className={`${css.edge} ${e.kind === 'part' ? css.part : css.belongs}`} data-dim={!!neighbors && !(neighbors.has(e.source) && neighbors.has(e.target))} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={(e.kind === 'part' ? 2.2 : 1) / Math.sqrt(transform.k)} />; })}</g>
            <g>{nodes.map(n => { const p = positions.get(n.id); if (!p || p.x == null || p.y == null) return null; const color = nodeColor(n); const label = n.kind === 'goal' ? shortTitle(n.title, 22) : shortTitle(n.title, 16); const showLabel = n.kind === 'goal' || showPlanLabels || selected === n.id || !!neighbors?.has(n.id);
              return <g key={n.id} data-node={n.id} data-kind={n.kind} data-horizon={n.kind === 'goal' ? n.horizon : undefined} data-lit={n.lit} data-named={!!n.constellationName} data-archived={n.archived} data-selected={selected === n.id} data-dim={!!neighbors && !neighbors.has(n.id)} className={css.node} transform={`translate(${p.x} ${p.y})`} tabIndex={0} role="button" aria-pressed={selected === n.id} aria-label={`${n.kind === 'goal' ? (n.horizon === 'long' ? GOAL_LABELS.long : '목표') : '계획'} · ${n.title}${n.kind === 'plan' ? ` · ${n.practiceCount}회 실천` : ''}`} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(n.id); } }} style={{ '--c': color } as CSSProperties}>
                <circle className={css.glow} r={n.radius * (n.kind === 'goal' ? 2.1 : 2.4)} fill={color} />
                <circle className={css.ring} r={n.radius + 6} />
                {n.kind === 'goal' && n.horizon === 'long' && <circle className={css.longRing} r={n.radius + 11} />}
                <circle className={css.core} r={n.radius} fill={color} />
                {n.kind === 'goal' && <text className={css.glyph} y={n.radius * 0.33} fontSize={n.radius * 0.95} aria-hidden="true">✦</text>}
                {n.kind === 'plan' && n.priority === 'high' && n.lit && <text className={css.glyph} y={n.radius * 0.36} fontSize={Math.max(8, n.radius * 1.05)} aria-hidden="true">★</text>}
                {showLabel && <text className={css.label} y={n.radius + 13 / transform.k} fontSize={(n.kind === 'goal' ? 13 : 11) / transform.k} aria-hidden="true">{label}</text>}
              </g>; })}</g>
          </g>
        </svg>
        {!nodes.length && <div className={css.empty}><h3>아직 켜진 별이 없어요.</h3><p>플래너에서 목표와 계획을 적고 실천을 남기면 이 하늘에 별이 켜져요.</p></div>}
        <div className={css.chrome}>
          <div className={css.toolbar}>
            <button type="button" className={`${css.tool} ${css.iconTool}`} title="확대" aria-label="확대" onClick={() => zoomAt(ZOOM_STEP, { x: size.width / 2, y: size.height / 2 })}>＋</button>
            <button type="button" className={`${css.tool} ${css.iconTool}`} title="축소" aria-label="축소" onClick={() => zoomAt(1 / ZOOM_STEP, { x: size.width / 2, y: size.height / 2 })}>－</button>
            <button type="button" className={css.tool} onClick={fit}>전체 보기</button>
            <button type="button" className={css.tool} title="자리를 잊고 처음부터 다시 모은다" onClick={() => { sim.reheat(); window.setTimeout(() => fitRef.current(), reduced ? 30 : 1100); }}>다시 모으기</button>
          </div>
          <div className={css.searchBox}><input type="search" value={search} placeholder="별 찾기 · 목표·계획 이름" aria-label="별 찾기" onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && hits[0]) { setSelected(hits[0].id); centerOn(hits[0].id); } if (e.key === 'Escape') setSearch(''); }} />{search && <button type="button" aria-label="검색 지우기" onClick={() => setSearch('')}>×</button>}</div>
          {search && <div className={css.hits}>{hits.map(h => <button key={h.id} type="button" onClick={() => { setSelected(h.id); centerOn(h.id); }}><span style={{ background: nodeColor(h) }} /><span>{h.title}</span><small>{h.kind === 'goal' ? '목표' : h.lit ? `${h.practiceCount}회` : '아직'}</small></button>)}{!hits.length && <p>이 이름의 별을 찾지 못했어요.</p>}</div>}
          <div className={css.toolbar}>
            <button type="button" className={css.tool} aria-pressed={filter.showUnlit} onClick={() => toggleFilter('showUnlit')}>안 켜진 별</button>
            <button type="button" className={css.tool} aria-pressed={filter.showArchived} onClick={() => toggleFilter('showArchived')}>보관한 것</button>
          </div>
        </div>
        <div className={css.legend} aria-label="범례">
          <strong>목표 {goalCount} · 별 {planCount} · 켜진 별 {litCount} · 별무리 {clusterCount}</strong>
          <span className={css.row}><span className={css.dot} data-goal="" data-long="" />가장 큰 별 = {GOAL_LABELS.long} · 큰 별 = {GOAL_LABELS.short} · 금테 = 이름 붙인 목표</span>
          <span className={css.row}><span className={css.dot} />별 = 계획 · 밝고 클수록 실천이 많아요</span>
          <span className={css.row}><span className={css.dot} data-unlit="" />점선 테두리 = 아직 실천 전</span>
          <span className={css.row}><span className={css.line} data-solid="" />목표와 계획 · <span className={css.line} data-part="" />{GOAL_LABELS.long}와 {GOAL_LABELS.short}</span>
          <span className={css.status}>선 = 내가 정한 연결(어느 목표의 계획인지, 어느 장기 목표의 걸음인지)</span>
        </div>
        {onPlaced && !readOnly && <p className={css.banner} role="status">실천의 빛이 들어온 별을 눌러 「나의 첫 별로 새기기」를 골라 보세요.</p>}
        {node && <aside className={styles.graphDetail} aria-label={node.kind === 'goal' ? '목표의 기록' : '별의 기록'} data-kind={node.kind}>
          <header>
            <span className={styles.kicker}>{node.kind === 'goal' ? `목표 · 계획 ${plans.filter(p => p.goal_id === node.ref && !p.is_archived).length}개 · 실천 ${node.practiceCount}회${node.completed ? ' · 완료' : ''}${node.archived ? ' · 보관' : ''}` : `별 · ${node.goalTitle ?? '목표 없는 계획'} · ${node.lit ? `${node.practiceCount}회 실천 · 밝기 ${node.brightness.toFixed(1)}` : '아직 실천 전'}${node.archived ? ' · 보관' : ''}`}</span>
            <h3>{node.title}</h3>
            <button type="button" aria-label="기록 닫기" title="닫기" onClick={() => setSelected(null)}>×</button>
          </header>
          <div className={styles.graphDetailBody}>
            {node.kind === 'goal' && <p>{goal?.description || '이 목표를 세운 이유는 아직 적지 않았어요.'}</p>}
            {node.kind === 'plan' && (plan?.records.length ? <ul className={css.records}>{plan.records.map(r => <li key={r.id}><time>{r.date}</time><span>{r.feedback || '이 날의 피드백은 아직 없어요.'}</span></li>)}</ul> : <p>아직 실천 기록이 없어요. 플래너에서 실천을 표시하면 이 별이 켜져요.</p>)}
            {!!linkedGoals.length && <div className={css.kinList}><small>{node.horizon === 'long' ? '묶인 ' + GOAL_LABELS.short : '이 목표가 가는 ' + GOAL_LABELS.long}</small>{linkedGoals.map(other => { const k = other; return <button key={k.id} type="button" onClick={() => { setSelected(k.id); centerOn(k.id); }}><span style={{ background: nodeColor(other) }} /><span>{other.title}</span><small>{other.lit ? '켜짐' : '실천 전'}</small></button>; })}</div>}
            <div className={css.detailActions}>
              {onPlaced && node.kind === 'plan' && node.lit && !readOnly && <button type="button" className={css.gold} disabled={busy} onClick={() => void mutate(async () => { const p = positions.get(node.id); const at = normalizePosition(p?.x ?? size.width / 2, p?.y ?? size.height / 2, size.width, size.height); const g = positions.get(`goal:${node.goalId}`); const gat = normalizePosition(g?.x ?? size.width / 2, g?.y ?? size.height / 2, size.width, size.height); await onPlaced({ plan_id: node.ref, x: at.x, y: at.y, goal_x: gat.x, goal_y: gat.y }); }, '첫 별을 새겼어요.')}>{plan?.sky_x != null ? '새긴 별로 이야기 이어가기' : '이 별을 나의 첫 별로 새기기'}</button>}
              {node.kind === 'goal' && goal?.is_completed && !goal.is_archived && !readOnly && <form onSubmit={e => { e.preventDefault(); void mutate(() => writeSky('name', goal, { name }), '별무리에 이름을 붙였어요.'); }}><label>별무리 이름<input autoFocus={nameGoalId === goal.id} required maxLength={60} value={name} disabled={busy} onChange={e => setName(e.target.value)} /></label><button type="submit" className={css.gold} disabled={busy || !name.trim() || name.trim() === (goal.constellation_name ?? '')}>{goal.constellation_name ? '이름 바꾸기' : '이름 붙여 금빛으로 남기기'}</button><small>마친 목표에 이름을 붙이면 큰 별이 금빛으로 남아요.</small></form>}
              {node.archived && <small>보관한 목표예요. 플래너에서 다시 꺼내면 별이 다시 또렷해져요.</small>}
            </div>
          </div>
        </aside>}
      </>}
    </div>
    <footer className={css.footer}><p role="status">{busy ? '하늘에 기록하는 중…' : message}</p>{onChapterReturn && <button type="button" className={css.quiet} disabled={busy} onClick={onChapterReturn}>세린과 이야기 이어가기</button>}</footer>
    {error && <p className={css.error} role="alert">{error}</p>}
  </ScenePanel>;
}
