import { AnalysisPageHeader } from '../common/AnalysisPageHeader';

import React, { useMemo, useState } from 'react';
import {
  Microscope,
  Users,
  AlertTriangle,
  AlertOctagon,
  TrendingUp,
  Link2,
  BookX,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  PartyPopper,
  FlaskConical,
  Globe
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { findSubjectCategory } from '../../utils/subjectUtils';
import { getScienceHierarchyViolations, formatStudentNumber } from '../../utils/dataProcessor';
import { useCourseAnalyzeData, useCourseAnalyzeSubjects } from '../../context';
import { usePriorYearSubjects } from '../../hooks/usePriorYearSubjects';
import type { Student } from '../../types/course.types';
import { getGradeCutoffs } from '../../utils/gradeScale';
import { toDbGradeCategory } from '../../utils/gradeMapping';

// 과목 연계 쌍 (1학년용): 1학기 일반선택 → 2학기 진로선택
const LINKAGE_PAIRS = [
  { from: '물리학', to: '역학과 에너지' },
  { from: '화학', to: '물질과 에너지' },
  { from: '생명과학', to: '세포와 물질대사' },
  { from: '지구과학', to: '지구시스템과학' },
];

// 과목 연계 체인 (2학년용): 2학년 일반선택(prior) → 2학년 진로선택 심화(prior) → 선택한 3학년 심화(selection)
// 사용자 결정: 일반선택→3학년 심화 연계에 "2학년 때 수강한 심화 과목"(mid, prior)을 중간 노드로 함께 표시.
const LINKAGE_CHAINS_GRADE2 = [
  { base: '물리학', mid: '역학과 에너지', advanced: '전자기와 양자' },
  { base: '화학', mid: '물질과 에너지', advanced: '화학 반응의 세계' },
  { base: '생명과학', mid: '세포와 물질대사', advanced: '생물의 유전' },
  { base: '지구과학', mid: '지구시스템과학', advanced: '행성우주과학' },
];

export function InDepthTab() {
  const { currentStudents, currentGrade, currentAcademicYear, getEffectiveGrade, gradeSource, getStudentDatabaseGrade } = useCourseAnalyzeData();
  const getGrade = (student: Student) => getEffectiveGrade(student.id);
  const { subjectCategories, getSubjectCategory } = useCourseAnalyzeSubjects();

  // 2학년 컨텍스트: 직전 학년도(현재 학년) 1학년 round 선택과목 = "현재 듣고 있는 2학년 과목".
  // 학급별 보기(ClassViewTab)가 국·영·수 합산에 쓰는 것과 동일한 출처.
  // 1학년 컨텍스트에서는 빈 맵을 반환하므로 위계 분석이 기존과 동일하게 동작한다.
  const priorYear = usePriorYearSubjects(currentAcademicYear, currentGrade);

  // 과학교과 위계 위반: 2학년은 prior(현재 2학년 과목) + 3학년 선택분을 합쳐 판정.
  // (1학년은 priorYear.map 이 비어 있어 선택분만 보던 기존 동작과 동일)
  const scienceViolations = useMemo(
    () => getScienceHierarchyViolations(currentStudents, priorYear.map),
    [currentStudents, priorYear.map]
  );

  // 과목군별 등급 조회 (EstimatedGradeTab과 동일한 로직)
  const getGradeForSubject = (student: Student, subject: string): number => {
    if (gradeSource === 'json') {
      return getEffectiveGrade(student.id);
    }
    const dbGrade = getStudentDatabaseGrade(student.id);
    if (dbGrade && dbGrade.subjectGroupGrades) {
      const category = getSubjectCategory(subject);
      const dbCategory = toDbGradeCategory(category);
      const categoryGrade = dbGrade.subjectGroupGrades[dbCategory];
      if (categoryGrade && categoryGrade > 0) return categoryGrade;
    }
    return getEffectiveGrade(student.id);
  };

  if (currentStudents.length === 0) {
    return (
      <div className="glass-panel p-6">
        <div className="py-10 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100/80 flex items-center justify-center">
            <Microscope className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm text-slate-500 font-medium">데이터가 없습니다</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel p-6 space-y-6">
      <AnalysisPageHeader
        icon={Microscope}
        title="심화 분석"
        description="과목 선택 패턴을 심화 분석합니다. 연계과목 선택률, 과목군별 미선택 현황 등을 확인할 수 있습니다."
      />

      {/* Analysis Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 1. 동일 과목 선택 학생 분석 */}
        <SameSubjectAnalysisCard students={currentStudents} />

        {/* 2. 과학교과 위계 위반 분석 (1·2학년) */}
        {(currentGrade === 1 || currentGrade === 2) && (
          <ScienceHierarchyAnalysisCard
            students={currentStudents}
            violations={scienceViolations}
            currentGrade={currentGrade}
            priorLoading={currentGrade === 2 && priorYear.isLoading}
            priorMissing={currentGrade === 2 && !priorYear.isLoading && priorYear.map.size === 0}
            priorAcademicYear={priorYear.priorAcademicYear}
            priorRoundNumber={priorYear.priorRoundNumber}
          />
        )}

        {/* 3. 등급 위험도 분석 */}
        <GradeRiskAnalysisCard
          students={currentStudents}
          subjectCategories={subjectCategories}
          getGrade={getGrade}
          getGradeForSubject={getGradeForSubject}
          currentGrade={currentGrade}
          currentAcademicYear={currentAcademicYear}
        />

        {/* 4. 과목 연계 분석 (1·2학년) */}
        {(currentGrade === 1 || currentGrade === 2) && (
          <LinkageAnalysisCard
            students={currentStudents}
            currentGrade={currentGrade}
            priorMap={priorYear.map}
            priorLoading={currentGrade === 2 && priorYear.isLoading}
            priorMissing={currentGrade === 2 && !priorYear.isLoading && priorYear.map.size === 0}
            priorAcademicYear={priorYear.priorAcademicYear}
            priorRoundNumber={priorYear.priorRoundNumber}
          />
        )}

        {/* 5. 탐구 과목군 미선택 분석 */}
        <NonSelectionAnalysisCard
          students={currentStudents}
          subjectCategories={subjectCategories}
        />
      </div>
    </div>
  );
}

// ========== 1. 동일 과목 선택 학생 분석 카드 ==========
function SameSubjectAnalysisCard({ students }: { students: Student[] }) {
  const [expanded, setExpanded] = useState(false);

  // 1,2학기 동일 과목 선택 학생 찾기
  const studentsWithSameSubjects = useMemo(() => {
    return students.filter(student => {
      return student.semester1.some(subject => student.semester2.includes(subject));
    });
  }, [students]);

  // 학생별 동일 선택 과목 가져오기
  const getCommonSubjects = (student: Student) => {
    return student.semester1.filter(subject => student.semester2.includes(subject));
  };

  const hasWarning = studentsWithSameSubjects.length > 0;

  return (
    <div className="bg-white/60 backdrop-blur-sm rounded-xl border border-white/40 overflow-hidden transition-all duration-200 hover:shadow-sm hover:border-slate-200/60">
      {/* Card Header */}
      <div className="px-4 py-3 border-b border-slate-100/60 bg-white/50">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-slate-400" />
          <h4 className="text-sm font-bold text-slate-700 tracking-tight">1, 2학기 동일 과목 선택 학생</h4>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <button
          onClick={() => hasWarning && setExpanded(!expanded)}
          disabled={!hasWarning}
          className={cn(
            "w-full p-5 rounded-xl text-center transition-all duration-200",
            hasWarning
              ? "bg-amber-50/80 border border-amber-200/60 cursor-pointer hover:bg-amber-100/60"
              : "bg-emerald-50/80 border border-emerald-200/60 cursor-default"
          )}
        >
          <p className="text-sm text-slate-500 font-medium mb-2">동일 과목 선택 학생 수</p>
          <p className={cn(
            "text-4xl font-bold tracking-tight",
            hasWarning ? "text-amber-600" : "text-emerald-600"
          )}>
            {studentsWithSameSubjects.length}
          </p>
          <p className="text-sm text-slate-500 font-medium mt-1">명</p>

          {hasWarning && (
            <div className="flex items-center justify-center gap-1 mt-3 text-xs text-slate-400">
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              <span>클릭하여 상세보기</span>
            </div>
          )}
        </button>

        {!hasWarning && (
          <div className="mt-4 flex items-center justify-center gap-2 text-emerald-600">
            <PartyPopper size={16} />
            <span className="text-sm font-medium">모든 학생이 서로 다른 과목을 선택했습니다!</span>
          </div>
        )}

        {/* Expanded Student List */}
        {expanded && studentsWithSameSubjects.length > 0 && (
          <div className="mt-4 border border-slate-200/60 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-200/60 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600 tracking-tight">동일 과목 선택 학생 목록</span>
              <span className="px-2 py-0.5 text-xs font-bold bg-brand-500 text-white rounded-full">
                {studentsWithSameSubjects.length}명
              </span>
            </div>
            <div className="divide-y divide-slate-100/60">
              {studentsWithSameSubjects.map((student, idx) => (
                <div
                  key={student.id}
                  className={cn(
                    "px-4 py-3 flex items-center justify-between",
                    idx % 2 === 0 ? "bg-white/50" : "bg-slate-50/30"
                  )}
                >
                  <div>
                    <span className="text-sm font-bold text-slate-700 tracking-tight">{student.name}</span>
                    <span className="text-xs text-slate-400 font-mono ml-2">{formatStudentNumber(student)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {getCommonSubjects(student).map(subject => (
                      <span
                        key={subject}
                        className="px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-600 rounded-full border border-amber-200/60"
                      >
                        {subject}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ========== 2. 과학교과 위계 위반 분석 카드 ==========
interface ViolationInfo {
  student: Student;
  violations: Array<{
    category: string;
    violation: string;
    description: string;
  }>;
}

function ScienceHierarchyAnalysisCard({
  students,
  violations,
  currentGrade,
  priorLoading = false,
  priorMissing = false,
  priorAcademicYear = null,
  priorRoundNumber = null
}: {
  students: Student[];
  violations: ViolationInfo[];
  currentGrade: number;
  priorLoading?: boolean;
  priorMissing?: boolean;
  priorAcademicYear?: number | null;
  priorRoundNumber?: number | null;
}) {
  const [expandedType, setExpandedType] = useState<'missing' | 'same-semester' | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // 2학년은 "현재 듣는 2학년 과목 + 선택한 3학년 과목"을 합쳐 위계를 판정한다.
  const isGrade2 = currentGrade === 2;

  // 위반 유형별 집계
  const categoryStats = useMemo(() => {
    const stats: Record<string, { missing: ViolationInfo[]; sameSemester: ViolationInfo[] }> = {
      '물리': { missing: [], sameSemester: [] },
      '화학': { missing: [], sameSemester: [] },
      '생명': { missing: [], sameSemester: [] },
      '지구과학': { missing: [], sameSemester: [] },
    };

    violations.forEach(violationData => {
      violationData.violations.forEach(v => {
        if (stats[v.category]) {
          if (v.violation === 'missing_prerequisite') {
            stats[v.category].missing.push(violationData);
          } else if (v.violation === 'same_semester') {
            stats[v.category].sameSemester.push(violationData);
          }
        }
      });
    });

    return stats;
  }, [violations]);

  const totalMissing = Object.values(categoryStats).reduce((sum, cat) => sum + cat.missing.length, 0);
  const totalSameSemester = Object.values(categoryStats).reduce((sum, cat) => sum + cat.sameSemester.length, 0);

  return (
    <div className="bg-white/60 backdrop-blur-sm rounded-xl border border-white/40 overflow-hidden transition-all duration-200 hover:shadow-sm hover:border-slate-200/60">
      {/* Card Header */}
      <div className="px-4 py-3 border-b border-slate-100/60 bg-white/50">
        <div className="flex items-center gap-2">
          <AlertOctagon size={16} className="text-slate-400" />
          <h4 className="text-sm font-bold text-slate-700 tracking-tight">{currentGrade}학년 과학교과 위계 위반</h4>
        </div>
        {isGrade2 && (
          <p className="mt-1 text-xs text-slate-400 font-medium">
            현재 2학년 수강 과목
            {priorAcademicYear && (
              <span className="text-slate-300"> ({priorAcademicYear}/round {priorRoundNumber})</span>
            )}
            {' + 선택한 3학년 과목'}을 합쳐 선수과목 이수를 판정합니다
          </p>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* 2학년: prior(현재 2학년) 데이터 로딩/부재 가드 — 없으면 선수과목 미이수가 과도 집계됨 */}
        {priorLoading && (
          <div className="flex items-center justify-center gap-2 text-slate-400 py-8">
            <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-transparent animate-spin" />
            <span className="text-sm font-medium">현재 2학년 수강 과목을 불러오는 중…</span>
          </div>
        )}
        {!priorLoading && priorMissing && (
          <div className="flex items-center justify-center gap-2 text-amber-600 py-8 text-center">
            <AlertTriangle size={16} />
            <span className="text-sm font-medium">
              직전 학년도(1학년) 선택 데이터가 없어 위계 분석을 수행할 수 없습니다
            </span>
          </div>
        )}
        {!priorLoading && !priorMissing && (
        <>
        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3">
          {/* 선수과목 미이수 */}
          <button
            onClick={() => setExpandedType(expandedType === 'missing' ? null : 'missing')}
            className={cn(
              "p-4 rounded-xl text-center transition-all duration-200",
              totalMissing > 0
                ? "bg-rose-50/80 border-2 cursor-pointer hover:bg-rose-100/60"
                : "bg-emerald-50/80 border-2 cursor-default",
              expandedType === 'missing' ? "border-rose-400" : "border-transparent"
            )}
          >
            <p className="text-xs text-slate-500 font-medium mb-1">선수과목 미이수</p>
            <p className={cn(
              "text-3xl font-bold tracking-tight",
              totalMissing > 0 ? "text-rose-600" : "text-emerald-600"
            )}>
              {totalMissing}
            </p>
            <p className="text-xs text-slate-400 mt-1">{totalMissing}건의 위반</p>
            {totalMissing > 0 && (
              <div className="flex items-center justify-center gap-1 mt-2 text-xs text-slate-400">
                {expandedType === 'missing' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                <span>과목별 현황</span>
              </div>
            )}
          </button>

          {/* 선수과목과 동시 수강 */}
          <button
            onClick={() => setExpandedType(expandedType === 'same-semester' ? null : 'same-semester')}
            className={cn(
              "p-4 rounded-xl text-center transition-all duration-200",
              totalSameSemester > 0
                ? "bg-amber-50/80 border-2 cursor-pointer hover:bg-amber-100/60"
                : "bg-emerald-50/80 border-2 cursor-default",
              expandedType === 'same-semester' ? "border-amber-400" : "border-transparent"
            )}
          >
            <p className="text-xs text-slate-500 font-medium mb-1">선수과목과 동시 수강</p>
            <p className={cn(
              "text-3xl font-bold tracking-tight",
              totalSameSemester > 0 ? "text-amber-600" : "text-emerald-600"
            )}>
              {totalSameSemester}
            </p>
            <p className="text-xs text-slate-400 mt-1">{totalSameSemester}건의 위반</p>
            {totalSameSemester > 0 && (
              <div className="flex items-center justify-center gap-1 mt-2 text-xs text-slate-400">
                {expandedType === 'same-semester' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                <span>과목별 현황</span>
              </div>
            )}
          </button>
        </div>

        {/* Expanded Details */}
        {expandedType && (
          <div className="border border-slate-200/60 rounded-xl p-3 space-y-2">
            <h6 className="text-xs font-bold text-slate-600 tracking-tight mb-3">
              {expandedType === 'missing' ? '선수과목 미이수' : '선수과목과 동시 수강'} - 과목별 현황
            </h6>
            {Object.entries(categoryStats).map(([category, stats]) => {
              const items = expandedType === 'missing' ? stats.missing : stats.sameSemester;
              if (items.length === 0) return null;

              const maxCount = Math.max(
                ...Object.values(categoryStats).map(s =>
                  expandedType === 'missing' ? s.missing.length : s.sameSemester.length
                )
              );
              const barWidth = maxCount > 0 ? (items.length / maxCount) * 100 : 0;

              return (
                <div key={category}>
                  <button
                    onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
                    className="w-full p-3 bg-slate-50/80 hover:bg-slate-100/60 rounded-lg transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-slate-700 tracking-tight">{category}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">{items.length}건</span>
                        {expandedCategory === category ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </div>
                    </div>
                    <div className="h-1.5 bg-slate-200/60 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-300",
                          expandedType === 'missing' ? "bg-rose-500" : "bg-amber-500"
                        )}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </button>

                  {/* Student List */}
                  {expandedCategory === category && (
                    <div className="ml-4 mt-2 p-3 bg-slate-50/80 rounded-lg space-y-2 text-xs">
                      {items.map((item, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <span className="font-bold text-slate-700 whitespace-nowrap">
                            {item.student.name}
                            <span className="font-mono text-slate-400 ml-1">({formatStudentNumber(item.student)})</span>
                          </span>
                          <span className="text-slate-500">
                            {item.violations.filter(v =>
                              v.category === category &&
                              (expandedType === 'missing' ? v.violation === 'missing_prerequisite' : v.violation === 'same_semester')
                            ).map(v => v.description).join(', ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {violations.length === 0 && (
          <div className="flex items-center justify-center gap-2 text-emerald-600 py-4">
            <PartyPopper size={16} />
            <span className="text-sm font-medium">모든 학생이 과학교과 위계를 올바르게 준수했습니다!</span>
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}

// ========== 3. 등급 위험도 분석 카드 ==========
interface SubjectRiskAnalysis {
  name: string;
  semester: string;
  totalCount: number;
  warningCount: number;
  dangerCount: number;
  students: Array<{
    name: string;
    studentNumber: string;
    actualGrade: number;
    estimatedGrade: string;
    gradeDifference: number;
    riskLevel: 'SAFE' | 'WARNING' | 'DANGER';
  }>;
}

function GradeRiskAnalysisCard({
  students,
  subjectCategories,
  getGrade,
  getGradeForSubject,
  currentGrade,
  currentAcademicYear
}: {
  students: Student[];
  subjectCategories: Record<string, string[]>;
  getGrade: (student: Student) => number;
  getGradeForSubject: (student: Student, subject: string) => number;
  currentGrade: number;
  currentAcademicYear: number | null;
}) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // 등급 위험도 계산
  const riskAnalysis = useMemo(() => {
    // 등급 체계: 2025학년도 입학(2022 개정 교육과정) 이후는 전 학년 5등급, 이전은 9등급
    const cutoffs = getGradeCutoffs({ currentGrade, currentAcademicYear });

    const calculateEstimatedGrade = (rank: number, total: number): string => {
      if (total === 0) return 'N/A';
      const ratio = rank / total;

      for (const [grade, cutoff] of Object.entries(cutoffs)) {
        if (ratio <= cutoff) return `${grade}등급`;
      }
      return '등급 외';
    };

    const results: SubjectRiskAnalysis[] = [];

    // 1학기 과목 분석
    const semester1Subjects = new Set<string>();
    students.forEach(s => s.semester1.forEach(sub => semester1Subjects.add(sub)));

    semester1Subjects.forEach(subject => {
      const studentsForSubject = students
        .filter(s => s.semester1.includes(subject) && getGradeForSubject(s, subject) > 0)
        .sort((a, b) => getGradeForSubject(a, subject) - getGradeForSubject(b, subject));

      if (studentsForSubject.length >= 5) {
        const analysis = analyzeRisk(subject, '1학기', studentsForSubject, calculateEstimatedGrade);
        if (analysis.warningCount > 0 || analysis.dangerCount > 0) {
          results.push(analysis);
        }
      }
    });

    // 2학기 과목 분석
    const semester2Subjects = new Set<string>();
    students.forEach(s => s.semester2.forEach(sub => semester2Subjects.add(sub)));

    semester2Subjects.forEach(subject => {
      const studentsForSubject = students
        .filter(s => s.semester2.includes(subject) && getGradeForSubject(s, subject) > 0)
        .sort((a, b) => getGradeForSubject(a, subject) - getGradeForSubject(b, subject));

      if (studentsForSubject.length >= 5) {
        const analysis = analyzeRisk(subject, '2학기', studentsForSubject, calculateEstimatedGrade);
        if (analysis.warningCount > 0 || analysis.dangerCount > 0) {
          results.push(analysis);
        }
      }
    });

    // 위험도 순으로 정렬
    results.sort((a, b) => (b.warningCount + b.dangerCount) - (a.warningCount + a.dangerCount));

    return results;
  }, [students, getGrade, getGradeForSubject]);

  // 카테고리별 집계
  const categorizedRisk = useMemo(() => {
    const result: Record<string, { warningCount: number; dangerCount: number; subjects: SubjectRiskAnalysis[] }> = {};

    riskAnalysis.forEach(analysis => {
      const category = findSubjectCategory(analysis.name, subjectCategories) ?? '기타';
      if (!result[category]) {
        result[category] = { warningCount: 0, dangerCount: 0, subjects: [] };
      }
      result[category].warningCount += analysis.warningCount;
      result[category].dangerCount += analysis.dangerCount;
      result[category].subjects.push(analysis);
    });

    return result;
  }, [riskAnalysis, subjectCategories]);

  function analyzeRisk(
    subjectName: string,
    semester: string,
    sortedStudents: Student[],
    calculateEstimatedGrade: (rank: number, total: number) => string
  ): SubjectRiskAnalysis {
    let warningCount = 0;
    let dangerCount = 0;
    const analyzedStudents: SubjectRiskAnalysis['students'] = [];

    sortedStudents.forEach((student, index) => {
      const rank = index + 1;
      const estimatedGrade = calculateEstimatedGrade(rank, sortedStudents.length);
      const actualGrade = getGradeForSubject(student, subjectName);
      const estimatedGradeNum = parseInt(estimatedGrade.replace('등급', ''));
      const gradeDifference = estimatedGradeNum - Math.round(actualGrade);

      let riskLevel: 'SAFE' | 'WARNING' | 'DANGER' = 'SAFE';
      if (gradeDifference >= 2) {
        riskLevel = 'DANGER';
        dangerCount++;
      } else if (gradeDifference >= 1) {
        riskLevel = 'WARNING';
        warningCount++;
      }

      if (riskLevel !== 'SAFE') {
        analyzedStudents.push({
          name: student.name,
          studentNumber: formatStudentNumber(student),
          actualGrade,
          estimatedGrade,
          gradeDifference,
          riskLevel
        });
      }
    });

    return {
      name: subjectName,
      semester,
      totalCount: sortedStudents.length,
      warningCount,
      dangerCount,
      students: analyzedStudents
    };
  }

  const hasRisks = riskAnalysis.length > 0;

  return (
    <div className="bg-white/60 backdrop-blur-sm rounded-xl border border-white/40 overflow-hidden transition-all duration-200 hover:shadow-sm hover:border-slate-200/60">
      {/* Card Header */}
      <div className="px-4 py-3 border-b border-slate-100/60 bg-white/50">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-slate-400" />
          <h4 className="text-sm font-bold text-slate-700 tracking-tight">과목별 등급 위험도</h4>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {!hasRisks ? (
          <div className="flex items-center justify-center gap-2 text-emerald-600 py-6">
            <PartyPopper size={16} />
            <span className="text-sm font-medium">등급 위험 학생이 있는 과목이 없습니다!</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Category Badges */}
            <div className="flex flex-wrap gap-2">
              {Object.entries(categorizedRisk).map(([category, data]) => {
                const totalRisk = data.warningCount + data.dangerCount;
                if (totalRisk === 0) return null;

                const isExpanded = expandedCategory === category;
                const hasDanger = data.dangerCount > 0;

                return (
                  <button
                    key={category}
                    onClick={() => setExpandedCategory(isExpanded ? null : category)}
                    className={cn(
                      "px-4 py-2.5 rounded-xl text-center transition-all duration-200",
                      hasDanger
                        ? "bg-rose-50/80 hover:bg-rose-100/60"
                        : "bg-amber-50/80 hover:bg-amber-100/60",
                      isExpanded && (hasDanger ? "ring-2 ring-rose-400" : "ring-2 ring-amber-400")
                    )}
                  >
                    <div className={cn(
                      "text-xs font-bold tracking-tight",
                      hasDanger ? "text-rose-600" : "text-amber-600"
                    )}>
                      {category}
                    </div>
                    <div className={cn(
                      "text-xl font-bold",
                      hasDanger ? "text-rose-600" : "text-amber-600"
                    )}>
                      {totalRisk}
                    </div>
                    <div className="text-xs text-slate-400">{data.subjects.length}개 과목</div>
                  </button>
                );
              })}
            </div>

            {/* Expanded Table */}
            {expandedCategory && categorizedRisk[expandedCategory] && (
              <div className="border border-slate-200/60 rounded-xl overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200/60">
                      <th className="px-4 py-2.5 text-left font-bold text-slate-600">과목명/학기</th>
                      <th className="px-4 py-2.5 text-center font-bold text-slate-600">주의</th>
                      <th className="px-4 py-2.5 text-center font-bold text-slate-600">위험</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/60">
                    {categorizedRisk[expandedCategory].subjects.map((subject, idx) => (
                      <tr
                        key={`${subject.name}-${subject.semester}`}
                        className={idx % 2 === 0 ? "bg-white/50" : "bg-slate-50/30"}
                      >
                        <td className="px-4 py-2.5">
                          <div className="font-bold text-slate-700 tracking-tight">{subject.name}</div>
                          <div className="text-xs text-slate-400">{subject.semester}</div>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full border border-amber-200/60 font-medium">
                            {subject.warningCount}명
                          </span>
                          <span className="text-slate-400 ml-1">
                            ({((subject.warningCount / subject.totalCount) * 100).toFixed(1)}%)
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="px-2 py-0.5 bg-rose-50 text-rose-600 rounded-full border border-rose-200/60 font-medium">
                            {subject.dangerCount}명
                          </span>
                          <span className="text-slate-400 ml-1">
                            ({((subject.dangerCount / subject.totalCount) * 100).toFixed(1)}%)
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ========== 4. 과목 연계 분석 카드 ==========
function LinkageAnalysisCard({
  students,
  currentGrade,
  priorMap,
  priorLoading = false,
  priorMissing = false,
  priorAcademicYear = null,
  priorRoundNumber = null
}: {
  students: Student[];
  currentGrade: number;
  priorMap?: Map<string, Set<string>>;
  priorLoading?: boolean;
  priorMissing?: boolean;
  priorAcademicYear?: number | null;
  priorRoundNumber?: number | null;
}) {
  // 2학년: 일반선택(prior) → 2학년 진로선택 심화(prior) → 선택한 3학년 심화(현재 선택분) 3노드 체인.
  // 1학년: 기존대로 1학기 from → 2학기 to 2노드.
  const isGrade2 = currentGrade === 2;

  // 노드 체인 + 최종 연계율(첫 노드 대비 마지막 노드)로 정규화 → 렌더가 학년 무관하게 동작.
  const linkageStats = useMemo(() => {
    if (isGrade2) {
      return LINKAGE_CHAINS_GRADE2.map(chain => {
        // base·mid = 현재 2학년(prior) 과목, advanced = 선택한 3학년(현재 선택분) 과목.
        // mid·advanced 인원은 base 이수자 기준(깔때기): "물리학 들은 학생 중 …"
        const baseStudents = students.filter(s => priorMap?.get(String(s.id))?.has(chain.base));
        const midCount = baseStudents.filter(s => priorMap?.get(String(s.id))?.has(chain.mid)).length;
        const advCount = baseStudents.filter(s =>
          s.semester1.includes(chain.advanced) || s.semester2.includes(chain.advanced)
        ).length;
        const fromCount = baseStudents.length;
        const percentage = fromCount > 0 ? (advCount / fromCount) * 100 : 0;
        return {
          key: `${chain.base}-${chain.advanced}`,
          nodes: [
            { label: chain.base, count: fromCount, isMid: false },
            { label: chain.mid, count: midCount, isMid: true },
            { label: chain.advanced, count: advCount, isMid: false },
          ],
          fromCount,
          bothCount: advCount,
          percentage,
        };
      });
    }
    return LINKAGE_PAIRS.map(pair => {
      const fromStudents = students.filter(s => s.semester1.includes(pair.from));
      const bothStudents = fromStudents.filter(s => s.semester2.includes(pair.to));
      const fromCount = fromStudents.length;
      const bothCount = bothStudents.length;
      const percentage = fromCount > 0 ? (bothCount / fromCount) * 100 : 0;
      return {
        key: `${pair.from}-${pair.to}`,
        nodes: [
          { label: pair.from, count: fromCount, isMid: false },
          { label: pair.to, count: bothCount, isMid: false },
        ],
        fromCount,
        bothCount,
        percentage,
      };
    });
  }, [students, isGrade2, priorMap]);

  return (
    <div className="bg-white/60 backdrop-blur-sm rounded-xl border border-white/40 overflow-hidden transition-all duration-200 hover:shadow-sm hover:border-slate-200/60">
      {/* Card Header */}
      <div className="px-4 py-3 border-b border-slate-100/60 bg-white/50">
        <div className="flex items-center gap-2">
          <Link2 size={16} className="text-slate-400" />
          <h4 className="text-sm font-bold text-slate-700 tracking-tight">
            {isGrade2 ? '2학년 과목 연계 (현재 2학년 → 선택 3학년)' : '1학년 과목 연계 (1학기 → 2학기)'}
          </h4>
        </div>
        {isGrade2 && (
          <p className="mt-1 text-xs text-slate-400 font-medium">
            일반선택 → <span className="text-violet-500">2학년 심화</span> → 선택 3학년 심화 (괄호=인원, %=일반선택 대비 3학년 선택률)
            {priorAcademicYear && (
              <span className="text-slate-300"> ({priorAcademicYear}/round {priorRoundNumber})</span>
            )}
          </p>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {priorLoading ? (
          <div className="flex items-center justify-center gap-2 text-slate-400 py-8">
            <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-transparent animate-spin" />
            <span className="text-sm font-medium">현재 2학년 수강 과목을 불러오는 중…</span>
          </div>
        ) : priorMissing ? (
          <div className="flex items-center justify-center gap-2 text-amber-600 py-8 text-center">
            <AlertTriangle size={16} />
            <span className="text-sm font-medium">
              직전 학년도(1학년) 선택 데이터가 없어 연계 분석을 수행할 수 없습니다
            </span>
          </div>
        ) : (
          linkageStats.map(stat => (
            <div key={stat.key} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center flex-wrap gap-x-1 text-xs font-bold text-slate-700 tracking-tight">
                  {stat.nodes.map((node, i) => (
                    <React.Fragment key={node.label}>
                      {i > 0 && <span className="text-slate-400">→</span>}
                      <span className={cn(node.isMid && "text-violet-600")}>
                        {node.label}
                        <span className="ml-0.5 font-mono font-medium text-slate-400">({node.count})</span>
                      </span>
                    </React.Fragment>
                  ))}
                </span>
                <span className="text-xs text-slate-500 font-medium font-mono whitespace-nowrap">
                  {stat.bothCount}/{stat.fromCount}
                  <span className="text-brand-600 ml-1">({stat.percentage.toFixed(1)}%)</span>
                </span>
              </div>
              <div className="h-2 bg-slate-100/80 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-brand-400 to-brand-500 rounded-full transition-all duration-500"
                  style={{ width: `${stat.percentage}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ========== 5. 탐구 과목군 미선택 분석 카드 ==========
function NonSelectionAnalysisCard({
  students,
  subjectCategories
}: {
  students: Student[];
  subjectCategories: Record<string, string[]>;
}) {
  const nonSelectionStats = useMemo(() => {
    // 과학 과목 수집
    const scienceSubjects: string[] = [];
    if (subjectCategories['과학']) {
      scienceSubjects.push(...subjectCategories['과학']);
    } else {
      ['물리', '화학', '생명', '지구과학'].forEach(category => {
        if (subjectCategories[category]) {
          scienceSubjects.push(...subjectCategories[category]);
        }
      });
    }

    // 사회 과목 수집
    const socialSubjects: string[] = [];
    if (subjectCategories['사회']) {
      socialSubjects.push(...subjectCategories['사회']);
    }
    if (subjectCategories['역사']) {
      socialSubjects.push(...subjectCategories['역사']);
    }

    // 미선택 학생 계산
    const noScience = students.filter(s =>
      s.semester1.every(sub => !scienceSubjects.includes(sub)) &&
      s.semester2.every(sub => !scienceSubjects.includes(sub))
    );

    const noSocial = students.filter(s =>
      s.semester1.every(sub => !socialSubjects.includes(sub)) &&
      s.semester2.every(sub => !socialSubjects.includes(sub))
    );

    return { noScience, noSocial };
  }, [students, subjectCategories]);

  return (
    <div className="bg-white/60 backdrop-blur-sm rounded-xl border border-white/40 overflow-hidden transition-all duration-200 hover:shadow-sm hover:border-slate-200/60">
      {/* Card Header */}
      <div className="px-4 py-3 border-b border-slate-100/60 bg-white/50">
        <div className="flex items-center gap-2">
          <BookX size={16} className="text-slate-400" />
          <h4 className="text-sm font-bold text-slate-700 tracking-tight">탐구 과목군 미선택</h4>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="grid grid-cols-2 gap-3">
          {/* 과학 미선택 */}
          <div className={cn(
            "p-4 rounded-xl text-center",
            nonSelectionStats.noScience.length > 0
              ? "bg-amber-50/80 border border-amber-200/60"
              : "bg-emerald-50/80 border border-emerald-200/60"
          )}>
            <div className="flex items-center justify-center gap-1.5 mb-2">
              <FlaskConical size={14} className={nonSelectionStats.noScience.length > 0 ? "text-amber-500" : "text-emerald-500"} />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">과학</span>
            </div>
            <p className={cn(
              "text-4xl font-bold tracking-tight",
              nonSelectionStats.noScience.length > 0 ? "text-amber-600" : "text-emerald-600"
            )}>
              {nonSelectionStats.noScience.length}
            </p>
            <p className="text-xs text-slate-500 font-medium mt-1">명 미선택</p>
          </div>

          {/* 사회 미선택 */}
          <div className={cn(
            "p-4 rounded-xl text-center",
            nonSelectionStats.noSocial.length > 0
              ? "bg-amber-50/80 border border-amber-200/60"
              : "bg-emerald-50/80 border border-emerald-200/60"
          )}>
            <div className="flex items-center justify-center gap-1.5 mb-2">
              <Globe size={14} className={nonSelectionStats.noSocial.length > 0 ? "text-amber-500" : "text-emerald-500"} />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">사회</span>
            </div>
            <p className={cn(
              "text-4xl font-bold tracking-tight",
              nonSelectionStats.noSocial.length > 0 ? "text-amber-600" : "text-emerald-600"
            )}>
              {nonSelectionStats.noSocial.length}
            </p>
            <p className="text-xs text-slate-500 font-medium mt-1">명 미선택</p>
          </div>
        </div>
      </div>
    </div>
  );
}
