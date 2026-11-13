import type { Placement, TimetableInput } from '../types';
import type { ConflictGraph } from './conflictGraph';
import type { Rng } from './rng';
import { type CellKey, cellKeyStr, enumerateCells } from './csp';
import { evaluateSoft, placementsToMap, type ScoreContext } from './score';
import { adjacentPairsMask, runExcessMask, type TeacherHardConfig } from './teacherConstraints';

// ─────────────────────────────────────────────────────────────────────────────
// 교사 일일 부하 재배치 (0충돌-보존 후처리)
//
// 배경: 슬랙0(avail=χ) 실데이터에서는 0충돌 보드가 모든 색을 꽉 채워, 단일 이동/스왑이
// 거의 전부 하드충돌을 새로 만든다(검증됨 — SA는 가중치 500에서도 보드를 못 움직임). 따라서
// 교사 하루 부하·연속 같은 소프트 목표는 SA로 개선 불가다.
//
// 유일하게 작동하는 무브 = **Kempe 체인**: 두 칸(색) X·Y로 유도된 부분그래프의 교대 연결성분을
// 통째로 X↔Y로 뒤집는다. 이는 적정 채색을 *수학적으로 보존*하므로(인접 정점은 여전히 다른 색)
// 학생·교사·교실 충돌을 0으로 유지한 채 보드를 움직일 수 있다. 그 자유도로 교사 하루 부하(상한
// 초과)+3연속을 탐욕적으로 줄인다.
//
// 안전성: Kempe는 그래프 충돌을 보존하고, 추가로 (1) 고정(pinned)·도메인(차단 칸) 위반 플립은
// 거부, (2) 같은 과목 하루 한도(subjectDailyCap)가 깨지는 플립은 거부, (3) 호출부(solver)가 최종
// 하드충돌을 재검증해 증가 시 원본 placements를 쓴다. → 0충돌은 절대 깨지지 않는다.
//
// 교사×요일 점유 교시는 **multiset(period→count)** 으로 추적한다. 멀티-무브 Kempe 도중 한 교사가
// 같은 요일 같은 교시에 일시적으로 겹칠 수 있어(양쪽 칸의 lesson이 같은 체인에 포함), 단순 Set은
// transient 충돌로 카운트가 오염된다. multiset은 정확하다.
// ─────────────────────────────────────────────────────────────────────────────

type PeriodCount = Map<number, number>; // period -> count (multiset)

interface RModel {
  cells: CellKey[];
  cellDay: Int32Array;
  cellPeriod: Int32Array;
  cellCount: number;
  days: number;
  ids: string[]; // 전체 lesson (movable+pinned)
  idIndex: Map<string, number>;
  movable: Uint8Array;
  domainSet: Uint8Array[]; // [lesson][cell] 1=허용
  adj: number[][];
  teacher: Int32Array; // lesson -> 교사 키 정수 (-1 없음)
  offering: Int32Array; // lesson -> offering 정수
  offeringCount: number;
  capOn: boolean;
  maxPer: number;
  cap: number; // 교사 하루 상한
  maxRun: number; // 교사 연속 상한
  wLoad: number;
  wConsec: number;
}

interface RState {
  model: RModel;
  color: Int32Array; // lesson -> cell idx
  // 교사×요일 점유 교시 multiset (key = teacher*days+day)
  tdPeriods: Map<number, PeriodCount>;
  offeringDay: Int32Array; // offering*days+day 카운트 (cap 검사)
}

/** present 교시(count>0)에서 연속 런이 maxRun을 넘는 칸 수 합 (score.ts 정의와 동일) */
function consecutiveExcess(present: number[], maxRun: number): number {
  if (present.length <= maxRun) return 0;
  const sorted = [...present].sort((a, b) => a - b);
  let excess = 0;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) run++;
    else {
      if (run > maxRun) excess += run - maxRun;
      run = 1;
    }
  }
  if (run > maxRun) excess += run - maxRun;
  return excess;
}

/** 한 (교사,요일) multiset의 벌점 = wLoad*초과 + wConsec*연속초과 */
function tdPenalty(pc: PeriodCount | undefined, m: RModel): number {
  if (!pc || pc.size === 0) return 0;
  const present: number[] = [];
  for (const [p, c] of pc) if (c > 0) present.push(p);
  if (present.length === 0) return 0;
  const over = present.length > m.cap ? present.length - m.cap : 0;
  return over * m.wLoad + consecutiveExcess(present, m.maxRun) * m.wConsec;
}

