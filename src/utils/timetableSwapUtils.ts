/**
 * Utility functions for finding swappable timetable classes
 *
 * Constraints for swappable classes:
 * - **수강생이 맞아야 한다** (2026-10-12) — 맞바꾼 시간에 어느 학생도 두 수업에 동시에 들어가면
 *   안 된다. 학년-반 표기(`grade`·`class_number`)는 학급일 때도, 선택과목 **분반 번호**일 때도
 *   있어(2026-2 실측: `미적분Ⅰ 2-7` 학생은 세 학급에서 온다) 표기만으로는 판정할 수 없다.
 *   명단 판정은 서버 `get_swap_roster_fit` 가 하고, 명단을 모를 때만 표기로 판정한다.
 * - Different teacher
 * - Target teacher must be free at candidate's time slot
 * - Candidate teacher must be free at target's time slot
 */

// 타입만 쓴다 — 값으로 import 하면 훅·supabase 클라이언트까지 딸려와
// 이 순수 모듈을 노드 스크립트(회귀 테스트)에서 부를 수 없다.
import type { TimetableEntry } from '@/hooks/useTimetable';

/**
 * 한 후보 수업에 대한 수강생 판정 — 서버 `get_swap_roster_fit` 한 행.
 *
 * 교체가 성립하려면
 *  · 상대 학생 중 **내 수업에 없는** 학생이 내 시간에 다른 수업이 없어야 하고(`theirConflictCount`)
 *  · 내 학생 중 **상대 수업에 없는** 학생이 상대 시간에 다른 수업이 없어야 한다(`myConflictCount`).
 * 수강생이 똑같으면 둘 다 저절로 0이다.
 */
export interface LessonRosterFit {
  myCount: number;
  theirCount: number;
  sharedCount: number;
  theirConflictCount: number;
  /** 겹치는 학생 표본(최대 3명) */
  theirConflictNames: string[];
  myConflictCount: number;
  myConflictNames: string[];
}

/**
 * 후보의 수강생 상태.
 * - `same`       수강생이 똑같다
 * - `compatible` 수강생은 다르지만 맞바꿔도 겹치는 학생이 없다(다른 학생은 그 시간이 비어 있다)
 * - `conflict`   맞바꾸면 그 시간에 두 수업에 들어가야 하는 학생이 있다 → 교체 불가
 * - `unknown`    명단이 없어 학년-반 표기로만 판정했다
 */
export type RosterStatus = 'same' | 'compatible' | 'conflict' | 'unknown';

/** (교사, 요일, 교시) — 서버 판정과 시간표 항목을 잇는 열쇠 */
export function lessonKey(resourceId: string | undefined, weekday: number, period: number): string {
  return `${resourceId ?? ''}|${weekday}|${period}`;
}

/** 내 수업의 수강생 판정 묶음(열쇠 = `lessonKey`) */
export type RosterFitIndex = Map<string, LessonRosterFit>;

export interface SwapCandidate {
  entry: TimetableEntry;
  conflicts: number;
  canSwap: boolean;
  /** 선생님 시간이 겹친다(어느 한쪽) */
  teacherConflict: boolean;
  /** 맞바꾸면 시간이 겹치는 학생 수(양방향 합) */
  studentConflicts: number;
  rosterStatus: RosterStatus;
  rosterFit?: LessonRosterFit;
  /**
   * 어떻게 후보가 됐나 — `classroom` = 학년-반 표기가 같다, `roster` = 표기는 다르지만
   * 수강생이 맞아 교체할 수 있다(표기만 보던 때는 보이지 않던 후보).
   */
  matchedBy: 'classroom' | 'roster';
}

/**
 * 수강생 판정 한 행에서 상태를 유도한다.
 * 어느 한쪽 명단이 비어 있으면 판정 근거가 없다 — 그때는 `unknown`(표기로만 판정).
 */
export function rosterStatusOf(fit: LessonRosterFit | undefined): RosterStatus {
  if (!fit || fit.myCount === 0 || fit.theirCount === 0) return 'unknown';
  if (fit.theirConflictCount + fit.myConflictCount > 0) return 'conflict';
  if (fit.sharedCount === fit.myCount && fit.sharedCount === fit.theirCount) return 'same';
  return 'compatible';
}

