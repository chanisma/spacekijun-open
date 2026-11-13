// 대학 기본 정보 — **입학처 사이트**와 **복수지원 가능 여부**.
//
// 출처 = jinhak.esteacher.kr/2027susi-summary.html 의 `const D = {...}` 리터럴
// (원 출처: 한국대학교육협의회 대학별 2027학년도 수시모집 자료, 202개 대학).
// 고사 일정 페이지와 같은 형태라 괄호 균형으로 잘라 낸다(문자열 안 괄호는 건너뛴다).
//
// 원본 한 대학 = `{ name, region, addr, home, apply, phone, baseDate, sections: {1..15} }`
// 이고 **`sections['13']` 이 곧 "복수지원 가능 여부"**다(`meta.sectionTitles` 가 밝힌다).
//
// React·DB 비의존 순수 모듈 — 적재 스크립트·회귀 테스트·화면이 함께 쓴다.

export const UNIV_INFO_SOURCE_URL = 'https://jinhak.esteacher.kr/2027susi-summary.html';

/**
 * 복수지원 가능 여부가 담긴 섹션 번호.
 * **원본 `meta.sectionTitles['13']` 로 검증한다** — 번호를 코드에 박아 두고 원본이
 * 섹션을 하나 끼워 넣으면 조용히 다른 내용(계약학과 등)을 복수지원으로 싣게 된다.
 */
export const MULTI_APPLY_SECTION = '13';
export const MULTI_APPLY_SECTION_TITLE = '복수지원 가능 여부';

/* ───────────────────── 원본 구조 ───────────────────── */

export type SusiBlock =
  | { t: 'p'; x: string }
  | { t: 'tb'; r: string[][] };

export interface RawSusiUniversity {
  name: string;
  region?: string;
  addr?: string;
  /** 입학처 사이트 — **URL 이 아닌 값도 온다**(`'입학처(해오름관 2층)'` 등) */
  home?: string;
  /** 원서접수 사이트 (유웨이·진학어플라이 등) */
  apply?: string;
  phone?: string;
  /** 그 대학 자료의 기준일 (`'2026년 6월 10일'`) */
  baseDate?: string;
  sections?: Record<string, SusiBlock[]>;
}

export interface RawSusiSummary {
  meta: { title?: string; source?: string; count?: number; sectionTitles?: Record<string, string> };
  regions?: string[];
  universities: RawSusiUniversity[];
}

/* ───────────────────── DB 행 / 화면용 ───────────────────── */

/** 복수지원 판정 */
export type MultiApplyStatus =
  /** 본교 내 복수지원이 가능하다고 밝힌 경우 */
  | 'allowed'
  /** 복수지원 불가 */
  | 'blocked'
  /** 전형이 하나뿐이어서 복수지원 개념이 성립하지 않는 경우 (`'해당 없음'`) */
  | 'not-applicable'
  /** 원문은 있으나 가능·불가를 단정할 수 없는 경우 — 원문을 그대로 읽어야 한다 */
  | 'unknown';

export const MULTI_APPLY_LABELS: Record<MultiApplyStatus, string> = {
  allowed: '가능',
  blocked: '불가',
  'not-applicable': '해당 없음',
  unknown: '원문 확인',
};

/** DB `admission_university_info` 한 행 */
export interface UnivInfoRow {
  university: string;
  university_canon: string;
  university_base: string;
  region: string | null;
  address: string | null;
  phone: string | null;
  /** 링크로 쓸 수 있는 입학처 주소 (파싱 실패 시 null) */
  home_url: string | null;
  /** 입학처 칸 원문 — URL 이 아니어도 보존한다 */
  home_raw: string | null;
  apply_url: string | null;
  apply_raw: string | null;
  multi_apply_status: MultiApplyStatus;
  /** 본교 내 최대 지원 횟수 (자료에 없으면 null) */
  multi_apply_limit: number | null;
  multi_apply_summary: string;
  /** 섹션 13 전문 */
  multi_apply_text: string | null;
  base_date: string | null;
  source_url: string;
}

