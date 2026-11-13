/**
 * Class View Tab - 학급별 보기
 * 기존 vanilla JS classView.js와 동일한 기능 구현
 * evalog 글래스모피즘 디자인 적용
 */

import React, { useMemo, useState } from 'react';
import { Users, AlertTriangle, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCourseAnalyzeData, useCourseAnalyzeSubjects } from '../../context';
import type { Student } from '../../types/course.types';
import { usePriorYearSubjects } from '../../hooks/usePriorYearSubjects';
import { useTargetGradeFilter } from '../../hooks/useTargetGradeFilter';
import { TargetGradeFilter } from './TargetGradeFilter';
import { formatGrade } from '../../utils/gradeFormat';

// evalog 스타일 카테고리 컬러 - soft light variants
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

export function ClassViewTab() {
  const { currentStudents, currentGrade, currentAcademicYear, getEffectiveGrade, gradeSource } = useCourseAnalyzeData();
  const { subjectCategories, getSubjectCategory } = useCourseAnalyzeSubjects();
  const getGrade = (student: Student) => getEffectiveGrade(student.id);
  const [selectedClass, setSelectedClass] = useState<number | null>(null);

  // 과목 학년 분리 필터 (1학년 신청 = 2·3학년 과목 혼재 시에만 토글 노출)
  const targetGrade = useTargetGradeFilter(currentAcademicYear, currentGrade);

  // 1·2학년 국영수 5개 이상 경고. 2학년의 경우 이전 1학년 round 데이터와 합산해서 누적 카운트.
  const KOR_ENG_MATH_WARN_THRESHOLD = 5;
  const isKorEngMathWarningGrade = currentGrade === 1 || currentGrade === 2;

  // 2학년 컨텍스트일 때만 prior year(직전 학년도) 1학년 round 데이터 fetch.
  // 학생 코드(realID) → 1학년 시기 과목 Set
  const priorYear = usePriorYearSubjects(currentAcademicYear, currentGrade);

  // 학생들을 반별로 그룹화
  const classData = useMemo(() => {
    const classes = new Map<number, Student[]>();

    currentStudents.forEach(student => {
      const classNum = student.class;
      if (!classes.has(classNum)) {
        classes.set(classNum, []);
      }
      classes.get(classNum)!.push(student);
    });

    // 반 번호 순으로 정렬
    return Array.from(classes.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([classNum, students]) => ({
        classNum,
        students: students.sort((a, b) => a.number - b.number)
      }));
  }, [currentStudents]);

  // 첫 번째 반 자동 선택
  React.useEffect(() => {
    if (classData.length > 0 && selectedClass === null) {
      setSelectedClass(classData[0].classNum);
    }
  }, [classData, selectedClass]);

  // 선택된 반의 학생 목록
  const selectedClassStudents = useMemo(() => {
    if (selectedClass === null) return [];
    const classInfo = classData.find(c => c.classNum === selectedClass);
    return classInfo?.students || [];
  }, [classData, selectedClass]);

  // 중복 과목 경고가 있는 학생 수
  const studentsWithWarnings = useMemo(() => {
    return selectedClassStudents.filter(student =>
      hasDuplicateSubjects(student)
    ).length;
  }, [selectedClassStudents]);

  // 1·2학년 국영수 5+ 경고 학생 수 (2학년은 prior year 과목 포함)
  const studentsWithKorEngMathOverload = useMemo(() => {
    if (!isKorEngMathWarningGrade) return 0;
    return selectedClassStudents.filter(student => {
      const prior = priorYear.map.get(String(student.id));
      const { total } = getKorEngMathCounts(student, subjectCategories, prior);
      return total >= KOR_ENG_MATH_WARN_THRESHOLD;
    }).length;
  }, [selectedClassStudents, subjectCategories, isKorEngMathWarningGrade, priorYear.map]);

  if (classData.length === 0) {
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
      {/* Section Header - evalog 스타일 */}
      <div className="flex items-start gap-3 pb-4 border-b border-slate-100/50">
        <div className="p-2 rounded-xl bg-brand-50 text-brand-600 shrink-0">
          <Users size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-slate-800 tracking-tight">반별 보기</h3>
          <p className="text-sm text-slate-500 font-medium mt-0.5">
            학급별로 학생들의 과목 선택 현황을 확인합니다
          </p>
        </div>
      </div>

      {/* Class Selection Badges - evalog 스타일 */}
      <div className="flex flex-wrap gap-2">
        {classData.map(({ classNum, students }) => (
          <button
            key={classNum}
            onClick={() => setSelectedClass(classNum)}
            className={cn(
              "px-4 py-2 rounded-full text-sm font-bold transition-all duration-200",
              selectedClass === classNum
                ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-sm"
                : "bg-white/60 hover:bg-white/80 text-slate-600 hover:text-slate-800 border border-white/40 hover:border-brand-100/50"
            )}
          >
            {classNum}반
            <span className={cn(
              "ml-1.5 text-xs font-medium",
              selectedClass === classNum ? "text-white/80" : "text-slate-400"
            )}>
              ({students.length}명)
            </span>
          </button>
        ))}
      </div>

      {/* 과목 학년 분리 토글 — 표의 선택과목 뱃지를 해당 학년 과목만 보이도록 필터.
          국·영·수 누적 카운트/경고는 학년 전체 합산이 목적이므로 필터와 무관하게 유지. */}
      {targetGrade.hasMultiple && (
        <TargetGradeFilter
          targetGrades={targetGrade.targetGrades}
          selected={targetGrade.selected}
          onChange={targetGrade.setSelected}
        />
      )}

      {/* Selected Class Student Table */}
      {selectedClass !== null && selectedClassStudents.length > 0 && (
        <div className="space-y-3">
          {/* Table Header */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <GraduationCap size={16} className="text-slate-400" />
              <h4 className="font-bold text-slate-700 tracking-tight">
                {selectedClass}반 학생 목록
              </h4>
              <span className="px-2 py-0.5 text-xs font-bold bg-brand-50 text-brand-600 rounded-full">
                {selectedClassStudents.length}명
              </span>
            </div>
            <div className="flex items-center gap-2">
              {studentsWithWarnings > 0 && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-amber-600 bg-amber-50/80 rounded-full border border-amber-200/60">
                  <AlertTriangle size={12} />
                  {studentsWithWarnings}명 중복 선택
                </span>
              )}
              {studentsWithKorEngMathOverload > 0 && (
                <span
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-rose-600 bg-rose-50/80 rounded-full border border-rose-200/60"
                  title={
                    currentGrade === 2
                      ? `2학년 현재 + 1학년(${priorYear.priorAcademicYear ?? '?'}/round ${priorYear.priorRoundNumber ?? '?'}) 누적 국·영·수 합계가 ${KOR_ENG_MATH_WARN_THRESHOLD}과목 이상`
                      : `${currentGrade}학년 1년치 국·영·수 합계가 ${KOR_ENG_MATH_WARN_THRESHOLD}과목 이상`
                  }
                >
                  <AlertTriangle size={12} />
                  {studentsWithKorEngMathOverload}명 국영수 {KOR_ENG_MATH_WARN_THRESHOLD}+
                </span>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white/60 backdrop-blur-sm rounded-xl border border-white/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/60">
                    <th className="px-4 py-3 text-left font-bold text-slate-600 tracking-tight whitespace-nowrap">
                      학생명
                    </th>
                    <th className="px-4 py-3 text-center font-bold text-slate-600 tracking-tight w-16">
                      등급
                    </th>
                    <th className="px-4 py-3 text-left font-bold text-slate-600 tracking-tight">
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                        1학기 선택과목
                      </span>
                    </th>
                    <th className="px-4 py-3 text-left font-bold text-slate-600 tracking-tight">
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                        2학기 선택과목
                      </span>
                    </th>
                    {priorYear.map.size > 0 && (
                      <th className="px-4 py-3 text-left font-bold text-slate-600 tracking-tight">
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                          2학년 국·영·수
                          <span className="text-[10px] font-normal text-slate-400">
                            ({priorYear.priorAcademicYear}/round {priorYear.priorRoundNumber})
                          </span>
                        </span>
                      </th>
                    )}
                    <th className="px-4 py-3 text-center font-bold text-slate-600 tracking-tight">
                      국영수
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/60">
                  {selectedClassStudents.map((student, idx) => (
                    <StudentTableRow
                      key={`${student.id}-${idx}`}
                      student={student}
                      index={idx}
                      getSubjectCategory={getSubjectCategory}
                      subjectCategories={subjectCategories}
                      getGrade={getGrade}
                      showKorEngMathWarning={isKorEngMathWarningGrade}
                      korEngMathWarnThreshold={KOR_ENG_MATH_WARN_THRESHOLD}
                      priorSubjects={priorYear.map.get(String(student.id))}
                      showPriorColumn={priorYear.map.size > 0}
                      matchesTargetGrade={targetGrade.matches}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 중복 과목 확인
function hasDuplicateSubjects(student: Student): boolean {
  return student.semester1.some(subject => student.semester2.includes(subject));
}

// 중복 과목 목록
function getDuplicateSubjects(student: Student): string[] {
  return student.semester1.filter(subject => student.semester2.includes(subject));
}

// 국영수 과목 카운트 계산
// priorSubjects 가 주어지면 (2학년 컨텍스트의 이전 1학년 과목) 합집합 후 dedupe 카운트.
function getKorEngMathCounts(
  student: Student,
  subjectCategories: Record<string, string[]>,
  priorSubjects?: Set<string>
): { korean: number; english: number; math: number; total: number } {
  const counts = { korean: 0, english: 0, math: 0, total: 0 };

  // 현재 학년의 1·2학기 과목 + (있다면) 이전 학년 과목까지 합집합 + 중복 제거
  const allSubjects = new Set<string>([
    ...student.semester1,
    ...student.semester2,
    ...(priorSubjects ?? []),
  ]);

  allSubjects.forEach(subject => {
    if (subjectCategories['국어']?.includes(subject)) {
      counts.korean++;
    } else if (subjectCategories['영어']?.includes(subject)) {
      counts.english++;
    } else if (subjectCategories['수학']?.includes(subject)) {
      counts.math++;
    }
  });

  counts.total = counts.korean + counts.english + counts.math;
  return counts;
}

// 학생 테이블 행 - evalog 스타일
function StudentTableRow({
  student,
  index,
  getSubjectCategory,
  subjectCategories,
  getGrade,
  showKorEngMathWarning,
  korEngMathWarnThreshold,
  priorSubjects,
  showPriorColumn,
  matchesTargetGrade
}: {
  student: Student;
  index: number;
  getSubjectCategory: (name: string) => string;
  subjectCategories: Record<string, string[]>;
  getGrade: (student: Student) => number;
  showKorEngMathWarning: boolean;
  korEngMathWarnThreshold: number;
  priorSubjects?: Set<string>;
  showPriorColumn?: boolean;
  matchesTargetGrade: (subject: string) => boolean;
}) {
  const hasDuplicate = hasDuplicateSubjects(student);
  const duplicates = getDuplicateSubjects(student);
  // 표시용 과목 목록은 과목 학년 필터를 통과한 것만 (단일 학년 라운드면 전부 통과)
  const visibleSem1 = student.semester1.filter(matchesTargetGrade);
  const visibleSem2 = student.semester2.filter(matchesTargetGrade);
  const counts = getKorEngMathCounts(student, subjectCategories, priorSubjects);
  const isKorEngMathOverload = showKorEngMathWarning && counts.total >= korEngMathWarnThreshold;

  // 이전 학년 누적 카운트에 기여한 국·영·수 과목만 추출 (전체 prior 과목 중 국영수만)
  const priorKorEngMathSubjects = useMemo(() => {
    if (!priorSubjects || priorSubjects.size === 0) return [] as string[];
    const kemCats = ['국어', '영어', '수학'];
    const result: string[] = [];
    priorSubjects.forEach(s => {
      for (const cat of kemCats) {
        if (subjectCategories[cat]?.includes(s)) {
          result.push(s);
          return;
        }
      }
    });
    return result.sort((a, b) => {
      // 국어 → 영어 → 수학 순으로 묶이도록
      const catOrder = (sub: string) =>
        subjectCategories['국어']?.includes(sub) ? 0
        : subjectCategories['영어']?.includes(sub) ? 1
        : 2;
      return catOrder(a) - catOrder(b) || a.localeCompare(b, 'ko');
    });
  }, [priorSubjects, subjectCategories]);

  return (
    <tr className={cn(
      "group transition-colors",
      index % 2 === 0 ? "bg-white/50" : "bg-slate-50/30",
      "hover:bg-brand-50/30"
    )}>
      {/* 학생명 */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-slate-100/80 group-hover:bg-brand-100 flex items-center justify-center text-xs font-bold text-slate-500 group-hover:text-brand-600 transition-colors shrink-0">
            {student.number}
          </div>
          <span className="font-bold text-slate-700 tracking-tight">{student.name}</span>
          {hasDuplicate && (
            <span
              className="text-amber-500 cursor-help"
              title={`중복 과목: ${duplicates.join(', ')}`}
            >
              <AlertTriangle size={14} />
            </span>
          )}
        </div>
      </td>

      {/* 등급 */}
      <td className="px-4 py-3 text-center">
        {getGrade(student) > 0 ? (
          <span className="px-2 py-0.5 text-xs font-bold bg-slate-100/80 text-slate-600 rounded-full">
            {formatGrade(getGrade(student))}
          </span>
        ) : (
          <span className="text-slate-400">-</span>
        )}
      </td>

      {/* 1학기 선택과목 */}
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {visibleSem1.length > 0 ? (
            visibleSem1.map(subject => (
              <SubjectBadge
                key={subject}
                subject={subject}
                category={getSubjectCategory(subject)}
                isDuplicate={duplicates.includes(subject)}
              />
            ))
          ) : (
            <span className="text-xs text-slate-400">없음</span>
          )}
        </div>
      </td>

      {/* 2학기 선택과목 */}
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {visibleSem2.length > 0 ? (
            visibleSem2.map(subject => (
              <SubjectBadge
                key={subject}
                subject={subject}
                category={getSubjectCategory(subject)}
                isDuplicate={duplicates.includes(subject)}
              />
            ))
          ) : (
            <span className="text-xs text-slate-400">없음</span>
          )}
        </div>
      </td>

      {/* 이전 학년 국·영·수 (priorYear 자료가 있을 때만) */}
      {showPriorColumn && (
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {priorKorEngMathSubjects.length > 0 ? (
              priorKorEngMathSubjects.map(subject => (
                <PriorSubjectBadge
                  key={subject}
                  subject={subject}
                  category={getSubjectCategory(subject)}
                />
              ))
            ) : (
              <span className="text-xs text-slate-400">없음</span>
            )}
          </div>
        </td>
      )}

      {/* 국영수 과목 수 */}
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1 justify-center">
          {counts.korean > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-bold bg-violet-500 text-white rounded">
              국{counts.korean}
            </span>
          )}
          {counts.english > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-bold bg-blue-500 text-white rounded">
              영{counts.english}
            </span>
          )}
          {counts.math > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-bold bg-emerald-500 text-white rounded">
              수{counts.math}
            </span>
          )}
          {counts.total > 0 && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-bold text-white rounded",
                isKorEngMathOverload
                  ? "bg-rose-500 ring-2 ring-rose-300 ring-offset-1"
                  : "bg-slate-400"
              )}
              title={isKorEngMathOverload
                ? `국·영·수 합계 ${counts.total}과목 (${korEngMathWarnThreshold}+ 과부하 경고)${priorSubjects && priorSubjects.size > 0 ? ' — 이전 학년 누적 포함' : ''}`
                : undefined}
            >
              {isKorEngMathOverload && <AlertTriangle size={10} />}
              Σ{counts.total}
            </span>
          )}
          {counts.total === 0 && (
            <span className="text-xs text-slate-400">-</span>
          )}
        </div>
      </td>
    </tr>
  );
}

// 과목 뱃지 - evalog 스타일
function SubjectBadge({
  subject,
  category,
  isDuplicate
}: {
  subject: string;
  category: string;
  isDuplicate?: boolean;
}) {
  const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS['기타'];

  return (
    <span
      className={cn(
        "px-2 py-0.5 text-xs font-medium rounded-full border transition-all",
        colors.badge,
        isDuplicate && "ring-2 ring-amber-400 ring-offset-1"
      )}
    >
      {subject}
    </span>
  );
}

// 이전 학년 과목 뱃지 - 현재 학년 과목과 시각적으로 구별 (점선 테두리 + opacity)
function PriorSubjectBadge({
  subject,
  category
}: {
  subject: string;
  category: string;
}) {
  const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS['기타'];

  return (
    <span
      className={cn(
        "px-2 py-0.5 text-xs font-medium rounded-full border border-dashed opacity-70 transition-all",
        colors.badge
      )}
      title="이전 학년에서 수강한 과목"
    >
      {subject}
    </span>
  );
}
