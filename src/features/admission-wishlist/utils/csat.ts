// 수능최저학력기준 충족 판정
//
// gyogwa.csat 자유텍스트(예 "국,수,영,탐(1) 중 2개 합 6")의 대표 조건을 파싱해,
// 학생의 최근 모의고사 영역별 등급과 비교한다. 핵심 패턴("N개 합 K")만 안전하게
// 다루고, 학과별 분기·"수 포함"·추가 한국사 조건 등은 단순화하며 simplified 플래그로
// 노출한다. (내신 적합도·반영교과 파싱과 동일 철학: 정직한 근사 + 근거 표시.)

/** 수능 영역 약칭 */
export type CsatArea = '국' | '수' | '영' | '탐' | '한';

/**
 * 최저 충족 계산 방식.
 * - sum:  선택 N개 등급의 "합" ≤ threshold   (예 "2개 합 6")
 * - avg:  선택 N개 등급의 "평균" ≤ threshold  (예 "2개 평균 5")
 * - each: 선택 N개가 "각각" ≤ threshold       (예 "3개 각 3")
 */
export type CsatMode = 'sum' | 'avg' | 'each';

export interface CsatRule {
  /** 대상 영역 집합 (탐은 탐구 묶음) */
  areas: Set<CsatArea>;
  /** 선택 개수 N ("N개 …") */
  count: number;
  /** 기준 등급 임계값 K — mode 에 따라 의미가 다름(합 상한/평균 상한/각 영역 상한) */
  threshold: number;
  /** 충족 계산 방식 */
  mode: CsatMode;
  /** 탐구 반영 과목 수 (탐(1)=1, 탐 또는 탐(2)=2) */
  tamCount: number;
  /** 학과별/계열별 분기·부가조건 등 단순화 적용 여부 */
  simplified: boolean;
  /** 원본 텍스트 */
  raw: string;
}

/** 모의 세부과목 → 수능 영역 매핑 */
function subjectToArea(subject: string): CsatArea | null {
  const s = subject.replace(/\s/g, '');
  // 국어
  if (/(화법과작문|언어와매체|독서|문학|화작|언매|^국어$)/.test(s)) return '국';
  // 수학
  if (/(확률과통계|미적분|기하|수학[ⅠⅡ12]|^수학$|확통)/.test(s)) return '수';
  // 영어
  if (/^영어/.test(s)) return '영';
  // 한국사
  if (/^한국사/.test(s)) return '한';
  // 탐구 (사회·과학·직업탐구 세부과목 — 위에 안 걸린 것들)
  // 사회: 생활과윤리/윤리와사상/한국지리/세계지리/동아시아사/세계사/정치와법/경제/사회·문화
  // 과학: 물리학/화학/생명과학/지구과학
  // 1·2학년 통합·일반 라벨: 통합/공통 사회·과학, "사회탐구"/"과학탐구" (영역 일반명)
  if (/(통합사회|통합과학|공통사회|공통과학|사회탐구|과학탐구|생활과윤리|윤리와사상|한국지리|세계지리|동아시아사|세계사|정치와법|경제|사회·?문화|사회문화|물리학|화학|생명과학|지구과학|물리|생명|지구)/.test(s)) return '탐';
  // '미응시' 등 등급 없는 placeholder 는 매핑하지 않음(호출부에서 grade null 로 필터)
  return null;
}

/** 약칭 토큰에서 영역 집합 추출 (예 "국,수,영,탐/직(1)" → {국,수,영,탐}) */
function parseAreas(token: string): Set<CsatArea> {
  const areas = new Set<CsatArea>();
  // '절사'(점수 절사 주석)의 '사'가 사회탐구로 오인되지 않도록 먼저 제거
  const t = token.replace(/절사/g, '');
  if (/국/.test(t)) areas.add('국');
  if (/수/.test(t)) areas.add('수');
  if (/영/.test(t)) areas.add('영');
  if (/한(?!국)/.test(t)) areas.add('한'); // "한" (한국사 약칭). "한국"은 본문에 거의 없음
  // 탐/직/사/과 (탐구·직업탐구·사회탐구·과학탐구) — 모두 '탐' 묶음으로 처리
  if (/탐|직|사|과/.test(t)) areas.add('탐');
  return areas;
}

