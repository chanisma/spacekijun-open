/**
 * 성취기준 본문 → 코드·문장 사전 (순수 로직, React·네트워크 비의존).
 *
 * `docgen_context`(category='성취기준')의 본문은 **줄 단위로 완전히 규칙적**이다.
 * 라이브 118건 전수 파싱 실측(2026-09-18):
 *
 *   · 비어 있지 않은 줄 2,093        = 머리글 118 + `[영역 NN]` 364 + 성취기준 1,611
 *   · 규칙에서 벗어난 `[...]` 줄     = **0건**
 *   · 머리글의 "(…, N개)" 선언값 ↔ 실제 파싱 개수 = **118건 전부 일치**
 *
 * 그래서 이 파서는 추측하지 않는다. 그리고 선언값과 파싱 개수를 대조하는
 * `standardCountMismatch()` 가 있어, 본문 형식이 나중에 바뀌면 **조용히 절반만
 * 읽는 대신** 그 사실이 드러난다.
 *
 * 왜 사전이 필요한가: 설계 ↔ 성취기준 연결을 AI 가 짚되 **코드만** 돌려주게 하고,
 * 화면에 보여 줄 문장은 여기서 채운다. 그러면 ①AI 가 문장을 베껴 쓰다 틀릴 자리가
 * 없고 ②사전에 없는 코드는 버릴 수 있다(= 지어낸 연결이 화면에 못 올라온다).
 */

export interface AchievementStandard {
  /** 원문 표기 그대로의 코드. 예) `12생명03-02`, `10통과1-02-06` */
  code: string;
  /** 이 성취기준이 속한 영역 머리글. 예) `영역 03`. 머리글 없이 시작하면 null. */
  area: string | null;
  /** 성취기준 문장(원문 그대로, 앞뒤 공백만 제거). */
  text: string;
}

/** 화면에 올라가는 연결 한 건. `text`·`area` 는 사전에서 채운 값이라 AI 가 만든 글이 아니다. */
export interface AchievementLink {
  code: string;
  area: string | null;
  text: string;
}

/**
 * 설계 한 건에 대해 짚은 결과. `llm_result.achievement_links` 에 그대로 들어간다.
 *
 * `context_id`/`context_title` 을 함께 남기는 이유: 성취기준 문서는 교체될 수 있고,
 * 그때 이 연결은 **낡은 문서를 가리키는 링크**가 된다. 어느 문서에서 짚었는지가
 * 없으면 그 사실을 알아낼 방법이 없다.
 */
export interface AchievementLinkRecord {
  context_id: string;
  context_title: string;
  links: AchievementLink[];
  /** 짚는 데 쓴 모델. 나중에 품질을 견줄 때 필요하다. */
  model: string;
  linked_at: string;
}

/** 한 설계에 붙이는 연결의 상한. 넘게 고르면 "무엇이 핵심인지"를 말하지 않는 것과 같다. */
export const MAX_ACHIEVEMENT_LINKS = 3;

// `[영역 03]` 처럼 영역 머리글만 든 줄.
const AREA_LINE = /^\[\s*(영역[^\]]*?)\s*\]$/u;
// `[12생명03-02] 문장…` — 코드는 **두 자리 숫자로 시작**하므로 영역 줄과 겹치지 않는다.
const STANDARD_LINE = /^\[\s*(\d{2}[^\]]{1,24}?)\s*\]\s*(\S.*)$/u;
// 머리글의 "(2022 개정 교육과정, 14개)" 에서 선언 개수.
const DECLARED_COUNT = /(\d+)\s*개\s*\)/u;

/**
 * 코드 비교용 정규화. 저장된 표기와 AI 가 되돌려 준 표기가 **공백·괄호·대시**에서
 * 갈리는 것을 흡수한다. 한글은 `toLowerCase()` 에 영향을 받지 않는다.
 */
export function normalizeStandardCode(raw: string): string {
  return raw
    .replace(/[[\]【】]/gu, '')
    .replace(/[‐-―−]/gu, '-')
    .replace(/\s+/gu, '')
    .toLowerCase();
}

/** 본문 → 성취기준 목록(원문 순서 유지). */
export function parseAchievementStandards(body: string): AchievementStandard[] {
  const out: AchievementStandard[] = [];
  let area: string | null = null;
  for (const rawLine of body.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) continue;
    const areaMatch = AREA_LINE.exec(line);
    if (areaMatch) {
      area = areaMatch[1];
      continue;
    }
    const match = STANDARD_LINE.exec(line);
    if (!match) continue;
    out.push({ code: match[1], area, text: match[2].trim() });
  }
  return out;
}

