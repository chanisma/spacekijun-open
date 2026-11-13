/**
 * Student Estimated Grade Tab - 학생별 예상 등급
 * 각 학생이 선택한 모든 과목에서의 예상 등급 평균을 계산
 * evalog 글래스모피즘 디자인 적용
 */

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Users, TrendingUp, AlertTriangle, Zap, ChevronDown, ChevronUp, ArrowUpDown, Eye, EyeOff, Database, FileJson, X, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCourseAnalyzeData, useCourseAnalyzeSubjects } from '../../context';
import type { Student, GradeSource, DatabaseGradeData } from '../../types/course.types';
import type { AcademicRecord, SlimAcademicRecord } from '../../services/databaseGradeService';
import { fetchRawAcademicRecords } from '../../services/databaseGradeService';
import { getGradeCutoffs, getMinStudentsForEstimate } from '../../utils/gradeScale';
import { toDbGradeCategory } from '../../utils/gradeMapping';
import {
  compareByRankingGrade,
  estimatedGradeFromRank,
  getEstimateExcludeReason,
  type ExcludeReason,
} from '../../utils/estimatedGrade';
import { formatStudentNumber } from '../../utils/dataProcessor';
import { formatGrade, formatGradeDelta } from '../../utils/gradeFormat';
import { PartialAverageMark, PartialScopeMark } from '../common/PartialAverageMark';

// evalog 카테고리 컬러
const CATEGORY_COLORS: Record<string, { badge: string; dot: string }> = {
  '국어': { badge: 'bg-violet-50/80 text-violet-700 border-violet-200/60', dot: 'bg-violet-400' },
  '영어': { badge: 'bg-blue-50/80 text-blue-700 border-blue-200/60', dot: 'bg-blue-400' },
  '수학': { badge: 'bg-emerald-50/80 text-emerald-700 border-emerald-200/60', dot: 'bg-emerald-400' },
  '사회': { badge: 'bg-purple-50/80 text-purple-700 border-purple-200/60', dot: 'bg-purple-400' },
  '역사': { badge: 'bg-amber-50/80 text-amber-700 border-amber-200/60', dot: 'bg-amber-400' },
  '물리': { badge: 'bg-orange-50/80 text-orange-700 border-orange-200/60', dot: 'bg-orange-400' },
  '화학': { badge: 'bg-pink-50/80 text-pink-700 border-pink-200/60', dot: 'bg-pink-400' },
  '생명': { badge: 'bg-teal-50/80 text-teal-700 border-teal-200/60', dot: 'bg-teal-400' },
  '지구과학': { badge: 'bg-cyan-50/80 text-cyan-700 border-cyan-200/60', dot: 'bg-cyan-400' },
  '과학': { badge: 'bg-sky-50/80 text-sky-700 border-sky-200/60', dot: 'bg-sky-400' },
  '과학기타': { badge: 'bg-sky-50/80 text-sky-700 border-sky-200/60', dot: 'bg-sky-400' },
  '외국어': { badge: 'bg-rose-50/80 text-rose-700 border-rose-200/60', dot: 'bg-rose-400' },
  '기술가정정보': { badge: 'bg-lime-50/80 text-lime-700 border-lime-200/60', dot: 'bg-lime-400' },
  '교양': { badge: 'bg-stone-50/80 text-stone-600 border-stone-200/60', dot: 'bg-stone-400' },
  '기타': { badge: 'bg-slate-50/80 text-slate-600 border-slate-200/60', dot: 'bg-slate-400' },
};

// 등급별 색상
const getGradeColor = (grade: number): string => {
  if (grade <= 1.5) return 'bg-blue-600 text-white';
  if (grade <= 2.5) return 'bg-blue-500 text-white';
  if (grade <= 3.5) return 'bg-emerald-500 text-white';
  if (grade <= 4.5) return 'bg-emerald-400 text-white';
  if (grade <= 5.5) return 'bg-amber-500 text-white';
  if (grade <= 6.5) return 'bg-amber-400 text-slate-800';
  if (grade <= 7.5) return 'bg-orange-400 text-white';
  if (grade <= 8.5) return 'bg-orange-500 text-white';
  return 'bg-rose-500 text-white';
};

// 차이에 따른 색상
const getDifferenceColor = (diff: number): string => {
  if (diff >= 2) return 'text-rose-600 bg-rose-50';
  if (diff >= 1) return 'text-amber-600 bg-amber-50';
  if (diff >= 0.5) return 'text-yellow-600 bg-yellow-50';
  if (diff <= -1) return 'text-emerald-600 bg-emerald-50';
  return 'text-slate-600 bg-slate-50';
};

