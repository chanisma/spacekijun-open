/**
 * 생기부 기록 → **분절 활동 원장(ledger)**, 그리고 그 원장을 시기별로 접는 집계.
 *
 * ── 무엇을 위한 모듈인가 ────────────────────────────────────────────────────
 * 생기부의 한 행(`student_detailed_activities`)은 활동이 아니라 **과목·영역 기록**이고
 * 그 안에 서로 다른 탐구가 여러 개 들어 있다(분절 = `segmentation`, `types/segmentation.ts`).
 * 화면이 답해야 할 질문은 **"이 학생이 시기별로 무엇을 했는가"** 이므로, 단위를
 * 기록이 아니라 **분절 활동**으로 놓고 거기에 지식그래프(KG) 층을 매단다.
 *
 * ── 왜 학년이 축이고 학기가 아닌가 (측정값, 2026-09-12) ─────────────────────
 * `student_detailed_activities` 30,785행 중 `semester`가 있는 것은 **1,658행(5.4%)**,
 * 창체(자율·동아리·진로)는 **0건**이다. 학년-학기로 버킷을 나누면 대부분이
 * "학기 없음"에 쌓여 축이 고장난 것처럼 보인다 → **축은 학년, 학기는 있을 때만
 * 붙는 꼬리표**로 쓴다. (`inquiry_activity`도 3.3%라 그쪽을 봐도 달라지지 않는다.)
 *
 * **순수 함수만 둔다**(React·supabase 비의존). 회귀 =
 * `npx tsx scripts/evalog-competency-test/run.mts`.
 */
import type { ActivitySegmentation, DetailMarker, SegmentedActivity } from '../types/segmentation';
import type { AnalysisResult } from '../types/analysis';
import type { KgActivityNode, KgTrait, KgTraitKind, StudentKgLayers } from '../types/kgLayers';
import { isSegmentScopedEngine, recordIdOf } from './kgLayers';

// ─────────────────────────────────────────────────────────────────────────────
// 영역
// ─────────────────────────────────────────────────────────────────────────────

/** 생기부 기록 영역. `student_detailed_activities.category`를 표시 단위로 접은 것. */
export type LedgerArea = 'subject' | 'autonomy' | 'club' | 'career' | 'behavior' | 'other';

/**
 * `category` → 영역.
 *
 * 교과활동은 `regular`/`career`/`pe_arts`/`pe_arts_experiment` 넷으로 쪼개져 있는데
 * **`career`가 "진로선택 과목"이라 창체 진로활동과 글자가 같다** — 이 표를 거치지 않고
 * 문자열로 분기하면 진로선택 세특이 진로활동 칸에 들어간다(실재하는 충돌).
 */
const AREA_BY_CATEGORY: Record<string, LedgerArea> = {
  regular: 'subject',
  career: 'subject',
  pe_arts: 'subject',
  pe_arts_experiment: 'subject',
  자율활동: 'autonomy',
  동아리활동: 'club',
  진로활동: 'career',
  행동특성및종합의견: 'behavior',
  행동특성: 'behavior',
};

/**
 * KG `sources[].category` → 영역. v8은 영문 코드, pro3은 한글 영역명을 쓴다.
 *
 * **`career` 의 뜻이 두 표에서 반대다.** 기록의 `category='career'` 는 *진로선택 과목*
 * (=교과활동)이지만 KG 의 `category='career'` 는 *창체 진로활동*이다 — KG 는 세특을
 * `seteuk`/`seteuk_career` 로 쓰기 때문이다. 그래서 기본 표를 **먼저** 펼치고
 * KG 전용 값으로 덮어쓴다. 순서를 뒤집으면 진로활동이 교과활동 칸으로 들어간다.
 */
const AREA_BY_KG_CATEGORY: Record<string, LedgerArea> = {
  ...AREA_BY_CATEGORY,
  seteuk: 'subject',
  seteuk_career: 'subject',
  seteuk_pe_arts: 'subject',
  autonomy: 'autonomy',
  club: 'club',
  career: 'career',
  behavior: 'behavior',
};

