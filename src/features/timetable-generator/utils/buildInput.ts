import { categorizeSubject, DEFAULT_GRID, DEFAULT_OPTIONS, DEFAULT_WEIGHTS, isActivitySubject, isMajorCategory } from '../constants';
import type {
  FixedBlock,
  Grade,
  GridConfig,
  Lesson,
  PinnedLesson,
  TimetableHardOptions,
  TimetableInput,
  TimetableOptions,
  TimetableWeights,
} from '../types';

/** 공동수업 교사 분담 (course_offering.meta.teacher_split). lessons 합 = credits */
export interface TeacherSplit {
  teacher_resource_id: string;
  teacher_name: string | null;
  lessons: number;
}

/** course_offering 행 (필요 컬럼만) */
export interface OfferingRow {
  id: string;
  /** 학생 시간표에서 복원한 가상 강좌가 가리키는 실제 DB 강좌 ID. */
  sourceOfferingIds?: string[];
  grade: number;
  subject_name: string;
  credits: number | null;
  class_label: string | null;
  teacher_name: string | null;
  teacher_resource_id: string | null;
  room_no: string | null;
  classroom: string | null;
  /** 공동수업 실제 교사 분담 (teacher_timetable에서 추출, roster-bearing 행에 기록). 균등 라운드로빈으로
   *  복원 불가능한 불균등 분담(예: 강시우 3 + 장은호 1)·선택과목 공동수업의 진실값. */
  meta?: { teacher_split?: TeacherSplit[] } | null;
}

/** 선택군 그룹 (course_selection_group/slot 집계). block-structured 솔버의 라인 수(K=pick_count) 출처. */
export interface SelectionGroupRow {
  targetGrade: number;
  /** "N학년 " 접두어 제거 정규화 그룹명 */
  groupName: string;
  /** 이 그룹에서 학생이 고르는 과목 수 = 펼칠 라인 수 */
  pickCount: number;
  subjects: string[];
}

/** student_enrollment 행 (필요 컬럼만). student_class는 DB상 text */
export interface EnrollmentRow {
  course_offering_id: string;
  student_resource_id: string | null;
  student_grade: number | null;
  student_class: string | number | null;
  student_no: number | null;
  student_name: string | null;
}

export interface CellRef {
  dayIndex: number;
  period: number;
}

/** 창체/고정 활동 블록 설정 (UI에서 지정) */
export interface ActivityBlockConfig {
  label: string;
  grade: Grade;
  scope: 'grade' | 'class';
  classLabel: string | null;
  teacherId: string | null;
  teacherName: string | null;
  cells: CellRef[];
}

export interface BuildInputConfig {
  academicYear: number;
  sourceBasis?: 'student-timetable' | 'enrollment';
  semester: number;
  grades: Grade[];
  grid?: GridConfig;
  /** 학년별 배치 금지 칸 (점심/단축 등) */
  blockedCellsByGrade?: Partial<Record<number, CellRef[]>>;
  /** 반별("학년-반") 배치 금지 칸 */
  blockedCellsByClass?: Record<string, CellRef[]>;
  /** 교사(resource.id)별 수업 불가 시간 */
  teacherUnavailable?: Record<string, CellRef[]>;
  /** 창체/고정 블록 */
  activityBlocks?: ActivityBlockConfig[];
  pinned?: PinnedLesson[];
  /** hard도 부분 지정 허용 — DEFAULT_OPTIONS.hard와 merge된다 (예: TEACHER_HARD_OFF) */
  options?: Partial<Omit<TimetableOptions, 'hard'>> & { hard?: Partial<TimetableHardOptions> };
  weights?: Partial<TimetableWeights>;
}

function cellStr(c: CellRef): string {
  return `${c.dayIndex}|${c.period}`;
}

/** "6반" / "1학년 6반" / "6" → 반 번호 */
function parseClassNum(label: string | null): number | null {
  if (!label) return null;
  const m = label.match(/(\d+)\s*반/) ?? label.match(/^(\d+)$/);
  return m ? Number(m[1]) : null;
}

function classKey(grade: number, classNum: number | string): string {
  return `${grade}-${classNum}`;
}

/** teacher_split을 lesson별 교사 시퀀스로 전개 (각 원소 = 한 교시의 담당 교사) */
function lessonsFromSplit(split: TeacherSplit[]): Array<{ teacherId: string | null; teacherName: string | null }> {
  const seq: Array<{ teacherId: string | null; teacherName: string | null }> = [];
  for (const s of split) {
    const n = Math.max(0, Math.floor(s.lessons));
    for (let i = 0; i < n; i++) seq.push({ teacherId: s.teacher_resource_id, teacherName: s.teacher_name });
  }
  return seq;
}