/**
 * 동아리활동으로 보이는 과목명.
 * `activity_type` 이 없는 경로(class_swap 전개 항목 등)를 위한 **폴백**이며,
 * 값이 있으면 언제나 `activity_type` 이 우선한다.
 * 섹션명은 `"동아리활동 1-6"` 처럼 학년-반 접미가 붙으므로 접두만 비교한다.
 */
const CLUB_SUBJECT_NAMES = ['동아리활동', '동아리'];

/**
 * 교체할 수 없는 `teacher_timetable.activity_type`.
 *
 * **동아리활동 하나뿐이다** — 라이브 값은 `subject`/`autonomy`/`career`/`club` 4종이고
 * 파서(`parseTeacherTimetableXlsx`)가 `volunteer`/`self_study`/`other` 를 더 만들 수 있다.
 * 허용 목록(`=== 'subject'`)이 아니라 **차단 목록**인 이유가 여기 있다: 새 창체 영역이
 * 생겨도 조용히 교체 불가가 되지 않는다.
 */
const NON_SWAPPABLE_ACTIVITY_TYPES = new Set(['club']);

/**
 * 수업 교체가 가능한 수업인가 (2026-09-15 사용자 결정 — 2026-08-14 규칙 완화).
 *
 * **막는 것은 동아리활동뿐이다.** 동아리는 학생이 **학급이 아니라 동아리 단위로 모이고**
 * 담당 교사도 그 동아리에 묶여 있어, 같은 학급의 다른 수업과 시간을 맞바꾼다는 개념이
 * 성립하지 않는다. 반대로 자율·자치활동과 진로활동은 **학급 단위로 담임이 맡는 시간**이라
 * 다른 교과와 시간을 맞바꾸는 것이 실제 운영과 맞는다
 * (라이브 2026-2 실측: 창체 슬롯마다 같은 학급의 다른 교사 수업이 ~30건 존재).
 *
 * 판정 정본은 `teacher_timetable.activity_type`(라이브 전 행이 채워져 있다)이고,
 * 그 값이 없는 항목만 과목명으로 폴백한다.
 *
 * **대체(substitute)는 처음부터 막지 않는다** — 그 시간에 누군가는 학생을 봐야 하므로
 * 대신 맡아줄 교사를 찾는 것은 오히려 정상적인 요구다.
 */
export function isSwappableLesson(entry: TimetableEntry): boolean {
  if (entry.activity_type) return !NON_SWAPPABLE_ACTIVITY_TYPES.has(entry.activity_type);

  const name = (entry.subject ?? entry.section_name ?? '').replace(/\s+/g, '');
  if (!name) return true;
  return !CLUB_SUBJECT_NAMES.some((activity) => name.startsWith(activity.replace(/\s+/g, '')));
}

/**
 * 학년·반 동일성 판정.
 *
 * `grade`/`class_number` 는 출처마다 표기가 갈린다 — `section.meta` 는 JSON 숫자,
 * RPC 는 정수, `class_swap.meta` 는 문자열이다. `!==` 로 직접 비교하면 3 과 '3' 이
 * 다르다고 판정되어 **모든 후보가 조용히 걸러진다**(2026-08-14 장애). 표기 차이를
 * 여기서 흡수해, 새 출처가 붙어도 같은 실패가 재발하지 않게 한다.
 */
function sameClassroom(a: TimetableEntry, b: TimetableEntry): boolean {
  const norm = (value: unknown) =>
    value === null || value === undefined ? '' : String(value).trim();
  return (
    norm(a.grade) === norm(b.grade) &&
    norm(a.class_number) === norm(b.class_number)
  );
}

/**
 * Find all classes that can be swapped with the target class
 * @param targetEntry The class to find swap candidates for
 * @param allEntries All timetable entries
 * @param rosterFit 내 수업의 수강생 판정(`get_swap_roster_fit`). 없으면(`null`) 종전처럼
 *        학년-반 표기로만 판정하고 모든 후보가 `unknown` 이 된다.
 * @returns Array of swap candidates with conflict information
 */
