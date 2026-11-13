import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DIFFICULTY_COLOR } from '../../../utils/difficulty';
import type { SchoolExamItemRow } from '../../../utils/schoolExamAnalysis';

interface Props {
  rows: SchoolExamItemRow[];
  /** 취약 영역/성취기준에서 고른 키. 해당 문항만 강조한다. */
  highlightKey: string | null;
  highlightBy: 'area' | 'standard';
  /** 오답만 보기 */
  wrongOnly: boolean;
}

function matchesHighlight(row: SchoolExamItemRow, key: string | null, by: 'area' | 'standard'): boolean {
  if (key == null) return false;
  return by === 'area' ? row.contentArea === key : row.standardCode === key;
}

const SchoolExamItemTable: React.FC<Props> = ({ rows, highlightKey, highlightBy, wrongOnly }) => {
  const visible = wrongOnly ? rows.filter((r) => !r.isCorrect) : rows;

  if (visible.length === 0) {
    return (
      <div className="rounded-xl border border-slate-100 bg-white/70 px-3 py-6 text-center">
        <p className="text-xs text-slate-400">{wrongOnly ? '오답이 없습니다.' : '문항 데이터가 없습니다.'}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-white/70 overflow-hidden">
      {/* 표는 좁은 화면에서 자기 안에서만 가로 스크롤한다 — 페이지 전체가 밀리면 안 된다. */}
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-xs border-separate border-spacing-0 min-w-[680px]">
          <thead>
            <tr className="bg-slate-50/80">
              {['문항', '내 답', '정답', '배점', '내용영역', '성취기준', '학교 정답률', '지정 난이도'].map((label, i) => (
                <th
                  key={label}
                  className={cn(
                    'px-2 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100 whitespace-nowrap',
                    i === 0 ? 'text-center w-[46px]' : 'text-left',
                    (label === '배점' || label === '학교 정답률') && 'text-right'
                  )}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const highlighted = matchesHighlight(row, highlightKey, highlightBy);
              return (
                <tr
                  key={row.problemNumber}
                  className={cn(
                    'transition-colors',
                    highlighted ? 'bg-brand-50/70' : row.isCorrect ? 'hover:bg-slate-50/60' : 'bg-red-50/40 hover:bg-red-50/70'
                  )}
                >
                  <td className="px-2 py-1.5 border-b border-slate-50 text-center">
                    <span
                      className={cn(
                        'inline-flex items-center justify-center h-5 w-5 rounded text-[10px] font-bold',
                        row.isCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      )}
                      title={row.isCorrect ? '정답' : '오답'}
                    >
                      {row.problemNumber}
                    </span>
                  </td>
                  <td
                    className={cn(
                      'px-2 py-1.5 border-b border-slate-50 tabular-nums whitespace-nowrap',
                      row.isCorrect ? 'text-slate-600' : 'text-red-600 font-semibold'
                    )}
                  >
                    {row.studentAnswer === '' ? <span className="text-slate-300">무응답</span> : row.studentAnswer}
                  </td>
                  <td className="px-2 py-1.5 border-b border-slate-50 tabular-nums text-slate-600 whitespace-nowrap">
                    {row.correctAnswer ?? '—'}
                    {row.hasMultipleAnswers && (
                      <span className="ml-1 text-[9px] text-violet-500 font-medium" title="복수 정답 — 모두 골라야 정답">
                        복수
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 border-b border-slate-50 tabular-nums text-right text-slate-500 whitespace-nowrap">
                    {row.points != null ? row.points.toFixed(1) : '—'}
                  </td>
                  <td className="px-2 py-1.5 border-b border-slate-50 text-slate-600 max-w-[120px] truncate" title={row.contentArea ?? ''}>
                    {row.contentArea ?? '—'}
                  </td>
                  <td
                    className="px-2 py-1.5 border-b border-slate-50 text-slate-500 max-w-[150px] truncate"
                    title={row.standardText ? `${row.standardCode} — ${row.standardText}` : (row.standardCode ?? '')}
                  >
                    {row.standardCode ?? '—'}
                  </td>
                  <td className="px-2 py-1.5 border-b border-slate-50 tabular-nums text-right whitespace-nowrap">
                    {row.schoolCorrectRate != null ? (
                      <span style={{ color: DIFFICULTY_COLOR[row.actualBand] }} className="font-medium">
                        {row.schoolCorrectRate.toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                    {row.missedEasy && (
                      <span className="ml-1 text-[9px] text-amber-600 font-semibold" title="학년 대부분이 맞힌 문항인데 틀렸습니다">
                        놓침
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 border-b border-slate-50 text-slate-500 whitespace-nowrap">
                    {row.designatedDifficulty ?? '—'}
                    {row.difficultyGap && (
                      <AlertTriangle
                        className="inline h-3 w-3 ml-1 text-amber-500"
                        aria-label="지정 난이도와 실제 정답률이 크게 다릅니다"
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-3 py-1.5 text-[10px] text-slate-400 border-t border-slate-50">
        <AlertTriangle className="inline h-3 w-3 text-amber-500 mr-0.5" />
        지정 난이도와 실제 정답률이 2단계 어긋난 문항 ·{' '}
        <span className="text-amber-600 font-semibold">놓침</span> = 학년 정답률 80% 이상인데 오답
      </p>
    </div>
  );
};

export default SchoolExamItemTable;
