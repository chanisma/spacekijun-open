/**
 * Estimated Grade Tab - 예상 등급
 * 기존 vanilla JS estimatedGradeView.js와 동일한 기능 구현
 * evalog 글래스모피즘 디자인 적용
 */

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { TrendingUp, AlertTriangle, Zap, ArrowLeft, CheckCircle2, BookOpen, Database, FileJson, X, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCourseAnalyzeData, useCourseAnalyzeSubjects } from '../../context';
import { useTargetGradeFilter } from '../../hooks/useTargetGradeFilter';
import type { Student, GradeSource, DatabaseGradeData } from '../../types/course.types';
import type { AcademicRecord, SlimAcademicRecord } from '../../services/databaseGradeService';
import { fetchRawAcademicRecords } from '../../services/databaseGradeService';
import { getGradeCutoffs, getMinStudentsForEstimate } from '../../utils/gradeScale';
import { isRankedCategory } from '../../utils/subjectUtils';
import { toDbGradeCategory } from '../../utils/gradeMapping';
import { compareByRankingGrade, estimatedGradeFromRank } from '../../utils/estimatedGrade';
import { formatStudentNumber } from '../../utils/dataProcessor';
import { TargetGradeFilter } from './TargetGradeFilter';
import { formatGrade } from '../../utils/gradeFormat';
import { PartialScopeMark } from '../common/PartialAverageMark';

// evalog 스타일 카테고리 컬러 - soft light variants
const CATEGORY_COLORS: Record<string, { badge: string; dot: string; selected: string; warning: string; danger: string }> = {
  '국어': {
    badge: 'bg-violet-50/80 text-violet-700 border-violet-200/60',
    dot: 'bg-violet-400',
    selected: 'ring-2 ring-brand-500 ring-offset-1',
    warning: 'ring-2 ring-amber-400 ring-offset-1',
    danger: 'ring-2 ring-rose-500 ring-offset-1',
  },
  '영어': {
    badge: 'bg-blue-50/80 text-blue-700 border-blue-200/60',
    dot: 'bg-blue-400',
    selected: 'ring-2 ring-brand-500 ring-offset-1',
    warning: 'ring-2 ring-amber-400 ring-offset-1',
    danger: 'ring-2 ring-rose-500 ring-offset-1',
  },
  '수학': {
    badge: 'bg-emerald-50/80 text-emerald-700 border-emerald-200/60',
    dot: 'bg-emerald-400',
    selected: 'ring-2 ring-brand-500 ring-offset-1',
    warning: 'ring-2 ring-amber-400 ring-offset-1',
    danger: 'ring-2 ring-rose-500 ring-offset-1',
  },
  '사회': {
    badge: 'bg-purple-50/80 text-purple-700 border-purple-200/60',
    dot: 'bg-purple-400',
    selected: 'ring-2 ring-brand-500 ring-offset-1',
    warning: 'ring-2 ring-amber-400 ring-offset-1',
    danger: 'ring-2 ring-rose-500 ring-offset-1',
  },
  '역사': {
    badge: 'bg-amber-50/80 text-amber-700 border-amber-200/60',
    dot: 'bg-amber-400',
    selected: 'ring-2 ring-brand-500 ring-offset-1',
    warning: 'ring-2 ring-amber-400 ring-offset-1',
    danger: 'ring-2 ring-rose-500 ring-offset-1',
  },
  '물리': {
    badge: 'bg-orange-50/80 text-orange-700 border-orange-200/60',
    dot: 'bg-orange-400',
    selected: 'ring-2 ring-brand-500 ring-offset-1',
    warning: 'ring-2 ring-amber-400 ring-offset-1',
    danger: 'ring-2 ring-rose-500 ring-offset-1',
  },
  '화학': {
    badge: 'bg-pink-50/80 text-pink-700 border-pink-200/60',
    dot: 'bg-pink-400',
    selected: 'ring-2 ring-brand-500 ring-offset-1',
    warning: 'ring-2 ring-amber-400 ring-offset-1',
    danger: 'ring-2 ring-rose-500 ring-offset-1',
  },
  '생명': {
    badge: 'bg-teal-50/80 text-teal-700 border-teal-200/60',
    dot: 'bg-teal-400',
    selected: 'ring-2 ring-brand-500 ring-offset-1',
    warning: 'ring-2 ring-amber-400 ring-offset-1',
    danger: 'ring-2 ring-rose-500 ring-offset-1',
  },
  '지구과학': {
    badge: 'bg-cyan-50/80 text-cyan-700 border-cyan-200/60',
    dot: 'bg-cyan-400',
    selected: 'ring-2 ring-brand-500 ring-offset-1',
    warning: 'ring-2 ring-amber-400 ring-offset-1',
    danger: 'ring-2 ring-rose-500 ring-offset-1',
  },
  '과학': {
    badge: 'bg-sky-50/80 text-sky-700 border-sky-200/60',
    dot: 'bg-sky-400',
    selected: 'ring-2 ring-brand-500 ring-offset-1',
    warning: 'ring-2 ring-amber-400 ring-offset-1',
    danger: 'ring-2 ring-rose-500 ring-offset-1',
  },
  '과학기타': {
    badge: 'bg-sky-50/80 text-sky-700 border-sky-200/60',
    dot: 'bg-sky-400',
    selected: 'ring-2 ring-brand-500 ring-offset-1',
    warning: 'ring-2 ring-amber-400 ring-offset-1',
    danger: 'ring-2 ring-rose-500 ring-offset-1',
  },
  '외국어': {
    badge: 'bg-rose-50/80 text-rose-700 border-rose-200/60',
    dot: 'bg-rose-400',
    selected: 'ring-2 ring-brand-500 ring-offset-1',
    warning: 'ring-2 ring-amber-400 ring-offset-1',
    danger: 'ring-2 ring-rose-500 ring-offset-1',
  },
  '기술가정정보': {
    badge: 'bg-lime-50/80 text-lime-700 border-lime-200/60',
    dot: 'bg-lime-400',
    selected: 'ring-2 ring-brand-500 ring-offset-1',
    warning: 'ring-2 ring-amber-400 ring-offset-1',
    danger: 'ring-2 ring-rose-500 ring-offset-1',
  },
  '교양': {
    badge: 'bg-stone-50/80 text-stone-600 border-stone-200/60',
    dot: 'bg-stone-400',
    selected: 'ring-2 ring-brand-500 ring-offset-1',
    warning: 'ring-2 ring-amber-400 ring-offset-1',
    danger: 'ring-2 ring-rose-500 ring-offset-1',
  },
  '기타': {
    badge: 'bg-slate-50/80 text-slate-600 border-slate-200/60',
    dot: 'bg-slate-400',
    selected: 'ring-2 ring-brand-500 ring-offset-1',
    warning: 'ring-2 ring-amber-400 ring-offset-1',
    danger: 'ring-2 ring-rose-500 ring-offset-1',
  },
};

