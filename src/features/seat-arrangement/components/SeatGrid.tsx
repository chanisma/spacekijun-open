import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import React, { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { Arrangement, CellState, Constraint, SeatLayout, SeatStudent } from '../types';
import { seatNumber } from '../utils/seatGeometry';

interface SeatGridProps {
  layout: SeatLayout;
  arrangement: Arrangement | undefined;
  students: SeatStudent[];
  constraints: Constraint[];
  onSwap?: (seatA: string, seatB: string) => void;
  onSeatClick?: (seat: string, currentResourceId: string | null) => void;
  highlightSeat?: string | null;
  // 페인트 모드: null이면 배치 모드, 0/1/2면 페인트 모드
  paintTool?: CellState | null;
  onPaint?: (row: number, col: number, state: CellState) => void;
}

interface SeatCellProps {
  row: number;
  col: number;
  seat: string;
  state: CellState;
  studentId: string | null;
  studentName: string | null;
  studentNumber: number | null;
  fixed: boolean;
  highlighted: boolean;
  onClick?: () => void;
  paintMode: boolean;
  paintTool: CellState | null;
  onPaintMouseDown?: (row: number, col: number) => void;
  onPaintMouseEnter?: (row: number, col: number) => void;
}

function SeatCell({
  row,
  col,
  seat,
  state,
  studentId,
  studentName,
  studentNumber,
  fixed,
  highlighted,
  onClick,
  paintMode,
  paintTool,
  onPaintMouseDown,
  onPaintMouseEnter,
}: SeatCellProps) {
  // hooks는 항상 호출. paintMode면 disabled.
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `seat:${seat}`,
    disabled: state !== 1 || paintMode,
  });
  const draggable = useDraggable({
    id: `student:${seat}`,
    data: { seat, studentId },
    disabled: state !== 1 || !studentId || paintMode,
  });

  // 페인트 모드: 모든 셀이 페인트 가능
  if (paintMode) {
    return (
      <div
        onMouseDown={() => onPaintMouseDown?.(row, col)}
        onMouseEnter={() => onPaintMouseEnter?.(row, col)}
        className={cn(
          'relative w-14 h-14 rounded-md border flex items-center justify-center text-[10px] cursor-cell select-none transition-colors',
          state === 1 &&
            'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 shadow-sm',
          state === 0 &&
            'bg-transparent border-dashed border-slate-300 dark:border-slate-700 opacity-60',
          state === 2 && 'bg-slate-200 dark:bg-slate-700 border-slate-300',
          paintTool === 1 && 'hover:bg-blue-50 hover:border-blue-300',
          paintTool === 0 && 'hover:bg-slate-100 hover:border-slate-400',
          paintTool === 2 && 'hover:bg-rose-50 hover:border-rose-300'
        )}
        title={state === 0 ? '통로' : state === 2 ? '사용불가' : seat}
      >
        {state !== 0 && (
          <span className="font-mono text-slate-500 text-[10px]">{seat}</span>
        )}
        {state === 2 && (
          <span className="absolute inset-0 flex items-center justify-center text-red-500/60 font-bold text-lg pointer-events-none">
            ✕
          </span>
        )}
      </div>
    );
  }

  // 배치 모드 — 통로/X는 본래 모양
  if (state === 0) {
    return <div className="w-14 h-14" aria-hidden="true" />;
  }
  if (state === 2) {
    return (
      <div
        className="w-14 h-14 rounded-md bg-slate-200 dark:bg-slate-700 border border-slate-300 flex items-center justify-center text-red-500/60 text-lg font-bold opacity-70 select-none"
        title={`${seat} 사용불가`}
      >
        ✕
      </div>
    );
  }

  return (
    <div
      ref={setDropRef}
      onClick={onClick}
      className={cn(
        'relative w-14 h-14 rounded-md border flex flex-col items-center justify-center text-[10px] cursor-pointer transition-colors',
        'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 shadow-sm',
        isOver && 'ring-2 ring-blue-400 bg-blue-50 dark:bg-blue-900/30',
        highlighted && 'ring-2 ring-amber-400',
        !studentId && 'text-slate-400 hover:bg-slate-50'
      )}
      title={seat}
    >
      <span className="seat-cell-label absolute top-0.5 left-1 text-[8px] text-slate-400 font-mono">
        {seat}
      </span>
      {fixed && (
        <span
          className="absolute top-0.5 right-1 text-[8px] text-purple-500"
          title="고정 좌석"
        >
          📌
        </span>
      )}
      {studentId && studentName && (
        <button
          type="button"
          ref={draggable.setNodeRef}
          {...draggable.listeners}
          {...draggable.attributes}
          onClick={(e) => e.stopPropagation()}
          style={{
            transform: draggable.transform
              ? `translate3d(${draggable.transform.x}px, ${draggable.transform.y}px, 0)`
              : undefined,
            zIndex: draggable.isDragging ? 50 : undefined,
          }}
          className={cn(
            'mt-2 flex flex-col items-center text-center font-medium text-slate-800 dark:text-slate-100 cursor-grab active:cursor-grabbing leading-tight',
            draggable.isDragging && 'opacity-60'
          )}
        >
          <span className="seat-cell-name text-[11px] max-w-full overflow-hidden text-ellipsis whitespace-nowrap px-0.5">
            {studentName}
          </span>
          {studentNumber ? (
            <span className="seat-cell-number text-[9px] text-slate-500 font-mono">
              {studentNumber}번
            </span>
          ) : null}
        </button>
      )}
    </div>
  );
}

