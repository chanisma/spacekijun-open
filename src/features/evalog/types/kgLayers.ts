/**
 * 학생 지식그래프(KG)를 evalog 화면이 읽을 수 있는 모양으로 정리한 타입.
 *
 * ── 어디서 오는가 ───────────────────────────────────────────────────────────
 * 탐구 설계(`/inquiry-design`)가 읽는 것과 **같은 데이터**다 —
 * `student_kg_versions` / `student_kg_entities` / `student_kg_relations`.
 * 만드는 쪽은 `scripts/kg-extract-v8/`(문서: `docs/features/kg-extraction-v8.md`).
 *
 * evalog 는 그래프를 그리지 않는다. 필요한 것은 **"어떤 역량이 기록되었고 무엇이
 * 그것을 뒷받침하는가"** 하나이므로, 그래프를 *활동에 매달린 목록*으로 평탄화한다.
 *
 * ── 엔진마다 모양이 다르다 (반드시 알아야 하는 것) ──────────────────────────
 * | 엔진 | Activity 단위 | `sources[].activity_id` | Competency 라벨 |
 * |---|---|---|---|
 * | `solar-pro4-seg-v8` | **분절 활동** | `act:<record_id>#<n>` | 진술문(평균 30자, 거의 전부 유일) |
 * | `solar-pro3` | 기록 1행 | `<record_id>` (맨 uuid) | 이름("의사소통 역량", 평균 11자) |
 * | `research-v7` | 분절 활동 | `act:...#<n>` | **없다**(사람 층 0개) |
 *
 * 그래서 `activityId` 를 기록 id 로 되돌리는 것은 `recordIdOf()` 한 곳에서만 한다.
 * 라이브 실측(2026-09-12): 학생별 최신 버전은 v8 498명 · research-v7 119명 · pro3 4명.
 */

/** KG 에서 사람 층으로 읽는 엔티티 종류. 화면이 층별로 갈라 보여준다. */
export type KgTraitKind = 'competency' | 'achievement' | 'attitude' | 'role' | 'book' | 'person';

/** `student_kg_entities.properties.sources[]` 한 항목. */
export interface KgSourceRef {
  grade: number | null;
  semester: number | null;
  subject: string | null;
  /** `seteuk` · `seteuk_career` · `career` · `autonomy` · `club` (v8) 또는 `자율활동` 등(pro3) */
  category: string | null;
  /** v8 = `act:<record_id>#<n>` · pro3 = `<record_id>`. 위 표 참고. */
  activityId: string | null;
}

/**
 * 활동에 매달린 사람 층 한 항목 — 역량·성취·태도·역할·도서·인물.
 *
 * `evidence` 가 이 타입의 존재 이유다. "무슨 역량이 있다"만으로는 생기부 평가에
 * 쓸 수 없고, **그렇게 판정한 원문 근거**가 함께 있어야 교사가 검증할 수 있다.
 * 근거는 두 곳에 있는데(관계의 `evidence` / 엔티티의 `evidence[0]`) **관계 쪽이
 * 우선**이다 — 관계는 "이 활동이 이 역량을 보였다"는 그 연결에 대한 근거이고,
 * 엔티티 쪽은 여러 활동이 같은 역량을 가리킬 때 대표 하나만 남는다.
 */
export interface KgTrait {
  kind: KgTraitKind;
  entityId: string;
  label: string;
  /** 판정 근거 원문 인용. 없을 수 있다(그때 화면은 근거 줄을 그리지 않는다). */
  evidence: string | null;
  confidence: number | null;
  /** 이 항목을 낸 활동의 KG entity_id. 없으면 어느 활동인지 모르는 항목. */
  activityId: string | null;
  source: KgSourceRef;
}

/** KG 의 Activity 노드 — 분절 활동(v8) 또는 기록(pro3)에 대응한다. */
export interface KgActivityNode {
  entityId: string;
  label: string;
  /** 대표 출처(`sources[0]`) — 학년·과목 표시에 쓴다. */
  source: KgSourceRef;
  /**
   * **분절 활동과 붙이는 키.** `sources[]` 전부의 `activity_id` 다.
   *
   * `sources[0]` 하나만 쓰면 출처가 둘인 활동(라이브 9,881건 중 11건)이 조용히
   * 한쪽만 연결된다 — 오류가 아니라 "그 활동에 역량이 안 붙은" 상태로 보인다.
   */
  sourceActivityIds: string[];
  /** 탐구 심화 수준 0~4 (v8 만). */
  level: number | null;
  /** 분절 유용성 점수 (v8 만). */
  usefulness: number | null;
  confidence: number | null;
  /** `evidence[]` 중 `연구 질문:` 으로 시작하는 줄. v8 Activity 의 83% 가 갖는다. */
  researchQuestion: string | null;
  evidence: string[];
  traits: KgTrait[];
  /** 이 활동이 속한 Thread(주제 사슬) entity_id 목록. */
  threadIds: string[];
  concepts: string[];
  /** 시간 서사 — 이 활동의 **앞**에 있는 활동들(`DEEPENED_FROM`). */
  deepenedFrom: string[];
  /** 시간 서사 — 이 활동의 **뒤**로 이어지는 활동들(`DEVELOPS_INTO`). */
  developsInto: string[];
  /** 같은 시점의 무방향 연결(`RELATED_TO`). */
  relatedTo: string[];
}

/** 여러 활동을 관통하는 주제 사슬. 구성원 3 이상일 때만 만들어진다(v8 규칙). */
export interface KgThread {
  entityId: string;
  label: string;
  memberActivityIds: string[];
  /** 구성원 활동의 학년 범위. **Thread 자신의 `sources[0]` 을 쓰면 안 된다** —
   *  그것은 첫 구성원의 학년일 뿐이라 3개년 사슬이 1학년으로 보인다. */
  grades: number[];
  confidence: number | null;
}

/** 학생 한 명의 KG 를 평탄화한 결과. */
export interface StudentKgLayers {
  versionId: string;
  version: number;
  /** `source_stats.extraction_engine`. 화면이 "무엇을 보고 있는지" 말해야 한다. */
  engine: string | null;
  createdAt: string | null;
  activities: Map<string, KgActivityNode>;
  threads: KgThread[];
  /** 주제군(Leiden 군집). v8 은 학생 간 공유되는 22종 고정 어휘다. */
  interests: { label: string; activityIds: string[] }[];
  /** 층별 전체 목록(활동 역참조 포함). 역량분석 탭이 이걸 쓴다. */
  traits: KgTrait[];
}
