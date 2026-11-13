// Phase 0 — 선택군 편성 (Line Construction).
//
// 블록 구조 시간표 생성의 1단계. 학생들이 고른 선택과목을, 각 선택군 그룹(예: 일반진로
// pick 4)마다 K개의 "시간 라인(선택군)"으로 묶는다. 한 학생은 자신이 고른 과목을 서로 다른
// 라인에 하나씩 배정받으므로(전단사) **학생 시간충돌이 구조적으로 0**이 된다.
//
// 핵심: sectioning은 학생별로 독립이고(결합은 정원뿐), 선택군 편성도 마찬가지다. 따라서
// 과목별 home-line 집합을 정하고 학생별 이분매칭(Kuhn)으로 라우팅하면 분반 수를 거의
// 이론 최소(Σ⌈수요/정원⌉)에 가깝게 응집한다. 검증: 2학년 193명 실데이터 0충돌·정원준수.
// 회귀: scripts/timetable-generator-test/run-line-construct.mts.

/** 한 선택군 그룹 입력 (예: "2학년 일반진로", pick_count=4) */
export interface ElectiveGroupInput {
  /** 그룹 식별 키 (학년+카테고리 등) */
  key: string;
  /** K = 이 그룹에서 학생이 고르는 과목 수 = 펼칠 시간 라인 수 (pick_count) */
  lines: number;
  /** 분반 정원 */
  capacity: number;
  /** 학생별 이 그룹 내 선택 과목명 (길이 ≤ lines). 빈 배열 학생은 무시 */
  students: Array<{ code: string; subjects: string[] }>;
}

/** 한 (그룹, 과목, 라인) 분반 묶음 */
export interface LineSection {
  groupKey: string;
  subject: string;
  /** 0..K-1 */
  line: number;
  /** 이 (과목,라인)에 배정된 학생들 */
  studentCodes: string[];
  /** 정원 초과 시 한 (과목,라인)에 필요한 분반 수 = ⌈인원/정원⌉ */
  sectionsInLine: number;
}

export interface LineConstructionResult {
  sections: LineSection[];
  /** studentCode -> (subject -> line index) */
  assignment: Map<string, Map<string, number>>;
  /** 라인 중복(전단사 위반) 학생 수 — 0이 목표 */
  studentConflicts: number;
  /** 정원 초과한 (과목,라인) 수 */
  capacityOverflow: number;
  /** 총 분반 수 */
  totalSections: number;
}

/** 여러 선택군 그룹을 각각 독립적으로 편성 */
export function constructLines(groups: ElectiveGroupInput[]): LineConstructionResult {
  const sections: LineSection[] = [];
  const assignment = new Map<string, Map<string, number>>();
  let studentConflicts = 0;
  let capacityOverflow = 0;
  let totalSections = 0;

  for (const group of groups) {
    const r = constructGroup(group);
    for (const sec of r.sections) sections.push(sec);
    for (const [code, m] of r.assignment) {
      const target = assignment.get(code) ?? new Map<string, number>();
      for (const [subj, line] of m) target.set(subj, line);
      assignment.set(code, target);
    }
    studentConflicts += r.studentConflicts;
    capacityOverflow += r.capacityOverflow;
    totalSections += r.totalSections;
  }

  return { sections, assignment, studentConflicts, capacityOverflow, totalSections };
}

