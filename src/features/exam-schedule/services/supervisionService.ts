import { supabase } from '@/integrations/supabase/client';
import type {
  Grade,
  SupervisionLedgerEntry,
  SupervisionTeacher,
  SupervisorPlan,
} from '../types';

/**
 * meta.section 키 "과목명 학년-분반" 파싱. 분반 식별자는 숫자 반("한문 2-1")
 * 외에 자유 문자열("한문Ⅱ 3-3학년 1반 한문")도 존재하므로 학년 뒤는 제한하지
 * 않는다. greedy 매칭으로 마지막 " 학년-" 경계에서 분리된다.
 */
const SECTION_KEY_RE = /^(.+)\s(\d+)-(.+)$/;
/** 담임 태그 "N학년 M반" (rescue-note·course-analyze와 동일 규칙) */
const HOMEROOM_TAG_RE = /^(\d+)학년\s*(\d+)반$/;
/** 이 태그가 붙은 교사는 감독 배정에서 고정 제외 (교장·교감, 고사 본부 운영) */
const SUPERVISION_EXCLUDED_TAGS = new Set(['학교관리자', '고사운영교사']);

/**
 * 정규화 시간표(teacher_timetable)에서 최신 학기의 교사별 분반 수 집계.
 * `${과목명}|${학년}` -> 교사 resource id -> distinct class_label 수.
 * meta.section보다 신뢰도가 높은 1차 소스 (비표준 section 키 파싱 실패 보완).
 */
async function fetchTimetableSectionCounts(): Promise<Map<string, Map<string, number>>> {
  const { data, error } = await supabase
    .from('teacher_timetable' as never)
    .select('teacher_resource_id, grade, subject_name, class_label, academic_year, semester');
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<{
    teacher_resource_id: string | null;
    grade: number | null;
    subject_name: string | null;
    class_label: string | null;
    academic_year: number;
    semester: number;
  }>;

  // 최신 (학년도, 학기)만 사용 — 감독 배정은 현재 학기 기준
  let latestYear = -Infinity;
  let latestSem = -Infinity;
  for (const r of rows) {
    if (
      r.academic_year > latestYear ||
      (r.academic_year === latestYear && r.semester > latestSem)
    ) {
      latestYear = r.academic_year;
      latestSem = r.semester;
    }
  }

  // teacherId -> (`${과목명}|${학년}` -> distinct class_label 집합)
  const labels = new Map<string, Map<string, Set<string>>>();
  for (const r of rows) {
    if (r.academic_year !== latestYear || r.semester !== latestSem) continue;
    if (!r.teacher_resource_id || !r.subject_name) continue;
    if (!r.grade || r.grade < 1 || r.grade > 3) continue;
    const key = `${r.subject_name.trim()}|${r.grade}`;
    let byKey = labels.get(r.teacher_resource_id);
    if (!byKey) {
      byKey = new Map();
      labels.set(r.teacher_resource_id, byKey);
    }
    let set = byKey.get(key);
    if (!set) {
      set = new Set();
      byKey.set(key, set);
    }
    set.add(r.class_label ?? '');
  }

  const counts = new Map<string, Map<string, number>>();
  for (const [tid, byKey] of labels) {
    const m = new Map<string, number>();
    for (const [key, set] of byKey) m.set(key, set.size);
    counts.set(tid, m);
  }
  return counts;
}

/**
 * 감독 배정용 교사 목록.
 * - 과목별 분반 수: teacher_timetable(최신 학기, 1차) + meta.section 파싱(보조)을
 *   키별 max로 병합
 * - resource_tags("N학년 M반") → 담임 반
 * - meta.exclude_supervision = true인 교사(테스트 계정 등)는 제외
 */
