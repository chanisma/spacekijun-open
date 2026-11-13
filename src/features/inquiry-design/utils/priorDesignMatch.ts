/**
 * «이 조건으로 만든 설계가 이미 있는가» 판정 (2026-09-18).
 *
 * ── 왜 필요한가 ───────────────────────────────────────────────────────────
 * 종전엔 같은 조건으로 «설계하기»를 다시 누르면 서버의 LLM 캐시가 **말없이**
 * 이전 결과를 돌려줬다(토스트 «캐시된 분석을 불러왔습니다» 한 줄). 사용자는
 * 새 설계를 기대했는데 옛 것을 받았고, 고를 수 없었다. 게다가 캐시 히트에도
 * 자동 초안이 또 만들어져 이력에 같은 설계가 쌓였다(라이브 실측: 같은 학생·
 * 같은 과목 draft 2건짜리가 둘 있었다).
 *
 * 이제는 **누르기 전에 화면이 먼저 묻는다** — 가져올지, 새로 설계할지.
 * 판정 근거는 24시간짜리 캐시가 아니라 **이력(`student_inquiry_designs`)**이라
 * 하루가 지나도, 기기를 바꿔도 같은 답을 준다.
 *
 * ── 대조를 어떻게 대칭으로 만드는가 (조용히 틀리는 자리) ──────────────────
 * 저장된 설계와 지금 화면의 선택은 모양이 다르다 — **draft 행에는 자식
 * `sources` 행이 없다**(자동 초안은 부모 행만 만든다). 그러나 양쪽 모두 결국
 * 같은 **스냅샷**이다(`selected_source_snapshot = sources.map(s => s.snapshot)`).
 * 그래서 키 추출은 **스냅샷 하나만** 받는 함수 하나로 두고 양쪽에 같이 쓴다 —
 * 규칙을 두 벌 유지하면 한쪽만 고쳐져 조용히 어긋난다.
 *
 * 활동 기록 스냅샷에는 **id 가 없다**(`buildSourceFromActivity` 가
 * `{category, subject_name, grade, semester, content}` 만 담는다). 그래서
 * `resumeDesign` 이 이미 쓰는 **내용 접두 매칭**을 그대로 키로 쓴다.
 *
 * ── 대조하지 않는 것 ──────────────────────────────────────────────────────
 * **«탐구 방향» 글은 설계 행에 저장되지 않아 비교할 수 없다.** 그래서 이 판정은
 * "대상과 근거가 같다"까지만 말하고, 화면이 그 사실을 **반드시 밝혀야 한다** —
 * 안 그러면 방향을 바꿔 적고 누른 사람이 "왜 옛날 걸 주지?" 라고 생각한다.
 *
 * 회귀 = `npx tsx scripts/inquiry-prior-design-test/run.mts`
 */
import type {
  InquirySelectedSource,
  InquiryTarget,
  SavedInquiryDesign,
} from '../types';

/** 근거 한 건의 비교 키. `node:<entity_id>` 또는 `act:<분류|과목|학년|학기|내용접두>`. */
export type PriorSourceKey = string;

/** 활동 스냅샷의 내용 접두 길이. `resumeDesign` 의 매칭과 같은 값이라야 한다. */
const ACTIVITY_PREFIX = 200;

/**
 * 가져오기 후보로 삼는 상태.
 *
 * `observed`(실행까지 연결됨)·`archived` 는 제외한다 — 이미 수행한 설계를
 * 다시 패널에 올려 저장하면 같은 것이 두 벌이 된다. 그 경우엔 «새로 설계»가
 * 맞고, 옛 기록은 이력 탭에 그대로 있다.
 */
const REUSABLE_STATUSES = new Set(['draft', 'proposed', 'saved']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

/**
 * 스냅샷 하나 → 비교 키. **선택 중인 근거와 저장된 근거가 이 함수 하나를 공유한다.**
 * 키를 못 뽑는 스냅샷(빈 객체 등)은 `null` 이고 집합에서 빠진다.
 */
export function priorSourceKey(snapshot: unknown): PriorSourceKey | null {
  if (!isRecord(snapshot)) return null;

  const entityId = text(snapshot.entity_id);
  if (entityId) return `node:${entityId}`;

  const content = typeof snapshot.content === 'string' ? snapshot.content : '';
  if (content.trim()) {
    return [
      'act',
      text(snapshot.category),
      text(snapshot.subject_name),
      text(snapshot.grade),
      text(snapshot.semester),
      content.slice(0, ACTIVITY_PREFIX),
    ].join('|');
  }

  return null;
}

function keySet(snapshots: unknown[]): Set<PriorSourceKey> {
  const keys = new Set<PriorSourceKey>();
  for (const snapshot of snapshots) {
    const key = priorSourceKey(snapshot);
    if (key) keys.add(key);
  }
  return keys;
}

/** 지금 화면에서 고른 근거의 키 집합. */
export function selectionKeys(sources: InquirySelectedSource[]): Set<PriorSourceKey> {
  return keySet(sources.map((source) => source.snapshot));
}

/**
 * 저장된 설계의 근거 키 집합.
 * 자식 행이 있으면 그쪽 스냅샷을, 없으면(=draft) 부모의 스냅샷 배열을 쓴다 —
 * **둘 다 같은 스냅샷**이라 결과는 같고, 어느 쪽이든 하나는 늘 존재한다.
 */
export function designKeys(design: SavedInquiryDesign): Set<PriorSourceKey> {
  const snapshots = design.sources.length > 0
    ? design.sources.map((source) => source.snapshot)
    : design.selected_source_snapshot;
  return keySet(Array.isArray(snapshots) ? snapshots : []);
}

function sameNumber(a: number | null | undefined, b: number | null | undefined): boolean {
  return (a ?? null) === (b ?? null);
}

/**
 * 같은 대상인가. **학년도·학년·학기까지 본다** — 이름만 보면 «같은 과목, 다른 학기»가
 * 같은 것으로 묶여 작년 설계를 올해 것으로 내놓는다.
 */
export function sameTarget(design: SavedInquiryDesign, target: InquiryTarget): boolean {
  return design.target_kind === target.kind
    && design.target_name.trim() === target.name.trim()
    && sameNumber(design.academic_year, target.academic_year)
    && sameNumber(design.grade, target.grade)
    && sameNumber(design.semester, target.semester);
}

function sameKeys(a: Set<PriorSourceKey>, b: Set<PriorSourceKey>): boolean {
  if (a.size !== b.size) return false;
  for (const key of a) if (!b.has(key)) return false;
  return true;
}

/** 이력 카드가 위에 올라오는 순서. draft 가 가장 «이어서 쓰라고 만들어 둔 것»이다. */
const STATUS_RANK: Record<string, number> = { draft: 0, proposed: 1, saved: 2 };

/**
 * 같은 대상·같은 근거로 이미 만들어 둔 설계들. 가장 쓸 만한 것이 앞에 온다
 * (draft → proposed → saved, 각각 최신 순).
 */
export function findPriorDesigns(
  designs: SavedInquiryDesign[],
  target: InquiryTarget | null,
  selectedSources: InquirySelectedSource[],
): SavedInquiryDesign[] {
  if (!target) return [];
  const wanted = selectionKeys(selectedSources);

  return designs
    .filter((design) => REUSABLE_STATUSES.has(design.status)
      && Boolean(design.llm_result)
      && sameTarget(design, target)
      && sameKeys(designKeys(design), wanted))
    .sort((a, b) => {
      const rank = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
      if (rank !== 0) return rank;
      return b.created_at.localeCompare(a.created_at);
    });
}
