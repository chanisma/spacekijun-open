// 전형 맞춤 내신 계산
//
// gyogwa 반영방법(subjects_all/careers 자유텍스트)을 파싱해 학생 과목 기록에
// 적용한다. **규칙을 그대로 재현할 수 있을 때만 계산한다** — 재현할 수 없는 규칙은
// 근사치를 내지 않고 계산을 보류(withheld)하고 그 사유를 노출한다.
//
// 2026-08 정책 변경(이전: 못 푼 규칙도 단순화해 계산하고 simplified 플래그만 표시).
// 실제 오답 사례 — 한서대 항공관광학과
//   "국,수,영(외,한문),(사,과,한)중 8과목(교과별 2과목)+진로선택 2과목=총 10과목"
//   ① 괄호 교과 묶음이 평탄화돼 반영 교과 필터가 사실상 무력화(전 교과 통과)
//   ② "중 8과목"이 진로선택까지 섞인 pool 에 적용돼 "+진로선택 2과목"이 소실
//   ③ 진로선택 환산이 "A=9.5점"(점수 체계)인데 기본 등급환산(A=1등급)으로 대체
//   → 어느 것도 simplified 로 잡히지 않아 "전형 반영 내신"으로 당당히 표시됐다.
// 입시는 고위험 도메인이라 "그럴듯한 숫자"가 "숫자 없음"보다 훨씬 위험하다.
// 그래서 기본(폴백) 환산은 아예 제거했고, 조금이라도 해석하지 못한 조건이 남으면
// 계산하지 않는다. 커버리지보다 정확도가 우선 — 라이브 376 전형 중 교과 규칙이
// 완전히 표현 가능한 것은 148건이고, 진로선택 반영까지 재현되는 것은 64건(≈17%)뿐이다.
// 나머지는 숫자 대신 보류 사유 + 반영방법 원문을 보여 모집요강 확인으로 넘긴다.

import type { GyogwaRef, GyogwaCareer } from '../types';

/** get_wishlist_subjects 한 행 */
export interface SubjectRecord {
  academicYear: number;
  grade: number;
  semester: number;
  category: string;          // 'regular' | 'career'(진로선택) | 'general'
  subjectGroup: string;
  subject: string;
  units: number;
  rank: number | null;       // 석차등급 (정량). null = 진로선택/PF
  achievement: string | null; // A~E / P
  score: number | null;
}

/* ───────────────────────── 계산 보류 사유 ───────────────────────── */

/** 규칙을 그대로 재현하지 못하게 만드는 조건 (하나라도 있으면 계산 보류) */
export type NaesinUncertainty =
  | 'multiple-rules'        // 이 전형의 반영방법을 하나로 특정 못함
  | 'department-branch'     // 학과·계열별 분기 ("간호: …", "유형1: …")
  | 'grade-branch'          // 학년별 분기 ("1학년(…)+2,3학년(…)")
  | 'group-syntax'          // 괄호 묶음 구조 ("(사,과,한) 중 8과목")
  | 'compound-quota'        // 과목 수 조건 분리 ("+진로선택 2과목=총 10과목")
  | 'unit-condition'        // 이수단위·원점수 조건
  | 'group-count'           // "3개 교과", "상위 N개 교과"
  | 'required-subject'      // "국,수,영 3과목 필수"
  | 'per-group-scope'       // 교과별 N과목인데 교과 구분이 생기부 교과군과 불일치
  | 'career-unconvertible'  // 진로선택 반영이 등급 환산이 아니거나 환산표가 불완전
  | 'career-quota'          // 진로선택 반영 과목 수·반영 비중이 별도 지정됨
  | 'career-scope'          // 진로선택 반영 범위가 교과 규칙과 다름
  | 'year-ratio-unapplied'  // 학년별 반영비율 해석 실패
  | 'no-heads'              // 반영 교과 자체를 식별 못함
  | 'unmodeled-text';       // 해석하지 못한 조건이 남음 (일반화 안전장치)

