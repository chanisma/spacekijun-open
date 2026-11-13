/**
 * Subject Count Tab - 과목별 선택 현황
 * evalog 글래스모피즘 디자인 시스템 적용 (균형 개선 버전)
 */

import React, { useMemo, useState, useCallback } from 'react';
import { BookOpen, BarChart3, TrendingUp, TrendingDown, Minus, Info, X, Download, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';
import { useCourseAnalyzeData, useCourseAnalyzeSubjects } from '../../context';
import { useSubjectTargetGradeMap } from '../../hooks/useSubjectTargetGradeMap';
import type { Student } from '../../types/course.types';
import { toDbGradeCategory } from '../../utils/gradeMapping';
import { AnalysisPageHeader } from '../common/AnalysisPageHeader';
import { formatGrade } from '../../utils/gradeFormat';
import { PartialAverageMark } from '../common/PartialAverageMark';
import { makeTargetGradeLookup, orderByCategoryThenTargetGrade } from '../../utils/subjectTargetGradeOrder';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Category colors - 밝은 톤으로 조정 (균형 개선)
const CATEGORY_COLORS: Record<string, { badge: string; dot: string }> = {
  '국어': { badge: 'bg-violet-50 text-violet-700 border-violet-200/60', dot: 'bg-violet-400' },
  '영어': { badge: 'bg-blue-50 text-blue-700 border-blue-200/60', dot: 'bg-blue-400' },
  '수학': { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200/60', dot: 'bg-emerald-400' },
  '역사': { badge: 'bg-amber-50 text-amber-700 border-amber-200/60', dot: 'bg-amber-400' },
  '사회': { badge: 'bg-teal-50 text-teal-700 border-teal-200/60', dot: 'bg-teal-400' },
  '물리': { badge: 'bg-rose-50 text-rose-700 border-rose-200/60', dot: 'bg-rose-400' },
  '화학': { badge: 'bg-purple-50 text-purple-700 border-purple-200/60', dot: 'bg-purple-400' },
  '생명': { badge: 'bg-green-50 text-green-700 border-green-200/60', dot: 'bg-green-400' },
  '지구과학': { badge: 'bg-cyan-50 text-cyan-700 border-cyan-200/60', dot: 'bg-cyan-400' },
  '과학기타': { badge: 'bg-sky-50 text-sky-700 border-sky-200/60', dot: 'bg-sky-400' },
  '외국어': { badge: 'bg-rose-50 text-rose-700 border-rose-200/60', dot: 'bg-rose-400' },
  '기술가정정보': { badge: 'bg-lime-50 text-lime-700 border-lime-200/60', dot: 'bg-lime-400' },
  '교양': { badge: 'bg-stone-50 text-stone-600 border-stone-200/60', dot: 'bg-stone-400' },
  '기타': { badge: 'bg-slate-50 text-slate-600 border-slate-200/60', dot: 'bg-slate-400' },
};

export function SubjectCountTab() {
  const { currentStudents, getEffectiveGrade, getStudentDatabaseGrade, gradeSource, currentGrade, currentAcademicYear } = useCourseAnalyzeData();
  const { subjectCounts, getSubjectCategory } = useCourseAnalyzeSubjects();

  // 카테고리 → DB 등급 키 변환은 utils/gradeMapping의 toDbGradeCategory 단일 출처를 쓴다

  const getStudentGradeForSubject = useCallback((student: Student, subject: string): number => {
    if (gradeSource === 'json') return getEffectiveGrade(student.id);
    const dbGrade = getStudentDatabaseGrade(student.id);
    // Defense against cross-cohort mismapping: only use DB grade if it actually belongs to this student
    if (dbGrade && dbGrade.studentCode === String(student.id) && dbGrade.subjectGroupGrades) {
      const category = getSubjectCategory(subject);
      const dbCategory = toDbGradeCategory(category);
      const categoryGrade = dbGrade.subjectGroupGrades[dbCategory];
      if (categoryGrade && categoryGrade > 0) return categoryGrade;
    }
    if (dbGrade && dbGrade.studentCode === String(student.id)) {
      return dbGrade.overallGrade || 0;
    }
    // No matching DB grade for this exact student → no grade
    return 0;
  }, [gradeSource, getEffectiveGrade, getStudentDatabaseGrade, getSubjectCategory]);

  // 학생 목록용: 과목군 등급과 전체 평균 등급을 따로 돌려준다.
  // 위 getStudentGradeForSubject 는 과목군 등급이 없으면 전체 등급으로 폴백해 둘을 구분할 수 없다
  // (평균 집계에는 그 폴백이 맞지만, 목록에서는 무엇을 보고 있는지 알아야 한다).
  const getStudentGradePair = useCallback((student: Student, subject: string): { category: number; overall: number } => {
    if (gradeSource === 'json') return { category: 0, overall: getEffectiveGrade(student.id) || 0 };
    const dbGrade = getStudentDatabaseGrade(student.id);
    if (!dbGrade || dbGrade.studentCode !== String(student.id)) return { category: 0, overall: 0 };
    const categoryGrade = dbGrade.subjectGroupGrades?.[toDbGradeCategory(getSubjectCategory(subject))];
    return {
      category: categoryGrade && categoryGrade > 0 ? categoryGrade : 0,
      overall: dbGrade.overallGrade || 0,
    };
  }, [gradeSource, getEffectiveGrade, getStudentDatabaseGrade, getSubjectCategory]);

  const [selectedCell, setSelectedCell] = useState<{
    subject: string;
    semester: 'semester1' | 'semester2';
    students: Student[];
  } | null>(null);

  // Target grade filtering (e.g. 1학년 students selecting both 2학년 and 3학년 subjects)
  const { data: targetGradeData } = useSubjectTargetGradeMap(currentAcademicYear, currentGrade);
  const hasMultipleTargetGrades = (targetGradeData?.targetGrades.length ?? 0) > 1;
  const [selectedTargetGrade, setSelectedTargetGrade] = useState<number | null>(null);

  const targetGradeOf = useMemo(
    () => makeTargetGradeLookup(targetGradeData?.map ?? {}),
    [targetGradeData],
  );

  const filteredSubjectCounts = useMemo(() => {
    if (!hasMultipleTargetGrades) return subjectCounts;
    if (selectedTargetGrade === null) {
      // 전체 보기: 과목군 순서는 유지하고 과목군 안에서 2학년 → 3학년 과목 순으로
      return orderByCategoryThenTargetGrade(subjectCounts, targetGradeOf);
    }
    return subjectCounts.filter((item) => targetGradeOf(item.subjectName) === selectedTargetGrade);
  }, [subjectCounts, selectedTargetGrade, hasMultipleTargetGrades, targetGradeOf]);
  const showTargetGradeTag = hasMultipleTargetGrades && selectedTargetGrade === null;

  const totalStudents = currentStudents.length;

  // Calculate average grades for each subject (과목군별 등급 사용)
  const subjectGrades = useMemo(() => {
    const grades = new Map<string, { s1: number; s1Count: number; s2: number; s2Count: number }>();

    currentStudents.forEach(student => {
      student.semester1.forEach(subject => {
        const grade = getStudentGradeForSubject(student, subject);
        if (!grade || grade === 0) return;
        const existing = grades.get(subject) || { s1: 0, s1Count: 0, s2: 0, s2Count: 0 };
        existing.s1 += grade;
        existing.s1Count++;
        grades.set(subject, existing);
      });

      student.semester2.forEach(subject => {
        const grade = getStudentGradeForSubject(student, subject);
        if (!grade || grade === 0) return;
        const existing = grades.get(subject) || { s1: 0, s1Count: 0, s2: 0, s2Count: 0 };
        existing.s2 += grade;
        existing.s2Count++;
        grades.set(subject, existing);
      });
    });

    return grades;
  }, [currentStudents, getStudentGradeForSubject]);

  // Summary statistics
  const summaryStats = useMemo(() => {
    const categories = new Set(filteredSubjectCounts.map(s => s.category));
    return {
      totalSubjects: filteredSubjectCounts.length,
      totalCategories: categories.size,
      avgStudentsPerSubject: filteredSubjectCounts.length > 0
        ? Math.round(filteredSubjectCounts.reduce((sum, s) => sum + s.semester1Count + s.semester2Count, 0) / (filteredSubjectCounts.length * 2))
        : 0
    };
  }, [filteredSubjectCounts]);

  const handleCellClick = (subject: string, semester: 'semester1' | 'semester2') => {
    const students = currentStudents.filter(s => s[semester].includes(subject));
    setSelectedCell({ subject, semester, students });
  };

  // 학생 목록 정렬. 등급은 낮을수록 좋으므로 오름차순 = 상위권 먼저.
  // 성적 없음(0)은 방향과 무관하게 항상 맨 뒤 — 내림차순에서 맨 앞에 오면 최하위권처럼 보인다.
  const [studentSort, setStudentSort] = useState<{ key: StudentSortKey; dir: 'asc' | 'desc' }>({ key: 'number', dir: 'asc' });

  const toggleStudentSort = (key: StudentSortKey) => {
    setStudentSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  const sortedStudents = useMemo(() => {
    if (!selectedCell) return [];
    const { key, dir } = studentSort;
    const sign = dir === 'asc' ? 1 : -1;
    const byNumber = (a: Student, b: Student) =>
      (Number(a.class) - Number(b.class)) || (Number(a.number) - Number(b.number));

    const rows = selectedCell.students.map((student) => ({
      student,
      grades: getStudentGradePair(student, selectedCell.subject),
    }));

    rows.sort((a, b) => {
      if (key === 'number') return sign * byNumber(a.student, b.student);
      if (key === 'name') return sign * a.student.name.localeCompare(b.student.name, 'ko') || byNumber(a.student, b.student);
      const va = a.grades[key];
      const vb = b.grades[key];
      if (va <= 0 || vb <= 0) {
        if (va > 0) return -1;
        if (vb > 0) return 1;
        return byNumber(a.student, b.student);
      }
      return sign * (va - vb) || byNumber(a.student, b.student);
    });
    return rows;
  }, [selectedCell, studentSort, getStudentGradePair]);

  const handleExcelDownload = useCallback(() => {
    if (!selectedCell) return;

    const { subject, semester } = selectedCell;
    // 화면에 보이는 순서 그대로 내려받는다
    const students = sortedStudents.map((row) => row.student);
    const semesterLabel = semester === 'semester1' ? '1학기' : '2학기';

    const headers = ['학생코드', '이름', '교과세특', '성적'];
    const rows: (string | number)[][] = [headers];

    students.forEach(student => {
      rows.push([
        student.realID || '',
        student.name,
        '',  // 교과세특 - 공백
        '',  // 성적 - 공백
      ]);
    });

    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols'] = [
      { wch: 14 },  // 학생코드
      { wch: 10 },  // 이름
      { wch: 40 },  // 교과세특
      { wch: 10 },  // 성적
    ];

    XLSX.utils.book_append_sheet(workbook, sheet, subject);
    XLSX.writeFile(workbook, `${subject}_${semesterLabel}_명단.xlsx`);
  }, [selectedCell, sortedStudents]);

  if (filteredSubjectCounts.length === 0 && subjectCounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <div className="w-16 h-16 rounded-2xl bg-slate-50/50 border border-slate-100 flex items-center justify-center mb-4">
          <BookOpen size={32} className="text-slate-300" />
        </div>
        <p className="text-sm font-medium">데이터가 없습니다</p>
      </div>
    );
  }

  return (
    <div className="glass-panel p-6">
      <AnalysisPageHeader
        icon={BarChart3}
        title="과목별 선택 현황"
        description="각 과목의 학기별 선택 학생 수와 평균 등급을 비교합니다"
        rightContent={
          <>
            <SummaryBadge label="과목" value={summaryStats.totalSubjects} />
            <SummaryBadge label="과목군" value={summaryStats.totalCategories} />
            <SummaryBadge label="평균" value={summaryStats.avgStudentsPerSubject} suffix="명" />
          </>
        }
      />

      {/* Target grade filter — only when a round has multiple target grades (e.g. 1학년 selecting 2학년+3학년 subjects) */}
      {hasMultipleTargetGrades && targetGradeData && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs font-medium text-slate-500">과목 학년</span>
          <div className="inline-flex rounded-lg border border-slate-200/60 bg-white/60 p-0.5">
            <button
              onClick={() => setSelectedTargetGrade(null)}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-md transition-all",
                selectedTargetGrade === null
                  ? "bg-slate-700 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              )}
            >
              전체
            </button>
            {targetGradeData.targetGrades.map((grade) => (
              <button
                key={grade}
                onClick={() => setSelectedTargetGrade(grade)}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-md transition-all",
                  selectedTargetGrade === grade
                    ? "bg-slate-700 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                )}
              >
                {grade}학년 과목
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 테이블 컨테이너 - 부드러운 스타일 */}
      <div className="bg-white/40 backdrop-blur-sm rounded-xl border border-slate-100/60 overflow-x-auto">
        {/* 휴대폰: 과목군은 과목명 칸 안으로 합치고, 과목명 열을 왼쪽에 붙여 둔다 —
            가로로 스크롤해도 어느 과목의 숫자인지 잃지 않는다(ca-table-fit = 내용 폭 표) */}
        <table className="ca-table-fit w-full text-sm">
          {/* 헤더 - 부드러운 배경 (브랜드 그라디언트 대신) */}
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-100/60">
              <th className="hidden md:table-cell px-4 py-3 text-left text-slate-600 text-xs font-bold tracking-wide uppercase">
                과목군
              </th>
              <th className="sticky left-0 z-10 bg-slate-50 md:static md:bg-transparent px-3 md:px-4 py-3 text-left text-slate-600 text-xs font-bold tracking-wide uppercase">
                과목명
              </th>
              <th className="px-4 py-3 text-center text-slate-600 text-xs font-bold tracking-wide uppercase w-32 min-w-[8rem]">
                <div className="flex items-center justify-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                  <span>1학기</span>
                </div>
              </th>
              <th className="px-4 py-3 text-center text-slate-600 text-xs font-bold tracking-wide uppercase w-32 min-w-[8rem]">
                <div className="flex items-center justify-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-400"></span>
                  <span>2학기</span>
                </div>
              </th>
              <th className="px-4 py-3 text-center text-slate-600 text-xs font-bold tracking-wide uppercase w-56 min-w-[14rem]">
                등급 비교
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredSubjectCounts.map((item, idx) => {
              const gradeData = subjectGrades.get(item.subjectName);
              // s1Count/s2Count는 "성적이 있는 수강생" 수다(집계에서 등급 0을 건너뛴다).
              // 왼쪽 열의 수강 인원과 다를 수 있으므로 평균 옆에 부분 표식을 붙인다.
              const avgS1 = gradeData && gradeData.s1Count > 0 ? gradeData.s1 / gradeData.s1Count : 0;
              const avgS2 = gradeData && gradeData.s2Count > 0 ? gradeData.s2 / gradeData.s2Count : 0;

              return (
                <tr
                  key={item.subjectName}
                  className={cn(
                    "transition-colors border-b border-slate-50/80 last:border-b-0",
                    "hover:bg-slate-50/50",
                    idx % 2 === 0 ? "bg-white/60" : "bg-slate-50/30"
                  )}
                >
                  <td className="hidden md:table-cell px-4 py-3">
                    <CategoryBadge category={item.category} />
                  </td>
                  <td className="sticky left-0 z-10 bg-white md:static md:bg-transparent px-3 md:px-4 py-3 shadow-[1px_0_0_rgb(241_245_249)] md:shadow-none">
                    <div className="mb-1 md:hidden">
                      <CategoryBadge category={item.category} />
                    </div>
                    <span className="font-semibold text-slate-700 tracking-tight">{item.subjectName}</span>
                    {showTargetGradeTag && targetGradeOf(item.subjectName) != null && (
                      <span className="ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                        {targetGradeOf(item.subjectName)}학년
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <CountCell
                      count={item.semester1Count}
                      total={totalStudents}
                      semester="s1"
                      onClick={() => handleCellClick(item.subjectName, 'semester1')}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <CountCell
                      count={item.semester2Count}
                      total={totalStudents}
                      semester="s2"
                      onClick={() => handleCellClick(item.subjectName, 'semester2')}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <GradeComparison
                      avgS1={avgS1}
                      avgS2={avgS2}
                      gradedS1={gradeData?.s1Count ?? 0}
                      gradedS2={gradeData?.s2Count ?? 0}
                      enrolledS1={item.semester1Count}
                      enrolledS2={item.semester2Count}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 범례 - 하단 정보 */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <Info size={12} />
            숫자 클릭 시 학생 목록 표시
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            1학기
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-400"></span>
            2학기
          </span>
        </div>
      </div>

      {/* Student List Dialog */}
      <Dialog open={!!selectedCell} onOpenChange={(open) => !open && setSelectedCell(null)}>
        <DialogContent className="max-w-md max-h-[70vh] flex flex-col p-0 overflow-hidden bg-white/95 backdrop-blur-xl border-white/60">
          {selectedCell && (
            <>
              <DialogHeader className="px-5 py-4 bg-slate-50/80 border-b border-slate-100/60 flex-shrink-0 text-left">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0",
                    selectedCell.semester === 'semester1' ? 'bg-blue-500' : 'bg-green-500'
                  )}>
                    <BookOpen size={20} />
                  </div>
                  <div className="flex-1">
                    <DialogTitle className="text-base font-bold text-slate-800 tracking-tight">
                      {selectedCell.subject}
                    </DialogTitle>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-medium text-slate-500">
                        {selectedCell.semester === 'semester1' ? '1학기' : '2학기'}
                      </span>
                      <span className="px-2 py-0.5 bg-slate-200/60 rounded-full text-xs font-bold text-slate-600">
                        {selectedCell.students.length}명
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={handleExcelDownload}
                    className="w-9 h-9 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/60 flex items-center justify-center text-emerald-600 transition-colors shrink-0"
                    title="엑셀 다운로드"
                  >
                    <Download size={16} />
                  </button>
                </div>
              </DialogHeader>

              <div className="flex items-center gap-1.5 px-6 pt-2 flex-shrink-0">
                <SortButton label="번호" active={studentSort.key === 'number'} dir={studentSort.dir} onClick={() => toggleStudentSort('number')} />
                <SortButton label="이름" active={studentSort.key === 'name'} dir={studentSort.dir} onClick={() => toggleStudentSort('name')} />
                <div className="flex-1" />
                {gradeSource !== 'json' && (
                  <SortButton
                    label={getSubjectCategory(selectedCell.subject)}
                    active={studentSort.key === 'category'}
                    dir={studentSort.dir}
                    onClick={() => toggleStudentSort('category')}
                    className="min-w-[3.25rem] justify-center text-brand-600/80"
                  />
                )}
                <SortButton
                  label="전체 평균"
                  active={studentSort.key === 'overall'}
                  dir={studentSort.dir}
                  onClick={() => toggleStudentSort('overall')}
                  className="min-w-[3.25rem] justify-center"
                />
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                <div className="px-3 pb-3 pt-1 space-y-1">
                  {sortedStudents.map(({ student, grades }, idx) => (
                    <div
                      key={`${student.class}-${student.number}`}
                      className="group flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/80 rounded-lg transition-colors duration-150"
                    >
                      {/* 순번 */}
                      <div className="w-6 h-6 rounded-md bg-slate-100/80 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
                        {idx + 1}
                      </div>
                      {/* 학생 정보 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-semibold text-slate-700 tracking-tight truncate">
                            {student.name}
                          </span>
                          <span className="text-xs font-medium font-mono text-slate-400 shrink-0">
                            {student.class}-{student.number}
                          </span>
                        </div>
                      </div>
                      {/* 등급 표시: 과목군 등급(강조) + 전체 평균 등급 */}
                      {(() => {
                        const { category, overall } = grades;
                        if (category <= 0 && overall <= 0) return null;
                        return (
                          <div className="flex items-center gap-1.5 shrink-0 tabular-nums">
                            {gradeSource !== 'json' && (
                              <div
                                className={cn(
                                  "min-w-[3.25rem] px-2 py-0.5 rounded-md text-xs font-bold text-center border",
                                  category > 0
                                    ? "bg-brand-50/80 border-brand-100/60 text-brand-600"
                                    : "bg-slate-50 border-slate-100 text-slate-300"
                                )}
                                title={`${getSubjectCategory(selectedCell.subject)} 과목군 등급`}
                              >
                                {formatGrade(category)}
                              </div>
                            )}
                            <div
                              className="min-w-[3.25rem] px-2 py-0.5 rounded-md text-xs font-semibold text-center bg-slate-50 border border-slate-100 text-slate-500"
                              title="전체 평균 등급"
                            >
                              {formatGrade(overall)}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type StudentSortKey = 'number' | 'name' | 'category' | 'overall';

// 학생 목록 머리글의 정렬 버튼 — 활성 열만 방향 화살표를 보인다
function SortButton({
  label,
  active,
  dir,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  dir: 'asc' | 'desc';
  onClick: () => void;
  className?: string;
}) {
  const Icon = active ? (dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold transition-colors",
        active ? "text-slate-700 bg-slate-100" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50",
        className,
      )}
      title={`${label} 기준 정렬`}
    >
      <span className="truncate">{label}</span>
      <Icon size={10} className={cn("shrink-0", !active && "opacity-50")} />
    </button>
  );
}

// Summary Badge - 요약 통계 뱃지
function SummaryBadge({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-white/60 rounded-lg border border-slate-100/60">
      <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</span>
      <span className="text-sm font-bold text-slate-700">{value}{suffix}</span>
    </div>
  );
}

// Category Badge - 부드러운 스타일 (균형 개선)
function CategoryBadge({ category }: { category: string }) {
  const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS['기타'];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border",
        colors.badge
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", colors.dot)}></span>
      {category}
    </span>
  );
}

// Count Cell - 개선된 인터랙티브 셀 (scale 제거, 부드러운 호버)
function CountCell({
  count,
  total,
  semester,
  onClick
}: {
  count: number;
  total: number;
  semester: 's1' | 's2';
  onClick: () => void;
}) {
  const percentage = total > 0 ? (count / total) * 100 : 0;
  const barColor = semester === 's1' ? 'bg-blue-400/20' : 'bg-green-400/20';
  const hoverBarColor = semester === 's1' ? 'group-hover:bg-blue-400/30' : 'group-hover:bg-green-400/30';

  return (
    <button
      onClick={onClick}
      className="group relative w-full h-9 bg-white/80 rounded-lg overflow-hidden cursor-pointer border border-slate-100/60 hover:border-slate-200 hover:shadow-sm transition-all duration-200"
    >
      {/* Progress bar */}
      <div
        className={cn("absolute left-0 top-0 h-full rounded-lg transition-all duration-300", barColor, hoverBarColor)}
        style={{ width: `${percentage}%` }}
      />
      {/* Count display */}
      <div className="relative z-10 flex items-center justify-center h-full gap-1.5 px-2">
        <span className="font-bold text-slate-700">{count}</span>
        <span className="text-xs text-slate-400 font-medium">
          {percentage.toFixed(0)}%
        </span>
      </div>
    </button>
  );
}

// Grade Comparison - 개선된 등급 비교 (가독성 향상)
function GradeComparison({
  avgS1,
  avgS2,
  gradedS1,
  gradedS2,
  enrolledS1,
  enrolledS2,
}: {
  avgS1: number;
  avgS2: number;
  /** 평균에 실제로 들어간 인원 (성적 보유) */
  gradedS1: number;
  gradedS2: number;
  /** 그 학기 수강 인원 */
  enrolledS1: number;
  enrolledS2: number;
}) {
  if (avgS1 === 0 && avgS2 === 0) {
    return (
      <span className="text-xs text-slate-300 font-medium">
        -
      </span>
    );
  }

  // Determine trend
  const diff = avgS1 - avgS2;
  const TrendIcon = diff > 0.1 ? TrendingDown : diff < -0.1 ? TrendingUp : Minus;
  const trendColor = diff > 0.1 ? 'text-rose-500' : diff < -0.1 ? 'text-emerald-500' : 'text-slate-300';
  const trendBg = diff > 0.1 ? 'bg-rose-50' : diff < -0.1 ? 'bg-emerald-50' : 'bg-slate-50';

  return (
    <div className="flex items-center justify-center gap-2">
      {/* S1 Grade */}
      <div className="flex items-center gap-1 min-w-[48px] justify-end">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
        <span className="text-xs font-bold text-blue-600 tabular-nums">
          {formatGrade(avgS1)}
        </span>
        <PartialAverageMark covered={gradedS1} total={enrolledS1} />
      </div>

      {/* Trend indicator */}
      <div className={cn("p-1 rounded-md", trendBg)}>
        <TrendIcon size={12} className={trendColor} />
      </div>

      {/* S2 Grade */}
      <div className="flex items-center gap-1 min-w-[48px]">
        <span className="text-xs font-bold text-green-600 tabular-nums">
          {formatGrade(avgS2)}
        </span>
        <PartialAverageMark covered={gradedS2} total={enrolledS2} />
        <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
      </div>
    </div>
  );
}