/** 화면용 (camelCase) */
export interface AdmissionUnivInfo {
  university: string;
  universityCanon: string;
  universityBase: string;
  region: string | null;
  address: string | null;
  phone: string | null;
  homeUrl: string | null;
  homeRaw: string | null;
  applyUrl: string | null;
  applyRaw: string | null;
  multiApplyStatus: MultiApplyStatus;
  multiApplyLimit: number | null;
  multiApplySummary: string;
  multiApplyText: string | null;
  baseDate: string | null;
}

/* ───────────────────── 원본 파싱 ───────────────────── */

/**
 * `const D = {...}` 리터럴을 잘라 낸다.
 * 문자열 안의 중괄호를 세면 안 되므로 따옴표 상태를 추적한다.
 */
export function extractSusiSummary(html: string): RawSusiSummary {
  const m = /(?:const|let|var)\s+D\s*=\s*/.exec(html);
  if (!m) {
    throw new Error(
      `D 리터럴을 찾지 못했습니다. 원본 페이지 구조가 바뀐 것으로 보입니다 — ${UNIV_INFO_SOURCE_URL} 확인 필요.`,
    );
  }
  const start = m.index + m[0].length;
  if (html[start] !== '{') throw new Error('D 가 객체 리터럴이 아닙니다.');

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
  if (depth !== 0) throw new Error('D 리터럴의 괄호가 닫히지 않았습니다.');

  const parsed = JSON.parse(html.slice(start, i + 1)) as RawSusiSummary;
  if (!Array.isArray(parsed.universities) || parsed.universities.length === 0) {
    throw new Error('D.universities 가 비어 있습니다 — 구조가 바뀌었습니다.');
  }
  // 섹션 번호를 코드에 박고 원본이 순서를 바꾸면 **엉뚱한 섹션을 복수지원으로 싣는다**.
  const title = parsed.meta?.sectionTitles?.[MULTI_APPLY_SECTION];
  if (title && title !== MULTI_APPLY_SECTION_TITLE) {
    throw new Error(
      `섹션 ${MULTI_APPLY_SECTION} 이 '${MULTI_APPLY_SECTION_TITLE}' 이 아니라 '${title}' 입니다 — 원본 섹션 구성이 바뀌었습니다.`,
    );
  }
  return parsed;
}

/** 한 섹션의 블록들을 평문으로 (표는 셀을 ` | ` 로 잇는다) */
export function sectionText(uni: RawSusiUniversity, section: string): string {
  const blocks = uni.sections?.[section];
  if (!Array.isArray(blocks)) return '';
  const lines: string[] = [];
  for (const b of blocks) {
    if (!b) continue;
    if (b.t === 'p') {
      const x = (b.x ?? '').trim();
      if (x) lines.push(x);
    } else if (b.t === 'tb' && Array.isArray(b.r)) {
      for (const row of b.r) {
        // 셀 안의 줄바꿈은 공백으로 — 표 한 줄이 여러 줄로 흩어지면 읽을 수 없다
        const cells = (row ?? []).map((c) => (c ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
        if (cells.length > 0) lines.push(cells.join(' | '));
      }
    }
  }
  return lines.join('\n').trim();
}

/* ───────────────────── URL 위생 ───────────────────── */

/**
 * 호스트가 있는 첫 토큰을 뽑아 링크로 쓸 수 있는 주소로 만든다.
 *
 * **원본의 이 칸은 URL 이 아닐 수 있다** (실측: `'입학처(해오름관 2층)'`·`'입학처'`).
 * 그런 값을 그대로 `href` 에 넣으면 **상대경로**로 해석돼 우리 앱 안에서 이동한다
 * — 링크는 호스트로 파싱될 때만 만든다.
 *
 * 스킴이 없는 값도 34건 있어(`'go.hanyang.ac.kr'`) `https://` 를 붙인다.
 * 한 칸에 두 주소가 섞이거나 잘린 값(`'[대학] www.khu.ac.kr / ['`)에서는 **첫 주소**만 쓴다.
 */
export function normalizeSourceUrl(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  const m = /(https?:\/\/)?((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})(\/[^\s)\]]*)?/i.exec(s);
  if (!m) return null;
  const scheme = m[1] ?? 'https://';
  // `wwww.` 처럼 w 가 넷 이상이면 오타다(실측 `wwww.howon.ac.kr`). 그대로 두면 링크가 죽는다.
  const host = m[2].replace(/^w{4,}\./i, 'www.');
  const path = m[3] ?? '';
  return `${scheme}${host}${path}`;
}

