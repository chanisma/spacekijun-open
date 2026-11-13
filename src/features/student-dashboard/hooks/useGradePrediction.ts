/**
 * 성적 예측 데이터 로딩 hook (v2)
 * - Python 학습 스크립트가 생성한 grade_predictions.json 로드
 * - α-블렌딩, 모의고사 예측, 예측 근거 포함
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PredictionGradeValue {
  normalized: number;
  /**
   * **계산의 정본은 백분위다** (2026-09-05 사용자 지시) — 이 `grade` 는 백분위를 **제도
   * 등급컷**으로 되돌린 표시값이라 계단이 되어 정수로 떨어진다. 같은 등급 안의 위치는
   * 아래 `pct` 가 갖고 있으므로, 해상도가 필요하면 등급이 아니라 그쪽을 쓸 것.
   */
  grade: number;
  /**
   * **소수점 등급** — 같은 등급 구간 안의 위치까지 담는다(2026-09-05 사용자 요청).
   * 5등급제 3등급 하나에 상위 34% 와 65% 가 함께 들어가는데, 정수만 보여 주면
   * 백분위로 계산한 해상도를 마지막 한 걸음에서 도로 버린다.
   * **실측 평균등급과 뜻이 다르다** — 그쪽 1.5 는 "1등급 과목과 2등급 과목이 반반",
   * 이쪽 1.5 는 "1등급 구간의 한가운데"다. 옛 스냅샷에는 없다.
   */
  grade_exact?: number;
  /** 상위 %(작을수록 우수) — `prediction_space === 'pct_adj'` 인 산출물에만 있다 */
  pct?: number;
  /** 80% 예측구간을 백분위로 낸 것. `lo`/`hi` 는 이 두 값을 등급으로 되돌린 것이다 */
  pct_lo?: number;
  pct_hi?: number;
  /**
   * 예측구간(80%) — `lo`~`hi` 는 **등급 숫자**이므로 `lo` 가 더 좋은 성적이다.
   * 분할 컨포멀로 보정한다: 그 코호트를 안 보고 배운 모델의 잔차 분위수를 뒤집어 붙인다.
   * 옛 스냅샷에는 없으므로 **항상 선택 필드로 다룰 것**.
   */
  lo?: number;
  hi?: number;
  /** 예측구간 양 끝의 소수점 등급(`lo`/`hi` 의 소수판) */
  lo_exact?: number;
  hi_exact?: number;
}

/**
 * 내신 **백분위** — 등급이 버린 해상도(5등급제 3등급 = 상위 32~68%)를 되살린 값.
 *
 * - `pct`     : 그 과목을 들은 사람들 안에서의 위치(상위 %). 원점수 순위로 직접 계산한다.
 * - `pct_adj` : **수강 집단 차이를 뺀 전교 능력 위치**. 잘하는 학생이 몰린 과목의 상위 30% 와
 *               그렇지 않은 과목의 상위 30% 는 뜻이 다르기 때문이다 — 실측으로 같은
 *               "그 과목 상위 50%" 가 물리학이면 전교 25.5%, 문학과 영상이면 66.4% 로
 *               **40.9%p** 벌어진다. 경쟁력을 비교하는 자리에서는 이쪽을 쓸 것.
 *
 * 둘 다 **작을수록 좋다**(상위 %). 등급과 방향이 같다.
 */
export interface NaesinPercentileValue {
  pct: number;
  pct_adj?: number;
}

/** 미래 학기의 백분위 예측. `lo`~`hi` 는 80% 예측구간(분할 컨포멀, 상위 % 단위). */
export interface PercentilePredictionValue {
  pct: number;
  lo?: number;
  hi?: number;
}

