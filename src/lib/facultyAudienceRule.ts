// ========================================
// 교직원 대상 규칙(조건으로 교직원 고르기) — 클라이언트 단일 출처 (2026-10-01)
// 해석은 서버 resolve_faculty_rule 이 한다(supabase/migrations/20261001160000_audience_selection_v2.sql).
//
// 조건 하나의 뜻은 「입력 받기」·「메시지 보내기」가 쓰는 교사 조건(`audienceRule.ts` 의 AudienceCriterion)
// 그대로다 — 서버도 조건 하나를 resolve_audience 에 맡긴다. 여기서 더하는 것은 학생 쪽과 같은
// **묶음(AND)·또는·제외** 한 단계뿐이다. 조건의 의미를 두 벌로 만들지 말 것.
// ========================================
import {
  AUDIENCE_CRITERION_LABEL,
  AUDIENCE_CRITERION_ORDER,
  criterionEmpty,
  describeCriterion,
  newCriterion,
  type AudienceCriterion,
  type AudienceCriterionType,
  type AudienceNameBook,
} from '@/lib/audienceRule';

export interface FacultyRuleGroup {
  all: AudienceCriterion[];
}

export interface FacultyAudienceRule {
  include: FacultyRuleGroup[];
  exclude: FacultyRuleGroup[];
}

export const EMPTY_FACULTY_RULE: FacultyAudienceRule = { include: [], exclude: [] };

/** 조건 추가 메뉴 — 직접 지정(people)은 선택기 목록이 맡으므로 뺀다(선택기 안에 선택기를 또 열지 않는다) */
export const FACULTY_CRITERION_MENU: AudienceCriterionType[] = AUDIENCE_CRITERION_ORDER.filter((t) => t !== 'people');

export const FACULTY_CRITERION_LABEL = AUDIENCE_CRITERION_LABEL;

export const newFacultyCriterion = (type: AudienceCriterionType): AudienceCriterion => newCriterion(type);

export function describeFacultyGroup(group: FacultyRuleGroup, book: AudienceNameBook = {}): string {
  return group.all.map((c) => describeCriterion(c, book)).join(' 중 ');
}

export function describeFacultyRule(rule: FacultyAudienceRule, book: AudienceNameBook = {}): string {
  if (rule.include.length === 0) return '조건 없음';
  const inc = rule.include.map((g) => describeFacultyGroup(g, book)).join(' 또는 ');
  const exc = rule.exclude.map((g) => describeFacultyGroup(g, book));
  return exc.length > 0 ? `${inc} (제외: ${exc.join(', ')})` : inc;
}

export function validateFacultyRule(rule: FacultyAudienceRule): string | null {
  if (rule.include.length === 0) return '조건을 하나 이상 추가하세요.';
  const groups = [...rule.include, ...rule.exclude];
  if (groups.some((g) => g.all.length === 0)) return '비어 있는 묶음이 있습니다.';
  if (groups.some((g) => g.all.some(criterionEmpty))) return '값이 비어 있는 조건이 있습니다. 값을 고르거나 조건을 지우세요.';
  return null;
}

const KNOWN = new Set<AudienceCriterionType>(AUDIENCE_CRITERION_ORDER);

/** DB 에 저장된 교직원 규칙 → 규칙. 모르는 조건이 하나라도 있으면 null(부분 복구 금지 — 더 넓은 명단이 된다) */
export function parseStoredFacultyRule(value: unknown): FacultyAudienceRule | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const groups = (v: unknown): FacultyRuleGroup[] | null => {
    if (v === undefined) return [];
    if (!Array.isArray(v)) return null;
    const out: FacultyRuleGroup[] = [];
    for (const g of v) {
      const all = g && typeof g === 'object' ? (g as { all?: unknown }).all : undefined;
      if (!Array.isArray(all) || all.length === 0) return null;
      if (!all.every((c) => c && typeof c === 'object' && KNOWN.has((c as { type: AudienceCriterionType }).type))) return null;
      out.push({ all: all as AudienceCriterion[] });
    }
    return out;
  };
  const include = groups(record.include);
  const exclude = groups(record.exclude);
  if (!include || !exclude || include.length === 0) return null;
  const rule = { include, exclude };
  return validateFacultyRule(rule) === null ? rule : null;
}

// ── 서버 응답 ────────────────────────────────────────────────────────────────

export interface FacultyAudienceRow {
  resource_id: string;
  name: string;
  type: 'teacher' | 'staff' | string;
  reasons: string[];
}

export interface FacultyGroupResult {
  side: 'include' | 'exclude';
  index: number;
  count: number;
  criteria: Array<{ type: AudienceCriterionType; count: number }>;
}

export interface FacultyAudienceResolution {
  rows: FacultyAudienceRow[];
  groups: FacultyGroupResult[];
  included: number;
  excluded: number;
}

export function facultyResolutionWarnings(resolution: FacultyAudienceResolution): string[] {
  const warnings: string[] = [];
  for (const group of resolution.groups) {
    if (group.side === 'include' && group.count === 0 && group.criteria.length > 1 && group.criteria.every((c) => c.count > 0)) {
      warnings.push('조건 하나하나에는 교직원이 있지만 모두 만족하는 사람은 없습니다.');
    }
  }
  return [...new Set(warnings)];
}
