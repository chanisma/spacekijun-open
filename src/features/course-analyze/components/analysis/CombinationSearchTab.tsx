/**
 * Combination Search Tab - 과목 조합 검색
 * 특정 과목 조합을 선택한 학생들을 검색
 * evalog 글래스모피즘 디자인 적용
 */

import React, { useState, useMemo } from 'react';
import { Search, RotateCcw, CheckCircle2, XCircle, Users, GraduationCap, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { findSubjectCategory } from '../../utils/subjectUtils';
import { useCourseAnalyzeData, useCourseAnalyzeSubjects } from '../../context';
import { useTargetGradeFilter } from '../../hooks/useTargetGradeFilter';
import type { Student } from '../../types/course.types';
import { AnalysisPageHeader } from '../common/AnalysisPageHeader';
import { TargetGradeFilter } from './TargetGradeFilter';
import { formatGrade } from '../../utils/gradeFormat';
import { PartialAverageMark } from '../common/PartialAverageMark';

// evalog 스타일 카테고리 컬러 - soft light variants with color dots
const CATEGORY_COLORS: Record<string, { badge: string; dot: string; selected: string; excluded: string }> = {
  '국어': {
    badge: 'bg-violet-50/80 text-violet-700 border-violet-200/60',
    dot: 'bg-violet-400',
    selected: 'bg-violet-500 text-white border-violet-600 shadow-sm',
    excluded: 'bg-rose-500 text-white border-rose-600 shadow-sm line-through'
  },
  '영어': {
    badge: 'bg-blue-50/80 text-blue-700 border-blue-200/60',
    dot: 'bg-blue-400',
    selected: 'bg-blue-500 text-white border-blue-600 shadow-sm',
    excluded: 'bg-rose-500 text-white border-rose-600 shadow-sm line-through'
  },
  '수학': {
    badge: 'bg-emerald-50/80 text-emerald-700 border-emerald-200/60',
    dot: 'bg-emerald-400',
    selected: 'bg-emerald-500 text-white border-emerald-600 shadow-sm',
    excluded: 'bg-rose-500 text-white border-rose-600 shadow-sm line-through'
  },
  '역사': {
    badge: 'bg-amber-50/80 text-amber-700 border-amber-200/60',
    dot: 'bg-amber-400',
    selected: 'bg-amber-500 text-white border-amber-600 shadow-sm',
    excluded: 'bg-rose-500 text-white border-rose-600 shadow-sm line-through'
  },
  '사회': {
    badge: 'bg-purple-50/80 text-purple-700 border-purple-200/60',
    dot: 'bg-purple-400',
    selected: 'bg-purple-500 text-white border-purple-600 shadow-sm',
    excluded: 'bg-rose-500 text-white border-rose-600 shadow-sm line-through'
  },
  '물리': {
    badge: 'bg-orange-50/80 text-orange-700 border-orange-200/60',
    dot: 'bg-orange-400',
    selected: 'bg-orange-500 text-white border-orange-600 shadow-sm',
    excluded: 'bg-rose-500 text-white border-rose-600 shadow-sm line-through'
  },
  '화학': {
    badge: 'bg-pink-50/80 text-pink-700 border-pink-200/60',
    dot: 'bg-pink-400',
    selected: 'bg-pink-500 text-white border-pink-600 shadow-sm',
    excluded: 'bg-rose-500 text-white border-rose-600 shadow-sm line-through'
  },
  '생명': {
    badge: 'bg-teal-50/80 text-teal-700 border-teal-200/60',
    dot: 'bg-teal-400',
    selected: 'bg-teal-500 text-white border-teal-600 shadow-sm',
    excluded: 'bg-rose-500 text-white border-rose-600 shadow-sm line-through'
  },
  '지구과학': {
    badge: 'bg-cyan-50/80 text-cyan-700 border-cyan-200/60',
    dot: 'bg-cyan-400',
    selected: 'bg-cyan-500 text-white border-cyan-600 shadow-sm',
    excluded: 'bg-rose-500 text-white border-rose-600 shadow-sm line-through'
  },
  '기타': {
    badge: 'bg-slate-50/80 text-slate-600 border-slate-200/60',
    dot: 'bg-slate-400',
    selected: 'bg-slate-500 text-white border-slate-600 shadow-sm',
    excluded: 'bg-rose-500 text-white border-rose-600 shadow-sm line-through'
  },
};

interface SubjectSelection {
  name: string;
  semester: 'semester1' | 'semester2';
  state: 'none' | 'selected' | 'excluded';
}

export function CombinationSearchTab() {
  const { currentStudents, getEffectiveGrade, gradeSource, currentGrade, currentAcademicYear } = useCourseAnalyzeData();
  const { subjectCategories, categoryOrder } = useCourseAnalyzeSubjects();
  const getGrade = (student: Student) => getEffectiveGrade(student.id);

  // 과목 학년 분리 필터 (1학년 신청 = 2·3학년 과목 혼재 시에만 토글 노출)
  const targetGrade = useTargetGradeFilter(currentAcademicYear, currentGrade);

  // Get all unique subjects from students with semester info
  const allSubjects = useMemo(() => {
    const subjectMap = new Map<string, SubjectSelection>();

    currentStudents.forEach(student => {
      student.semester1.forEach(name => {
        const key = `${name}-semester1`;
        if (!subjectMap.has(key)) {
          subjectMap.set(key, { name, semester: 'semester1', state: 'none' });
        }
      });
      student.semester2.forEach(name => {
        const key = `${name}-semester2`;
        if (!subjectMap.has(key)) {
          subjectMap.set(key, { name, semester: 'semester2', state: 'none' });
        }
      });
    });

    return Array.from(subjectMap.values());
  }, [currentStudents]);

  const [selections, setSelections] = useState<Map<string, 'none' | 'selected' | 'excluded'>>(new Map());

  // Toggle subject state: none -> selected -> excluded -> none
  const toggleSubject = (name: string, semester: 'semester1' | 'semester2') => {
    const key = `${name}-${semester}`;
    const current = selections.get(key) || 'none';
    const next = current === 'none' ? 'selected' : current === 'selected' ? 'excluded' : 'none';

    const newSelections = new Map(selections);
    if (next === 'none') {
      newSelections.delete(key);
    } else {
      newSelections.set(key, next);
    }
    setSelections(newSelections);
  };

  const clearSelections = () => {
    setSelections(new Map());
  };

  // Get selected and excluded subjects
  const { selectedSubjects, excludedSubjects } = useMemo(() => {
    const selected: { name: string; semester: 'semester1' | 'semester2' }[] = [];
    const excluded: { name: string; semester: 'semester1' | 'semester2' }[] = [];

    selections.forEach((state, key) => {
      const [name, semester] = key.split('-semester') as [string, '1' | '2'];
      const sem = `semester${semester}` as 'semester1' | 'semester2';

      if (state === 'selected') {
        selected.push({ name, semester: sem });
      } else if (state === 'excluded') {
        excluded.push({ name, semester: sem });
      }
    });

    return { selectedSubjects: selected, excludedSubjects: excluded };
  }, [selections]);

  // Filter students based on selections
  const filteredStudents = useMemo(() => {
    if (selectedSubjects.length === 0 && excludedSubjects.length === 0) {
      return [];
    }

    return currentStudents.filter(student => {
      // Must have ALL selected subjects
      const hasSelected = selectedSubjects.every(({ name, semester }) =>
        student[semester].includes(name)
      );

      // Must NOT have ANY excluded subjects
      const hasNoExcluded = excludedSubjects.every(({ name, semester }) =>
        !student[semester].includes(name)
      );

      return hasSelected && hasNoExcluded;
    });
  }, [currentStudents, selectedSubjects, excludedSubjects]);

  // 조합에 걸린 학생들의 평균 등급.
  // 성적이 없는 학생은 등급 0으로 오는데, 종전에는 그 0이 분자에 그대로 더해지면서
  // 분모(전체 인원)에도 남아 평균을 실제보다 **좋게(작게)** 끌어내렸다.
  // 분자·분모에서 함께 빼고, 빠진 인원은 화면에서 '부분' 표식으로 밝힌다.
  const gradeSummary = useMemo(() => {
    const graded = filteredStudents
      .map(s => getGrade(s) || 0)
      .filter(g => g > 0);
    return {
      average: graded.length > 0 ? graded.reduce((sum, g) => sum + g, 0) / graded.length : 0,
      gradedCount: graded.length,
    };
  }, [filteredStudents, gradeSource, getEffectiveGrade]);

  // Group subjects by category and semester (과목 학년 필터 적용)
  const semester1Subjects = allSubjects.filter(s => s.semester === 'semester1' && targetGrade.matches(s.name));
  const semester2Subjects = allSubjects.filter(s => s.semester === 'semester2' && targetGrade.matches(s.name));

  // Sort subjects by category order
  const sortByCategory = (subjects: SubjectSelection[]) => {
    return [...subjects].sort((a, b) => {
      const catA = getCategory(a.name);
      const catB = getCategory(b.name);
      const orderA = categoryOrder.indexOf(catA);
      const orderB = categoryOrder.indexOf(catB);
      return orderA - orderB;
    });
  };

  const getCategory = (subjectName: string): string => {
    return findSubjectCategory(subjectName, subjectCategories) ?? '기타';
  };

  return (
    <div className="glass-panel p-6 space-y-6">
      <AnalysisPageHeader
        icon={Search}
        title="조합 검색"
        description="특정 과목 조합을 선택한 학생들을 검색합니다"
        rightContent={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                1클릭: 선택
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                2클릭: 제외
              </span>
            </div>
            {selections.size > 0 && (
              <button
                onClick={clearSelections}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 bg-slate-50/80 hover:bg-slate-100/80 rounded-lg border border-slate-200/60 transition-colors"
              >
                <RotateCcw size={12} />
                초기화
              </button>
            )}
          </div>
        }
      />

      {/* 과목 학년 분리 토글 — 2·3학년 과목이 함께 있는 라운드(예: 1학년 신청)에서만 노출.
          선택은 학년 간 유지되므로 "2학년 X + 3학년 Y" 교차 조합 검색도 가능하다. */}
      {targetGrade.hasMultiple && (
        <TargetGradeFilter
          targetGrades={targetGrade.targetGrades}
          selected={targetGrade.selected}
          onChange={targetGrade.setSelected}
        />
      )}

      {/* Subject Selection Grid - 2열 학기 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Semester 1 */}
        <SemesterCard
          title="1학기"
          semester="semester1"
          colorTheme="blue"
          subjects={sortByCategory(semester1Subjects)}
          selections={selections}
          getCategory={getCategory}
          toggleSubject={toggleSubject}
        />

        {/* Semester 2 */}
        <SemesterCard
          title="2학기"
          semester="semester2"
          colorTheme="green"
          subjects={sortByCategory(semester2Subjects)}
          selections={selections}
          getCategory={getCategory}
          toggleSubject={toggleSubject}
        />
      </div>

      {/* Results Section */}
      {(selectedSubjects.length > 0 || excludedSubjects.length > 0) && (
        <div className="space-y-4 pt-4 border-t border-slate-100/50">
          {/* Selection Summary - evalog 스타일 */}
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-slate-50/80 backdrop-blur-sm rounded-xl border border-slate-100/60">
            {selectedSubjects.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-xs font-bold text-emerald-600">
                  <CheckCircle2 size={14} />
                  선택:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedSubjects.map(s => (
                    <span
                      key={`${s.name}-${s.semester}`}
                      className="px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-600 rounded-full border border-emerald-200/60"
                    >
                      {s.name}
                      <span className="text-emerald-400 ml-0.5">
                        ({s.semester === 'semester1' ? '1' : '2'})
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {excludedSubjects.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-xs font-bold text-rose-600">
                  <XCircle size={14} />
                  제외:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {excludedSubjects.map(s => (
                    <span
                      key={`${s.name}-${s.semester}`}
                      className="px-2 py-0.5 text-xs font-medium bg-rose-50 text-rose-600 rounded-full border border-rose-200/60 line-through"
                    >
                      {s.name}
                      <span className="text-rose-400 ml-0.5">
                        ({s.semester === 'semester1' ? '1' : '2'})
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Results Header - evalog 타이포그래피 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-slate-400" />
              <h4 className="font-bold text-slate-700 tracking-tight">검색 결과</h4>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-baseline gap-1 text-sm">
                <span className="font-bold text-brand-600">{filteredStudents.length}</span>
                <span className="text-slate-400 text-xs">명</span>
              </span>
              {gradeSummary.average > 0 && (
                <span className="px-2.5 py-1 text-xs font-medium bg-slate-100/80 text-slate-600 rounded-lg border border-slate-200/60">
                  평균 {formatGrade(gradeSummary.average)}등급
                  <PartialAverageMark
                    covered={gradeSummary.gradedCount}
                    total={filteredStudents.length}
                  />
                </span>
              )}
            </div>
          </div>

          {/* Student Cards - evalog 리스트 스타일 */}
          {filteredStudents.length === 0 ? (
            <div className="py-10 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100/80 flex items-center justify-center">
                <GraduationCap className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-sm text-slate-500 font-medium">
                해당하는 학생이 없습니다
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredStudents.map((student, index) => (
                <StudentCard
                  key={`${student.class}-${student.number}`}
                  student={student}
                  index={index}
                  getCategory={getCategory}
                  getGrade={getGrade}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty State - 선택 전 */}
      {selections.size === 0 && (
        <div className="py-8 text-center">
          <p className="text-sm text-slate-400 font-medium">
            위 과목을 클릭하여 검색 조건을 설정하세요
          </p>
        </div>
      )}
    </div>
  );
}

// Semester Card Component - evalog 글래스 카드 스타일
function SemesterCard({
  title,
  semester,
  colorTheme,
  subjects,
  selections,
  getCategory,
  toggleSubject
}: {
  title: string;
  semester: 'semester1' | 'semester2';
  colorTheme: 'blue' | 'green';
  subjects: SubjectSelection[];
  selections: Map<string, 'none' | 'selected' | 'excluded'>;
  getCategory: (name: string) => string;
  toggleSubject: (name: string, semester: 'semester1' | 'semester2') => void;
}) {
  const themeColors = {
    blue: {
      header: 'bg-blue-50/80 border-blue-100/60',
      dot: 'bg-blue-500',
      title: 'text-blue-700',
      count: 'text-blue-600'
    },
    green: {
      header: 'bg-green-50/80 border-green-100/60',
      dot: 'bg-green-500',
      title: 'text-green-700',
      count: 'text-green-600'
    }
  };

  const theme = themeColors[colorTheme];
  const selectedCount = subjects.filter(s => selections.get(`${s.name}-${semester}`) === 'selected').length;
  const excludedCount = subjects.filter(s => selections.get(`${s.name}-${semester}`) === 'excluded').length;

  return (
    <div className="bg-white/60 backdrop-blur-sm rounded-xl border border-white/40 overflow-hidden transition-all duration-200 hover:shadow-sm hover:border-slate-200/60">
      {/* Card Header */}
      <div className={cn("px-4 py-3 border-b", theme.header)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn("w-2 h-2 rounded-full", theme.dot)}></span>
            <h4 className={cn("text-sm font-bold tracking-tight", theme.title)}>{title}</h4>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">{subjects.length}개</span>
            {(selectedCount > 0 || excludedCount > 0) && (
              <span className="flex items-center gap-1.5">
                {selectedCount > 0 && (
                  <span className="text-emerald-600 font-medium">+{selectedCount}</span>
                )}
                {excludedCount > 0 && (
                  <span className="text-rose-600 font-medium">-{excludedCount}</span>
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Subjects Grid */}
      <div className="p-4">
        <div className="flex flex-wrap gap-1.5">
          {subjects.map(subject => {
            const key = `${subject.name}-${semester}`;
            const state = selections.get(key) || 'none';
            const category = getCategory(subject.name);

            return (
              <SubjectBadge
                key={key}
                name={subject.name}
                category={category}
                state={state}
                onClick={() => toggleSubject(subject.name, semester)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Subject Badge Component - evalog 소프트 뱃지 스타일
function SubjectBadge({
  name,
  category,
  state,
  onClick
}: {
  name: string;
  category: string;
  state: 'none' | 'selected' | 'excluded';
  onClick: () => void;
}) {
  const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS['기타'];

  const getStateClass = () => {
    if (state === 'selected') return colors.selected;
    if (state === 'excluded') return colors.excluded;
    return colors.badge;
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 text-xs font-medium rounded-full border transition-all duration-150",
        "hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20",
        getStateClass()
      )}
    >
      {state === 'none' && (
        <span className={cn("inline-block w-1.5 h-1.5 rounded-full mr-1.5", colors.dot)}></span>
      )}
      {name}
    </button>
  );
}

// Student Card Component - evalog 리스트 아이템 스타일
function StudentCard({
  student,
  index,
  getCategory,
  getGrade
}: {
  student: Student;
  index: number;
  getCategory: (name: string) => string;
  getGrade: (student: Student) => number;
}) {
  return (
    <div className="group bg-white/50 hover:bg-white/80 rounded-lg border border-white/40 hover:border-brand-100/50 hover:shadow-sm transition-all duration-200 p-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        {/* 순번 */}
        <div className="w-6 h-6 rounded-full bg-slate-100/80 group-hover:bg-brand-100 flex items-center justify-center text-xs font-bold text-slate-500 group-hover:text-brand-600 transition-colors shrink-0">
          {index + 1}
        </div>

        {/* 학생 정보 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold text-slate-800 tracking-tight truncate">
              {student.name}
            </span>
            <span className="text-xs font-medium font-mono text-slate-400">
              {student.class}-{student.number}
            </span>
          </div>
        </div>

        {/* 등급 뱃지 */}
        {getGrade(student) > 0 && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50/80 border border-slate-100/60 shrink-0">
            <BookOpen size={12} className="text-slate-400" />
            <span className="text-xs font-bold text-slate-600">{formatGrade(getGrade(student))}</span>
          </div>
        )}
      </div>

      {/* Subjects - 2열 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* 1학기 */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">1학기</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {student.semester1.length > 0 ? (
              student.semester1.map(subject => (
                <span
                  key={subject}
                  className="px-2 py-0.5 text-xs font-medium bg-blue-50/80 text-blue-600 rounded-full border border-blue-100/60"
                >
                  {subject}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-400">없음</span>
            )}
          </div>
        </div>

        {/* 2학기 */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">2학기</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {student.semester2.length > 0 ? (
              student.semester2.map(subject => (
                <span
                  key={subject}
                  className="px-2 py-0.5 text-xs font-medium bg-green-50/80 text-green-600 rounded-full border border-green-100/60"
                >
                  {subject}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-400">없음</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