/** 사용자에게 보여줄 보류 사유 문구 */
export const NAESIN_UNCERTAINTY_LABELS: Record<NaesinUncertainty, string> = {
  'multiple-rules': '이 전형에 해당하는 반영방법을 하나로 특정하지 못했습니다',
  'department-branch': '학과·계열별로 반영 교과가 다릅니다',
  'grade-branch': '학년별로 반영 교과가 다릅니다',
  'group-syntax': '괄호로 묶인 교과 선택 구조를 정확히 해석할 수 없습니다',
  'compound-quota': '반영 과목 수 조건이 여러 개로 나뉘어 있습니다',
  'unit-condition': '이수단위·원점수 조건이 붙어 있습니다',
  'group-count': '"N개 교과"처럼 교과 자체를 고르는 조건이 있습니다',
  'required-subject': '필수 반영 과목 조건이 있습니다',
  'per-group-scope': '교과별 과목 수 조건의 교과 구분이 생기부 교과군과 일치하지 않습니다',
  'career-unconvertible': '진로선택 환산기준을 등급으로 그대로 옮길 수 없습니다(환산점수·가산점·부분 표기 등)',
  'career-quota': '진로선택 반영 과목 수·반영 비중이 따로 지정돼 있습니다',
  'career-scope': '진로선택 반영 범위가 반영 교과 범위와 달라 그대로 적용할 수 없습니다',
  'year-ratio-unapplied': '학년별 반영비율을 해석하지 못했습니다',
  'no-heads': '반영 교과를 식별하지 못했습니다',
  'unmodeled-text': '반영방법에 해석하지 못한 조건이 남아 있습니다',
};

/* ───────────────────────── 교과군 매핑 ───────────────────────── */

// student_academic_flat.subject_group → 반영교과 머리글자 정확 매핑.
// (부분문자열 매칭을 쓰면 "기술・가정/제2외국어/한문/교양" 안의 "제2외국어"의
//  "국어"가 국(국어)로 오탐된다. subject_group 은 MV 의 유한 고정 집합이라
//  정확 매핑이 안전하다.)
// head '기' = 기타 교과(기술·가정/제2외국어/한문/교양/정보 등 비주력 반영교과).
const GROUP_TO_HEAD: Record<string, string> = {
  '국어': '국',
  '수학': '수',
  '영어': '영',
  '사회(역사/도덕포함)': '사',
  '과학': '과',
  '한국사': '한',
  // 비주력 교과군 → '기'
  '기술・가정/제2외국어/한문/교양': '기',
  '기술·가정/정보': '기',
  '제2외국어/한문': '기',
};

/** subject_group → 반영교과 머리글자 (없으면 '기'로 폴백 — 모든 정규교과를 분류). */
function headOf(subjectGroup: string): string {
  return GROUP_TO_HEAD[subjectGroup] ?? '기';
}

/** subject_group 이 반영 머리글자 집합에 포함되는지 (정확 매핑) */
function groupMatches(subjectGroup: string, heads: Set<string>): boolean {
  return heads.has(headOf(subjectGroup));
}

// 주력 반영교과 머리글자 (국수영사과한). '기'(기타)는 토큰 인식으로 별도 추가.
const VALID_HEADS = new Set(['국', '수', '영', '사', '과', '한']);

// "전 과목/전과목/전 교과/전교과/모든 과목" 관용구. 머리글자 추출 전에 제거해야
// "전 과목"의 "과"가 과학 머리글자로 오인되는 것을 막는다.
const ALL_SUBJECTS_RE = /전\s*과목|전과목|전\s*교과|전교과|모든\s*과목/g;

// 비주력 교과(head '기') 토큰. subjects 문자열에 이들이 있으면 기타 교과군도 반영.
// 주의: "한문" 의 "한" 이 한국사로 오인되지 않도록 머리글자 추출 전에 제거(공백 치환)한다.
const OTHER_SUBJECT_RE = /제2외국어|제2외|한문|기술\s*가정|기술·가정|기술ㆍ가정|교양|정보|기타/g;

// 머리글자 추출을 방해하는 일반 단어들 — "과목/교과/과목수" 의 "과"·"목"이
// 머리글자(과학)로 오인되는 것을 막기 위해 먼저 제거한다.
const NOISE_WORDS_RE = /과목|교과|전\s*과목|전과목|전\s*교과|전교과|모든\s*과목|진로\s*선택|이수단위|반영/g;

// 통합사회·통합과학 약칭 — 각각 사회·과학 교과군.
const INTEGRATED_RE = /통사|통과/g;

/**
 * subjects 문자열에서 반영 교과군 머리글자 추출.
 * 예: "국,수,영,(사,과),한" → {국,수,영,사,과,한}
 *     "국,수,영,사,과,한,외,한문,기술가정" → {국,수,영,사,과,한,기}
 */
