/**
 * Dialog component for creating lesson exchange/substitute document
 * Manual input version for Toolbox - no automatic parsing
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Download, X, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentResourceId } from '@/services/hooks/useUnifiedAuth';
import { useToast } from '@/hooks/use-toast';
import { downloadLessonExchangeHwpx } from './hwpx/generateLessonExchangeHwpx';

interface LessonExchangeDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface LessonRowData {
  grade: string;
  absenceDate: string;
  absenceDay: string;
  absencePeriod: string;
  absenceSubject: string;
  swapType: string;
  makeupSubject: string;
  makeupTeacher: string;
  makeupDate: string;
  makeupDay: string;
  makeupPeriod: string;
  makeupLocation: string;
}

const WEEKDAY_LABELS = ['', '월', '화', '수', '목', '금', '토', '일'];
const ABSENCE_REASONS = ['공가', '조퇴', '오전출장', '오후출장', '연가', '특별휴가', '병가', '오전외출', '오후외출'];

const emptyRow: LessonRowData = {
  grade: '',
  absenceDate: '',
  absenceDay: '',
  absencePeriod: '',
  absenceSubject: '',
  swapType: '교체',
  makeupSubject: '',
  makeupTeacher: '',
  makeupDate: '',
  makeupDay: '',
  makeupPeriod: '',
  makeupLocation: '',
};

export function LessonExchangeDocumentDialog({
  open,
  onOpenChange,
}: LessonExchangeDocumentDialogProps) {
  const { resourceId } = useCurrentResourceId();
  const { toast } = useToast();
  const [userName, setUserName] = useState('');
  const [userSubject, setUserSubject] = useState('');
  const [selectedReasons, setSelectedReasons] = useState<Set<number>>(new Set());
  const [rowData, setRowData] = useState<LessonRowData[]>([{ ...emptyRow }]);
  const [downloading, setDownloading] = useState(false);

  // Load user info
  useEffect(() => {
    const loadUserInfo = async () => {
      if (!resourceId || !open) return;

      try {
        const { data: resource } = await supabase
          .from('resource')
          .select('name')
          .eq('id', resourceId)
          .single();

        if (resource) {
          setUserName(resource.name);
        }
      } catch (error) {
        console.error('Failed to load user info:', error);
      }
    };

    loadUserInfo();
  }, [resourceId, open]);

  const handleReasonToggle = (index: number) => {
    setSelectedReasons((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const handleRowDataChange = (index: number, field: keyof LessonRowData, value: string) => {
    setRowData((prev) => {
      const newData = [...prev];
      newData[index] = { ...newData[index], [field]: value };
      return newData;
    });
  };

  const handleAddRow = () => {
    if (rowData.length < 10) {
      setRowData((prev) => [...prev, { ...emptyRow }]);
    }
  };

  const handleRemoveRow = (index: number) => {
    if (rowData.length > 1) {
      setRowData((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadLessonExchangeHwpx({
        teacherName: userName,
        subject: userSubject,
        reasons: Array.from(selectedReasons),
        rows: rowData,
      });
    } catch (error) {
      console.error('Failed to generate HWPX:', error);
      toast({
        title: 'HWPX 생성 실패',
        description:
          error instanceof Error ? error.message : '문서를 생성하는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto" hideCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>수업 교환/대체 계획서</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={downloading}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                {downloading ? '생성 중...' : 'HWPX 다운로드'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="gap-2"
              >
                <X className="h-4 w-4" />
                닫기
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Document Template */}
        <div className="p-8 bg-white" id="lesson-exchange-document">
          {/* Title */}
          <h1 className="text-center text-3xl font-bold mb-8 border-b-2 border-black pb-2">
            결강시 보강 계획서
          </h1>

          {/* Approval Table */}
          <div className="flex justify-end mb-8">
            <table className="border-2 border-black">
              <thead>
                <tr>
                  <th rowSpan={2} className="border border-black px-6 py-3 text-center font-bold">
                    결<br />재
                  </th>
                  <th className="border border-black px-8 py-2 text-center font-medium">계</th>
                  <th className="border border-black px-8 py-2 text-center font-medium">부장</th>
                  <th className="border border-black px-8 py-2 text-center font-medium">교감</th>
                  <th className="border border-black px-8 py-2 text-center font-medium">교장</th>
                </tr>
                <tr>
                  <td className="border border-black px-8 py-10"></td>
                  <td className="border border-black px-8 py-10"></td>
                  <td className="border border-black px-8 py-10"></td>
                  <td className="border border-black px-8 py-10"></td>
                </tr>
              </thead>
            </table>
          </div>

          {/* Teacher Info */}
          <div className="mb-6 space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-bold">교사</span>
              <span className="border-b border-black pb-1 px-20 text-center">{userName}</span>
              <span>(인)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold">과목</span>
              <Input
                value={userSubject}
                onChange={(e) => setUserSubject(e.target.value)}
                className="w-64 border-b border-black rounded-none border-x-0 border-t-0 px-2 focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
                placeholder="과목 입력"
              />
            </div>
          </div>

          {/* Reason Section */}
          <div className="border-2 border-black mb-6">
            <div className="flex items-center justify-center py-2 border-b-2 border-black bg-gray-50">
              <span className="font-bold">해당 사항 아래에 ○표시</span>
            </div>
            <table className="w-full">
              <tbody>
                <tr>
                  <td rowSpan={2} className="border border-black px-2 py-2 text-center font-medium" style={{ width: '8%' }}>
                    결강<br />사유
                  </td>
                  {ABSENCE_REASONS.map((reason, index) => (
                    <td key={index} className="border border-black px-1 py-2 text-center text-xs" style={{ width: '10%', minWidth: '60px' }}>
                      {reason}
                    </td>
                  ))}
                </tr>
                <tr>
                  {ABSENCE_REASONS.map((_, index) => (
                    <td key={index} className="border border-black px-1 py-7 text-center" style={{ width: '10%', minWidth: '60px' }}>
                      <div className="flex items-center justify-center">
                        <Checkbox
                          checked={selectedReasons.has(index)}
                          onCheckedChange={() => handleReasonToggle(index)}
                        />
                      </div>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Main Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-2 border-black mb-4">
              <thead>
                <tr>
                  <th rowSpan={2} className="border border-black px-2 py-2 text-center font-bold bg-gray-50 text-sm">순</th>
                  <th colSpan={5} className="border border-black px-2 py-2 text-center font-bold bg-gray-50 text-sm">결 강</th>
                  <th colSpan={8} className="border border-black px-2 py-2 text-center font-bold bg-gray-50 text-sm">보 강</th>
                </tr>
                <tr>
                  <th className="border border-black px-2 py-1 text-center text-xs font-medium bg-gray-50">날짜</th>
                  <th className="border border-black px-2 py-1 text-center text-xs font-medium bg-gray-50">요일</th>
                  <th className="border border-black px-2 py-1 text-center text-xs font-medium bg-gray-50">학급</th>
                  <th className="border border-black px-2 py-1 text-center text-xs font-medium bg-gray-50">교시</th>
                  <th className="border border-black px-2 py-1 text-center text-xs font-medium bg-gray-50">과목</th>
                  <th className="border border-black px-2 py-1 text-center text-xs font-medium bg-gray-50">구분</th>
                  <th className="border border-black px-2 py-1 text-center text-xs font-medium bg-gray-50">과목</th>
                  <th className="border border-black px-2 py-1 text-center text-xs font-medium bg-gray-50">교사</th>
                  <th className="border border-black px-2 py-1 text-center text-xs font-medium bg-gray-50">(인)</th>
                  <th className="border border-black px-2 py-1 text-center text-xs font-medium bg-gray-50">날짜</th>
                  <th className="border border-black px-2 py-1 text-center text-xs font-medium bg-gray-50">요일</th>
                  <th className="border border-black px-2 py-1 text-center text-xs font-medium bg-gray-50">교시</th>
                  <th className="border border-black px-2 py-1 text-center text-xs font-medium bg-gray-50">장소</th>
                </tr>
              </thead>
              <tbody>
                {rowData.map((row, index) => (
                  <tr key={index}>
                    <td className="border border-black px-2 py-2 text-center text-xs">
                      <div className="flex items-center justify-center gap-2">
                        {index + 1}
                        {rowData.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveRow(index)}
                            className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </td>
                    {/* 결강 정보 */}
                    <td className="border border-black px-1 py-1 text-center text-xs">
                      <Input
                        value={row.absenceDate}
                        onChange={(e) => handleRowDataChange(index, 'absenceDate', e.target.value)}
                        className="w-16 h-7 text-xs text-center border border-gray-300 rounded px-1"
                        placeholder="M/d"
                      />
                    </td>
                    <td className="border border-black px-1 py-1 text-center text-xs">
                      <Input
                        value={row.absenceDay}
                        onChange={(e) => handleRowDataChange(index, 'absenceDay', e.target.value)}
                        className="w-12 h-7 text-xs text-center border border-gray-300 rounded px-1"
                        placeholder="요일"
                      />
                    </td>
                    <td className="border border-black px-1 py-1 text-center text-xs">
                      <Input
                        value={row.grade}
                        onChange={(e) => handleRowDataChange(index, 'grade', e.target.value)}
                        className="w-16 h-7 text-xs text-center border border-gray-300 rounded px-1"
                        placeholder="학급"
                      />
                    </td>
                    <td className="border border-black px-1 py-1 text-center text-xs">
                      <Input
                        value={row.absencePeriod}
                        onChange={(e) => handleRowDataChange(index, 'absencePeriod', e.target.value)}
                        className="w-12 h-7 text-xs text-center border border-gray-300 rounded px-1"
                        placeholder="교시"
                      />
                    </td>
                    <td className="border border-black px-1 py-1 text-center text-xs">
                      <Input
                        value={row.absenceSubject}
                        onChange={(e) => handleRowDataChange(index, 'absenceSubject', e.target.value)}
                        className="w-20 h-7 text-xs text-center border border-gray-300 rounded px-1"
                        placeholder="과목"
                      />
                    </td>
                    {/* 구분 (교체/대체) */}
                    <td className="border border-black px-1 py-1 text-center text-xs">
                      <select
                        value={row.swapType}
                        onChange={(e) => handleRowDataChange(index, 'swapType', e.target.value)}
                        className="w-16 h-7 text-xs text-center border border-gray-300 rounded px-1"
                      >
                        <option value="교체">교체</option>
                        <option value="대체">대체</option>
                      </select>
                    </td>
                    {/* 보강 정보 */}
                    <td className="border border-black px-1 py-1 text-center text-xs">
                      <Input
                        value={row.makeupSubject}
                        onChange={(e) => handleRowDataChange(index, 'makeupSubject', e.target.value)}
                        className="w-20 h-7 text-xs text-center border border-gray-300 rounded px-1"
                        placeholder="과목"
                        disabled={row.swapType === '대체'}
                      />
                    </td>
                    <td className="border border-black px-1 py-1 text-center text-xs">
                      <Input
                        value={row.makeupTeacher}
                        onChange={(e) => handleRowDataChange(index, 'makeupTeacher', e.target.value)}
                        className="w-20 h-7 text-xs text-center border border-gray-300 rounded px-1"
                        placeholder="교사"
                      />
                    </td>
                    <td className="border border-black px-1 py-1 text-center text-xs"></td>
                    <td className="border border-black px-1 py-1 text-center text-xs">
                      <Input
                        value={row.makeupDate}
                        onChange={(e) => handleRowDataChange(index, 'makeupDate', e.target.value)}
                        className="w-16 h-7 text-xs text-center border border-gray-300 rounded px-1"
                        placeholder="M/d"
                        disabled={row.swapType === '대체'}
                      />
                    </td>
                    <td className="border border-black px-1 py-1 text-center text-xs">
                      <Input
                        value={row.makeupDay}
                        onChange={(e) => handleRowDataChange(index, 'makeupDay', e.target.value)}
                        className="w-12 h-7 text-xs text-center border border-gray-300 rounded px-1"
                        placeholder="요일"
                        disabled={row.swapType === '대체'}
                      />
                    </td>
                    <td className="border border-black px-1 py-1 text-center text-xs">
                      <Input
                        value={row.makeupPeriod}
                        onChange={(e) => handleRowDataChange(index, 'makeupPeriod', e.target.value)}
                        className="w-12 h-7 text-xs text-center border border-gray-300 rounded px-1"
                        placeholder="교시"
                        disabled={row.swapType === '대체'}
                      />
                    </td>
                    <td className="border border-black px-1 py-1 text-center text-xs">
                      <Input
                        value={row.makeupLocation}
                        onChange={(e) => handleRowDataChange(index, 'makeupLocation', e.target.value)}
                        className="w-20 h-7 text-xs text-center border border-gray-300 rounded px-1"
                        placeholder="장소"
                        disabled={row.swapType === '대체'}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add Row Button */}
          {rowData.length < 10 && (
            <div className="flex justify-center mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddRow}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                행 추가
              </Button>
            </div>
          )}

          {/* Footer Note */}
          <div className="text-center text-sm mb-6">
            보강시 구분란은 교체 또는 대체로 적어 주시면 감사하겠습니다.
          </div>

          {/* School Name */}
          <div className="text-right text-lg font-medium">
            전 주 기 전 여 자 고 등 학 교
          </div>
        </div>

        {/* Help Text */}
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-sm">
          <h4 className="font-semibold mb-2">입력 안내</h4>
          <ul className="space-y-1 text-gray-700">
            <li>• <strong>교체</strong>: 다른 교사와 수업 시간을 서로 바꾸는 경우 (내 수업 정보 + 상대방 수업 정보)</li>
            <li>• <strong>대체</strong>: 다른 교사가 내 수업을 대신 진행하는 경우 (내 수업 정보 + 상대방 정보만)</li>
            <li>• 날짜는 "M/d" 형식으로 입력하세요 (예: 3/15)</li>
            <li>• 요일은 "월", "화", "수" 등으로 입력하세요</li>
            <li>• <strong>HWPX 다운로드</strong> 버튼을 누르면 입력한 내용이 채워진 한글 문서가 내려받아집니다 (한글에서 열어 결재·인쇄)</li>
            <li>• <strong>시간표 기능에서 교체/대체를 신청하시면 더욱 쉽게 작성할 수 있습니다</strong></li>
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