export const LEDGER_AREA_ORDER: LedgerArea[] = [
  'subject', 'autonomy', 'club', 'career', 'behavior', 'other',
];

const AREA_LABELS: Record<LedgerArea, string> = {
  subject: '교과활동',
  autonomy: '자율활동',
  club: '동아리활동',
  career: '진로활동',
  behavior: '행동특성',
  other: '기타',
};

/**
 * 영역 색.
 *
 * 자율=amber · 동아리=violet · 진로=sky 는 창체 화면(`creative-activities/utils/
 * activityLabels.ts`의 `getAreaTone`)과 **같은 뜻에 같은 색**을 쓴 것이다. 저쪽 타입은
 * 창체 4영역(`ActivityArea`)이라 여기서 재사용할 수 없어 표를 따로 두지만, 색이
 * 갈리면 같은 학생을 두 화면에서 볼 때 영역을 다시 배워야 한다.
 */
export interface LedgerAreaTone {
  chip: string;
  bar: string;
  text: string;
  dot: string;
}

const AREA_TONES: Record<LedgerArea, LedgerAreaTone> = {
  subject: {
    chip: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    bar: 'bg-indigo-500', text: 'text-indigo-600', dot: 'bg-indigo-500',
  },
  autonomy: {
    chip: 'bg-amber-50 text-amber-700 border-amber-200',
    bar: 'bg-amber-500', text: 'text-amber-600', dot: 'bg-amber-500',
  },
  club: {
    chip: 'bg-violet-50 text-violet-700 border-violet-200',
    bar: 'bg-violet-500', text: 'text-violet-600', dot: 'bg-violet-500',
  },
  career: {
    chip: 'bg-sky-50 text-sky-700 border-sky-200',
    bar: 'bg-sky-500', text: 'text-sky-600', dot: 'bg-sky-500',
  },
  behavior: {
    chip: 'bg-teal-50 text-teal-700 border-teal-200',
    bar: 'bg-teal-500', text: 'text-teal-600', dot: 'bg-teal-500',
  },
  other: {
    chip: 'bg-slate-50 text-slate-600 border-slate-200',
    bar: 'bg-slate-400', text: 'text-slate-500', dot: 'bg-slate-400',
  },
};

export const areaOf = (category: string | null | undefined): LedgerArea =>
  (category && AREA_BY_CATEGORY[category]) || 'other';

export const areaOfKgCategory = (category: string | null | undefined): LedgerArea =>
  (category && AREA_BY_KG_CATEGORY[category]) || 'other';

export const areaLabel = (area: LedgerArea): string => AREA_LABELS[area];
export const areaTone = (area: LedgerArea): LedgerAreaTone => AREA_TONES[area];

/** 사람 층 라벨. 화면 여러 곳이 층 이름을 그리므로 한 곳에 둔다. */
export const TRAIT_KIND_LABELS: Record<KgTraitKind, string> = {
  competency: '역량',
  achievement: '성취',
  attitude: '태도',
  role: '역할',
  book: '도서',
  person: '인물',
};

/** 역량분석 화면이 보여주는 층의 순서. `person`은 근거로서 약해 목록에 넣지 않는다. */
export const TRAIT_KIND_ORDER: KgTraitKind[] = [
  'competency', 'achievement', 'attitude', 'role', 'book',
];

// ─────────────────────────────────────────────────────────────────────────────
// 원장
// ─────────────────────────────────────────────────────────────────────────────

/** `student_detailed_activities` 행 중 이 모듈이 쓰는 것만. */
export interface LedgerRecordRow {
  id: string;
  grade: number | null;
  semester: number | null;
  category: string | null;
  subject_name: string | null;
  content: string | null;
  segmentation: ActivitySegmentation | null;
  analysis: AnalysisResult | null;
}