/**
 * 모의고사 예상이 **무엇으로** 나왔는지 (2026-09-05). 규칙은 `ml/train_grade_predictor.py`
 * `combine_mock_forecast` 단일 출처:
 *   hist2     = 직전 두 학기 이력 평균(국·수 — 내신 항 없음)
 *   hist2+reg = 0.8·이력 평균 + 0.2·내신 회귀(영어)
 *   last+reg  = 0.6·직전 학기 + 0.4·내신 회귀(이력이 한 학기뿐일 때·3학년)
 *   last / reg = 한쪽 재료만 있을 때
 * 재료(`hist`/`last`/`prev`/`reg`)는 등급 단위. 옛 스냅샷에는 없다.
 */
export type MockForecastBasis = 'hist2' | 'hist2+reg' | 'last+reg' | 'last' | 'reg';

export interface MockSubjectForecast extends PredictionGradeValue {
  basis?: MockForecastBasis;
  hist?: number | null;
  last?: number | null;
  prev?: number | null;
  reg?: number | null;
  /**
   * 그 과목의 **계산 공간** (2026-09-05) — `'pct'` = 백분위(국어·수학, 상대평가) ·
   * `'raw'` = 원점수(영어, 절대평가라 백분위가 없고 만점이 고정이다).
   * 값과 재료는 아래 `percentile`/`raw_score` 및 `*_percentile`/`*_raw_score` 로 함께 온다.
   * 위 `grade` 는 그것을 등급으로 되돌린 **표시값**이다.
   */
  space?: 'pct' | 'raw' | 'grade';
  percentile?: number | null;
  hist_percentile?: number | null;
  last_percentile?: number | null;
  prev_percentile?: number | null;
  reg_percentile?: number | null;
  raw_score?: number | null;
  hist_raw_score?: number | null;
  last_raw_score?: number | null;
  prev_raw_score?: number | null;
  reg_raw_score?: number | null;
  /** 이 칸에 **실제로 쓴** 내신 회귀 가중치(0~1). 표는 이 값을 적는다 — basis 이름에서 추측하지 않는다 */
  w_reg?: number | null;
}

export interface MockPredictionValue {
  normalized: number;
  grade: number;
  /** 국수영 평균이 과목 예상의 평균인지(`subjects_mean`) 종전 전체 규칙인지 */
  basis?: 'subjects_mean' | 'overall_rule';
  subjects?: Record<string, MockSubjectForecast> | null;
}

/** "새 방식" 모의고사 예측 (국어/수학만, 백분위 0~100). 등급(1~9)이 백분위를 9개 구간으로
 *  뭉갠 값이라, 같은 등급이라도 실력 차이를 더 세밀하게 구분해서 보여준다. */
export interface MockPercentilePredictionValue {
  subjects: Record<string, number>;
  /** 과목별로 어느 규칙으로 나왔는지 — 등급 쪽과 같은 어휘 */
  basis?: Record<string, MockForecastBasis>;
  /** 과목별 내신 회귀 가중치 */
  w_reg?: Record<string, number>;
}

export interface SemesterPrediction {
  semester: string;
  grades: Record<string, PredictionGradeValue>;
  raw_prediction?: Record<string, PredictionGradeValue>;
  mock_prediction?: MockPredictionValue | null;
  mock_percentile_prediction?: MockPercentilePredictionValue | null;
  step?: number;
}

export interface SubjectTrend {
  first: number;
  last: number;
  change: number;
}

export interface PredictionRationale {
  direction: 'improving' | 'declining' | 'stable' | 'insufficient';
  slope?: number;
  semester_count: number;
  overall_first?: number;
  overall_last?: number;
  confidence: 'high' | 'medium' | 'low';
  data_semesters: number;
  blend_alpha: number;
  subjects?: Record<string, SubjectTrend>;
}

/** 특정 학기(예: 3·6월=1학기)에 실제로 응시한 모의고사 회차 하나. 학기 평균(mock/mock_subjects)과
 *  달리 회차를 합치지 않은 원본 값이다 (ml/train_grade_predictor.py의 extract_mock_exams_raw). */
