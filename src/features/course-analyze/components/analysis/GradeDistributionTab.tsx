/**
 * Grade Distribution Tab - 등급 분포
 * 과목별 선택 학생들의 등급 분포 시각화
 * evalog 글래스모피즘 디자인 적용
 */

import React, { useMemo, useState, useCallback } from 'react';
import { BarChart3, X, Users, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCourseAnalyzeData, useCourseAnalyzeSubjects } from '../../context';
import { useTargetGradeFilter } from '../../hooks/useTargetGradeFilter';
import type { Student } from '../../types/course.types';
import { AnalysisPageHeader } from '../common/AnalysisPageHeader';
import { TargetGradeFilter } from './TargetGradeFilter';
import { getMaxGradeLevel } from '../../utils/gradeScale';
import { toDbGradeCategory } from '../../utils/gradeMapping';
import { formatGrade } from '../../utils/gradeFormat';
import { PartialAverageMark } from '../common/PartialAverageMark';
import {
  GRADE_BAND_MODES,
  GRADE_BAND_MODE_META,
  getGradeBands,
  gradeBandIndex,
  type GradeBand,
  type GradeBandMode,
} from '../../utils/gradeBands';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// evalog 등급별 색상
const GRADE_COLORS: Record<number, { bg: string; text: string; tw: string }> = {
  1: { bg: '#1e40af', text: 'white', tw: 'bg-blue-800 text-white' },
  2: { bg: '#3b82f6', text: 'white', tw: 'bg-blue-500 text-white' },
  3: { bg: '#22c55e', text: 'white', tw: 'bg-emerald-500 text-white' },
  4: { bg: '#4ade80', text: 'white', tw: 'bg-emerald-400 text-white' },
  5: { bg: '#eab308', text: 'white', tw: 'bg-amber-500 text-white' },
  6: { bg: '#facc15', text: '#1a1a1a', tw: 'bg-amber-400 text-slate-800' },
  7: { bg: '#fb923c', text: 'white', tw: 'bg-orange-400 text-white' },
  8: { bg: '#f97316', text: 'white', tw: 'bg-orange-500 text-white' },
  9: { bg: '#ef4444', text: 'white', tw: 'bg-rose-500 text-white' },
};

// evalog 스타일 카테고리별 테두리 색상
const CATEGORY_BORDER_COLORS: Record<string, string> = {
  '국어': 'border-l-violet-500',
  '영어': 'border-l-blue-500',
  '수학': 'border-l-emerald-500',
  '역사': 'border-l-amber-500',
  '사회': 'border-l-purple-500',
  '물리': 'border-l-orange-500',
  '화학': 'border-l-pink-500',
  '생명': 'border-l-teal-500',
  '지구과학': 'border-l-cyan-500',
  '과학': 'border-l-sky-500',
  '기타': 'border-l-slate-400',
};

// 구간 기준은 화면 표시 취향이라 사용자별로 남긴다(서버 저장 대상 아님).
const BAND_MODE_STORAGE_KEY = 'course-analyze-grade-band-mode-v1';

function loadBandMode(): GradeBandMode {
  try {
    const stored = localStorage.getItem(BAND_MODE_STORAGE_KEY);
    if (stored === 'level' || stored === 'rounded') return stored;
  } catch {
    // 시크릿 모드·사이트 데이터 차단 환경에서는 접근 자체가 throw 한다
  }
  return 'level'; // 기본값 = 기존 기준 (토글하지 않으면 종전과 동일한 화면)
}

