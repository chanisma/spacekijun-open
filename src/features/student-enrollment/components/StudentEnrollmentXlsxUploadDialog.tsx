import { useState, useCallback } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { parseEnrollmentFiles, type ParseResult } from '../utils/parseEnrollmentXlsx';
import { useUpsertEnrollmentBatch } from '../hooks/useStudentEnrollments';

interface Props { open: boolean; onOpenChange: (open: boolean) => void; onImported?: () => void; }

export function StudentEnrollmentXlsxUploadDialog({ open, onOpenChange, onImported }: Props) {
  const { toast } = useToast();
  const upsertMut = useUpsertEnrollmentBatch();
  const [files, setFiles] = useState<File[]>([]);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback(async (selected: File[]) => {
    const xlsxFiles = selected.filter((f) => f.name.toLowerCase().endsWith('.xlsx'));
    setFiles(xlsxFiles);
    setParseResult(null);
    if (xlsxFiles.length === 0) {
      toast({ title: 'xlsx 파일이 없습니다', variant: 'destructive' });
      return;
    }
    const result = await parseEnrollmentFiles(xlsxFiles);
    setParseResult(result);
  }, [toast]);

  const totalRows = parseResult?.reports.reduce((s, r) => s + r.rows.length, 0) ?? 0;

  const handleUpload = async () => {
    if (!parseResult || parseResult.reports.length === 0) return;
    const allRows = parseResult.reports.flatMap((r) => r.rows);
    try {
      const result = await upsertMut.mutateAsync({ rows: allRows });
      toast({
        title: '업로드 완료',
        description: `${result.inserted}행 적재 · 교과 ${result.curriculumMatched}/${allRows.length} · 분반 ${result.offeringMatched}/${allRows.length} · 학생 ${result.studentMatched}/${allRows.length}`,
      });
      onImported?.();
      onOpenChange(false);
      setFiles([]);
      setParseResult(null);
    } catch (e) {
      toast({ title: '업로드 실패', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>학생편성현황 xlsx 업로드</DialogTitle>
          <DialogDescription>
            「학생편성현황(NNNN학년도 N학기 N학년).xlsx」 파일들. 학년도·학기는 파일명, 매칭은 자동.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(Array.from(e.dataTransfer.files)); }}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}`}
          >
            <Upload className="mx-auto h-10 w-10 text-muted-foreground/60 mb-3" />
            <p className="text-sm mb-2">파일을 끌어다 놓거나</p>
            <Label htmlFor="enroll-xlsx" className="cursor-pointer text-sm text-primary underline">
              파일 선택
              <Input id="enroll-xlsx" type="file" accept=".xlsx" multiple className="hidden" onChange={(e) => e.target.files && handleFiles(Array.from(e.target.files))} />
            </Label>
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">선택된 파일 {files.length}개</p>
              <div className="border rounded-md max-h-[200px] overflow-y-auto">
                {parseResult?.reports.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 border-b last:border-b-0 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="flex-1 truncate">{r.academicYear}학년도 {r.semester}학기</span>
                    <Badge variant="secondary">{r.rows.length}행</Badge>
                  </div>
                ))}
                {parseResult?.errors.map((err, i) => (
                  <div key={`err-${i}`} className="flex items-center gap-3 p-2 border-b last:border-b-0 text-sm bg-destructive/5">
                    <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{err.filename}</div>
                      <div className="text-xs text-destructive truncate">{err.message}</div>
                    </div>
                  </div>
                ))}
              </div>
              {totalRows > 0 && (
                <Alert>
                  <AlertDescription className="text-sm">
                    <strong>{totalRows}행</strong> 추가/갱신. 같은 (학년도·학기·과목·강의실·학생) 키 충돌 시 덮어씁니다. 처리는 500개 단위 chunk.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={handleUpload} disabled={!parseResult || parseResult.reports.length === 0 || upsertMut.isPending}>
            {upsertMut.isPending ? '업로드 중...' : `${totalRows}행 업로드`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
