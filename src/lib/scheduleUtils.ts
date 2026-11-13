// ========================================
// Schedule Utilities
// Shared helpers for schedule-related components
// ========================================

import { format } from 'date-fns';
import type { ScheduleEvent } from '@/hooks/useSchedule';

// ----------------------------------------
// Event Type Definitions
// ----------------------------------------

export type EventKind =
  | 'class'
  | 'homeroom'
  | 'assignment'
  | 'schedule'
  | 'event'
  | 'duty'
  | 'training'
  | 'document_submission'
  | 'personal'
  | 'task';

/**
 * 일정 화면의 뷰 모드 단일 출처.
 * 'plan' = 일별 계획표(표) 뷰 — 달력 한 칸에 담기 어려운 시간·장소·담당자까지 펼쳐 보여준다.
 * 데이터 로딩 범위는 'month'와 같으므로 useSchedule의 날짜 범위 계산에서 month와 함께 묶인다.
 */
export type ScheduleViewMode = 'month' | 'week' | 'day' | 'plan';

export type ColorVariant = 'light' | 'solid';

export interface EventColorConfig {
  light: string;  // For calendar items (bg-xxx-100 with hover)
  solid: string;  // For badges (bg-xxx-500 text-white)
}

// ----------------------------------------
// Color Configuration
// ----------------------------------------

const EVENT_COLORS: Record<EventKind | 'default', EventColorConfig> = {
  assignment: {
    light: 'bg-amber-100 hover:bg-amber-200 text-amber-800 border-amber-200',
    solid: 'bg-amber-500 text-white',
  },
  class: {
    light: 'bg-blue-100 hover:bg-blue-200 text-blue-800 border-blue-200',
    solid: 'bg-blue-500 text-white',
  },
  schedule: {
    light: 'bg-green-100 hover:bg-green-200 text-green-800 border-green-200',
    solid: 'bg-green-500 text-white',
  },
  event: {
    light: 'bg-purple-100 hover:bg-purple-200 text-purple-800 border-purple-200',
    solid: 'bg-purple-500 text-white',
  },
  duty: {
    light: 'bg-orange-100 hover:bg-orange-200 text-orange-800 border-orange-200',
    solid: 'bg-orange-500 text-white',
  },
  training: {
    light: 'bg-pink-100 hover:bg-pink-200 text-pink-800 border-pink-200',
    solid: 'bg-pink-500 text-white',
  },
  document_submission: {
    light: 'bg-cyan-100 hover:bg-cyan-200 text-cyan-800 border-cyan-200',
    solid: 'bg-cyan-500 text-white',
  },
  homeroom: {
    light: 'bg-teal-100 hover:bg-teal-200 text-teal-800 border-teal-200',
    solid: 'bg-teal-500 text-white',
  },
  personal: {
    light: 'bg-indigo-100 hover:bg-indigo-200 text-indigo-800 border-indigo-200',
    solid: 'bg-indigo-500 text-white',
  },
  task: {
    light: 'bg-amber-100 hover:bg-amber-200 text-amber-800 border-amber-200',
    solid: 'bg-amber-500 text-white',
  },
  default: {
    light: 'bg-gray-100 hover:bg-gray-200 text-gray-800 border-gray-200',
    solid: 'bg-gray-500 text-white',
  },
};

// Special schedule colors (공휴일, 휴업일)
const SPECIAL_SCHEDULE_COLORS: Record<string, EventColorConfig> = {
  '공휴일': {
    light: 'bg-red-100 hover:bg-red-200 text-red-800 border-red-200',
    solid: 'bg-red-500 text-white',
  },
  '휴업일': {
    light: 'bg-gray-200 hover:bg-gray-300 text-gray-700 border-gray-300',
    solid: 'bg-gray-500 text-white',
  },
};

// ----------------------------------------
// Label Configuration
// ----------------------------------------

