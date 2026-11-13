/**
 * KG 엔티티·관계의 `properties`를 화면이 쓸 수 있는 형태로 읽는 단일 창구.
 *
 * ── 왜 정규화 층이 필요한가 ────────────────────────────────────────────────
 * `student_kg_entities.properties`는 DB 트리거(`fn_populate_kg_entities`)가 만든다.
 * 규칙은 "엔티티 JSON에서 `id`·`name`·`type`을 뺀 **나머지 키 전부**를 properties로".
 *
 * 그래서 업로더가 엔티티를 `{ id, name, type, properties: {...} }`로 실으면
 * properties 컬럼이 `{ properties: {...} }`로 **한 겹 더 감싸진다**. 신 KG(§15)를
 * 올린 스크립트가 정확히 그 형태였고, 그 결과 화면의 출처·근거·신뢰도 조회가
 * 전부 한 단계 어긋난 곳을 보고 있었다 — 값이 있는데 없는 것처럼 보였다.
 *
 * 업로더는 고쳤지만(`scripts/ontology-extraction/research/upload-kg-version.mjs`),
 * **이미 저장된 버전은 그대로 남는다**(append-only). 그래서 읽는 쪽에서 두 형태를
 * 모두 받아들인다. 감추는 것이 아니라 흡수하는 것이고, 새로 올리는 데이터는
 * 감쌈 없이 들어온다.
 *
 * ── 두 번째 어긋남: 엣지의 층(layer) ──────────────────────────────────────
 * 관계 트리거는 `subject/predicate/object/source/target/label`을 제외하고 properties를
 * 만든다. 즉 **`source`는 예약어**다(레거시 엔드포인트 별칭). 업로더가 엣지 층을
 * `source: 'activity'|'thread'|...`로 실으면 트리거가 통째로 버린다.
 * 지금은 `layer` 키로 싣고, 여기서 `layer ?? source` 순으로 읽는다.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 이중으로 감싸인 properties를 평평하게 편다. 이미 평평하면 그대로 돌려준다.
 * 바깥 키가 안쪽과 겹치면 **안쪽이 이긴다** — 감싼 쪽이 실제 데이터이기 때문이다.
 */
export function normalizeKgProperties(
  raw: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!raw) return {};
  const inner = raw.properties;
  if (!isRecord(inner)) return raw;
  const { properties: _wrapped, ...rest } = raw;
  return { ...rest, ...inner };
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

/**
 * 생기부 영역 코드 → 사람이 읽는 이름.
 *
 * 값이 **두 갈래로 섞여 들어온다**(실측): 교과 계열은 영어 코드(`regular`·`career`·
 * `pe_arts`)이고 창체·행특은 이미 한글(`자율활동`·`진로활동`·`동아리활동`·
 * `행동특성및종합의견`)이다. 원본 기록의 필드가 달라 생긴 차이라 매핑에 없는 값은
 * 그대로 통과시킨다 — 한글 값이 이미 정답이다.
 */
const CATEGORY_LABELS_KO: Record<string, string> = {
  regular: '교과',
  career: '교과(진로 선택)',
  pe_arts: '교과(예체능)',
  subject: '교과',
  autonomous: '자율활동',
  club: '동아리활동',
  behavior: '행동특성및종합의견',
};

export function kgCategoryLabel(value: unknown): string {
  const raw = text(value);
  return raw ? CATEGORY_LABELS_KO[raw] ?? raw : '';
}

/**
 * 출처 한 건을 «2학년 · 물리학Ⅰ» 형태로. 과목명이 없으면 영역명으로 대신한다 —
 * 자율·진로·동아리 기록은 과목이 없고 영역 자체가 출처이기 때문이다.
 */
export function kgSourceLabel(source: Record<string, unknown>): string {
  const grade = text(source.grade);
  const semester = text(source.semester);
  const subject =
    text(source.subject) ||
    text(source.subject_name) ||
    text(source.area) ||
    kgCategoryLabel(source.category);

  const period = [grade ? `${grade}학년` : '', semester ? `${semester}학기` : '']
    .filter(Boolean)
    .join(' ');
  return [period, subject].filter(Boolean).join(' · ');
}

/**
 * 이 엔티티가 어느 기록에서 왔는가. 세 형태를 모두 받는다:
 *   `sources: [{...}]`  구 KG · 새 업로더(도서는 등장 활동들의 출처가 여럿)
 *   `source: {...}`     단일 출처
 *   평평한 `grade`/`subject`/`category`  신 KG 활동 노드
 *
 * 마지막 형태를 합성해 주는 것이 핵심이다. 이것이 없으면 신 KG 활동은
 * 출처 데이터를 다 갖고도 상세 패널에서 «출처 정보 없음»으로 보인다.
 */
export function kgSourceList(
  properties: Record<string, unknown> | null | undefined,
): Record<string, unknown>[] {
  const props = normalizeKgProperties(properties);

  const sources = props.sources;
  if (Array.isArray(sources)) {
    const rows = sources.filter(isRecord);
    if (rows.length > 0) return rows;
  }

  const single = props.source ?? props.activity_source ?? props.book_source;
  if (isRecord(single)) return [single];

  const synthesized: Record<string, unknown> = {};
  for (const key of ['grade', 'semester', 'subject', 'subject_name', 'category', 'area'] as const) {
    if (text(props[key])) synthesized[key] = props[key];
  }
  return Object.keys(synthesized).length > 0 ? [synthesized] : [];
}

/**
 * 근거 문장. 신 KG의 활동은 `did`(분절한 원문 문장)가 곧 근거인데 키 이름이 달라
 * 화면이 못 찾고 있었다. Thread·엣지는 `evidence`를 그대로 쓴다.
 */
export function kgEvidenceList(
  properties: Record<string, unknown> | null | undefined,
): string[] {
  const props = normalizeKgProperties(properties);
  const collected: string[] = [];

  const push = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        const line = text(item);
        if (line) collected.push(line);
      });
      return;
    }
    const line = text(value);
    if (line) collected.push(line);
  };

  push(props.evidence);
  if (collected.length === 0) push(props.did);
  return collected;
}

export function kgConfidence(
  properties: Record<string, unknown> | null | undefined,
): number | undefined {
  const value = Number(normalizeKgProperties(properties).confidence);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * 엣지 층(activity / recall / thread / concept / local). `source`는 관계 트리거의
 * 예약어라 새 업로더는 `layer`로 싣는다. 구 데이터를 위해 둘 다 본다.
 */
export function kgEdgeLayer(
  properties: Record<string, unknown> | null | undefined,
): string | null {
  const props = normalizeKgProperties(properties);
  return text(props.layer) || text(props.source) || null;
}

/**
 * 이 엔티티가 처음 나타난 학년. 출처가 여럿이면 가장 이른 학년을 쓴다 —
 * 시간 축에 놓을 때 "언제 처음 등장했는가"가 자연스러운 기준이다.
 */
export function kgPrimaryGrade(
  properties: Record<string, unknown> | null | undefined,
): number | null {
  let earliest: number | null = null;
  for (const source of kgSourceList(properties)) {
    const grade = Number(text(source.grade));
    if (!Number.isFinite(grade) || grade <= 0) continue;
    if (earliest === null || grade < earliest) earliest = grade;
  }
  return earliest;
}