function parseHeadGroups(subjectsStr: string): Set<string> {
  const heads = new Set<string>();
  // 1) 비주력 교과 토큰 먼저 감지 (한문의 "한" 오인 방지를 위해 추출 전에 처리)
  OTHER_SUBJECT_RE.lastIndex = 0;
  let hasOther = OTHER_SUBJECT_RE.test(subjectsStr);
  // 단독 "외" (외국어 약칭, 쉼표/괄호로 구분된 토큰) — "이외" 등 일반어와 구분
  if (/(^|[,(（\s])외([,)）\s]|$)/.test(subjectsStr)) hasOther = true;
  if (hasOther) heads.add('기');

  // 2) 통합사회/통합과학은 각 교과군으로 먼저 확정 (머리글자 스캔에 맡기면
  //    "통과"의 "과"에 의존하게 돼 표기가 조금만 달라져도 어긋난다)
  INTEGRATED_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INTEGRATED_RE.exec(subjectsStr)) !== null) {
    heads.add(m[0] === '통사' ? '사' : '과');
  }

  // 3) 비주력 토큰 + 관용구·일반단어 제거 후 주력 머리글자 추출
  const cleaned = subjectsStr
    .replace(OTHER_SUBJECT_RE, ' ')
    .replace(INTEGRATED_RE, ' ')
    .replace(NOISE_WORDS_RE, ' ')
    .replace(/(^|[,(（\s])외([,)）\s]|$)/g, ' ');
  for (const ch of cleaned) {
    if (VALID_HEADS.has(ch)) heads.add(ch);
  }
  return heads;
}

/** "중 N과목" / "총 N과목" 등에서 전체 상위 N 추출 */
function parseTopN(subjectsStr: string): number | null {
  const m = subjectsStr.match(/(?:중|총)\s*(\d+)\s*과목/);
  if (m) return Number(m[1]);
  return null;
}

/** "교과별 N과목" 추출 (교과군별 상위 N) */
function parsePerGroupN(subjectsStr: string): number | null {
  const m = subjectsStr.match(/교과별\s*(\d+)\s*과목/);
  if (m) return Number(m[1]);
  return null;
}

/* ───────────────────────── 진로선택 환산 ───────────────────────── */

/** 내용이 있는 진로선택 반영방법 항목만 (빈 껍데기 제외) */
function meaningfulCareers(careers: GyogwaCareer[] | null | undefined): GyogwaCareer[] {
  return (careers ?? []).filter(
    (c) =>
      (c.method ?? '').trim() ||
      (c.criteria ?? '').trim() ||
      (c.subject ?? '').trim() ||
      (c.note ?? '').trim(),
  );
}

/**
 * 진로선택 **등급** 환산표 파싱 (careers.criteria, 예: "A=1등급, B=2등급, C=4등급").
 * "A=9.5점" 같은 점수 환산은 의도적으로 매칭하지 않는다 — 점수(높을수록 우수)와
 * 등급(낮을수록 우수)은 방향도 스케일도 달라 등급 평균에 섞을 수 없다.
 */
function parseCareerConversion(careers: GyogwaCareer[]): Record<string, number> | null {
  for (const c of careers) {
    const crit = c.criteria ?? '';
    const map: Record<string, number> = {};
    // "A=1등급", "A:1등급", "A는 1등급" — 반드시 "등급" 표기가 있어야 한다
    const re = /([A-E])\s*[=:는]?\s*(\d+)\s*등급/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(crit)) !== null) {
      map[m[1]] = Number(m[2]);
    }
    if (Object.keys(map).length > 0) return map;
  }
  return null;
}

/**
 * 진로선택 반영을 재현할 수 있는지 판정.
 * careers 가 비어 있으면(= 진로선택 반영 정보 없음) 보류 사유가 아니다 —
 * 석차등급 과목만 반영하고 그 사실을 화면에 밝힌다.
 */
