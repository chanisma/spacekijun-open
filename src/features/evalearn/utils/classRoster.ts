/**
 * 학급·학년 **학생 목록**(한 회차의 학생별 요약) — 순수 로직.
 *
 * 학생이 행, 과목 영역이 열이다. 반 하나(20여 명)든 학년 전체(200여 명)든 같은 함수를 쓴다 —
 * 행마다 `classNum` 을 들고 있고 번호순 정렬이 (반, 번호)라서 범위가 넓어져도 판정이 같다.
 * 범위에 따라 달라지는 것은 **표기뿐**이다(`formatRosterSeat`·`RosterScope`).
 *
 * 화면(`ClassRosterTable`)과 분리해 둔 이유는
 * 여기서 틀리면 오류가 아니라 **조용히 빈칸이거나 엉뚱한 학생이 위로 오는** 형태로
 * 나타나기 때문이다(회귀 = `scripts/class-roster-test/run.mts`).
 *
 * 판정은 evalearn 의 다른 화면과 같다:
 *  · 공식 성적(`mock_result`)이 정본. 없을 때만 참고 등급(EBS 등급컷)을 쓴다.
 *  · 마킹 키 ↔ 성적표 키는 `findExamSubjectScore`/`isSameExamSubject` 로 잇는다
 *    (1·2학년 마킹 `사회탐구` ↔ 성적표 `공통사회`, 3학년 `사회문화` ↔ `사회·문화`).
 *  · 미응시(grade 0)는 `getExamGrade` 가 걸러 낸다.
 */
import type { MockExamResult, MockExamSubjectScore, MockMarkingEntry } from '@/features/evalog/types/student';
import type { ReferenceGrade } from './referenceGrade';
import { findExamSubjectScore, getExamGrade, isSameExamSubject } from './mockResult';
import { sortSubjects, subjectArea } from './subjectOrder';

export type RosterSlot = 'korean' | 'math' | 'english' | 'tamgu1' | 'tamgu2' | 'history';

/** 목록 범위 — 반 하나 / 학년 전체 */
export type RosterScope = 'class' | 'grade';

/**
 * 좌석 표기. **학년 목록은 반을 앞에 붙인다** — 반이 섞이면 번호만으로는 누가 누군지 모른다
 * (학년 전체에 `07`번이 반 수만큼 있다). 반 목록은 반이 하나라 번호만 둔다.
 */
export function formatRosterSeat(row: { classNum: number; number: number }, scope: RosterScope): string {
  const no = String(row.number).padStart(2, '0');
  return scope === 'grade' ? `${row.classNum}-${no}` : no;
}

export const ROSTER_SLOTS: { slot: RosterSlot; label: string }[] = [
  { slot: 'korean', label: '국어' },
  { slot: 'math', label: '수학' },
  { slot: 'english', label: '영어' },
  { slot: 'tamgu1', label: '탐구1' },
  { slot: 'tamgu2', label: '탐구2' },
  { slot: 'history', label: '한국사' },
];

/**
 * 평균 등급에 넣는 영역. 한국사는 **절대평가**라 상대평가 등급과 같은 척도가 아니어서 뺀다.
 * 탐구 두 과목은 각각이 아니라 **평균 내어 한 영역**으로 친다 — 6·9월 모평 표와 같은 관례다.
 */
const GRADE_AREAS: RosterSlot[][] = [['korean'], ['math'], ['english'], ['tamgu1', 'tamgu2']];
/** 백분위 평균 영역 — 영어·한국사는 절대평가라 백분위가 없다 */
const PERCENTILE_AREAS: RosterSlot[][] = [['korean'], ['math'], ['tamgu1', 'tamgu2']];

export interface RosterCell {
  /** 이 칸에 실제로 들어간 과목(3학년 국·수 선택과목, 탐구에서 특히 중요) */
  subject: string;
  grade: number | null;
  rawScore: number | null;
  percentile: number | null;
  standardScore: number | null;
  /** 공식 성적이 아니라 참고 등급(EBS 예상 등급컷)에서 온 값인가 */
  isReference: boolean;
  /** 마킹은 있는데 공식 성적도 참고 등급도 없다(문항·배점·등급컷 미적재) */
  unscored: boolean;
}

