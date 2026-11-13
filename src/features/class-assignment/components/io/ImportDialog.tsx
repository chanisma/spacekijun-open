/**
 * Import Dialog Component
 * Excel/JSON 불러오기 다이얼로그
 */

import React, { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileSpreadsheet, FileJson, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useClassAssignmentContext } from '../../context/ClassAssignmentContext';
import { importStudentsFromExcel, importAssignmentsFromJson } from '../../utils/excelImport';

export interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
  const { setSourceStudents, setAssignments, setLockedStudentsMap, config } = useClassAssignmentContext();

  const [importType, setImportType] = useState<'students' | 'assignments'>('students');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    warnings?: string[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setResult(null);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    setIsImporting(true);
    setResult(null);

    try {
      if (importType === 'students') {
        const validationResult = await importStudentsFromExcel(selectedFile, {
          gradeFilter: config.grade,
        });

        if (validationResult.valid) {
          setSourceStudents(validationResult.students);

          // 배정반 정보가 있으면 배정 결과도 설정
          if (validationResult.existingAssignments && validationResult.existingAssignments.length > 0) {
            setAssignments(validationResult.existingAssignments);
            if (validationResult.lockedStudents) {
              setLockedStudentsMap(validationResult.lockedStudents);
            }
            const lockedCount = validationResult.lockedStudents?.size ?? 0;
            setResult({
              success: true,
              message: `${validationResult.students.length}명, ${validationResult.existingAssignments.length}개 반의 배정 결과를 불러왔습니다.${lockedCount > 0 ? ` (잠금 ${lockedCount}명)` : ''}`,
              warnings: validationResult.warnings,
            });
          } else {
            setResult({
              success: true,
              message: `${validationResult.students.length}명의 학생 데이터를 불러왔습니다.`,
              warnings: validationResult.warnings,
            });
          }

          // 성공 시 다이얼로그 닫기
          setTimeout(() => {
            onOpenChange(false);
            setSelectedFile(null);
            setResult(null);
          }, 1500);
        } else {
          setResult({
            success: false,
            message: validationResult.errors[0] || '불러오기 실패',
          });
        }
      } else {
        const importResult = await importAssignmentsFromJson(selectedFile);

        if (importResult.valid && importResult.assignments) {
          // assignments에서 모든 학생 추출하여 sourceStudents에도 설정
          const allStudents = importResult.assignments.flatMap(cls => cls.students);
          setSourceStudents(allStudents);
          setAssignments(importResult.assignments);
          if (importResult.lockedStudents) {
            setLockedStudentsMap(importResult.lockedStudents);
          }

          const totalStudents = allStudents.length;
          const lockedCount = importResult.lockedStudents?.size ?? 0;
          setResult({
            success: true,
            message: `${importResult.assignments.length}개 반, ${totalStudents}명의 배정 결과를 불러왔습니다.${lockedCount > 0 ? ` (잠금 ${lockedCount}명)` : ''}`,
          });

          setTimeout(() => {
            onOpenChange(false);
            setSelectedFile(null);
            setResult(null);
          }, 1500);
        } else {
          setResult({
            success: false,
            message: importResult.error || '불러오기 실패',
          });
        }
      }
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : '알 수 없는 오류',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const resetState = () => {
    setSelectedFile(null);
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) resetState();
      onOpenChange(open);
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>데이터 불러오기</DialogTitle>
          <DialogDescription>
            Excel 또는 JSON 파일에서 데이터를 불러옵니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 불러오기 유형 선택 */}
          <div className="space-y-2">
            <Label>불러오기 유형</Label>
            <RadioGroup
              value={importType}
              onValueChange={(v) => {
                setImportType(v as 'students' | 'assignments');
                resetState();
              }}
              className="grid grid-cols-2 gap-2"
            >
              <div className="flex items-start space-x-2 p-3 border rounded-md hover:bg-muted/50">
                <RadioGroupItem value="students" id="students" className="mt-1" />
                <div>
                  <Label htmlFor="students" className="flex items-center gap-2 cursor-pointer">
                    <FileSpreadsheet className="h-4 w-4 text-green-600" />
                    학생 데이터
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Excel 파일에서 학생 목록 불러오기
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-2 p-3 border rounded-md hover:bg-muted/50">
                <RadioGroupItem value="assignments" id="assignments" className="mt-1" />
                <div>
                  <Label htmlFor="assignments" className="flex items-center gap-2 cursor-pointer">
                    <FileJson className="h-4 w-4 text-blue-600" />
                    배정 결과
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    이전에 저장한 JSON 불러오기
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* 파일 선택 */}
          <div className="space-y-2">
            <Label>파일 선택</Label>
            <Input
              ref={fileInputRef}
              type="file"
              accept={importType === 'students' ? '.xlsx,.xls' : '.json'}
              onChange={handleFileSelect}
            />
            {selectedFile && (
              <p className="text-sm text-muted-foreground">
                선택된 파일: {selectedFile.name}
              </p>
            )}
          </div>

          {/* 필수 헤더 안내 (학생 데이터) */}
          {importType === 'students' && !result && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Excel 파일에는 다음 헤더가 필요합니다: <strong>학번</strong>, <strong>이름</strong>
                <br />
                선택 사항: 학년, 반, 번호, 평균등급
              </AlertDescription>
            </Alert>
          )}

          {/* 결과 표시 */}
          {result && (
            <Alert variant={result.success ? 'default' : 'destructive'}>
              {result.success ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                {result.message}
                {result.warnings && result.warnings.length > 0 && (
                  <ul className="mt-2 text-xs list-disc list-inside">
                    {result.warnings.slice(0, 3).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                    {result.warnings.length > 3 && (
                      <li>외 {result.warnings.length - 3}개 경고</li>
                    )}
                  </ul>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={handleImport}
            disabled={!selectedFile || isImporting}
          >
            {isImporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            불러오기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