function careerUncertainty(
  careers: GyogwaCareer[],
  conv: Record<string, number> | null,
  restrictedGroups: boolean,
): NaesinUncertainty[] {
  if (careers.length === 0) return [];
  const out: NaesinUncertainty[] = [];
  // method 가 "성취도별 환산등급" 계열일 때만 등급 평균으로 재현 가능.
  // 환산점수·가산점·단위수만 반영·정성평가·원점수별 환산점수는 재현 불가.
  const allGradeConv = careers.every((c) => /환산\s*등급/.test(c.method ?? ''));
  // 환산표는 A·B·C 를 모두 덮어야 한다. "A=1등급, B,C=성취도 비율 고려 산출" 처럼
  // 일부만 등급이면 나머지 성취도 과목이 조용히 빠져 유리한 쪽으로 치우친다.
  const complete = !!conv && ['A', 'B', 'C'].every((k) => conv[k] != null);
  // "원점수가 표기된 경우 원점수별 환산등급 부여" 같은 조건부 분기는 재현 불가
  const conditional = careers.some((c) => /원점수/.test(c.criteria ?? ''));
  if (!allGradeConv || !complete || conditional) out.push('career-unconvertible');
  // note 의 "3과목"(별도 쿼터)·"10% 반영"(부분 반영 비중)은 모델이 표현하지 못한다
  if (careers.some((c) => /\d+\s*과목|%/.test(c.note ?? ''))) out.push('career-quota');
  // 진로선택 반영 범위가 "전 과목"인데 교과 규칙은 특정 교과군으로 제한된 경우,
  // 우리 필터는 진로선택까지 교과군으로 걸러 실제보다 좁게 반영한다.
  if (restrictedGroups && careers.some((c) => /전\s*과목/.test(c.subject ?? ''))) {
    out.push('career-scope');
  }
  return out;
}

/* ───────────────────────── 학년별 반영비율 ───────────────────────── */

/**
 * subjects_all[].ratio (학년별 반영비율, 예 "20/30/50" = 1·2·3학년) 파싱.
 * **3개 값일 때만** {1,2,3}학년 가중치로 적용한다. 라벨("간호: 40/30/30")은 떼고,
 * 2개 등 모호한 형식은 적용하지 않는다. 합이 0이면 무효.
 */
function parseYearRatio(gyogwa: GyogwaRef): Record<number, number> | null {
  for (const s of gyogwa.subjects_all ?? []) {
    const r = (s.ratio ?? '').trim();
    if (!r) continue;
    // 라벨 제거 ("간호: 40/30/30" → "40/30/30")
    const body = r.includes(':') ? r.slice(r.lastIndexOf(':') + 1) : r;
    const parts = body.split('/').map((x) => Number(x.trim()));
    if (parts.length === 3 && parts.every((n) => Number.isFinite(n)) && parts.some((n) => n > 0)) {
      return { 1: parts[0], 2: parts[1], 3: parts[2] };
    }
  }
  return null;
}

/** subjects_all 중 ratio 텍스트가 하나라도 있는지 (적용 못했으면 보류 사유) */
function hasAnyRatioText(gyogwa: GyogwaRef): boolean {
  return (gyogwa.subjects_all ?? []).some((s) => (s.ratio ?? '').trim().length > 0);
}

/* ───────────────────── 반영방법 변형(variant) 선택 ───────────────────── */

function normAdmission(s: string | null | undefined): string {
  return (s ?? '').replace(/[\s()（）·,]/g, '').toLowerCase();
}

/** subjects_all[].admission 은 "학생부교과, 한서인재" 처럼 여러 전형을 묶어 적는다 */
function admissionTokens(s: string | null | undefined): string[] {
  return (s ?? '')
    .split(/[,/]/)
    .map((t) => normAdmission(t))
    .filter(Boolean);
}

/**
 * 이 전형(gyogwa 행)에 적용할 반영방법 문자열 1개를 고른다.
 *
 * subjects_all 에는 같은 대학의 여러 전형 규칙이 함께 들어 있다(평택대 PTU교과
 * 9과목 / PTU추천 3과목). 예전엔 "가장 긴 문자열"을 골라 전형이 다르면 조용히
 * 남의 규칙을 적용했다. 이제는 전형명(admission)으로 맞추고, 못 맞추면 보류한다.
 */
/** `subjects_all` 한 항목 (표시·선택에 필요한 필드만) */
export interface SubjectVariant {
  subjects: string;
  admission: string | null;
  unit: string | null;
  ratio: string | null;
}

/** `subjects_all` 전체 (반영 교과가 비어 있는 항목은 뺀다) */
export function subjectVariants(gyogwa: GyogwaRef | null): SubjectVariant[] {
  return (gyogwa?.subjects_all ?? [])
    .map((s) => ({
      subjects: (s.subjects ?? '').trim(),
      admission: s.admission ?? null,
      unit: s.unit ?? null,
      ratio: s.ratio ?? null,
    }))
    .filter((v) => v.subjects.length > 0);
}