/**
 * csat 텍스트에서 대표 조건 파싱. 첫 "N개 합 K" 패턴을 사용.
 * 학과별 분기(":")·여러 조건이 있으면 simplified=true.
 */
export function parseCsatRule(csat: string | null | undefined): CsatRule | null {
  if (!csat || !csat.trim()) return null;
  const raw = csat.trim();

  // 영역 토큰 문자 집합 (영역 약칭 + 숫자(탐(1))·괄호·절사 주석 허용)
  //
  // **`미기` 를 반드시 포함해야 한다 (2026-09-01 수정)**: `국,수(미/기),영,과(1) 중 3개 합 7`
  // 처럼 수학 선택과목을 괄호로 단 표기가 흔한데, `미`·`기` 가 허용 집합에 없으면 정규식이
  // 영역 나열의 **앞부분(국·수)을 통째로 건너뛰고** `영,과(1)` 부터 매칭한다.
  // 그러면 areas 가 {영,탐} 이 되어 **국어·수학을 안 보는 기준**이 만들어진다.
  // (라이브 실측: 이 한 글자 때문에 전북대 등 39개 조건이 구조화에서 폐기되고 있었다.)
  const AREA = '[국수영탐직사과한][국수영탐직사과한미기,()\\/\\s0-9절사]*?';
  // "[영역들] (중) N개 (합|평균|각) K"
  // — "중"은 선택적('중' 생략 "N개 합 K" 변형 구제), 키워드는 합/평균/각 모두 캡처
  const m = raw.match(new RegExp(`(${AREA})\\s*(?:중\\s*)?(\\d+)\\s*개\\s*(합|평균|각)\\s*(\\d+)`));
  // "국,수,영 중 1개 N" (키워드 없이 N개 K등급) 패턴 — 키워드형에 안 걸린 경우만
  const m1 = raw.match(new RegExp(`(${AREA})\\s*중\\s*(\\d+)\\s*개\\s*(\\d+)(?!\\s*개|\\s*합|\\s*평균|\\s*각)`));

  let areaToken: string, count: number, threshold: number, mode: CsatMode;
  if (m) {
    areaToken = m[1]; count = Number(m[2]); threshold = Number(m[4]);
    mode = m[3] === '평균' ? 'avg' : m[3] === '각' ? 'each' : 'sum';
  } else if (m1) {
    areaToken = m1[1]; count = Number(m1[2]); threshold = Number(m1[3]);
    // 키워드 없는 "N개 K": N=1 이면 각=합=평균이라 의미 동일, N>1 이면 합으로 근사
    mode = count === 1 ? 'each' : 'sum';
  } else {
    return null; // 파싱 불가
  }

  const areas = parseAreas(areaToken);
  if (areas.size === 0 || !Number.isFinite(count) || !Number.isFinite(threshold)) return null;

  // 탐구 반영 수: "탐(1)"/"과(1)"/"사(1)" → 1, 그 외 → 2 ('절사' 제거 후 판정)
  const at = areaToken.replace(/절사/g, '');
  const tamCount = /[탐직사과]\s*\(\s*1\s*\)/.test(at) ? 1 : 2;

  // 단순화 판정: 학과별 분기(":") · 여러 조건 · "수 포함"·"한 N" 부가조건
  const hasBranch = /[가-힣]+\s*:\s*/.test(raw)
    || (raw.match(/개\s*(?:합|평균|각)\s*\d+/g)?.length ?? 0) > 1
    || /수\s*포함|미\/기|상향|하향|절사|필수\s*응시/.test(raw)
    || /한\s*\d/.test(raw.replace(/한국/g, ''));

  return { areas, count, threshold, mode, tamCount, simplified: hasBranch, raw };
}

