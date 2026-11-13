// ========================================
// 자동화 업무 — 반복 규칙(cron) 클라이언트 단일 출처 (2026-10-23)
//
// ⚠️ 두 벌: 회차를 실제로 만드는 판정은 서버 `automation_private.cron_matches`
//    (supabase/migrations/20261023165000_automation_scheduler.sql)이고, 여기는 화면의
//    «다음 실행 시각» 미리보기다. 둘이 다르면 승인한 것과 다른 시각에 나간다 →
//    회귀 scripts/automation-test/run.mts 가 같은 표로 두 쪽을 잰다. 한쪽만 고치지 말 것.
//
// 시각은 전부 한국 벽시계(Asia/Seoul, 서머타임 없음 = UTC+9 고정)로 판정한다.
// ========================================

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export interface WallClock {
  year: number;
  month: number; // 1~12
  day: number; // 1~31
  hour: number;
  minute: number;
  dow: number; // 0=일 … 6=토
}

export function kstWall(ms: number): WallClock {
  const d = new Date(ms + KST_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    dow: d.getUTCDay(),
  };
}

/** 한국 벽시계 → epoch ms */
export function kstToMs(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return Date.UTC(year, month - 1, day, hour, minute) - KST_OFFSET_MS;
}

export function kstDateKeyOf(ms: number): string {
  const w = kstWall(ms);
  return `${w.year}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`;
}

const PART_RE = /^(\*|\d{1,2}(-\d{1,2})?)(\/\d{1,2})?$/;

function fieldOk(field: string, lo: number, hi: number): boolean {
  if (!/^[0-9*,/-]+$/.test(field)) return false;
  for (const part of field.split(',')) {
    if (!PART_RE.test(part)) return false;
    const [base, step] = part.split('/');
    if (step !== undefined && Number(step) < 1) return false;
    if (base !== '*') {
      const [a, b] = base.split('-').map(Number);
      const end = b ?? a;
      if (a < lo || end > hi || a > end) return false;
    }
  }
  return true;
}

export function splitCron(expr: string): string[] {
  return expr.trim().split(/\s+/);
}

export function cronValid(expr: string | null | undefined): boolean {
  if (!expr) return false;
  const f = splitCron(expr);
  return f.length === 5
    && fieldOk(f[0], 0, 59)
    && fieldOk(f[1], 0, 23)
    && fieldOk(f[2], 1, 31)
    && fieldOk(f[3], 1, 12)
    && fieldOk(f[4], 0, 7);
}

function fieldMatch(field: string, v: number, lo: number, hi: number): boolean {
  for (const part of field.split(',')) {
    const [base, stepText] = part.split('/');
    const step = stepText ? Number(stepText) : 1;
    let a: number;
    let b: number;
    if (base === '*') {
      a = lo;
      b = hi;
    } else {
      const [x, y] = base.split('-').map(Number);
      a = x;
      // «5/15» = 5부터 끝까지 15씩 (서버와 같다)
      b = y ?? (stepText ? hi : x);
    }
    if (v >= a && v <= b && (v - a) % step === 0) return true;
  }
  return false;
}

function dayMatches(f: string[], w: Pick<WallClock, 'month' | 'day' | 'dow'>): boolean {
  if (!fieldMatch(f[3], w.month, 1, 12)) return false;
  const domOk = fieldMatch(f[2], w.day, 1, 31);
  const dowOk = fieldMatch(f[4], w.dow, 0, 7) || (w.dow === 0 && fieldMatch(f[4], 7, 0, 7));
  // 일·요일이 둘 다 제한되면 표준 cron 처럼 «둘 중 하나»
  if (f[2] !== '*' && f[4] !== '*') return domOk || dowOk;
  return domOk && dowOk;
}

export function cronMatches(expr: string, w: WallClock): boolean {
  if (!cronValid(expr)) return false;
  const f = splitCron(expr);
  return fieldMatch(f[0], w.minute, 0, 59) && fieldMatch(f[1], w.hour, 0, 23) && dayMatches(f, w);
}

export interface NextRunOptions {
  /** 'YYYY-MM-DD' — 이 날 전에는 없다 */
  startsOn?: string | null;
  /** 'YYYY-MM-DD' — 이 날 뒤에는 없다 */
  endsOn?: string | null;
  /** 몇 날을 내다볼지 (기본 400 — 매년 한 번도 잡힌다) */
  horizonDays?: number;
}

