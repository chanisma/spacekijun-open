import { DIALOG_HEADER_CLASS, DIALOG_FOOTER_CLASS } from '@/components/timetable/timetableDialogDesign';
import { useState, useRef } from 'react';
import { Upload, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useAcademicTerm } from '@/hooks/useAcademicTerm';
import {
  parseStudentTimetableExcel,
  matchStudentsAndBuild,
  saveStudentTimetables,
  type ParseResult,
} from '@/utils/studentTimetableParser';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultAcademicYear: number;
  defaultSemester: number;
  /** 업로드 성공 시(워크플로 WORK 완료 기록용) */
  onImported?: () => void;
}

export function StudentTimetableUploadDialog({
  open,
  onOpenChange,
  onImported,
  defaultAcademicYear,
  defaultSemester,
}: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: academicTerm } = useAcademicTerm();
  const [academicYear, setAcademicYear] = useState(defaultAcademicYear);
  const [semester, setSemester] = useState(defaultSemester);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [includeMismatch, setIncludeMismatch] = useState(false);
  const [phase, setPhase] = useState<'select' | 'parsing' | 'preview' | 'saving' | 'done'>('select');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  // 저장 결과의 실패 목록. 종전엔 saveStudentTimetables가 돌려주는 errors를 아무도 읽지
  // 않고 "저장 완료"를 띄운 뒤 닫아, 실패한 학생이 화면에 한 번도 나타나지 않았다.
  const [saveErrors, setSaveErrors] = useState<string[]>([]);
  const [wiped, setWiped] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhase('parsing');
    setParseResult(null);
    try {
      const rows = await parseStudentTimetableExcel(file);
      const result = await matchStudentsAndBuild(rows);
      setParseResult(result);
      setPhase('preview');
    } catch (err) {
      toast({
        title: '파싱 실패',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
      setPhase('select');
    }
  };

  // 업로드 학기가 학사력(현행)과 같은지 — meta dual-write 여부를 결정한다.
  // 학사력 미설정이면 구 동작(항상 갱신)을 유지한다.
  const isCurrentTerm =
    !academicTerm ||
    (academicTerm.year === academicYear && academicTerm.semester === semester);

  const handleSave = async () => {
    if (!parseResult) return;
    setPhase('saving');
    try {
      const result = await saveStudentTimetables(
        parseResult.students,
        includeMismatch,
        (current, total) => setProgress({ current, total }),
        { academicYear, semester, syncResourceMeta: isCurrentTerm }
      );
      qc.invalidateQueries({ queryKey: ['student_timetable'] });
      onImported?.();

      // 실패가 하나라도 있으면 닫지 않는다. 특히 `wiped`(삭제는 됐는데 재적재 실패)는
      // 그 학생 시간표가 **지금 비어 있다**는 뜻이라, 관리자가 보지 못한 채 창이 닫히면
      // 아무도 모르는 데이터 구멍이 된다.
      if (result.errors.length > 0) {
        setSaveErrors(result.errors);
        setWiped(result.wiped);
        toast({
          title: result.wiped.length > 0 ? '일부 학생 시간표가 비었습니다' : '일부 저장 실패',
          description:
            `성공 ${result.saved}명 · 실패 ${result.errors.length}건` +
            (result.wiped.length > 0 ? ` · 재적재 실패 ${result.wiped.length}명(시간표 비어 있음)` : ''),
          variant: 'destructive',
        });
        setPhase('preview');
        return;
      }

      toast({
        title: '저장 완료',
        description:
          `${result.saved}명 시간표 저장 · ${result.tableRows}행 student_timetable 적재 · 스킵 ${result.skipped}` +
          (isCurrentTerm ? '' : ' · 비현행 학기라 resource.meta는 보존'),
      });
      onOpenChange(false);
      setPhase('select');
      setParseResult(null);
      setSaveErrors([]);
      setWiped([]);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      toast({
        title: '저장 실패',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
      setPhase('preview');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle>학생 시간표 업로드</DialogTitle>
          <DialogDescription>
            엑셀 파일을 확인하고 등록하세요. 선택한 학년도의 학기 시간표가 새 파일의 내용으로 교체됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-7">
          <Alert variant={isCurrentTerm ? 'default' : undefined}>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>{academicYear}학년도 {semester}학기</strong>로 등록됩니다.
              {isCurrentTerm ? (
                <> 현재 학사력 학기이므로 학생 화면에 즉시 반영됩니다.</>
              ) : (
                <>
                  {' '}현재 학사력({academicTerm?.year}학년도 {academicTerm?.semester}학기)과 다른 학기입니다 —
                  데이터는 적재되지만 학생 화면에는 학사력을 이 학기로 바꿀 때 나타납니다.
                  현행 학기 스냅샷(resource.meta)은 건드리지 않습니다.
                </>
              )}
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ay">운영 학년도</Label>
              <Input
                id="ay"
                type="number"
                min={2020}
                max={2040}
                value={academicYear}
                onChange={(e) => setAcademicYear(parseInt(e.target.value, 10))}
              />
            </div>
            <div>
              <Label htmlFor="sem">학기</Label>
              <Input
                id="sem"
                type="number"
                min={1}
                max={2}
                value={semester}
                onChange={(e) => setSemester(parseInt(e.target.value, 10))}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="tt-file">CSV/xlsx 파일</Label>
            <input
              ref={fileRef}
              id="tt-file"
              type="file"
              accept=".xlsx,.csv"
              onChange={handleFileSelect}
              disabled={phase === 'parsing' || phase === 'saving'}
              className="block w-full mt-1 text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
            />
          </div>

          {phase === 'parsing' && (
            <Alert>
              <AlertDescription>파싱 중...</AlertDescription>
            </Alert>
          )}

          {phase === 'preview' && saveErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription className="space-y-2">
                {wiped.length > 0 && (
                  <p className="font-semibold">
                    아래 {wiped.length}명은 기존 시간표가 삭제된 뒤 재적재에 실패해
                    <span className="underline underline-offset-2"> 지금 시간표가 비어 있습니다</span>.
                    다시 저장해 주세요.
                  </p>
                )}
                {wiped.length > 0 && (
                  <p className="text-xs break-words">{wiped.join(' · ')}</p>
                )}
                <details>
                  <summary className="cursor-pointer text-xs font-medium">
                    실패 {saveErrors.length}건 자세히 보기
                  </summary>
                  <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-xs">
                    {saveErrors.map((message, index) => (
                      <li key={index} className="break-words">{message}</li>
                    ))}
                  </ul>
                </details>
              </AlertDescription>
            </Alert>
          )}

          {parseResult && phase === 'preview' && (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="border rounded p-2">
                  <div className="text-xs text-muted-foreground">총 행</div>
                  <div className="text-lg font-semibold">{parseResult.totalRows}</div>
                </div>
                <div className="border rounded p-2">
                  <div className="text-xs text-muted-foreground">매칭 학생</div>
                  <div className="text-lg font-semibold text-green-600">{parseResult.matched}</div>
                </div>
                <div className="border rounded p-2">
                  <div className="text-xs text-muted-foreground">이름 불일치</div>
                  <div className="text-lg font-semibold text-amber-600">{parseResult.nameMismatch}</div>
                </div>
                <div className="border rounded p-2">
                  <div className="text-xs text-muted-foreground">미발견</div>
                  <div className="text-lg font-semibold text-red-600">{parseResult.notFound}</div>
                </div>
              </div>

              {parseResult.nameMismatch > 0 && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={includeMismatch}
                    onChange={(e) => setIncludeMismatch(e.target.checked)}
                  />
                  이름 불일치 학생도 저장 (학년·반·번호로만 매칭됨)
                </label>
              )}

              {parseResult.errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    파싱 오류 {parseResult.errors.length}건 (콘솔 확인)
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {phase === 'saving' && (
            <Alert>
              <AlertDescription>
                저장 중... {progress.current} / {progress.total}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className={DIALOG_FOOTER_CLASS}>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={handleSave}
            disabled={!parseResult || phase !== 'preview'}
          >
            <Upload className="h-4 w-4 mr-2" />
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
