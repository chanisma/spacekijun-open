/**
 * 요즘 세상 — 관심 분야 맞춤 (2026-10-11). 분야 목록·추천 규칙·맞춤 판정의 단일 출처.
 *
 * ⚠️ 분야 목록은 세 벌이다 — 여기 WORLD_FIELDS · SQL `world_news_private.field_list()`
 *    (마이그레이션 20261011130000) · 엣지 함수 `world-news-fields` 의 FIELDS.
 *    `__tests__/fields.test.ts` 가 셋을 글자 그대로 대조한다. 어긋나면 오류 없이 조용히 틀린다:
 *    SQL 에 없는 이름은 CHECK 가 저장을 거부하고(태그가 영원히 null), 화면에 없는 이름은 고를 수 없다.
 */

export const WORLD_FIELDS = [
  '의학·보건', '생명과학', '화학·소재', '물리·우주', '지구·환경', '에너지', '수학', 'AI·컴퓨터',
  '공학·로봇', '경제·경영', '사회·윤리·법', '교육·심리', '인문·언어', '예술·미디어',
] as const;
export type WorldField = typeof WORLD_FIELDS[number];

/** DB CHECK 와 같은 상한 — 너무 많이 고르면 «맞춤»이 아니라 전체 목록이 된다. */
export const MAX_INTEREST_FIELDS = 5;
/** 처음 고를 때 미리 체크해 두는 수. 나머지 추천은 「추천」 표시만 한다. */
export const PRESELECT_LIMIT = 3;

const FIELD_SET = new Set<string>(WORLD_FIELDS);
export const isWorldField = (value: unknown): value is WorldField => typeof value === 'string' && FIELD_SET.has(value);

/**
 * 희망 학과·지식그래프 관심 라벨 → 분야. 한 말이 여러 분야에 걸릴 수 있다(국어교육과 → 교육·심리 + 인문·언어).
 * ⚠️ 낱말 하나가 다른 분야를 품는 자리를 일부러 막아 두었다(회귀가 검사한다 — 대부분 희망 학과 실재값에서 나왔다):
 *   「생명공학」·「자유전공학부」·「자율전공학부」의 공학 → 공학·로봇 아님(「소방안전공학과」는 공학) ·
 *   「자유전공」의 유전 → 생명과학 아님 · 「역사문화학과」의 화학 → 화학·소재 아님 · 「군사학과」의 사학 → 인문 아님 ·
 *   「법의학」·「표현 기법」·「방법」의 법 → 사회·윤리·법 아님 · 「항공서비스·항공관광」의 항공 → 공학·우주 아님.
 * 넓은 모집단위(자유전공·자연과학계열·창의융합계열)는 일부러 어느 분야에도 넣지 않는다 — 학생이 직접 고른다.
 */
const AVIATION = '항공(?!서비스|관광)';
const FIELD_RULES: Record<WorldField, RegExp> = {
  '의학·보건': /의예|의학|의료|의대|간호|약학|약대|치의|한의|보건|물리치료|작업치료|임상|병원|질병|건강|재활|응급|방사선|수의|신약|안경|운동처방|웰니스|피부/,
  '생명과학': /생명|바이오|(?<!자)유전|생물|생태|미생물|뇌과학|신경과학|수의|식품|농업|동물|멸종|수산/,
  '화학·소재': /(?<!문)화학|화공|소재|재료|고분자|약학|신약|화장품/,
  '물리·우주': new RegExp(`물리(?!치료)|천문|우주|${AVIATION}|양자|입자|광학`),
  '지구·환경': /환경|기후|지구|해양|지질|생태|지속가능/,
  '에너지': /에너지|원자력|전기|배터리|이차전지|수소|태양광/,
  '수학': /수학|통계|모델링|함수|행렬|확률/,
  'AI·컴퓨터': /인공지능|AI|컴퓨터|소프트웨어|정보|데이터|프로그래밍|코딩|전산/,
  '공학·로봇': new RegExp(`(?<!생명|유전|율전)공학|로봇|기계|전자|건축|토목|자동차|반도체|${AVIATION}|소방|방재`),
  '경제·경영': /경제|경영|마케팅|금융|투자|회계|무역|소비|창업|브랜드|상경|경상|유통|물류|기업/,
  '사회·윤리·법': /사회(?!복지)|윤리|(?<![기방문어용])법(?!의학)|정치|행정|인권|정책|제도|난민|복지|평등|외교|국제|사형|경찰|언론|공공안전|국방/,
  '교육·심리': /교육|심리|상담|교사|유아|아동|학습/,
  '인문·언어': /문학|국어|영어|영문|언어|어문|철학|역사|한국사|인문|문화|종교|(?<!군)사학|일본어|중국어|프랑스|아프리카/,
  '예술·미디어': /미술|음악|예술|디자인|미디어|영상|콘텐츠|뮤지컬|연극|방송|광고|메이크업|패션|사진|애니메이션/,
};