/** 학생 모의 한 과목 */
export interface MockSubject { subject: string; grade: number; }

export type CsatVerdict = 'meet' | 'fail' | 'unknown';

export interface CsatJudgeResult {
  verdict: CsatVerdict;
  /** 충족 계산 방식 (합/평균/각) */
  mode: CsatMode;
  /** 충족 판정에 사용된 영역·등급 (근거) */
  used: Array<{ area: CsatArea; subject: string; grade: number }>;
  /** 학생 영역별 best 등급 (전체 표시용) */
  byArea: Array<{ area: CsatArea; subject: string; grade: number }>;
  /** 선택 N개로 계산한 측정값(sum=합, avg=평균, each=N개 중 최대 등급). 판정불가면 null */
  value: number | null;
  /** 기준 임계값 K (mode 의미 적용) */
  threshold: number;
  count: number;
  simplified: boolean;
}

const AREA_ORDER: CsatArea[] = ['국', '수', '영', '탐', '한'];

/**
 * 선택된 N개 등급(오름차순 정렬됨)으로 mode별 충족 여부와 표시용 측정값을 계산.
 *
 * @param mode      sum=합 / avg=평균 / each=각 영역
 * @param grades    선택된 N개 등급 (오름차순. 가장 나쁜(큰) 등급이 마지막)
 * @param threshold 기준 임계값 K
 * @returns meet=충족 여부, value=표시용 측정값
 *
 * 설계 메모: grades 는 "규칙 영역 중 가장 좋은 N개"라서,
 *  - 합/평균은 그 N개의 합/평균이 최소가 되고(학생에게 가장 유리),
 *  - each("각 K 이하")는 N개 중 최댓값(= grades[N-1])만 K 이하이면 충족이다
 *    (가장 좋은 N개가 모두 통과하면 "N개 각 K 이하"를 만족하는 조합이 존재).
 */
function evalMode(mode: CsatMode, grades: number[], threshold: number): { meet: boolean; value: number } {
  const n = grades.length;
  const sum = grades.reduce((s, g) => s + g, 0);
  switch (mode) {
    case 'sum':
      // "N개 합 K": 합 ≤ K
      return { meet: sum <= threshold, value: sum };

    case 'avg':
      // "N개 평균 K": 평균 ≤ K. 부동소수 비교 회피 위해 sum ≤ K*N 로 판정,
      // value(표시용 평균)는 소수 1자리로 반올림.
      return { meet: n > 0 && sum <= threshold * n, value: Math.round((sum / n) * 10) / 10 };

    case 'each': {
      // "N개 각 K": 선택 N개가 각각 K 이하. grades 오름차순이라 마지막이 최댓값 →
      // 최댓값만 K 이하인지 확인하면 N개 전부 통과.
      const worst = grades[n - 1];
      return { meet: n > 0 && worst <= threshold, value: worst };
    }

    default:
      return { meet: sum <= threshold, value: sum };
  }
}

/**
 * 탐구 영역의 대표 등급 도출. 수능 탐구는 2과목이므로 반영 과목 수에 따라 1개 영역 등급으로 환산:
 *  - tamCount=1 ("탐(1)"): 상위 1과목 등급
 *  - tamCount=2 ("탐"/"탐(2)"/"탐(절사)"): 상위 2과목 "평균" (탐구 2과목 평균이 표준)
 * 평균 반올림은 원문에 '절사'면 내림, '반올림'이면 반올림, 미명시면 소수 1자리 유지(정직한 근사).
 * @param arr 학생 탐구 과목들(등급 오름차순 정렬됨)
 */
