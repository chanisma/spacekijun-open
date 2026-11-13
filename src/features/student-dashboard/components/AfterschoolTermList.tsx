import React from 'react';
import { Loader2, School } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  groupAfterschoolByTerm,
  totalAfterschoolCourseCount,
  type AfterschoolEnrollmentLike,
} from '../utils/afterschoolTerms';

/**
 * 방과후 수강 내역을 학년도·학년별로 보여 준다.
 *
 * 상세 패널(`StudentDetailPanel`)과 상세 모달(`StudentDetailDialog`) **두 곳이 같은 화면을
 * 그린다** — 각자 렌더하면 그룹 기준·중복 처리 규칙이 조용히 갈라진다. 묶는 규칙 자체는
 * `utils/afterschoolTerms.ts` 가 갖고 여기서는 그리기만 한다.
 *
 * 학년 원판 + 오른쪽 목록 배치는 같은 패널의 봉사활동과 맞춘 것이다(같은 "언제 했나"라는
 * 질문에 답하는 자리는 같게 생겨야 한다).
 *
 * **납부 여부는 그리지 않는다** — `afterschool_enrollments.is_paid` 는 라이브 1,396행이
 * 전부 `false` 로 한 번도 채워진 적이 없다. 그대로 그리면 화면이 전교생을 미납으로
 * 표시한다(실제로 그랬다). 값이 실제로 들어오기 시작하면 그때 되살릴 것.
 */
interface AfterschoolTermListProps {
  enrollments: readonly AfterschoolEnrollmentLike[] | undefined;
  isLoading: boolean;
  className?: string;
}

export const AfterschoolTermList: React.FC<AfterschoolTermListProps> = ({
  enrollments,
  isLoading,
  className,
}) => {
  const groups = React.useMemo(
    () => groupAfterschoolByTerm(enrollments ?? []),
    [enrollments],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
        <span className="ml-2 text-slate-500">불러오는 중...</span>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <School className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>등록된 방과후 수강 내역이 없습니다</p>
      </div>
    );
  }

  const totalCourses = totalAfterschoolCourseCount(groups);

  return (
    <div className={cn('space-y-4', className)}>
      {/* 요약 — 아래 목록과 같은 기준으로 센다(중복 개설분 제외) */}
      <div className="p-4 bg-gradient-to-r from-brand-50 to-indigo-50 rounded-xl">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-slate-600">총 수강 과목</p>
            <p className="text-2xl font-bold text-brand-600">{totalCourses}개</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {groups.map((g) => g.label).join(' · ')}
            </p>
          </div>
          <School className="h-10 w-10 shrink-0 text-brand-400 opacity-50" />
        </div>
      </div>

      {/* 학년도·학년별 목록 (최신 학년이 위) */}
      <div className="grid gap-6">
        {groups.map((group) => (
          <div key={group.key} className="flex gap-4">
            <div className="flex-shrink-0 w-16 pt-2 text-center">
              <div className="w-10 h-10 mx-auto rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold shadow-sm border border-brand-200">
                {group.grade ?? '?'}
              </div>
              <span className="text-xs text-slate-500 mt-1 block">
                {group.grade === null ? '미상' : '학년'}
              </span>
              {group.academicYear !== null && (
                <span className="text-[11px] text-slate-400 block">{group.academicYear}년</span>
              )}
            </div>

            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-baseline justify-between gap-2 pb-1 border-b border-dashed border-slate-200">
                <span className="text-sm font-semibold text-slate-700 min-w-0 truncate">
                  {group.label}
                </span>
                <span className="text-xs text-slate-500 shrink-0">{group.courseCount}과목</span>
              </div>

              {group.courses.map((course) => (
                <div
                  key={`${group.key}:${course.courseName}`}
                  className="p-3 rounded-xl border bg-white/60 border-white/50 shadow-sm flex items-start gap-2"
                >
                  <p className="flex-1 min-w-0 text-sm font-medium text-slate-800 break-words">
                    {course.courseName}
                  </p>
                  {course.times > 1 && (
                    <span
                      className="shrink-0 px-2 py-0.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100"
                      title={`이 학년에 ${course.times}개 차수로 등록`}
                    >
                      {course.times}회
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
