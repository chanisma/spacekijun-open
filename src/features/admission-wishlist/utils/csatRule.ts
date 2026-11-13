// 수능최저 구조화 규칙 — LLM 산출물의 **검증과 조립**.
//
// ★ 이 모듈의 요점은 "모델을 믿지 않는다"이다 ★
//
// 수능최저 수치가 틀리면 학생이 지원 자체를 잘못 판단한다. 그래서 역할을 이렇게 가른다:
//   · 조건의 **숫자**(합/평균/각·기준등급·선택 개수·탐구 수)는 기존 파서 `parseCsatRule()`
//     이 원문에서 뽑는다. 생성 모델은 손대지 않는다.
//   · 모델이 맡는 것은 **범위 해석 하나**: 라벨이 학과인지 계열인지, 그리고 매칭용
//     학과어로 어떻게 넓힐지(`의대` → 의예과·의학과).
//   · 그 결과마저 여기서 다시 검증한다 — 조건·라벨이 **원문의 부분 문자열**인지,
//     파서가 실제로 파싱하는지, 금지어가 섞이지 않았는지. 하나라도 걸리면 **버린다**.
//
// 버리는 쪽이 기본값인 이유: 이 기능이 없어도 화면은 종전대로 "판정 보류 + 원문 표시"로
// 안전하게 동작한다. 잘못 구조화된 규칙은 그보다 나쁘다 — 틀린 판정을 확신 있게 보여준다.
//
// React·DB 비의존 순수 모듈 — 적재 스크립트·회귀 테스트·화면이 함께 쓴다.

import {
  parseCsatRule, splitCsatBlocks,
  type CsatArea, type CsatMode, type CsatRule as ParsedCsatRule,
} from './csat';
import { seriesForLabels, termsForLabels } from './csatLabels';

/** 범위 종류 */
export type CsatScopeKind = 'default' | 'department' | 'series';

/** LLM 이 블록 하나에 대해 돌려주는 것 (숫자는 없다) */
export interface LlmScopeAnswer {
  blockIndex: number;
  scopeKind: CsatScopeKind;
  /** 원문에 적힌 라벨 그대로 */
  labels: string[];
  /** 매칭용으로 넓힌 학과어 */
  departmentTerms: string[];
  /** '인문' | '자연' (scopeKind='series') */
  series?: string | null;
}

/** 검증을 통과해 저장 가능한 규칙 행 */
export interface CsatRuleRow {
  gyogwa_id: string;
  block_index: number;
  scope_kind: CsatScopeKind;
  scope_labels: string[];
  department_terms: string[];
  series: string | null;
  condition_text: string;
  mode: CsatMode;
  pick_count: number;
  threshold: number;
  tam_count: number;
  areas: string[];
  model: string | null;
}

/** 한 건이 왜 버려졌는지 (집계해서 프롬프트·범위를 고치는 근거로 쓴다) */
export type RejectReason =
  | 'block-not-found'      // 모델이 없는 블록을 가리킴
  | 'condition-not-in-source' // 조건이 원문에 없음(모델이 지어냄)
  | 'label-not-in-source'  // 라벨이 원문에 없음
  | 'unparseable'          // 조건을 파서가 못 읽음
  | 'series-invalid'       // 계열 값이 인문/자연이 아님
  | 'terms-forbidden'      // 학과어에 '전체' 같은 포괄어가 섞임
  | 'terms-too-many'       // 학과어가 비상식적으로 많음
  | 'terms-missing'        // 학과 범위인데 학과어가 없음
  | 'areas-incomplete';    // 조건에 적힌 영역을 파서가 다 못 읽음 (수치가 틀릴 위험)

export interface ValidationOutcome {
  rows: CsatRuleRow[];
  rejected: Array<{ blockIndex: number; reason: RejectReason; detail?: string }>;
}

/**
 * 학과어로 쓰면 안 되는 말.
 * 이런 단어가 들어오면 그 규칙은 "모든 학과"로 확대 적용돼 다른 학과 학생에게
 * 엉뚱한 기준이 걸린다 — 범위를 넓히는 실수는 좁히는 실수보다 위험하다.
 */
const FORBIDDEN_TERMS = ['전체', '모든', '전학과', '기타', '해당', '없음', '전공', '학과', '계열'];