export function findSwappableClasses(
  targetEntry: TimetableEntry,
  allEntries: TimetableEntry[],
  rosterFit: RosterFitIndex | null = null
): SwapCandidate[] {
  // Only pattern entries (regular classes) can be swapped
  if (targetEntry.type !== 'pattern') {
    return [];
  }

  // 동아리는 양방향 모두 교체 대상이 아니다 — 내 수업이 동아리면 후보 자체가 없다.
  if (!isSwappableLesson(targetEntry)) {
    return [];
  }

  // Extract grade and class from section_name if not directly available
  const targetGrade = targetEntry.grade;
  const targetClass = targetEntry.class_number;

  // If we don't have grade/class info, we can't find swaps
  if (!targetGrade || !targetClass) {
    return [];
  }

  const fitOf = (entry: TimetableEntry) =>
    rosterFit?.get(lessonKey(entry.resource_id, entry.weekday, entry.period));

  // Step 1: 후보 = 학년-반 표기가 같은 수업 ∪ 표기는 달라도 수강생이 맞는 수업
  const candidateEntries: Array<{ entry: TimetableEntry; matchedBy: SwapCandidate['matchedBy'] }> =
    [];
  for (const entry of allEntries) {
    // Must be a pattern entry
    if (entry.type !== 'pattern') continue;

    // 동아리는 상대 쪽도 교체 대상이 아니다
    if (!isSwappableLesson(entry)) continue;

    // Must be a different teacher
    if (entry.resource_id === targetEntry.resource_id) continue;

    // Don't compare with self
    if (entry.id === targetEntry.id) continue;

    if (sameClassroom(entry, targetEntry)) {
      candidateEntries.push({ entry, matchedBy: 'classroom' });
      continue;
    }

    // 표기가 다른 수업은 **학생이 겹치고, 맞바꿔도 아무도 겹치지 않을 때만** 후보에 올린다.
    // 학생이 겹친다는 이유만으로 다 올리면 선택과목 학생이 듣는 수십 개 수업이
    // "불가" 목록을 채워 정작 볼 것을 가린다.
    const fit = fitOf(entry);
    const status = rosterStatusOf(fit);
    if (fit && fit.sharedCount > 0 && (status === 'same' || status === 'compatible')) {
      candidateEntries.push({ entry, matchedBy: 'roster' });
    }
  }

  // Step 2: For each candidate, check for time slot conflicts
  const candidates: SwapCandidate[] = candidateEntries.map(({ entry: candidateEntry, matchedBy }) => {
    let conflicts = 0;
    let teacherConflict = false;

    // Check if target teacher has another class at candidate's time
    const targetTeacherConflict = allEntries.some(e =>
      e.resource_id === targetEntry.resource_id &&
      e.weekday_time === candidateEntry.weekday_time &&
      e.id !== targetEntry.id
    );

    if (targetTeacherConflict) {
      conflicts++;
      teacherConflict = true;
    }

    // Check if candidate teacher has another class at target's time
    const candidateTeacherConflict = allEntries.some(e =>
      e.resource_id === candidateEntry.resource_id &&
      e.weekday_time === targetEntry.weekday_time &&
      e.id !== candidateEntry.id
    );

    if (candidateTeacherConflict) {
      conflicts++;
      teacherConflict = true;
    }

    // 수강생 — 맞바꾼 시간에 두 수업에 들어가야 하는 학생이 있으면 교체할 수 없다
    const fit = fitOf(candidateEntry);
    const rosterStatus = rosterStatusOf(fit);
    const studentConflicts =
      rosterStatus === 'conflict' && fit ? fit.theirConflictCount + fit.myConflictCount : 0;
    if (studentConflicts > 0) conflicts++;

    return {
      entry: candidateEntry,
      conflicts,
      canSwap: !teacherConflict && studentConflicts === 0,
      teacherConflict,
      studentConflicts,
      rosterStatus,
      rosterFit: fit,
      matchedBy,
    };
  });

  // Sort: swappable candidates first, then by weekday/period
  return candidates.sort((a, b) => {
    // Swappable first
    if (a.canSwap && !b.canSwap) return -1;
    if (!a.canSwap && b.canSwap) return 1;

    // Then by conflicts (fewer is better)
    if (a.conflicts !== b.conflicts) return a.conflicts - b.conflicts;

    // Then by weekday
    if (a.entry.weekday !== b.entry.weekday) {
      return a.entry.weekday - b.entry.weekday;
    }

    // Finally by period
    return a.entry.period - b.entry.period;
  });
}