/* ───────────────────── 대학명 정규화 ───────────────────── */

/**
 * 매칭용 대학명 정규화.
 *
 * 두 출처의 표기가 이렇게 다르다 — 위시리스트는 **약칭**, 이 자료는 **정식명**이다:
 *   `전북대` ↔ `전북대학교` · `이화여대` ↔ `이화여자대학교` · `서울과기대` ↔ `서울과학기술대학교`
 * 그래서 `대학교→대` 외에 약칭 3종(과학기술대·교육대·여자대)까지 짧은 쪽으로 모은다.
 * 이 세 규칙이 라이브 미매칭 14건 중 11건을 해결한다(나머지 3건 = 전문대·과기원이라
 * 4년제 자료에 원래 없다).
 *
 * **`keepCampus` 가 기본값인 이유**: 캠퍼스가 곧 정보의 단위다. 실측 분화 11곳 중
 * 입학처 URL 이 다른 곳 9 · 복수지원 규정이 다른 곳 10 이라, 캠퍼스를 뭉개면 두 값 모두
 * 남의 대학 것을 보여 준다(강원대 춘천/강릉/삼척은 복수지원 규정이 서로 다르다).
 */
function normalizeUniversityName(v: string | null | undefined, keepCampus: boolean): string {
  let s = (v ?? '').replace(/\s/g, '');
  // 괄호 종류 통일 — 원본에 전각·대괄호가 섞여 있다
  s = s.replace(/[［【[（]/g, '(').replace(/[］】\]）]/g, ')');
  if (!keepCampus) s = s.replace(/\([^)]*\)/g, '');
  s = s.replace(/대학교/g, '대');
  s = s.replace(/과학기술대/g, '과기대').replace(/교육대/g, '교대').replace(/여자대/g, '여대');
  return s;
}

/** 캠퍼스를 **보존**하는 매칭 키 (1순위) */
export function canonUniversity(v: string | null | undefined): string {
  return normalizeUniversityName(v, true);
}

/** 캠퍼스를 **버리는** 매칭 키 (2순위 폴백) */
export function baseUniversity(v: string | null | undefined): string {
  return normalizeUniversityName(v, false);
}

/* ───────────────────── 복수지원 판정 ───────────────────── */

/**
 * **판정은 공백을 모두 지운 문자열 위에서 한다.**
 *
 * 원본이 PDF 추출본이라 **단어 한가운데에 줄바꿈이 들어간다**(명지대 실측:
 * `'모든 전형 간 복수 지\n원 가능'`). 원문 그대로 `복수\s?지원` 을 대면 조용히
 * 빗나가고, 빗나간 결과는 오류가 아니라 '원문 확인'으로 보여 아무도 눈치채지 못한다.
 * 이 한 가지를 고치는 것만으로 라이브 판정이 38건 → 8건의 보류로 줄었다.
 */
function squeeze(v: string | null | undefined): string {
  return (v ?? '').replace(/\s/g, '');
}

/** 자료가 "해당 없음"이라고만 적은 경우 (전형이 하나뿐인 대학 — 라이브 10곳) */
const NOT_APPLICABLE = /^(해당없음|해당사항없음|없음|미해당)$/;

