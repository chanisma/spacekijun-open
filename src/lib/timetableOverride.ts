/**
 * 운영 시간표(기간 한정 임시 시간표) — 엑셀 파싱 + «그날 실제로 들어가는 수업» 조회.
 *
 * 정규 시간표(`teacher_timetable`)는 학기를 대표하는 기록이라 건드리지 않는다. 시험 기간·
 * 수능 대비·학교 전체 특수 교육과정처럼 **며칠~몇 주 동안만** 수업 배치가 바뀌면 관리자가
 * 운영 시간표(`timetable_override` + `timetable_override_slot`)를 올리고, 그 기간·대상 학년의
 * 정규 수업은 운영 화면에서만 가려진다.
 *
 * 판정 규칙의 단일 출처는 SQL `teacher_timetable_effective()` 다 — 화면과 에이전트(MCP)가
 * 같은 답을 내도록 규칙을 다시 구현하지 않는다. 조회 = `services/timetableOverrideService.ts`.
 * 이 파일은 순수 함수만 둔다(회귀 `scripts/timetable-override-test` 가 그대로 읽는다).
 * 규칙: 날짜 D 에 적용 중(active)인 운영 시간표가 있으면 그 대상 학년(grades, null = 전 학년)의
 * 정규 수업을 빼고 운영 시간표 칸을 더한다. 대상 밖 학년의 정규 수업은 그대로다.
 *
 * ⚠️ 정규 시간표를 «대표»로 쓰는 곳(수업 그룹·교과 분석·시간표 생성기·시험 감독 과목 담당·
 * 학생 시간표)은 이 조회를 쓰지 말 것 — 운영 시간표는 임시 운영용이다.
 */
import { addDays } from 'date-fns';

export type TimetableOverrideKind = 'exam' | 'csat' | 'special' | 'other';

export const TIMETABLE_OVERRIDE_KIND_LABEL: Record<TimetableOverrideKind, string> = {
  exam: '시험 기간',
  csat: '수능 대비',
  special: '특수 교육과정',
  other: '기타',
};

/** RPC `teacher_timetable_effective` 한 행 — 그날(lesson_date) 실제로 들어가는 수업 */
export interface EffectiveTeacherSlot {
  lesson_date: string;
  id: string;
  day_of_week: number;
  period: number;
  grade: number;
  subject_name: string | null;
  class_label: string | null;
  activity_type: string | null;
  teacher_name: string;
  teacher_resource_id: string | null;
  /** 운영 시간표 칸이면 그 운영 시간표 id, 정규 수업이면 null */
  override_id: string | null;
  override_title: string | null;
}

/** 요일(1=월~7=일)만 아는 호출부를 위해 — 오늘부터 가장 가까운 그 요일의 날짜 */
export function nextDateForWeekday(weekday: number, from: Date = new Date()): Date {
  const today = from.getDay() === 0 ? 7 : from.getDay();
  return addDays(from, (weekday - today + 7) % 7);
}

/**
 * 화면에 쓸 수업 이름. 정규 시간표의 섹션명 규칙(`teacherSectionName`)과 같고, 운영 시간표는
 * 과목명이 비어 있을 수 있어(담임 자습 등) 그때는 «학년-반»만 쓴다.
 */
export function effectiveSlotLabel(slot: Pick<EffectiveTeacherSlot, 'subject_name' | 'grade' | 'class_label'>): string {
  const cls = `${slot.grade}-${slot.class_label ?? ''}`;
  const subject = slot.subject_name?.trim();
  return subject ? `${subject} ${cls}` : cls;
}

// ─────────────────────────────────────────────────────────────────────────────
// 엑셀(격자형) 파싱
//
// 양식: 시트 하나 = 요일(시트 이름 첫 글자 월~금), 첫 행 = 반 머리글(«1(3학년 1반)»·«3학년 1반»),
// 왼쪽 열 = «1교시», 칸 = «과목(교사)» · «과목/(교사)» · 이름만(과목 없이 그 반에 들어감).
// ─────────────────────────────────────────────────────────────────────────────

export type GridCell = string | number | null | undefined;
export interface GridSheet {
  name: string;
  rows: GridCell[][];
}

export interface ParsedOverrideSlot {
  day_of_week: number;
  period: number;
  grade: number;
  class_label: string;
  subject_name: string | null;
  activity_type: 'subject' | 'club' | 'career' | 'autonomy' | null;
  teacher_name: string;
  /** 원래 칸 글자 — 검토·추적용 */
  raw: string;
}

export interface ParsedOverrideGrid {
  slots: ParsedOverrideSlot[];
  warnings: string[];
}

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];

