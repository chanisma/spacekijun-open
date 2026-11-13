// ========================================
// 일정 설문 타입
// schedule_survey / schedule_survey_response 테이블 기반
// ========================================

/** 응답자가 한 날짜에 대해 남긴 답 */
export interface SurveyResponseItem {
  /** YYYY-MM-DD */
  date: string;
  /** 그날 가능한가. 후보 날짜에 체크하지 않으면 false, 직접 제안한 날짜는 true */
  available: boolean;
  /** 그날 무슨 일을 하면 좋을지 (선택) */
  activity?: string;
}

export interface ScheduleSurvey {
  id: string;
  title: string;
  description: string | null;
  created_by: string;
  owner_resource_id: string | null;
  owner_name: string | null;
  /** 설문 대상자 resource.id */
  target_resource_ids: string[];
  /** 주최자가 제시한 후보 날짜 (YYYY-MM-DD) */
  candidate_dates: string[];
  /** 응답자가 후보 밖 날짜도 제안할 수 있는가 */
  allow_custom_dates: boolean;
  /** 응답 마감일 (YYYY-MM-DD) — 표시·정렬용, 서버가 강제하지 않는다 */
  due_date: string | null;
  status: 'open' | 'closed';
  created_at: string;
  updated_at: string;
}

export interface ScheduleSurveyResponse {
  id: string;
  survey_id: string;
  respondent_resource_id: string;
  respondent_name: string | null;
  items: SurveyResponseItem[];
  comment: string | null;
  created_at: string;
  updated_at: string;
}

/** 설문 생성·수정 입력 */
export interface ScheduleSurveyInput {
  title: string;
  description: string;
  target_resource_ids: string[];
  candidate_dates: string[];
  allow_custom_dates: boolean;
  due_date: string | null;
}

/** 응답 저장 입력 */
export interface SurveyResponseInput {
  survey_id: string;
  items: SurveyResponseItem[];
  comment: string;
}