/** 화면 단위 = 분절 활동 하나. */
export interface LedgerActivity {
  /**
   * KG 결합 키.
   *
   * **분절이 저장한 `entity_id`를 그대로 쓴다.** `act:<record_id>#<배열위치>`로
   * 계산하면 안 된다 — 실측 60,245건 중 위치와 일치하는 것은 22,293건(37%)뿐이다
   * (`#n`은 파이프라인의 원본 활동 번호이고 문턱에서 걸러져 구멍이 난다).
   */
  key: string;
  recordId: string;
  /** 기록 안에서의 순서. 원문 하이라이트 색과 맞추는 데 쓴다(`SegmentedContent`의 팔레트 순서). */
  indexInRecord: number;
  title: string;
  did: string | null;
  concepts: string[];
  sources: string[];
  detailMarkers: DetailMarker[];
  usefulness: number | null;
  /** 제목·개념이 이 문장들의 것이 아닐 수 있다는 표시. 조용히 넘기면 안 된다. */
  fieldMismatch: boolean;
  sentenceCount: number;
  grade: number | null;
  semester: number | null;
  area: LedgerArea;
  /** 교과활동이면 과목명, 창체면 영역명. */
  subject: string | null;
  category: string | null;
  /** 이 활동이 지식그래프에 선정되었는가 — 선정되었으면 역량·성취·태도 층이 붙는다. */
  kg: KgActivityNode | null;
}

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];

function toLedgerActivity(
  row: LedgerRecordRow,
  activity: SegmentedActivity,
  index: number,
  kg: KgActivityNode | null,
): LedgerActivity {
  return {
    key: activity.entity_id,
    recordId: row.id,
    indexInRecord: index,
    title: (activity.title || '').trim() || '(제목 없음)',
    did: (activity.did || '').trim() || null,
    concepts: asStringArray(activity.subject_matter),
    sources: asStringArray(activity.sources),
    detailMarkers: asStringArray(activity.detail_markers) as DetailMarker[],
    usefulness: activity.usefulness?.score ?? null,
    fieldMismatch: activity.field_mismatch === true,
    sentenceCount: Array.isArray(activity.sentence_ids) ? activity.sentence_ids.length : 0,
    grade: row.grade ?? null,
    semester: row.semester ?? null,
    area: areaOf(row.category),
    subject: (row.subject_name || '').trim() || null,
    category: row.category ?? null,
    kg,
  };
}

export interface ActivityLedger {
  records: Map<string, LedgerRecordRow>;
  activities: LedgerActivity[];
  /** 분절 키(`act:<기록id>#<n>`) → 활동. */
  byKey: Map<string, LedgerActivity>;
  /**
   * KG 엔티티 id(`acti_…`) → 그 노드에 묶인 분절 활동들.
   *
   * 역량·성취는 **KG 엔티티 id** 로 활동을 가리키므로(`KgTrait.activityId`) 분절 키
   * 색인으로는 찾을 수 없다 — 두 id 를 섞으면 전부 미스가 되고 역량 목록에서
   * "출처 활동"이 통째로 사라진다.
   *
   * 값이 배열인 이유: `solar-pro3` 은 기록 1행 = 활동 1개라 한 노드가 그 기록의
   * 분절 여럿에 걸린다. 어느 것을 골라도 **학년·영역·과목은 같다**(같은 기록).
   */
  byKgEntityId: Map<string, LedgerActivity[]>;
  /** KG 활동 중 분절에서 짝을 찾지 못한 것. 0이 정상이고, 크면 두 산출물이 어긋난 것이다. */
  orphanKgActivityIds: string[];
}

/**
 * 기록 행 + KG → 원장.
 *
 * KG 결합은 **엔진에 따라 단위가 다르다**:
 *  · 분절 단위 엔진(v8·research-v7) → `entity_id`로 활동 하나에 붙는다.
 *  · `solar-pro3` → 활동 id 가 기록 uuid 라, 그 기록의 **모든** 분절 활동에 같은 KG
 *    노드가 붙는다. 기록 1행 = 활동 1개로 만든 그래프이므로 그것이 사실에 맞다
 *    (분절 하나만 골라 붙이면 나머지 분절에서 역량이 사라진다).
 */