export function fieldsOfLabel(label: string): WorldField[] {
  const text = label.trim();
  if (!text) return [];
  return WORLD_FIELDS.filter(field => FIELD_RULES[field].test(text));
}

export interface InterestSources {
  departments: string[];
  interests: string[];
}

export interface FieldSuggestion {
  field: WorldField;
  /** 화면에 그대로 적는 근거 — 「희망 학과 간호학과」·「생기부 관심 건강·의학 탐구」. */
  reasons: string[];
  score: number;
}

/**
 * 근거 → 분야 추천. 희망 학과는 학생이 직접 적은 진로라 지식그래프 라벨(활동 기록에서 추론)보다 무겁게 친다(3 : 1).
 * 순서: 점수 → WORLD_FIELDS 순(결정적).
 */
export function suggestFields(sources: InterestSources): FieldSuggestion[] {
  const map = new Map<WorldField, FieldSuggestion>();
  const add = (label: string, weight: number, prefix: string) => {
    for (const field of fieldsOfLabel(label)) {
      const entry = map.get(field) ?? { field, reasons: [], score: 0 };
      entry.score += weight;
      const reason = `${prefix} ${label.trim()}`;
      if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
      map.set(field, entry);
    }
  };
  for (const department of sources.departments) add(department, 3, '희망 학과');
  for (const interest of sources.interests) add(interest, 1, '생기부 관심');
  return [...map.values()].sort((a, b) => b.score - a.score || WORLD_FIELDS.indexOf(a.field) - WORLD_FIELDS.indexOf(b.field));
}

export const preselectedFields = (suggestions: FieldSuggestion[]): WorldField[] =>
  suggestions.slice(0, PRESELECT_LIMIT).map(item => item.field);

/** DB·캐시에서 온 배열을 화면이 믿을 수 있는 모양으로 — 목록 밖·중복·공백 제거, 목록 순서 유지가 아니라 «저장 순서» 유지. */
export function normalizeFields(value: unknown, limit = MAX_INTEREST_FIELDS): WorldField[] {
  if (!Array.isArray(value)) return [];
  const out: WorldField[] = [];
  for (const item of value) {
    const field = typeof item === 'string' ? item.trim() : item;
    if (isWorldField(field) && !out.includes(field)) out.push(field);
  }
  return out.slice(0, limit);
}

/** 기사 분야. null(미분류)·컬럼 없는 조회 결과 모두 빈 배열이다. 첫째 = 주된 분야. */
export const articleFields = (article: { fields?: unknown }): WorldField[] => normalizeFields(article.fields, 3);

/** 기사가 나의 어느 관심 분야에 걸렸는가 — 「왜 이 기사인가」의 정본. 기사의 분야 순서(주된 분야 먼저)를 따른다. */
export function matchedFields(article: { fields?: unknown }, mine: readonly string[]): WorldField[] {
  const wanted = new Set(mine);
  return articleFields(article).filter(field => wanted.has(field));
}
