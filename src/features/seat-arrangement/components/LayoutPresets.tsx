import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PRESETS, computeRows, seatsPerRowFor } from '../utils/presets';
import type { CellState } from '../types';

interface LayoutPresetsProps {
  studentCount: number;
  onApply: (input: {
    rows: number;
    columns: number;
    cells: CellState[][];
    pairing: 'single' | 'pair';
    name: string;
  }) => void;
}

export function LayoutPresets({ studentCount, onApply }: LayoutPresetsProps) {
  const presetMeta = PRESETS.filter((p) => p.key !== 'free').map((preset) => {
    const seatsPerRow = seatsPerRowFor(preset);
    const adaptedRows = computeRows(studentCount, seatsPerRow, preset.rows);
    const totalSeatCount =
      preset.pairing === 'pair' ? adaptedRows * seatsPerRow : adaptedRows * preset.columns;
    return { preset, adaptedRows, seatsPerRow, totalSeatCount };
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-medium text-slate-700">프리셋</div>
        {studentCount > 0 && (
          <div className="text-[11px] text-slate-500">학생 {studentCount}명 기준</div>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2">
        {presetMeta.map(({ preset, adaptedRows, seatsPerRow, totalSeatCount }) => (
          <Button
            key={preset.key}
            variant="outline"
            size="sm"
            className="justify-start text-left h-auto py-2"
            onClick={() => {
              const cells = preset.build(adaptedRows, preset.columns);
              onApply({
                rows: adaptedRows,
                columns: preset.columns,
                cells,
                pairing: preset.pairing,
                name: `${preset.label} (${adaptedRows}행)`,
              });
            }}
          >
            <div className="w-full">
              <div className="font-medium text-xs flex items-center justify-between gap-2">
                <span>{preset.label}</span>
                <span className="text-[10px] font-mono text-slate-500">
                  {adaptedRows}행 · {totalSeatCount}석
                </span>
              </div>
              <div className="text-[11px] text-slate-500">
                한 행 {seatsPerRow}명 · 학생 수에 맞춰 행 자동
              </div>
            </div>
          </Button>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 text-center pt-1">
        프리셋 적용 후 좌측 편집기에서 행/열·통로·사용불가 셀을 자유롭게 수정할 수 있습니다.
      </p>
    </Card>
  );
}