export interface MockExamSitting {
  academic_year: number;
  exam_month: number;
  subjects: Record<string, number>;
}

/** 학기 하나의 스냅샷. 교과군별 등급 + 모의고사(전체/과목별/회차별) 등급을 함께 담는다
 *  (ml/train_grade_predictor.py가 result[semester_key]에 채우는 형태와 동일). mock/mock_subjects는
 *  그 학기에 속하는 모든 회차(3·6월 또는 9·11월)를 평균한 값, mock_exams는 회차별 원본이다. */
export interface SemesterGrades {
  korean?: number;
  math?: number;
  english?: number;
  social?: number;
  science?: number;
  overall?: number;
  mock?: number;
  mock_subjects?: Record<string, number>;
  /** 실측 백분위(0~100, 국어/수학만) — 등급과 달리 같은 등급 안의 실력 차이도 드러낸다. */
  mock_percentile?: Record<string, number>;
  mock_exams?: MockExamSitting[];
}

/** 주요 모의고사 한 시점의 과목 값 묶음. 국/수=백분위(0~100, 상대평가), 영어=등급(1~9, 절대평가). */
export interface KeyExamValues {
  korean_pct?: number | null;
  math_pct?: number | null;
  english_grade?: number | null;
}

/** 3학년 주요 모의고사 흐름의 한 단계. 3·5월=학평(재학생만), 6·9월=평가원(재수생 포함), 11월=수능.
 *  9월/수능은 학습 데이터 부재로 6월 값 이월(assumption='june_carryover')이 현재 최선 추정치. */
export interface KeyExamMonth {
  month: number;
  kind: string; // '학평' | '평가원' | '수능'
  actual?: KeyExamValues | null;
  predicted?: KeyExamValues | null;
  assumption?: string;
  confidence?: string;
}

export interface KeyExamFlow {
  months: KeyExamMonth[];
}

/** 3월 백분위 밴드별 학평->6월 평가원 평균 변화.
 *  성적대별 변화 폭일 뿐 **원인은 분리되지 않는다** — 응시 집단·출제 범위·학습이 함께 바뀐다. */
export interface JuneShiftBandStat {
  label: string;
  n: number;
  mean_delta: number;
}

export interface JuneShiftSubjectStat {
  n: number;
  mean_delta: number;
  coef?: number;
  intercept?: number;
  r_squared?: number;
  bands?: JuneShiftBandStat[];
}

/** 졸업생+현 3학년 코호트의 학평->6월 전이 통계 (새 분석 탭 오버레이용) */
export interface JuneCohortStats {
  subjects: Record<string, JuneShiftSubjectStat>;
}

