import { useState, useRef } from 'react';
import { Upload, Download, FileText, Users, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DialogFooter,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { parseTimetableCSV, validateTimetableCSV } from '@/utils/timetableCsvParser';

interface TimetableBulkImportProps {
  onImportComplete: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface TeacherPreview {
  name: string;
  sections: string[];
  allWeekdayTimes: string[];
}

export const TimetableBulkImport = ({ onImportComplete, open: externalOpen, onOpenChange: externalOnOpenChange }: TimetableBulkImportProps) => {
  const { toast } = useToast();
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = externalOpen !== undefined ? externalOpen : internalOpen;
  const setIsOpen = externalOnOpenChange || setInternalOpen;
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<TeacherPreview[]>([]);
  const [validationError, setValidationError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
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

    try {
      const text = await file.text();

      // Validate CSV format
      const validation = validateTimetableCSV(text);
      if (!validation.valid) {
        setValidationError(validation.error || '알 수 없는 오류');
        setPreview([]);
        return;
      }

      // Parse CSV and create preview
      const teachers = parseTimetableCSV(text);
      const teacherPreviews: TeacherPreview[] = teachers.map(teacher => {
        const sections = Object.keys(teacher.meta.section);
        const allWeekdayTimes = new Set<string>();

        // Collect all unique weekday times from all sections
        Object.values(teacher.meta.section).forEach(sectionData => {
          sectionData.time.forEach(time => allWeekdayTimes.add(time));
        });

        return {
          name: teacher.name,
          sections,
          allWeekdayTimes: Array.from(allWeekdayTimes).sort((a, b) => parseInt(a) - parseInt(b))
        };
      });

      setPreview(teacherPreviews);
      setValidationError('');

    } catch (error) {
      console.error('CSV 파일 처리 오류:', error);
      setValidationError(`파일 처리 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
      setPreview([]);
    }
  };

  const handleImport = async () => {
    if (preview.length === 0) {
      toast({
        title: '오류',
        description: '가져올 데이터가 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    try {
      const file = fileInputRef.current?.files?.[0];
      if (!file) return;

      const text = await file.text();
      const teachers = parseTimetableCSV(text);

      let insertedCount = 0;
      let updatedCount = 0;

      // Process each teacher individually for upsert logic
      for (const teacher of teachers) {
        try {
          // Check if teacher already exists
          const { data: existingTeacher, error: checkError } = await supabase
            .from('resource')
            .select('id, name, meta')
            .eq('name', teacher.name)
            .eq('type', 'teacher')
            .maybeSingle();

          if (checkError) {
            console.error(`교사 ${teacher.name} 조회 오류:`, checkError);
            continue;
          }

          if (existingTeacher) {
            // Update existing teacher's meta
            const { error: updateError } = await supabase
              .from('resource')
              .update({
                meta: teacher.meta as any
              })
              .eq('id', existingTeacher.id);

            if (updateError) {
              console.error(`교사 ${teacher.name} 업데이트 오류:`, updateError);
              continue;
            }

            updatedCount++;
            console.log(`✅ 교사 ${teacher.name} 업데이트 완료`);
          } else {
            // Insert new teacher
            const { error: insertError } = await supabase
              .from('resource')
              .insert([teacher] as any);

            if (insertError) {
              console.error(`교사 ${teacher.name} 생성 오류:`, insertError);
              continue;
            }

            insertedCount++;
            console.log(`✅ 교사 ${teacher.name} 생성 완료`);
          }
        } catch (teacherError) {
          console.error(`교사 ${teacher.name} 처리 중 오류:`, teacherError);
          continue;
        }
      }

      // Success message with counts
      let message = '';
      if (insertedCount > 0 && updatedCount > 0) {
        message = `${insertedCount}명의 교사가 새로 생성되고, ${updatedCount}명의 교사 정보가 업데이트되었습니다.`;
      } else if (insertedCount > 0) {
        message = `${insertedCount}명의 교사 리소스가 생성되었습니다.`;
      } else if (updatedCount > 0) {
        message = `${updatedCount}명의 교사 정보가 업데이트되었습니다.`;
      } else {
        message = '처리된 교사가 없습니다.';
      }

      toast({
        title: '성공',
        description: message,
      });

      // Reset state
      setPreview([]);
      setValidationError('');
      setIsOpen(false);
      onImportComplete();

      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (error) {
      console.error('가져오기 중 오류:', error);
      toast({
        title: '오류',
        description: '데이터를 가져오는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const downloadSampleCSV = () => {
    const sampleData = [
      'A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC,AD,AE,AF,AG,AH,AI,AJ,AK',
      '1,,"월1교시","월2교시","월3교시","월4교시","월5교시","월6교시","월7교시","화1교시","화2교시","화3교시","화4교시","화5교시","화6교시","화7교시","수1교시","수2교시","수3교시","수4교시","수5교시","수6교시","수7교시","목1교시","목2교시","목3교시","목4교시","목5교시","목6교시","목7교시","금1교시","금2교시","금3교시","금4교시","금5교시","금6교시","금7교시"',
      '2,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,',
      '3,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,',
      '4,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,',
      ',김선생,공통국어,수학I,영어,한국사,통합사회,통합과학,체육,공통국어,수학I,영어,한국사,통합사회,통합과학,체육,공통국어,수학I,영어,한국사,통합사회,통합과학,체육,공통국어,수학I,영어,한국사,통합사회,통합과학,체육,공통국어,수학I,영어,한국사,통합사회,통합과학,체육',
      ',,1-1,1-1,1-1,1-1,1-1,1-1,1-1,1-2,1-2,1-2,1-2,1-2,1-2,1-2,1-3,1-3,1-3,1-3,1-3,1-3,1-3,1-4,1-4,1-4,1-4,1-4,1-4,1-4,2-1,2-1,2-1,2-1,2-1,2-1,2-1',
      ',박교사,확률과통계,미적분,기하,영어독해,한국지리,생명과학I,화학I,확률과통계,미적분,기하,영어독해,한국지리,생명과학I,화학I,확률과통계,미적분,기하,영어독해,한국지리,생명과학I,화학I,확률과통계,미적분,기하,영어독해,한국지리,생명과학I,화학I,확률과통계,미적분,기하,영어독해,한국지리,생명과학I,화학I',
      ',,2-1,2-1,2-1,2-1,2-1,2-1,2-1,2-2,2-2,2-2,2-2,2-2,2-2,2-2,2-3,2-3,2-3,2-3,2-3,2-3,2-3,2-4,2-4,2-4,2-4,2-4,2-4,2-4,3-1,3-1,3-1,3-1,3-1,3-1,3-1',
      ',이선생,문학,화법과작문,언어와매체,실용영어,동아시아사,생활과윤리,지구과학I,문학,화법과작문,언어와매체,실용영어,동아시아사,생활과윤리,지구과학I,문학,화법과작문,언어와매체,실용영어,동아시아사,생활과윤리,지구과학I,문학,화법과작문,언어와매체,실용영어,동아시아사,생활과윤리,지구과학I,문학,화법과작문,언어와매체,실용영어,동아시아사,생활과윤리,지구과학I',
      ',,3-1,3-1,3-1,3-1,3-1,3-1,3-1,3-2,3-2,3-2,3-2,3-2,3-2,3-2,3-3,3-3,3-3,3-3,3-3,3-3,3-3,3-4,3-4,3-4,3-4,3-4,3-4,3-4,1-1,1-1,1-1,1-1,1-1,1-1,1-1'
    ].join('\n');

    const blob = new Blob([sampleData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'timetable_teacher_sample.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const dialogContent = (
    <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>시간표 CSV 파일로 교사 일괄 추가</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Instructions */}
          <div className="text-sm text-muted-foreground space-y-2">
            <p className="font-semibold">시간표 CSV 파일 형식:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>교사 이름: B열의 홀수 행 (5행, 7행, 9행...)</li>
              <li>담당 과목: C열~AK열의 과목명과 반 정보를 조합</li>
              <li>각 교사는 2개 행을 차지 (이름 행 + 반 정보 행)</li>
              <li>예: "공통국어" + "1-4" → "공통국어 1-4"</li>
              <li><strong>시간표 정보:</strong> 열 위치를 기반으로 요일/교시 자동 생성하여 각 섹션의 meta.section.time에 저장</li>
              <li>C열=월1교시(11), D열=월2교시(12), ..., 7열마다 다음 요일로 변경</li>
              <li>각 섹션별로 해당 시간대 정보를 개별 저장 (섹션별 시간표 필터링 가능)</li>
            </ul>
          </div>

          {/* Sample download */}
          <div className="flex justify-start">
            <Button
              variant="outline"
              size="sm"
              onClick={downloadSampleCSV}
            >
              <Download className="h-4 w-4 mr-2" />
              샘플 파일 다운로드
            </Button>
          </div>

          {/* File upload */}
          <div>
            <Label htmlFor="timetable-csv-file">CSV 파일 선택</Label>
            <input
              ref={fileInputRef}
              id="timetable-csv-file"
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              disabled={uploading}
              className="block w-full mt-1 text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
            />
          </div>

          {/* Validation error */}
          {validationError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{validationError}</AlertDescription>
            </Alert>
          )}

          {/* Preview */}
          {preview.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Users className="h-5 w-5" />
                <h3 className="text-lg font-semibold">
                  가져올 교사 목록 ({preview.length}명)
                </h3>
              </div>

              <ScrollArea className="h-96 border rounded-lg p-4">
                <div className="space-y-4">
                  {preview.map((teacher, index) => (
                    <div key={index} className="border-b pb-4 last:border-b-0">
                      <div className="font-semibold text-lg mb-2">{teacher.name}</div>

                      {/* 담당 과목 */}
                      <div className="mb-2">
                        <div className="text-sm font-medium text-muted-foreground mb-1">담당 과목:</div>
                        <div className="flex flex-wrap gap-1">
                          {teacher.sections.length > 0 ? (
                            teacher.sections.map((section, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {section}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-sm text-muted-foreground">담당 과목 없음</span>
                          )}
                        </div>
                      </div>

                      {/* 시간표 정보 */}
                      <div>
                        <div className="text-sm font-medium text-muted-foreground mb-1">시간표:</div>
                        <div className="flex flex-wrap gap-1">
                          {teacher.allWeekdayTimes.length > 0 ? (
                            teacher.allWeekdayTimes.map((timeCode, idx) => {
                              const weekday = parseInt(timeCode.charAt(0));
                              const period = parseInt(timeCode.charAt(1));
                              const weekdayNames = ['월', '화', '수', '목', '금'];
                              const weekdayName = weekdayNames[weekday - 1];
                              return (
                                <Badge key={idx} variant="outline" className="text-xs">
                                  {weekdayName}{period}교시
                                </Badge>
                              );
                            })
                          ) : (
                            <span className="text-sm text-muted-foreground">시간표 정보 없음</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Actions */}
          <DialogFooter className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              취소
            </Button>
            {preview.length > 0 && (
              <Button onClick={handleImport} disabled={uploading}>
                <Upload className="h-4 w-4 mr-2" />
                {uploading ? '가져오는 중...' : `${preview.length}명 가져오기`}
              </Button>
            )}
          </DialogFooter>
        </div>
    </DialogContent>
  );

  if (externalOpen !== undefined) {
    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        {dialogContent}
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileText className="h-4 w-4 mr-2" />
          시간표 교사 가져오기
        </Button>
      </DialogTrigger>
      {dialogContent}
    </Dialog>
  );
};