type SortKey = 'name' | 'class' | 'actualGrade' | 'avgEstimatedGrade' | 'difference';
type SortOrder = 'asc' | 'desc';

interface SubjectEstimatedGrade {
  subject: string;
  semester: 'semester1' | 'semester2';
  estimatedGrade: number;
  rank: number;
  total: number;
  excluded?: boolean;           // 평균 계산에서 제외됨
  excludeReason?: ExcludeReason;
}

interface StudentWithEstimatedGrades extends Student {
  subjectGrades: SubjectEstimatedGrade[];
  avgEstimatedGrade: number;
  difference: number; // 예상등급 - 실제등급 (양수면 불리)
}

export function StudentEstimatedGradeTab() {
  const {
    currentStudents,
    currentGrade,
    currentAcademicYear,
    gradeSource,
    getEffectiveGrade,
    getStudentDatabaseGrade,
    databaseGrades,
  } = useCourseAnalyzeData();
  const { getSubjectCategory } = useCourseAnalyzeSubjects();

  const [sortKey, setSortKey] = useState<SortKey>('difference');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [showOnlyRisk, setShowOnlyRisk] = useState(false);
  const [expandedStudent, setExpandedStudent] = useState<string | number | null>(null);
  const [selectedStudentForDbDetail, setSelectedStudentForDbDetail] = useState<{
    id: string | number;
    name: string;
    studentNumber: string;
  } | null>(null);

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

  // 과목군별 등급 비교 정렬 함수 (과목군 등급 우선, 같으면 전체 평균)
  const compareStudentsBySubjectGrade = (a: Student, b: Student, subject: string): number => {
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
    const category = getSubjectCategory(subject);
    const dbCategory = toDbGradeCategory(category); // 과학 세부 카테고리는 "과학"으로 접힘
    const dbGradeA = getStudentDatabaseGrade(a.id);
    const dbGradeB = getStudentDatabaseGrade(b.id);
    const categoryGradeA = dbGradeA?.subjectGroupGrades?.[dbCategory] || 0;
    const categoryGradeB = dbGradeB?.subjectGroupGrades?.[dbCategory] || 0;
    const overallGradeA = getEffectiveGrade(a.id);
    const overallGradeB = getEffectiveGrade(b.id);

    // 과목군 등급이 없으면 전체 평균으로 폴백해 비교한다 (utils/estimatedGrade 단일 출처).
    // 값 조회용 getStudentGradeForSubject()와 같은 폴백 규칙이라야
    // "명단에 넣을 때 쓴 등급"과 "줄 세울 때 쓴 등급"이 어긋나지 않는다.
    return compareByRankingGrade(
      { categoryGrade: categoryGradeA, overallGrade: overallGradeA },
      { categoryGrade: categoryGradeB, overallGrade: overallGradeB }
    );
  };

  // 등급 체계: 2025학년도 입학(2022 개정 교육과정) 이후는 전 학년 5등급, 이전은 9등급.
  // admission_year = currentAcademicYear - (currentGrade - 1)
  const cutoffs = getGradeCutoffs({ currentGrade, currentAcademicYear });

  // 최소 수강생 수: 5등급제 5명, 9등급제 13명 (미달 시 예상등급 미적용)
  const minStudentsForEstimate = getMinStudentsForEstimate({ currentGrade, currentAcademicYear });

  // 예상 등급 계산 (반올림 인원수 기반, utils/estimatedGrade 단일 출처)
  const calculateEstimatedGradeNum = (rank: number, total: number): number =>
    estimatedGradeFromRank(rank, total, cutoffs);

  // 예상등급 미적용 사유 판정 — 1·2학기 경로가 갈라지지 않도록 한 곳에서만 부른다.
  const getExcludeReason = (subject: string, total: number): ExcludeReason | null =>
    getEstimateExcludeReason(getSubjectCategory(subject), total, minStudentsForEstimate);

  // 과목별 수강생 맵 생성 (과목군별 등급 기준 정렬)
  const subjectStudentsMap = useMemo(() => {
    const map: Record<string, { semester: 'semester1' | 'semester2'; students: Student[] }[]> = {};

    // 1학기 과목
    const semester1Subjects = new Set<string>();
    currentStudents.forEach(s => s.semester1.forEach(sub => semester1Subjects.add(sub)));

    semester1Subjects.forEach(subject => {
      // 해당 과목의 과목군별 등급으로 필터링 및 정렬
      const students = currentStudents
        .filter(s => s.semester1.includes(subject) && getStudentGradeForSubject(s, subject) > 0)
        .sort((a, b) => compareStudentsBySubjectGrade(a, b, subject));

      if (!map[subject]) map[subject] = [];
      map[subject].push({ semester: 'semester1', students });
    });

    // 2학기 과목
    const semester2Subjects = new Set<string>();
    currentStudents.forEach(s => s.semester2.forEach(sub => semester2Subjects.add(sub)));

    semester2Subjects.forEach(subject => {
      // 해당 과목의 과목군별 등급으로 필터링 및 정렬
      const students = currentStudents
        .filter(s => s.semester2.includes(subject) && getStudentGradeForSubject(s, subject) > 0)
        .sort((a, b) => compareStudentsBySubjectGrade(a, b, subject));

      if (!map[subject]) map[subject] = [];
      map[subject].push({ semester: 'semester2', students });
    });

    return map;
  }, [currentStudents, gradeSource, databaseGrades, getSubjectCategory]);

  // 학생별 평균 예상등급 계산
  const studentsWithGrades = useMemo<StudentWithEstimatedGrades[]>(() => {
    return currentStudents
      .filter(student => getStudentGrade(student) > 0)
      .map(student => {
        const subjectGrades: SubjectEstimatedGrade[] = [];
        const actualGrade = getStudentGrade(student);

        // 1학기 과목들
        student.semester1.forEach(subject => {
          const subjectData = subjectStudentsMap[subject]?.find(d => d.semester === 'semester1');
          if (subjectData) {
            const rank = subjectData.students.findIndex(s => s.id === student.id) + 1;
            if (rank > 0) {
              const excludeReason = getExcludeReason(subject, subjectData.students.length);
              const estimatedGrade = excludeReason ? 0 : calculateEstimatedGradeNum(rank, subjectData.students.length);
              subjectGrades.push({
                subject,
                semester: 'semester1',
                estimatedGrade,
                rank,
                total: subjectData.students.length,
                excluded: excludeReason !== null,
                excludeReason: excludeReason ?? undefined
              });
            }
          }
        });

        // 2학기 과목들
        student.semester2.forEach(subject => {
          const subjectData = subjectStudentsMap[subject]?.find(d => d.semester === 'semester2');
          if (subjectData) {
            const rank = subjectData.students.findIndex(s => s.id === student.id) + 1;
            if (rank > 0) {
              const excludeReason = getExcludeReason(subject, subjectData.students.length);
              const estimatedGrade = excludeReason ? 0 : calculateEstimatedGradeNum(rank, subjectData.students.length);
              subjectGrades.push({
                subject,
                semester: 'semester2',
                estimatedGrade,
                rank,
                total: subjectData.students.length,
                excluded: excludeReason !== null,
                excludeReason: excludeReason ?? undefined
              });
            }
          }
        });

        // 평균 계산 (excluded 과목은 제외)
        const includedGrades = subjectGrades.filter(g => !g.excluded);
        const avgEstimatedGrade = includedGrades.length > 0
          ? includedGrades.reduce((sum, g) => sum + g.estimatedGrade, 0) / includedGrades.length
          : 0;

        const difference = avgEstimatedGrade - actualGrade;

        return {
          ...student,
          grade: actualGrade, // Use effective grade
          subjectGrades,
          avgEstimatedGrade,
          difference
        };
      })
      .filter(s => s.subjectGrades.some(g => !g.excluded)); // 적어도 하나의 유효한 과목이 있어야 함
  }, [currentStudents, subjectStudentsMap, cutoffs, gradeSource, databaseGrades, getSubjectCategory, minStudentsForEstimate]);

  // 정렬된 학생 목록
  const sortedStudents = useMemo(() => {
    const filtered = showOnlyRisk
      ? studentsWithGrades.filter(s => s.difference >= 1)
      : studentsWithGrades;

    return [...filtered].sort((a, b) => {
      let comparison = 0;

      switch (sortKey) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'class':
          comparison = (a.class * 100 + a.number) - (b.class * 100 + b.number);
          break;
        case 'actualGrade':
          comparison = a.grade - b.grade;
          break;
        case 'avgEstimatedGrade':
          comparison = a.avgEstimatedGrade - b.avgEstimatedGrade;
          break;
        case 'difference':
          comparison = a.difference - b.difference;
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [studentsWithGrades, sortKey, sortOrder, showOnlyRisk]);

  // 통계 요약
  const statistics = useMemo(() => {
    const total = studentsWithGrades.length;
    const riskStudents = studentsWithGrades.filter(s => s.difference >= 1).length;
    const dangerStudents = studentsWithGrades.filter(s => s.difference >= 2).length;
    const avgDifference = total > 0
      ? studentsWithGrades.reduce((sum, s) => sum + s.difference, 0) / total
      : 0;

    return { total, riskStudents, dangerStudents, avgDifference };
  }, [studentsWithGrades]);

  // 정렬 토글
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder(key === 'name' || key === 'class' ? 'asc' : 'desc');
    }
  };

  // 정렬 아이콘
  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey) {
      return <ArrowUpDown size={12} className="text-slate-300" />;
    }
    return sortOrder === 'asc'
      ? <ChevronUp size={12} className="text-brand-500" />
      : <ChevronDown size={12} className="text-brand-500" />;
  };

  if (currentStudents.length === 0) {
    return (
      <div className="glass-panel p-6">
        <div className="py-10 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100/80 flex items-center justify-center">
            <Users className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm text-slate-500 font-medium">데이터가 없습니다</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel p-6 space-y-6">
      {/* Section Header */}
      <div className="flex items-start gap-3 pb-4 border-b border-slate-100/50">
        <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 shrink-0">
          <Users size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-slate-800 tracking-tight">학생별 평균 예상 등급</h3>
          <p className="text-sm text-slate-500 font-medium mt-0.5">
            각 학생이 선택한 과목들에서의 예상 등급 평균을 분석합니다
          </p>
        </div>
      </div>

      {/* Description */}
      <div className="p-3 rounded-lg bg-slate-50/80 border border-slate-100/60 space-y-2">
        <p className="text-sm text-slate-600 leading-relaxed">
          각 학생이 선택한 모든 과목에서의 예상 등급을 계산하여 평균을 산출합니다.
          <span className="inline-flex items-center gap-1 mx-1 text-amber-600 font-medium">
            <Zap size={12} />주의
          </span>
          는 평균 예상등급이 실제 등급보다 1등급 이상 높은 경우(불리),
          <span className="inline-flex items-center gap-1 mx-1 text-rose-600 font-medium">
            <AlertTriangle size={12} />위험
          </span>
          은 2등급 이상 높은 경우를 나타냅니다.
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

      {/* Statistics Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg bg-white/60 border border-slate-100/60">
          <div className="text-xs text-slate-500 font-medium">분석 대상</div>
          <div className="text-xl font-bold text-slate-800 mt-1">{statistics.total}명</div>
        </div>
        <div className="p-3 rounded-lg bg-amber-50/60 border border-amber-100/60">
          <div className="text-xs text-amber-600 font-medium flex items-center gap-1">
            <Zap size={10} />주의 학생
          </div>
          <div className="text-xl font-bold text-amber-700 mt-1">{statistics.riskStudents}명</div>
        </div>
        <div className="p-3 rounded-lg bg-rose-50/60 border border-rose-100/60">
          <div className="text-xs text-rose-600 font-medium flex items-center gap-1">
            <AlertTriangle size={10} />위험 학생
          </div>
          <div className="text-xl font-bold text-rose-700 mt-1">{statistics.dangerStudents}명</div>
        </div>
        <div className="p-3 rounded-lg bg-white/60 border border-slate-100/60">
          <div className="text-xs text-slate-500 font-medium">
            평균 등급 차이
            <PartialAverageMark covered={statistics.total} total={currentStudents.length} />
          </div>
          <div className={cn(
            "text-xl font-bold mt-1",
            statistics.avgDifference >= 1 ? "text-amber-600" :
            statistics.avgDifference >= 0.5 ? "text-yellow-600" :
            "text-slate-800"
          )}>
            {formatGradeDelta(statistics.avgDifference)}
          </div>
        </div>
      </div>

      {/* Filter Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={() => setShowOnlyRisk(!showOnlyRisk)}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
            showOnlyRisk
              ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          )}
        >
          {showOnlyRisk ? <Eye size={14} /> : <EyeOff size={14} />}
          {showOnlyRisk ? '주의/위험 학생만 보기' : '전체 학생 보기'}
        </button>
        <div className="text-xs text-slate-500">
          {sortedStudents.length}명 표시 중
        </div>
      </div>

      {/* Student Table */}
      <div className="bg-white/60 backdrop-blur-sm rounded-xl border border-white/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-indigo-500 to-indigo-600 text-white">
                <th
                  className="px-4 py-3 text-left font-bold tracking-tight cursor-pointer hover:bg-white/10"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-1">
                    학생명
                    <SortIcon columnKey="name" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-center font-bold tracking-tight cursor-pointer hover:bg-white/10"
                  onClick={() => handleSort('class')}
                >
                  <div className="flex items-center justify-center gap-1">
                    반/번호
                    <SortIcon columnKey="class" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-center font-bold tracking-tight cursor-pointer hover:bg-white/10"
                  onClick={() => handleSort('actualGrade')}
                >
                  <div className="flex items-center justify-center gap-1">
                    실제 등급
                    <SortIcon columnKey="actualGrade" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-center font-bold tracking-tight cursor-pointer hover:bg-white/10"
                  onClick={() => handleSort('avgEstimatedGrade')}
                >
                  <div className="flex items-center justify-center gap-1">
                    평균 예상등급
                    <SortIcon columnKey="avgEstimatedGrade" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-center font-bold tracking-tight cursor-pointer hover:bg-white/10"
                  onClick={() => handleSort('difference')}
                >
                  <div className="flex items-center justify-center gap-1">
                    차이
                    <SortIcon columnKey="difference" />
                  </div>
                </th>
                <th className="px-4 py-3 text-center font-bold tracking-tight">
                  과목 수
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/60">
              {sortedStudents.map((student, idx) => {
                const isExpanded = expandedStudent === student.id;
                const riskLevel = student.difference >= 2 ? 'danger' : student.difference >= 1 ? 'warning' : 'safe';

                return (
                  <React.Fragment key={student.id}>
                    <tr
                      className={cn(
                        "group transition-colors cursor-pointer",
                        idx % 2 === 0 ? "bg-white/50" : "bg-slate-50/30",
                        "hover:bg-indigo-50/30",
                        isExpanded && "bg-indigo-50/50"
                      )}
                      onClick={() => setExpandedStudent(isExpanded ? null : student.id)}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {riskLevel === 'danger' && <AlertTriangle size={14} className="text-rose-500" />}
                          {riskLevel === 'warning' && <Zap size={14} className="text-amber-500" />}
                          <span className="font-bold text-slate-700 tracking-tight">{student.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-slate-600 font-medium">
                          {student.class}반 {student.number}번
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {gradeSource !== 'json' ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedStudentForDbDetail({ id: student.id, name: student.name, studentNumber: formatStudentNumber(student) });
                            }}
                            className={cn(
                              "px-2 py-0.5 text-xs font-bold rounded-full transition-all",
                              "hover:ring-2 hover:ring-emerald-400 hover:ring-offset-1 cursor-pointer",
                              getStudentDatabaseGrade(student.id)
                                ? "bg-emerald-100/80 text-emerald-700"
                                : getGradeColor(student.grade)
                            )}
                            title="클릭하여 DB 성적 상세 보기"
                          >
                            {formatGrade(student.grade)}
                            {getStudentDatabaseGrade(student.id) && (
                              <Info size={10} className="inline ml-1 opacity-60" />
                            )}
                          </button>
                        ) : (
                          <span className={cn(
                            "px-2 py-0.5 text-xs font-bold rounded-full",
                            getGradeColor(student.grade)
                          )}>
                            {formatGrade(student.grade)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={cn(
                          "px-2 py-0.5 text-xs font-bold rounded-full",
                          getGradeColor(student.avgEstimatedGrade)
                        )}>
                          {formatGrade(student.avgEstimatedGrade)}
                        </span>
                        <PartialAverageMark
                          covered={student.subjectGrades.filter(g => !g.excluded).length}
                          total={student.subjectGrades.length}
                          unit="과목"
                          missingLabel="예상 등급"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={cn(
                          "px-2 py-0.5 text-xs font-bold rounded-full",
                          getDifferenceColor(student.difference)
                        )}>
                          {formatGradeDelta(student.difference)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-slate-600 font-medium">
                            {student.subjectGrades.filter(g => !g.excluded).length}
                            {student.subjectGrades.some(g => g.excluded) && (
                              <span className="text-slate-400">/{student.subjectGrades.length}</span>
                            )}
                            과목
                          </span>
                          {isExpanded
                            ? <ChevronUp size={14} className="text-slate-400" />
                            : <ChevronDown size={14} className="text-slate-400" />
                          }
                        </div>
                      </td>
                    </tr>

                    {/* Expanded Detail */}
                    {isExpanded && (
                      <tr className="bg-indigo-50/30">
                        <td colSpan={6} className="px-4 py-3">
                          <SubjectBreakdown
                            subjectGrades={student.subjectGrades}
                            getSubjectCategory={getSubjectCategory}
                            minStudentsForEstimate={minStudentsForEstimate}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {sortedStudents.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-sm text-slate-400 font-medium">
              {showOnlyRisk ? '주의/위험 수준의 학생이 없습니다' : '분석할 학생이 없습니다'}
            </p>
          </div>
        )}
      </div>

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

// 과목별 예상등급 상세 정보
function SubjectBreakdown({
  subjectGrades,
  getSubjectCategory,
  minStudentsForEstimate
}: {
  subjectGrades: SubjectEstimatedGrade[];
  getSubjectCategory: (name: string) => string;
  minStudentsForEstimate: number;
}) {
  // 학기별 그룹화
  const semester1 = subjectGrades.filter(g => g.semester === 'semester1');
  const semester2 = subjectGrades.filter(g => g.semester === 'semester2');

  const renderSubjectList = (grades: SubjectEstimatedGrade[], semesterLabel: string) => {
    if (grades.length === 0) return null;

    const includedGrades = grades.filter(g => !g.excluded);
    const excludedGrades = grades.filter(g => g.excluded);

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className={cn(
            "w-1.5 h-1.5 rounded-full",
            semesterLabel === '1학기' ? "bg-blue-500" : "bg-green-500"
          )}></span>
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{semesterLabel}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* 적용되는 과목 */}
          {includedGrades.map(grade => {
            const category = getSubjectCategory(grade.subject);
            const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS['기타'];

            return (
              <div
                key={`${grade.subject}-${grade.semester}`}
                className={cn(
                  "px-2.5 py-1.5 rounded-lg border text-xs",
                  colors.badge
                )}
              >
                <div className="font-bold">{grade.subject}</div>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] opacity-80">
                  <span>순위: {grade.rank}/{grade.total}</span>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded font-bold",
                    getGradeColor(grade.estimatedGrade)
                  )}>
                    {grade.estimatedGrade}등급
                  </span>
                </div>
              </div>
            );
          })}
          {/* 제외되는 과목 — 사유별로 표시가 다르다.
              등급 미산출(교양)은 순위 자체가 의미 없으므로 순위를 감춘다. */}
          {excludedGrades.map(grade => {
            const category = getSubjectCategory(grade.subject);
            const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS['기타'];
            const noRank = grade.excludeReason === 'noRank';

            return (
              <div
                key={`${grade.subject}-${grade.semester}`}
                className={cn(
                  "px-2.5 py-1.5 rounded-lg border text-xs opacity-50",
                  colors.badge
                )}
                title={noRank
                  ? '교양 교과는 이수/미이수(P)로만 기록되어 석차등급이 산출되지 않습니다'
                  : `${minStudentsForEstimate}명 이상 수강 시 적용`}
              >
                <div className="font-bold flex items-center gap-1">
                  {grade.subject}
                  <span className="px-1 py-0.5 bg-slate-200 text-slate-500 text-[8px] rounded">
                    {noRank ? '등급 미산출' : '미적용'}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] opacity-80">
                  <span>{noRank ? `수강 ${grade.total}명` : `순위: ${grade.rank}/${grade.total}`}</span>
                  <span className="px-1.5 py-0.5 rounded font-bold bg-slate-200 text-slate-500">
                    {noRank ? 'P' : '-'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 p-3 bg-white/60 rounded-lg">
      <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
        <TrendingUp size={12} />
        과목별 예상등급 상세
        {subjectGrades.some(g => g.excludeReason === 'noRank') && (
          <span className="px-1.5 py-0.5 bg-stone-100 text-stone-600 text-[10px] rounded border border-stone-200">
            등급 미산출: 교양(이수/미이수)
          </span>
        )}
        {subjectGrades.some(g => g.excludeReason === 'minStudents') && (
          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[10px] rounded border border-slate-200">
            미적용: {minStudentsForEstimate}명 미달
          </span>
        )}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {renderSubjectList(semester1, '1학기')}
        {renderSubjectList(semester2, '2학기')}
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

  // lazy fetch 결과는 이미 regular+rank로 필터되어 있음
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
