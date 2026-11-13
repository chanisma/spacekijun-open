// ========================================
// 일정 설문 (schedule survey) 공개 API
// 바깥에서는 호스트 하나와 타입·순수 유틸만 쓰면 된다.
// ========================================

export { ScheduleSurveyHost } from './components/ScheduleSurveyHost';
export { useScheduleSurveys, useMySurveyResponses } from './hooks/useScheduleSurveys';
export {
  aggregateSurvey,
  canManageSurvey,
  canRespondToSurvey,
  isSurveyTarget,
  daysUntilDue,
  normalizeItems,
  suggestTitleForDate,
} from './utils/surveyAggregate';
export type {
  ScheduleSurvey,
  ScheduleSurveyResponse,
  ScheduleSurveyInput,
  SurveyResponseItem,
} from './types';
