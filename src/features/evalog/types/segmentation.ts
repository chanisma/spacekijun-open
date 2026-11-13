/**
 * S0 활동 분절 결과 타입 — `student_detailed_activities.segmentation` JSONB.
 *
 * ── 무엇인가 ────────────────────────────────────────────────────────────────
 * `student_detailed_activities`의 한 행은 **활동이 아니라 과목(영역) 기록**이고,
 * 그 안에 서로 다른 탐구 활동이 여러 개 들어 있다. 실측(00-00239 2학년 1,218자 기록):
 * 세로토닌 발표 · 중화적정 실험 · 연구윤리 탐구 · 후성유전학 탐구 **4개**.
 * 이 구조는 그 기록을 문장 단위로 나눈 결과다.
 *
 * 연구 문서: `reports/research-open2/README.md` §6(분절)·§13(개념)·§14(적용 계획)
 */

/** 활동의 디테일 표지. 인정 기준이 아니라 관찰 기록이다. */
export type DetailMarker = '계기' | '주제' | '방법' | '자료' | '결과' | '평가' | '확장';

/** 활동에 귀속되지 않는 문장의 분류. `미처리`는 코드가 쓸어 담은 것(모델 판단 아님). */
export type RecordLevelReason = '기록총평' | '일반태도' | '맥락' | '미처리';

export interface SegmentedActivity {
  entity_id: string;
  title: string;
  did: string;
  /** `segmentation.sentences`의 인덱스. 연속하지 않을 수 있다. */
  sentence_ids: number[];
  /** 핵심 개념. 원문에 없는 단어일 수 있다 — 고르는 것이 아니라 이름 붙이는 것이라서. */
  subject_matter: string[];
  sources: string[];
  detail_markers: DetailMarker[];
  usefulness: {
    score: number;
    matters: number;
    sources: number;
    markers: number;
    sentences: number;
    chars: number;
  } | null;
  /**
   * `did`가 이 문장들의 요약인 정도(문자 2-gram 겹침).
   * 낮으면 제목·개념이 **다른 활동의 것**일 수 있다(연구 §12-4의 필드 오배치).
   * 정상 중앙값 0.89~0.96 · 결함 0.03~0.15로 이산적으로 갈린다.
   */
  did_text_overlap?: number | null;
  field_mismatch?: boolean;
  /** 개념 → 그 개념을 낸 추출 패스 수. 합의도(연구 §13). */
  concept_support?: Record<string, number>;
}

export interface ActivitySegmentation {
  version: number;
  generated_at: string;
  model: string | null;
  source_tag?: string;
  /**
   * 문장 분리 결과. **화면에서 다시 나누면 안 된다** — S0는 종결어미 기반 분리기를 쓰고
   * (이니셜·괄호 보호, 공백 없는 경계 회수), 조금이라도 다르면 `sentence_ids`가 어긋나
   * 색이 밀린다. 그래서 기준축을 함께 저장한다.
   */
  sentences: string[];
  activities: SegmentedActivity[];
  record_level: { sentence_ids: number[]; reason: RecordLevelReason }[];
}