// evalog 등급별 색상
const GRADE_COLORS: Record<number, string> = {
  1: 'bg-blue-600 text-white',
  2: 'bg-blue-500 text-white',
  3: 'bg-emerald-500 text-white',
  4: 'bg-emerald-400 text-white',
  5: 'bg-amber-500 text-white',
  6: 'bg-amber-400 text-slate-800',
  7: 'bg-orange-400 text-white',
  8: 'bg-orange-500 text-white',
  9: 'bg-rose-500 text-white',
};

interface SubjectRiskData {
  name: string;
  semester: string;
  warningCount: number;
  dangerCount: number;
  totalCount: number;
}

export function EstimatedGradeTab() {
  const { currentStudents, currentGrade, currentAcademicYear, gradeSource, getEffectiveGrade, getStudentDatabaseGrade, databaseGrades } = useCourseAnalyzeData();
  const { subjectCategories, getSubjectCategory, categoryOrder } = useCourseAnalyzeSubjects();
  const [selectedSubject, setSelectedSubject] = useState<{ name: string; semester: 'semester1' | 'semester2' } | null>(null);

  // 과목 학년 분리 필터 (1학년 신청 = 2·3학년 과목 혼재 시에만 토글 노출)
  const targetGrade = useTargetGradeFilter(currentAcademicYear, currentGrade);

  // 필터에서 제외된 과목이 열려 있으면 상세 보기를 닫는다
  useEffect(() => {
    if (selectedSubject && !targetGrade.matches(selectedSubject.name)) {
      setSelectedSubject(null);
    }
  }, [selectedSubject, targetGrade]);

  // 학생별 유효 등급 가져오기 (gradeSource에 따라 JSON/DB/Both)
  const getStudentGrade = (student: Student): number => {
    return getEffectiveGrade(student.id);
  };

  // 학생의 특정 과목 카테고리별 등급 가져오기 (과목군별 등급 우선)
  const getStudentGradeForSubject = (student: Student, subject: string): number => {
    if (gradeSource === 'json') {
      return getEffectiveGrade(student.id);
    }
    // DB 또는 Both 모드: 과목군별 등급 우선
    const dbGrade = getStudentDatabaseGrade(student.id);
    if (dbGrade && dbGrade.subjectGroupGrades) {
      const category = getSubjectCategory(subject);
      const dbCategory = toDbGradeCategory(category); // 과학 세부 카테고리는 "과학"으로 접힘
      const categoryGrade = dbGrade.subjectGroupGrades[dbCategory];
      if (categoryGrade && categoryGrade > 0) return categoryGrade;
    }
    return getEffectiveGrade(student.id);
  };

  // 등급 체계: 2025학년도 입학(2022 개정 교육과정) 이후는 전 학년 5등급, 이전은 9등급.
  // admission_year = currentAcademicYear - (currentGrade - 1)
  const cutoffs = getGradeCutoffs({ currentGrade, currentAcademicYear });

  // 최소 수강생 수: 5등급제 5명, 9등급제 13명 (미달 시 예상등급 미적용)
  const minStudentsForEstimate = getMinStudentsForEstimate({ currentGrade, currentAcademicYear });

  // 예상 등급 계산 함수 (반올림 인원수 기반)
  // 예: 18명, 4% 컷오프 → Math.round(18 * 0.04) = 1명이 1등급
  const calculateEstimatedGrade = (rank: number, total: number): string => {
    if (total === 0) return 'N/A';
    return `${estimatedGradeFromRank(rank, total, cutoffs)}등급`;
  };

  // 과목별 위험도 데이터 계산 (과목군별 등급 기준)
  const riskData = useMemo(() => {
    const results: SubjectRiskData[] = [];

    // 1학기 과목
    const semester1SubjectsSet = new Set<string>();
    currentStudents.forEach(s => s.semester1.forEach(sub => semester1SubjectsSet.add(sub)));

    semester1SubjectsSet.forEach(subject => {
      // 해당 과목의 과목군별 등급으로 필터링 및 정렬
      const studentsForSubject = currentStudents
        .filter(s => s.semester1.includes(subject) && getStudentGradeForSubject(s, subject) > 0)
        .sort((a, b) => getStudentGradeForSubject(a, subject) - getStudentGradeForSubject(b, subject));

      // 석차등급이 산출되지 않는 교과(교양)는 위험도 집계 대상이 아니다
      if (isRankedCategory(getSubjectCategory(subject)) && studentsForSubject.length >= minStudentsForEstimate) {
        let warningCount = 0;
        let dangerCount = 0;

        studentsForSubject.forEach((student, index) => {
          const rank = index + 1;
          const estimatedGrade = calculateEstimatedGrade(rank, studentsForSubject.length);
          const estimatedGradeNum = parseInt(estimatedGrade.replace('등급', ''));
          const actualGrade = getStudentGradeForSubject(student, subject);
          const gradeDifference = estimatedGradeNum - Math.round(actualGrade);

          if (gradeDifference >= 2) dangerCount++;
          else if (gradeDifference >= 1) warningCount++;
        });

        if (warningCount > 0 || dangerCount > 0) {
          results.push({
            name: subject,
            semester: '1학기',
            warningCount,
            dangerCount,
            totalCount: studentsForSubject.length
          });
        }
      }
    });

    // 2학기 과목
    const semester2SubjectsSet = new Set<string>();
    currentStudents.forEach(s => s.semester2.forEach(sub => semester2SubjectsSet.add(sub)));

    semester2SubjectsSet.forEach(subject => {
      // 해당 과목의 과목군별 등급으로 필터링 및 정렬
      const studentsForSubject = currentStudents
        .filter(s => s.semester2.includes(subject) && getStudentGradeForSubject(s, subject) > 0)
        .sort((a, b) => getStudentGradeForSubject(a, subject) - getStudentGradeForSubject(b, subject));

      // 석차등급이 산출되지 않는 교과(교양)는 위험도 집계 대상이 아니다
      if (isRankedCategory(getSubjectCategory(subject)) && studentsForSubject.length >= minStudentsForEstimate) {
        let warningCount = 0;
        let dangerCount = 0;

        studentsForSubject.forEach((student, index) => {
          const rank = index + 1;
          const estimatedGrade = calculateEstimatedGrade(rank, studentsForSubject.length);
          const estimatedGradeNum = parseInt(estimatedGrade.replace('등급', ''));
          const actualGrade = getStudentGradeForSubject(student, subject);
          const gradeDifference = estimatedGradeNum - Math.round(actualGrade);

          if (gradeDifference >= 2) dangerCount++;
          else if (gradeDifference >= 1) warningCount++;
        });

        if (warningCount > 0 || dangerCount > 0) {
          results.push({
            name: subject,
            semester: '2학기',
            warningCount,
            dangerCount,
            totalCount: studentsForSubject.length
          });
        }
      }
    });

    return results;
  }, [currentStudents, cutoffs, gradeSource, databaseGrades, getSubjectCategory]);

  // 위험도 맵 생성
  const riskMap = useMemo(() => {
    const map = new Map<string, SubjectRiskData>();
    riskData.forEach(risk => {
      map.set(`${risk.name}_${risk.semester}`, risk);
    });
    return map;
  }, [riskData]);

  // 과목 학년 필터를 통과한 위험도만 (위험도 카드/무위험 메시지에 사용)
  const filteredRiskData = useMemo(
    () => riskData.filter((r) => targetGrade.matches(r.name)),
    [riskData, targetGrade],
  );

  // 학기별 과목 목록 (정렬됨)
  const { semester1Subjects, semester2Subjects } = useMemo(() => {
    const s1 = new Set<string>();
    const s2 = new Set<string>();

    currentStudents.forEach(student => {
      student.semester1.forEach(sub => s1.add(sub));
      student.semester2.forEach(sub => s2.add(sub));
    });

    const sortByCategory = (subjects: string[]) => {
      return subjects.sort((a, b) => {
        const catA = getSubjectCategory(a);
        const catB = getSubjectCategory(b);
        const orderA = categoryOrder.indexOf(catA);
        const orderB = categoryOrder.indexOf(catB);
        if (orderA !== orderB) return orderA - orderB;
        return a.localeCompare(b);
      });
    };

    return {
      semester1Subjects: sortByCategory([...s1]),
      semester2Subjects: sortByCategory([...s2])
    };
  }, [currentStudents, getSubjectCategory, categoryOrder]);

  if (currentStudents.length === 0) {
    return (
      <div className="glass-panel p-6">
        <div className="py-10 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100/80 flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm text-slate-500 font-medium">데이터가 없습니다</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel p-6 space-y-6">
      {/* Section Header - evalog 스타일 */}
      <div className="flex items-start gap-3 pb-4 border-b border-slate-100/50">
        <div className="p-2 rounded-xl bg-brand-50 text-brand-600 shrink-0">
          <TrendingUp size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-slate-800 tracking-tight">예상 등급 분석</h3>
          <p className="text-sm text-slate-500 font-medium mt-0.5">
            과목별 학생들의 예상 등급을 분석합니다
          </p>
        </div>
      </div>

      {/* Description */}
      <div className="p-3 rounded-lg bg-slate-50/80 border border-slate-100/60 space-y-2">
        <p className="text-sm text-slate-600 leading-relaxed">
          특정 과목을 선택한 학생들의 예상 등급을 분석합니다. 학기별 과목을 클릭하면 해당 학기에 수강한 학생의 단순 예상 등급을 확인할 수 있습니다.
          <span className="inline-flex items-center gap-1 mx-1 text-amber-600 font-medium">
            <Zap size={12} />주황색
          </span>
          은 반올림된 실제 등급과 예상 등급이 1등급 차이인 경우,
          <span className="inline-flex items-center gap-1 mx-1 text-rose-600 font-medium">
            <AlertTriangle size={12} />빨간색
          </span>
          은 2등급 이상의 차이인 경우를 나타냅니다.
        </p>
        {/* Grade Source Indicator */}
        <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60">
          {gradeSource === 'json' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-md border border-blue-200/60">
              <FileJson size={10} />
              JSON 데이터 사용
            </span>
          )}
          {gradeSource === 'database' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-md border border-emerald-200/60">
              <Database size={10} />
              DB 성적 사용
            </span>
          )}
          {gradeSource === 'both' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-purple-50 text-purple-700 rounded-md border border-purple-200/60">
              <Database size={10} />
              DB 우선 (없으면 JSON)
            </span>
          )}
        </div>
      </div>

      {/* 과목 학년 분리 토글 — 2·3학년 과목이 함께 있는 라운드(예: 1학년 신청)에서만 노출 */}
      {targetGrade.hasMultiple && (
        <TargetGradeFilter
          targetGrades={targetGrade.targetGrades}
          selected={targetGrade.selected}
          onChange={targetGrade.setSelected}
        />
      )}

      {/* Subject Badges by Semester */}
      <div className="space-y-4">
        {/* 1학기 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">1학기</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {semester1Subjects.filter(targetGrade.matches).map(subject => {
              const category = getSubjectCategory(subject);
              const risk = riskMap.get(`${subject}_1학기`);
              const hasWarning = !!(risk && risk.warningCount > 0);
              const hasDanger = !!(risk && risk.dangerCount > 0);
              const isSelected = selectedSubject?.name === subject && selectedSubject?.semester === 'semester1';
              const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS['기타'];

              return (
                <SubjectBadgeButton
                  key={subject}
                  subject={subject}
                  isSelected={isSelected}
                  hasWarning={hasWarning}
                  hasDanger={hasDanger}
                  colors={colors}
                  risk={risk}
                  onClick={() => setSelectedSubject(
                    isSelected ? null : { name: subject, semester: 'semester1' }
                  )}
                />
              );
            })}
          </div>
        </div>

        {/* 2학기 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">2학기</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {semester2Subjects.filter(targetGrade.matches).map(subject => {
              const category = getSubjectCategory(subject);
              const risk = riskMap.get(`${subject}_2학기`);
              const hasWarning = !!(risk && risk.warningCount > 0);
              const hasDanger = !!(risk && risk.dangerCount > 0);
              const isSelected = selectedSubject?.name === subject && selectedSubject?.semester === 'semester2';
              const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS['기타'];

              return (
                <SubjectBadgeButton
                  key={subject}
                  subject={subject}
                  isSelected={isSelected}
                  hasWarning={hasWarning}
                  hasDanger={hasDanger}
                  colors={colors}
                  risk={risk}
                  onClick={() => setSelectedSubject(
                    isSelected ? null : { name: subject, semester: 'semester2' }
                  )}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Selected Subject Detail Table */}
      {selectedSubject && (
        <EstimatedGradeTable
          subject={selectedSubject.name}
          semester={selectedSubject.semester}
          students={currentStudents}
          cutoffs={cutoffs}
          getSubjectCategory={getSubjectCategory}
          getEffectiveGrade={getEffectiveGrade}
          getStudentDatabaseGrade={getStudentDatabaseGrade}
          gradeSource={gradeSource}
          onClose={() => setSelectedSubject(null)}
          minStudentsForEstimate={minStudentsForEstimate}
        />
      )}

      {/* Risk Analysis Card (shown when no subject selected) */}
      {!selectedSubject && filteredRiskData.length > 0 && (
        <RiskAnalysisCard riskData={filteredRiskData} />
      )}

      {/* No Risk Message */}
      {!selectedSubject && filteredRiskData.length === 0 && (
        <div className="p-6 rounded-xl bg-emerald-50/80 border border-emerald-200/60 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-emerald-100/80 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          </div>
          <p className="text-sm text-emerald-700 font-medium">
            실제 등급과 예상 등급의 차이가 1등급 이상인 학생이 있는 과목이 없습니다!
          </p>
        </div>
      )}
    </div>
  );
}