/**
 * 복수지원이 **가능**하다고 밝힌 표현.
 *
 * `중복(복수) 지원 가능`(한세대)처럼 괄호가 끼어드는 표기가 있어 한 겹 허용한다.
 *
 * **`(?!하지않|되지않|하지아니|않)` 이 반드시 붙어야 한다** — 없으면 아신대
 * `'복수지원을 허용하지 않습니다'` 가 `허용` 에 걸려 **'가능'으로 뒤집힌다**.
 * 정반대 판정이라 이 자료에서 가장 위험한 오류이고, 회귀가 이걸 잡았다.
 *
 * 이 목록은 **정규식 리터럴로 쓴다** — 템플릿 문자열로 조립하면 `\d`·`\(` 의
 * 백슬래시가 템플릿 이스케이프로 먹혀 `d`·`(` 가 되고, 그러면 패턴이 조용히
 * 아무것도 잡지 못한다(실제로 한 번 그렇게 깨졌다).
 */
const ALLOWED_HINTS = [
  /(?:복수|중복)(?:\([^)]{0,6}\))?지원(?:을|이|은|가)?(?:가능|허용)(?!하지않|되지않|하지아니|않)/,
  /(?:복수|중복)지원.{0,6}가능(?!하지않|되지않|하지아니|않)/,
  /(?:복수|중복)지원.{0,6}허용(?!하지않|되지않|하지아니|않)/,
  /(?:복수|중복)지원.{0,6}제한없/,
  /최대\d+회/,
  /\d+개.{0,6}전형.{0,4}지원.{0,2}가능(?!하지않|되지않|하지아니|않)/,
  /\d+회.{0,4}지원.{0,2}가능(?!하지않|되지않|하지아니|않)/,
  /\d+개의?전형까지지원/,
];

/**
 * 복수지원이 **불가**하다고 밝힌 표현.
 *
 * **반드시 `ALLOWED_HINTS` 다음에 본다.** 자료 대부분은 "가능하다, 단 동일 전형
 * 내에서는 불가" 형태라 `불가` 가 들어 있다는 이유로 막혔다고 읽으면 169곳 중
 * 상당수를 거꾸로 판정한다. 그래서 여기 패턴은 **대학 전체를 두고 하는 말**
 * (`모든 전형`·`전형 간`·`본교`·`우리대학`)이거나 원문이 그것뿐일 때만 잡는다.
 */
const BLOCKED_HINTS = [
  /^(?:(?:복수|중복)?(?:지원)?)(?:불가|불가능)$/,
  /^(?:불가|불가능)/,
  /(?:모든전형|전형간|전형상호간|전형유형간|본교|우리대학|대학내)\S{0,14}?(?:복수|중복)지원\S{0,8}?(?:불가|허용하지않)/,
  /^-?복수지원불가/,
  /(?:복수|중복)지원을?허용하지않/,
  /(?:복수|중복)지원할수없/,
  /복수의전형에지원불가/,
];

/**
 * **총량**을 선언하는 표현 — 이 대학에 몇 번 낼 수 있는지.
 * `전형(?!중)` 인 이유: 동서대 `'최대 11개 전형 **중** 6개 복수지원 가능'` 의 11은
 * 상한이 아니라 **고를 모집단**이다(실제 상한은 6). `중` 이 뒤따르면 총량이 아니다.
 */
const LIMIT_TOTAL = [/최대(\d+)회/g, /최대(\d+)개\S{0,4}?전형(?!중)/g, /총(\d+)회/g];

/** 총량 표현이 없을 때만 보는 표현 (`전형 간 2회 복수 지원 가능`) */
const LIMIT_NARROW = [/(\d+)회\S{0,4}?(?:복수|중복)?지원\S{0,2}?가능/g, /(\d+)개의?전형까지지원/g];