/** 학과어 상한 — 한 블록이 20개를 넘게 가리키면 라벨 해석이 잘못된 것으로 본다 */
const MAX_TERMS = 20;

/** 비교용 정규화 — 공백·괄호·구분자를 지운다(원문 표기가 들쭉날쭉하다) */
export function normalizeForMatch(v: string): string {
  return (v ?? '').replace(/[\s()[\]{}<>·,、/|]/g, '');
}

/**
 * 조건 텍스트에서 **다음 분기가 딸려 온 부분을 잘라 낸다.**
 *
 * `splitCsatBlocks` 는 수치가 없는 조건(`… : 없음`)을 블록으로 만들지 못해 **앞 블록 끝에
 * 남긴다**. 그래서 라이브에 이런 값이 저장돼 있었다(계명대 실측):
 *   `국,수,영,탐(1) 중 2개 합 7 기독교,철학,사진영상미디어,경영(야): 없음`
 * 앞부분만 간호·경찰행정의 조건이고 뒤는 **다른 학과 이야기**다. 그대로 두면 비교표의
 * "내 학과 조건"에 남의 조건이 붙어 나온다.
 *
 * 규칙: 수치 조건(`N개 합 K`)이 끝난 **뒤에** `학과나열:` 이 나오면 거기서 자른다.
 * 수치 앞의 라벨은 이미 `splitCsatBlocks` 가 떼어 갔으므로 여기서 보이는 `:` 는
 * 다음 분기의 시작이다. `* …` 주석은 그 조건에 걸리는 단서일 수 있어 남긴다.
 */