/** 머리글이 선언한 성취기준 개수. 선언이 없으면 null. */
export function declaredStandardCount(body: string): number | null {
  const match = DECLARED_COUNT.exec(body);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/**
 * 선언 개수와 파싱 개수가 어긋나면 그 쌍을 돌려준다(일치·선언 없음이면 null).
 * **본문 형식이 바뀌어 절반만 읽히는 사고를 화면이 말할 수 있게** 하려는 값이다.
 */
export function standardCountMismatch(
  body: string,
  standards: AchievementStandard[],
): { declared: number; parsed: number } | null {
  const declared = declaredStandardCount(body);
  if (declared === null || declared === standards.length) return null;
  return { declared, parsed: standards.length };
}

/** 코드 → 성취기준. 같은 코드가 둘이면 먼저 나온 것을 남긴다(원문에는 중복이 없다). */
export function standardsByCode(standards: AchievementStandard[]): Map<string, AchievementStandard> {
  const map = new Map<string, AchievementStandard>();
  for (const standard of standards) {
    const key = normalizeStandardCode(standard.code);
    if (key && !map.has(key)) map.set(key, standard);
  }
  return map;
}

/** AI 에게 보여 줄 번호 붙은 목록. 번호는 1부터이고, 되돌아온 숫자도 같은 번호로 읽는다. */
export function formatStandardsForPrompt(standards: AchievementStandard[]): string {
  return standards
    .map((standard, index) => `${index + 1}. [${standard.code}] ${standard.text}`)
    .join('\n');
}

export interface ResolvedAchievementLinks {
  links: AchievementLink[];
  /** 사전에 없어서 **버린** 토큰들. 비어 있지 않으면 모델이 지어냈다는 뜻이다. */
  dropped: string[];
}

/** LLM 응답에서 코드 토큰들을 꺼낸다. 모양을 하나로 못 박지 않고 흔한 변형을 모두 받는다. */
function collectTokens(raw: unknown): string[] {
  const out: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === 'string' || typeof value === 'number') {
      const text = String(value).trim();
      if (text) out.push(text);
      return;
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      // `{code}` · `{standard}` · `{성취기준}` 어느 쪽으로 와도 받는다.
      for (const key of ['code', 'standard', 'achievement_code', '성취기준', 'id', 'index', 'no']) {
        if (key in record) {
          push(record[key]);
          return;
        }
      }
    }
  };
  const walk = (value: unknown, depth: number) => {
    if (depth > 4 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      for (const item of value) push(item);
      return;
    }
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const key of ['codes', 'links', 'achievement_links', 'standards', 'results', 'items']) {
        if (key in record) {
          walk(record[key], depth + 1);
          return;
        }
      }
      push(value);
      return;
    }
    push(value);
  };
  walk(raw, 0);
  return out;
}

/**
 * 모델이 되돌려 준 토큰 → 실제 성취기준. **사전에 없는 코드는 버린다.**
 *
 * 순수한 숫자는 `formatStandardsForPrompt` 의 번호로 읽는다 — 코드에는 한글이 섞여
 * 있어 모델이 옮겨 적다 틀릴 수 있고, 그때 번호가 안전한 복구 경로가 된다.
 * 범위를 벗어난 번호는 버린다(존재하지 않는 자리를 가리키므로).
 */
export function resolveAchievementLinks(
  raw: unknown,
  standards: AchievementStandard[],
  max = MAX_ACHIEVEMENT_LINKS,
): ResolvedAchievementLinks {
  const byCode = standardsByCode(standards);
  const links: AchievementLink[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();

  for (const token of collectTokens(raw)) {
    let standard: AchievementStandard | undefined;
    if (/^\d{1,3}$/u.test(token)) {
      standard = standards[Number(token) - 1];
    } else {
      standard = byCode.get(normalizeStandardCode(token));
    }
    if (!standard) {
      if (!dropped.includes(token)) dropped.push(token);
      continue;
    }
    const key = normalizeStandardCode(standard.code);
    if (seen.has(key)) continue;
    seen.add(key);
    if (links.length >= max) continue;
    links.push({ code: standard.code, area: standard.area, text: standard.text });
  }

  return { links, dropped };
}