/** 단일 그룹 편성: home-line 집합 → 학생별 이분매칭 라우팅 → lazy 확장 → 작은분반 정리 */
function constructGroup(group: ElectiveGroupInput): LineConstructionResult {
  const { key, lines: K, capacity } = group;
  const students = group.students.filter((s) => s.subjects.length > 0);

  // 과목 목록 + 수요
  const demand = new Map<string, number>();
  for (const s of students) for (const subj of s.subjects) demand.set(subj, (demand.get(subj) ?? 0) + 1);
  const subjects = [...demand.keys()];

  // (subject -> 라인별 인원). cnt[subject][line]
  const cnt = new Map<string, number[]>();
  for (const subj of subjects) cnt.set(subj, new Array(K).fill(0));
  const countAt = (subj: string, line: number) => cnt.get(subj)![line];
  const addAt = (subj: string, line: number, d: number) => { cnt.get(subj)![line] += d; };

  // 각 과목의 home-line 집합. 초기 = 모든 K개 라인.
  // (Hall 정리: 모든 과목이 모든 라인에 있으면 ≤K개 과목의 distinct-line 매칭이 항상 존재 →
  //  학생 충돌 구조적 0. 정원 한도 내에서만 제약. 과잉 분반은 이후 consolidate가 안전하게 트림.)
  const homeLines = new Map<string, Set<number>>();
  for (const subj of subjects) homeLines.set(subj, new Set<number>([...Array(K).keys()]));

  // 학생별 이분매칭(Kuhn): 각 과목 → 서로 다른 home-line(잔여 정원).
  const assignment = new Map<string, Map<string, number>>();

  const matchStudent = (picks: string[]): Map<string, number> | null => {
    const lineToIdx = new Array(K).fill(-1); // line -> picks index
    const res = new Array<number>(picks.length).fill(-1);
    const tryK = (ki: number, seen: boolean[]): boolean => {
      const subj = picks[ki];
      for (const l of homeLines.get(subj)!) {
        if (seen[l]) continue;
        if (countAt(subj, l) >= capacity) continue; // 잔여 정원 없음
        seen[l] = true;
        if (lineToIdx[l] === -1 || tryK(lineToIdx[l], seen)) {
          lineToIdx[l] = ki;
          res[ki] = l;
          return true;
        }
      }
      return false;
    };
    for (let ki = 0; ki < picks.length; ki++) {
      if (!tryK(ki, new Array(K).fill(false))) return null;
    }
    const m = new Map<string, number>();
    for (let ki = 0; ki < picks.length; ki++) m.set(picks[ki], res[ki]);
    return m;
  };

  // 제약 빡빡한 학생(과목 많은) 먼저
  const order = [...students].sort((a, b) => b.subjects.length - a.subjects.length);
  for (const stu of order) {
    const picks = [...new Set(stu.subjects)];
    if (picks.length > K) {
      // K개 라인보다 많은 과목 → 구조적 불가 (입력 오류). 앞 K개만.
      picks.length = K;
    }
    // home=all-K라 정원 여유가 있으면 항상 매칭 성공. 정원 포화로 실패 시에만 최선 배정(충돌 집계).
    let result = matchStudent(picks);
    if (!result) {
      result = new Map<string, number>();
      const used = new Set<number>();
      for (const subj of picks) {
        // 미사용 라인 중 잔여 정원 있는 곳 우선, 없으면 첫 미사용
        let pick = -1;
        for (let l = 0; l < K; l++) if (!used.has(l) && countAt(subj, l) < capacity) { pick = l; break; }
        if (pick < 0) for (let l = 0; l < K; l++) if (!used.has(l)) { pick = l; break; }
        if (pick < 0) pick = 0;
        used.add(pick);
        result.set(subj, pick);
      }
    }
    for (const [subj, line] of result) addAt(subj, line, 1);
    assignment.set(stu.code, result);
  }

  // 작은 분반 정리: 가장 작은 (subject,line)을 비워 분반 수 축소(같은 과목 다른 home-line으로 이동)
  consolidate(group, cnt, homeLines, assignment);

  // 결과 집계
  const sections: LineSection[] = [];
  let capacityOverflow = 0;
  let totalSections = 0;
  // (subject,line) -> 학생 목록
  const roster = new Map<string, string[]>(); // `${subj}|${line}` -> codes
  for (const [code, m] of assignment) for (const [subj, line] of m) {
    const k = `${subj}|${line}`;
    const arr = roster.get(k) ?? [];
    arr.push(code);
    roster.set(k, arr);
  }
  for (const subj of subjects) {
    for (let line = 0; line < K; line++) {
      const c = countAt(subj, line);
      if (c <= 0) continue;
      const sectionsInLine = Math.ceil(c / capacity);
      if (c > capacity) capacityOverflow++;
      totalSections += sectionsInLine;
      sections.push({
        groupKey: key,
        subject: subj,
        line,
        studentCodes: roster.get(`${subj}|${line}`) ?? [],
        sectionsInLine,
      });
    }
  }

  // 학생 충돌(라인 중복) 검증
  let studentConflicts = 0;
  for (const m of assignment.values()) {
    const used = new Set(m.values());
    if (used.size !== m.size) studentConflicts++;
  }

  return { sections, assignment, studentConflicts, capacityOverflow, totalSections };
}

/** 가장 작은 (subject,line) 분반을 비워 분반 수 축소(연쇄 없이 단순 이동) */
function consolidate(
  group: ElectiveGroupInput,
  cnt: Map<string, number[]>,
  homeLines: Map<string, Set<number>>,
  assignment: Map<string, Map<string, number>>,
): void {
  const { lines: K, capacity } = group;
  const countAt = (subj: string, line: number) => cnt.get(subj)![line];
  const tried = new Set<string>();
  for (let pass = 0; pass < 500; pass++) {
    // 가장 작은 양수 (subject,line) (이미 실패한 셀 제외)
    let tSubj: string | null = null;
    let tLine = -1;
    let tMin = Infinity;
    for (const [subj, arr] of cnt) {
      for (let l = 0; l < K; l++) {
        const key = `${subj}|${l}`;
        if (arr[l] > 0 && arr[l] < tMin && !tried.has(key)) { tMin = arr[l]; tSubj = subj; tLine = l; }
      }
    }
    if (!tSubj) break;
    // 이 셀 학생 전원이 같은 과목 다른 home-line으로 이동 가능한지
    const movers: { code: string; to: number }[] = [];
    const tempCnt = new Map<number, number>();
    let allMovable = true;
    for (const [code, m] of assignment) {
      if (m.get(tSubj) !== tLine) continue;
      const used = new Set(m.values());
      let to = -1;
      for (const l2 of homeLines.get(tSubj)!) {
        if (l2 === tLine || used.has(l2)) continue;
        if (countAt(tSubj, l2) + (tempCnt.get(l2) ?? 0) >= capacity) continue;
        to = l2;
        break;
      }
      if (to < 0) { allMovable = false; break; }
      movers.push({ code, to });
      tempCnt.set(to, (tempCnt.get(to) ?? 0) + 1);
    }
    if (!allMovable || movers.length === 0) { tried.add(`${tSubj}|${tLine}`); continue; }
    for (const mv of movers) {
      const m = assignment.get(mv.code)!;
      m.set(tSubj, mv.to);
      cnt.get(tSubj)![tLine]--;
      cnt.get(tSubj)![mv.to]++;
    }
    homeLines.get(tSubj)!.delete(tLine);
  }
}