function tamguGrade(arr: Array<{ grade: number }>, tamCount: number, raw: string): number | null {
  if (arr.length === 0) return null;
  if (tamCount === 1) return arr[0].grade; // 상위 1과목
  const top = arr.slice(0, 2); // 상위 2과목 (보통 학생은 탐구 2과목 응시)
  const avg = top.reduce((s, x) => s + x.grade, 0) / top.length;
  if (/절사/.test(raw)) return Math.floor(avg);
  if (/반올림/.test(raw)) return Math.round(avg);
  return Math.round(avg * 10) / 10; // 정책 미명시 — 소수 유지
}

/**
 * 수능최저 충족 판정.
 * 학생 영역별 등급 중 규칙 areas 에 속하는 것을 영역당 1개씩(탐구는 1·2과목 환산 1영역) 모아,
 * 등급 오름차순 count 개 골라 mode(합/평균/각) 기준 threshold 와 비교. 영역이 부족하면 unknown.
 */
export function judgeCsat(rule: CsatRule | null, mock: MockSubject[]): CsatJudgeResult | null {
  if (!rule) return null;

  // 영역별 후보 등급 수집 (탐구는 2과목이 모두 모임)
  const byAreaMap = new Map<CsatArea, Array<{ subject: string; grade: number }>>();
  for (const m of mock) {
    if (m.grade == null || !Number.isFinite(m.grade)) continue;
    const area = subjectToArea(m.subject);
    if (!area) continue;
    if (!byAreaMap.has(area)) byAreaMap.set(area, []);
    byAreaMap.get(area)!.push({ subject: m.subject, grade: m.grade });
  }

  // 각 영역 등급 오름차순 정렬
  for (const arr of byAreaMap.values()) arr.sort((a, b) => a.grade - b.grade);

  // 규칙 대상 영역에서 후보 등급 풀 구성. **탐구는 2과목이라도 1개 영역**으로 환산한다
  // (tamCount=1 → 상위 1과목, tamCount=2 → 2과목 평균). 이전엔 탐구 2과목을 별개
  // 원소로 넣어 "N개 합"에서 탐구가 2개 영역처럼 이중 계산되는 버그가 있었다.
  const pool: Array<{ area: CsatArea; subject: string; grade: number }> = [];
  for (const area of rule.areas) {
    const arr = byAreaMap.get(area) ?? [];
    if (arr.length === 0) continue;
    if (area === '탐') {
      const g = tamguGrade(arr, rule.tamCount, rule.raw);
      if (g == null) continue;
      const label = rule.tamCount === 1
        ? `탐구(${arr[0].subject})`
        : `탐구평균(${arr.slice(0, 2).map((x) => x.subject).join('+')})`;
      pool.push({ area, subject: label, grade: g });
    } else {
      pool.push({ area, subject: arr[0].subject, grade: arr[0].grade });
    }
  }

  // 전체 영역 best (표시용)
  const byArea = AREA_ORDER
    .filter((a) => byAreaMap.has(a))
    .map((a) => {
      const best = byAreaMap.get(a)![0];
      return { area: a, subject: best.subject, grade: best.grade };
    });

  // count 개를 채울 만큼 영역이 있어야 판정 가능
  if (pool.length < rule.count) {
    return { verdict: 'unknown', mode: rule.mode, used: [], byArea, value: null, threshold: rule.threshold, count: rule.count, simplified: rule.simplified };
  }

  // 등급 오름차순 count 개 선택 → mode별 판정
  const chosen = [...pool].sort((a, b) => a.grade - b.grade).slice(0, rule.count);
  const { meet, value } = evalMode(rule.mode, chosen.map((c) => c.grade), rule.threshold);
  const verdict: CsatVerdict = meet ? 'meet' : 'fail';

  return { verdict, mode: rule.mode, used: chosen, byArea, value, threshold: rule.threshold, count: rule.count, simplified: rule.simplified };
}

export const CSAT_LABELS: Record<CsatVerdict, string> = {
  meet: '충족',
  fail: '미충족',
  unknown: '판정불가',
};
export const CSAT_COLORS: Record<CsatVerdict, string> = {
  meet: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  fail: 'bg-red-50 text-red-700 border-red-200',
  unknown: 'bg-slate-50 text-slate-500 border-slate-200',
};