// Subject Badge Button - evalog 스타일
function SubjectBadgeButton({
  subject,
  isSelected,
  hasWarning,
  hasDanger,
  colors,
  risk,
  onClick
}: {
  subject: string;
  isSelected: boolean;
  hasWarning: boolean;
  hasDanger: boolean;
  colors: { badge: string; selected: string; warning: string; danger: string };
  risk?: { warningCount: number; dangerCount: number };
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={risk ? `주의 ${risk.warningCount}명, 위험 ${risk.dangerCount}명` : undefined}
      className={cn(
        "px-2.5 py-1 text-xs font-medium rounded-lg border transition-all duration-200",
        "hover:shadow-sm",
        colors.badge,
        isSelected && colors.selected,
        !isSelected && hasDanger && colors.danger,
        !isSelected && hasWarning && !hasDanger && colors.warning
      )}
    >
      <span className="flex items-center gap-1">
        {subject}
        {hasDanger && <AlertTriangle size={10} className="text-rose-500" />}
        {hasWarning && !hasDanger && <Zap size={10} className="text-amber-500" />}
      </span>
    </button>
  );
}

// Risk Analysis Card - evalog 스타일
function RiskAnalysisCard({ riskData }: { riskData: SubjectRiskData[] }) {
  return (
    <div className="bg-white/60 backdrop-blur-sm rounded-xl border border-white/40 overflow-hidden">
      {/* Card Header */}
      <div className="px-4 py-3 border-b border-slate-100/60">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-500" />
          <h5 className="font-bold text-slate-700 tracking-tight text-sm">
            과목별 등급 위험도 분석
          </h5>
        </div>
        <p className="text-xs text-slate-500 font-medium mt-1">
          각 과목별로 학생의 실제 평균 등급과 예상 등급을 비교하여 위험도를 분석합니다
        </p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gradient-to-r from-brand-500 to-brand-600 text-white">
              <th className="px-4 py-3 text-left font-bold tracking-tight">과목명/학기</th>
              <th className="px-4 py-3 text-center font-bold tracking-tight">주의</th>
              <th className="px-4 py-3 text-center font-bold tracking-tight">위험</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100/60">
            {riskData.slice(0, 20).map((risk, idx) => (
              <tr
                key={`${risk.name}-${risk.semester}`}
                className={cn(
                  "group transition-colors",
                  idx % 2 === 0 ? "bg-white/50" : "bg-slate-50/30",
                  "hover:bg-brand-50/30"
                )}
              >
                <td className="px-4 py-2.5">
                  <div className="font-bold text-slate-700 tracking-tight">{risk.name}</div>
                  <div className="text-xs text-slate-400 font-medium">{risk.semester}</div>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className="px-2 py-0.5 text-xs font-bold bg-amber-500 text-white rounded-full">
                    {risk.warningCount}명
                  </span>
                  <span className="block text-xs text-slate-400 font-mono mt-0.5">
                    ({((risk.warningCount / risk.totalCount) * 100).toFixed(1)}%)
                  </span>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className="px-2 py-0.5 text-xs font-bold bg-rose-500 text-white rounded-full">
                    {risk.dangerCount}명
                  </span>
                  <span className="block text-xs text-slate-400 font-mono mt-0.5">
                    ({((risk.dangerCount / risk.totalCount) * 100).toFixed(1)}%)
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// DB 성적 상세 팝업 컴포넌트 - Portal로 렌더링하여 화면 중앙에 표시
function DbGradeDetailPopup({
  studentName,
  studentNumber,
  dbGradeData,
  onClose,
  onRefreshDb,
  isRefreshing
}: {
  studentName: string;
  /** 표시 전용 학번(GCCNN). DB 조회는 dbGradeData.studentCode 로 한다 */
  studentNumber: string;
  dbGradeData: DatabaseGradeData | undefined;
  onClose: () => void;
  onRefreshDb?: () => void;
  isRefreshing?: boolean;
}) {
  // Phase2: rawRecords는 lazy fetch (RPC 호출 시 페이로드 절감 위해 비워둠).
  // 모달 열릴 때만 1명분 academic_development를 가져온다.
  const [lazyRecords, setLazyRecords] = useState<SlimAcademicRecord[]>([]);
  useEffect(() => {
    if (!dbGradeData?.studentCode) return;
    let cancelled = false;
    fetchRawAcademicRecords(dbGradeData.studentCode)
      .then(rows => { if (!cancelled) setLazyRecords(rows); })
      .catch(err => console.warn('Failed to lazy-fetch raw records:', err));
    return () => { cancelled = true; };
  }, [dbGradeData?.studentCode]);

  // lazy fetch 결과는 이미 regular+rank로 필터되어 있음 (fetchRawAcademicRecords 내부 처리)
  const regularRecords = lazyRecords;

  // 과목군별 그룹화
  const groupedRecords = regularRecords.reduce((acc, record) => {
    const group = record.subject_group || '기타';
    if (!acc[group]) acc[group] = [];
    acc[group].push(record);
    return acc;
  }, {} as Record<string, SlimAcademicRecord[]>);

  const modalContent = !dbGradeData ? (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h3 className="font-bold text-slate-700">DB 성적 정보 없음</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-200 text-slate-400">
            <X size={16} />
          </button>
        </div>
        <div className="p-6 text-center">
          <p className="text-sm text-slate-500">{studentName} 학생의 DB 성적 데이터가 없습니다.</p>
          <p className="text-xs text-slate-400 mt-2">JSON 파일의 등급이 사용됩니다.</p>
        </div>
      </div>
    </div>
  ) : (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-emerald-500 to-emerald-600 text-white">
          <div>
            <h3 className="font-bold flex items-center gap-2">
              <Database size={16} />
              DB 성적 상세 정보
            </h3>
            <p className="text-xs text-emerald-100 mt-0.5">{studentName} ({studentNumber})</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/20 text-white">
            <X size={16} />
          </button>
        </div>

        {/* Summary */}
        <div className="px-4 py-3 bg-emerald-50/50 border-b border-emerald-100/60">
          <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
            <div>
              {/* '전체 평균'이 아니다 — 석차등급이 산출되는 보통교과만의 가중 평균이라
                  진로선택(A/B/C)·교양(P)은 애초에 분모에 없다. 라벨이 '전체'라고 말하면
                  그 사실이 지워지므로 표식으로 범위를 밝힌다. */}
              <div className="text-xs text-slate-500 font-medium">
                평균 등급
                <PartialScopeMark title="석차등급이 산출되는 보통교과만으로 계산한 가중 평균입니다. 진로선택(A/B/C)·교양(P) 과목은 포함되지 않습니다." />
              </div>
              <div className="text-xl font-bold text-emerald-600">{formatGrade(dbGradeData.overallGrade)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 font-medium">총 이수 단위</div>
              <div className="text-xl font-bold text-slate-700">{dbGradeData.totalUnits}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 font-medium">과목 수</div>
              <div className="text-xl font-bold text-slate-700">{dbGradeData.subjectCount}과목</div>
            </div>
          </div>
        </div>

        {/* Subject Group Grades */}
        {Object.keys(dbGradeData.subjectGroupGrades).length > 0 && (
          <div className="px-4 py-3 border-b border-slate-100">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">과목군별 평균 등급</h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(dbGradeData.subjectGroupGrades).map(([group, grade]) => (
                <span
                  key={group}
                  className="px-2 py-1 bg-slate-100 rounded-lg text-xs font-medium text-slate-700"
                >
                  {group}: <span className="font-bold text-emerald-600">{formatGrade(grade)}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Detailed Records */}
        <div className="overflow-y-auto max-h-[40vh]">
          {Object.entries(groupedRecords).length > 0 ? (
            Object.entries(groupedRecords).map(([group, groupRecords]) => (
              <div key={group} className="border-b border-slate-100 last:border-b-0">
                <div className="px-4 py-2 bg-slate-50 sticky top-0">
                  <span className="text-xs font-bold text-slate-600">{group}</span>
                  <span className="text-xs text-slate-400 ml-2">({groupRecords.length}과목)</span>
                </div>
                <div className="divide-y divide-slate-50">
                  {groupRecords.map((record, idx) => (
                    <div key={idx} className="px-4 py-2 flex items-center justify-between text-sm hover:bg-slate-50/50">
                      <div className="flex-1">
                        <span className="font-medium text-slate-700">{record.subject}</span>
                        <span className="text-xs text-slate-400 ml-2">
                          {record.grade}학년 {record.semester}학기
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500">{record.units}단위</span>
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-xs font-bold",
                          record.rank && record.rank <= 3 ? "bg-blue-100 text-blue-700" :
                          record.rank && record.rank <= 5 ? "bg-emerald-100 text-emerald-700" :
                          record.rank && record.rank <= 7 ? "bg-amber-100 text-amber-700" :
                          "bg-rose-100 text-rose-700"
                        )}>
                          {record.rank}등급
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="p-6 text-center">
              <p className="text-sm text-slate-400 mb-3">상세 과목 기록이 없습니다.</p>
              {onRefreshDb && (
                <button
                  onClick={onRefreshDb}
                  disabled={isRefreshing}
                  className={cn(
                    "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    isRefreshing
                      ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                      : "bg-emerald-500 text-white hover:bg-emerald-600"
                  )}
                >
                  <Database size={14} className={isRefreshing ? "animate-pulse" : ""} />
                  {isRefreshing ? "불러오는 중..." : "DB 성적 다시 불러오기"}
                </button>
              )}
              <p className="text-xs text-slate-400 mt-3">
                세션 저장 시 상세 기록이 생략됩니다. 버튼을 눌러 DB에서 다시 불러오세요.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">
          <p className="text-xs text-slate-500 text-center">
            * 보통교과(regular) 중 등급이 있는 과목만 계산에 포함됩니다.
          </p>
        </div>
      </div>
    </div>
  );

  // Portal을 사용하여 document.body에 직접 렌더링 (화면 중앙에 표시)
  return createPortal(modalContent, document.body);
}

// 예상 등급 상세 테이블 컴포넌트 - evalog 스타일
function EstimatedGradeTable({
  subject,
  semester,
  students,
  cutoffs,
  getSubjectCategory,
  getEffectiveGrade,
  getStudentDatabaseGrade,
  gradeSource,
  onClose,
  minStudentsForEstimate
}: {
  subject: string;
  semester: 'semester1' | 'semester2';
  students: Student[];
  cutoffs: Record<number, number>;
  getSubjectCategory: (name: string) => string;
  getEffectiveGrade: (studentId: string | number) => number;
  getStudentDatabaseGrade: (studentId: string | number) => DatabaseGradeData | undefined;
  gradeSource: GradeSource;
  onClose: () => void;
  minStudentsForEstimate: number;
}) {
  const semesterProperty = semester;
  const semesterText = semester === 'semester1' ? '1학기' : '2학기';

  // DB 성적 상세 팝업 상태
  const [selectedStudentForDbDetail, setSelectedStudentForDbDetail] = useState<{
    id: string | number;
    name: string;
    studentNumber: string;
  } | null>(null);

  // 선택된 과목의 카테고리 (과목군)
  const subjectCategory = useMemo(() => getSubjectCategory(subject), [subject, getSubjectCategory]);

  // DB 등급용 카테고리 (과학 세부 카테고리는 "과학"으로 접힘)
  const dbCategory = useMemo(() => toDbGradeCategory(subjectCategory), [subjectCategory]);

  // 학생의 과목군별 등급 가져오기 (과학은 통합된 "과학" 등급 사용)
  const getStudentCategoryGrade = (studentId: string | number): number => {
    const dbGrade = getStudentDatabaseGrade(studentId);
    if (!dbGrade || !dbGrade.subjectGroupGrades) return 0;
    return dbGrade.subjectGroupGrades[dbCategory] || 0;
  };

  // 해당 과목 선택 학생 필터링 및 정렬 (과목군별 등급 우선, 같으면 전체 평균)
  const studentsForSubject = useMemo(() => {
    return students
      .filter(s => s[semesterProperty].includes(subject))
      .sort((a, b) => {
        if (gradeSource === 'json') {
          // JSON 모드: 전체 평균으로만 정렬
          const gradeA = getEffectiveGrade(a.id);
          const gradeB = getEffectiveGrade(b.id);
          if (!gradeA && !gradeB) return 0;
          if (!gradeA) return 1;
          if (!gradeB) return -1;
          return gradeA - gradeB;
        }

        // DB/Both 모드: 과목군별 등급 우선, 같으면 전체 평균
        const categoryGradeA = getStudentCategoryGrade(a.id);
        const categoryGradeB = getStudentCategoryGrade(b.id);
        const overallGradeA = getEffectiveGrade(a.id);
        const overallGradeB = getEffectiveGrade(b.id);

        // 과목군 등급이 없으면 전체 평균으로 폴백해 비교 (utils/estimatedGrade 단일 출처)
        return compareByRankingGrade(
          { categoryGrade: categoryGradeA, overallGrade: overallGradeA },
          { categoryGrade: categoryGradeB, overallGrade: overallGradeB }
        );
      });
  }, [students, subject, semesterProperty, gradeSource, subjectCategory]);

  // 예상 등급 계산 (반올림 인원수 기반)
  // 예: 18명, 4% 컷오프 → Math.round(18 * 0.04) = 1명이 1등급
  const calculateEstimatedGrade = (rank: number, total: number): string => {
    if (total === 0) return 'N/A';
    return `${estimatedGradeFromRank(rank, total, cutoffs)}등급`;
  };

  // 최소 수강생 미달 여부
  const isBelowMinimum = studentsForSubject.length < minStudentsForEstimate;

  // 석차등급이 산출되지 않는 교과(교양 = 이수/미이수)인지
  const isUnrankedCategory = !isRankedCategory(subjectCategory);

  // 예상등급 미적용 (사유 무관) — 아래 계산·표시가 모두 이 값을 본다
  const noEstimate = isUnrankedCategory || isBelowMinimum;

  // 위험도별 카운트
  const { orangeCount, redCount, studentsWithGrades } = useMemo(() => {
    let orange = 0;
    let red = 0;

    const withGrades = studentsForSubject.map((student, index) => {
      const rank = index + 1;

      // 최소 수강생 미달 시 예상등급 계산하지 않음
      const estimatedGrade = noEstimate ? '-' : calculateEstimatedGrade(rank, studentsForSubject.length);
      const estimatedGradeNum = noEstimate ? 0 : parseInt(estimatedGrade.replace('등급', ''));

      // 전체 평균 등급
      const overallGrade = getEffectiveGrade(student.id);
      // 과목군별 등급
      const categoryGrade = getStudentCategoryGrade(student.id);
      // 비교에 사용할 등급 (과목군별 등급 우선, 없으면 전체 평균)
      const compareGrade = gradeSource !== 'json' && categoryGrade > 0 ? categoryGrade : overallGrade;

      const gradeDifference = estimatedGradeNum - Math.round(compareGrade);

      // 최소 수강생 미달 시 위험도 계산하지 않음
      let riskLevel: 'safe' | 'warning' | 'danger' = 'safe';
      if (!noEstimate && !isNaN(compareGrade) && !isNaN(estimatedGradeNum)) {
        if (gradeDifference >= 2) {
          riskLevel = 'danger';
          red++;
        } else if (gradeDifference >= 1) {
          riskLevel = 'warning';
          orange++;
        }
      }

      return {
        ...student,
        overallGrade,    // 전체 평균 등급
        categoryGrade,   // 과목군별 등급
        rank,
        estimatedGrade,
        riskLevel
      };
    });

    return { orangeCount: orange, redCount: red, studentsWithGrades: withGrades };
  }, [studentsForSubject, cutoffs, gradeSource, subjectCategory, noEstimate]);

  // 과목 뱃지 생성
  const createSubjectBadges = (subjects: string[]) => {
    if (subjects.length === 0) return <span className="text-xs text-slate-400">없음</span>;

    return (
      <div className="flex flex-wrap gap-1">
        {subjects.map(sub => {
          const category = getSubjectCategory(sub);
          const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS['기타'];
          return (
            <span
              key={sub}
              className={cn(
                "px-1.5 py-0.5 text-xs font-medium rounded border",
                colors.badge
              )}
            >
              {sub}
            </span>
          );
        })}
      </div>
    );
  };

  // 등급 색상
  const getGradeClass = (grade: string): string => {
    const gradeNum = parseInt(grade.replace('등급', ''));
    if (isNaN(gradeNum)) return 'bg-slate-100/80 text-slate-600';
    return GRADE_COLORS[gradeNum] || 'bg-slate-100/80 text-slate-600';
  };

  return (
    <div className="bg-white/60 backdrop-blur-sm rounded-xl border border-white/40 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100/60 bg-slate-50/50">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100/50 transition-colors"
            >
              <ArrowLeft size={14} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <BookOpen size={14} className="text-brand-500" />
                <h6 className="font-bold text-slate-700 tracking-tight text-sm">
                  {semesterText} {subject} 예상 등급 분석
                </h6>
                {gradeSource !== 'json' && (
                  <span className="px-1.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded border border-emerald-200">
                    {dbCategory} 기준
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-slate-500 font-medium">
                  {studentsForSubject.length}명
                </span>
                {isUnrankedCategory ? (
                  <span
                    className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-stone-100 text-stone-600 rounded-md border border-stone-200"
                    title="교양 교과는 이수/미이수(P)로만 기록되어 석차등급이 산출되지 않습니다"
                  >
                    <Info size={10} />
                    교양 교과 (이수/미이수 · 예상등급 미산출)
                  </span>
                ) : isBelowMinimum ? (
                  <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-500 rounded-md border border-slate-200">
                    <AlertTriangle size={10} />
                    최소 {minStudentsForEstimate}명 미달 (예상등급 미적용)
                  </span>
                ) : (orangeCount > 0 || redCount > 0) && (
                  <div className="flex items-center gap-2">
                    {orangeCount > 0 && (
                      <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                        <Zap size={12} />
                        주의 {orangeCount}명
                      </span>
                    )}
                    {redCount > 0 && (
                      <span className="flex items-center gap-1 text-xs text-rose-600 font-medium">
                        <AlertTriangle size={12} />
                        위험 {redCount}명
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gradient-to-r from-brand-500 to-brand-600 text-white">
              <th className="px-4 py-3 text-left font-bold tracking-tight">학생명 (ID)</th>
              <th className="px-4 py-3 text-left font-bold tracking-tight">1학기 선택과목</th>
              <th className="px-4 py-3 text-left font-bold tracking-tight">2학기 선택과목</th>
              <th className="px-4 py-3 text-center font-bold tracking-tight">
                <div className="flex flex-col items-center">
                  <span>실제 등급</span>
                  {gradeSource !== 'json' && (
                    <span className="text-[10px] font-normal opacity-80">전체 / {dbCategory}</span>
                  )}
                </div>
              </th>
              <th className="px-4 py-3 text-center font-bold tracking-tight">예상 등급</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100/60">
            {studentsWithGrades.map((student, idx) => (
              <tr
                key={student.id}
                className={cn(
                  "group transition-colors",
                  idx % 2 === 0 ? "bg-white/50" : "bg-slate-50/30",
                  "hover:bg-brand-50/30"
                )}
              >
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <div className="font-bold text-slate-700 tracking-tight">{student.name}</div>
                  <div className="text-xs text-slate-400 font-mono">{formatStudentNumber(student)}</div>
                </td>
                <td className="px-4 py-2.5">
                  {createSubjectBadges(student.semester1)}
                </td>
                <td className="px-4 py-2.5">
                  {createSubjectBadges(student.semester2)}
                </td>
                <td className="px-4 py-2.5 text-center">
                  {gradeSource !== 'json' ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedStudentForDbDetail({ id: student.id, name: student.name, studentNumber: formatStudentNumber(student) });
                      }}
                      className={cn(
                        "px-2 py-1 text-xs font-bold rounded-lg font-mono transition-all",
                        "hover:ring-2 hover:ring-emerald-400 hover:ring-offset-1 cursor-pointer",
                        getStudentDatabaseGrade(student.id)
                          ? "bg-emerald-100/80 text-emerald-700"
                          : "bg-slate-100/80 text-slate-600"
                      )}
                      title="클릭하여 DB 성적 상세 보기"
                    >
                      <div className="flex items-center gap-1.5">
                        {/* 전체 평균 등급 */}
                        <span className="text-slate-500">
                          {formatGrade(student.overallGrade)}
                        </span>
                        <span className="text-slate-300">/</span>
                        {/* 과목군별 등급 (강조) */}
                        <span className={cn(
                          "font-bold",
                          student.categoryGrade > 0 ? "text-emerald-700" : "text-slate-400"
                        )}>
                          {formatGrade(student.categoryGrade)}
                        </span>
                        {getStudentDatabaseGrade(student.id) && (
                          <Info size={10} className="opacity-60" />
                        )}
                      </div>
                    </button>
                  ) : (
                    <span className="px-2 py-0.5 text-xs font-bold bg-slate-100/80 text-slate-600 rounded-full font-mono">
                      {formatGrade(student.overallGrade, 'N/A')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-center">
                  {noEstimate ? (
                    <span className="px-2 py-0.5 text-xs font-bold bg-slate-100/80 text-slate-400 rounded-full">
                      {isUnrankedCategory ? 'P' : '-'}
                    </span>
                  ) : (
                    <span className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-full",
                      getGradeClass(student.estimatedGrade),
                      student.riskLevel === 'warning' && "ring-2 ring-amber-400 ring-offset-1",
                      student.riskLevel === 'danger' && "ring-2 ring-rose-500 ring-offset-1"
                    )}>
                      {student.riskLevel === 'danger' && <AlertTriangle size={12} />}
                      {student.riskLevel === 'warning' && <Zap size={12} />}
                      {student.estimatedGrade}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {studentsForSubject.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-sm text-slate-400 font-medium">선택된 과목을 수강한 학생이 없습니다</p>
        </div>
      )}

      {/* DB 성적 상세 팝업 */}
      {selectedStudentForDbDetail && (
        <DbGradeDetailPopup
          studentName={selectedStudentForDbDetail.name}
          studentNumber={selectedStudentForDbDetail.studentNumber}
          dbGradeData={getStudentDatabaseGrade(selectedStudentForDbDetail.id)}
          onClose={() => setSelectedStudentForDbDetail(null)}
        />
      )}
    </div>
  );
}