export interface StudentPrediction {
  id: string;
  name: string;
  grade: number;
  class_num: number | null;
  grade_system: number;
  current_grades: Record<string, SemesterGrades>;
  /** 학기별 실측 백분위 — 키는 `"2-1"` 형식, 값은 교과군별(5교과+overall). 옛 스냅샷에는 없다 */
  current_percentile?: Record<string, Record<string, NaesinPercentileValue>> | null;
  /**
   * **그 학생이 실제로 들을 과목 집단에 능력을 대입해** 낸 예상 등급.
   *
   * 확정 편성(`student_enrollment`)·수요조사(`course_selection_*`)·교육과정으로 미래 수강
   * 과목을 알 수 있으므로, 각 과목의 **집단 강도**(그 과목을 신청한 학생들의 현재 능력 평균)를
   * 반영한다 — 같은 실력이라도 잘하는 학생이 몰린 과목을 고르면 등급이 나쁘게 나오는 실제
   * 구조가 그대로 담긴다. `grades[교과군].grade` 는 그 학년의 **제도 등급제**(5/9)를 따르고,
   * `pct` 는 등급컷을 통과하기 전 위치라 컷 경계의 해상도를 잃지 않는다.
   *
   * 검증(24학번 3-1 실측 대조): 직전 학기 이월 대비 **−0.043등급 [−0.082, −0.003]**,
   * 선택과목이 갈리는 국어에서 −0.196 [−0.309, −0.088]. 기존 `predictions[].grades` 와
   * **별개로 덧붙인 값**이므로 둘 중 무엇을 보여줄지는 화면이 정한다.
   */
  subject_aware_predictions?: {
    semester: string;
    academic_year: number;
    /** 그 학기에 들을 것으로 본 과목 수(지정+선택) */
    subjects: number;
    /**
     * 교과군 값 — `grade` 는 **과목 등급의 이수단위 가중 평균**(성적표 평균등급과 같은 셈법)
     * 이라 이미 소수다. 그 소수부는 구간 안 위치가 아니라 **과목 간 편차**다.
     * 같은 등급 구간 안의 위치가 필요하면 `pct` 를 볼 것.
     */
    grades: Record<string, { grade: number; pct: number }>;
    /**
     * 계획에는 있으나 **등급 예상에 들어가지 못한** 과목과 그 이유.
     * `no_rank` = 석차등급을 받지 않는 과목(진로·융합 선택은 성취도만) ·
     * `no_group` = 교과군에 속하지 않음(교양·제2외국어 등) ·
     * `no_history` = 그 교과 이력이 없어 위치를 낼 수 없음 · `unknown` = 편제표에 없는 과목.
     *
     * **3학년이 유난히 적은 이유가 여기 있다** — 3학년 편제는 대부분 진로·융합 선택이다.
     * 빠진 과목을 조용히 버리면 "계획이 비었다"와 "등급이 안 나오는 과목이다"를 구분할 수 없다.
     */
    excluded?: { subject: string; reason: string }[] | null;
    /** `enrollment` = 확정 편성(사실) · `survey` = 수요조사(신청, 편제 미확정) */
    source?: 'enrollment' | 'survey';
    /**
     * 그 학기에 들을 **과목 하나하나**의 예상. 교과군 평균만으로는 "어느 과목이 그 평균을
     * 만들었나"에 답할 수 없다(2026-09-05 사용자 요청). 집계에 실제로 들어간 과목만 담긴다 —
     * 교과군 밖·성취도만 주는 과목은 여기에도 없다.
     *
     * `m` = 그 과목 수강 집단의 강도(양수면 잘하는 학생이 몰린 과목). 같은 실력이라도
     * 강한 집단 과목을 고르면 등급이 나쁘게 나오는 구조가 이 값에 담긴다.
     * 옛 스냅샷에는 없으므로 선택 필드다.
     */
    subject_detail?: {
      subject: string;
      group: string;
      units: number;
      /**
       * **정수 등급** — 한 과목이 받는 석차등급은 제도가 매기는 한 칸이라 "3.69등급"이
       * 존재하지 않는다(2026-09-05 사용자 지시). 같은 등급 안의 위치는 아래 `pct` 가 갖는다.
       */
      grade: number;
      /** 예상 상위 % — 등급으로 환산되기 **전**의 값이다 */
      pct: number;
      m: number;
    }[] | null;
  }[] | null;
  /** 미래 학기 백분위 예측(전교 능력 위치 기준). 예측 대상 학기가 없으면 null */
  percentile_predictions?: {
    semester: string;
    percentiles: Record<string, PercentilePredictionValue>;
    step: number;
  }[] | null;
  predictions: SemesterPrediction[];
  /** 3학년 전용 (그 외 학년은 null) — 3->5->6->9->수능 주요 모의고사 흐름 */
  key_exam_flow?: KeyExamFlow | null;
  rationale?: PredictionRationale;
}

/** 예측구간의 근거 — 어느 코호트의 잔차 몇 건으로 보정했는가. */
export interface PredictionIntervalInfo {
  level: number;
  cohort: number | string;
  samples: number;
}