// ============================================================
// 학과별 조건 분리 + 런타임 학과 매칭
// ------------------------------------------------------------
// 수능최저 67%가 한 텍스트에 학과별 다른 기준을 병기한다("간호: ... 의예: ...").
// 첫 조건만 쓰면 학생 학과에 안 맞는 기준으로 오판할 수 있으므로, 위시리스트의
// 실제 학과(department)에 명확히 매칭되는 조건이 있을 때만 판정하고, 매칭이
// 모호하거나 없으면 판정을 보류(원문+모의 등급만 제공)한다. (틀린 충족 판정 방지.)
// ============================================================

interface CsatBlock {
  /** 라벨 (학과/계열명들). 디폴트 조건은 빈 배열 */
  labels: string[];
  /** 이 블록의 조건 텍스트 */
  text: string;
}

/**
 * csat 을 조건 블록으로 분리.
 * "[라벨,라벨]: [조건]" 단위로 쪼개고, 첫 라벨 없는 부분은 디폴트 블록.
 * 예: "국,수,영,탐 중 2개 합 6 의예: ... 약학: ..." →
 *   [{labels:[], text:"국,수,영,탐 중 2개 합 6"}, {labels:["의예"], ...}, {labels:["약학"], ...}]
 */
export function splitCsatBlocks(csat: string): CsatBlock[] {
  const raw = csat.trim();
  // 라벨 패턴: 한글(+,·()/) 2~20자 + 콜론 + 뒤에 영역([국수영탐수]) 시작.
  // 영역 약칭이 아닌 일반 한글 라벨만 캡처 (예 "의예:", "인문:", "수의예,약학:")
  const re = /([가-힣A-Za-z][가-힣A-Za-z()/,·\s]{0,24}?)\s*:\s*(?=[국수영탐])/g;
  const blocks: CsatBlock[] = [];
  let lastIndex = 0;
  let lastLabels: string[] | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    // 이전 라벨의 조건 텍스트 = 이전 콜론 이후 ~ 이번 라벨 시작 전
    const segEnd = m.index;
    const seg = raw.slice(lastIndex, segEnd).trim();
    if (lastLabels === null) {
      // 첫 라벨 앞부분 = 디폴트 조건 (있으면)
      if (seg) blocks.push({ labels: [], text: seg });
    } else {
      blocks.push({ labels: lastLabels, text: seg });
    }
    // 라벨 정리: 이전 조건의 주석 꼬리만 제거하고 정상 라벨의 괄호("자연(일부 제외)",
    // "공공정책학(야)")는 보존. 노이즈 꼬리는 (a) '*' 주석 시작, 또는 (b) 닫는괄호+공백
    // 뒤에 새 한글 라벨이 이어지는 형태(예 "…이내 ) 과학교육학부").
    let cleanLabel = m[1];
    cleanLabel = cleanLabel.replace(/^.*\*\s*/, '');          // '* …' 주석 제거
    cleanLabel = cleanLabel.replace(/^.*?\)\s+(?=[가-힣])/, ''); // '주석) ' 꼬리 제거(뒤에 한글 라벨)
    cleanLabel = cleanLabel.trim();
    lastLabels = cleanLabel.split(/[,·]/).map((s) => s.trim()).filter(Boolean);
    lastIndex = re.lastIndex;
  }
  // 마지막 블록
  const tail = raw.slice(lastIndex).trim();
  if (lastLabels === null) {
    if (tail) blocks.push({ labels: [], text: tail });
  } else {
    blocks.push({ labels: lastLabels, text: tail });
  }
  return blocks;
}

