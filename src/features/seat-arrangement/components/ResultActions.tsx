import { Button } from '@/components/ui/button';
import { RefreshCw, Printer, Trash2, AlertTriangle, Info } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface HeaderActionsProps {
  onShuffle: () => void;
  onPrint: () => void;
  onReset: () => void;
  canShuffle: boolean;
  canPrint: boolean;
}

export function HeaderActions({
  onShuffle,
  onPrint,
  onReset,
  canShuffle,
  canPrint,
}: HeaderActionsProps) {
  return (
    <div className="seat-print-hide flex items-center gap-2">
      <Button onClick={onShuffle} disabled={!canShuffle} size="sm">
        <RefreshCw className="h-4 w-4 mr-1.5" />
        자동 배치 / 다시 섞기
      </Button>
      <Button variant="outline" onClick={onPrint} disabled={!canPrint} size="sm">
        <Printer className="h-4 w-4 mr-1.5" />
        인쇄
      </Button>
      <Button variant="ghost" onClick={onReset} disabled={!canShuffle} size="sm">
        <Trash2 className="h-4 w-4 mr-1.5" />
        초기화
      </Button>
    </div>
  );
}

interface ResultBannersProps {
  warnings?: string[];
  unassignedCount?: number;
  emptySeatCount?: number;
}

export function ResultBanners({
  warnings = [],
  unassignedCount = 0,
  emptySeatCount = 0,
}: ResultBannersProps) {
  const hasEmpty = emptySeatCount > 0;
  const hasWarnings = warnings.length > 0 || unassignedCount > 0;
  if (!hasEmpty && !hasWarnings) return null;

  return (
    <Card className="p-3 space-y-2 print:hidden">
      {hasEmpty && (
        <div className="rounded-md bg-blue-50 border border-blue-200 p-2.5 space-y-1">
          <div className="flex items-center gap-1.5 text-blue-700 text-xs font-medium">
            <Info className="h-3.5 w-3.5" />
            좌석이 학생보다 많습니다 (빈 좌석 {emptySeatCount}개)
          </div>
          <p className="text-[11px] text-blue-700/80">
            좌석을 줄이려면 좌측 편집기에서 행/열을 줄이거나, 빈 칸을
            <strong> 통로</strong> 또는 <strong>사용불가</strong>로 칠하세요.
          </p>
        </div>
      )}

      {hasWarnings && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-2.5 space-y-1">
          <div className="flex items-center gap-1.5 text-amber-700 text-xs font-medium">
            <AlertTriangle className="h-3.5 w-3.5" />
            제약을 모두 만족시키지 못했습니다
          </div>
          <ul className="text-[11px] text-amber-700/80 list-disc pl-4 space-y-0.5">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
            {unassignedCount > 0 && <li>좌석 부족 학생 {unassignedCount}명</li>}
          </ul>
        </div>
      )}
    </Card>
  );
}
