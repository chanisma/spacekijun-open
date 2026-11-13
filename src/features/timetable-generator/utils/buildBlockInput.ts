// block-structured 솔버용 입력 어댑터.
//
// 기존 buildTimetableInput으로 분류(선택/공통/창체)를 끝낸 Lesson[]을, 선택군 편성(Phase 0)과
// 라인 배치(Phase 1)가 먹을 수 있는 BlockModel로 재조직한다.
//  - 선택과목(isElective) → selectionGroup(subject→group→pick_count=K)으로 묶어 ElectiveGroupInput.
//    선택군에 없는 과목(예술 등)은 공동수강 추론으로 폴백 그룹 구성.
//  - 공통과목 → (반, 과목) CommonSpec. 창체(자율·동아리) → ActivitySpec(고정 칸).
import type { BuildInputConfig, EnrollmentRow, OfferingRow, SelectionGroupRow } from './buildInput';
import { buildTimetableInput } from './buildInput';
import type { ElectiveGroupInput } from '../algorithm/lineConstruction';
import type { Grade, GridConfig, Lesson } from '../types';

export interface GroupMeta {
  grade: Grade;
  groupName: string;
  /** 라인 1개가 점유하는 칸 수 (그룹 과목 학점). 보통 동일(일반진로=3) */
  lineCredits: number;
  /** 과목 -> 담당 교사 후보(분반 교사들). (subject,line) 분반에 라운드로빈 배정 */
  subjectTeachers: Map<string, string[]>;
}

export interface CommonSpec {
  id: string;
  grade: Grade;
  classKey: string;
  subject: string;
  credits: number;
  teacherId: string | null;
  /** 전개용: 이 (반,과목)에 속한 lesson id들 */
  lessonIds: string[];
}

export interface ActivitySpec {
  id: string;
  grade: Grade;
  label: string;
  credits: number;
  teachers: string[];
  /** 고정 칸 "dayIndex|period" (있으면 핀) */
  cells: string[];
}

export interface BlockModel {
  grid: GridConfig;
  grades: Grade[];
  academicYear: number;
  semester: number;
  blockedByGrade: Record<number, string[]>;
  /** Phase 0 입력 */
  electiveGroups: ElectiveGroupInput[];
  /** groupKey -> 메타 (ElectiveGroupInput.key와 동일 키) */
  groupMeta: Map<string, GroupMeta>;
  commons: CommonSpec[];
  activities: ActivitySpec[];
  /** 전개용: 원본 lessons (선택과목 재배치/공통 전개에 참조) */
  lessons: Lesson[];
}

const DEFAULT_CAPACITY = 36;