export interface PredictionModelInfo {
  /**
   * **백분위 단일 모델**의 검증 지표 — `prediction_space === 'pct_adj'` 인 산출물에서
   * 내신 예측을 실제로 낸 모델이다. 화면은 이쪽을 보여야 한다(2026-09-06 적대적 검증:
   * 등급 모델의 RMSE 를 백분위 예측의 정확도로 읽고 있었다). 옛 스냅샷에는 없다.
   */
  percentile?: {
    training_samples: number;
    blend_alpha: number | null;
    val_rmse: number;
    /** 정규화 RMSE 를 백분위 포인트로 되돌린 값 */
    val_rmse_pp?: number | null;
    interval?: PredictionIntervalInfo | null;
  } | null;
  type: string;
  input_dim: number;
  output_dim: number;
  max_seq_len: number;
  hidden_size: number;
  num_layers: number;
  training_samples: number;
  val_mse: number;
  val_rmse: number;
  graduates_used: number;
  blend_alpha?: number;
  /** 예측 대상이 가장 많은 척도(요약 지표가 이 척도의 것이다) */
  primary_scale?: number;
  /** 척도별 지표 — 학년마다 쓰는 모델이 다르므로 화면은 **그 학년의 척도**를 보여야 한다 */
  scales?: Record<string, {
    training_samples: number;
    blend_alpha: number;
    val_rmse: number;
    students: number;
    /** 예측구간(컨포멀)의 근거 — 없으면 그 스냅샷에는 띠가 없다(옛 스냅샷) */
    interval?: { level: number; cohort: string; samples: number } | null;
  }> | null;
}

export interface MockSubjectModelInfo {
  coef: number;
  intercept: number;
  r_squared: number;
  samples: number;
}

export interface MockCorrelationInfo {
  coef: number;
  intercept: number;
  r_squared: number;
  samples: number;
  subject_models?: Record<string, MockSubjectModelInfo>;
}

export interface PredictionData {
  generated_at: string;
  version?: number;
  model_info: PredictionModelInfo;
  /**
   * 내신→모의 상관 모델 요약. **junior(1·2학년, 재학생만 응시한 회차) 모델**이다 (2026-09-05).
   * 종전엔 세 학년을 한 회귀에 넣어 3학년 6·9월(재수생 포함)의 효과가 1·2학년 예측에 새어
   * 들었다(상위권 전체평균 +0.24등급). 모집단별 두 벌은 `mock_correlation_by_population`.
   */
  /**
   * 내신 예측이 계산된 공간. `"pct_adj"` = 백분위 정본(현행) · `"grade"` = 옛 등급 공간.
   * 옛 스냅샷에는 없으므로 없으면 `"grade"` 로 볼 것.
   */
  prediction_space?: 'pct_adj' | 'grade' | null;
  mock_correlation?: MockCorrelationInfo | null;
  /** "새 방식"(백분위 기반) 상관 모델 정보 — 국어/수학만 존재. junior 모델 */
  mock_percentile_correlation?: Record<string, MockSubjectModelInfo> | null;
  /** 모집단별: junior = 1·2학년(재학생만), senior = 3학년(6·9월 재수생 포함). 옛 스냅샷에는 없다 */
  mock_correlation_by_population?: Partial<Record<'junior' | 'senior', {
    grades: number[];
    corr: MockCorrelationInfo | null;
    pct: Record<string, MockSubjectModelInfo> | null;
  }>> | null;
  /** 3학년 학평->6월 평가원 전이 코호트 통계 (졸업생+현 3학년) */
  june_cohort_stats?: JuneCohortStats | null;
  normalization: {
    grade_9_midpoints: Record<string, number>;
    grade_5_midpoints: Record<string, number>;
  };
  output_features: string[];
  students: StudentPrediction[];
}