const cellText = (v: GridCell) => (v === null || v === undefined ? '' : String(v)).replace(/\s*\n\s*/g, ' ').trim();

/** «1(3학년 1반)» · «3학년 1반» · «3-1» → {grade, class} */
export function parseClassHeader(text: string): { grade: number; classLabel: string } | null {
  const t = text.replace(/\s+/g, ' ');
  const m = t.match(/(\d)\s*학년\s*(\d+)\s*반/) ?? t.match(/^(\d)\s*-\s*(\d+)$/);
  return m ? { grade: Number(m[1]), classLabel: String(Number(m[2])) } : null;
}

/** 창체는 과목명으로만 알 수 있다 — 교체·감독 판정이 activity_type 을 본다 */
export function activityTypeOf(subject: string | null): ParsedOverrideSlot['activity_type'] {
  if (!subject) return null;
  const s = subject.replace(/\s+/g, '');
  if (s.includes('동아리')) return 'club';
  if (s.includes('진로활동')) return 'career';
  if (s.includes('자율') || s.includes('자치')) return 'autonomy';
  return 'subject';
}

/** «과목(교사)» · «과목/(교사)» · «교사» */
export function parseLessonCell(text: string): { subject: string | null; teacher: string } | null {
  const t = text.trim();
  if (!t) return null;
  const m = t.match(/^(.*?)\s*\/?\s*\(([^()]+)\)\s*$/);
  if (m) {
    const subject = m[1].replace(/\/\s*$/, '').trim();
    const teacher = m[2].trim();
    if (!teacher) return null;
    return { subject: subject || null, teacher };
  }
  // 괄호가 없으면 이름만 적힌 칸(과목 없이 그 반에 들어감). 공백이 든 긴 글은 이름이 아니다.
  if (/^[가-힣]{2,5}$/.test(t)) return { subject: null, teacher: t };
  return null;
}

export function parseOverrideGrid(sheets: GridSheet[]): ParsedOverrideGrid {
  const slots: ParsedOverrideSlot[] = [];
  const warnings: string[] = [];

  for (const sheet of sheets) {
    const day = WEEKDAYS.indexOf(sheet.name.trim().charAt(0)) + 1;
    if (day < 1) {
      warnings.push(`시트 «${sheet.name}»: 이름이 요일(월~금)로 시작하지 않아 건너뜀`);
      continue;
    }
    const headerIdx = sheet.rows.findIndex((r) => r.some((c) => parseClassHeader(cellText(c))));
    if (headerIdx < 0) {
      warnings.push(`시트 «${sheet.name}»: 반 머리글(예: 3학년 1반)을 찾지 못함`);
      continue;
    }
    const columns = new Map<number, { grade: number; classLabel: string }>();
    sheet.rows[headerIdx].forEach((c, i) => {
      const h = parseClassHeader(cellText(c));
      if (h) columns.set(i, h);
    });

    for (const row of sheet.rows.slice(headerIdx + 1)) {
      let period = 0;
      for (let i = 0; i < row.length && !period; i += 1) {
        if (columns.has(i)) continue;
        const m = cellText(row[i]).match(/(\d+)\s*교시/);
        if (m) period = Number(m[1]);
      }
      if (!period) continue;
      for (const [i, cls] of columns) {
        const raw = cellText(row[i]);
        if (!raw) continue;
        const lesson = parseLessonCell(raw);
        if (!lesson) {
          warnings.push(`${sheet.name} ${period}교시 ${cls.grade}-${cls.classLabel}: «${raw}» 을(를) 읽지 못함`);
          continue;
        }
        slots.push({
          day_of_week: day,
          period,
          grade: cls.grade,
          class_label: cls.classLabel,
          subject_name: lesson.subject,
          activity_type: activityTypeOf(lesson.subject),
          teacher_name: lesson.teacher,
          raw,
        });
      }
    }
  }

  return { slots, warnings };
}

/** 같은 교사가 같은 요일·교시에 두 칸 — 저장 전에 막는다(DB 유니크 키와 같다) */
export function findTeacherClashes(slots: Pick<ParsedOverrideSlot, 'teacher_name' | 'day_of_week' | 'period'>[]): string[] {
  const seen = new Map<string, number>();
  for (const s of slots) {
    const key = `${s.teacher_name}|${s.day_of_week}|${s.period}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.entries()]
    .filter(([, n]) => n > 1)
    .map(([key]) => {
      const [name, d, p] = key.split('|');
      return `${name} ${WEEKDAYS[Number(d) - 1]} ${p}교시`;
    });
}

export const weekdayLabel = (d: number) => WEEKDAYS[d - 1] ?? String(d);
