import type { Student } from '../../types';
import { renderAcademicTrend } from './renderers/academicTrendRenderer';
import { renderAcademicTable } from './renderers/academicTableRenderer';
import { renderCareerTable, renderCareerAchievement } from './renderers/careerTableRenderer';
import { renderMockGradeTrend } from './renderers/mockGradeTrendRenderer';
import { renderMockScoreTable } from './renderers/mockScoreTableRenderer';
import { renderMockStandardTrend, renderMockPercentileTrend, renderMockVolatility } from './renderers/mockExtraRenderer';
import { renderGapAnalysis } from './renderers/gapAnalysisRenderer';
import { renderTrendPrediction } from './renderers/trendPredictionRenderer';
import { renderReadingList } from './renderers/readingListRenderer';
import { renderAttendance } from './renderers/extracurricularRenderer';
import { renderWordCloud } from './renderers/wordCloudRenderer';
import { renderKeywordAnalysis } from './renderers/keywordRenderer';

export interface PrintableItem {
  id: string;
  tabLabel: string;
  label: string;
  renderHtml: (student: Student) => string | null | Promise<string | null>;
  hasData: (student: Student) => boolean;
}

export const PRINT_REGISTRY: PrintableItem[] = [
  // ─── 교과성적 ───
  {
    id: 'academic-trend',
    tabLabel: '교과성적',
    label: '교과별 추이도',
    renderHtml: renderAcademicTrend,
    hasData: (s) => hasAcademicData(s),
  },
  {
    id: 'academic-table',
    tabLabel: '교과성적',
    label: '성적현황 [교과]',
    renderHtml: renderAcademicTable,
    hasData: (s) => hasAcademicData(s),
  },
  {
    id: 'career-table',
    tabLabel: '교과성적',
    label: '진로선택 과목',
    renderHtml: renderCareerTable,
    hasData: (s) => hasCareerData(s),
  },
  {
    id: 'career-achievement',
    tabLabel: '교과성적',
    label: '진로선택 성취도 통계',
    renderHtml: renderCareerAchievement,
    hasData: (s) => hasCareerData(s),
  },

  // ─── 모의고사 ───
  {
    id: 'mock-trend',
    tabLabel: '모의고사',
    label: '등급 추이도',
    renderHtml: renderMockGradeTrend,
    hasData: (s) => hasMockData(s),
  },
  {
    id: 'mock-table',
    tabLabel: '모의고사',
    label: '성적 데이터 테이블',
    renderHtml: renderMockScoreTable,
    hasData: (s) => hasMockData(s),
  },
  {
    id: 'mock-standard-trend',
    tabLabel: '모의고사',
    label: '표준점수 추이',
    renderHtml: renderMockStandardTrend,
    hasData: (s) => hasMockData(s),
  },
  {
    id: 'mock-percentile-trend',
    tabLabel: '모의고사',
    label: '백분위 추이',
    renderHtml: renderMockPercentileTrend,
    hasData: (s) => hasMockData(s),
  },
  {
    id: 'mock-volatility',
    tabLabel: '모의고사',
    label: '성적 변동성 분석',
    renderHtml: renderMockVolatility,
    hasData: (s) => !!(s.mock_result && s.mock_result.length >= 2),
  },

  // ─── 성적분석 ───
  {
    id: 'trend-prediction',
    tabLabel: '성적분석',
    label: '성적 추이 & 성장 예측',
    renderHtml: renderTrendPrediction,
    hasData: (s) => !!(s.mock_result && s.mock_result.length >= 2),
  },
  {
    id: 'gap-analysis',
    tabLabel: '성적분석',
    label: '내신 vs 모의고사 괴리 분석',
    renderHtml: renderGapAnalysis,
    hasData: (s) => hasAcademicData(s) && hasMockData(s),
  },

  // ─── 비교과 ───
  {
    id: 'attendance',
    tabLabel: '비교과',
    label: '출결상황',
    renderHtml: renderAttendance,
    hasData: (s) => !!(s.section2_attendance && s.section2_attendance.length > 0),
  },

  // ─── 단어분석 ───
  {
    id: 'word-cloud',
    tabLabel: '단어분석',
    label: '워드클라우드',
    renderHtml: renderWordCloud,
    hasData: (s) => !!(s.section6_academic_development?.length || s.section5_creative_activities?.length || s.section8_behavior_characteristics?.length),
  },

  // ─── 역량분석 (구 '키워드분석' 탭) ───
  {
    id: 'keyword-analysis',
    tabLabel: '역량분석',
    label: '핵심역량 키워드 분석',
    renderHtml: renderKeywordAnalysis,
    hasData: (s) => !!(s.section6_academic_development?.length || s.section5_creative_activities?.length || s.section8_behavior_characteristics?.length),
  },

  // ─── 독서 ───
  {
    id: 'reading-grade-1',
    tabLabel: '독서',
    label: '1학년 독서 목록',
    renderHtml: (s: Student) => renderReadingList(s, 1),
    hasData: (s) => hasReadingForGrade(s, 1),
  },
  {
    id: 'reading-grade-2',
    tabLabel: '독서',
    label: '2학년 독서 목록',
    renderHtml: (s: Student) => renderReadingList(s, 2),
    hasData: (s) => hasReadingForGrade(s, 2),
  },
  {
    id: 'reading-grade-3',
    tabLabel: '독서',
    label: '3학년 독서 목록',
    renderHtml: (s: Student) => renderReadingList(s, 3),
    hasData: (s) => hasReadingForGrade(s, 3),
  },
];

// ─── Helper functions ───

function hasAcademicData(s: Student): boolean {
  return !!(s.section6_academic_development && s.section6_academic_development.length > 0);
}

function hasCareerData(s: Student): boolean {
  return !!(s.section6_academic_development && s.section6_academic_development.some(r => r.category === 'career'));
}

function hasMockData(s: Student): boolean {
  return !!(s.mock_result && s.mock_result.length > 0);
}

function hasReadingForGrade(student: Student, grade: number): boolean {
  const reading = student.reading;
  if (!reading) return false;
  return reading.some(r => r.grade === grade && 'source' in r && r.source === 'extracted');
}
