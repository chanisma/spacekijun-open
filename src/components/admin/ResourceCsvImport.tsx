import { useState, useRef } from 'react';
import { Upload, Download, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { parseResourceCSV, validateResourceCSV } from '@/utils/resourceCsvParser';
import { withoutPersonalPhone } from '@/utils/resourceMetaPrivacy';

interface ResourceCsvImportProps {
  onImportComplete?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface ImportStats {
  total: number;
  updated: number;
  inserted: number;
  errors: number;
}

export function ResourceCsvImport({ onImportComplete, open: externalOpen, onOpenChange: externalOnOpenChange }: ResourceCsvImportProps) {
  const { toast } = useToast();
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = externalOpen !== undefined ? externalOpen : internalOpen;
  const setIsOpen = externalOnOpenChange || setInternalOpen;
  const [isProcessing, setIsProcessing] = useState(false);
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast({
        title: '오류',
        description: 'CSV 파일만 업로드할 수 있습니다.',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);
    setStats(null);
    setErrors([]);

    try {
      const text = await file.text();

      // Validate CSV format
      const validation = validateResourceCSV(text);
      if (!validation.valid) {
        toast({
          title: '파일 형식 오류',
          description: validation.error,
          variant: 'destructive',
        });
        setIsProcessing(false);
        return;
      }

      // Parse CSV
      const teachers = parseResourceCSV(text);

      if (teachers.length === 0) {
        toast({
          title: '경고',
          description: '파일에서 유효한 교사 데이터를 찾을 수 없습니다.',
          variant: 'destructive',
        });
        setIsProcessing(false);
        return;
      }

      // Import teachers with meta.section merge
      const importStats: ImportStats = {
        total: teachers.length,
        updated: 0,
        inserted: 0,
        errors: 0,
      };
      const errorMessages: string[] = [];

      for (const teacher of teachers) {
        try {
          // Check if teacher exists
          const { data: existingTeacher, error: fetchError } = await supabase
            .from('resource')
            .select('id, meta')
            .eq('name', teacher.name)
            .eq('type', 'teacher')
            .single();

          if (fetchError && fetchError.code !== 'PGRST116') {
            // Error other than "not found"
            throw fetchError;
          }

          if (existingTeacher) {
            // Teacher exists - merge meta.section
            const currentMeta = withoutPersonalPhone(
              existingTeacher.meta as Record<string, unknown> | null
            );
            const updatedMeta = {
              ...currentMeta,
              section: teacher.meta.section, // Overwrite only section field
            };

            const { error: updateError } = await supabase
              .from('resource')
              .update({
                meta: updatedMeta as any,
              })
              .eq('id', existingTeacher.id);

            if (updateError) {
              throw updateError;
            }

            importStats.updated++;
          } else {
            // Teacher doesn't exist - insert with meta.section
            const { error: insertError } = await supabase
              .from('resource')
              .insert([
                {
                  name: teacher.name,
                  type: 'teacher',
                  meta: {
                    email: 'NAN',
                    section: teacher.meta.section,
                  } as any,
                },
              ]);

            if (insertError) {
              throw insertError;
            }

            importStats.inserted++;
          }
        } catch (error) {
          importStats.errors++;
          const errorMsg = `${teacher.name}: ${error instanceof Error ? error.message : '알 수 없는 오류'}`;
          errorMessages.push(errorMsg);
          console.error('교사 처리 오류:', error);
        }
      }

      setStats(importStats);
      setErrors(errorMessages);

      if (importStats.errors === 0) {
        toast({
          title: '가져오기 완료',
          description: `${importStats.updated}개 교사 업데이트, ${importStats.inserted}개 교사 추가됨`,
        });

        if (onImportComplete) {
          onImportComplete();
        }

        // Close dialog on success
        setTimeout(() => {
          setIsOpen(false);
        }, 2000);
      } else {
        toast({
          title: '가져오기 완료 (일부 오류)',
          description: `${importStats.updated + importStats.inserted}개 성공, ${importStats.errors}개 실패`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('CSV 처리 오류:', error);
      toast({
        title: '가져오기 실패',
        description: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const downloadSampleCSV = () => {
    const sampleData = [
      '순번,교사성명,요일교시,학년과목(반),요일,교시,학년,반,과목',
      '1,김선생,월1,1학년 국어(1),월,1,1,1,국어',
      '2,김선생,월2,1학년 국어(1),월,2,1,1,국어',
      '3,김선생,화3,2학년 수학(3),화,3,2,3,수학',
      '4,박선생,월1,3학년 영어(5),월,1,3,5,영어',
      '5,박선생,화2,3학년 영어(5),화,2,3,5,영어',
    ].join('\n');

    const blob = new Blob([sampleData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'teacher_sections_sample.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // If externally controlled, don't render trigger
  if (externalOpen !== undefined) {
    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>수업 데이터 CSV 가져오기</DialogTitle>
            <DialogDescription>
              수업데이터.csv 파일을 업로드하여 교사별 담당 수업을 가져옵니다.
              <br />
              기존 교사는 수업 정보(meta.section)만 업데이트되고, 신규 교사는 추가됩니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="text-sm">
                  <p className="font-semibold mb-2">CSV 파일 형식:</p>
                  <code className="block bg-muted p-2 rounded text-xs">
                    순번,교사성명,요일교시,학년과목(반),요일,교시,학년,반,과목
                  </code>
                  <ul className="mt-2 space-y-1 text-xs">
                    <li>• 교사성명: 교사 이름 (필수)</li>
                    <li>• 과목: 과목명 (필수)</li>
                    <li>• 학년, 반: 학년과 반 (필수)</li>
                    <li>• 요일: 월/화/수/목/금 (필수)</li>
                    <li>• 교시: 1-7 (필수)</li>
                  </ul>
                </div>
              </AlertDescription>
            </Alert>

            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={downloadSampleCSV}>
                <Download className="h-4 w-4 mr-2" />
                샘플 파일 다운로드
              </Button>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">CSV 파일 선택</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                disabled={isProcessing}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {isProcessing && (
              <Alert>
                <AlertCircle className="h-4 w-4 animate-spin" />
                <AlertDescription>
                  파일을 처리하고 데이터베이스에 저장하고 있습니다...
                </AlertDescription>
              </Alert>
            )}

            {stats && (
              <Alert className={stats.errors === 0 ? 'border-green-500' : 'border-yellow-500'}>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <div className="font-semibold">가져오기 완료</div>
                    <div className="flex gap-2 flex-wrap">
                      <Badge variant="outline">전체: {stats.total}명</Badge>
                      <Badge className="bg-blue-500">업데이트: {stats.updated}명</Badge>
                      <Badge className="bg-green-500">추가: {stats.inserted}명</Badge>
                      {stats.errors > 0 && (
                        <Badge variant="destructive">오류: {stats.errors}명</Badge>
                      )}
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {errors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <div className="font-semibold">오류 발생:</div>
                    <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                      {errors.map((error, index) => (
                        <li key={index}>• {error}</li>
                      ))}
                    </ul>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileText className="h-4 w-4 mr-2" />
          수업 데이터 가져오기
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>수업 데이터 CSV 가져오기</DialogTitle>
          <DialogDescription>
            수업데이터.csv 파일을 업로드하여 교사별 담당 수업을 가져옵니다.
            <br />
            기존 교사는 수업 정보(meta.section)만 업데이트되고, 신규 교사는 추가됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* CSV Format Info */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="text-sm">
                <p className="font-semibold mb-2">CSV 파일 형식:</p>
                <code className="block bg-muted p-2 rounded text-xs">
                  순번,교사성명,요일교시,학년과목(반),요일,교시,학년,반,과목
                </code>
                <ul className="mt-2 space-y-1 text-xs">
                  <li>• 교사성명: 교사 이름 (필수)</li>
                  <li>• 과목: 과목명 (필수)</li>
                  <li>• 학년, 반: 학년과 반 (필수)</li>
                  <li>• 요일: 월/화/수/목/금 (필수)</li>
                  <li>• 교시: 1-7 (필수)</li>
                </ul>
              </div>
            </AlertDescription>
          </Alert>

          {/* Download Sample */}
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={downloadSampleCSV}>
              <Download className="h-4 w-4 mr-2" />
              샘플 파일 다운로드
            </Button>
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">CSV 파일 선택</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              disabled={isProcessing}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Processing Status */}
          {isProcessing && (
            <Alert>
              <AlertCircle className="h-4 w-4 animate-spin" />
              <AlertDescription>
                파일을 처리하고 데이터베이스에 저장하고 있습니다...
              </AlertDescription>
            </Alert>
          )}

          {/* Import Stats */}
          {stats && (
            <Alert className={stats.errors === 0 ? 'border-green-500' : 'border-yellow-500'}>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <div className="font-semibold">가져오기 완료</div>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="outline">전체: {stats.total}명</Badge>
                    <Badge className="bg-blue-500">업데이트: {stats.updated}명</Badge>
                    <Badge className="bg-green-500">추가: {stats.inserted}명</Badge>
                    {stats.errors > 0 && (
                      <Badge variant="destructive">오류: {stats.errors}명</Badge>
                    )}
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Errors */}
          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <div className="font-semibold">오류 발생:</div>
                  <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                    {errors.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