export interface RosterStudentInput {
  id: string;
  name: string;
  classNum: number;
  number: number;
  mock_marking: MockMarkingEntry[] | null;
  mock_result: MockExamResult[] | null;
}

export interface RosterExam {
  academic_year: number;
  exam_month: number;
  exam_grade: number;
}

export interface RosterRow {
  id: string;
  name: string;
  classNum: number;
  number: number;
  /** 이 회차에 마킹도 성적도 없다 — 목록에서 빼지 않는다(미응시 자체가 정보다) */
  absent: boolean;
  cells: Partial<Record<RosterSlot, RosterCell>>;
  /** 국·수·영·탐 영역 평균 등급. `areas` 가 4 미만이면 다른 학생과 같은 조건이 아니다 */
  overallGrade: number | null;
  gradeAreas: number;
  /** 국·수·탐 영역 평균 백분위 */
  overallPercentile: number | null;
  percentileAreas: number;
  /** 평균에 참고 등급이 섞였는가 */
  hasReference: boolean;
}

const round = (v: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

const sameExam = (e: RosterExam, x: RosterExam) =>
  e.academic_year === x.academic_year && e.exam_month === x.exam_month && e.exam_grade === x.exam_grade;

/**
 * 성적표의 한 과목이 "응시한 성적"인가. 등급이 유효하면 확실하고, 등급이 비어도 점수가
 * 실제로 있으면 응시로 본다. 전부 0/빈칸이면 결시 표식이다(적재 시 걸렀지만 과거분 대비).
 */
function isTakenScore(s: MockExamSubjectScore | undefined): s is MockExamSubjectScore {
  if (!s) return false;
  if (getExamGrade(s) !== null) return true;
  return (s.raw_score ?? 0) > 0 || (s.percentile ?? 0) > 0;
}

function officialCell(subject: string, s: MockExamSubjectScore): RosterCell {
  return {
    subject,
    grade: getExamGrade(s),
    rawScore: s.raw_score ?? null,
    percentile: s.percentile ?? null,
    standardScore: s.standard_score ?? null,
    isReference: false,
    unscored: false,
  };
}

/** 과목 -> 칸. 국·수·영·한국사는 영역으로, 나머지는 탐구 두 자리로 간다. */
function slotOf(subject: string): RosterSlot | 'tamgu' {
  switch (subjectArea(subject)) {
    case '국어': return 'korean';
    case '수학': return 'math';
    case '영어': return 'english';
    case '한국사': return 'history';
    default: return 'tamgu';
  }
}

function areaMean(cells: RosterRow['cells'], areas: RosterSlot[][], pick: (c: RosterCell) => number | null) {
  const means: number[] = [];
  for (const slots of areas) {
    const vals = slots
      .map((sl) => cells[sl])
      .filter((c): c is RosterCell => c != null)
      .map(pick)
      .filter((v): v is number => v != null);
    if (vals.length > 0) means.push(vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  return { mean: means.length > 0 ? means.reduce((a, b) => a + b, 0) / means.length : null, count: means.length };
}

/**
 * 학생별 행을 만든다.
 *
 * @param referenceGrades 학적 코드 -> (마킹 과목키 -> 참고 등급). 공식 성적이 없는 과목에만 쓰인다.
 */
export function buildRosterRows(
  students: RosterStudentInput[],
  exam: RosterExam,
  referenceGrades: Map<string, Map<string, ReferenceGrade>>
): RosterRow[] {
  return students.map((s) => {
    const marking = s.mock_marking?.find((e) => sameExam(e, exam));
    const official = s.mock_result?.find((e) => sameExam(e, exam))?.subjects;
    const refs = referenceGrades.get(s.id);

    const markedSubjects = Object.entries(marking?.subjects ?? {})
      .filter(([, v]) => (v?.answers?.length ?? 0) > 0)
      .map(([k]) => k);

    const cellsBySubject: RosterCell[] = [];

    // ① 마킹 과목 — 화면의 과목 칩과 같은 이름(`사회탐구` 등)이 표시 이름이 된다
    for (const subject of markedSubjects) {
      const off = findExamSubjectScore(official, subject);
      if (isTakenScore(off)) { cellsBySubject.push(officialCell(subject, off)); continue; }
      const ref = refs?.get(subject);
      cellsBySubject.push(ref
        ? {
            subject,
            grade: ref.grade,
            rawScore: ref.rawScore,
            percentile: ref.percentile,
            standardScore: null,
            isReference: true,
            unscored: false,
          }
        : { subject, grade: null, rawScore: null, percentile: null, standardScore: null, isReference: false, unscored: true });
    }

    // ② 마킹 없이 성적표에만 있는 과목 — 같은 과목이 두 번 세어지지 않게 별칭까지 보고 거른다
    for (const [subject, score] of Object.entries(official ?? {})) {
      if (!isTakenScore(score)) continue;
      if (markedSubjects.some((m) => isSameExamSubject(m, subject))) continue;
      cellsBySubject.push(officialCell(subject, score));
    }

    const cells: RosterRow['cells'] = {};
    const tamgu: RosterCell[] = [];
    for (const c of cellsBySubject) {
      const slot = slotOf(c.subject);
      if (slot === 'tamgu') tamgu.push(c);
      else if (!cells[slot]) cells[slot] = c; // 한 영역에 두 과목은 없다 — 있다면 먼저 온 것(마킹)이 이긴다
    }
    // 탐구 자리는 **과목 순서로 고정**한다(과탐 → 사탐). 등급 순으로 두면 같은 반에서도
    // 탐구1 열이 학생마다 다른 과목이 돼 그 열로 정렬하는 의미가 사라진다.
    const order = sortSubjects(tamgu.map((c) => c.subject));
    tamgu.sort((a, b) => order.indexOf(a.subject) - order.indexOf(b.subject));
    if (tamgu[0]) cells.tamgu1 = tamgu[0];
    if (tamgu[1]) cells.tamgu2 = tamgu[1];

    const g = areaMean(cells, GRADE_AREAS, (c) => c.grade);
    const p = areaMean(cells, PERCENTILE_AREAS, (c) => c.percentile);
    const used = [...GRADE_AREAS.flat()].map((sl) => cells[sl]).filter((c): c is RosterCell => c != null);

    return {
      id: s.id,
      name: s.name,
      classNum: s.classNum,
      number: s.number,
      absent: cellsBySubject.length === 0,
      cells,
      overallGrade: g.mean != null ? round(g.mean, 2) : null,
      gradeAreas: g.count,
      overallPercentile: p.mean != null ? round(p.mean, 1) : null,
      percentileAreas: p.count,
      hasReference: used.some((c) => c.isReference && c.grade != null),
    };
  });
}

/**
 * 열 머리글 이름. 목록 전체(반 또는 학년)가 그 칸에 **같은 과목**을 두었으면 그 과목 이름을 쓴다
 * (1·2학년 탐구1 = 과학탐구). 학생마다 다르면 영역 이름을 두고, 칸 안에 과목을 적는다.
 */
export function resolveSlotHeaders(rows: RosterRow[]): Record<RosterSlot, { label: string; uniform: boolean }> {
  const out = {} as Record<RosterSlot, { label: string; uniform: boolean }>;
  for (const { slot, label } of ROSTER_SLOTS) {
    const subjects = rows.map((r) => r.cells[slot]?.subject).filter((v): v is string => v != null);
    const uniform = subjects.length > 0 && subjects.every((x) => isSameExamSubject(x, subjects[0]));
    // 국·영·한국사처럼 영역 이름과 과목 이름이 같으면 영역 이름 그대로 둔다
    out[slot] = { label: uniform && (slot === 'tamgu1' || slot === 'tamgu2') ? subjects[0] : label, uniform };
  }
  return out;
}

export type RosterSortKey = 'student' | RosterSlot | 'overallGrade' | 'overallPercentile';
export type SortDirection = 'asc' | 'desc';

/**
 * 첫 클릭의 방향 = **잘한 순**. 등급은 낮을수록, 백분위는 높을수록 좋아서 방향이 반대다.
 * 학번은 명단 순(오름차순).
 */
export function defaultSortDirection(key: RosterSortKey): SortDirection {
  return key === 'overallPercentile' ? 'desc' : 'asc';
}

const cmpNum = (a: number | null, b: number | null) => (a ?? 0) - (b ?? 0);

/** 정렬에 쓸 값이 있는가 — 없으면 방향과 무관하게 아래로 보낸다 */
function hasValue(row: RosterRow, key: RosterSortKey): boolean {
  if (key === 'student') return true;
  if (key === 'overallGrade') return row.overallGrade != null;
  if (key === 'overallPercentile') return row.overallPercentile != null;
  return row.cells[key]?.grade != null;
}

/**
 * 오름차순 기준 비교. **동점 처리가 실제 순서를 대부분 정한다** — 한 반 24명에 등급은 9칸뿐이라
 * 같은 등급이 흔하다. 그래서 등급이 같으면 백분위, 그다음 원점수로 가른다(방향은 등급과 같은 뜻:
 * 오름차순 = 잘한 쪽 먼저).
 */
function ascCompare(a: RosterRow, b: RosterRow, key: RosterSortKey): number {
  if (key === 'student') return (a.classNum - b.classNum) || (a.number - b.number);
  if (key === 'overallGrade') {
    return cmpNum(a.overallGrade, b.overallGrade) || cmpNum(b.overallPercentile, a.overallPercentile);
  }
  if (key === 'overallPercentile') {
    return cmpNum(a.overallPercentile, b.overallPercentile) || cmpNum(b.overallGrade, a.overallGrade);
  }
  const ca = a.cells[key]!;
  const cb = b.cells[key]!;
  return cmpNum(ca.grade, cb.grade) || cmpNum(cb.percentile, ca.percentile) || cmpNum(cb.rawScore, ca.rawScore);
}

export function sortRosterRows(rows: RosterRow[], key: RosterSortKey, direction: SortDirection): RosterRow[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = hasValue(a, key);
    const vb = hasValue(b, key);
    if (!va || !vb) {
      if (va !== vb) return va ? -1 : 1;
      return (a.classNum - b.classNum) || (a.number - b.number);
    }
    return (ascCompare(a, b, key) * sign) || (a.classNum - b.classNum) || (a.number - b.number);
  });
}

export interface RosterSummary {
  enrolled: number;
  taken: number;
  absentNames: string[];
  /** 목록에 든 반의 수 — 학년 목록 요약에 쓴다(반 목록이면 1) */
  classCount: number;
  /** 목록 평균 등급(평균 등급이 있는 학생만). 반 목록이면 반 평균, 학년 목록이면 학년 평균 */
  meanGrade: number | null;
  hasReference: boolean;
  hasUnscored: boolean;
}

export function summarizeRoster(rows: RosterRow[]): RosterSummary {
  const graded = rows.map((r) => r.overallGrade).filter((v): v is number => v != null);
  return {
    enrolled: rows.length,
    taken: rows.filter((r) => !r.absent).length,
    absentNames: rows.filter((r) => r.absent).map((r) => r.name),
    classCount: new Set(rows.map((r) => r.classNum)).size,
    meanGrade: graded.length > 0 ? round(graded.reduce((a, b) => a + b, 0) / graded.length, 2) : null,
    hasReference: rows.some((r) => r.hasReference),
    hasUnscored: rows.some((r) => Object.values(r.cells).some((c) => c?.unscored)),
  };
}
