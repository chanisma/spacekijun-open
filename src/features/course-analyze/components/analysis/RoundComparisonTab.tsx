/**
 * Round Comparison Tab - 차수별 비교
 * 차수간 과목 선택 변경 사항 비교
 * evalog 글래스모피즘 디자인 적용
 */

import React, { useState } from 'react';
import { GitCompare, ArrowRight, Plus, Minus, CheckCircle2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCourseAnalyzeData, useCourseAnalyzeComparison, useCourseAnalyzeSubjects } from '../../context';

// Statistics Card - evalog 스타일
function StatCard({
  value,
  label,
  prefix,
  variant
}: {
  value: number;
  label: string;
  prefix?: string;
  variant: 'default' | 'success' | 'danger';
}) {
  const variantStyles = {
    default: 'bg-white/60 border-white/40 text-brand-600',
    success: 'bg-emerald-50/80 border-emerald-200/60 text-emerald-600',
    danger: 'bg-rose-50/80 border-rose-200/60 text-rose-600',
  };

  const labelStyles = {
    default: 'text-slate-500',
    success: 'text-emerald-700',
    danger: 'text-rose-700',
  };

  return (
    <div className={cn(
      "backdrop-blur-sm rounded-xl border p-5 text-center",
      "transition-all duration-200 hover:shadow-sm",
      variantStyles[variant]
    )}>
      <div className="text-3xl font-bold font-mono tracking-tight flex items-center justify-center gap-1">
        {prefix && <span>{prefix}</span>}
        {value}
      </div>
      <div className={cn("text-xs font-medium mt-2", labelStyles[variant])}>
        {label}
      </div>
    </div>
  );
}