export function buildActivityLedger(
  rows: LedgerRecordRow[],
  kg: StudentKgLayers | null,
): ActivityLedger {
  const records = new Map<string, LedgerRecordRow>();
  const activities: LedgerActivity[] = [];
  const byKey = new Map<string, LedgerActivity>();
  const byKgEntityId = new Map<string, LedgerActivity[]>();

  const segmentScoped = isSegmentScopedEngine(kg?.engine);

  /**
   * 결합 색인. **KG 노드의 `entity_id`(`acti_…`)가 아니라 그 노드의
   * `sources[].activity_id`(`act:<기록id>#<n>`)가 분절 키다** — 둘을 혼동하면 전부
   * 미스가 되고 화면은 오류 없이 "역량 층 없음"으로 보인다.
   */
  const kgBySegmentKey = new Map<string, KgActivityNode>();
  const kgByRecord = new Map<string, KgActivityNode>();
  for (const node of kg?.activities.values() ?? []) {
    for (const activityId of node.sourceActivityIds) {
      if (segmentScoped) {
        if (!kgBySegmentKey.has(activityId)) kgBySegmentKey.set(activityId, node);
      }
      const rid = recordIdOf(activityId);
      if (rid && !kgByRecord.has(rid)) kgByRecord.set(rid, node);
    }
  }

  const usedKgIds = new Set<string>();

  for (const row of rows) {
    records.set(row.id, row);
    const list = row.segmentation?.activities;
    if (!Array.isArray(list)) continue;
    list.forEach((activity, index) => {
      if (!activity?.entity_id) return;
      const node = segmentScoped
        ? kgBySegmentKey.get(activity.entity_id) ?? null
        : kgByRecord.get(row.id) ?? null;
      if (node) usedKgIds.add(node.entityId);
      const item = toLedgerActivity(row, activity, index, node);
      activities.push(item);
      byKey.set(item.key, item);
      if (node) {
        const bucket = byKgEntityId.get(node.entityId);
        if (bucket) bucket.push(item);
        else byKgEntityId.set(node.entityId, [item]);
      }
    });
  }

  const orphanKgActivityIds = kg
    ? [...kg.activities.keys()].filter((id) => !usedKgIds.has(id))
    : [];

  return { records, activities, byKey, byKgEntityId, orphanKgActivityIds };
}

// ─────────────────────────────────────────────────────────────────────────────
// 시기별 집계
// ─────────────────────────────────────────────────────────────────────────────

export interface LedgerAreaGroup {
  area: LedgerArea;
  label: string;
  activities: LedgerActivity[];
}

export interface GradeBandStats {
  activities: number;
  /** 지식그래프에 선정된 활동 수. */
  withKg: number;
  traits: Record<KgTraitKind, number>;
  /**
   * 이 학년의 **주제군**(KG `Interest` = Leiden 군집)과 그 학년에 속한 활동 수.
   *
   * 개념보다 굵은 단위이고 **학생 간 공유되는 어휘**(v8 은 22종 고정)라, 한 학년이
   * 무엇을 다뤘는지 말하는 데 개념 나열보다 낫다. 그래서 개요가 이것을 먼저 보여준다.
   */
  interests: { label: string; count: number }[];
  /**
   * 이 학년에서 **2회 이상** 등장한 개념.
   *
   * 1회짜리를 함께 세면 안 된다 — 개념은 대부분 유일해서(실측: 한 학생 1학년 52개
   * 활동에 개념 100여 종, 거의 전부 1회) 개수로 정렬하면 동수가 되고 **가나다순 앞머리가
   * 상위처럼 보인다**. "자주 나온 개념"이라 적힌 목록이 사실은 임의의 절단면이 된다.
   */
  repeatedConcepts: { label: string; count: number }[];
  /** 이 학년에 구성원을 가진 주제 사슬 라벨. */
  threads: string[];
  /**
   * 이 학년에서 **처음** 등장한 되풀이 개념(직전 학년까지 없던 것).
   * 되풀이 개념만 대상으로 하는 이유는 위와 같다. 없으면 빈 배열 — 화면은 줄을 생략한다.
   */
  newConcepts: string[];
  subjects: number;
  /** 학기가 기록된 활동 수. 0이면 화면이 학기 꼬리표를 아예 그리지 않는다. */
  withSemester: number;
}