export async function fetchSupervisionTeachers(): Promise<SupervisionTeacher[]> {
  const [{ data, error }, timetableCounts] = await Promise.all([
    supabase.from('resource').select('id, name, meta').eq('type', 'teacher').order('name'),
    fetchTimetableSectionCounts(),
  ]);
  if (error) throw error;

  const teachers = (data ?? []).filter((t) => {
    const meta = (t.meta ?? {}) as Record<string, unknown>;
    return meta.exclude_supervision !== true;
  });

  // 담임 태그 일괄 조회
  const { data: tagRows, error: tagErr } = await supabase
    .from('resource_tag_assignments')
    .select('resource_id, resource_tags(name)');
  if (tagErr) throw tagErr;

  const homeroomByResource = new Map<string, { grade: Grade; classNum: number }>();
  const excludedByTag = new Set<string>();
  for (const row of (tagRows ?? []) as Array<{
    resource_id: string;
    resource_tags: { name: string } | { name: string }[] | null;
  }>) {
    const tags = Array.isArray(row.resource_tags)
      ? row.resource_tags
      : row.resource_tags
        ? [row.resource_tags]
        : [];
    for (const t of tags) {
      if (t.name && SUPERVISION_EXCLUDED_TAGS.has(t.name)) {
        excludedByTag.add(row.resource_id);
        continue;
      }
      const m = t.name?.match(HOMEROOM_TAG_RE);
      if (!m) continue;
      const grade = Number(m[1]);
      const classNum = Number(m[2]);
      if (grade >= 1 && grade <= 3 && Number.isFinite(classNum)) {
        homeroomByResource.set(row.resource_id, {
          grade: grade as Grade,
          classNum,
        });
      }
    }
  }

  return teachers
    .filter((t) => !excludedByTag.has(t.id as string))
    .map((t) => {
    const meta = (t.meta ?? {}) as Record<string, unknown>;
    const section = (meta.section ?? {}) as Record<string, unknown>;
    const sectionCounts: Record<string, number> = {};
    for (const key of Object.keys(section)) {
      const m = key.match(SECTION_KEY_RE);
      if (!m) continue;
      const subjectName = m[1].trim();
      const grade = Number(m[2]);
      if (grade < 1 || grade > 3) continue;
      const k = `${subjectName}|${grade}`;
      sectionCounts[k] = (sectionCounts[k] ?? 0) + 1;
    }
    // teacher_timetable 집계를 키별 max로 병합 — 두 소스 모두 "분반 수"이므로
    // 합산하면 이중 집계가 된다
    for (const [k, cnt] of timetableCounts.get(t.id as string) ?? []) {
      sectionCounts[k] = Math.max(sectionCounts[k] ?? 0, cnt);
    }
    return {
      id: t.id as string,
      name: t.name as string,
      homeroom: homeroomByResource.get(t.id as string) ?? null,
      sectionCounts,
    };
  });
}

/**
 * 교사별 누적 감독 횟수.
 * - 확정(finalized)된 다른 감독표의 배정 좌석 수 합산 (현재 편집 중인 행 제외)
 * - exam_supervision_adjustment의 수동 보정 delta 합산
 */
export async function fetchSupervisionLedger(
  excludeScheduleId?: string,
): Promise<Map<string, SupervisionLedgerEntry>> {
  const ledger = new Map<string, SupervisionLedgerEntry>();
  const entryOf = (teacherId: string): SupervisionLedgerEntry => {
    let e = ledger.get(teacherId);
    if (!e) {
      e = { teacherId, pastCount: 0, adjustment: 0 };
      ledger.set(teacherId, e);
    }
    return e;
  };

  const { data: rows, error } = await supabase
    .from('exam_schedule' as never)
    .select('id, status, supervisor_assignments')
    .eq('status', 'finalized')
    .not('supervisor_assignments', 'is', null);
  if (error) throw error;

  for (const row of (rows ?? []) as unknown as Array<{
    id: string;
    supervisor_assignments: SupervisorPlan | null;
  }>) {
    if (excludeScheduleId && row.id === excludeScheduleId) continue;
    for (const room of row.supervisor_assignments?.rooms ?? []) {
      for (const t of room.teachers ?? []) {
        if (t?.id) entryOf(t.id).pastCount++;
      }
    }
  }

  const { data: adjustments, error: adjErr } = await supabase
    .from('exam_supervision_adjustment' as never)
    .select('teacher_resource_id, delta');
  if (adjErr) throw adjErr;

  for (const a of (adjustments ?? []) as unknown as Array<{
    teacher_resource_id: string;
    delta: number;
  }>) {
    entryOf(a.teacher_resource_id).adjustment += a.delta ?? 0;
  }

  return ledger;
}

export async function addSupervisionAdjustment(args: {
  teacherResourceId: string;
  delta: number;
  reason?: string;
}): Promise<void> {
  const { error } = await supabase.from('exam_supervision_adjustment' as never).insert({
    teacher_resource_id: args.teacherResourceId,
    delta: args.delta,
    reason: args.reason ?? null,
  } as never);
  if (error) throw error;
}