function buildModel(input: TimetableInput, graph: ConflictGraph): RModel {
  const cells = enumerateCells(input.grid);
  const cellCount = cells.length;
  const cellDay = new Int32Array(cellCount);
  const cellPeriod = new Int32Array(cellCount);
  for (let c = 0; c < cellCount; c++) {
    cellDay[c] = cells[c].dayIndex;
    cellPeriod[c] = cells[c].period;
  }
  const days = input.grid.days;

  const ids = graph.lessons.map((l) => l.id);
  const idIndex = new Map<string, number>();
  ids.forEach((id, i) => idIndex.set(id, i));
  const n = ids.length;

  const pinnedIds = new Set(input.pinned.map((p) => p.lessonId));
  const movable = new Uint8Array(n);
  const domainSet: Uint8Array[] = [];
  for (let i = 0; i < n; i++) {
    const l = graph.byLessonId.get(ids[i])!;
    movable[i] = pinnedIds.has(ids[i]) ? 0 : 1;
    const mask = new Uint8Array(cellCount);
    const blocked = new Set(l.blockedCells);
    for (let c = 0; c < cellCount; c++) if (!blocked.has(cellKeyStr(cells[c]))) mask[c] = 1;
    domainSet.push(mask);
  }

  const adj: number[][] = [];
  for (let i = 0; i < n; i++) {
    const set = graph.adjacency.get(ids[i]);
    const arr: number[] = [];
    if (set) for (const nb of set) { const j = idIndex.get(nb); if (j !== undefined) arr.push(j); }
    adj.push(arr);
  }

  const tIndex = new Map<string, number>();
  const teacher = new Int32Array(n);
  const offIndex = new Map<string, number>();
  const offering = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const l = graph.byLessonId.get(ids[i])!;
    if (l.teacherId) {
      let ti = tIndex.get(l.teacherId);
      if (ti === undefined) { ti = tIndex.size; tIndex.set(l.teacherId, ti); }
      teacher[i] = ti;
    } else teacher[i] = -1;
    let oi = offIndex.get(l.offeringId);
    if (oi === undefined) { oi = offIndex.size; offIndex.set(l.offeringId, oi); }
    offering[i] = oi;
  }

  return {
    cells, cellDay, cellPeriod, cellCount, days,
    ids, idIndex, movable, domainSet, adj,
    teacher, offering, offeringCount: offIndex.size,
    capOn: input.options.hard.subjectDailyCap,
    maxPer: input.options.maxPerSubjectPerDay,
    cap: input.options.maxPerTeacherPerDay ?? 4,
    maxRun: input.options.maxConsecutivePerTeacher ?? 2,
    wLoad: input.weights.teacherDailyLoad,
    wConsec: input.weights.teacherConsecutive,
  };
}

/** placements → 초기 상태. 미배치 lesson이 있으면 null (안전: 재배치 포기) */
function buildState(model: RModel, placements: Placement[]): RState | null {
  const color = new Int32Array(model.ids.length).fill(-1);
  const cellIndex = new Map<string, number>();
  for (let c = 0; c < model.cellCount; c++) cellIndex.set(cellKeyStr(model.cells[c]), c);
  for (const p of placements) {
    const i = model.idIndex.get(p.lessonId);
    const c = cellIndex.get(`${p.dayIndex}|${p.period}`);
    if (i !== undefined && c !== undefined) color[i] = c;
  }
  const tdPeriods = new Map<number, PeriodCount>();
  const offeringDay = new Int32Array(model.offeringCount * model.days);
  for (let i = 0; i < model.ids.length; i++) {
    const c = color[i];
    if (c < 0) return null;
    const day = model.cellDay[c];
    if (model.teacher[i] >= 0) addPeriod(tdPeriods, model.teacher[i] * model.days + day, model.cellPeriod[c]);
    offeringDay[model.offering[i] * model.days + day]++;
  }
  return { model, color, tdPeriods, offeringDay };
}

function addPeriod(map: Map<number, PeriodCount>, key: number, period: number): void {
  let pc = map.get(key);
  if (!pc) { pc = new Map(); map.set(key, pc); }
  pc.set(period, (pc.get(period) ?? 0) + 1);
}