export function GradeDistributionTab() {
  const { currentStudents, currentGrade, currentAcademicYear, getEffectiveGrade, getStudentDatabaseGrade, gradeSource } = useCourseAnalyzeData();
  const { subjectCategories, categoryOrder, getSubjectCategory } = useCourseAnalyzeSubjects();
  const [selectedSemester, setSelectedSemester] = useState<'semester1' | 'semester2'>('semester1');

  // 과목 학년 분리 필터 (1학년 신청 = 2·3학년 과목 혼재 시에만 토글 노출)
  const targetGrade = useTargetGradeFilter(currentAcademicYear, currentGrade);
  const [selectedGradeInfo, setSelectedGradeInfo] = useState<{
    subject: string;
    band: GradeBand;
    students: Student[];
  } | null>(null);

  // 등급 구간 기준 (정수 등급 / 반올림 등급)
  const [bandMode, setBandMode] = useState<GradeBandMode>(loadBandMode);
  const changeBandMode = useCallback((mode: GradeBandMode) => {
    setBandMode(mode);
    setSelectedGradeInfo(null); // 기준이 바뀌면 열려 있던 명단은 다른 구간의 것이 된다
    try {
      localStorage.setItem(BAND_MODE_STORAGE_KEY, mode);
    } catch {
      // 저장 실패는 이번 세션 한정 동작으로 조용히 넘어간다
    }
  }, []);

  // 2025학년도 입학(2022 개정 교육과정) 이후는 전 학년 5등급, 이전은 9등급
  const maxGradeLevel = getMaxGradeLevel({ currentGrade, currentAcademicYear });

  // 막대 정의 — 두 모드 모두 막대 개수는 maxGradeLevel로 같다
  const bands = useMemo(
    () => getGradeBands(bandMode, maxGradeLevel),
    [bandMode, maxGradeLevel],
  );

  // 카테고리 → DB 등급 키 변환은 utils/gradeMapping의 toDbGradeCategory 단일 출처를 쓴다

  // 과목군별 등급 우선 조회 (StudentEstimatedGradeTab 방식)
  const getGradeForSubject = useCallback((student: Student, subject: string): number => {
    if (gradeSource === 'json') return getEffectiveGrade(student.id);
    const dbGrade = getStudentDatabaseGrade(student.id);
    // Defense against cross-cohort mismapping: verify the grade belongs to this exact student
    if (dbGrade && dbGrade.studentCode === String(student.id) && dbGrade.subjectGroupGrades) {
      const category = getSubjectCategory(subject);
      const dbCategory = toDbGradeCategory(category);
      const categoryGrade = dbGrade.subjectGroupGrades[dbCategory];
      if (categoryGrade && categoryGrade > 0) return categoryGrade;
    }
    if (dbGrade && dbGrade.studentCode === String(student.id)) {
      return dbGrade.overallGrade || 0;
    }
    return 0;
  }, [gradeSource, getEffectiveGrade, getStudentDatabaseGrade, getSubjectCategory]);

  // Calculate grade distribution for each subject
  const subjectGrades = useMemo(() => {
    const grades = new Map<string, {
      /** 성적이 있어 평균 계산에 실제로 들어간 학생 수 (= 평균의 분모) */
      students: number;
      /** 그 과목을 수강한 전체 학생 수 — students와 다르면 평균은 부분 평균이다 */
      enrolled: number;
      avgGrade: number;
      gradeDistribution: number[];
      minGrade: number;
      maxGrade: number;
    }>();

    // Get all subjects from the selected semester
    const subjectsInSemester = new Set<string>();
    currentStudents.forEach(student => {
      student[selectedSemester].forEach(subject => subjectsInSemester.add(subject));
    });

    subjectsInSemester.forEach(subject => {
      // 수강자와 "성적 보유 수강자"를 나눠 센다. 평균의 분모는 후자이므로,
      // 둘이 다르면 카드가 부분 평균임을 표시해야 한다.
      const enrolledStudents = currentStudents.filter(s =>
        s[selectedSemester].includes(subject)
      );
      const studentsWithSubject = enrolledStudents.filter(s =>
        getGradeForSubject(s, subject) > 0
      );

      if (studentsWithSubject.length === 0) {
        grades.set(subject, {
          students: 0,
          enrolled: enrolledStudents.length,
          avgGrade: 0,
          gradeDistribution: new Array<number>(maxGradeLevel).fill(0),
          minGrade: 0,
          maxGrade: 0
        });
        return;
      }

      const studentGrades = studentsWithSubject.map(s => getGradeForSubject(s, subject));
      const avgGrade = studentGrades.reduce((a, b) => a + b, 0) / studentGrades.length;

      // 구간 판정은 gradeBandIndex 단일 출처 — 막대 클릭 필터가 같은 함수를 쓴다
      const distribution = new Array<number>(maxGradeLevel).fill(0);
      studentGrades.forEach(grade => {
        distribution[gradeBandIndex(grade, bandMode, maxGradeLevel)]++;
      });

      grades.set(subject, {
        students: studentsWithSubject.length,
        enrolled: enrolledStudents.length,
        avgGrade,
        gradeDistribution: distribution,
        minGrade: Math.min(...studentGrades),
        maxGrade: Math.max(...studentGrades)
      });
    });

    return grades;
  }, [currentStudents, selectedSemester, getGradeForSubject, bandMode, maxGradeLevel]);

  // Sort subjects by category
  const sortedSubjects = useMemo(() => {
    return Array.from(subjectGrades.entries())
      .sort((a, b) => {
        const catA = getSubjectCategory(a[0]);
        const catB = getSubjectCategory(b[0]);
        const orderA = categoryOrder.indexOf(catA);
        const orderB = categoryOrder.indexOf(catB);
        if (orderA !== orderB) return orderA - orderB;
        return a[0].localeCompare(b[0]);
      });
  }, [subjectGrades, getSubjectCategory, categoryOrder]);

  // 과목 학년 필터를 통과한 과목만 카드로 표시
  const visibleSubjects = useMemo(
    () => sortedSubjects.filter(([subject]) => targetGrade.matches(subject)),
    [sortedSubjects, targetGrade],
  );

  if (currentStudents.length === 0) {
    return (
      <div className="glass-panel p-6">
        <div className="py-10 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100/80 flex items-center justify-center">
            <BarChart3 className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm text-slate-500 font-medium">데이터가 없습니다</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel p-6 space-y-6">
      <AnalysisPageHeader
        icon={BarChart3}
        title="등급 분포"
        description="과목별 선택 학생들의 등급 분포를 확인합니다"
        rightContent={
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => setSelectedSemester('semester1')}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200",
                selectedSemester === 'semester1'
                  ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-sm"
                  : "bg-white/60 hover:bg-white/80 text-slate-600 hover:text-slate-800 border border-white/40"
              )}
            >
              1학기
            </button>
            <button
              onClick={() => setSelectedSemester('semester2')}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200",
                selectedSemester === 'semester2'
                  ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-sm"
                  : "bg-white/60 hover:bg-white/80 text-slate-600 hover:text-slate-800 border border-white/40"
              )}
            >
              2학기
            </button>
          </div>
        }
      />

      {/* 과목 학년 분리 토글 — 2·3학년 과목이 함께 있는 라운드(예: 1학년 신청)에서만 노출 */}
      {targetGrade.hasMultiple && (
        <TargetGradeFilter
          targetGrades={targetGrade.targetGrades}
          selected={targetGrade.selected}
          onChange={targetGrade.setSelected}
        />
      )}

      {/* Grade Legend + 구간 기준 토글 (범례 라벨이 곧 기준의 결과라 같은 줄에 둔다) */}
      <div className="flex items-center gap-x-3 gap-y-2 flex-wrap">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">등급 분포</span>
        <div className="flex gap-1 flex-wrap">
          {bands.map(band => (
            <span
              key={band.index}
              title={`${band.rangeLabel}등급`}
              className={cn(
                "h-5 min-w-5 px-1.5 flex items-center justify-center rounded text-xs font-bold font-mono tabular-nums",
                GRADE_COLORS[band.grade]?.tw || 'bg-slate-100 text-slate-600'
              )}
            >
              {band.rangeLabel}
            </span>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-0.5 rounded-lg bg-slate-100/70 p-0.5 border border-slate-200/60 shrink-0">
          {GRADE_BAND_MODES.map(mode => {
            const meta = GRADE_BAND_MODE_META[mode];
            const active = bandMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => changeBandMode(mode)}
                title={meta.hint}
                aria-pressed={active}
                className={cn(
                  "px-2.5 py-1 text-xs font-bold rounded-md transition-all duration-200",
                  active
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Subject Cards - Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visibleSubjects.map(([subject, data]) => (
          <SubjectGradeCard
            key={subject}
            subject={subject}
            category={getSubjectCategory(subject)}
            data={data}
            totalStudents={currentStudents.length}
            students={currentStudents}
            selectedSemester={selectedSemester}
            maxGradeLevel={maxGradeLevel}
            bands={bands}
            bandMode={bandMode}
            getGrade={(s) => getGradeForSubject(s, subject)}
            onGradeClick={(band, students) => setSelectedGradeInfo({ subject, band, students })}
          />
        ))}
      </div>

      {visibleSubjects.length === 0 && (
        <div className="py-10 text-center col-span-full">
          <p className="text-sm text-slate-400 font-medium">선택된 학기에 과목 데이터가 없습니다</p>
        </div>
      )}

      {/* Grade Student List Dialog */}
      <Dialog open={!!selectedGradeInfo} onOpenChange={(open) => !open && setSelectedGradeInfo(null)}>
        <DialogContent className="max-w-md max-h-[70vh] flex flex-col p-0 overflow-hidden bg-white/95 backdrop-blur-xl border-white/60">
          {selectedGradeInfo && (
            <>
              <DialogHeader className="px-5 py-4 bg-slate-50/80 border-b border-slate-100/60 flex-shrink-0 text-left">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0",
                    GRADE_COLORS[selectedGradeInfo.band.grade]?.bg ? '' : 'bg-slate-500'
                  )} style={{
                    backgroundColor: GRADE_COLORS[selectedGradeInfo.band.grade]?.bg
                  }}>
                    <BookOpen size={20} />
                  </div>
                  <div>
                    <DialogTitle className="text-base font-bold text-slate-800 tracking-tight">
                      {selectedGradeInfo.subject}
                    </DialogTitle>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={cn(
                        "px-2 py-0.5 text-xs font-bold rounded-full",
                        GRADE_COLORS[selectedGradeInfo.band.grade]?.tw || 'bg-slate-100 text-slate-600'
                      )}>
                        {selectedGradeInfo.band.rangeLabel}등급
                      </span>
                      <span className="px-2 py-0.5 bg-slate-200/60 rounded-full text-xs font-bold text-slate-600">
                        {selectedGradeInfo.students.length}명
                      </span>
                    </div>
                  </div>
                </div>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                <div className="p-3 space-y-1">
                  {selectedGradeInfo.students.length > 0 ? (
                    selectedGradeInfo.students.map((student, idx) => (
                      <div
                        key={student.id}
                        className="group flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/80 rounded-lg transition-colors duration-150"
                      >
                        {/* 순번 */}
                        <div className="w-6 h-6 rounded-md bg-slate-100/80 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
                          {student.number}
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
                        {/* 등급 표시 */}
                        <div className="px-2 py-0.5 bg-brand-50/80 border border-brand-100/60 rounded-md text-xs font-bold text-brand-600 shrink-0 font-mono">
                          {selectedGradeInfo && formatGrade(getGradeForSubject(student, selectedGradeInfo.subject))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-10 text-center">
                      <p className="text-sm text-slate-400 font-medium">해당 등급의 학생이 없습니다</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SubjectGradeCard({
  subject,
  category,
  data,
  totalStudents,
  students,
  selectedSemester,
  maxGradeLevel,
  bands,
  bandMode,
  getGrade,
  onGradeClick
}: {
  subject: string;
  category: string;
  data: {
    students: number;
    enrolled: number;
    avgGrade: number;
    gradeDistribution: number[];
    minGrade: number;
    maxGrade: number;
  };
  totalStudents: number;
  students: Student[];
  selectedSemester: 'semester1' | 'semester2';
  maxGradeLevel: number;
  bands: GradeBand[];
  bandMode: GradeBandMode;
  getGrade: (student: Student) => number;
  onGradeClick: (band: GradeBand, students: Student[]) => void;
}) {
  const borderColor = CATEGORY_BORDER_COLORS[category] || CATEGORY_BORDER_COLORS['기타'];
  const maxDistribution = Math.max(...bands.map(b => data.gradeDistribution[b.index] ?? 0), 1);

  const handleGradeClick = (band: GradeBand) => {
    // 분포 집계와 **같은 판정 함수**를 써야 막대 높이와 모달 인원이 어긋나지 않는다.
    // 등급 0(미상)은 집계 대상이 아니므로 여기서도 빼야 한다 — 안 빼면 clamp 때문에
    // 1등급 막대 모달에만 나타난다.
    const gradeStudents = students.filter(student => {
      if (!student[selectedSemester].includes(subject)) return false;
      const studentGrade = getGrade(student);
      if (studentGrade <= 0) return false;
      return gradeBandIndex(studentGrade, bandMode, maxGradeLevel) === band.index;
    }).sort((a, b) => getGrade(a) - getGrade(b));
    onGradeClick(band, gradeStudents);
  };

  return (
    <div className={cn(
      "bg-white/60 backdrop-blur-sm rounded-xl border border-white/40 border-l-4 p-4",
      "transition-all duration-200 hover:shadow-sm hover:border-slate-200/60",
      borderColor
    )}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="font-bold text-slate-800 tracking-tight">{subject}</h4>
          <span className="text-xs text-slate-500 font-medium">{category}</span>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-brand-600 font-mono tracking-tight">
            {data.avgGrade > 0 ? formatGrade(data.avgGrade) : 'N/A'}
            <PartialAverageMark covered={data.students} total={data.enrolled} />
          </div>
          <div className="text-xs text-slate-500 font-medium">
            수강 {data.enrolled}명 / 전체 {totalStudents}명
          </div>
        </div>
      </div>

      {data.students > 0 && (
        <>
          {/* Grade Distribution Bar */}
          <div className="flex gap-1 mb-2 h-14 items-end">
            {bands.map(band => {
              const count = data.gradeDistribution[band.index] ?? 0;
              return (
                <GradeBar
                  key={band.index}
                  band={band}
                  count={count}
                  maxDistribution={maxDistribution}
                  onClick={() => count > 0 && handleGradeClick(band)}
                />
              );
            })}
          </div>

          {/* Grade Range */}
          <div className="flex justify-between text-xs text-slate-400 font-medium mt-auto">
            <span>최저: <span className="font-mono">{formatGrade(Math.min(data.maxGrade, maxGradeLevel))}</span>등급</span>
            <span>최고: <span className="font-mono">{formatGrade(data.minGrade)}</span>등급</span>
          </div>
        </>
      )}

      {data.students === 0 && (
        <div className="py-4 text-center text-xs text-slate-400 font-medium">
          등급 데이터 없음
        </div>
      )}
    </div>
  );
}

// Grade Bar - evalog 스타일
function GradeBar({
  band,
  count,
  maxDistribution,
  onClick
}: {
  band: GradeBand;
  count: number;
  maxDistribution: number;
  onClick: () => void;
}) {
  const gradeColor = GRADE_COLORS[band.grade];

  return (
    <button
      onClick={onClick}
      disabled={count === 0}
      className={cn(
        "flex-1 flex flex-col items-center group h-full justify-end",
        count > 0 && "cursor-pointer"
      )}
      title={`${band.rangeLabel}등급: ${count}명 ${count > 0 ? '(클릭하여 학생 보기)' : ''}`}
    >
      <div className={cn(
        "w-full bg-slate-100/80 rounded-t relative overflow-hidden",
        "border-2 border-transparent transition-all duration-200",
        count > 0 && "group-hover:border-slate-400"
      )} style={{
        height: count > 0 ? '100%' : '4px',
        maxHeight: '100%'
      }}>
        <div
          className="w-full absolute bottom-0 transition-all duration-300 rounded-t"
          style={{
            height: `${(count / maxDistribution) * 100}%`,
            backgroundColor: gradeColor?.bg || '#94a3b8',
            minHeight: count > 0 ? '4px' : '0'
          }}
        />
      </div>
      <span className={cn(
        "text-[10px] mt-1 transition-all",
        count > 0
          ? "text-slate-400 group-hover:text-slate-700 group-hover:font-bold"
          : "text-slate-300"
      )}>
        {band.label}
      </span>
    </button>
  );
}