export interface EventLabelConfig {
  short: string;   // 짧은 버전 (캘린더용)
  full: string;    // 전체 버전 (상세보기용)
}

const EVENT_LABELS: Record<EventKind | 'default', EventLabelConfig> = {
  class: { short: '수업', full: '수업' },
  schedule: { short: '학사', full: '학사일정' },
  event: { short: '출장', full: '출장' },
  // duty 라벨은 '업무'로 통일 (2026-08-12 — 구 '당직'/'근무' 혼용이 범례('업무')와 어긋났음)
  duty: { short: '업무', full: '업무' },
  training: { short: '연수', full: '연수' },
  document_submission: { short: '서류제출', full: '서류제출' },
  homeroom: { short: '학급', full: '학급 일정' },
  assignment: { short: '과제', full: '과제일정' },
  personal: { short: '개인', full: '개인일정' },
  task: { short: '할일', full: '할일' },
  default: { short: '기타', full: '기타' },
};

// ----------------------------------------
// Color Functions
// ----------------------------------------

/**
 * Get event color classes based on event kind and variant
 * @param kind - Event kind (class, schedule, event, etc.)
 * @param variant - 'light' for calendar items, 'solid' for badges
 * @param meta - Optional meta object for special schedule types
 */
export function getEventTypeColor(
  kind: string,
  variant: ColorVariant = 'light',
  meta?: { sbtr_dd_sc_nm?: string; birthday_students?: unknown } | null
): string {
  // 담임 반 학생 생일(가상 일정, lib/homeroomBirthdays) — 학급 일정과 구분되게 분홍
  if (Array.isArray(meta?.birthday_students)) {
    return variant === 'solid'
      ? 'bg-pink-500 text-white'
      : 'bg-pink-50 hover:bg-pink-100 text-pink-800 border-pink-200';
  }
  // Check for special schedule types (공휴일, 휴업일)
  if (kind === 'schedule' && meta?.sbtr_dd_sc_nm) {
    const specialColor = SPECIAL_SCHEDULE_COLORS[meta.sbtr_dd_sc_nm];
    if (specialColor) {
      return specialColor[variant];
    }
  }

  const colorConfig = EVENT_COLORS[kind as EventKind] || EVENT_COLORS.default;
  return colorConfig[variant];
}

/**
 * Get event color from ScheduleEvent object
 * @param event - ScheduleEvent object
 * @param variant - 'light' for calendar items, 'solid' for badges
 */
export function getEventColor(
  event: ScheduleEvent,
  variant: ColorVariant = 'light'
): string {
  return getEventTypeColor(event.kind, variant, event.meta);
}

// ----------------------------------------
// Label Functions
// ----------------------------------------

/**
 * Get event type label
 * @param kind - Event kind
 * @param labelType - 'short' or 'full'
 */
export function getEventTypeLabel(
  kind: string,
  labelType: 'short' | 'full' = 'short'
): string {
  const labelConfig = EVENT_LABELS[kind as EventKind] || EVENT_LABELS.default;
  return labelConfig[labelType];
}

/**
 * Get short label (for calendar)
 */
export function getEventShortLabel(kind: string): string {
  return getEventTypeLabel(kind, 'short');
}

/**
 * Get full label (for detail dialogs)
 */
export function getEventFullLabel(kind: string): string {
  return getEventTypeLabel(kind, 'full');
}

// ----------------------------------------
// Icon Configuration
// ----------------------------------------

export type IconName = 'calendar' | 'clock' | 'users' | 'mapPin' | 'fileText' | 'briefcase' | 'user';

const EVENT_ICONS: Record<EventKind | 'default', IconName> = {
  class: 'fileText',
  schedule: 'calendar',
  event: 'users',
  duty: 'clock',
  training: 'mapPin',
  document_submission: 'fileText',
  homeroom: 'users',
  assignment: 'fileText',
  personal: 'user',
  task: 'briefcase',
  default: 'calendar',
};