/**
 * 원시 DB 행 + 설정 → TimetableInput.
 * - 자율·동아리 등 고정 활동은 제외하며 진로활동은 배치 대상으로 유지한다.
 * - 강좌는 credits개의 Lesson 인스턴스로 펼친다.
 * - 각 Lesson의 blockedCells = 학년 차단 ∪ 점유 반들의 차단 ∪ 교사 불가 ∪ 창체 점유.
 */
export function buildTimetableInput(
  offerings: OfferingRow[],
  enrollments: EnrollmentRow[],
  config: BuildInputConfig,
): TimetableInput {
  const grid = config.grid ?? DEFAULT_GRID;
  const gradeSet = new Set(config.grades);

  // 강좌별 수강 명단 집계 + 학급별 학생 명단(진로활동 등 명단 없는 반-단위 수업 보정용)
  const rosterByOffering = new Map<string, EnrollmentRow[]>();
  const classRoster = new Map<string, Set<string>>();
  for (const e of enrollments) {
    // 원본 수강 보고서의 학적 표시. 기록은 보존하되 생성·진로 반 명단에는 넣지 않는다.
    if (/^\s*\(미재학\)/.test(e.student_name ?? '')) continue;
    const arr = rosterByOffering.get(e.course_offering_id) ?? [];
    arr.push(e);
    rosterByOffering.set(e.course_offering_id, arr);
    if (e.student_resource_id && e.student_grade != null) {
      const cn = parseClassNum(e.student_class != null ? String(e.student_class) : null);
      if (cn != null) {
        const ck = classKey(e.student_grade, cn);
        const set = classRoster.get(ck) ?? new Set<string>();
        set.add(e.student_resource_id);
        classRoster.set(ck, set);
      }
    }
  }

  // 학년 차단칸 (문자열)
  const gradeBlocked = new Map<number, Set<string>>();
  for (const [g, cells] of Object.entries(config.blockedCellsByGrade ?? {})) {
    gradeBlocked.set(Number(g), new Set(cells.map(cellStr)));
  }
  const classBlocked = new Map<string, Set<string>>();
  for (const [ck, cells] of Object.entries(config.blockedCellsByClass ?? {})) {
    classBlocked.set(ck, new Set(cells.map(cellStr)));
  }
  const teacherBlocked = new Map<string, Set<string>>();
  for (const [tid, cells] of Object.entries(config.teacherUnavailable ?? {})) {
    teacherBlocked.set(tid, new Set(cells.map(cellStr)));
  }

  // 창체 점유칸: 학년 전체 / 특정 반
  const activityGradeCells = new Map<number, Set<string>>();
  const activityClassCells = new Map<string, Set<string>>();
  const fixedBlocks: FixedBlock[] = [];
  for (const [i, b] of (config.activityBlocks ?? []).entries()) {
    fixedBlocks.push({
      id: `fixed-${i}`,
      label: b.label,
      grade: b.grade,
      scope: b.scope,
      classLabel: b.classLabel,
      teacherId: b.teacherId,
      teacherName: b.teacherName,
      cells: b.cells.map((c) => ({ dayIndex: c.dayIndex, period: c.period })),
    });
    const keys = b.cells.map(cellStr);
    if (b.scope === 'grade') {
      const set = activityGradeCells.get(b.grade) ?? new Set();
      keys.forEach((k) => set.add(k));
      activityGradeCells.set(b.grade, set);
    } else {
      const cn = parseClassNum(b.classLabel);
      if (cn != null) {
        const ck = classKey(b.grade, cn);
        const set = activityClassCells.get(ck) ?? new Set();
        keys.forEach((k) => set.add(k));
        activityClassCells.set(ck, set);
      }
    }
  }

  // 차단칸 합성: 학년 차단 ∪ 점유 반 차단 ∪ 교사 불가 ∪ 창체 점유
  const composeBlocked = (grade: number, classKeys: string[], teacherId: string | null): string[] => {
    const blocked = new Set<string>();
    for (const k of gradeBlocked.get(grade) ?? []) blocked.add(k);
    for (const k of activityGradeCells.get(grade) ?? []) blocked.add(k);
    for (const ck of classKeys) {
      for (const k of classBlocked.get(ck) ?? []) blocked.add(k);
      for (const k of activityClassCells.get(ck) ?? []) blocked.add(k);
    }
    if (teacherId) for (const k of teacherBlocked.get(teacherId) ?? []) blocked.add(k);
    return [...blocked];
  };

  // student_enrollment.student_class는 "1반" 같은 텍스트라 숫자로 정규화해야
  // class_label(phantom)에서 만든 키와 일치한다 (그래야 공동수업이 병합된다).
  const rosterClassKeys = (roster: EnrollmentRow[]): string[] => {
    const s = new Set<string>();
    for (const r of roster) {
      if (r.student_grade == null) continue;
      const cn = parseClassNum(r.student_class != null ? String(r.student_class) : null);
      if (cn != null) s.add(classKey(r.student_grade, cn));
    }
    return [...s];
  };

  /**
   * 강좌를 "반-과목" 단위로 정규화. 공통과목은 (교사×반) 공동수업이 여러 행으로 중복
   * 기재될 수 있어(예: 통합과학1 한 반에 4명 교사·각 4학점), 한 단위(주당 credits교시)로
   * 합치고 교사를 라운드로빈 분담해야 교사 부하가 부풀지 않는다(credits=과목 총교시이지
   * 교사 1인 교시가 아님). 선택과목(수강생이 여러 반에 걸침)은 병렬 분반이라 합치지 않는다.
   */
  interface CommonUnit {
    grade: number;
    classNum: number;
    subject: string;
    credits: number;
    classLabel: string | null;
    roomId: string | null;
    teachers: Map<string, string | null>; // teacherId -> name (공동교사)
    roster: Map<string, EnrollmentRow>; // student_resource_id -> row (dedup)
    sourceOfferingIds: string[];
    split?: TeacherSplit[]; // roster-bearing 행의 실제 교사 분담 (있으면 라운드로빈 대신 사용)
  }
  const commonUnits = new Map<string, CommonUnit>();
  const electiveOfferings: OfferingRow[] = [];

  for (const off of offerings) {
    if (!gradeSet.has(off.grade as Grade)) continue;
    if (isActivitySubject(off.subject_name)) continue; // 창체는 배치 대상 아님
    if (off.subject_name.includes('공동')) continue; // 공동교육과정("(공동)…")은 정규 시간 수업이 아님 → 배치 제외
    const credits = Math.max(0, Math.floor(off.credits ?? 0));
    if (credits === 0) continue;

    const roster = rosterByOffering.get(off.id) ?? [];
    const rClasses = rosterClassKeys(roster);

    // 수강생이 한 반 이하(공통/팀티칭) vs 여러 반(선택과목 분반)
    if (rClasses.length <= 1) {
      const classNum =
        rClasses.length === 1 ? Number(rClasses[0].split('-')[1]) : parseClassNum(off.class_label);
      if (classNum == null) {
        electiveOfferings.push(off); // 반 미상 → 분반처럼 단독 처리
        continue;
      }
      const key = `${off.grade}|${classNum}|${off.subject_name}`;
      let unit = commonUnits.get(key);
      if (!unit) {
        unit = {
          grade: off.grade,
          classNum,
          subject: off.subject_name,
          credits,
          classLabel: off.class_label,
          roomId: off.classroom || off.room_no || null,
          teachers: new Map(),
          roster: new Map(),
          sourceOfferingIds: [],
        };
        commonUnits.set(key, unit);
      }
      unit.credits = Math.max(unit.credits, credits); // 과목 총 교시 (합산 아님)
      unit.sourceOfferingIds.push(...(off.sourceOfferingIds ?? [off.id]));
      if (off.teacher_resource_id) unit.teachers.set(off.teacher_resource_id, off.teacher_name);
      if (!unit.split && off.meta?.teacher_split && off.meta.teacher_split.length > 0) {
        unit.split = off.meta.teacher_split; // roster-bearing 행의 분담을 단위에 채택
      }
      for (const r of roster) if (r.student_resource_id) unit.roster.set(r.student_resource_id, r);
    } else {
      electiveOfferings.push(off);
    }
  }

  const lessons: Lesson[] = [];

  // 공통 단위 → 반-과목당 credits교시, 공동교사 라운드로빈 분담
  for (const unit of commonUnits.values()) {
    const ck = classKey(unit.grade, unit.classNum);
    let studentCodes = [...unit.roster.keys()];
    // 진로활동은 명단이 없어도 반 전체가 수강 → 반 명단으로 보정 (충돌 정상 반영)
    if (studentCodes.length === 0 && unit.subject.replace(/\s+/g, '') === '진로활동') {
      studentCodes = [...(classRoster.get(ck) ?? [])];
    }
    // 그 외 명단 없는 단위(선택과목 분반 잔재·데이터 공백)는 반 전체 수업이 아니므로 배치 제외
    if (studentCodes.length === 0) continue;
    const coTeachers = [...unit.teachers.entries()]; // [id, name][]
    // 분담(split)이 있으면 교사별 교시 수만큼 배분, 없으면 공동교사 라운드로빈
    const teacherSeq = unit.split && unit.split.length > 0 ? lessonsFromSplit(unit.split) : null;
    const count = teacherSeq ? teacherSeq.length : unit.credits;
    const category = categorizeSubject(unit.subject);
    const offeringId = `${unit.grade}-${unit.classNum}-${unit.subject}`;
    for (let k = 1; k <= count; k++) {
      const t = teacherSeq
        ? teacherSeq[(k - 1) % teacherSeq.length]
        : coTeachers.length > 0
          ? { teacherId: coTeachers[(k - 1) % coTeachers.length][0], teacherName: coTeachers[(k - 1) % coTeachers.length][1] }
          : { teacherId: null, teacherName: null };
      lessons.push({
        id: `${offeringId}#${k}`,
        offeringId,
        sourceOfferingIds: unit.sourceOfferingIds,
        subjectName: unit.subject,
        grade: unit.grade as Grade,
        classLabel: unit.classLabel,
        teacherId: t.teacherId,
        teacherName: t.teacherName,
        roomId: unit.roomId,
        studentCodes,
        studentCount: studentCodes.length,
        studentCountByClass: { [ck]: studentCodes.length },
        category,
        isMajor: isMajorCategory(category),
        isElective: false,
        classKeys: [ck],
        blockedCells: composeBlocked(unit.grade, [ck], t.teacherId),
      });
    }
  }

  // 선택과목(분반) → 강좌별 credits교시, 단일 교사, 명단 그대로
  for (const off of electiveOfferings) {
    const credits = Math.max(0, Math.floor(off.credits ?? 0));
    const roster = rosterByOffering.get(off.id) ?? [];
    const studentCodes = roster.map((r) => r.student_resource_id).filter((x): x is string => !!x);
    let classKeys = rosterClassKeys(roster);
    if (classKeys.length === 0) {
      const cn = parseClassNum(off.class_label);
      if (cn != null) classKeys = [classKey(off.grade, cn)];
    }
    const category = categorizeSubject(off.subject_name);
    // 학급별 수강 인원 (현재 보는 반 기준 표시용)
    const studentCountByClass: Record<string, number> = {};
    for (const r of roster) {
      if (r.student_grade == null) continue;
      const cn = parseClassNum(r.student_class != null ? String(r.student_class) : null);
      if (cn != null) {
        const ek = classKey(r.student_grade, cn);
        studentCountByClass[ek] = (studentCountByClass[ek] ?? 0) + 1;
      }
    }
    const roomId = off.classroom || off.room_no || null;
    // 공동수업 분담(teacher_split)이 있으면 교사별 교시 수만큼 배분, 없으면 단일 교사
    const teacherSeq =
      off.meta?.teacher_split && off.meta.teacher_split.length > 0 ? lessonsFromSplit(off.meta.teacher_split) : null;
    const count = teacherSeq ? teacherSeq.length : credits;
    for (let k = 1; k <= count; k++) {
      const t = teacherSeq
        ? teacherSeq[(k - 1) % teacherSeq.length]
        : { teacherId: off.teacher_resource_id, teacherName: off.teacher_name };
      lessons.push({
        id: `${off.id}#${k}`,
        offeringId: off.id,
        sourceOfferingIds: off.sourceOfferingIds ?? [off.id],
        subjectName: off.subject_name,
        grade: off.grade as Grade,
        classLabel: off.class_label,
        teacherId: t.teacherId,
        teacherName: t.teacherName,
        roomId,
        studentCodes,
        studentCount: studentCodes.length,
        studentCountByClass,
        category,
        isMajor: isMajorCategory(category),
        isElective: classKeys.length > 1,
        classKeys,
        blockedCells: composeBlocked(off.grade, classKeys, t.teacherId),
      });
    }
  }

  return {
    academicYear: config.academicYear,
    semester: config.semester,
    sourceBasis: config.sourceBasis,
    grades: [...config.grades].sort((a, b) => a - b),
    grid,
    lessons,
    fixedBlocks,
    pinned: config.pinned ?? [],
    options: { ...DEFAULT_OPTIONS, ...config.options, hard: { ...DEFAULT_OPTIONS.hard, ...config.options?.hard } },
    weights: { ...DEFAULT_WEIGHTS, ...config.weights },
  };
}