export interface GradeBand {
  /** null = 학년을 알 수 없는 기록. 버리지 않고 맨 뒤에 따로 둔다. */
  grade: number | null;
  label: string;
  areas: LedgerAreaGroup[];
  stats: GradeBandStats;
}

const emptyTraitCounts = (): Record<KgTraitKind, number> => ({
  competency: 0, achievement: 0, attitude: 0, role: 0, book: 0, person: 0,
});

/**
 * 활동 카드 정렬 규칙 — **유용성이 높은 순** (2026-09-13 사용자 결정).
 *
 * `usefulness` 는 분절이 매긴 점수(핵심개념·자료·표지·문장 수의 합)이고 라이브 60,245건
 * **전부** 값을 갖는다. 학년·영역 안에서 읽을 만한 활동을 위로 올리는 것이 목적이다.
 *
 * **동점이 매우 흔하다** — 실측 분포에서 2~7점이 전체의 **80%** 다(4점 17.5% · 5점 15.7% ·
 * 3점 15.0% …). 그래서 아래 타이브레이크 사슬이 실제로는 **대부분의 표시 순서를 정한다**:
 * 학기(있으면) → 과목 → 기록 → 기록 안 순서 → 키. 과목으로 먼저 묶이므로 같은 점수
 * 카드들이 흩어지지 않고, **실행마다 순서가 달라지지 않는다**(완전 결정적).
 *
 * 점수가 없는 활동은 맨 뒤로 보낸다 — 0점과 "모름"은 다르고, 모르는 것을 위로 올릴
 * 이유가 없다.
 */
function compareActivities(a: LedgerActivity, b: LedgerActivity): number {
  const ua = a.usefulness ?? -1;
  const ub = b.usefulness ?? -1;
  if (ua !== ub) return ub - ua;          // 높은 점수가 먼저

  const sa = a.semester ?? 0;
  const sb = b.semester ?? 0;
  if (sa !== sb) return sa - sb;
  const suba = a.subject ?? '';
  const subb = b.subject ?? '';
  if (suba !== subb) return suba.localeCompare(subb, 'ko');
  if (a.recordId !== b.recordId) return a.recordId.localeCompare(b.recordId);
  if (a.indexInRecord !== b.indexInRecord) return a.indexInRecord - b.indexInRecord;
  return a.key.localeCompare(b.key);
}