/* ── 스냅샷 목록 ──────────────────────────────────────────────────────────
   예측은 재생성할 때마다 통째로 바뀐다(예측이 실측이 되면 그 예측은 사라진다). 그래서
   과거 스냅샷을 `public/ml/snapshots/` 에 보관하고 골라 볼 수 있게 한다.

   ## 로딩 전략 — 목록은 작게, 본체는 고른 것만
   스냅샷 하나가 3~5MB(gzip 234~354KB)라 둘을 동시에 받으면 낭비다. 그래서
     · **매니페스트**(`snapshots.json`, 2KB)만 먼저 받는다 — 선택기 UI 와 요약 수치는
       이것만으로 그려지므로 **고르기 전에는 큰 파일을 건드리지 않는다**
     · 본체는 **선택된 것 하나만** 받고 react-query 가 id 별로 캐시한다
     · 이 훅을 쓰는 화면 자체가 탭 안에 있어(`CohortAnalysisPanel` 의 prediction 탭)
       탭을 누르기 전에는 아무것도 받지 않는다
   `gcTime` 은 기본값(5분)을 그대로 둔다 — 오래 잡아 두면 5MB 객체가 둘 상주한다. */

export interface PredictionSnapshotInfo {
  id: string;
  label: string;
  note?: string;
  path: string;
  generated_at: string;
  training_samples: number;
  blend_alpha?: number;
  students: number;
  students_by_grade?: Record<string, number>;
  scales?: Record<string, { training_samples: number; blend_alpha: number; val_rmse: number; students: number }> | null;
}

export interface PredictionManifest {
  current: string;
  snapshots: PredictionSnapshotInfo[];
}

/**
 * 예측 산출물은 **비공개 Storage 버킷**에 있다.
 *
 * ## 왜 정적 파일이 아닌가 (2026-09-05, 적대적 검증에서 P0 로 지적)
 * 이 JSON 에는 636명의 **이름·학번·현재 성적·예측**이 들어 있다. 종전처럼 `public/ml/` 에
 * 두면 Vite 가 루트 경로로 그대로 서빙하고 빌드 출력(`dist/`)에도 복사하므로, 배포 계층에
 * 인증이 없으면 **로그인 없이 누구나 통째로 내려받을 수 있었다**. React 의 로그인·RoleGate 나
 * Supabase RLS 는 정적 파일을 보호하지 못한다.
 *
 * 지금은 `predictions` 버킷(비공개)에서 받는다 — 읽기는 `is_teacher_or_admin` 으로 제한되고
 * (학생도 못 읽는다: 전교생 성적이다) 쓰기 정책이 없어 학습 파이프라인의 service role 만
 * 올릴 수 있다. **`public/` 로 되돌리지 말 것.**
 */
const PREDICTIONS_BUCKET = 'predictions';

/**
 * 예측 산출물을 못 읽은 **이유**. 종전에는 전부 `null` 이라 화면이 셋을 구분하지 못했고,
 * 권한 문제도 통신 실패도 "예측 데이터가 없습니다"로 보였다(2026-09-06 적대적 검증).
 * 사용자가 할 수 있는 일이 각각 다르므로 화면이 갈라 말해야 한다 —
 * 권한은 관리자에게, 통신은 재시도, 없음은 파이프라인 실행.
 */
export type PredictionLoadKind = 'forbidden' | 'missing' | 'network' | 'parse';

export class PredictionLoadError extends Error {
  constructor(public kind: PredictionLoadKind, message: string) {
    super(message);
    this.name = 'PredictionLoadError';
  }
}

