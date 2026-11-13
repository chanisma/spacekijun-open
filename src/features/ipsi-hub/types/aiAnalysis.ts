// 복합 AI 분석 도메인 타입.
// LLM에게 강제하는 JSON 스키마와 1:1 대응되며, DB 컬럼명도 동일하게 매핑된다.
import type { NewsSource } from '../utils/newsSources';

export type CompoundAnalysisResult = {
  summary: string;
  keyFindings: string[];
  trends: string[];
  strategy: string[];
  cautions: string[];
};

export type CompoundAnalysisRecord = {
  id: string;
  title: string;
  perspective: string | null;
  sourceNewsIds: string[];
  sourceVideoIds: string[];
  summary: string | null;
  keyFindings: string[];
  trends: string[];
  strategy: string[];
  cautions: string[];
  rawResponse: unknown;
  model: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

// AI 분석 패널의 단계
export type AnalysisStep = 'select' | 'review' | 'result' | 'history';

/**
 * 화면에 보여 줄 실패 정보.
 *
 * `'request'`는 파싱 이전 단계의 실패(네트워크·인증·쿼터·엣지 함수 오류)를 한데 묶은 값이다 —
 * 그쪽은 재시도해도 같으므로 안내 문구가 달라야 한다.
 */
export type AnalysisFailureReason =
  | 'truncated'
  | 'no-json'
  | 'invalid'
  | 'empty-result'
  | 'request';

export type AnalysisFailureInfo = {
  reason: AnalysisFailureReason;
  /** 사람이 읽는 원인 한 줄. */
  message: string;
  /** 모델이 실제로 보낸 원문. 파싱 전 실패면 빈 문자열. */
  raw: string;
  attempts: number;
  /** 공급자가 알려준 종료 사유. `length`면 출력 길이 제한이 확정된다. */
  finishReason: string | null;
};

// 분석에 사용할 기사 미리보기 (UI용 슬림 형태)
export type SelectableNews = {
  kind: 'news';
  id: string;
  title: string;
  source: NewsSource;
  category: string | null;
  articleDate: string | null;
  headlineSummary: string | null;
  url: string;
};

// 분석에 사용할 영상 미리보기 (UI용 슬림 형태)
export type SelectableVideo = {
  kind: 'video';
  id: string;
  title: string;
  channelLabel: string | null;
  category: string | null;
  articleDate: string | null;
  headlineSummary: string | null;
  durationSeconds: number | null;
  url: string;
};

export type SelectableContent = SelectableNews | SelectableVideo;

/**
 * 분석을 실행하는 사람. 프롬프트의 화자·수신자와 관점 목록이 이 값으로 갈린다.
 *
 * 교직원은 `teacher` 하나로 묶는다(admin 포함) — 직원(staff)은 `/ipsi` 자체가
 * `STAFF_BLOCKED_PREFIXES`로 막혀 있어 이 화면에 도달하지 않는다.
 */
export type AnalysisAudience = 'teacher' | 'student';

/**
 * 분석 관점 프리셋.
 *
 * `audience`가 **누구에게 이 관점을 보여 줄지**를 정한다. 학생에게 "교사 입시지도용"이나
 * "학부모 브리핑용"을 내밀면 자기 얘기가 아닌 관점을 고르게 되고, 그러면 결과가
 * 3인칭 지도 조언("이 학생에게는 …을 권한다")으로 나와 정작 읽는 본인에게 쓸모가 없다.
 */
export const ANALYSIS_PERSPECTIVE_PRESETS = [
  { value: 'teacher_guidance', label: '교사 입시지도용 종합 인사이트', audience: 'teacher' },
  { value: 'parent_briefing', label: '학부모 브리핑용 요약', audience: 'teacher' },
  { value: 'susi_jeongsi_trend', label: '수시·정시 변화 추세', audience: 'both' },
  { value: 'subject_career', label: '계열·전공 선택 전략', audience: 'both' },
  { value: 'student_strategy', label: '내 학습·지원 전략 가이드', audience: 'both' },
  { value: 'exam_prep', label: '수능·내신 준비 체크리스트', audience: 'student' },
] as const;

export type AnalysisPerspectivePreset = (typeof ANALYSIS_PERSPECTIVE_PRESETS)[number]['value'];

export type AnalysisPerspectivePresetEntry =
  (typeof ANALYSIS_PERSPECTIVE_PRESETS)[number];

/** 그 대상에게 보여 줄 관점 목록. */
export function perspectivePresetsFor(
  audience: AnalysisAudience
): readonly AnalysisPerspectivePresetEntry[] {
  return ANALYSIS_PERSPECTIVE_PRESETS.filter(
    p => p.audience === 'both' || p.audience === audience
  );
}

/**
 * 대상별 기본 관점.
 *
 * **반드시 `perspectivePresetsFor(audience)` 안에 있어야 한다** — 목록 밖 값이면
 * 어떤 칩도 선택된 것으로 보이지 않아 사용자가 무엇이 적용되는지 알 수 없다.
 */
export function defaultPerspectiveFor(
  audience: AnalysisAudience
): AnalysisPerspectivePreset {
  return audience === 'student' ? 'student_strategy' : 'teacher_guidance';
}

export function isPerspectivePreset(value: string): value is AnalysisPerspectivePreset {
  return ANALYSIS_PERSPECTIVE_PRESETS.some(p => p.value === value);
}

/** 프리셋 라벨. 관점을 직접 입력하지 않았을 때 프롬프트에 실리는 문구가 된다. */
export function perspectiveLabel(value: AnalysisPerspectivePreset): string {
  return ANALYSIS_PERSPECTIVE_PRESETS.find(p => p.value === value)?.label ?? value;
}
