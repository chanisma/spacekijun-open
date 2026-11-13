import { useState, useCallback } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { parseReportFiles, type ParseResult } from '../utils/parseXlsxReport';
import { useUpsertCurriculumBatch } from '../hooks/useCurriculum';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultAcademicYear: number;
  /** 업로드 성공 시(워크플로 WORK 완료 기록용) */
  onImported?: () => void;
}

export function CurriculumXlsxUploadDialog({ open, onOpenChange, defaultAcademicYear, onImported }: Props) {
  const { toast } = useToast();
  const upsertMut = useUpsertCurriculumBatch();
  const [academicYear, setAcademicYear] = useState(defaultAcademicYear);
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
    const result = await parseReportFiles(xlsxFiles, academicYear);
    setParseResult(result);
  }, [academicYear, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(Array.from(e.dataTransfer.files));
  }, [handleFiles]);

  const handleSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(Array.from(e.target.files));
  }, [handleFiles]);

  const totalRows = parseResult?.reports.reduce((s, r) => s + r.rows.length, 0) ?? 0;

  const handleUpload = async () => {
    if (!parseResult || parseResult.reports.length === 0) return;
    const allRows = parseResult.reports.flatMap((r) => r.rows);
    try {
      const inserted = await upsertMut.mutateAsync(allRows);
      toast({
        title: '업로드 완료',
        description: `${inserted.length}개 행이 적재(추가/갱신)되었습니다.`,
      });
      onImported?.();
      onOpenChange(false);
      setFiles([]);
      setParseResult(null);
    } catch (e) {
      toast({
        title: '업로드 실패',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  };

  const reset = () => {
    setFiles([]);
    setParseResult(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>xlsx 보고서 업로드</DialogTitle>
          <DialogDescription>
            「학교교육과정 편제 및 시간배당 관리 보고서(N학기 N학년).xlsx」 파일을 한 번에 여러 개 업로드할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-[160px_1fr] gap-3 items-center">
            <Label htmlFor="academic-year">운영 학년도</Label>
            <Input
              id="academic-year"
              type="number"
              min={2020}
              max={2040}
              value={academicYear}
              onChange={(e) => setAcademicYear(parseInt(e.target.value, 10))}
              className="w-32"
            />
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
            }`}
          >
            <Upload className="mx-auto h-10 w-10 text-muted-foreground/60 mb-3" />
            <p className="text-sm mb-2">파일을 끌어다 놓거나</p>
            <Label htmlFor="xlsx-file" className="cursor-pointer text-sm text-primary underline">
              파일 선택
              <Input
                id="xlsx-file"
                type="file"
                accept=".xlsx"
                multiple
                className="hidden"
                onChange={handleSelect}
              />
            </Label>
            <p className="text-xs text-muted-foreground mt-3">
              파일명에 「(1학기 1학년)」 같은 패턴이 있어야 학년·학기를 자동 인식합니다.
            </p>
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">선택된 파일 {files.length}개</p>
                <Button variant="ghost" size="sm" onClick={reset}>
                  <X className="h-3 w-3 mr-1" /> 초기화
                </Button>
              </div>
              <div className="border rounded-md max-h-[200px] overflow-y-auto">
                {parseResult?.reports.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 border-b last:border-b-0 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="flex-1 truncate">
                      {r.academicYear}학년도 {r.grade}학년 {r.semester}학기
                    </span>
                    <Badge variant="secondary">{r.rows.length}과목</Badge>
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
                    총 <strong>{totalRows}개 과목</strong>이 추가/갱신될 예정입니다. 같은 (학년도·학년·학기·과목명) 키가 이미 있으면 학점·시수·성적유형이 새 값으로 덮어쓰여집니다.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button
            onClick={handleUpload}
            disabled={!parseResult || parseResult.reports.length === 0 || upsertMut.isPending}
          >
            {upsertMut.isPending ? '업로드 중...' : `${totalRows}개 행 업로드`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