/**
 * 이 전형에 적용되는 반영 교과 규칙 하나를 고른다.
 *
 * `subjects_all` 은 **그 대학의 모든 전형 규칙**을 담고 있다(라이브 실측: 60개 전형이
 * 2건, 1개가 3건). 예컨대 서경대 행은 `교과우수자`인데 배열에는 `교과균형` 규칙도 함께
 * 들어 있어, 그대로 이어 붙이면 **남의 전형 반영 교과가 내 칸에 섞인다**.
 *
 * 고르는 방법은 **행의 전형명(`gyogwa.admission`)과 정확히 맞는 규칙 하나**뿐이다.
 * 0개거나 2개 이상이면 `ambiguous` 로 두고 **아무것도 확정하지 않는다** — 계산은 보류하고
 * 화면은 전체를 보여 준다. 잘못 고른 반영 교과로 계산한 내신은 틀린 확신을 준다.
 */
export function selectSubjectVariant(
  gyogwa: GyogwaRef | null,
): { variant: SubjectVariant | null; ambiguous: boolean; all: SubjectVariant[] } {
  const all = subjectVariants(gyogwa);
  const distinct = Array.from(new Set(all.map((v) => v.subjects)));
  if (distinct.length === 0) return { variant: null, ambiguous: false, all };
  if (distinct.length === 1) {
    return { variant: all.find((v) => v.subjects === distinct[0]) ?? null, ambiguous: false, all };
  }

  const rowKey = normAdmission(gyogwa?.admission ?? null);
  if (rowKey) {
    // 세 단계를 **엄격한 순서로** 시도하고, 어느 단계든 답이 하나로 좁혀지면 거기서 멈춘다.
    // 순서가 곧 안전장치다 — 1단계가 지금까지 쓰던 규칙이므로, 뒤 단계를 더해도
    // **이미 확정되던 행의 답은 바뀌지 않는다**(라이브 48건 불변).
    const tiers: Array<(v: SubjectVariant) => boolean> = [
      // ① 전형명 토큰이 정확히 일치 (기존 규칙)
      //    변형은 "일반학생, 교과성적우수자" 처럼 여러 전형을 묶어 적으므로 쪼개서 본다.
      (v) => admissionTokens(v.admission).includes(rowKey),

      // ② 통째로 같은 문자열
      //    ①은 **변형만** 쉼표로 쪼개서, 행에도 쉼표가 있으면 어긋난다
      //    (인제대: 행 `의예,약학` → `의예약학` vs 변형 토큰 `의예`·`약학`).
      //    둘을 같은 방식으로 정규화하면 같은 값이므로 이건 확실한 일치다.
      (v) => normAdmission(v.admission) === rowKey,

      // ③ 한쪽이 다른 쪽을 포함 (표기의 수식어 차이)
      //    송원대: 행 `학생부 우수자` ↔ 변형 `학생부우수자 (일반)`.
      //    가장 느슨하므로 **맨 뒤**에 두고, 그래도 둘 이상 걸리면 보류한다.
      //    (2·3자짜리 짧은 이름이 여러 전형에 걸리는 것을 유일성 요구가 막는다.)
      (v) => {
        const key = normAdmission(v.admission);
        return key.length > 0 && (key.includes(rowKey) || rowKey.includes(key));
      },
    ];
    for (const hit of tiers) {
      const matched = all.filter(hit);
      const matchedSubjects = Array.from(new Set(matched.map((v) => v.subjects)));
      if (matchedSubjects.length === 1) return { variant: matched[0], ambiguous: false, all };
    }
  }
  // 어느 규칙이 이 전형의 것인지 알 수 없음 → 표시는 전체, 계산은 보류.
  // (라이브 잔여 2건은 `admission` 칸에 전형이 아니라 **학과명**(`군사학과`)이 들어 있어
  //  원리상 가려낼 수 없다. 추측해서 고르면 남의 전형 반영 교과로 내신을 계산하게 된다.)
  const longest = [...distinct].sort((a, b) => b.length - a.length)[0];
  return { variant: all.find((v) => v.subjects === longest) ?? null, ambiguous: true, all };
}

function selectVariant(gyogwa: GyogwaRef): { raw: string; ambiguous: boolean } {
  const { variant, ambiguous } = selectSubjectVariant(gyogwa);
  return { raw: variant?.subjects ?? '', ambiguous };
}

/* ─────────────────── 해석 잔여물 검사 (일반화 안전장치) ─────────────────── */