/** fromMs 이후(이 분 포함 안 함) 처음 맞는 시각 count 개 — epoch ms 목록 */
export function nextRuns(expr: string, fromMs: number, count: number, opts: NextRunOptions = {}): number[] {
  if (!cronValid(expr) || count <= 0) return [];
  const f = splitCron(expr);
  const out: number[] = [];
  const start = kstWall(fromMs);
  const horizon = opts.horizonDays ?? 400;
  for (let i = 0; i <= horizon && out.length < count; i++) {
    const dayMs = kstToMs(start.year, start.month, start.day + i);
    const w = kstWall(dayMs);
    const key = kstDateKeyOf(dayMs);
    if (opts.endsOn && key > opts.endsOn) break;
    if (opts.startsOn && key < opts.startsOn) continue;
    if (!dayMatches(f, w)) continue;
    for (let h = 0; h < 24 && out.length < count; h++) {
      if (!fieldMatch(f[1], h, 0, 23)) continue;
      for (let m = 0; m < 60 && out.length < count; m++) {
        if (!fieldMatch(f[0], m, 0, 59)) continue;
        const at = kstToMs(w.year, w.month, w.day, h, m);
        if (at > fromMs) out.push(at);
      }
    }
  }
  return out;
}

// ── 화면 선택기 ↔ cron ──────────────────────────────────────

export type ScheduleKind = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'once' | 'custom';

export interface ScheduleSpec {
  kind: ScheduleKind;
  /** 'HH:MM' (custom 제외) */
  time: string;
  /** weekly: ISO 요일 1=월 … 7=일 */
  days?: number[];
  /** monthly: 1~31 */
  dayOfMonth?: number;
  /** once: 'YYYY-MM-DD' — 기간(starts_on=ends_on)으로 한 번만 */
  date?: string;
  /** custom: cron 식 그대로 */
  cron?: string;
}

export const SCHEDULE_KIND_LABEL: Record<ScheduleKind, string> = {
  daily: '매일',
  weekdays: '평일(월~금)',
  weekly: '매주 요일',
  monthly: '매월',
  once: '한 번',
  custom: '고급(cron 식)',
};

export const ISO_DOW_LABEL = ['', '월', '화', '수', '목', '금', '토', '일'];

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function hm(time: string): [number, number] | null {
  const m = TIME_RE.exec(time);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** 선택기 → cron. 만들 수 없으면 null (화면이 저장을 막는다) */
export function specToCron(spec: ScheduleSpec): string | null {
  if (spec.kind === 'custom') return spec.cron && cronValid(spec.cron) ? spec.cron.trim().replace(/\s+/g, ' ') : null;
  const t = hm(spec.time);
  if (!t) return null;
  const [h, mi] = t;
  switch (spec.kind) {
    case 'daily':
      return `${mi} ${h} * * *`;
    case 'weekdays':
      return `${mi} ${h} * * 1-5`;
    case 'weekly': {
      const days = [...new Set(spec.days ?? [])].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
      if (days.length === 0) return null;
      return `${mi} ${h} * * ${days.map((d) => (d === 7 ? 0 : d)).join(',')}`;
    }
    case 'monthly': {
      const d = spec.dayOfMonth ?? 0;
      if (!Number.isInteger(d) || d < 1 || d > 31) return null;
      return `${mi} ${h} ${d} * *`;
    }
    case 'once': {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(spec.date ?? '');
      if (!m) return null;
      return `${mi} ${h} ${Number(m[3])} ${Number(m[2])} *`;
    }
  }
}

/** 한 번(once)은 기간으로 그날만 — 편집 화면이 starts_on·ends_on 을 이것으로 덮는다 */
export function onceRange(spec: ScheduleSpec): { startsOn: string; endsOn: string } | null {
  return spec.kind === 'once' && spec.date ? { startsOn: spec.date, endsOn: spec.date } : null;
}

export function describeSpec(spec: ScheduleSpec | null | undefined, cron: string): string {
  if (!spec) return `cron ${cron}`;
  switch (spec.kind) {
    case 'daily':
      return `매일 ${spec.time}`;
    case 'weekdays':
      return `평일 ${spec.time}`;
    case 'weekly':
      return `매주 ${(spec.days ?? []).slice().sort((a, b) => a - b).map((d) => ISO_DOW_LABEL[d]).join('·')} ${spec.time}`;
    case 'monthly':
      return `매월 ${spec.dayOfMonth}일 ${spec.time}`;
    case 'once':
      return `${spec.date} ${spec.time} 한 번`;
    case 'custom':
      return `cron ${cron}`;
  }
}

export function parseScheduleSpec(value: unknown): ScheduleSpec | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<ScheduleSpec>;
  if (!v.kind || !(v.kind in SCHEDULE_KIND_LABEL)) return null;
  return { kind: v.kind, time: typeof v.time === 'string' ? v.time : '08:00', days: v.days, dayOfMonth: v.dayOfMonth, date: v.date, cron: v.cron };
}

const WEEKDAY_FMT = ['일', '월', '화', '수', '목', '금', '토'];

/** «10/24(토) 08:30» */
export function formatRunAt(ms: number): string {
  const w = kstWall(ms);
  return `${w.month}/${w.day}(${WEEKDAY_FMT[w.dow]}) ${String(w.hour).padStart(2, '0')}:${String(w.minute).padStart(2, '0')}`;
}