/** 계열 라벨 (학과명 아님 — department 로 매칭 불가) */
const SERIES_LABELS = new Set(['인문', '자연', '자유', '자율', '공통', '자유전공', '자율전공']);
/** 단과대 패턴 (학과 아님) */
const COLLEGE_RE = /대학$|대$|학부$/;
/** 라벨 노이즈 (괄호/콜론 잔여 등) */
function isNoiseLabel(label: string): boolean {
  return /[)(]/.test(label) || label.length < 2 || label === '없음';
}

/**
 * 블록 라벨이 학생 학과(department)에 매칭되는 정도(점수).
 * 매칭되는 라벨 중 가장 긴 것의 글자 수를 반환(0 = 매칭 없음).
 * 점수로 두는 이유: "치의예과"는 "의예"(2자)·"치의예"(3자) 양쪽에 부분일치하므로,
 * 더 구체적인(긴) 라벨을 가진 블록을 정답으로 골라 모호성을 해소한다.
 * 학과명 부분일치(간호 ⊂ 간호학과)만 인정. 계열/단과대/노이즈는 0.
 */
function deptMatchScore(labels: string[], department: string): number {
  const dept = department.replace(/\s/g, '');
  let best = 0;
  for (const label of labels) {
    const L = label.replace(/\s/g, '');
    if (!L || isNoiseLabel(L) || SERIES_LABELS.has(L) || COLLEGE_RE.test(L)) continue;
    // 학과명 부분일치 (양방향: "의예"⊂"의예과", "간호학과"⊃"간호")
    if (dept.includes(L) || L.includes(dept)) best = Math.max(best, L.length);
  }
  return best;
}

export type CsatMatchKind =
  | 'single'       // 학과 분기 없음 — 단일 기준 (바로 판정)
  | 'matched'      // 분기 중 학생 학과에 명확히 1개 매칭 (판정)
  | 'default'      // 분기지만 매칭 0개 → 디폴트(라벨없는) 조건 적용 (판정)
  | 'ambiguous'    // 2개 이상 매칭 → 보류
  | 'no-match'     // 매칭 0개 + 디폴트 없음 → 보류
  | 'series'       // 계열(인문/자연) 분기라 학과명 매칭 불가 → 보류
  | 'unparseable'; // 조건 파싱 실패 → 보류

export interface CsatDeptResult {
  kind: CsatMatchKind;
  /** 판정 가능할 때(single/matched/default)의 결과. 보류면 null */
  judge: CsatJudgeResult | null;
  /** 적용된 조건 텍스트 (판정 시) */
  appliedText: string | null;
  /** 매칭된 라벨 (matched 시) */
  matchedLabels: string[] | null;
}

/**
 * 학과 매칭 기반 수능최저 판정. 학생 학과(department)에 명확히 매칭될 때만 판정,
 * 모호/불가하면 보류(judge=null) → UI 가 원문+모의 등급만 제공.
 */