function collect(sq: string, patterns: RegExp[], min: number): number[] {
  const out: number[] = [];
  for (const re of patterns) {
    for (const m of sq.matchAll(re)) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n >= min && n <= 20) out.push(n);
    }
  }
  return out;
}

/**
 * 본교 내 **최대 지원 횟수**.
 *
 * **계층이 있다** — `최대`·`총` 이 붙은 값은 총량 선언이고, 맨 `N회 … 가능` 은
 * 하위 규칙일 수 있다. 그래서 총량 표현이 하나라도 있으면 **그 계열만** 본다.
 * 이 계층이 없으면 부산대가 조용히 틀린다(실측): 본교 상한은
 * `'우리 대학교에는 최대 6회까지 복수지원 가능'` 인데 그 아래
 * `'학생부교과 유형 안에서는 2회 복수지원 가능'` 이 있어 그냥 최솟값을 쓰면 **2회**가 된다.
 *
 * 계열 안에서는 **최솟값**을 쓴다 — 한 문서에 전국 공통 6회와 본교 상한이 함께
 * 적히기 때문이다(극동대 `최대 3회` + `최대 6회`, 동국대 `최대 5회` + `최대 6회`).
 *
 * 맨 수치 계열은 **2 이상만** 인정한다. 아주대 `'개별 전형 당 1회 지원 가능'` 은
 * 전형마다의 규칙이지 대학 상한이 아니다.
 *
 * 라이브 실측으로 6 미만 18곳을 전수 확인했다. 그래도 **하한(보수적 값)으로 읽을 것** —
 * 좁은 제한이 총량처럼 적힌 자료가 새로 들어오면 실제보다 작게 나올 수 있다.
 * 그래서 화면은 이 숫자만 두지 않고 **항상 원문을 함께 펼친다**.
 */
export function multiApplyLimit(text: string | null | undefined): number | null {
  const sq = squeeze(text);
  const total = collect(sq, LIMIT_TOTAL, 1);
  if (total.length > 0) return Math.min(...total);
  const narrow = collect(sq, LIMIT_NARROW, 2);
  return narrow.length > 0 ? Math.min(...narrow) : null;
}

/**
 * 섹션 13 원문 → 판정.
 *
 * 라이브 202곳 실측: 가능 169 · 불가 15 · 해당 없음 10 · 보류 8.
 * 보류 8곳은 표(제주대·선문대·인천대)나 결격 사유 서술(서울대)이라 규칙으로 읽기
 * 어렵다 — **화면이 원문을 그대로 펼치므로** 여기서 억지로 단정하지 않는다.
 */
export function classifyMultiApply(text: string | null | undefined): {
  status: MultiApplyStatus;
  limit: number | null;
  summary: string;
} {
  const sq = squeeze(text);
  const limit = multiApplyLimit(text);

  if (!sq) return { status: 'unknown', limit: null, summary: '자료 없음' };
  if (NOT_APPLICABLE.test(sq)) {
    return { status: 'not-applicable', limit: null, summary: '해당 없음 (전형 1개)' };
  }
  if (ALLOWED_HINTS.some((re) => re.test(sq))) {
    // 6 이상은 전국 공통 제한(수시 6회)과 같아 이 대학만의 추가 제약이 아니다.
    const summary = limit != null && limit < 6 ? `가능 · 본교 내 최대 ${limit}회` : '가능';
    return { status: 'allowed', limit, summary };
  }
  if (BLOCKED_HINTS.some((re) => re.test(sq))) {
    return { status: 'blocked', limit: null, summary: '본교 내 복수지원 불가' };
  }
  return { status: 'unknown', limit, summary: '원문 확인' };
}

/* ───────────────────── 행 만들기 ───────────────────── */

function orNull(v: unknown): string | null {
  const t = typeof v === 'string' ? v.trim() : '';
  return t === '' ? null : t;
}

