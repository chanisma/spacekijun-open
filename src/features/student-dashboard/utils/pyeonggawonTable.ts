/**
 * 6·9월 모평 **학생별 표**의 계산 — 순수 로직.
 *
 * 화면(정렬 버튼·셀 색)과 분리해 둔다. 여기서 틀리면 오류가 아니라 **조용히 빈칸**이거나
 * 엉뚱한 학생이 위로 올라오는 형태로 나타나 눈으로는 늦게 발견된다.
 *
 * 두 달의 과목을 잇는 키는 **정규화한 이름**이다(`canonicalSubjectKey`) — 6월 성적표는
 * `사회·문화`, 9월 마킹(참고 등급)은 `사회문화`로 저장돼 있어 원문으로 비교하면 짝이 끊긴다.
 */
import { MOCK_SUBJECT_FAMILY, normalizeMockSubjectName, type MockExamResult } from './analysisUtils';
import { isValidExamGrade, canonicalSubjectKey } from '@/features/evalearn/utils/mockResult';
import type { ReferenceGrade } from '@/features/evalearn/utils/referenceGrade';

/** 표의 과목 칸. 탐구는 과목이 학생마다 달라 **자리(slot)** 로 잡는다. */
export type ShiftSlot = 'korean' | 'math' | 'english' | 'tamgu1' | 'tamgu2' | 'history';

export const SHIFT_SLOTS: { slot: ShiftSlot; label: string }[] = [
  { slot: 'korean', label: '국어' },
  { slot: 'math', label: '수학' },
  { slot: 'english', label: '영어' },
  { slot: 'tamgu1', label: '탐구1' },
  { slot: 'tamgu2', label: '탐구2' },
  { slot: 'history', label: '한국사' },
];

/**
 * 전체(평균) 등급에 넣는 자리.
 *
 * 한국사는 **절대평가**라 상대평가 등급과 같은 척도가 아니다 — 섞으면 평균이 의미를 잃는다.
 * 탐구는 두 과목을 각각 한 자리로 세지 않고 **평균 내어 한 영역**으로 친다(수능 관례).
 */
export const OVERALL_AREAS: ShiftSlot[][] = [['korean'], ['math'], ['english'], ['tamgu1', 'tamgu2']];

export interface ShiftCell {
  /** 이 자리에 실제로 들어간 과목명(탐구에서 특히 중요) */
  subject: string | null;
  from: number | null;
  to: number | null;
  delta: number | null;
}

export interface StudentShiftRow {
  id: string;
  name: string;
  classNum: number;
  number: number;
  cells: Record<ShiftSlot, ShiftCell>;
  overall: {
    from: number | null;
    to: number | null;
    delta: number | null;
    /** 평균에 실제로 들어간 영역 수 — 학생마다 다를 수 있어 화면에 밝힌다 */
    areas: number;
  };
}

const EMPTY_CELL: ShiftCell = { subject: null, from: null, to: null, delta: null };

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** 한 회차(월)에서 과목별 등급을 뽑는다. 키는 원문, 값은 등급. */
function gradesOfMonths(
  mockResult: MockExamResult[] | null,
  months: readonly number[]
): Map<string, number> {
  const out = new Map<string, number>();
  (Array.isArray(mockResult) ? mockResult : []).forEach((exam) => {
    if (exam.exam_grade !== 3 || !months.includes(exam.exam_month)) return;
    Object.entries(exam.subjects ?? {}).forEach(([name, score]) => {
      if (isValidExamGrade(score?.grade)) out.set(name, score!.grade as number);
    });
  });
  return out;
}

/** 참고 등급 맵(마킹 과목키 -> 등급)을 같은 모양으로 바꾼다. */
function gradesOfReference(refs: Map<string, ReferenceGrade> | undefined): Map<string, number> {
  const out = new Map<string, number>();
  if (!refs) return out;
  for (const [name, ref] of refs) {
    if (isValidExamGrade(ref.grade)) out.set(name, ref.grade);
  }
  return out;
}

interface Slotted {
  korean?: { subject: string; grade: number };
  math?: { subject: string; grade: number };
  english?: { subject: string; grade: number };
  history?: { subject: string; grade: number };
  tamgu: { subject: string; grade: number }[];
}

/** 과목 -> 자리. 국·수·영은 선택과목명을 계열로 접고, 나머지는 한국사/탐구로 가른다. */
function toSlots(grades: Map<string, number>): Slotted {
  const out: Slotted = { tamgu: [] };
  for (const [name, grade] of grades) {
    const family = MOCK_SUBJECT_FAMILY[name];
    if (family === 'korean' || family === 'math' || family === 'english') {
      // 같은 계열이 둘일 수는 없지만, 있다면 먼저 온 것을 남긴다(성적표 순서가 곧 정본)
      if (!out[family]) out[family] = { subject: name, grade };
      continue;
    }
    if (canonicalSubjectKey(name) === canonicalSubjectKey('한국사')) {
      if (!out.history) out.history = { subject: name, grade };
      continue;
    }
    out.tamgu.push({ subject: normalizeMockSubjectName(name), grade });
  }
  // 탐구1/탐구2는 **과목명 순으로 고정**한다 — 등급 순으로 정렬하면 같은 학생의
  // 탐구1이 달마다 다른 과목이 돼 변화량이 두 과목의 차이가 된다.
  out.tamgu.sort((a, b) => a.subject.localeCompare(b.subject, 'ko'));
  return out;
}

