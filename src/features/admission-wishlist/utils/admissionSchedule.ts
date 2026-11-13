// 대학별고사 일정 (논술·면접·실기) + 원서접수 + 최종 합격자 발표일.
//
// 출처 = jinhak.esteacher.kr/2027gosa.html 의 `const DB = {...}` 리터럴.
// **변경사항 페이지와 달리 `application/json` 태그가 아니라 JS 변수**라 괄호 균형으로
// 리터럴을 잘라 낸다(문자열 안 괄호는 건너뛴다).
//
// 원본은 인덱스로 압축된 정규화 구조다 — 페이지 자신의 전개 코드가 스키마를 밝힌다:
//   events[i] = [u, t, st, d1, d2, p, m, app, ann, os, c, x]
//     u   대학 인덱스(DB.unis)       t  고사유형(0 논술 / 1 면접 / 2 실기)
//     st  단계(1차/2차)              d1/d2 고사 시작·종료 (MMDD)
//     p   전형 경로 인덱스(DB.paths)  m  모집단위 인덱스 배열(DB.units)
//     app [원서접수 시작, 종료]       ann 합격자 발표일 원문
//     os  현장접수                   c  어디가 상세코드('' 이면 요강 보완 이벤트)
//     x   [고사시각, 비고]  ← c 가 빈 문자열일 때만
//
// React·DB 비의존 순수 모듈 — 적재 스크립트·회귀 테스트·화면이 함께 쓴다.

export const SCHEDULE_SOURCE_URL = 'https://jinhak.esteacher.kr/2027gosa.html';

/** 고사 유형 (원본 TY 배열 순서 — 인덱스가 곧 값이라 순서를 바꾸면 안 된다) */
export const EXAM_TYPES = ['논술', '면접', '실기'] as const;
export type ExamType = (typeof EXAM_TYPES)[number];

/** 원본 DB 리터럴 */
export interface RawScheduleDb {
  meta: { collected?: string; year: number; suneung?: number; appNet?: number[]; holidays?: Record<string, string> };
  unis: Array<[string, string, string, number]>; // [full, short, region, multi]
  paths: string[];                                // '학생부위주(교과) > … > 학생부교과(지역균형)'
  units: string[];
  events: unknown[][];
}

/** DB `admission_exam_schedule` 한 행 */
export interface ScheduleRow {
  id: string;
  university_full: string;
  university: string;
  region: string | null;
  exam_type: string;
  stage: number;
  exam_start: string | null;   // YYYY-MM-DD
  exam_end: string | null;
  admission_path: string;
  admission_name: string;
  apply_start: string | null;
  apply_end: string | null;
  /** 발표일 원문. `' / '` 가 있으면 모집단위별로 다르다는 뜻 */
  announce_text: string | null;
  units: string[];
  exam_time: string | null;
  note: string | null;
  adiga_code: string | null;
  source_url: string;
  source_date: string | null;
}

/** 화면용 (camelCase) */
export interface AdmissionSchedule {
  id: string;
  university: string;
  examType: string;
  stage: number;
  examStart: string | null;
  examEnd: string | null;
  admissionPath: string;
  admissionName: string;
  applyStart: string | null;
  applyEnd: string | null;
  announceText: string | null;
  units: string[];
  examTime: string | null;
  note: string | null;
}

/**
 * `const DB = {...}` 리터럴을 잘라 낸다.
 * 문자열 안의 중괄호를 세면 안 되므로 따옴표 상태를 추적한다.
 */