/** 원본 → DB 행 목록 */
export function toUnivInfoRows(raw: RawSusiSummary): UnivInfoRow[] {
  return raw.universities
    .filter((u) => (u?.name ?? '').trim() !== '')
    .map((u) => {
      const text = sectionText(u, MULTI_APPLY_SECTION);
      const cls = classifyMultiApply(text);
      return {
        university: u.name.trim(),
        university_canon: canonUniversity(u.name),
        university_base: baseUniversity(u.name),
        region: orNull(u.region),
        address: orNull(u.addr),
        phone: orNull(u.phone),
        home_url: normalizeSourceUrl(u.home),
        home_raw: orNull(u.home),
        apply_url: normalizeSourceUrl(u.apply),
        apply_raw: orNull(u.apply),
        multi_apply_status: cls.status,
        multi_apply_limit: cls.limit,
        multi_apply_summary: cls.summary,
        multi_apply_text: orNull(text),
        base_date: orNull(u.baseDate),
        source_url: UNIV_INFO_SOURCE_URL,
      };
    });
}

/** 적재 전 검증 — 원본 형식이 바뀌면 절반만 들어가지 않고 여기서 걸린다 */
export function validateUnivInfoRows(rows: UnivInfoRow[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.university)) problems.push(`대학명 중복: ${r.university}`);
    else seen.add(r.university);
    if (!r.university_canon) problems.push(`${r.university}: 정규화 키가 비었습니다`);
    if (!r.university_base) problems.push(`${r.university}: 폴백 키가 비었습니다`);
    if (r.home_url && !/^https?:\/\//.test(r.home_url)) {
      problems.push(`${r.university}: 입학처 주소에 스킴이 없습니다 (${r.home_url})`);
    }
    if (r.multi_apply_limit != null && (r.multi_apply_limit < 1 || r.multi_apply_limit > 20)) {
      problems.push(`${r.university}: 지원 횟수가 범위를 벗어납니다 (${r.multi_apply_limit})`);
    }
  }
  if (rows.length < 100) problems.push(`대학 수가 ${rows.length}곳뿐입니다 — 원본을 다 읽지 못한 것으로 보입니다.`);
  return problems;
}