function cell(
  fromEntry: { subject: string; grade: number } | undefined,
  toEntry: { subject: string; grade: number } | undefined
): ShiftCell {
  if (!fromEntry && !toEntry) return { ...EMPTY_CELL };
  const from = fromEntry?.grade ?? null;
  const to = toEntry?.grade ?? null;
  return {
    subject: fromEntry?.subject ?? toEntry?.subject ?? null,
    from,
    to,
    delta: from != null && to != null ? round1(to - from) : null,
  };
}

export interface ShiftRowInput {
  id: string;
  name: string;
  class_num: number;
  number: number;
  mock_result: MockExamResult[] | null;
}

/**
 * 학생별 행을 만든다. 데이터가 없는 학생도 **빼지 않는다** — 9월 미응시 자체가 정보다.
 *
 * @param useReference to 쪽 값이 공식 성적에 없을 때 참고 등급으로 채운다
 */
export function buildStudentShiftRows(
  students: ShiftRowInput[],
  fromMonths: readonly number[],
  toMonths: readonly number[],
  referenceGrades: Map<string, Map<string, ReferenceGrade>>,
  useReference: boolean
): StudentShiftRow[] {
  return students.map((s) => {
    const fromSlots = toSlots(gradesOfMonths(s.mock_result, fromMonths));

    const officialTo = gradesOfMonths(s.mock_result, toMonths);
    // 공식 성적이 있으면 그것이 정본 — 없을 때만 참고 등급을 얹는다.
    // 9월 공식 성적이 적재되는 순간 이 표는 코드 수정 없이 공식 값으로 넘어간다.
    if (useReference) {
      for (const [name, grade] of gradesOfReference(referenceGrades.get(s.id))) {
        if (!officialTo.has(name)) officialTo.set(name, grade);
      }
    }
    const toSlotted = toSlots(officialTo);

    // 탐구는 **과목으로 짝지어야** 한다 — 자리 순서로 짝지으면 한 과목만 응시한 달에서
    // 서로 다른 과목의 등급을 빼게 된다.
    const tamguKeys: string[] = [];
    const pushKey = (k: string) => { if (!tamguKeys.includes(k)) tamguKeys.push(k); };
    fromSlots.tamgu.forEach((t) => pushKey(canonicalSubjectKey(t.subject)));
    toSlotted.tamgu.forEach((t) => pushKey(canonicalSubjectKey(t.subject)));
    const tamguCells = tamguKeys.map((key) =>
      cell(
        fromSlots.tamgu.find((t) => canonicalSubjectKey(t.subject) === key),
        toSlotted.tamgu.find((t) => canonicalSubjectKey(t.subject) === key)
      )
    );

    const cells: Record<ShiftSlot, ShiftCell> = {
      korean: cell(fromSlots.korean, toSlotted.korean),
      math: cell(fromSlots.math, toSlotted.math),
      english: cell(fromSlots.english, toSlotted.english),
      tamgu1: tamguCells[0] ?? { ...EMPTY_CELL },
      tamgu2: tamguCells[1] ?? { ...EMPTY_CELL },
      history: cell(fromSlots.history, toSlotted.history),
    };

    // 전체 = 영역 평균. **두 달 모두 값이 있는 영역만** 넣는다 —
    // 한쪽에만 있는 영역을 섞으면 변화량이 "성적 변화"가 아니라 "응시 과목 변화"가 된다.
    const fromAreas: number[] = [];
    const toAreas: number[] = [];
    for (const slots of OVERALL_AREAS) {
      const froms = slots.map((sl) => cells[sl].from).filter((v): v is number => v != null);
      const tos = slots.map((sl) => cells[sl].to).filter((v): v is number => v != null);
      if (froms.length === 0 || tos.length === 0) continue;
      fromAreas.push(froms.reduce((a, b) => a + b, 0) / froms.length);
      toAreas.push(tos.reduce((a, b) => a + b, 0) / tos.length);
    }
    const overallFrom = fromAreas.length > 0 ? round1(fromAreas.reduce((a, b) => a + b, 0) / fromAreas.length) : null;
    const overallTo = toAreas.length > 0 ? round1(toAreas.reduce((a, b) => a + b, 0) / toAreas.length) : null;

    return {
      id: s.id,
      name: s.name,
      classNum: s.class_num,
      number: s.number,
      cells,
      overall: {
        from: overallFrom,
        to: overallTo,
        delta: overallFrom != null && overallTo != null ? round1(overallTo - overallFrom) : null,
        areas: fromAreas.length,
      },
    };
  });
}

export type ShiftSortKey = 'student' | ShiftSlot | 'overall' | 'overallDelta';
export type SortDirection = 'asc' | 'desc';

function sortValue(row: StudentShiftRow, key: ShiftSortKey): number | null {
  if (key === 'student') return row.classNum * 1000 + row.number;
  if (key === 'overall') return row.overall.to ?? row.overall.from;
  if (key === 'overallDelta') return row.overall.delta;
  // 과목 칸은 **최근 값(9월)** 기준. 9월이 없으면 6월로 떨어진다.
  return row.cells[key].to ?? row.cells[key].from;
}

/**
 * 정렬. **값이 없는 행은 방향과 무관하게 항상 아래**로 보낸다 —
 * 내림차순에서 빈칸이 위로 올라오면 표를 읽을 수 없다.
 */
export function sortShiftRows(
  rows: StudentShiftRow[],
  key: ShiftSortKey,
  direction: SortDirection
): StudentShiftRow[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va == null && vb == null) return (a.classNum - b.classNum) || (a.number - b.number);
    if (va == null) return 1;
    if (vb == null) return -1;
    if (va !== vb) return (va - vb) * sign;
    return (a.classNum - b.classNum) || (a.number - b.number);
  });
}