export function buildBlockModel(
  offerings: OfferingRow[],
  enrollments: EnrollmentRow[],
  selectionGroups: SelectionGroupRow[],
  config: BuildInputConfig,
): BlockModel {
  const input = buildTimetableInput(offerings, enrollments, config);
  const grades = [...config.grades].sort((a, b) => a - b);

  // subject -> 선택군 이름 (표시용만; 구조는 학점 기반). 선택군 메타는 코호트-학년도 불일치·부분매칭으로
  // 라인 수 산정에 쓰면 오염되므로 사용하지 않고, 그룹 표시명에만 참고한다.
  const subjGroupName = new Map<number, Map<string, string>>();
  for (const g of selectionGroups) {
    if (!subjGroupName.has(g.targetGrade)) subjGroupName.set(g.targetGrade, new Map());
    const m = subjGroupName.get(g.targetGrade)!;
    for (const subj of g.subjects) m.set(subj, g.groupName);
  }

  // 과목별 학점 (offering 기준) — 학년+과목
  const subjCredits = new Map<string, number>();
  for (const off of offerings) {
    const key = `${off.grade}|${off.subject_name}`;
    const c = Math.max(0, Math.floor(off.credits ?? 0));
    if (c > 0) subjCredits.set(key, Math.max(subjCredits.get(key) ?? 0, c));
  }

  const electiveLessons = input.lessons.filter((l) => l.isElective);
  const commonLessons = input.lessons.filter((l) => !l.isElective);

  // ── 선택과목 → 학점별 그룹 (선택군 편성) ──
  // 그룹 = (학년, 학점). K = 학생당 그 학점 최대 선택수. 균질 패턴이면 K = 패턴 multiplicity와 일치.
  //   예: grade-3 패턴 [5,4,4,3,2,2,1] → 5cr K=1·4cr K=2·3cr K=1·2cr K=2·1cr K=1 = 21칸(실제와 일치).
  // 학점 그룹핑은 라인 칸 일관성(같은 그룹=같은 학점)을 보장하고 코호트 메타에 의존하지 않는다.
  interface GroupAcc {
    grade: Grade;
    credits: number;
    subjects: Set<string>;
    subjectTeachers: Map<string, Set<string>>;
    studentSubjects: Map<string, Set<string>>; // studentCode -> subjects
  }
  const groups = new Map<string, GroupAcc>();

  for (const l of electiveLessons) {
    const credits = subjCredits.get(`${l.grade}|${l.subjectName}`) ?? 1;
    const key = `${l.grade}:cr${credits}`;
    let acc = groups.get(key);
    if (!acc) {
      acc = { grade: l.grade, credits, subjects: new Set(), subjectTeachers: new Map(), studentSubjects: new Map() };
      groups.set(key, acc);
    }
    acc.subjects.add(l.subjectName);
    if (l.teacherId) {
      const ts = acc.subjectTeachers.get(l.subjectName) ?? new Set<string>();
      ts.add(l.teacherId);
      acc.subjectTeachers.set(l.subjectName, ts);
    }
    for (const code of l.studentCodes) {
      const ss = acc.studentSubjects.get(code) ?? new Set<string>();
      ss.add(l.subjectName);
      acc.studentSubjects.set(code, ss);
    }
  }

  // 학점 그룹의 표시명: 그룹 과목 다수가 같은 선택군이면 그 이름, 아니면 "N학점"
  const displayName = (grade: number, subjects: Set<string>, credits: number): string => {
    const names = subjGroupName.get(grade);
    if (names) {
      const counts = new Map<string, number>();
      for (const s of subjects) { const n = names.get(s); if (n) counts.set(n, (counts.get(n) ?? 0) + 1); }
      let best: string | null = null, bestN = 0;
      for (const [n, c] of counts) if (c > bestN) { bestN = c; best = n; }
      if (best && bestN * 2 >= subjects.size) return best; // 과반이 한 선택군 → 그 이름
    }
    return `${credits}학점`;
  };

  const electiveGroups: ElectiveGroupInput[] = [];
  const groupMeta = new Map<string, GroupMeta>();
  for (const [key, acc] of groups) {
    let K = 1;
    for (const ss of acc.studentSubjects.values()) K = Math.max(K, ss.size);
    electiveGroups.push({
      key,
      lines: K,
      capacity: DEFAULT_CAPACITY,
      students: [...acc.studentSubjects.entries()].map(([code, subs]) => ({ code, subjects: [...subs] })),
    });
    const subjectTeachers = new Map<string, string[]>();
    for (const [subj, ts] of acc.subjectTeachers) subjectTeachers.set(subj, [...ts]);
    groupMeta.set(key, { grade: acc.grade, groupName: displayName(acc.grade, acc.subjects, acc.credits), lineCredits: acc.credits, subjectTeachers });
  }

  // ── 공통과목 → (반, 과목, 교사) CommonSpec ──
  // 핵심: 팀티칭(공동수업) 공통은 한 반의 학점이 여러 교사로 나뉜다(예: 통합과학1 4학점 = 4교사×1교시).
  // (반,과목)으로만 묶고 교사 1명에 전 학점을 몰면 그 교사 부하가 허위로 폭증해(t0 통합과학 39교시)
  // 공통영역(nonBand)을 초과 → 구조적 강제 교사충돌이 생긴다. 교사별로 분리해 실제 분담을 보존한다.
  const commonAcc = new Map<string, CommonSpec>();
  for (const l of commonLessons) {
    const classKey = l.classKeys[0] ?? `${l.grade}-?`;
    const tkey = l.teacherId ?? '∅';
    const id = `${classKey}|${l.subjectName}|${tkey}`;
    let spec = commonAcc.get(id);
    if (!spec) {
      spec = { id, grade: l.grade, classKey, subject: l.subjectName, credits: 0, teacherId: l.teacherId, lessonIds: [] };
      commonAcc.set(id, spec);
    }
    spec.credits += 1;
    spec.lessonIds.push(l.id);
  }
  const commons = [...commonAcc.values()];

  // ── 창체(자율·동아리) → ActivitySpec (고정 블록) ──
  const activities: ActivitySpec[] = input.fixedBlocks.map((b) => ({
    id: b.id,
    grade: b.grade,
    label: b.label,
    credits: b.cells.length,
    teachers: b.teacherId ? [b.teacherId] : [],
    cells: b.cells.map((c) => `${c.dayIndex}|${c.period}`),
  }));

  const blockedByGrade: Record<number, string[]> = {};
  for (const [g, cells] of Object.entries(config.blockedCellsByGrade ?? {})) {
    blockedByGrade[Number(g)] = cells.map((c) => `${c.dayIndex}|${c.period}`);
  }

  return {
    grid: input.grid,
    grades,
    academicYear: config.academicYear,
    semester: config.semester,
    blockedByGrade,
    electiveGroups,
    groupMeta,
    commons,
    activities,
    lessons: input.lessons,
  };
}
