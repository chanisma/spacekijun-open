import type { ImprovementDirection } from '../types';

/**
 * 보완 방향(`student_inquiry_recommendations.weaknesses`)의 **두 형식을 한 모양으로** 읽는다.
 *
 * 이 열에는 산출 규격이 다른 두 세대가 섞여 있고, `formula_version` 이 그 둘을 가른다:
 *
 * | formula_version | 라이브 행 | 필드 |
 * |---|---|---|
 * | `v1` (규칙 기반) | 5행 · 142항목 | `label` · `score` · `description` · `anchorSubjects` · `relatedEntityIds` · `kind` |
 * | `v2-llm-directions` (현행) | 22행 · 111항목 | `summary` · `detail` · `priority` · `suggested_anchor_subjects` · `related_entity_ids` |
 *
 * **화면은 v2 필드만 읽고 있었다.** 그래서 v1 행은 개수(`보완 방향 (35)`)는 맞게 세면서
 * 항목마다 제목·설명이 통째로 빈칸이고 `P undefined` 가 찍혔다 — 오류가 나지 않아
 * "분석이 실패한 것"처럼 보인다. 실제로는 데이터가 멀쩡히 들어 있다.
 *
 * ⚠️ **`score` 를 `priority` 로 옮기지 않는다.** 둘은 방향이 반대다 —
 * v1 `score` 는 규칙 가중치라 **클수록 시급**하고(10, 6 …), v2 `priority` 는 **작을수록 먼저**다.
 * 그대로 갖다 넣으면 순서가 뒤집힌 채 그럴듯해 보인다. 화면이 둘을 다르게 부르도록
 * 별도 필드로 남긴다.
 */
export function normalizeImprovementDirection(raw: unknown, index: number): ImprovementDirection {
  const d = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

  return {
    // id 가 없는 항목은 없지만(라이브 전수 보유), key 로 쓰이므로 빈 문자열이 되지 않게 한다.
    id: str(d.id) || `dir-${index}`,
    summary: str(d.summary) || str(d.label),
    detail: str(d.detail) || str(d.description),
    related_entity_ids: arr(d.related_entity_ids).length
      ? arr(d.related_entity_ids)
      : arr(d.relatedEntityIds),
    suggested_anchor_subjects: arr(d.suggested_anchor_subjects).length
      ? arr(d.suggested_anchor_subjects)
      : arr(d.anchorSubjects),
    priority: num(d.priority),
    legacy_score: num(d.score),
    legacy_kind: str(d.kind) || null,
  };
}

/** 행 하나의 `weaknesses` 를 통째로 정규화. 배열이 아니면 빈 배열(호출부가 `?? []` 를 또 쓰지 않게). */
export function normalizeImprovementDirections(raw: unknown): ImprovementDirection[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => normalizeImprovementDirection(item, index));
}
