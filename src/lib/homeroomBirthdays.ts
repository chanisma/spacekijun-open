/**
 * 담임 반 학생 생일 → 스케줄 달력의 가상 일정 (2026-10-11)
 *
 * 생일은 `meeting` 에 행으로 만들지 않는다 — 해마다 반복되고 반 배정이 해마다 바뀌어서,
 * 저장하면 학년이 바뀔 때마다 지우고 다시 만들어야 한다. 조회할 때 `resource.meta.birthday`
 * 에서 계산한다.
 *
 * 하루에 생일이 여럿이면 **한 칸으로 묶는다**(달력 칸이 이름으로 넘치지 않게). 명단은 클릭해서 본다.
 * React 비의존 — 회귀 `scripts/homeroom-birthday-test/run.mts`.
 */
import type { ScheduleEvent } from '@/hooks/useSchedule';

export interface BirthdayStudent {
  resourceId: string;
  name: string;
  grade: number;
  classNum: number;
  number: number | null;
  /** `YYYY-MM-DD` */
  birthday: string;
}

export interface BirthdayEntry extends BirthdayStudent {
  /** 몇 번째 생일인가(그해 기준) */
  turning: number;
}

/** 가상 일정의 id 접두어 — `meeting` id 와 섞이지 않는다 */
export const BIRTHDAY_EVENT_PREFIX = 'birthday:';

const BIRTHDAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * 그해의 생일 날짜 키. 2월 29일생은 평년에 **2월 28일** — 그대로 두면 4년에 3번 달력에서 빠진다.
 * 형식이 틀리면 null.
 */
export function birthdayKeyInYear(birthday: string, year: number): string | null {
  const match = BIRTHDAY_RE.exec(birthday.trim());
  if (!match) return null;
  const month = Number(match[2]);
  let day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (month === 2 && day === 29 && !isLeapYear(year)) day = 28;
  return `${year}-${pad(month)}-${pad(day)}`;
}

function birthYearOf(birthday: string): number {
  return Number(birthday.slice(0, 4));
}

function compareStudents(a: BirthdayStudent, b: BirthdayStudent): number {
  return a.grade - b.grade
    || a.classNum - b.classNum
    || (a.number ?? 999) - (b.number ?? 999)
    || a.name.localeCompare(b.name, 'ko');
}

/** 달력 칸 제목 — `🎂 정시우` / `🎂 정시우 외 2명` */
export function birthdayEventTitle(entries: Pick<BirthdayEntry, 'name'>[]): string {
  if (entries.length === 0) return '';
  const first = entries[0].name;
  return entries.length === 1 ? `🎂 ${first}` : `🎂 ${first} 외 ${entries.length - 1}명`;
}

/**
 * 범위 [rangeStart, rangeEnd] 안의 생일을 날짜별 가상 일정으로 만든다.
 * 범위가 해를 넘으면(12월 말 ~ 1월 초 화면) 두 해를 모두 본다.
 */
export function buildBirthdayEvents(
  students: BirthdayStudent[],
  rangeStart: Date,
  rangeEnd: Date,
): ScheduleEvent[] {
  const startKey = dateKey(rangeStart);
  const endKey = dateKey(rangeEnd);
  const byDate = new Map<string, BirthdayEntry[]>();

  for (let year = rangeStart.getFullYear(); year <= rangeEnd.getFullYear(); year++) {
    for (const student of students) {
      const key = birthdayKeyInYear(student.birthday, year);
      if (!key || key < startKey || key > endKey) continue;
      const turning = year - birthYearOf(student.birthday);
      if (turning <= 0) continue;
      const list = byDate.get(key) ?? [];
      list.push({ ...student, turning });
      byDate.set(key, list);
    }
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entries]) => {
      const sorted = [...entries].sort(compareStudents);
      return {
        id: `${BIRTHDAY_EVENT_PREFIX}${key}`,
        kind: 'homeroom',
        title: birthdayEventTitle(sorted),
        starts_at: `${key}T00:00:00+09:00`,
        ends_at: `${key}T23:59:59+09:00`,
        status: 'scheduled',
        created_by: '' as ScheduleEvent['created_by'],
        date_only: true,
        meta: { birthday_date: key, birthday_students: sorted, date_only: true },
      } satisfies ScheduleEvent;
    });
}

/** 이 일정이 생일 가상 일정인가 — 이동·상세·삭제 경로에서 빼야 한다 */
export function isBirthdayEvent(event: Pick<ScheduleEvent, 'meta'> | null | undefined): boolean {
  return Array.isArray(event?.meta?.birthday_students);
}