export function trimConditionText(text: string): string {
  const raw = (text ?? '').trim();
  if (!raw) return raw;

  // 수치 코어: 'N개 (합|평균|각) K' — '합 9~10', '합10~12' 같은 변형도 받는다
  const core = /(\d+)\s*개\s*(?:합|평균|각)?\s*(\d+)(?:\s*~\s*\d+)?/.exec(raw);
  if (!core) return raw;
  const coreEnd = core.index + core[0].length;

  const rest = raw.slice(coreEnd);
  // 다음 분기 시작 = 한글로 시작하는 짧은 나열 뒤의 콜론
  const nextBranch = /[가-힣][가-힣A-Za-z0-9,()·/\s]{0,40}\s*:/.exec(rest);
  let out = nextBranch ? raw.slice(0, coreEnd + nextBranch.index) : raw;

  // 블록 분리가 괄호 도중에 끊겨 ' (' 만 남는 경우가 있다 (계명대 의예 실측)
  out = out.replace(/[\s(]+$/, '').trim();
  return out;
}

/**
 * 조건에 적힌 **영역이 파서에 다 잡혔는지** 확인한다.
 *
 * 실제로 놓치는 사례가 있다(2026-09-01 실측):
 *   "국,수(미/기),영,과(1) 중 3개 합 5"  →  파서가 읽은 영역 = 영·탐  (국·수 누락)
 * `수(미/기)` 의 괄호 안 문자가 파서 정규식의 허용 집합에 없어 영역 나열의 앞부분을
 * 놓친 것이다. 이 상태로 저장하면 **국·수를 안 보는 기준**이 확신 있게 표시된다.
 *
 * 그래서 조건 앞부분(영역 나열부)에 등장하는 영역 글자를 세어 파서 결과와 대조하고,
 * 하나라도 빠지면 그 규칙을 버린다 — 화면은 종전대로 원문을 보여주고 보류한다.
 */
export function verifyAreaCoverage(conditionText: string, areas: string[]): string[] {
  // '중 N개' / 'N개' 앞까지가 영역 나열부. 그 뒤는 기준값·부가조건이라 볼 필요가 없다.
  const cut = conditionText.search(/\d+\s*개/);
  const head = (cut > 0 ? conditionText.slice(0, cut) : conditionText)
    // '절사'의 '사'가 사회탐구로 오인되지 않게 먼저 제거 (파서와 같은 처리)
    .replace(/절사/g, '');

  const expected = new Set<string>();
  if (/국/.test(head)) expected.add('국');
  if (/수/.test(head)) expected.add('수');
  if (/영/.test(head)) expected.add('영');
  if (/한(?!국)/.test(head)) expected.add('한');
  if (/[탐직사과]/.test(head)) expected.add('탐');

  const got = new Set(areas);
  return [...expected].filter((a) => !got.has(a));
}

/**
 * LLM 답안 + 원문 → 저장 가능한 행.
 *
 * **조건 원문·수치는 모델이 아니라 `splitCsatBlocks`/`parseCsatRule` 에서 가져온다.**
 * 모델 답안은 `blockIndex` 로 블록을 가리키는 데만 쓰고, 범위(라벨·학과어·계열)만 채택한다.
 */
export function buildCsatRules(
  gyogwaId: string,
  csatText: string,
  answers: LlmScopeAnswer[],
  model: string | null,
): ValidationOutcome {
  const blocks = splitCsatBlocks(csatText);
  const normSource = normalizeForMatch(csatText);
  const rows: CsatRuleRow[] = [];
  const rejected: ValidationOutcome['rejected'] = [];
  const seen = new Set<number>();

  for (const a of answers) {
    const reject = (reason: RejectReason, detail?: string) => {
      rejected.push({ blockIndex: a.blockIndex, reason, detail });
    };

    const block = blocks[a.blockIndex];
    if (!block || seen.has(a.blockIndex)) {
      reject('block-not-found', `블록 ${a.blockIndex} (원문 블록 ${blocks.length}개)`);
      continue;
    }

    // 조건은 **원문에서** 가져온다. 모델이 준 텍스트는 쓰지 않는다.
    const conditionText = trimConditionText(block.text);
    if (!normSource.includes(normalizeForMatch(conditionText))) {
      // splitCsatBlocks 산출이라 정상적으로는 통과한다. 방어선.
      reject('condition-not-in-source', conditionText.slice(0, 60));
      continue;
    }

    const parsed = parseCsatRule(conditionText);
    if (!parsed) {
      reject('unparseable', conditionText.slice(0, 60));
      continue;
    }

    // 파서가 영역을 놓쳤으면 수치가 틀리게 저장된다 — 버린다.
    const missing = verifyAreaCoverage(conditionText, [...parsed.areas]);
    if (missing.length > 0) {
      reject('areas-incomplete', `${conditionText.slice(0, 50)} → 누락 ${missing.join(',')}`);
      continue;
    }

    // 라벨도 원문 것만 인정한다 — 모델이 지어낸 학과명이 범위가 되면 안 된다.
    const labels = (a.labels ?? []).map((l) => l.trim()).filter(Boolean);
    const badLabel = labels.find((l) => !normSource.includes(normalizeForMatch(l)));
    if (badLabel) {
      reject('label-not-in-source', badLabel);
      continue;
    }

    if (a.scopeKind === 'series') {
      const series = (a.series ?? '').trim();
      if (series !== '인문' && series !== '자연') {
        reject('series-invalid', series || '(없음)');
        continue;
      }
    }

    const terms = Array.from(
      new Set((a.departmentTerms ?? []).map((t) => t.trim()).filter(Boolean)),
    );
    if (terms.length > MAX_TERMS) {
      reject('terms-too-many', `${terms.length}개`);
      continue;
    }
    const bad = terms.find((t) => FORBIDDEN_TERMS.some((f) => t === f));
    if (bad) {
      reject('terms-forbidden', bad);
      continue;
    }
    if (a.scopeKind === 'department' && terms.length === 0) {
      reject('terms-missing');
      continue;
    }

    seen.add(a.blockIndex);
    rows.push({
      gyogwa_id: gyogwaId,
      block_index: a.blockIndex,
      scope_kind: a.scopeKind,
      scope_labels: labels,
      department_terms: terms,
      series: a.scopeKind === 'series' ? (a.series ?? null) : null,
      condition_text: conditionText,
      mode: parsed.mode,
      pick_count: parsed.count,
      threshold: parsed.threshold,
      tam_count: parsed.tamCount,
      areas: [...parsed.areas],
      model,
    });
  }

  return { rows, rejected };
}

/* ───────────────────── 판정 ───────────────────── */

/** 화면에서 쓰는 규칙 (DB 행 → camelCase) */
export interface CsatRule {
  blockIndex: number;
  scopeKind: CsatScopeKind;
  scopeLabels: string[];
  departmentTerms: string[];
  series: string | null;
  conditionText: string;
  mode: CsatMode;
  pickCount: number;
  threshold: number;
  tamCount: number;
  areas: CsatArea[];
}

export function mapCsatRule(r: Record<string, unknown>): CsatRule {
  return {
    blockIndex: Number(r.block_index ?? 0),
    scopeKind: (r.scope_kind as CsatScopeKind) ?? 'default',
    scopeLabels: Array.isArray(r.scope_labels) ? (r.scope_labels as string[]) : [],
    departmentTerms: Array.isArray(r.department_terms) ? (r.department_terms as string[]) : [],
    series: (r.series as string | null) ?? null,
    conditionText: String(r.condition_text ?? ''),
    mode: (r.mode as CsatMode) ?? 'sum',
    pickCount: Number(r.pick_count ?? 0),
    threshold: Number(r.threshold ?? 0),
    tamCount: Number(r.tam_count ?? 2),
    areas: Array.isArray(r.areas) ? (r.areas as CsatArea[]) : [],
  };
}

export type RuleMatchKind = 'department' | 'series' | 'default' | 'ambiguous' | 'none';

export interface RuleMatch {
  kind: RuleMatchKind;
  rule: CsatRule | null;
  /** 어떤 학과어로 붙었는지 (화면이 근거를 밝힐 수 있게) */
  matchedTerm?: string | null;
}

/**
 * 구조화 규칙 중 이 학과에 적용될 것을 고른다.
 *
 * 우선순위: 학과 지정 > 계열 > 기본. 학과 지정이 **둘 이상 걸리면 보류**한다
 * (`ambiguous`) — 어느 쪽인지 모르는 채 하나를 고르면 틀린 기준으로 확신 있게 판정한다.
 *
 * `series` 는 학과명만으로는 인문/자연을 알 수 없어 호출부가 알려 줄 때만 쓴다.
 * 모르면 넘기지 않는 것이 맞다(추측해서 계열을 정하면 그게 곧 오답이다).
 */
export function pickRuleForDepartment(
  rules: CsatRule[],
  department: string | null | undefined,
  series?: '인문' | '자연' | null,
): RuleMatch {
  if (rules.length === 0) return { kind: 'none', rule: null };

  const dep = normalizeForMatch(department ?? '');
  if (dep) {
    const hits: Array<{ rule: CsatRule; term: string }> = [];
    for (const r of rules) {
      if (r.scopeKind !== 'department') continue;
      for (const t of r.departmentTerms) {
        const nt = normalizeForMatch(t);
        if (!nt) continue;
        if (dep.includes(nt) || nt.includes(dep)) {
          hits.push({ rule: r, term: t });
          break;
        }
      }
    }
    // 같은 블록이 여러 번 걸린 건 중복이 아니다 — 서로 다른 블록이 걸릴 때만 모호.
    const uniqueBlocks = new Set(hits.map((h) => h.rule.blockIndex));
    if (uniqueBlocks.size === 1) return { kind: 'department', rule: hits[0].rule, matchedTerm: hits[0].term };
    if (uniqueBlocks.size > 1) return { kind: 'ambiguous', rule: null };
  }

  if (series) {
    const hit = rules.filter((r) => r.scopeKind === 'series' && r.series === series);
    if (hit.length === 1) return { kind: 'series', rule: hit[0] };
    if (hit.length > 1) return { kind: 'ambiguous', rule: null };
  }

  const def = rules.filter((r) => r.scopeKind === 'default');
  if (def.length === 1) return { kind: 'default', rule: def[0] };
  if (def.length > 1) return { kind: 'ambiguous', rule: null };

  return { kind: 'none', rule: null };
}

/* ───────────────────── LLM 프롬프트 ───────────────────── */

/**
 * 범위 해석 프롬프트.
 *
 * **모델에게 숫자를 묻지 않는다** — 조건·수치는 코드가 원문에서 뽑으므로, 물으면
 * 틀릴 기회만 준다. 블록은 이미 갈라서 번호를 붙여 주고, 모델은 각 블록이
 * "누구에게 적용되는가"만 답한다.
 */
export function buildScopeSystemPrompt(): string {
  return [
    '당신은 대학 입시 자료를 정리하는 도우미입니다.',
    '대학의 수능최저학력기준 원문을 조건 블록으로 이미 나누어 드립니다.',
    '당신의 일은 **각 블록이 어떤 모집단위에 적용되는지**만 판단하는 것입니다.',
    '',
    '규칙:',
    '1. 등급·개수·영역 같은 숫자는 절대 답하지 마세요. 이미 코드가 처리합니다.',
    '2. scopeKind 는 셋 중 하나입니다.',
    '   - "default"    : 학과 구분 없이 적용되는 기본 조건 (라벨 없음)',
    '   - "department" : 특정 학과·모집단위에만 적용 (예: 의예, 약학, 간호)',
    '   - "series"     : 인문/자연 계열 전체에 적용',
    '3. labels 에는 **원문에 적힌 라벨을 그대로** 넣으세요. 원문에 없는 말을 지어내면 폐기됩니다.',
    '4. departmentTerms 에는 그 라벨이 가리키는 **실제 학과명**을 넣으세요.',
    '   예) "의대" → ["의예과","의학과"] / "약학" → ["약학과","약학부"]',
    '   예) "자유,글로벌(리더,경제,경영)" → ["자유전공학부","글로벌리더학부","글로벌경제학과","글로벌경영학과"]',
    '   - 확실한 것만 넣으세요. **"전체","모든","기타" 같은 포괄어는 금지**입니다.',
    '   - 애매하면 빈 배열로 두고 scopeKind 를 "default" 로 두지 마세요 — 애매하면 그 블록을 아예 빼세요.',
    '5. series 는 scopeKind="series" 일 때만 "인문" 또는 "자연" 중 하나를 넣으세요.',
    '6. **확신이 없는 블록은 결과에서 빼세요.** 빠진 블록은 사람이 원문을 보고 판단합니다.',
    '   틀리게 채우는 것보다 비우는 편이 낫습니다.',
    '',
    'JSON 만 출력하세요:',
    '{"blocks":[{"blockIndex":0,"scopeKind":"default","labels":[],"departmentTerms":[],"series":null}]}',
  ].join('\n');
}

/** 한 전형의 사용자 프롬프트 (대학·전형·모집단위 맥락 + 번호 붙인 블록) */
export function buildScopeUserPrompt(input: {
  university: string;
  admission?: string | null;
  unit?: string | null;
  csat: string;
}): string {
  const blocks = splitCsatBlocks(input.csat);
  const lines = [
    `대학: ${input.university}`,
    input.admission ? `전형: ${input.admission}` : '',
    input.unit ? `모집단위: ${input.unit}` : '',
    '',
    '원문:',
    input.csat,
    '',
    '조건 블록:',
    ...blocks.map(
      (b, i) => `[${i}] 라벨=${b.labels.length ? b.labels.join(',') : '(없음)'} / 조건="${b.text}"`,
    ),
  ];
  return lines.filter((l) => l !== '').join('\n');
}

/**
 * 모델 응답 → 답안 배열. 형식이 어긋나면 **빈 배열**을 돌려준다(그 전형은 건너뛴다).
 * 코드 블록(```json)에 싸서 오는 경우가 잦아 먼저 벗긴다.
 */
export function parseScopeResponse(raw: string): LlmScopeAnswer[] {
  const text = (raw ?? '').replace(/```(?:json)?/gi, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  const blocks = (parsed as { blocks?: unknown })?.blocks;
  if (!Array.isArray(blocks)) return [];

  const out: LlmScopeAnswer[] = [];
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue;
    const o = b as Record<string, unknown>;
    const idx = Number(o.blockIndex);
    const kind = String(o.scopeKind ?? '');
    if (!Number.isInteger(idx) || idx < 0) continue;
    if (kind !== 'default' && kind !== 'department' && kind !== 'series') continue;
    out.push({
      blockIndex: idx,
      scopeKind: kind,
      labels: Array.isArray(o.labels) ? o.labels.map(String) : [],
      departmentTerms: Array.isArray(o.departmentTerms) ? o.departmentTerms.map(String) : [],
      series: typeof o.series === 'string' ? o.series : null,
    });
  }
  return out;
}

/**
 * 구조화 규칙 → 기존 판정기(`judgeCsat`)가 받는 형식.
 *
 * 수치를 다시 파싱하지 않고 저장된 값을 그대로 쓴다 — 저장 시점에 파서가 뽑고
 * 검증까지 통과한 값이라, 여기서 또 파싱하면 같은 일을 두 번 하며 갈라질 여지만 생긴다.
 * `simplified` 는 false 다: 학과 범위를 명시적으로 갈라 둔 규칙이라 "단순화 적용"이 아니다.
 */
export function toParsedRule(r: CsatRule): ParsedCsatRule {
  return {
    areas: new Set(r.areas),
    count: r.pickCount,
    threshold: r.threshold,
    mode: r.mode,
    tamCount: r.tamCount,
    simplified: false,
    raw: r.conditionText,
  };
}

/* ─────────────── 사전 기반 생성 (LLM 없음) ─────────────── */

/**
 * 원문 → 규칙. **생성 모델을 쓰지 않는다.**
 *
 * 블록 분리·수치는 파서가, 라벨 해석은 손으로 쓴 사전(`csatLabels.ts`)이 한다.
 * 셋 다 결정적이라 같은 원문이면 언제 돌려도 같은 결과가 나온다 — 수능최저처럼
 * 틀리면 지원 판단이 무너지는 값에는 재현성이 정확도만큼 중요하다.
 *
 * 사전이 못 푸는 라벨은 **건너뛴다**(그 블록만 빠지고 나머지는 저장된다).
 * 빠진 블록은 화면이 종전대로 "판정 보류 + 원문 표시"로 처리한다.
 */
export function buildCsatRulesFromLabels(
  gyogwaId: string,
  csatText: string,
): ValidationOutcome {
  const blocks = splitCsatBlocks(csatText);
  const rows: CsatRuleRow[] = [];
  const rejected: ValidationOutcome['rejected'] = [];

  blocks.forEach((block, blockIndex) => {
    // 다음 분기가 딸려 온 꼬리를 떼고 나서 파싱한다 — 남의 학과 조건이 붙은 채
    // 저장되면 비교표의 "내 학과 조건"이 오염된다.
    const conditionText = trimConditionText(block.text);
    const parsed = parseCsatRule(conditionText);
    if (!parsed) {
      rejected.push({ blockIndex, reason: 'unparseable', detail: conditionText.slice(0, 60) });
      return;
    }
    const missing = verifyAreaCoverage(conditionText, [...parsed.areas]);
    if (missing.length > 0) {
      rejected.push({
        blockIndex, reason: 'areas-incomplete',
        detail: `${conditionText.slice(0, 50)} → 누락 ${missing.join(',')}`,
      });
      return;
    }

    const labels = block.labels.map((l) => l.trim()).filter(Boolean);

    // 라벨 없음 = 학과 구분 없이 적용되는 기본 조건
    if (labels.length === 0) {
      rows.push(makeRow(gyogwaId, blockIndex, 'default', [], [], null, conditionText, parsed));
      return;
    }

    const series = seriesForLabels(labels);
    const terms = termsForLabels(labels);

    // 학과어가 잡히면 학과 규칙 (계열보다 구체적이라 우선)
    if (terms.length > 0) {
      rows.push(makeRow(gyogwaId, blockIndex, 'department', labels, terms, null, conditionText, parsed));
      return;
    }
    if (series) {
      rows.push(makeRow(gyogwaId, blockIndex, 'series', labels, [], series, conditionText, parsed));
      return;
    }

    // 사전이 못 푸는 라벨 — 추측하지 않고 건너뛴다
    rejected.push({ blockIndex, reason: 'terms-missing', detail: labels.join(',') });
  });

  return { rows, rejected };
}

function makeRow(
  gyogwaId: string,
  blockIndex: number,
  scopeKind: CsatScopeKind,
  labels: string[],
  terms: string[],
  series: string | null,
  conditionText: string,
  parsed: ParsedCsatRule,
): CsatRuleRow {
  return {
    gyogwa_id: gyogwaId,
    block_index: blockIndex,
    scope_kind: scopeKind,
    scope_labels: labels,
    department_terms: terms,
    series,
    condition_text: conditionText,
    mode: parsed.mode,
    pick_count: parsed.count,
    threshold: parsed.threshold,
    tam_count: parsed.tamCount,
    areas: [...parsed.areas],
    // 사전 기반이라 모델이 없다 — 이력에서 LLM 산출분과 구분된다
    model: null,
  };
}
