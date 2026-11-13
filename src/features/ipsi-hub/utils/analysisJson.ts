// ========================================
// LLM 응답 → JSON 객체 (순수 로직, React·네트워크 비의존)
//
// **왜 별도 모듈인가**: 종전에는 `newsAiAnalysisService`가 첫 여는 괄호부터 마지막 닫는
// 괄호까지를 잘라 `JSON.parse`하는 6줄짜리 함수를 갖고 있었고, 그 함수가 실패하면
// `LLM 응답에서 JSON을 찾을 수 없습니다.` 한 줄을 던지고 **원문을 버렸다**.
// 30~120초 걸린 분석이 통째로 사라지는데 화면은 원인도 말해 주지 못했다.
//
// 이 모듈이 맡는 세 가지:
//   ① **추론 흔적·코드펜스를 벗긴다** — 닫히지 않은 펜스(=잘린 응답)까지.
//   ② **괄호 균형을 세어** 객체 경계를 찾는다. lastIndexOf 방식은 객체 뒤에 잡담이
//      붙으면 중첩 객체의 닫는 괄호를 집어 조용히 틀린 슬라이스를 만든다.
//   ③ **잘린 JSON을 복구한다** — 도착한 부분까지만 살려 낸다. 이게 이 모듈의 핵심
//      가치다: 실패를 전손에서 부분 성공으로 바꾼다.
//
// **반쪽 문장은 만들지 않는다**: 문자열 한가운데서 잘렸으면 그 항목을 **버리고**
// 직전 쉼표까지 물러난다. 따옴표만 닫아 붙이면 파싱은 되지만 "…학생부 종합전형의 평가
// 요소가 확대되" 같은 미완성 문장이 학교 분석 보고서에 그대로 박힌다 —
// 파싱 성공이 곧 쓸 수 있는 결과는 아니다.
// ========================================

/** 실패 원인. 화면이 사용자에게 다른 말을 해야 하므로 구분한다. */
export type AnalysisParseFailure =
  /** 여는 괄호가 한 번도 안 나왔다 — 모델이 산문으로 답했거나 추론만 하고 끝났다 */
  | 'no-json'
  /** 괄호는 열렸지만 닫히지 않았다 — 출력 토큰 예산 소진(대개 이것) */
  | 'truncated'
  /** 구조는 닫혔는데 파싱이 안 되고 복구도 실패했다 */
  | 'invalid';

export const ANALYSIS_PARSE_MESSAGES: Record<AnalysisParseFailure, string> = {
  'no-json': 'AI가 JSON 형식으로 답하지 않았습니다.',
  truncated: 'AI 응답이 중간에 끊겼습니다(출력 길이 초과).',
  invalid: 'AI 응답의 JSON 형식이 깨져 있습니다.',
};

export class AnalysisParseError extends Error {
  readonly reason: AnalysisParseFailure;
  /** 모델이 실제로 보낸 원문. 화면이 사용자에게 보여 줄 수 있어야 한다. */
  readonly raw: string;

  constructor(reason: AnalysisParseFailure, raw: string) {
    super(ANALYSIS_PARSE_MESSAGES[reason]);
    this.name = 'AnalysisParseError';
    this.reason = reason;
    this.raw = raw;
  }
}

export type ParsedAnalysisJson = {
  value: unknown;
  /** 잘린 응답을 복구해 얻은 값인가. true면 일부 항목이 빠져 있다. */
  repaired: boolean;
};

// ----------------------------------------
// ① 추론 흔적 · 코드펜스 벗기기
// ----------------------------------------

/** 추론형 모델이 본문에 남기는 사고 블록 태그. */
const REASONING_TAGS = ['think', 'thinking', 'reasoning', 'thought'];

/**
 * 사고 블록을 제거한다.
 *
 * **닫히지 않은 블록은 끝까지 지운다** — 추론이 예산을 다 쓰고 끝난 경우이고,
 * 그 뒤에는 아무것도 없다. 남겨 두면 사고 과정에 들어 있던 여는 괄호를
 * JSON 시작으로 착각한다.
 */
export function stripReasoningBlocks(text: string): string {
  let out = text;
  for (const tag of REASONING_TAGS) {
    out = out.replace(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'gi'), ' ');
    out = out.replace(new RegExp(`<${tag}>[\\s\\S]*$`, 'i'), ' ');
  }
  return out.trim();
}

/**
 * 코드펜스를 벗긴다. 닫히지 않은 펜스도 처리한다(= 응답이 잘린 신호).
 */