/** "김OO, 이OO, 박OO 외 9명" — 표본 이름 + 나머지 수 */
function namesWithRest(names: string[], total: number): string {
  const shown = names.slice(0, 3);
  const rest = total - shown.length;
  if (shown.length === 0) return `${total}명`;
  return rest > 0 ? `${shown.join(', ')} 외 ${rest}명` : shown.join(', ');
}

/**
 * 수강생 때문에 교체할 수 없는 이유. 판정이 `conflict` 가 아니면 빈 배열.
 * "누가 어느 시간에 겹치는지"를 말해야 신청자가 표기만 같은 수업이라는 것을 알아챈다.
 */
export function getRosterConflictReasons(
  targetEntry: TimetableEntry,
  candidateEntry: TimetableEntry,
  fit: LessonRosterFit | undefined
): string[] {
  if (!fit || rosterStatusOf(fit) !== 'conflict') return [];
  const reasons: string[] = [
    fit.sharedCount === 0
      ? `수강생이 다른 수업입니다 (내 수업 ${fit.myCount}명 · 이 수업 ${fit.theirCount}명, 같은 학생 없음)`
      : `수강생이 다릅니다 (내 수업 ${fit.myCount}명 · 이 수업 ${fit.theirCount}명 중 같은 학생 ${fit.sharedCount}명)`,
  ];
  if (fit.theirConflictCount > 0) {
    reasons.push(
      `이 수업 학생 ${namesWithRest(fit.theirConflictNames, fit.theirConflictCount)}이(가) ${formatWeekday(targetEntry.weekday)} ${targetEntry.period}교시에 다른 수업이 있습니다`
    );
  }
  if (fit.myConflictCount > 0) {
    reasons.push(
      `내 수업 학생 ${namesWithRest(fit.myConflictNames, fit.myConflictCount)}이(가) ${formatWeekday(candidateEntry.weekday)} ${candidateEntry.period}교시에 다른 수업이 있습니다`
    );
  }
  return reasons;
}

/**
 * Get a human-readable description of why a swap cannot happen
 */
export function getSwapConflictReason(
  targetEntry: TimetableEntry,
  candidateEntry: TimetableEntry,
  allEntries: TimetableEntry[]
): string[] {
  const reasons: string[] = [];

  // Check if target teacher has another class at candidate's time
  const targetTeacherConflict = allEntries.find(e =>
    e.resource_id === targetEntry.resource_id &&
    e.weekday_time === candidateEntry.weekday_time &&
    e.id !== targetEntry.id
  );

  if (targetTeacherConflict) {
    reasons.push(
      `${targetEntry.teacher_name} 선생님이 해당 시간(${formatWeekday(candidateEntry.weekday)} ${candidateEntry.period}교시)에 다른 수업이 있습니다: ${targetTeacherConflict.subject}`
    );
  }

  // Check if candidate teacher has another class at target's time
  const candidateTeacherConflict = allEntries.find(e =>
    e.resource_id === candidateEntry.resource_id &&
    e.weekday_time === targetEntry.weekday_time &&
    e.id !== candidateEntry.id
  );

  if (candidateTeacherConflict) {
    reasons.push(
      `${candidateEntry.teacher_name} 선생님이 해당 시간(${formatWeekday(targetEntry.weekday)} ${targetEntry.period}교시)에 다른 수업이 있습니다: ${candidateTeacherConflict.subject}`
    );
  }

  return reasons;
}

/**
 * Format weekday number to Korean day name
 */
export function formatWeekday(weekday: number): string {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return days[weekday === 7 ? 0 : weekday] + '요일';
}
