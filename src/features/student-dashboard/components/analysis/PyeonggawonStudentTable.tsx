/**
 * 6·9월 모평 — **학생별 등급 표**.
 *
 * 과목 선택에서 '전체'를 고르면 나온다. 과목 하나를 깊이 보는 다른 화면과 목적이 다르다:
 * 여기서 답하는 질문은 "**누가 어떻게 움직였나**"이고, 그래서 학생이 행이고 과목이 열이다.
 *
 * 등급은 **낮을수록 좋다** — 변화량 색이 부호와 반대인 이유다(-1 = 향상 = 에메랄드).
 */
import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  SHIFT_SLOTS,
  type ShiftCell,
  type ShiftSortKey,
  type SortDirection,
  type StudentShiftRow,
  sortShiftRows,
} from '../../utils/pyeonggawonTable';

interface Props {
  rows: StudentShiftRow[];
  fromLabel: string;
  toLabel: string;
  /** to 쪽이 참고 등급인가 — 표 안에서도 한 번 더 밝힌다 */
  toIsReference?: boolean;
}

/** 등급 변화 — 등급은 낮을수록 좋으므로 음수가 향상이다 */
const deltaTone = (d: number) =>
  d < 0 ? 'text-emerald-600' : d > 0 ? 'text-rose-600' : 'text-slate-400';

const deltaText = (d: number) => (d > 0 ? `+${d}` : `${d}`);

const GradeCell: React.FC<{ cell: ShiftCell; showSubject?: boolean }> = ({ cell, showSubject }) => {
  if (cell.from == null && cell.to == null) {
    return <span className="text-slate-300">—</span>;
  }
  return (
    <div className="leading-tight">
      {/* 탐구는 자리마다 과목이 달라 이름을 함께 보여야 표가 해석된다 */}
      {showSubject && cell.subject && (
        <div className="text-[10px] text-slate-400 truncate" title={cell.subject}>{cell.subject}</div>
      )}
      <div className="flex items-baseline justify-center gap-1 tabular-nums">
        <span className="text-slate-400">{cell.from ?? '—'}</span>
        <span className="text-slate-300 text-[10px]">→</span>
        <span className="font-semibold text-slate-700">{cell.to ?? '—'}</span>
        {cell.delta != null && cell.delta !== 0 && (
          <span className={cn('text-[10px] font-semibold', deltaTone(cell.delta))}>
            {deltaText(cell.delta)}
          </span>
        )}
      </div>
    </div>
  );
};

const SortButton: React.FC<{
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}> = ({ active, direction, onClick, children, className }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'inline-flex items-center gap-0.5 transition-colors',
      active ? 'text-brand-600 font-semibold' : 'text-slate-500 hover:text-slate-700',
      className
    )}
  >
    {children}
    {active
      ? (direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
      : <ChevronsUpDown className="h-3 w-3 opacity-30" />}
  </button>
);

