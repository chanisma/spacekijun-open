/**
 * Grade Selector Component - 학년/차수 선택
 * evalog 글래스모피즘 스타일 적용
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { useCourseAnalyzeData } from '../context';
import { GraduationCap, Hash } from 'lucide-react';

export function GradeSelector() {
  const {
    currentGrade,
    setCurrentGrade,
    currentRound,
    setCurrentRound,
    availableGrades,
    availableRounds
  } = useCourseAnalyzeData();

  if (availableGrades.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2.5">
      {/* Grade Selection - evalog 타이포그래피 */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <GraduationCap size={12} className="text-slate-400" />
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">학년</span>
        </div>
        <div className="flex gap-1.5">
          {availableGrades.map(grade => (
            <button
              key={grade}
              onClick={() => setCurrentGrade(grade)}
              className={cn(
                'flex-1 px-3 py-2 text-xs font-bold rounded-lg transition-all duration-200',
                currentGrade === grade
                  ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-sm scale-[1.02]'
                  : 'bg-white/60 hover:bg-white/80 text-slate-600 hover:text-slate-800 border border-white/40 hover:border-brand-100/50 hover:shadow-sm'
              )}
            >
              {grade}학년
            </button>
          ))}
        </div>
      </div>

      {/* Round Selection - evalog 타이포그래피 */}
      {availableRounds.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Hash size={12} className="text-slate-400" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">차수</span>
          </div>
          <div className="flex gap-1">
            {availableRounds.map(round => (
              <button
                key={round}
                onClick={() => setCurrentRound(round)}
                className={cn(
                  'flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all duration-200',
                  currentRound === round
                    ? 'bg-brand-50/80 text-brand-600 border border-brand-200/60'
                    : 'bg-white/40 hover:bg-white/60 text-slate-500 hover:text-slate-700 border border-transparent'
                )}
              >
                {round}차
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
