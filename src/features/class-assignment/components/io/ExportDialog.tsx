/**
 * Export Dialog Component
 * Excel/JSON 내보내기 다이얼로그
 */

import React, { useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { Download, FileSpreadsheet, FileJson } from 'lucide-react';
import { useClassAssignmentContext } from '../../context/ClassAssignmentContext';
import { exportToExcel, exportToJson } from '../../utils/excelExport';

export interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  const { assignments, statistics, config, lockedStudents } = useClassAssignmentContext();

  const [exportFormat, setExportFormat] = useState<'excel' | 'json'>('excel');
  const [excelStyle, setExcelStyle] = useState<'studentList' | 'classList'>('studentList');
  const [includeStatistics, setIncludeStatistics] = useState(true);

  const handleExport = () => {
    if (!statistics) return;

    if (exportFormat === 'excel') {
      exportToExcel(assignments, statistics, {
        format: excelStyle,
        includeStatistics,
      }, lockedStudents);
    } else {
      exportToJson(assignments, statistics, config, lockedStudents);
    }

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>배정 결과 내보내기</DialogTitle>
          <DialogDescription>
            배정 결과를 파일로 내보냅니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 파일 형식 선택 */}
          <div className="space-y-2">
            <Label>파일 형식</Label>
            <RadioGroup
              value={exportFormat}
              onValueChange={(v) => setExportFormat(v as 'excel' | 'json')}
              className="grid grid-cols-2 gap-2"
            >
              <div className="flex items-center space-x-2 p-3 border rounded-md hover:bg-muted/50">
                <RadioGroupItem value="excel" id="excel" />
                <Label htmlFor="excel" className="flex items-center gap-2 cursor-pointer">
                  <FileSpreadsheet className="h-4 w-4 text-green-600" />
                  Excel (.xlsx)
                </Label>
              </div>
              <div className="flex items-center space-x-2 p-3 border rounded-md hover:bg-muted/50">
                <RadioGroupItem value="json" id="json" />
                <Label htmlFor="json" className="flex items-center gap-2 cursor-pointer">
                  <FileJson className="h-4 w-4 text-blue-600" />
                  JSON
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Excel 스타일 선택 */}
          {exportFormat === 'excel' && (
            <div className="space-y-2">
              <Label>Excel 스타일</Label>
              <RadioGroup
                value={excelStyle}
                onValueChange={(v) => setExcelStyle(v as 'studentList' | 'classList')}
                className="space-y-2"
              >
                <div className="flex items-start space-x-2 p-3 border rounded-md hover:bg-muted/50">
                  <RadioGroupItem value="studentList" id="studentList" className="mt-1" />
                  <div>
                    <Label htmlFor="studentList" className="cursor-pointer font-medium">
                      학생 목록 형식
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      전체 학생을 한 시트에 표시 (학번, 이름, 기존반, 배정반) · 다시 불러오기 가능
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-2 p-3 border rounded-md hover:bg-muted/50">
                  <RadioGroupItem value="classList" id="classList" className="mt-1" />
                  <div>
                    <Label htmlFor="classList" className="cursor-pointer font-medium">
                      반별 목록 형식
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      각 반을 별도 시트로 표시 (출력용) · 다시 불러오기 불가
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>
          )}

          {/* 통계 포함 옵션 */}
          {exportFormat === 'excel' && (
            <div className="flex items-center justify-between">
              <Label htmlFor="includeStats">통계 시트 포함</Label>
              <Switch
                id="includeStats"
                checked={includeStatistics}
                onCheckedChange={setIncludeStatistics}
              />
            </div>
          )}

          {exportFormat === 'json' && (
            <p className="text-sm text-muted-foreground">
              JSON 형식은 나중에 다시 불러올 수 있으며, 설정과 통계가 모두 포함됩니다.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={handleExport} disabled={!statistics}>
            <Download className="h-4 w-4 mr-2" />
            내보내기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