export function groupByGrade(
  activities: LedgerActivity[],
  kg: StudentKgLayers | null,
): GradeBand[] {
  const byGrade = new Map<number | null, LedgerActivity[]>();
  for (const activity of activities) {
    const key = activity.grade ?? null;
    const bucket = byGrade.get(key);
    if (bucket) bucket.push(activity);
    else byGrade.set(key, [activity]);
  }

  const gradeKeys = [...byGrade.keys()].sort((a, b) => {
    if (a === null) return 1;          // 학년 미상은 맨 뒤
    if (b === null) return -1;
    return a - b;
  });

  const threadById = new Map(kg?.threads.map((t) => [t.entityId, t]) ?? []);

  /**
   * KG 엔티티 id → 그 활동이 속한 주제군 라벨. Interest 는 학생 단위라 학년으로 갈라야 한다.
   *
   * **⚠️ 이 도메인에는 활동을 가리키는 id 가 두 종류 있고 섞으면 조용히 빈 결과가 된다**:
   *   · KG 엔티티 id — `acti_xxxxxx` (`KgActivityNode.entityId`, `KgTrait.activityId`)
   *   · 분절 활동 id — `act:<기록id>#<n>` (`sources[].activity_id`, `Interest.activityIds`,
   *     `Thread` 구성원, 분절의 `entity_id`)
   * 관계(`PART_OF`·`DEMONSTRATED`)는 **앞의 것**을, `properties.sources` 는 **뒤의 것**을 쓴다.
   * 그래서 `Interest.activityIds`(뒤)를 엔티티 id(앞)로 옮겨 놓고 나서 조회한다.
   * 이 혼동으로 구현 중 세 번 깨졌다 — 어느 것도 오류를 내지 않는다.
   */
  const kgEntityByActivityId = new Map<string, string>();
  for (const node of kg?.activities.values() ?? []) {
    for (const activityId of node.sourceActivityIds) {
      if (!kgEntityByActivityId.has(activityId)) kgEntityByActivityId.set(activityId, node.entityId);
    }
  }
  const interestsByKgEntity = new Map<string, string[]>();
  for (const interest of kg?.interests ?? []) {
    for (const activityId of interest.activityIds) {
      const entityId = kgEntityByActivityId.get(activityId);
      if (!entityId) continue;
      const bucket = interestsByKgEntity.get(entityId);
      if (bucket) { if (!bucket.includes(interest.label)) bucket.push(interest.label); }
      else interestsByKgEntity.set(entityId, [interest.label]);
    }
  }
  const seenConcepts = new Set<string>();

  return gradeKeys.map((grade) => {
    const items = byGrade.get(grade)!;

    const byArea = new Map<LedgerArea, LedgerActivity[]>();
    const traits = emptyTraitCounts();
    const conceptCounts = new Map<string, number>();
    const interestCounts = new Map<string, number>();
    const threadLabels = new Set<string>();
    const subjects = new Set<string>();
    let withKg = 0;
    let withSemester = 0;

    for (const activity of items) {
      const bucket = byArea.get(activity.area);
      if (bucket) bucket.push(activity);
      else byArea.set(activity.area, [activity]);

      if (activity.subject) subjects.add(activity.subject);
      if (activity.semester != null) withSemester += 1;

      // 개념은 분절에서 온 것과 KG가 정규화한 것을 합친다 — 같은 개념을 두 번 세지
      // 않도록 활동 단위로 Set 을 만든 뒤 센다.
      const conceptsHere = new Set([...activity.concepts, ...(activity.kg?.concepts ?? [])]);
      for (const c of conceptsHere) conceptCounts.set(c, (conceptCounts.get(c) ?? 0) + 1);

      if (!activity.kg) continue;
      withKg += 1;
      for (const trait of activity.kg.traits) traits[trait.kind] += 1;
      for (const tid of activity.kg.threadIds) {
        const label = threadById.get(tid)?.label;
        if (label) threadLabels.add(label);
      }
      for (const label of interestsByKgEntity.get(activity.kg.entityId) ?? []) {
        interestCounts.set(label, (interestCounts.get(label) ?? 0) + 1);
      }
    }

    const interests = [...interestCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'));

    const repeatedConcepts = [...conceptCounts.entries()]
      .filter(([, count]) => count >= 2)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'))
      .slice(0, 10);

    // "새로 등장"은 **학년 순서대로 훑으면서** 판정한다. 학년 버킷을 뒤에서 계산하면
    // 1학년 개념이 전부 '새로 등장'이 아니게 되어 뜻이 뒤집힌다.
    // 판정 자체는 **전체 개념**을 기억해야 한다 — 1학년에 한 번 나온 개념이 2학년에
    // 두 번 나왔다면 그건 '새로 등장'이 아니다.
    const newConcepts: string[] = [];
    for (const { label } of repeatedConcepts) {
      if (!seenConcepts.has(label)) newConcepts.push(label);
    }
    for (const label of conceptCounts.keys()) seenConcepts.add(label);

    const areas = LEDGER_AREA_ORDER
      .filter((area) => byArea.has(area))
      .map((area) => ({
        area,
        label: areaLabel(area),
        activities: byArea.get(area)!.slice().sort(compareActivities),
      }));

    return {
      grade,
      label: grade == null ? '학년 미상' : `${grade}학년`,
      areas,
      stats: {
        activities: items.length,
        withKg,
        traits,
        interests,
        repeatedConcepts,
        threads: [...threadLabels],
        newConcepts: newConcepts.slice(0, 8),
        subjects: subjects.size,
        withSemester,
      },
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 역량분석용 집계
// ─────────────────────────────────────────────────────────────────────────────

/** 역량 한 줄 = 진술 + 근거 + 어느 활동에서 나왔는지. */
export interface CompetencyEntry {
  trait: KgTrait;
  /**
   * 이 항목을 낸 **KG 활동 노드**. 화면에 보여줄 활동 이름의 정본이다 —
   * `solar-pro3` 은 노드 하나가 기록 전체를 가리키므로, 그 기록의 분절 하나의 제목을
   * 쓰면 임의로 고른 조각의 이름이 붙는다.
   */
  kgActivity: KgActivityNode | null;
  /** 원문으로 가는 길. pro3 에서는 여러 분절 중 첫 번째(같은 기록이라 원문은 같다). */
  activity: LedgerActivity | null;
  grade: number | null;
  area: LedgerArea;
  subject: string | null;
}

export interface CompetencyGradeGroup {
  grade: number | null;
  label: string;
  entries: CompetencyEntry[];
}

export interface CompetencyView {
  /** 층별 항목 수 — 세그먼트 버튼의 숫자. */
  counts: Record<KgTraitKind, number>;
  /** 선택된 층의 항목을 학년으로 묶은 것. */
  groups: CompetencyGradeGroup[];
  /**
   * 2회 이상 되풀이된 라벨.
   *
   * **v8에서는 거의 비어 있는 것이 정상이다** — 라벨이 이름이 아니라 진술문이라
   * 6,221건 중 6,132건이 유일하다(실측). pro3(짧은 역량명)에서는 의미가 있다.
   * 그래서 화면은 비었으면 이 구획을 아예 그리지 않는다.
   */
  repeated: { label: string; count: number }[];
}

export function buildCompetencyView(
  ledger: ActivityLedger,
  kg: StudentKgLayers | null,
  kind: KgTraitKind,
): CompetencyView {
  const counts = emptyTraitCounts();
  if (!kg) return { counts, groups: [], repeated: [] };

  for (const trait of kg.traits) counts[trait.kind] += 1;

  const entries: CompetencyEntry[] = [];
  for (const trait of kg.traits) {
    if (trait.kind !== kind) continue;
    // `trait.activityId` 는 **KG 엔티티 id** 다. 분절 키 색인(`byKey`)으로 찾으면 안 된다.
    const kgActivity = trait.activityId ? kg.activities.get(trait.activityId) ?? null : null;
    const activity = trait.activityId
      ? ledger.byKgEntityId.get(trait.activityId)?.[0] ?? null
      : null;
    entries.push({
      trait,
      kgActivity,
      activity,
      // 학년·영역은 활동이 있으면 **기록 쪽**을 믿는다. KG의 `sources[0]`는 한 활동이
      // 여러 출처를 가질 때 첫 번째만 남은 값이다.
      grade: activity?.grade ?? trait.source.grade ?? null,
      area: activity?.area ?? areaOfKgCategory(trait.source.category),
      subject: activity?.subject ?? trait.source.subject ?? null,
    });
  }

  const byGrade = new Map<number | null, CompetencyEntry[]>();
  for (const entry of entries) {
    const bucket = byGrade.get(entry.grade);
    if (bucket) bucket.push(entry);
    else byGrade.set(entry.grade, [entry]);
  }

  const groups: CompetencyGradeGroup[] = [...byGrade.keys()]
    .sort((a, b) => (a === null ? 1 : b === null ? -1 : a - b))
    .map((grade) => ({
      grade,
      label: grade == null ? '학년 미상' : `${grade}학년`,
      entries: byGrade.get(grade)!.slice().sort((x, y) => {
        const ax = LEDGER_AREA_ORDER.indexOf(x.area);
        const ay = LEDGER_AREA_ORDER.indexOf(y.area);
        if (ax !== ay) return ax - ay;
        const sx = x.subject ?? '';
        const sy = y.subject ?? '';
        if (sx !== sy) return sx.localeCompare(sy, 'ko');
        return x.trait.label.localeCompare(y.trait.label, 'ko');
      }),
    }));

  const labelCounts = new Map<string, number>();
  for (const entry of entries) {
    labelCounts.set(entry.trait.label, (labelCounts.get(entry.trait.label) ?? 0) + 1);
  }
  const repeated = [...labelCounts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'));

  return { counts, groups, repeated };
}