/** DB 행 → 화면용 */
export function mapUnivInfo(r: Record<string, unknown>): AdmissionUnivInfo {
  return {
    university: String(r.university ?? ''),
    universityCanon: String(r.university_canon ?? ''),
    universityBase: String(r.university_base ?? ''),
    region: (r.region as string | null) ?? null,
    address: (r.address as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    homeUrl: (r.home_url as string | null) ?? null,
    homeRaw: (r.home_raw as string | null) ?? null,
    applyUrl: (r.apply_url as string | null) ?? null,
    applyRaw: (r.apply_raw as string | null) ?? null,
    multiApplyStatus: (r.multi_apply_status as MultiApplyStatus) ?? 'unknown',
    multiApplyLimit: r.multi_apply_limit == null ? null : Number(r.multi_apply_limit),
    multiApplySummary: String(r.multi_apply_summary ?? ''),
    multiApplyText: (r.multi_apply_text as string | null) ?? null,
    baseDate: (r.base_date as string | null) ?? null,
  };
}

/* ───────────────────── 매칭 ───────────────────── */

/**
 * 한 위시리스트 대학명에 대한 매칭 결과.
 *
 * **정규화는 전부 여기(TS)에서 한다** — 서버는 canon/base 키로 행을 돌려주기만 하고
 * 어느 것을 고를지는 정하지 않는다. 규칙을 SQL 에도 적으면 두 벌이 조용히 갈라지고,
 * 갈라져도 화면에는 그냥 "자료 없음"으로 보여 아무도 눈치채지 못한다.
 */
export interface UnivInfoMatch {
  /** 확정된 한 곳 (없으면 null) */
  info: AdmissionUnivInfo | null;
  /** 후보 전체 — 모호할 때 화면이 무엇과 무엇 사이인지 밝힌다 */
  candidates: AdmissionUnivInfo[];
  /** 캠퍼스를 특정하지 못해 보류한 경우 */
  ambiguous: boolean;
  /** 캠퍼스를 버린 폴백으로 찾은 경우 (화면이 실제 매칭된 대학명을 밝혀야 한다) */
  viaBase: boolean;
}

export const NO_UNIV_INFO: UnivInfoMatch = { info: null, candidates: [], ambiguous: false, viaBase: false };

/**
 * 후보들 중 이 대학명에 해당하는 하나를 고른다.
 *
 * ①캠퍼스까지 같은 것이 정확히 하나면 확정
 * ②없으면 캠퍼스를 버린 키로 보되 **정확히 하나일 때만** 확정
 * ③여럿이면 **고르지 않는다** — 강원대처럼 캠퍼스마다 규정이 다른 곳에서 아무거나
 *   집으면 남의 대학 규정을 내 것으로 읽는다.
 */
export function resolveUnivInfo(
  university: string | null | undefined,
  rows: AdmissionUnivInfo[] | undefined,
): UnivInfoMatch {
  if (!rows || rows.length === 0) return NO_UNIV_INFO;
  const canon = canonUniversity(university);
  const base = baseUniversity(university);

  const exact = rows.filter((r) => r.universityCanon === canon);
  if (exact.length === 1) return { info: exact[0], candidates: exact, ambiguous: false, viaBase: false };
  if (exact.length > 1) return { info: null, candidates: exact, ambiguous: true, viaBase: false };

  const byBase = rows.filter((r) => r.universityBase === base);
  if (byBase.length === 1) return { info: byBase[0], candidates: byBase, ambiguous: false, viaBase: true };
  if (byBase.length > 1) return { info: null, candidates: byBase, ambiguous: true, viaBase: true };

  return NO_UNIV_INFO;
}

/** 서버에 넘길 조회 키 — canon 과 base 를 함께 보낸다 */
export function univInfoQueryKeys(universities: Array<string | null | undefined>): string[] {
  const keys = new Set<string>();
  for (const u of universities) {
    const c = canonUniversity(u);
    const b = baseUniversity(u);
    if (c) keys.add(c);
    if (b) keys.add(b);
  }
  return [...keys];
}

/* ───────────────────── 표시 ───────────────────── */

/** 링크 라벨 — 주소에서 호스트만 (`https://ipsi.cku.ac.kr/...` → `ipsi.cku.ac.kr`) */
export function urlHost(url: string | null | undefined): string {
  const m = /^https?:\/\/([^/]+)/i.exec(url ?? '');
  return m ? m[1] : (url ?? '');
}

/**
 * 이 목록에 같은 대학을 여러 곳 담았을 때의 안내.
 *
 * 위시리스트가 이 자료로 할 수 있는 **유일한 교차 검사**다 — 자료 혼자서는
 * "이 대학은 본교 내 3회까지"라고만 말하지만, 담은 개수와 대면 실제로 넘겼는지 알 수 있다.
 * `count` 는 **지원희망(6칸)** 안에서 같은 대학인 항목 수다.
 */
export function multiApplyWarning(
  info: AdmissionUnivInfo | null,
  count: number,
): { level: 'over' | 'blocked' | 'info' | null; message: string } {
  if (!info || count < 2) return { level: null, message: '' };
  if (info.multiApplyStatus === 'blocked' || info.multiApplyStatus === 'not-applicable') {
    return { level: 'blocked', message: `이 대학에 ${count}곳을 담았는데 자료는 복수지원을 인정하지 않습니다.` };
  }
  const limit = info.multiApplyLimit;
  if (limit != null && count > limit) {
    return { level: 'over', message: `이 대학에 ${count}곳을 담았는데 본교 내 상한은 ${limit}회입니다.` };
  }
  return { level: 'info', message: `이 대학에 ${count}곳을 담았습니다.` };
}