export function extractScheduleDb(html: string): RawScheduleDb {
  const m = /(?:const|let|var)\s+DB\s*=\s*/.exec(html);
  if (!m) {
    throw new Error(
      `DB 리터럴을 찾지 못했습니다. 원본 페이지 구조가 바뀐 것으로 보입니다 — ${SCHEDULE_SOURCE_URL} 확인 필요.`,
    );
  }
  const start = m.index + m[0].length;
  if (html[start] !== '{') throw new Error('DB 가 객체 리터럴이 아닙니다.');

  let depth = 0;
  let inStr = false;
  let esc = false;
  let quote = '';
  let i = start;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === quote) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = true; quote = ch; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) throw new Error('DB 리터럴의 괄호가 닫히지 않았습니다.');

  const parsed = JSON.parse(html.slice(start, i + 1)) as RawScheduleDb;
  for (const k of ['meta', 'unis', 'paths', 'units', 'events'] as const) {
    if (!(k in parsed)) throw new Error(`DB 에 '${k}' 가 없습니다 — 구조가 바뀌었습니다.`);
  }
  if (!Array.isArray(parsed.events) || parsed.events.length === 0) {
    throw new Error('DB.events 가 비어 있습니다.');
  }
  return parsed;
}

/**
 * `915` (MMDD) → `'2026-09-15'`.
 * **연도는 반드시 `DB.meta.year`에서 온다** — 원본이 월·일만 담고 있어 연도를 코드에
 * 박으면 다음 해 자료를 넣는 순간 전 일정이 1년 어긋난다.
 */
export function mmddToDate(mmdd: number | null | undefined, year: number): string | null {
  if (mmdd == null || !Number.isFinite(mmdd)) return null;
  const mm = Math.floor(mmdd / 100);
  const dd = mmdd % 100;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

function orNull(v: unknown): string | null {
  const t = typeof v === 'string' ? v.trim() : '';
  return t === '' ? null : t;
}

/** 원본 DB → DB 행 목록 */
export function toScheduleRows(db: RawScheduleDb): ScheduleRow[] {
  const year = db.meta?.year;
  if (!Number.isFinite(year)) throw new Error('DB.meta.year 가 없습니다 — 날짜를 만들 수 없습니다.');
  const sourceDate = orNull(db.meta?.collected);

  return db.events.map((a, idx) => {
    const [u, t, st, d1, d2, p, m, app, ann, , c, x] = a as [
      number, number, number, number, number, number, number[], number[] | 0, string, string, string, [string, string] | 0,
    ];
    const uni = db.unis[u] ?? ['', '', '', 0];
    const path = db.paths[p] ?? '';
    const segs = path.split(' > ');
    const extra = Array.isArray(x) ? x : null;

    return {
      id: `E${String(idx + 1).padStart(4, '0')}`,
      university_full: uni[0] ?? '',
      // 캠퍼스가 여러 개면 원본도 full 을 쓴다(`multi` 플래그) — short 만 쓰면 캠퍼스가 뭉개진다
      university: uni[3] ? (uni[0] ?? '') : (uni[1] ?? ''),
      region: orNull(uni[2]),
      exam_type: EXAM_TYPES[t] ?? '기타',
      stage: Number.isFinite(st) ? st : 1,
      exam_start: mmddToDate(d1, year),
      exam_end: mmddToDate(d2, year),
      admission_path: path,
      admission_name: segs[segs.length - 1] ?? '',
      apply_start: Array.isArray(app) ? mmddToDate(app[0], year) : null,
      apply_end: Array.isArray(app) ? mmddToDate(app[1], year) : null,
      announce_text: orNull(ann),
      units: Array.isArray(m) ? m.map((i) => db.units[i]).filter(Boolean) : [],
      exam_time: extra ? orNull(extra[0]) : null,
      note: extra ? orNull(extra[1]) : null,
      adiga_code: orNull(c),
      source_url: SCHEDULE_SOURCE_URL,
      source_date: sourceDate,
    };
  });
}

/** 적재 전 검증 — 원본 형식이 바뀌면 절반만 들어가지 않고 여기서 걸린다 */
export function validateScheduleRows(rows: ScheduleRow[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.id)) problems.push(`id 중복: ${r.id}`);
    else seen.add(r.id);
    if (!r.university) problems.push(`${r.id}: 대학명 없음`);
    if (!r.exam_start) problems.push(`${r.id}: 고사 시작일 파싱 실패`);
    if (r.exam_start && r.exam_end && r.exam_end < r.exam_start) {
      problems.push(`${r.id}: 고사 종료일이 시작일보다 앞섬 (${r.exam_start}~${r.exam_end})`);
    }
    if (!EXAM_TYPES.includes(r.exam_type as ExamType)) problems.push(`${r.id}: 알 수 없는 고사 유형 ${r.exam_type}`);
  }
  return problems;
}