export function SeatGrid({
  layout,
  arrangement,
  students,
  constraints,
  onSwap,
  onSeatClick,
  highlightSeat,
  paintTool = null,
  onPaint,
}: SeatGridProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const paintMode = paintTool != null;
  const [dragging, setDragging] = useState(false);

  const studentMap = useMemo(() => {
    const m = new Map<string, SeatStudent>();
    students.forEach((s) => m.set(s.resourceId, s));
    return m;
  }, [students]);

  const fixedSeatSet = useMemo(() => {
    const set = new Set<string>();
    for (const c of constraints) {
      if (c.kind === 'fixed') set.add(c.seat);
    }
    return set;
  }, [constraints]);

  const handleDragEnd = (e: DragEndEvent) => {
    if (!onSwap || !e.over) return;
    const fromId = String(e.active.id);
    const toId = String(e.over.id);
    if (!fromId.startsWith('student:') || !toId.startsWith('seat:')) return;
    const fromSeat = fromId.slice('student:'.length);
    const toSeat = toId.slice('seat:'.length);
    if (fromSeat === toSeat) return;
    onSwap(fromSeat, toSeat);
  };

  const handlePaintDown = (row: number, col: number) => {
    if (paintTool == null || !onPaint) return;
    setDragging(true);
    onPaint(row, col, paintTool);
  };

  const handlePaintEnter = (row: number, col: number) => {
    if (!dragging || paintTool == null || !onPaint) return;
    onPaint(row, col, paintTool);
  };

  // 전역 mouseup으로 드래그 해제
  useEffect(() => {
    const onUp = () => setDragging(false);
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, []);

  return (
    <div className="space-y-3 print:space-y-2">
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="overflow-x-auto bg-slate-50 dark:bg-slate-900 rounded-lg p-3 border print:border-0 print:bg-white print:p-0 print:overflow-visible">
          <div
            className="seat-grid grid gap-1 mx-auto"
            style={{
              ['--cols' as string]: String(layout.totalColumns),
              gridTemplateColumns: `repeat(${layout.totalColumns}, minmax(3.5rem, 3.5rem))`,
              width: 'fit-content',
            } as React.CSSProperties}
          >
            {Array.from({ length: layout.totalRows }).flatMap((_, r) =>
              Array.from({ length: layout.totalColumns }).map((__, c) => {
                const state = (layout.cells[r]?.[c] ?? 0) as CellState;
                const seat = seatNumber(r, c);
                const rid = arrangement?.seatToStudent[seat] ?? null;
                const student = rid ? studentMap.get(rid) : null;
                const studentName = student ? student.name : rid ? '(이름 미상)' : null;
                const studentNumber = student?.number ?? null;
                return (
                  <SeatCell
                    key={`${r}-${c}`}
                    row={r}
                    col={c}
                    seat={seat}
                    state={state}
                    studentId={rid}
                    studentName={studentName}
                    studentNumber={studentNumber}
                    fixed={fixedSeatSet.has(seat)}
                    highlighted={highlightSeat === seat}
                    onClick={state === 1 && !paintMode ? () => onSeatClick?.(seat, rid) : undefined}
                    paintMode={paintMode}
                    paintTool={paintTool}
                    onPaintMouseDown={handlePaintDown}
                    onPaintMouseEnter={handlePaintEnter}
                  />
                );
              })
            )}
          </div>
        </div>
      </DndContext>
      <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500 uppercase tracking-widest mt-2 print:text-xs print:text-slate-700 print:mt-3">
        <span className="h-px bg-slate-300 flex-1 print:bg-slate-400" />
        교탁 / Front
        <span className="h-px bg-slate-300 flex-1 print:bg-slate-400" />
      </div>
    </div>
  );
}