export function judgeCsatForDepartment(
  csat: string | null | undefined,
  department: string | null | undefined,
  mock: MockSubject[]
): CsatDeptResult | null {
  if (!csat || !csat.trim()) return null;
  const blocks = splitCsatBlocks(csat);
  if (blocks.length === 0) return null;

  // 라벨 있는 블록이 없으면 = 단일 기준
  const labeledBlocks = blocks.filter((b) => b.labels.length > 0);
  const defaultBlock = blocks.find((b) => b.labels.length === 0) ?? null;

  if (labeledBlocks.length === 0) {
    // 단일 기준 (분기 없음) — 바로 판정
    const rule = parseCsatRule(csat);
    if (!rule) return { kind: 'unparseable', judge: null, appliedText: csat, matchedLabels: null };
    return { kind: 'single', judge: judgeCsat(rule, mock), appliedText: rule.raw, matchedLabels: null };
  }

  // 분기 있음 — department 로 매칭 시도
  const dept = (department ?? '').trim();
  if (!dept) {
    // 학과 정보 없으면 판정 보류 (어느 조건인지 모름)
    return { kind: 'no-match', judge: null, appliedText: null, matchedLabels: null };
  }

  // 각 블록의 매칭 점수(가장 구체적인 라벨 길이) 계산. 최고 점수 블록을 정답으로 본다.
  // ("치의예과" → "치의예"(3) 블록 점수 3 > "의예"(2) 블록 점수 2 → 치의예 선택)
  const scored = labeledBlocks
    .map((b) => ({ block: b, score: deptMatchScore(b.labels, dept) }))
    .filter((x) => x.score > 0);

  if (scored.length >= 1) {
    const maxScore = Math.max(...scored.map((x) => x.score));
    const top = scored.filter((x) => x.score === maxScore);
    if (top.length === 1) {
      // 최고 점수 블록 1개 — 정답
      const rule = parseCsatRule(top[0].block.text);
      if (!rule) return { kind: 'unparseable', judge: null, appliedText: top[0].block.text, matchedLabels: top[0].block.labels };
      return { kind: 'matched', judge: judgeCsat(rule, mock), appliedText: rule.raw, matchedLabels: top[0].block.labels };
    }
    // 동률 최고 점수가 2개 이상 — 진짜 모호 → 보류
    return { kind: 'ambiguous', judge: null, appliedText: null, matchedLabels: top.flatMap((x) => x.block.labels) };
  }

  // 매칭 0개. 계열 분기면 series, 디폴트 조건 있으면 그걸로, 없으면 no-match.
  const hasSeriesBranch = labeledBlocks.some((b) => b.labels.some((l) => SERIES_LABELS.has(l.replace(/\s/g, ''))));
  if (defaultBlock) {
    const rule = parseCsatRule(defaultBlock.text);
    if (rule) return { kind: 'default', judge: judgeCsat(rule, mock), appliedText: rule.raw, matchedLabels: null };
  }
  return { kind: hasSeriesBranch ? 'series' : 'no-match', judge: null, appliedText: null, matchedLabels: null };
}

/**
 * 학생 모의를 영역별 등급으로 정리 (판정 보류 시 근거 제공용).
 * **탐구는 2과목이므로 둘 다 표시**(영역당 best 1개로 접지 않음 — 이전엔 탐구가 1개만
 * 보였다). 그 외 영역(국·수·영·한)은 best 1개. 영역 순서·등급 오름차순.
 */
export function mockByArea(mock: MockSubject[]): Array<{ area: CsatArea; subject: string; grade: number }> {
  const map = new Map<CsatArea, Array<{ subject: string; grade: number }>>();
  for (const m of mock) {
    if (m.grade == null || !Number.isFinite(m.grade)) continue;
    const area = subjectToArea(m.subject);
    if (!area) continue;
    if (!map.has(area)) map.set(area, []);
    map.get(area)!.push({ subject: m.subject, grade: m.grade });
  }
  for (const arr of map.values()) arr.sort((a, b) => a.grade - b.grade);

  const out: Array<{ area: CsatArea; subject: string; grade: number }> = [];
  for (const area of AREA_ORDER) {
    const arr = map.get(area);
    if (!arr || arr.length === 0) continue;
    // 탐구는 응시한 과목 전부(보통 2과목), 그 외는 상위 1과목
    const take = area === '탐' ? arr : arr.slice(0, 1);
    take.forEach((x) => out.push({ area, subject: x.subject, grade: x.grade }));
  }
  return out;
}

/** 보류 사유 안내 문구 */
export const CSAT_WITHHOLD_REASON: Partial<Record<CsatMatchKind, string>> = {
  ambiguous: '학과가 여러 기준에 해당해 자동 판정을 보류했습니다.',
  'no-match': '이 학과에 해당하는 수능최저 기준을 특정하지 못해 자동 판정을 보류했습니다.',
  series: '계열별(인문/자연) 기준이라 학과로 자동 판정하기 어렵습니다.',
  unparseable: '수능최저 기준 형식이 복잡해 자동 판정을 보류했습니다.',
};