/** DB 행 → 화면용 */
export function mapSchedule(r: Record<string, unknown>): AdmissionSchedule {
  return {
    id: String(r.id),
    university: String(r.university ?? ''),
    examType: String(r.exam_type ?? ''),
    stage: Number(r.stage ?? 1),
    examStart: (r.exam_start as string | null) ?? null,
    examEnd: (r.exam_end as string | null) ?? null,
    admissionPath: String(r.admission_path ?? ''),
    admissionName: String(r.admission_name ?? ''),
    applyStart: (r.apply_start as string | null) ?? null,
    applyEnd: (r.apply_end as string | null) ?? null,
    announceText: (r.announce_text as string | null) ?? null,
    units: Array.isArray(r.units) ? (r.units as string[]) : [],
    examTime: (r.exam_time as string | null) ?? null,
    note: (r.note as string | null) ?? null,
  };
}

/* ───────────────────── 표시 규칙 ───────────────────── */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** `'2026-11-22'` → `'11/22(일)'` */
export function formatExamDate(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  const wd = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${m}/${d}(${wd})`;
}

/** 한 일정의 한 줄 표기 — `'면접 11/22(일)'`, 기간이면 `'~ 11/23(월)'` 추가 */
export function formatSchedule(s: AdmissionSchedule): string {
  const start = formatExamDate(s.examStart);
  if (!start) return s.examType;
  const range = s.examEnd && s.examEnd !== s.examStart ? `${start} ~ ${formatExamDate(s.examEnd)}` : start;
  const stage = s.stage === 2 ? ' 2차' : '';
  const time = s.examTime ? ` ${s.examTime}` : '';
  return `${s.examType}${stage} ${range}${time}`;
}

/** 여러 일정을 비교표 한 칸에 (같은 문구는 접는다) */
export function formatSchedules(list: AdmissionSchedule[]): string {
  const seen: string[] = [];
  for (const s of list) {
    const t = formatSchedule(s);
    if (t && !seen.includes(t)) seen.push(t);
  }
  return seen.join(' · ');
}

/**
 * 자동으로 채울 **최종 합격자 발표일**.
 *
 * `announce_text` 에 `' / '` 가 있으면 원본이 "모집단위별 상이"를 뜻하므로 **채우지 않는다**
 * — 어느 쪽인지 모르는 채 한 날짜를 넣으면 학생이 그 날짜를 믿는다.
 * 여러 일정이 서로 다른 날짜를 말할 때도 마찬가지로 비운다.
 *
 * 반환은 `YYYY-MM-DD`(date 입력칸에 그대로 들어가는 형태) 또는 null.
 */
export function resolveAnnounceDate(list: AdmissionSchedule[], year: number): string | null {
  const found = new Set<string>();
  for (const s of list) {
    const raw = s.announceText;
    if (!raw) continue;
    if (raw.includes(' / ')) return null; // 모집단위별 상이 — 판단 보류
    const m = /^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*$/.exec(raw);
    if (!m) return null;                  // 날짜로 못 읽으면 보류
    found.add(`${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`);
  }
  if (found.size !== 1) return null;      // 없거나 서로 다르면 보류
  return [...found][0];
}

/** 발표일 원문 표기 (자동 채움이 보류돼도 사람이 볼 수 있게) */
export function announceSummary(list: AdmissionSchedule[]): string {
  const seen: string[] = [];
  for (const s of list) {
    const t = (s.announceText ?? '').trim();
    if (t && !seen.includes(t)) seen.push(t);
  }
  return seen.join(' · ');
}

/**
 * 전형·모집단위가 이 항목과 얼마나 닮았는지 (0~2).
 * 표기가 출처마다 갈라져 있어 **거르지 않고 정렬에만** 쓴다.
 */
export function scheduleRelevance(
  s: AdmissionSchedule,
  admissionName: string | null | undefined,
  department: string | null | undefined,
): number {
  const norm = (v: string) => v.replace(/[\s()[\]/·,]/g, '');
  let score = 0;
  const an = norm(admissionName ?? '');
  const sn = norm(s.admissionName);
  if (an && sn && (sn.includes(an) || an.includes(sn))) score += 1;
  const dep = norm(department ?? '');
  if (dep && s.units.some((u) => { const n = norm(u); return n.includes(dep) || dep.includes(n); })) score += 1;
  return score;
}

/**
 * 이 일정이 해당 전형 트랙(교과/종합)의 것인가.
 *
 * `admission_path` 는 `'학생부위주(교과) > … > 학생부교과(지역균형)'` 형태라 **첫 세그먼트가
 * 곧 트랙**이다. 교과 전형에 지원하는 학생에게 논술위주·실기위주 일정을 보여 주면
 * 자기 일정이 아닌 날짜가 섞여 상담이 어긋난다.
 *
 * 경로가 비어 있으면 **판단하지 않고 통과**시킨다 — 자료 결손 때문에 실제 일정이
 * 사라지는 쪽이 더 나쁘다.
 */
export function matchesTrack(admissionPath: string, track: 'gyogwa' | 'jonghap'): boolean {
  const path = (admissionPath ?? '').trim();
  if (!path) return true;
  const head = path.split('>')[0] ?? '';
  if (track === 'gyogwa') return head.includes('교과');
  return head.includes('종합');
}

/**
 * 이 일정이 **내 전형·모집단위와 맞는가** (강조 대상인지).
 *
 * `scheduleRelevance` 가 0보다 크면 전형명이나 모집단위 중 하나가 걸린 것이다.
 * **거르는 데 쓰지 않는다** — 전형명 표기가 출처마다 갈라져 있어 거르면 실제로 봐야 할
 * 일정까지 사라진다(2026-09-01 실측 후 되돌림). 대신 강조해서 눈이 먼저 가게 한다.
 */
export function isMySchedule(
  s: AdmissionSchedule,
  admissionName: string | null | undefined,
  department: string | null | undefined,
): boolean {
  return scheduleRelevance(s, admissionName, department) > 0;
}

/**
 * 전형 이름 정규화 — 매칭 전용.
 *
 * 두 출처가 같은 전형을 이렇게 다르게 적는다(라이브 실측):
 *   위시리스트 `학생부종합(큰사람 전형)`  ↔  일정 `학생부종합(큰사람)`
 * 공백·괄호·구분자를 지우고 **`전형` 접미사까지 떼면** 정확히 겹친다.
 * `전형` 을 떼는 이유는 한쪽만 붙이는 습관 차이일 뿐 의미가 없기 때문이다.
 */
export function normalizeAdmissionName(v: string | null | undefined): string {
  return (v ?? '')
    .replace(/[\s()[\]{}<>·,、/|]/g, '')
    .replace(/전형/g, '');
}

/**
 * 이 일정이 **그 전형의 것인가**.
 *
 * 전형명을 정규화해 양방향 부분일치로 본다. 한쪽에 `(예체능)` 같은 꼬리가 더 붙는
 * 경우가 있어 완전 일치만 인정하면 놓친다.
 *
 * 위시리스트에 전형명이 없으면 **판단하지 않고 true** — 이름이 없다고 일정을
 * 통째로 감추면 아무것도 못 보여준다.
 */
export function matchesAdmissionName(
  scheduleName: string,
  wishlistAdmissionName: string | null | undefined,
): boolean {
  const want = normalizeAdmissionName(wishlistAdmissionName);
  if (!want) return true;
  const got = normalizeAdmissionName(scheduleName);
  if (!got) return false;
  return got.includes(want) || want.includes(got);
}