export const PyeonggawonStudentTable: React.FC<Props> = ({ rows, fromLabel, toLabel, toIsReference }) => {
  // 기본은 학번순 — 표를 처음 열었을 때 명단으로 읽히는 편이 자연스럽다
  const [sortKey, setSortKey] = useState<ShiftSortKey>('student');
  const [direction, setDirection] = useState<SortDirection>('asc');

  const toggle = (key: ShiftSortKey) => {
    if (key === sortKey) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    // 등급은 낮을수록 좋으므로 오름차순이 곧 '잘한 순'이다.
    // 변화량만 내림차순으로 시작하면 하락 폭이 큰 학생이 위로 와 눈에 띈다.
    setDirection(key === 'overallDelta' ? 'desc' : 'asc');
  };

  const sorted = useMemo(() => sortShiftRows(rows, sortKey, direction), [rows, sortKey, direction]);
  const withData = sorted.filter((r) => r.overall.from != null || r.overall.to != null).length;

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-10">표시할 학생이 없습니다.</p>;
  }

  return (
    <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold">
          학생별 등급 변화 — {fromLabel} → {toLabel}
        </h3>
        <p className="text-xs text-muted-foreground">
          전체 {rows.length}명 · 비교 가능 {withData}명
          {toIsReference && <span className="ml-1 text-amber-600">· {toLabel}은 참고 등급</span>}
        </p>
      </div>

      <p className="text-[11px] text-muted-foreground mb-2">
        칸은 <span className="tabular-nums">{fromLabel.slice(0, 2)} → {toLabel.slice(0, 2)}</span> 등급이고
        옆의 숫자가 변화입니다. 등급은 낮을수록 좋으므로{' '}
        <span className="text-emerald-600 font-medium">−가 향상</span>,{' '}
        <span className="text-rose-600 font-medium">+가 하락</span>입니다.
        전체는 국·수·영·탐(2과목 평균) 4개 영역의 평균이며, 절대평가인 한국사는 넣지 않습니다.
      </p>

      {/* 열이 8개라 좁은 화면에서는 가로 스크롤 — 본문이 밀리지 않게 자기 컨테이너에서 스크롤한다 */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-2 sticky left-0 bg-white/80 backdrop-blur-sm z-10">
                <SortButton active={sortKey === 'student'} direction={direction} onClick={() => toggle('student')}>
                  학생
                </SortButton>
              </th>
              {SHIFT_SLOTS.map(({ slot, label }) => (
                <th key={slot} className="py-2 px-2 text-center whitespace-nowrap">
                  <SortButton active={sortKey === slot} direction={direction} onClick={() => toggle(slot)}>
                    {label}
                  </SortButton>
                </th>
              ))}
              <th className="py-2 px-2 text-center whitespace-nowrap border-l border-slate-200">
                <div className="flex items-center justify-center gap-2">
                  <SortButton active={sortKey === 'overall'} direction={direction} onClick={() => toggle('overall')}>
                    전체
                  </SortButton>
                  {/* 등급 자체와 변화량은 다른 질문이다 — 따로 정렬할 수 있어야 한다 */}
                  <SortButton
                    active={sortKey === 'overallDelta'}
                    direction={direction}
                    onClick={() => toggle('overallDelta')}
                    className="text-[10px]"
                  >
                    변화
                  </SortButton>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.id} className="border-b border-slate-100 hover:bg-white/60">
                <td className="py-1.5 px-2 whitespace-nowrap sticky left-0 bg-white/80 backdrop-blur-sm">
                  <span className="text-slate-400 tabular-nums mr-1">
                    {row.classNum}-{String(row.number).padStart(2, '0')}
                  </span>
                  <span className="font-medium text-slate-700">{row.name}</span>
                </td>
                {SHIFT_SLOTS.map(({ slot }) => (
                  <td key={slot} className="py-1.5 px-2 text-center">
                    <GradeCell cell={row.cells[slot]} showSubject={slot === 'tamgu1' || slot === 'tamgu2'} />
                  </td>
                ))}
                <td className="py-1.5 px-2 text-center border-l border-slate-200">
                  {row.overall.from == null && row.overall.to == null ? (
                    <span className="text-slate-300">—</span>
                  ) : (
                    <div className="flex items-baseline justify-center gap-1 tabular-nums">
                      <span className="text-slate-400">{row.overall.from ?? '—'}</span>
                      <span className="text-slate-300 text-[10px]">→</span>
                      <span className="font-semibold text-slate-800">{row.overall.to ?? '—'}</span>
                      {row.overall.delta != null && row.overall.delta !== 0 && (
                        <span className={cn('text-[10px] font-semibold', deltaTone(row.overall.delta))}>
                          {deltaText(row.overall.delta)}
                        </span>
                      )}
                      {/* 영역 수가 4가 아니면 다른 학생과 같은 조건이 아니다 */}
                      {row.overall.areas > 0 && row.overall.areas < 4 && (
                        <span className="text-[9px] text-amber-600" title="두 달 모두 값이 있는 영역만 평균에 넣었습니다">
                          {row.overall.areas}영역
                        </span>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PyeonggawonStudentTable;