/**
 * Get icon name for event kind
 */
export function getEventIconName(kind: string): IconName {
  return EVENT_ICONS[kind as EventKind] || EVENT_ICONS.default;
}

// ----------------------------------------
// Utility Functions
// ----------------------------------------

/**
 * Check if event kind is valid
 */
export function isValidEventKind(kind: string): kind is EventKind {
  return kind in EVENT_COLORS && kind !== 'default';
}

/**
 * Get all available event kinds
 */
export function getAllEventKinds(): EventKind[] {
  return Object.keys(EVENT_COLORS).filter(k => k !== 'default') as EventKind[];
}

// ----------------------------------------
// Dashboard Event Color Utilities
// For Index.tsx weekly schedule cards with gradient backgrounds
// ----------------------------------------

type DashboardColorPart = 'background' | 'text' | 'textLight' | 'border' | 'dot';

interface DashboardColorSet {
  today: string;
  normal: string;
}

const DASHBOARD_EVENT_COLORS: Record<EventKind | 'default', Record<DashboardColorPart, DashboardColorSet>> = {
  assignment: {
    background: { today: 'bg-amber-50 border-amber-200', normal: 'bg-amber-50/70 border-amber-100' },
    text: { today: 'text-amber-700', normal: 'text-amber-600' },
    textLight: { today: 'text-amber-900', normal: 'text-amber-800' },
    border: { today: 'bg-amber-200', normal: 'bg-amber-100' },
    dot: { today: 'bg-amber-500', normal: 'bg-amber-400' },
  },
  schedule: {
    background: {
      today: 'bg-gradient-to-r from-green-50 to-green-100 border-green-200 shadow-sm',
      normal: 'bg-gradient-to-r from-green-50 to-white border-green-200 hover:shadow-sm',
    },
    text: { today: 'text-green-600', normal: 'text-green-500' },
    textLight: { today: 'text-green-800', normal: 'text-green-700' },
    border: { today: 'bg-green-200', normal: 'bg-green-100' },
    dot: { today: 'bg-green-500', normal: 'bg-green-400' },
  },
  event: {
    background: {
      today: 'bg-gradient-to-r from-purple-50 to-purple-100 border-purple-200 shadow-sm',
      normal: 'bg-gradient-to-r from-purple-50 to-white border-purple-200 hover:shadow-sm',
    },
    text: { today: 'text-purple-600', normal: 'text-purple-500' },
    textLight: { today: 'text-purple-800', normal: 'text-purple-700' },
    border: { today: 'bg-purple-200', normal: 'bg-purple-100' },
    dot: { today: 'bg-purple-500', normal: 'bg-purple-400' },
  },
  duty: {
    background: {
      today: 'bg-gradient-to-r from-orange-50 to-orange-100 border-orange-200 shadow-sm',
      normal: 'bg-gradient-to-r from-orange-50 to-white border-orange-200 hover:shadow-sm',
    },
    text: { today: 'text-orange-600', normal: 'text-orange-500' },
    textLight: { today: 'text-orange-800', normal: 'text-orange-700' },
    border: { today: 'bg-orange-200', normal: 'bg-orange-100' },
    dot: { today: 'bg-orange-500', normal: 'bg-orange-400' },
  },
  training: {
    background: {
      today: 'bg-gradient-to-r from-pink-50 to-pink-100 border-pink-200 shadow-sm',
      normal: 'bg-gradient-to-r from-pink-50 to-white border-pink-200 hover:shadow-sm',
    },
    text: { today: 'text-pink-600', normal: 'text-pink-500' },
    textLight: { today: 'text-pink-800', normal: 'text-pink-700' },
    border: { today: 'bg-pink-200', normal: 'bg-pink-100' },
    dot: { today: 'bg-pink-500', normal: 'bg-pink-400' },
  },
  document_submission: {
    background: {
      today: 'bg-gradient-to-r from-cyan-50 to-cyan-100 border-cyan-200 shadow-sm',
      normal: 'bg-gradient-to-r from-cyan-50 to-white border-cyan-200 hover:shadow-sm',
    },
    text: { today: 'text-cyan-600', normal: 'text-cyan-500' },
    textLight: { today: 'text-cyan-800', normal: 'text-cyan-700' },
    border: { today: 'bg-cyan-200', normal: 'bg-cyan-100' },
    dot: { today: 'bg-cyan-500', normal: 'bg-cyan-400' },
  },
  homeroom: {
    background: { today: 'bg-teal-50 border-teal-200', normal: 'bg-teal-50/70 border-teal-100' },
    text: { today: 'text-teal-700', normal: 'text-teal-600' },
    textLight: { today: 'text-teal-900', normal: 'text-teal-800' },
    border: { today: 'bg-teal-200', normal: 'bg-teal-100' },
    dot: { today: 'bg-teal-500', normal: 'bg-teal-400' },
  },
  personal: {
    background: {
      today: 'bg-gradient-to-r from-indigo-50 to-indigo-100 border-indigo-200 shadow-sm',
      normal: 'bg-gradient-to-r from-indigo-50 to-white border-indigo-200 hover:shadow-sm',
    },
    text: { today: 'text-indigo-600', normal: 'text-indigo-500' },
    textLight: { today: 'text-indigo-800', normal: 'text-indigo-700' },
    border: { today: 'bg-indigo-200', normal: 'bg-indigo-100' },
    dot: { today: 'bg-indigo-500', normal: 'bg-indigo-400' },
  },
  task: {
    background: {
      today: 'bg-gradient-to-r from-gray-50 to-gray-100 border-gray-200 shadow-sm',
      normal: 'bg-gradient-to-r from-gray-50 to-white border-gray-200 hover:shadow-sm',
    },
    text: { today: 'text-gray-600', normal: 'text-gray-500' },
    textLight: { today: 'text-gray-800', normal: 'text-gray-700' },
    border: { today: 'bg-gray-200', normal: 'bg-gray-100' },
    dot: { today: 'bg-gray-500', normal: 'bg-gray-400' },
  },
  class: {
    background: {
      today: 'bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200 shadow-sm',
      normal: 'bg-gradient-to-r from-blue-50 to-white border-blue-200 hover:shadow-sm',
    },
    text: { today: 'text-blue-600', normal: 'text-blue-500' },
    textLight: { today: 'text-blue-800', normal: 'text-blue-700' },
    border: { today: 'bg-blue-200', normal: 'bg-blue-100' },
    dot: { today: 'bg-blue-500', normal: 'bg-blue-400' },
  },
  default: {
    background: {
      today: 'bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200 shadow-sm',
      normal: 'bg-gradient-to-r from-gray-50 to-white border-gray-200 hover:shadow-sm',
    },
    text: { today: 'text-blue-600', normal: 'text-gray-600' },
    textLight: { today: 'text-blue-800', normal: 'text-gray-800' },
    border: { today: 'bg-blue-200', normal: 'bg-gray-200' },
    dot: { today: 'bg-blue-500', normal: 'bg-gray-400' },
  },
};