function delPeriod(map: Map<number, PeriodCount>, key: number, period: number): void {
  const pc = map.get(key);
  if (!pc) return;
  const n = (pc.get(period) ?? 0) - 1;
  if (n <= 0) pc.delete(period);
  else pc.set(period, n);
}

/** lesson i를 칸 to로 이동 (tdPeriods·offeringDay 증분 갱신) */
function moveLesson(s: RState, i: number, to: number): void {
  const m = s.model;
  const from = s.color[i];
  if (from === to) return;
  const dFrom = m.cellDay[from];
  const dTo = m.cellDay[to];
  if (m.teacher[i] >= 0) {
    delPeriod(s.tdPeriods, m.teacher[i] * m.days + dFrom, m.cellPeriod[from]);
    addPeriod(s.tdPeriods, m.teacher[i] * m.days + dTo, m.cellPeriod[to]);
  }
  s.offeringDay[m.offering[i] * m.days + dFrom]--;
  s.offeringDay[m.offering[i] * m.days + dTo]++;
  s.color[i] = to;
}

/**
 * seed에서 칸 cellX↔cellY Kempe 체인을 구성해 플립 적용.
 * 성공 시 touched·oldCells 반환, 실패(고정 포함·도메인 위반·체인 초과)면 null.
 * 그래프 충돌(채색)은 보존되며 cap은 호출부에서 검사한다.
 */
function applyKempe(
  s: RState, seed: number, cellX: number, cellY: number, maxChain: number,
): { touched: number[]; oldCells: number[] } | null {
  const m = s.model;
  if (cellX === cellY) return null;
  const inChain = new Set<number>([seed]);
  const queue = [seed];
  let guard = 0;
  while (queue.length > 0) {
    if (++guard > maxChain) return null;
    const cur = queue.shift()!;
    const curCell = s.color[cur];
    const other = curCell === cellX ? cellY : cellX;
    for (const j of m.adj[cur]) {
      if (inChain.has(j)) continue;
      if (s.color[j] === other) { inChain.add(j); queue.push(j); }
    }
  }
  const touched = [...inChain];
  const oldCells = touched.map((id) => s.color[id]);
  // 검증: 전부 movable, dest가 도메인 내
  for (let t = 0; t < touched.length; t++) {
    if (!m.movable[touched[t]]) return null;
    const dest = oldCells[t] === cellX ? cellY : cellX;
    if (m.domainSet[touched[t]][dest] === 0) return null;
  }
  for (let t = 0; t < touched.length; t++) {
    const dest = oldCells[t] === cellX ? cellY : cellX;
    moveLesson(s, touched[t], dest);
  }
  return { touched, oldCells };
}

function undoKempe(s: RState, touched: number[], oldCells: number[]): void {
  for (let k = touched.length - 1; k >= 0; k--) moveLesson(s, touched[k], oldCells[k]);
}

/** 영향받은 offering-day가 cap을 초과하는지 (subjectDailyCap 위반 검사) */
function capViolated(s: RState, offDayKeys: Set<number>): boolean {
  if (!s.model.capOn) return false;
  for (const k of offDayKeys) if (s.offeringDay[k] > s.model.maxPer) return true;
  return false;
}

function totalPenalty(s: RState): number {
  let sum = 0;
  for (const pc of s.tdPeriods.values()) sum += tdPenalty(pc, s.model);
  return sum;
}

/**
 * 교사 하루 부하·연속을 0충돌을 보존하며 줄인다. 개선이 없거나 예산 소진 시 종료.
 * 반환: 개선된 placements (개선 없거나 안전치 못하면 원본 그대로).
 */