// 우리가 "의미를 안다"고 말할 수 있는 토큰만 소비한다. 소비 후 남은 글자가 있으면
// 아직 모델에 없는 조건이 있다는 뜻 → 보류. 새로운 표기가 들어와도 조용히
// 무시되지 않게 하는 장치다. 괄호·+·= 는 일부러 소비하지 않는다(구조 신호).
const CONSUMABLE: RegExp[] = [
  /\(\s*교과별\s*\d+\s*과목\s*\)/g, // (교과별 2과목) — 모델이 표현 가능한 유일한 괄호
  /교과별\s*\d+\s*과목/g,
  /(?:중|총)\s*\d+\s*과목/g,
  /전\s*과목|전과목|전\s*교과|전교과|모든\s*과목/g,
  /제2외국어|제2외|한문|기술\s*[·ㆍ]?\s*가정|교양|정보|기타/g,
  /통사|통과/g,
  /반영|교과|과목/g,
  /[국수영사과한외체예]/g,
  /[\s,·]/g,
];

function residualOf(raw: string): string {
  let s = raw;
  for (const re of CONSUMABLE) {
    re.lastIndex = 0;
    s = s.replace(re, ' ');
  }
  return s.replace(/\s+/g, '');
}

/* ───────────────────────── 규칙 파싱 ───────────────────────── */

export interface NaesinRule {
  /** 반영 교과군 머리글자 (비어 있으면 전 교과 반영) */
  headGroups: Set<string>;
  /** 전 교과 반영 모드 ("전 과목/전 교과" — 교과군 필터 OFF) */
  allSubjects: boolean;
  /** 전체 상위 N (null = 전체) */
  topN: number | null;
  /** 교과별 상위 N (null = 미적용) */
  perGroupN: number | null;
  /** 진로선택 등급 환산표 (achievement → 등급). null = 진로선택 미반영 */
  careerConv: Record<string, number> | null;
  /** 학년별 반영비율 {1,2,3학년: 가중치}. null = 미적용(전 학년 동일 가중) */
  yearWeights: Record<number, number> | null;
  /** 규칙을 그대로 재현할 수 있는가. false 면 계산하지 않는다 */
  certain: boolean;
  /** 재현 불가 사유 (certain=false 일 때 비어있지 않음) */
  uncertainties: NaesinUncertainty[];
  /** 전형이 진로선택 반영방법을 명시했는지 */
  careerReflected: boolean;
  /** 원본 규칙 텍스트 (표시용) */
  raw: string;
}

/** gyogwa 반영방법에서 계산 규칙 추출 */
export function parseNaesinRule(gyogwa: GyogwaRef | null): NaesinRule | null {
  if (!gyogwa) return null;
  const { raw, ambiguous } = selectVariant(gyogwa);
  const careers = meaningfulCareers(gyogwa.careers);
  if (!raw && careers.length === 0) return null;

  const headGroups = parseHeadGroups(raw);
  const topN = parseTopN(raw);
  const perGroupN = parsePerGroupN(raw);
  const careerConv = parseCareerConversion(careers);
  const yearWeights = parseYearRatio(gyogwa);

  ALL_SUBJECTS_RE.lastIndex = 0;
  const mentionsAll = ALL_SUBJECTS_RE.test(raw);
  // 전 교과 반영은 문서가 실제로 "전 과목/전 교과"라고 말할 때만.
  // (예전엔 머리글자를 못 잡으면 전 과목으로 간주했는데, 그건 조용한 추측이다.)
  const allSubjects = headGroups.size === 0 && mentionsAll;

  const uncertainties: NaesinUncertainty[] = [];
  const add = (c: NaesinUncertainty) => {
    if (!uncertainties.includes(c)) uncertainties.push(c);
  };

  if (ambiguous) add('multiple-rules');
  if (!raw) {
    add('no-heads');
  } else {
    if (/[:：]/.test(raw)) add('department-branch');
    if (/\d\s*학년/.test(raw)) add('grade-branch');
    if (/[+=]/.test(raw) || /진로\s*선택/.test(raw)) add('compound-quota');
    if (/이수\s*단위|단위\s*이상|원점수/.test(raw)) add('unit-condition');
    if (/\d+\s*개\s*교과|상위\s*\d+/.test(raw)) add('group-count');
    if (/필수/.test(raw)) add('required-subject');
    // (교과별 N과목) 외의 괄호가 남으면 교과 묶음/부가조건 구조다
    if (/[()（）]/.test(raw.replace(/\(\s*교과별\s*\d+\s*과목\s*\)/g, ''))) add('group-syntax');
    if (headGroups.size === 0 && !mentionsAll) add('no-heads');
    // '기'(기타)는 생기부 교과군 3개에 걸쳐 있어 "교과별 N과목"을 그대로 적용하면 과대 반영
    if (perGroupN != null && headGroups.has('기')) add('per-group-scope');
    if (residualOf(raw).length > 0) add('unmodeled-text');
  }
  // 교과 규칙이 특정 교과군으로 제한되면 진로선택 반영 범위와 어긋날 수 있다
  careerUncertainty(careers, careerConv, !allSubjects && headGroups.size > 0).forEach(add);
  if (!yearWeights && hasAnyRatioText(gyogwa)) add('year-ratio-unapplied');

  return {
    headGroups,
    allSubjects,
    topN,
    perGroupN,
    careerConv,
    yearWeights,
    certain: uncertainties.length === 0,
    uncertainties,
    careerReflected: careers.length > 0,
    raw,
  };
}