export function unwrapCodeFence(text: string): string {
  const terminated = text.match(/```[ \t]*(?:json|JSON)?[ \t]*\r?\n?([\s\S]*?)```/);
  if (terminated) return terminated[1].trim();

  const opened = text.match(/```[ \t]*(?:json|JSON)?[ \t]*\r?\n?([\s\S]*)$/);
  if (opened) return opened[1].trim();

  return text.trim();
}

// ----------------------------------------
// ② 괄호 균형으로 객체 경계 찾기
// ----------------------------------------

export type ObjectSpan = {
  start: number;
  /** 닫는 괄호의 위치. null이면 끝까지 닫히지 않았다(잘림). */
  end: number | null;
};

/**
 * 첫 여는 괄호에서 시작해 짝이 맞는 닫는 괄호를 찾는다.
 * 문자열 리터럴 안의 괄호는 세지 않는다.
 *
 * lastIndexOf 방식과 다른 점: 객체 뒤에 텍스트가 붙어도 **정확히 첫 객체만** 집는다.
 */
export function findObjectSpan(text: string): ObjectSpan | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{' || ch === '[') { depth++; continue; }
    if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return { start, end: i };
      // 여는 괄호보다 닫는 괄호가 많다 — 구조가 깨졌으니 복구 경로로 보낸다
      if (depth < 0) return { start, end: null };
    }
  }
  return { start, end: null };
}

// ----------------------------------------
// ③ 잘린 JSON 복구 — "뒤로 물러나며 닫기"
// ----------------------------------------

/**
 * 잘라도 되는 지점(구조 경계)을 뒤에서부터 모은다.
 *
 * 경계 = 쉼표 직전 · 닫는 괄호 직후 · (문자열 안에서 끝나지 않았다면) 조각의 끝.
 * **문자열 한가운데는 경계가 아니다** — 그 안의 쉼표는 스캔 중 건너뛰므로 자동으로
 * 제외되고, 끝이 문자열 안이면 전체 길이 후보도 넣지 않는다(반쪽 문장 방지).
 */
export function collectCutPoints(fragment: string): number[] {
  const points: number[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < fragment.length; i++) {
    const ch = fragment[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === ',') points.push(i);
    else if (ch === '}' || ch === ']') points.push(i + 1);
  }

  if (!inString) points.push(fragment.length);
  return [...new Set(points)].sort((a, b) => b - a);
}

/**
 * 구조 경계에서 잘린 조각에 닫는 괄호를 붙여 완성한다.
 *
 * 문자열 안에서 끝나면 `null`(이 후보는 쓰지 않는다 → 더 뒤로 물러난다).
 */
export function closeOpenStructures(prefix: string): string | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < prefix.length; i++) {
    const ch = prefix[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') {
      if (stack.pop() !== ch) return null;
    }
  }
  if (inString) return null;

  let body = prefix.replace(/\s+$/, '').replace(/,\s*$/, '');
  // 키에 콜론만 붙고 끝났으면 값을 채워야 파싱된다. 이게 통과하면 그 키가
  // 마지막 항목인 정상 케이스이고, 아니면 다음 후보에서 키까지 버려진다.
  if (/:\s*$/.test(body)) body += ' null';
  if (!body) return null;

  return body + stack.reverse().join('');
}

export type RepairedJson = { text: string; value: unknown };

/**
 * 잘린 조각에서 파싱 가능한 최대 부분을 되살린다.
 *
 * 뒤에서부터 구조 경계를 하나씩 물러나며 닫아 보고, 처음 파싱되는 후보를 쓴다.
 * 각 시도가 내용을 줄이므로 반드시 종료된다.
 */
export function repairTruncatedJson(fragment: string, maxAttempts = 400): RepairedJson | null {
  let tried = 0;
  for (const cut of collectCutPoints(fragment)) {
    if (tried++ >= maxAttempts) break;
    const candidate = closeOpenStructures(fragment.slice(0, cut));
    if (!candidate) continue;
    try {
      return { text: candidate, value: JSON.parse(candidate) };
    } catch {
      // 더 뒤로 물러난다
    }
  }
  return null;
}

// ----------------------------------------
// 진입점
// ----------------------------------------

/**
 * 복구 결과가 아무것도 담지 못했는가.
 *
 * `{` 하나만 도착해도 복구는 `{}`를 만들어 **파싱에 성공한다**. 그걸 성공으로 돌려주면
 * 호출부가 원인을 "형식은 맞췄는데 내용이 비었다"로 보고하게 되는데, 실제로는 잘린 것이다.
 * 건진 것이 없으면 복구 실패로 취급해 원인을 정직하게 유지한다.
 */
function salvagedNothing(value: unknown): boolean {
  if (!value || typeof value !== 'object') return true;
  return Object.keys(value as Record<string, unknown>).length === 0;
}

/**
 * LLM 응답 문자열에서 JSON 객체를 꺼낸다.
 *
 * 실패하면 `AnalysisParseError`를 던지는데, **원인과 원문을 함께 싣는다** —
 * 화면이 "왜 실패했는지"와 "모델이 뭐라고 했는지"를 보여 줄 수 있어야
 * 다음 실패가 스스로를 설명한다.
 */
export function parseAnalysisJson(raw: string): ParsedAnalysisJson {
  const cleaned = stripReasoningBlocks(raw);
  const candidate = unwrapCodeFence(cleaned);

  const span = findObjectSpan(candidate);
  if (!span) throw new AnalysisParseError('no-json', raw);

  if (span.end !== null) {
    const slice = candidate.slice(span.start, span.end + 1);
    try {
      return { value: JSON.parse(slice), repaired: false };
    } catch {
      // 구조는 닫혔지만 파싱 실패(따옴표 누락 등) — 복구를 시도한다
      const repaired = repairTruncatedJson(slice);
      if (repaired && !salvagedNothing(repaired.value)) {
        return { value: repaired.value, repaired: true };
      }
      throw new AnalysisParseError('invalid', raw);
    }
  }

  const fragment = candidate.slice(span.start);
  const repaired = repairTruncatedJson(fragment);
  if (repaired && !salvagedNothing(repaired.value)) {
    return { value: repaired.value, repaired: true };
  }
  throw new AnalysisParseError('truncated', raw);
}