export function rebalanceTeacherLoad(
  placements: Placement[],
  input: TimetableInput,
  graph: ConflictGraph,
  rng: Rng,
  budgetMs: number,
): Placement[] {
  const model = buildModel(input, graph);
  if (model.wLoad <= 0 && model.wConsec <= 0) return placements;
  const s = buildState(model, placements);
  if (!s) return placements;

  // 교사 부하 벌점이 이미 0이면 할 일 없음
  if (totalPenalty(s) === 0) return placements;

  // 수용 기준 = 전체 가중 soft 총합 (studentGap 등 포함). Kempe 무브로 이 총합을 줄인다.
  // → studentGap을 절대 악화시키지 않으면서(언덕오르기) 교사 부하를 net 이득일 때만 개선.
  const ctx: ScoreContext = { input, graph };
  const currentSoft = (): number => {
    const pl: Placement[] = [];
    for (let i = 0; i < model.ids.length; i++) {
      const c = s.color[i];
      pl.push({ lessonId: model.ids[i], dayIndex: model.cellDay[c], period: model.cellPeriod[c] });
    }
    return evaluateSoft(placementsToMap(pl), ctx).total;
  };
  let curSoft = currentSoft();

  const deadline = Date.now() + budgetMs;
  const maxChain = Math.min(40, Math.max(12, Math.round(model.ids.length * 0.06)));
  const plateauLimit = 600;
  let sinceImprove = 0;
  let iter = 0;

  while (Date.now() < deadline) {
    iter++;
    if ((iter & 0x3f) === 0 && Date.now() >= deadline) break;

    // 나쁜 (교사,요일) = cap 초과 또는 연속 초과
    const badKeys: number[] = [];
    for (const [k, pc] of s.tdPeriods) if (tdPenalty(pc, model) > 0) badKeys.push(k);
    if (badKeys.length === 0) break;

    const bk = badKeys[rng.int(badKeys.length)];
    const badDay = bk % model.days;
    const badTeacher = (bk - badDay) / model.days;

    // 그 교사-요일에 있는 lesson 중 하나를 seed로
    const seedCandidates: number[] = [];
    for (let i = 0; i < model.ids.length; i++) {
      if (model.movable[i] && model.teacher[i] === badTeacher && model.cellDay[s.color[i]] === badDay) {
        seedCandidates.push(i);
      }
    }
    if (seedCandidates.length === 0) { if (++sinceImprove > plateauLimit) break; continue; }
    const seed = seedCandidates[rng.int(seedCandidates.length)];
    const cellX = s.color[seed];

    // 목표 칸 Y = seed 도메인 중 "다른 요일" 칸, 그 교사가 덜 바쁜 요일 우선
    const dom: number[] = [];
    for (let c = 0; c < model.cellCount; c++) {
      if (model.domainSet[seed][c] && model.cellDay[c] !== badDay) dom.push(c);
    }
    if (dom.length === 0) { if (++sinceImprove > plateauLimit) break; continue; }
    dom.sort((a, b) => {
      const la = s.tdPeriods.get(badTeacher * model.days + model.cellDay[a])?.size ?? 0;
      const lb = s.tdPeriods.get(badTeacher * model.days + model.cellDay[b])?.size ?? 0;
      return la - lb;
    });

    let improved = false;
    for (let t = 0; t < Math.min(dom.length, 8); t++) {
      const k = applyKempe(s, seed, cellX, dom[t], maxChain);
      if (!k) continue;
      const offKeys = new Set<number>();
      for (let idx = 0; idx < k.touched.length; idx++) {
        const id = k.touched[idx];
        offKeys.add(model.offering[id] * model.days + model.cellDay[k.oldCells[idx]]);
        offKeys.add(model.offering[id] * model.days + model.cellDay[s.color[id]]);
      }
      if (capViolated(s, offKeys)) { undoKempe(s, k.touched, k.oldCells); continue; }
      const after = currentSoft();
      // 전체 soft 총합이 줄어드는 플립만 수용 (studentGap 악화 시 자동 거부 = 언덕오르기)
      if (after < curSoft - 1e-9) {
        curSoft = after;
        sinceImprove = 0;
        improved = true;
        break;
      }
      undoKempe(s, k.touched, k.oldCells);
    }
    if (totalPenalty(s) === 0) break;
    if (!improved && ++sinceImprove > plateauLimit) break;
  }

  const out: Placement[] = [];
  for (let i = 0; i < model.ids.length; i++) {
    const c = s.color[i];
    out.push({ lessonId: model.ids[i], dayIndex: model.cellDay[c], period: model.cellPeriod[c] });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 하드 4종 조이기 (relax-then-tighten의 tighten 단계)
//
// 완화(부하 4종 OFF) 해는 기본충돌 0이지만 부하 위반이 수십~수백 남는다. 슬랙0
// 보드에서 단일이동/스왑은 즉시 기본충돌을 만들므로(문서화된 SA 무력), 여기서도
// 유일 레버는 **Kempe 체인**이다. rebalanceTeacherLoad와 달리 목표가 soft 총합이
// 아니라 **하드 4종 위반 수 자체**: 위반 수가 줄면 무조건 수용(soft는 부차),
// 동률이면 soft 총합이 줄 때만 수용. 채색은 Kempe가 보존하고 subjectDailyCap·
// 도메인·고정은 명시 검사한다 — 기본충돌 0이 절대 깨지지 않는다.
// ─────────────────────────────────────────────────────────────────────────────

export interface TightenResult {
  placements: Placement[];
  /** 분반 구성원 교체가 있었으면 offeringId → 갱신 명단 (없으면 null) */
  rosters: Map<string, string[]> | null;
}

export function tightenTeacherHard(
  placements: Placement[],
  input: TimetableInput,
  /** 하드 4종 의미론 — 완화 입력이 아니라 **원 입력** 기준 cfg를 넘길 것 */
  cfg: TeacherHardConfig,
  graph: ConflictGraph,
  rng: Rng,
  budgetMs: number,
): TightenResult {
  if (!cfg.any) return { placements, rosters: null };
  const model = buildModel(input, graph);
  const s = buildState(model, placements);
  if (!s) return { placements, rosters: null };

  const n = model.ids.length;
  let teacherCount = 0;
  for (let i = 0; i < n; i++) if (model.teacher[i] >= 0) teacherCount = Math.max(teacherCount, model.teacher[i] + 1);
  const lessonsOfT: number[][] = Array.from({ length: teacherCount }, () => []);
  const offId: string[] = new Array(n).fill('');
  for (let i = 0; i < n; i++) {
    const l = graph.byLessonId.get(model.ids[i]);
    offId[i] = l?.offeringId ?? '';
    if (model.teacher[i] >= 0) lessonsOfT[model.teacher[i]].push(i);
  }

  // ── 분반 구성원 교체(resection) 준비 ──────────────────────────────
  // 위반 교사의 선택과목 수업을 칸 C로 옮기고 싶은데 학생 충돌로 막힌 경우, 막는 학생을
  // **같은 과목의 다른 분반**으로 이적시키면 간선이 재배선되어 이동이 열린다 (사용자 제안).
  // 균형: 각 분반 인원은 초기 편성에서 ±maxShift 이내. 교체는 위반이 실제로 줄 때만 수용.
  // 명단은 탐색용 witness — 확정/미리보기의 최종 명단은 sectionStudents(부하 균형 배정)가
  // placements에서 재유도한다.
  const maxShift = input.options.maxResectionShift ?? 2;
  const resectionOn = maxShift > 0 && !input.options.hard.roomConflict; // room 하드는 미지원(보수)
  const offOf: string[] = new Array(n).fill('');
  const byOffering = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const l = graph.byLessonId.get(model.ids[i]);
    if (!l) continue;
    offOf[i] = l.offeringId;
    const arr = byOffering.get(l.offeringId);
    if (arr) arr.push(i);
    else byOffering.set(l.offeringId, [i]);
  }
  const rosterOf = new Map<string, Set<string>>();
  const offElective = new Map<string, boolean>();
  const siblingKey = new Map<string, string>(); // offeringId -> grade/subject/credits
  const siblingGroups = new Map<string, string[]>();
  for (const [oid, idxs] of byOffering) {
    const l = graph.byLessonId.get(model.ids[idxs[0]])!;
    rosterOf.set(oid, new Set(l.studentCodes));
    offElective.set(oid, l.isElective);
    if (l.isElective) {
      const k = JSON.stringify([l.grade, l.subjectName, idxs.length]);
      siblingKey.set(oid, k);
      const g = siblingGroups.get(k);
      if (g) g.push(oid);
      else siblingGroups.set(k, [oid]);
    }
  }
  const initialSize = new Map<string, number>();
  const curSize = new Map<string, number>();
  for (const [oid, set] of rosterOf) {
    initialSize.set(oid, set.size);
    curSize.set(oid, set.size);
  }
  const studentLessons = new Map<string, Set<number>>();
  for (const [oid, idxs] of byOffering) {
    for (const x of rosterOf.get(oid)!) {
      let set = studentLessons.get(x);
      if (!set) {
        set = new Set();
        studentLessons.set(x, set);
      }
      for (const i of idxs) set.add(i);
    }
  }
  let rosterChanged = false;

  /** 교사 t의 하드 4종 위반 수 — s.color에서 직접 재계산 (교사당 수업 ~20이라 저렴) */
  const teacherHard = (t: number): number => {
    const dayCount = new Array<number>(model.days).fill(0);
    const dayMask = new Array<number>(model.days).fill(0);
    const subjMask = new Map<string, number>();
    let last = 0;
    for (const i of lessonsOfT[t]) {
      const c = s.color[i];
      const d = model.cellDay[c];
      const p = model.cellPeriod[c];
      dayCount[d]++;
      dayMask[d] |= 1 << (p - 1);
      if (p === cfg.lastPeriod) last++;
      if (cfg.subjAdj) {
        const k = `${offId[i]}|${d}`;
        subjMask.set(k, (subjMask.get(k) ?? 0) | (1 << (p - 1)));
      }
    }
    let v = 0;
    for (let d = 0; d < model.days; d++) {
      if (cfg.daily && dayCount[d] > cfg.cap) v += dayCount[d] - cfg.cap;
      if (cfg.consec) v += runExcessMask(dayMask[d], cfg.maxRun);
    }
    if (cfg.last && last > cfg.lastCap) v += last - cfg.lastCap;
    if (cfg.subjAdj) for (const m of subjMask.values()) v += adjacentPairsMask(m);
    return v;
  };

  const ctx: ScoreContext = { input, graph };
  const softOf = (): number => {
    const pl: Placement[] = [];
    for (let i = 0; i < n; i++) {
      const c = s.color[i];
      pl.push({ lessonId: model.ids[i], dayIndex: model.cellDay[c], period: model.cellPeriod[c] });
    }
    return evaluateSoft(placementsToMap(pl), ctx).total;
  };
  let curSoft = softOf();

  // 전역 하드 총량 추적 + best 스냅샷 (정체 랜덤워크가 잠시 나빠져도 최선안은 보존)
  let curHardTotal = 0;
  for (let t = 0; t < teacherCount; t++) if (lessonsOfT[t].length > 0) curHardTotal += teacherHard(t);
  let bestHardTotal = curHardTotal;
  let bestColor = s.color.slice();

  const deadline = Date.now() + budgetMs;
  const maxChain = Math.min(40, Math.max(12, Math.round(n * 0.06)));
  const plateauLimit = 4000;
  let sinceImprove = 0;

  const changedOfferings = new Set<string>();
  const MAX_BLOCKERS = 3;
  const RESECTION_CELL_TRIES = 12;

  /**
   * 분반 교체 무브: 위반 교사 t의 선택과목 수업 seedL을 칸 C로 옮기되, C에서 막는
   * 로스터 학생(≤MAX_BLOCKERS)을 같은 과목의 형제 분반으로 이적시켜 길을 연다.
   * 교사 위반이 실제로 줄 때만 수용(그때 명단·간선·스냅샷 갱신), 아니면 완전 롤백.
   * blockers=0이면 순수 개선 이동으로 수용(Kempe 무작위 표집이 놓친 칸 구제).
   */
  const tryResection = (t: number, seedL: number): boolean => {
    const off = offOf[seedL];
    if (!off || !offElective.get(off)) return false;
    const sibs = (siblingGroups.get(siblingKey.get(off) ?? '') ?? []).filter((o) => o !== off);
    if (sibs.length === 0) return false;
    const cellX = s.color[seedL];
    const before = teacherHard(t);
    const dom: number[] = [];
    for (let c = 0; c < model.cellCount; c++) {
      if (c !== cellX && model.domainSet[seedL][c] === 1) dom.push(c);
    }
    const tries = Math.min(RESECTION_CELL_TRIES, dom.length);
    for (let k = 0; k < tries; k++) {
      const j = k + rng.int(dom.length - k);
      const tmp = dom[k];
      dom[k] = dom[j];
      dom[j] = tmp;
      const C = dom[k];

      // 1) 교사 이득이 있는 칸인지 — 수업만 옮겨보고 측정 (롤백 전제)
      moveLesson(s, seedL, C);
      const after = teacherHard(t);
      const offDayKeys = new Set<number>([
        model.offering[seedL] * model.days + model.cellDay[cellX],
        model.offering[seedL] * model.days + model.cellDay[C],
      ]);
      let ok = after < before && !capViolated(s, offDayKeys);
      // 2) 같은 교사 수업과의 동시배치 금지 (교사 간선은 이적으로 못 푼다)
      if (ok) {
        for (const j2 of lessonsOfT[t]) {
          if (j2 !== seedL && s.color[j2] === C) {
            ok = false;
            break;
          }
        }
      }
      // 3) C에서 막는 학생 수집 (로스터 중 C에 다른 수업이 있는 학생)
      const blockers: string[] = [];
      if (ok) {
        for (const x of rosterOf.get(off)!) {
          const ls = studentLessons.get(x);
          if (!ls) continue;
          for (const j2 of ls) {
            if (offOf[j2] === off) continue;
            if (s.color[j2] === C) {
              blockers.push(x);
              break;
            }
          }
          if (blockers.length > MAX_BLOCKERS) {
            ok = false;
            break;
          }
        }
      }
      // 4) 각 blocker의 이적처: 같은 과목 형제 분반, 그 분반 전 교시에 충돌 없음 + 인원 균형
      const moves: Array<{ x: string; to: string }> = [];
      if (ok) {
        for (const x of blockers) {
          if ((curSize.get(off) ?? 0) - moves.length - 1 < (initialSize.get(off) ?? 0) - maxShift) {
            ok = false;
            break;
          }
          const cands = sibs
            .filter((o2) => {
              const grow = moves.reduce((a, m) => a + (m.to === o2 ? 1 : 0), 0);
              return (curSize.get(o2) ?? 0) + grow + 1 <= (initialSize.get(o2) ?? 0) + maxShift;
            })
            .sort((a, b) => (curSize.get(a) ?? 0) - (curSize.get(b) ?? 0));
          let placedTo: string | null = null;
          for (const o2 of cands) {
            let fits = true;
            const ls = studentLessons.get(x)!;
            for (const j2 of byOffering.get(o2)!) {
              const c2 = s.color[j2];
              for (const kk of ls) {
                if (offOf[kk] === off) continue;
                if (s.color[kk] === c2) {
                  fits = false;
                  break;
                }
              }
              if (!fits) break;
            }
            if (fits) {
              placedTo = o2;
              break;
            }
          }
          if (!placedTo) {
            ok = false;
            break;
          }
          moves.push({ x, to: placedTo });
        }
      }
      if (!ok) {
        moveLesson(s, seedL, cellX); // 롤백
        continue;
      }
      // 5) 커밋: 명단·인원·학생스케줄 갱신 + 이적처의 새 학생충돌 간선 추가
      //    (떠난 분반의 제거 간선은 남겨둠 — 초과 제약일 뿐이라 안전)
      for (const mv of moves) {
        rosterOf.get(off)!.delete(mv.x);
        rosterOf.get(mv.to)!.add(mv.x);
        curSize.set(off, (curSize.get(off) ?? 1) - 1);
        curSize.set(mv.to, (curSize.get(mv.to) ?? 0) + 1);
        changedOfferings.add(off);
        changedOfferings.add(mv.to);
        const ls = studentLessons.get(mv.x)!;
        for (const i2 of byOffering.get(off)!) ls.delete(i2);
        for (const i2 of byOffering.get(mv.to)!) ls.add(i2);
        for (const j2 of byOffering.get(mv.to)!) {
          for (const kk of ls) {
            if (offOf[kk] === mv.to) continue;
            if (!model.adj[j2].includes(kk)) {
              model.adj[j2].push(kk);
              model.adj[kk].push(j2);
            }
          }
        }
        rosterChanged = true;
      }
      curHardTotal += after - before;
      if (curHardTotal < bestHardTotal) {
        bestHardTotal = curHardTotal;
        bestColor = s.color.slice();
      }
      curSoft = softOf();
      return true;
    }
    return false;
  };

  while (Date.now() < deadline) {
    const badTeachers: number[] = [];
    for (let t = 0; t < teacherCount; t++) {
      if (lessonsOfT[t].length > 0 && teacherHard(t) > 0) badTeachers.push(t);
    }
    if (badTeachers.length === 0) break; // 하드 4종 전부 만족

    const t = badTeachers[rng.int(badTeachers.length)];
    const movables = lessonsOfT[t].filter((i) => model.movable[i]);
    if (movables.length === 0) {
      if (++sinceImprove > plateauLimit) break;
      continue;
    }
    const seedL = movables[rng.int(movables.length)];
    const cellX = s.color[seedL];
    const dom: number[] = [];
    for (let c = 0; c < model.cellCount; c++) {
      if (c !== cellX && model.domainSet[seedL][c] === 1) dom.push(c);
    }
    if (dom.length === 0) {
      if (++sinceImprove > plateauLimit) break;
      continue;
    }

    let improved = false;
    const tries = Math.min(10, dom.length);
    for (let k = 0; k < tries; k++) {
      // 부분 셔플로 무작위 타깃
      const j = k + rng.int(dom.length - k);
      const tmp = dom[k];
      dom[k] = dom[j];
      dom[j] = tmp;
      const cellY = dom[k];

      const flip = applyKempe(s, seedL, cellX, cellY, maxChain);
      if (!flip) continue;
      // subjectDailyCap 위반 검사
      const offKeys = new Set<number>();
      for (let idx = 0; idx < flip.touched.length; idx++) {
        const id = flip.touched[idx];
        offKeys.add(model.offering[id] * model.days + model.cellDay[flip.oldCells[idx]]);
        offKeys.add(model.offering[id] * model.days + model.cellDay[s.color[id]]);
      }
      if (capViolated(s, offKeys)) {
        undoKempe(s, flip.touched, flip.oldCells);
        continue;
      }

      // 영향 교사들의 하드 위반 delta — after 측정 → undo → before 측정 → 판정
      const affected = new Set<number>();
      for (const id of flip.touched) if (model.teacher[id] >= 0) affected.add(model.teacher[id]);
      const dests = flip.touched.map((id) => s.color[id]);
      let after = 0;
      for (const tt of affected) after += teacherHard(tt);
      undoKempe(s, flip.touched, flip.oldCells);
      let before = 0;
      for (const tt of affected) before += teacherHard(tt);

      const reapply = (): void => {
        for (let idx = 0; idx < flip.touched.length; idx++) moveLesson(s, flip.touched[idx], dests[idx]);
      };

      if (after < before) {
        reapply();
        curHardTotal += after - before;
        if (curHardTotal < bestHardTotal) {
          bestHardTotal = curHardTotal;
          bestColor = s.color.slice();
        }
        curSoft = softOf();
        improved = true;
        sinceImprove = 0;
        break;
      }
      if (after === before) {
        // 하드 동률 — soft가 줄면 수용, 정체 중이면 확률적 랜덤워크 수용(plateau 탈출).
        // 랜덤워크로 soft가 표류해도 best 스냅샷이 하드 최선안을 보존한다.
        reapply();
        if (sinceImprove > plateauLimit / 4 && rng.next() < 0.3) break;
        const softAfter = softOf();
        if (softAfter < curSoft - 1e-9) {
          curSoft = softAfter;
          break; // 수용 (improved는 아님 — plateau 카운트 유지)
        }
        undoKempe(s, flip.touched, flip.oldCells);
        continue;
      }
      // 악화 — 거부 (이미 undo됨)
    }
    // Kempe로 못 풀면 분반 교체 무브 시도 (선택과목 한정, 인원 균형 준수)
    if (!improved && resectionOn && model.movable[seedL]) {
      improved = tryResection(t, seedL);
      if (improved) sinceImprove = 0;
    }
    if (!improved && ++sinceImprove > plateauLimit) break;
  }

  // best 스냅샷 복원 (마지막 랜덤워크 표류분 제거)
  const out: Placement[] = [];
  for (let i = 0; i < n; i++) {
    const c = bestColor[i];
    out.push({ lessonId: model.ids[i], dayIndex: model.cellDay[c], period: model.cellPeriod[c] });
  }
  let rosters: Map<string, string[]> | null = null;
  if (rosterChanged) {
    rosters = new Map();
    for (const oid of changedOfferings) rosters.set(oid, [...(rosterOf.get(oid) ?? [])]);
  }
  return { placements: out, rosters };
}
