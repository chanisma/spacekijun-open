import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface SeatNotesProps {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}

export function SeatNotes({ value, onChange, disabled }: SeatNotesProps) {
  return (
    <Card className="seat-notes-card p-4 print:p-0 print:shadow-none print:border-0">
      <Label
        htmlFor="seat-notes"
        className="seat-print-hide text-xs text-slate-600 mb-1.5 block"
      >
        좌석표 하단 메모 (인쇄에 함께 출력됩니다)
      </Label>
      <Textarea
        id="seat-notes"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={
          disabled
            ? '학년·반을 선택하면 메모를 입력할 수 있습니다'
            : '예) 2026학년도 1학기 자리 배치\n담임: 홍길동\n특이사항: 시력 약한 학생 앞쪽 배치 권장'
        }
        className="seat-notes-textarea text-center min-h-[88px] resize-y print:resize-none print:bg-transparent print:border-0 print:p-0 print:shadow-none print:focus:ring-0"
      />
    </Card>
  );
}
