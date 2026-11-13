import { useState } from 'react';
import { Copy, Download } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { spreadsheetText } from '@/lib/submissionSpreadsheet';

export function SubmissionDataActions({
  rows,
  title,
  draft = false,
}: {
  rows: string[][];
  title: string;
  draft?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const XLSX = await import('xlsx');
      const book = XLSX.utils.book_new();
      // All cells are strings: formula-like values and leading zeros remain literal.
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), '제출 데이터');
      XLSX.writeFile(book, `${title.replace(/[\\/:*?"<>|]/g, '_')}_제출데이터.xlsx`);
    } catch {
      toast.error('엑셀 파일을 만들지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 rounded-lg text-xs"
        disabled={rows.length < 2}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(spreadsheetText(rows));
            toast.success('복사했습니다. 엑셀이나 스프레드시트에 붙여넣으세요.');
          } catch {
            toast.error('복사 권한을 확인해 주세요. 엑셀 다운로드도 사용할 수 있습니다.');
          }
        }}
      >
        <Copy className="h-3.5 w-3.5" />
        {draft ? '작성 내용 복사' : '표 복사'}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 rounded-lg text-xs"
        disabled={busy || rows.length < 2}
        onClick={() => void download()}
      >
        <Download className="h-3.5 w-3.5" />
        {busy ? '파일 생성 중' : '엑셀 다운로드'}
      </Button>
    </div>
  );
}