/**
 * Get dashboard event color for a specific part
 * @param kind - Event kind or 'task' for task type
 * @param part - Which color part to get (background, text, textLight, border, dot)
 * @param isToday - Whether the event includes today's date
 * @param isTask - Whether this is a task (overrides kind)
 */
export function getDashboardEventColor(
  kind: string,
  part: DashboardColorPart,
  isToday: boolean,
  isTask: boolean = false
): string {
  const effectiveKind = isTask ? 'task' : kind;
  const colorSet = DASHBOARD_EVENT_COLORS[effectiveKind as EventKind] || DASHBOARD_EVENT_COLORS.default;
  return isToday ? colorSet[part].today : colorSet[part].normal;
}

// ----------------------------------------
// 일별 계획표(plan 뷰) 날짜·시간 유틸
// 순수 함수만 모아 둔다 (회귀: scripts/schedule-plan-test/run.mts)
// ----------------------------------------

/** 비정상 ends_at(먼 미래)으로 표가 무한정 늘어나지 않게 하는 상한 */
const MAX_EVENT_SPAN_DAYS = 60;

/** 로컬 기준 날짜 키(YYYY-MM-DD) */
export const toDateKey = (date: Date): string => format(date, 'yyyy-MM-dd');

/**
 * meeting.starts_at / ends_at 문자열을 Date로 파싱한다.
 *
 * 저장 형식이 두 가지다 —
 *  - 사용자 생성 일정: `toISOString()` 결과라 오프셋이 붙은 UTC 인스턴트
 *  - NEIS 학사일정: `2026-08-12T00:00:00` 처럼 오프셋 없는 문자열
 * `new Date`는 전자를 인스턴트로, 후자를 로컬 시각으로 파싱하므로 두 형식 모두 올바른 날짜가 된다.
 * (원시 문자열 prefix 비교는 UTC로 저장된 오전 9시 이전 일정을 하루 앞으로 밀어버린다)
 */