// Changed Student Card - evalog 스타일
function ChangedStudentCard({
  change
}: {
  change: {
    student: { name: string; class: number; number: number };
    added: string[];
    removed: string[];
  };
}) {
  return (
    <div className="bg-white/60 backdrop-blur-sm rounded-xl border border-white/40 p-4 transition-all duration-200 hover:shadow-sm hover:border-slate-200/60">
      {/* Student Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-full bg-slate-100/80 flex items-center justify-center text-xs font-bold text-slate-500">
          {change.student.number}
        </div>
        <div>
          <span className="font-bold text-slate-800 tracking-tight">{change.student.name}</span>
          <span className="text-xs text-slate-500 font-medium ml-2">
            {change.student.class}반 {change.student.number}번
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Added Subjects */}
        {change.added.length > 0 && (
          <div className="bg-emerald-50/80 border-l-4 border-l-emerald-500 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-bold uppercase tracking-wider mb-2">
              <Plus size={12} />
              추가
            </div>
            <div className="flex flex-wrap gap-1">
              {change.added.map(subject => (
                <span
                  key={subject}
                  className="px-2 py-0.5 text-xs font-bold bg-emerald-500 text-white rounded-full"
                >
                  {subject}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Removed Subjects */}
        {change.removed.length > 0 && (
          <div className="bg-rose-50/80 border-l-4 border-l-rose-500 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-xs text-rose-700 font-bold uppercase tracking-wider mb-2">
              <Minus size={12} />
              제거
            </div>
            <div className="flex flex-wrap gap-1">
              {change.removed.map(subject => (
                <span
                  key={subject}
                  className="px-2 py-0.5 text-xs font-bold bg-rose-500 text-white rounded-full line-through"
                >
                  {subject}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Unchanged Student Badge - evalog 스타일
function UnchangedStudentBadge({ student }: { student: { name: string; class: number; number: number } }) {
  return (
    <span className="px-2.5 py-1 text-xs font-medium bg-white/60 border border-white/40 rounded-full text-slate-600 hover:bg-white/80 hover:border-brand-100/50 transition-all">
      {student.name}
    </span>
  );
}

export function RoundComparisonTab() {
  const { availableRounds, currentGrade } = useCourseAnalyzeData();
  const {
    round1,
    round2,
    setRound1,
    setRound2,
    changedStudents,
    unchangedStudents,
    totalChanges,
    additionCount,
    removalCount
  } = useCourseAnalyzeComparison();
  const { getSubjectCategory } = useCourseAnalyzeSubjects();

  if (availableRounds.length < 2) {
    return (
      <div className="glass-panel p-6">
        <div className="py-10 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100/80 flex items-center justify-center">
            <GitCompare className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm text-slate-500 font-medium">비교할 차수가 충분하지 않습니다</p>
          <p className="text-xs text-slate-400 mt-1">최소 2개 이상의 차수 데이터가 필요합니다</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel p-6 space-y-6">
      {/* Section Header - evalog 스타일 */}
      <div className="flex items-start gap-3 pb-4 border-b border-slate-100/50">
        <div className="p-2 rounded-xl bg-brand-50 text-brand-600 shrink-0">
          <GitCompare size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-slate-800 tracking-tight">차수별 비교</h3>
          <p className="text-sm text-slate-500 font-medium mt-0.5">
            차수별로 학생들의 과목 선택 변경 사항을 비교합니다
          </p>
        </div>
      </div>

      {/* Round Selection - evalog 스타일 */}
      <div className="flex items-end gap-4 p-4 bg-slate-50/50 rounded-xl border border-slate-100/60">
        <div className="flex-1">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            이전 차수
          </label>
          <select
            value={round1 || ''}
            onChange={e => setRound1(Number(e.target.value) || null)}
            className="w-full px-3 py-2 text-sm font-medium bg-white/60 border border-white/40 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-300"
          >
            <option value="">선택...</option>
            {availableRounds.map(round => (
              <option key={round} value={round} disabled={round === round2}>
                {round}차
              </option>
            ))}
          </select>
        </div>

        <div className="pb-2">
          <ArrowRight size={18} className="text-slate-400" />
        </div>

        <div className="flex-1">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            현재 차수
          </label>
          <select
            value={round2 || ''}
            onChange={e => setRound2(Number(e.target.value) || null)}
            className="w-full px-3 py-2 text-sm font-medium bg-white/60 border border-white/40 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-300"
          >
            <option value="">선택...</option>
            {availableRounds.map(round => (
              <option key={round} value={round} disabled={round === round1}>
                {round}차
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Comparison Results */}
      {round1 !== null && round2 !== null && (
        <div className="space-y-4">
          {/* Statistics */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <StatCard
              value={totalChanges}
              label="변경된 학생"
              variant="default"
            />
            <StatCard
              value={additionCount}
              label="추가된 과목"
              prefix="+"
              variant="success"
            />
            <StatCard
              value={removalCount}
              label="제거된 과목"
              prefix="−"
              variant="danger"
            />
          </div>

          {/* Changed Students List */}
          {changedStudents.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Users size={14} className="text-slate-400" />
                <h4 className="font-bold text-slate-700 tracking-tight text-sm">
                  변경된 학생
                </h4>
                <span className="px-2 py-0.5 text-xs font-bold bg-brand-50 text-brand-600 rounded-full">
                  {changedStudents.length}명
                </span>
              </div>
              <div className="space-y-3">
                {changedStudents.map(change => (
                  <ChangedStudentCard
                    key={`${change.student.class}-${change.student.number}`}
                    change={change}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="p-6 rounded-xl bg-emerald-50/80 border border-emerald-200/60 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-emerald-100/80 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              </div>
              <p className="text-sm text-emerald-700 font-medium">
                두 차수 간에 변경된 학생이 없습니다
              </p>
            </div>
          )}

          {/* Unchanged Students Summary */}
          {unchangedStudents.length > 0 && (
            <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-100/60">
              <h5 className="font-bold text-slate-700 tracking-tight text-sm mb-3">
                1학기와 2학기 선택과목이 동일한 학생
                <span className="ml-2 px-2 py-0.5 text-xs font-bold bg-slate-200/80 text-slate-600 rounded-full">
                  {unchangedStudents.length}명
                </span>
              </h5>
              <div className="flex flex-wrap gap-1.5">
                {unchangedStudents.slice(0, 20).map(student => (
                  <UnchangedStudentBadge
                    key={`${student.class}-${student.number}`}
                    student={student}
                  />
                ))}
                {unchangedStudents.length > 20 && (
                  <span className="px-2.5 py-1 text-xs text-slate-400 font-medium">
                    외 {unchangedStudents.length - 20}명
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* No Selection */}
      {(round1 === null || round2 === null) && (
        <div className="py-10 text-center">
          <p className="text-sm text-slate-400 font-medium">비교할 차수를 선택해주세요</p>
        </div>
      )}
    </div>
  );
}