async function downloadJson<T>(objectPath: string): Promise<T> {
  let data: Blob | null = null;
  try {
    const res = await supabase.storage.from(PREDICTIONS_BUCKET).download(objectPath);
    if (res.error) {
      /*
        Supabase storage 오류는 `statusCode` 를 문자열로 준다. 401/403 은 정책에 막힌 것이고
        (교사·admin 이 아니거나 세션이 끊긴 경우), 400/404 는 객체가 없는 것이다.
        그 밖은 서버·전송 문제로 본다 — 재시도가 통할 수 있는 부류다.
      */
      const code = Number((res.error as { statusCode?: string | number }).statusCode ?? 0);
      if (code === 401 || code === 403) {
        throw new PredictionLoadError('forbidden', res.error.message);
      }
      if (code === 400 || code === 404) {
        throw new PredictionLoadError('missing', res.error.message);
      }
      throw new PredictionLoadError('network', res.error.message);
    }
    data = res.data;
  } catch (e) {
    if (e instanceof PredictionLoadError) throw e;
    // fetch 자체가 실패한 경우(오프라인·CORS·타임아웃)는 예외로 온다
    throw new PredictionLoadError('network', e instanceof Error ? e.message : String(e));
  }
  if (!data) throw new PredictionLoadError('missing', '빈 응답');
  try {
    return JSON.parse(await data.text()) as T;
  } catch (e) {
    throw new PredictionLoadError('parse', e instanceof Error ? e.message : String(e));
  }
}

/** 매니페스트를 못 읽어도(권한 없음·미배포) 화면이 서도록 하는 폴백 */
const FALLBACK_MANIFEST: PredictionManifest = {
  current: 'current',
  snapshots: [{
    id: 'current', label: '현재 예측', path: 'grade_predictions.json',
    generated_at: '', training_samples: 0, students: 0,
  }],
};

export function usePredictionSnapshots() {
  return useQuery({
    queryKey: ['grade-prediction-snapshots'],
    queryFn: async (): Promise<PredictionManifest> => {
      /*
        매니페스트는 **실패해도 화면이 서야 한다** — 시점 선택이 없을 뿐 현재 예측은 볼 수
        있어야 하므로 폴백을 쓴다. 진짜 오류 상태는 아래 본체 쿼리가 말한다.
      */
      try {
        const data = await downloadJson<PredictionManifest>('snapshots.json');
        return data?.snapshots?.length ? data : FALLBACK_MANIFEST;
      } catch {
        return FALLBACK_MANIFEST;
      }
    },
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
}

/** 매니페스트의 `path` 는 예전 정적 경로(`/ml/...`)일 수 있다 — 버킷 키로 정규화한다. */
function toObjectKey(path: string): string {
  return path.replace(/^\/?ml\//, '').replace(/^\//, '');
}

async function fetchPredictions(path: string): Promise<PredictionData> {
  return downloadJson<PredictionData>(toObjectKey(path));
}

/**
 * 스냅샷 하나를 받는다.
 *
 * `path` 는 **필수**다(값은 undefined 여도 된다). 기본값을 주면 시점 선택이 필요 없는 화면이
 * 무심코 인자 없이 불러도 타입 검사를 통과하는데, 이 훅은 `enabled: !!path` 라
 * **조용히 아무것도 받지 않게 된다** — 실제로 그렇게 깨졌다(6·9월 모평 비교 화면의
 * 코호트 오버레이가 `?? null` 로 사라져 오류 없이 기능만 없어졌다).
 * 시점 선택이 없는 화면은 아래 `useCurrentGradePrediction()` 을 쓸 것.
 *
 * @param path 받을 스냅샷 경로. `undefined` 면 아직 고르는 중이라 **아무것도 받지 않는다**
 *             (매니페스트가 오기 전에 기본 경로로 한 번 받았다가 다시 받는 낭비를 막는다).
 */
export function useGradePrediction(path: string | undefined) {
  return useQuery({
    queryKey: ['grade-predictions', path],
    queryFn: () => fetchPredictions(path!),
    enabled: !!path,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });
}

/** 시점 선택이 없는 화면용 — 매니페스트의 `current` 를 자동으로 따라간다. */
export function useCurrentGradePrediction() {
  const { data: manifest } = usePredictionSnapshots();
  const current =
    manifest?.snapshots.find((s) => s.id === manifest.current) ?? manifest?.snapshots[0];
  return useGradePrediction(current?.path);
}