export function parseEventAt(iso?: string | null): Date | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** 종일 일정 여부 — date_only 플래그가 없는 NEIS 학사일정(00:00~23:59)도 종일로 본다 */
export function isAllDayEvent(event: Pick<ScheduleEvent, 'starts_at' | 'ends_at' | 'date_only'>): boolean {
  if (event.date_only) return true;

  const start = parseEventAt(event.starts_at);
  if (!start || start.getHours() !== 0 || start.getMinutes() !== 0) return false;

  const end = parseEventAt(event.ends_at);
  if (!end) return true;

  return (
    (end.getHours() === 23 && end.getMinutes() === 59) ||
    (end.getHours() === 0 && end.getMinutes() === 0)
  );
}

/**
 * 일정이 걸쳐 있는 모든 날짜 키를 순서대로 반환한다.
 * 여러 날에 걸친 출장·연수를 시작일에만 찍지 않고 매일 표시하기 위한 것으로,
 * 달력 격자가 표현하지 못하는 정보다.
 */
export function getEventDayKeys(event: Pick<ScheduleEvent, 'starts_at' | 'ends_at'>): string[] {
  const start = parseEventAt(event.starts_at);
  if (!start) return [];

  const startKey = toDateKey(start);
  const end = parseEventAt(event.ends_at);
  if (!end || end <= start) return [startKey];

  // 종료가 정확히 자정이면 '그 전날까지'로 본다 (00:00 종료 = 앞 날의 끝)
  const endCursor = new Date(end);
  if (endCursor.getHours() === 0 && endCursor.getMinutes() === 0 && endCursor.getSeconds() === 0) {
    endCursor.setDate(endCursor.getDate() - 1);
  }
  const endKey = toDateKey(endCursor);
  if (endKey <= startKey) return [startKey];

  const keys: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (keys.length < MAX_EVENT_SPAN_DAYS) {
    const key = toDateKey(cursor);
    keys.push(key);
    if (key >= endKey) break;
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

/** 계획표 시간 칸 표시 — 종일이면 '종일', 아니면 HH:mm ~ HH:mm */
export function formatEventTimeText(
  event: Pick<ScheduleEvent, 'starts_at' | 'ends_at' | 'date_only'>
): string {
  if (isAllDayEvent(event)) return '종일';

  const start = parseEventAt(event.starts_at);
  if (!start) return '-';

  const startText = format(start, 'HH:mm');
  const end = parseEventAt(event.ends_at);
  if (!end) return startText;

  const endText = format(end, 'HH:mm');
  return endText === startText ? startText : `${startText} ~ ${endText}`;
}
