/**
 * Grade Source Selector Component - 성적 소스 선택
 * JSON / Database / Both 모드 전환
 * evalog 글래스모피즘 스타일 적용
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { useCourseAnalyzeData } from '../context';
import { Database, FileJson, Layers, Download, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import type { GradeSource } from '../types/course.types';

interface GradeSourceOption {
  value: GradeSource;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const GRADE_SOURCE_OPTIONS: GradeSourceOption[] = [
  {
    value: 'json',
    label: 'JSON',
    icon: <FileJson size={14} />,
    description: '업로드된 파일 기준'
  },
  {
    value: 'database',
    label: 'DB',
    icon: <Database size={14} />,
    description: '학생정보 DB 기준'
  },
  {
    value: 'both',
    label: '통합',
    icon: <Layers size={14} />,
    description: 'DB 우선, 없으면 JSON'
  }
];

export function GradeSourceSelector() {
  const {
    gradeSource,
    setGradeSource,
    databaseGrades,
    isFetchingDbGrades,
    fetchDatabaseGrades,
    getDatabaseGradeStats,
    students
  } = useCourseAnalyzeData();

  const stats = getDatabaseGradeStats();
  const hasDbGrades = databaseGrades.size > 0;

  // 데이터가 없으면 표시하지 않음
  if (students.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Database size={12} className="text-slate-400" />
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">성적 소스</span>
        </div>

        {/* DB 로드 버튼 */}
        <button
          onClick={() => fetchDatabaseGrades()}
          disabled={isFetchingDbGrades}
          className={cn(
            'flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-all duration-200',
            isFetchingDbGrades
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : hasDbGrades
                ? 'bg-emerald-50/80 text-emerald-600 hover:bg-emerald-100/80 border border-emerald-200/60'
                : 'bg-brand-50/80 text-brand-600 hover:bg-brand-100/80 border border-brand-200/60'
          )}
        >
          {isFetchingDbGrades ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              <span>로딩중...</span>
            </>
          ) : hasDbGrades ? (
            <>
              <CheckCircle2 size={12} />
              <span>새로고침</span>
            </>
          ) : (
            <>
              <Download size={12} />
              <span>DB 불러오기</span>
            </>
          )}
        </button>
      </div>

      {/* Source Selection Buttons */}
      <div className="flex gap-1">
        {GRADE_SOURCE_OPTIONS.map((option) => {
          const isDisabled = option.value !== 'json' && !hasDbGrades;

          return (
            <button
              key={option.value}
              onClick={() => !isDisabled && setGradeSource(option.value)}
              disabled={isDisabled}
              className={cn(
                'flex-1 flex flex-col items-center gap-0.5 px-2 py-2 text-xs rounded-lg transition-all duration-200',
                gradeSource === option.value
                  ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-sm scale-[1.02]'
                  : isDisabled
                    ? 'bg-slate-100/60 text-slate-400 cursor-not-allowed border border-slate-200/40'
                    : 'bg-white/60 hover:bg-white/80 text-slate-600 hover:text-slate-800 border border-white/40 hover:border-brand-100/50 hover:shadow-sm'
              )}
              title={option.description}
            >
              <span className={cn(
                gradeSource === option.value ? 'text-white' : isDisabled ? 'text-slate-400' : 'text-slate-500'
              )}>
                {option.icon}
              </span>
              <span className="font-bold">{option.label}</span>
            </button>
          );
        })}
      </div>

      {/* Stats Display */}
      {hasDbGrades && (
        <div className="flex items-center justify-between px-2 py-1.5 bg-slate-50/60 rounded-md text-xs">
          <div className="flex items-center gap-1.5 text-slate-500">
            <CheckCircle2 size={10} className="text-emerald-500" />
            <span>DB 연동</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-600 font-medium">
              {stats.withDb}명
            </span>
            <span className="text-slate-400">/</span>
            <span className="text-slate-500">
              {stats.total}명
            </span>
            <span className={cn(
              'px-1.5 py-0.5 rounded text-xs font-medium',
              stats.dbPercentage >= 80
                ? 'bg-emerald-100 text-emerald-700'
                : stats.dbPercentage >= 50
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-red-100 text-red-700'
            )}>
              {stats.dbPercentage}%
            </span>
          </div>
        </div>
      )}

      {/* Warning when DB mode selected but missing data */}
      {gradeSource !== 'json' && stats.withoutDb > 0 && hasDbGrades && (
        <div className="flex items-start gap-1.5 px-2 py-1.5 bg-amber-50/60 rounded-md text-xs text-amber-700">
          <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
          <span>
            {stats.withoutDb}명의 학생은 DB 성적이 없어
            {gradeSource === 'both' ? ' JSON 데이터를 사용합니다.' : ' 0으로 표시됩니다.'}
          </span>
        </div>
      )}
    </div>
  );
}