/* ───────────────────────── 계산 ───────────────────────── */

export interface NaesinResult {
  /** 전형 맞춤 환산 평균 등급 (낮을수록 우수). 보류 시 null */
  avgGrade: number | null;
  /** 계산에 반영된 과목 (표시용 근거) */
  usedSubjects: Array<{
    subject: string; subjectGroup: string; grade: number; semester: number;
    units: number; appliedGrade: number; isCareer: boolean;
    rank: number | null; achievement: string | null;
  }>;
  /** 제외된 과목 (표시용 — 왜 빠졌는지 + 등급·성취도로 검증 가능하게) */
  excludedSubjects: Array<{
    subject: string; subjectGroup: string; grade: number; semester: number;
    units: number; rank: number | null; achievement: string | null;
    /** 진로선택 등 환산이 산출된 경우의 적용 등급 (상위N 절단 등으로 빠질 때 표시) */
    appliedGrade: number | null;
    reason: string;
  }>;
  /** 제외된 과목 수 (P/F·미반영 교과군·상위N 절단 등) */
  excludedCount: number;
  /** 규칙을 재현할 수 없어 계산을 보류했는지 (avgGrade=null) */
  withheld: boolean;
  /** 보류 사유 */
  uncertainties: NaesinUncertainty[];
  /** 진로선택 반영 정보가 없어 석차등급 과목만 반영했는지 */
  careerOmitted: boolean;
  /** 학년별 반영비율(20/30/50 등)을 평균에 적용했는지 */
  usedYearWeights: boolean;
  /** 규칙 없이 전과목 평균으로 계산했는지 */
  fallback: boolean;
}

/**
 * 학생 과목 기록 + 전형 규칙 → 전형 맞춤 내신.
 *
 * - rule.certain === false → **계산하지 않는다**(withheld). 기본 환산·단순화 근사 금지.
 * - rule === null → 전형 필터 없이 전과목 나열(1·2학년 기록 표시용, fallback=true).
 */
