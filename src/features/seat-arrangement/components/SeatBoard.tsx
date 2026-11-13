import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pencil, MousePointer2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SeatGrid } from './SeatGrid';
import type { Arrangement, CellState, Constraint, SeatLayout, SeatStudent } from '../types';

interface SeatBoardProps {
  layout: SeatLayout;
  arrangement: Arrangement | undefined;
  students: SeatStudent[];
  constraints: Constraint[];
  paintTool: CellState | null;
  onPaintToolChange: (tool: CellState | null) => void;
  onResize: (rows: number, columns: number) => void;
  onPaint: (row: number, col: number, state: CellState) => void;
  onSwap: (seatA: string, seatB: string) => void;
  onSeatClick: (seat: string, currentResourceId: string | null) => void;
}

export function SeatBoard({
  layout,
  arrangement,
  students,
  constraints,
  paintTool,
  onPaintToolChange,
  onResize,
  onPaint,
  onSwap,
  onSeatClick,
}: SeatBoardProps) {
  const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);
  const inPaintMode = paintTool != null;

  return (
    <Card className="p-4 print:p-0 print:shadow-none print:border-0">
      {/* 헤더: 행/열 입력 + 도구 토글 */}
      <div className="seat-print-hide flex flex-wrap items-end justify-between gap-3 mb-3 pb-3 border-b">
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <Label className="text-[11px] text-slate-500">행</Label>
            <Input
              type="number"
              min={1}
              max={20}
              value={layout.totalRows}
              onChange={(e) =>
                onResize(clamp(parseInt(e.target.value, 10) || 1, 1, 20), layout.totalColumns)
              }
              className="w-16 h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-slate-500">열</Label>
            <Input
              type="number"
              min={1}
              max={20}
              value={layout.totalColumns}
              onChange={(e) =>
                onResize(layout.totalRows, clamp(parseInt(e.target.value, 10) || 1, 1, 20))
              }
              className="w-16 h-8 text-sm"
            />
          </div>
          <div className="text-xs text-slate-500 pb-2">{layout.name}</div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-500 mr-1">
            <Pencil className="h-3 w-3 inline mr-0.5" />
            편집 도구
          </span>
          <Button
            type="button"
            size="sm"
            variant={paintTool === 1 ? 'default' : 'outline'}
            onClick={() => onPaintToolChange(paintTool === 1 ? null : 1)}
            className="h-8 px-2.5"
          >
            <span className="inline-block w-3 h-3 mr-1.5 bg-white border border-slate-400 rounded-sm" />
            좌석
          </Button>
          <Button
            type="button"
            size="sm"
            variant={paintTool === 0 ? 'default' : 'outline'}
            onClick={() => onPaintToolChange(paintTool === 0 ? null : 0)}
            className="h-8 px-2.5"
          >
            <span className="inline-block w-3 h-3 mr-1.5 border border-dashed border-slate-400 rounded-sm" />
            통로
          </Button>
          <Button
            type="button"
            size="sm"
            variant={paintTool === 2 ? 'default' : 'outline'}
            onClick={() => onPaintToolChange(paintTool === 2 ? null : 2)}
            className="h-8 px-2.5"
          >
            <span className="inline-block w-3 h-3 mr-1.5 bg-slate-200 border border-slate-400 rounded-sm" />
            X
          </Button>
          {inPaintMode && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onPaintToolChange(null)}
              className="h-8 px-2.5 text-blue-600 hover:text-blue-700"
            >
              <MousePointer2 className="h-3.5 w-3.5 mr-1" />
              배치 모드
            </Button>
          )}
        </div>
      </div>

      {/* 모드 안내 */}
      <div className="seat-print-hide mb-2">
        <p
          className={cn(
            'text-[11px] px-2 py-1.5 rounded',
            inPaintMode ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-500'
          )}
        >
          {inPaintMode ? (
            <>
              <strong>편집 모드:</strong> 셀을 클릭/드래그하여 좌석/통로/X를 칠합니다. (도구를 다시
              누르거나 "배치 모드"를 누르면 종료)
            </>
          ) : (
            <>
              <strong>배치 모드:</strong> 학생 카드를 다른 좌석으로 드래그해 swap, 빈 좌석을
              클릭하면 학생을 고정 배치할 수 있습니다.
            </>
          )}
        </p>
      </div>

      {/* 인쇄용 타이틀 */}
      <div className="hidden print:block">
        <h2 className="seat-print-title">
          {students[0]
            ? `${students[0].grade}학년 ${students[0].classNum}반 자리 배치`
            : '자리 배치'}
        </h2>
      </div>

      <SeatGrid
        layout={layout}
        arrangement={arrangement}
        students={students}
        constraints={constraints}
        onSwap={onSwap}
        onSeatClick={onSeatClick}
        paintTool={paintTool}
        onPaint={onPaint}
      />
    </Card>
  );
}