export function computeRuleNaesin(
  subjects: SubjectRecord[],
  rule: NaesinRule | null,
): NaesinResult {
  // 규칙을 재현할 수 없으면 근사치를 만들지 않고 보류한다.
  if (rule && !rule.certain) {
    return {
      avgGrade: null,
      usedSubjects: [],
      excludedSubjects: [],
      excludedCount: 0,
      withheld: true,
      uncertainties: rule.uncertainties,
      careerOmitted: false,
      usedYearWeights: false,
      fallback: false,
    };
  }

  type Cand = SubjectRecord & { appliedGrade: number; isCareer: boolean };
  const candidates: Cand[] = [];
  const excluded: NaesinResult['excludedSubjects'] = [];
  const pushExcluded = (s: SubjectRecord & { appliedGrade?: number }, reason: string) =>
    excluded.push({
      subject: s.subject, subjectGroup: s.subjectGroup, grade: s.grade, semester: s.semester,
      units: s.units, rank: s.rank, achievement: s.achievement,
      appliedGrade: s.appliedGrade ?? null, reason,
    });

  // 1) 과목별 적용 등급 산출 + 제외 사유 기록.
  //    진로선택(rank null, 성취도 A~E)은 **전형이 등급 환산표를 명시한 경우에만** 반영.
  //    기본 환산(A=1…) 폴백은 제거했다 — 대학마다 환산이 달라 조용한 오답이 된다.
  let careerOmitted = false;
  for (const s of subjects) {
    if (s.rank != null && Number.isFinite(s.rank)) {
      candidates.push({ ...s, appliedGrade: s.rank, isCareer: false });
    } else if (s.achievement === 'P' || !s.achievement) {
      pushExcluded(s, 'P/F·미산출');
    } else {
      const g = rule?.careerConv?.[s.achievement];
      if (g != null) {
        candidates.push({ ...s, appliedGrade: g, isCareer: true });
      } else {
        careerOmitted = true;
        pushExcluded(s, '진로선택(전형 환산기준 없음)');
      }
    }
  }

  // 2) 반영 교과군 필터
  //    - allSubjects("전 과목/전 교과"): 필터 OFF
  //    - headGroups 지정: 그 교과군만 반영
  const useRule = !!rule
    && (rule.allSubjects || rule.headGroups.size > 0 || rule.topN != null
      || rule.perGroupN != null || !!rule.careerConv);
  let filtered = candidates;
  if (rule && !rule.allSubjects && rule.headGroups.size > 0) {
    const passed: Cand[] = [];
    for (const c of candidates) {
      if (groupMatches(c.subjectGroup, rule.headGroups)) passed.push(c);
      else pushExcluded(c, '미반영 교과');
    }
    filtered = passed;
  }

  // 3) 상위 N (교과별 우선, 없으면 전체). 등급 오름차순(우수) 정렬 후 절단.
  if (rule?.perGroupN != null) {
    const byGroup = new Map<string, Cand[]>();
    for (const c of filtered) {
      const key = c.subjectGroup;
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(c);
    }
    const kept: Cand[] = [];
    for (const arr of byGroup.values()) {
      const sorted = arr.sort((a, b) => a.appliedGrade - b.appliedGrade);
      kept.push(...sorted.slice(0, rule.perGroupN!));
      sorted.slice(rule.perGroupN!).forEach((c) => pushExcluded(c, `교과별 상위 ${rule.perGroupN} 제외`));
    }
    filtered = kept;
  }
  if (rule?.topN != null) {
    const sorted = [...filtered].sort((a, b) => a.appliedGrade - b.appliedGrade);
    sorted.slice(rule.topN).forEach((c) => pushExcluded(c, `상위 ${rule.topN}과목 제외`));
    filtered = sorted.slice(0, rule.topN);
  }

  // 4) 집계. 학년별 반영비율(yearWeights)이 있으면 학년별 학점가중평균을 비율로 결합,
  //    없으면 전체 학점가중평균.
  let avgGrade: number | null = null;
  let usedYearWeights = false;
  if (rule?.yearWeights && filtered.length > 0) {
    const byYear = new Map<number, { wsum: number; usum: number }>();
    for (const c of filtered) {
      const e = byYear.get(c.grade) ?? { wsum: 0, usum: 0 };
      e.wsum += c.appliedGrade * (c.units || 0);
      e.usum += c.units || 0;
      byYear.set(c.grade, e);
    }
    let num = 0, den = 0;
    for (const [y, w] of Object.entries(rule.yearWeights)) {
      const e = byYear.get(Number(y));
      if (!e || e.usum === 0) continue; // 그 학년 과목이 없으면 비율에서 제외(나머지로 재정규화)
      num += (e.wsum / e.usum) * w;
      den += w;
    }
    if (den > 0) {
      avgGrade = Math.round((num / den) * 1000) / 1000;
      usedYearWeights = true;
    }
  }
  if (!usedYearWeights) {
    const totUnits = filtered.reduce((s, c) => s + (c.units || 0), 0);
    avgGrade = totUnits > 0
      ? Math.round((filtered.reduce((s, c) => s + c.appliedGrade * (c.units || 0), 0) / totUnits) * 1000) / 1000
      : null;
  }

  return {
    avgGrade,
    usedSubjects: filtered.map((c) => ({
      subject: c.subject, subjectGroup: c.subjectGroup, grade: c.grade, semester: c.semester,
      units: c.units, appliedGrade: c.appliedGrade, isCareer: c.isCareer,
      rank: c.rank, achievement: c.achievement,
    })),
    excludedSubjects: excluded,
    excludedCount: excluded.length,
    withheld: false,
    uncertainties: [],
    // 전형이 진로선택 반영을 명시했다면 careerConv 로 반영됐다는 뜻이므로,
    // 여기서의 omitted 는 "반영 정보가 없어 석차등급만 썼다"는 의미로만 남는다.
    careerOmitted: careerOmitted && !rule?.careerReflected,
    usedYearWeights,
    fallback: !useRule,
  };
}
