/**
 * Dialog component for displaying and generating swap request document
 * Shows "결강시 보강 계획서" form template
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Download, FileText, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_CLASS,
  FOOTER_BUTTON_CLASS,
  FOOTER_NEUTRAL_CLASS,
  TitleIconChip,
} from './timetableDialogDesign';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentResourceId } from '@/services/hooks/useUnifiedAuth';
import { useToast } from '@/hooks/use-toast';
import {
  downloadLessonExchangeHwpx,
  generateLessonExchangeHwpx,
} from '@/components/toolbox/hwpx/generateLessonExchangeHwpx';
import { triggerDownload } from '@/features/issue-register/hwpx/generateVolunteerHwpx';
import { stampApprovalSignatures } from '@/lib/rhwp/approvalStamp';
// 결재는 2026-09-03 부터 전자서명 시스템이 흡수했다 — 상신은 결재 형태 다이얼로그,
// 진행 현황·서명은 공용 `SignatureButton` 이 맡는다(구 approval 모듈은 남아 있으나 미사용).
import { SignatureButton } from '@/features/e-signature';
import { ApprovalStyleRequestDialog } from '@/features/e-signature/components/ApprovalStyleRequestDialog';
import { useSubjectApprovals } from '@/features/approval/hooks/useApprovals';
import { approvedSignatures } from '@/features/approval/types';
import { ABSENCE_REASONS, buildSwapDocumentPayload } from '@/lib/swapDocumentPayload';
import type { LessonFillInput } from '@/components/toolbox/hwpx/lessonExchangeFormFill';
import type { ClassSwap } from '@/types/classSwap';

interface SwapDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedSwaps: ClassSwap[];
}

interface SwapRowData {
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
// 결강 사유 라벨·순서의 단일 출처 = `@/lib/swapDocumentPayload`
// (순서가 곧 양식의 ○ 칸 인덱스라 여기서 따로 정의하면 결재 스냅샷과 어긋난다)

// Helper function to extract subject name without grade/class info
// Example: "수학 1-1" -> "수학", "통합 사회 2-3" -> "통합 사회"
const extractSubjectName = (fullName: string): string => {
  if (!fullName) return '';
  // Remove grade/class pattern (digit-digit or digit pattern at the end)
  // Matches patterns like " 1-1", " 2-3", " 1", " 2" at the end
  const subjectName = fullName.replace(/\s+\d+(-\d+)?$/, '').trim();
  return subjectName;
};

// Helper function to extract grade/class info from section name
// Example: "수학 1-1" -> "1-1", "통합 사회 2-3" -> "2-3"
const extractGradeClass = (fullName: string): string => {
  if (!fullName) return '';
  // Extract grade/class pattern from the end
  const match = fullName.match(/\s+(\d+(-\d+)?)$/);
  return match ? match[1] : '';
};

export function SwapDocumentDialog({
  open,
  onOpenChange,
  selectedSwaps,
}: SwapDocumentDialogProps) {
  const { resourceId } = useCurrentResourceId();
  const { toast } = useToast();
  const [userName, setUserName] = useState('');
  const [userSubjects, setUserSubjects] = useState<string[]>([]);
  const [selectedReasons, setSelectedReasons] = useState<Set<number>>(new Set());
  const [rowData, setRowData] = useState<SwapRowData[]>([]);
  const [downloading, setDownloading] = useState(false);

  // Load user info and subjects
  useEffect(() => {
    const loadUserInfo = async () => {
      if (!resourceId || !open) return;

      try {
        // Get user name from resource
        const { data: resource } = await supabase
          .from('resource')
          .select('name')
          .eq('id', resourceId)
          .single();

        if (resource) {
          setUserName(resource.name);
        }

        // Extract unique subjects from selected swaps
        if (selectedSwaps.length > 0) {
          const subjects = selectedSwaps.map(swap => extractSubjectName(swap.meta.requester_section_name || ''));
          const uniqueSubjects = Array.from(new Set(subjects)).filter(s => s);
          setUserSubjects(uniqueSubjects);
        }
      } catch (error) {
        console.error('Failed to load user info:', error);
      }
    };

    loadUserInfo();
  }, [resourceId, open, selectedSwaps]);

  // Initialize row data from selected swaps
  useEffect(() => {
    if (!open || selectedSwaps.length === 0) return;

    const initialData: SwapRowData[] = selectedSwaps.map((swap) => {
      const isSubstitute = swap.meta.type === 'substitute';
      const absenceDate = format(new Date(swap.requester_swap_date), 'M/d', { locale: ko });
      const absenceDay = WEEKDAY_LABELS[swap.requester_original_weekday];
      const makeupDate = format(new Date(swap.approver_swap_date), 'M/d', { locale: ko });
      const makeupDay = WEEKDAY_LABELS[swap.approver_original_weekday];

      return {
        grade: extractGradeClass(swap.meta.requester_section_name || ''),
        absenceDate,
        absenceDay,
        absencePeriod: swap.requester_original_period.toString(),
        absenceSubject: extractSubjectName(swap.meta.requester_section_name || ''),
        swapType: isSubstitute ? '대체' : '교체',
        makeupSubject: extractSubjectName(swap.meta.approver_section_name || ''),
        makeupTeacher: swap.meta.approver_name || '',
        makeupDate,
        makeupDay,
        makeupPeriod: swap.approver_original_period.toString(),
        makeupLocation: '',
      };
    });

    setRowData(initialData);
  }, [selectedSwaps, open]);

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

  // 결재 대상 = 이 문서가 담은 교체 건들. 선택 조합이 곧 문서이므로 id 집합을 키로 쓴다.
  const subjectId = React.useMemo(
    () => selectedSwaps.map((s) => s.id).sort().join(','),
    [selectedSwaps],
  );
  const { data: approvals = [] } = useSubjectApprovals('timetable.swap_document', subjectId, open);

  // 승인된 결재의 서명들 — 결재란 칸 이름(role_label)이 곧 찍힐 자리다.
  const approvedStamps = React.useMemo(() => {
    const approved = approvals.find((r) => r.status === 'approved');
    return approved ? approvedSignatures(approved) : [];
  }, [approvals]);

  // 문서 내용의 단일 출처. 결재 payload도 여기서 파생하므로, 결재 화면에서 다시 만든 문서가
  // 이 화면에서 내려받는 것과 어긋날 수 없다.
  const documentInput = React.useMemo<LessonFillInput>(
    () => ({
      teacherName: userName,
      subject: userSubjects.join(', '),
      reasons: Array.from(selectedReasons),
      rows: rowData,
    }),
    [userName, userSubjects, selectedReasons, rowData],
  );

  const handleRowDataChange = (index: number, field: keyof SwapRowData, value: string) => {
    setRowData((prev) => {
      const newData = [...prev];
      newData[index] = { ...newData[index], [field]: value };
      return newData;
    });
  };

  /** 결재 상신용 문서 공급자 — 다이얼로그가 열릴 때 한 번 부른다(참조 고정 필수) */
  const [approvalOpen, setApprovalOpen] = useState(false);
  const buildApprovalDocument = useCallback(async () => ({
    blob: await generateLessonExchangeHwpx(documentInput),
    fileName: `결강시 보강 계획서_${userName || '교사'}.hwpx`,
  }), [documentInput, userName]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      // 결재를 받은 문서라면 결재란에 서명을 찍어서 내려준다.
      // 서명이 하나도 없으면(=결재 전) 기존 경로 그대로 — WASM을 부르지 않는다.
      if (approvedStamps.length > 0) {
        const blob = await generateLessonExchangeHwpx(documentInput);
        const stamped = await stampApprovalSignatures(blob, approvedStamps);
        triggerDownload(stamped, `결강시 보강 계획서_${userName}(결재).hwpx`);
      } else {
        await downloadLessonExchangeHwpx(documentInput);
      }
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
      <DialogContent className="flex max-h-[92dvh] max-w-4xl flex-col gap-0 overflow-hidden p-0" hideCloseButton>
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-center gap-3.5">
            <TitleIconChip icon={FileText} tone="indigo" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900">
                  결강시 보강 계획서
                </DialogTitle>
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-indigo-700 ring-1 ring-indigo-100">
                  {selectedSwaps.length}건
                </span>
              </div>
              <DialogDescription className="mt-0.5 text-xs text-slate-500">
                학급·장소 칸은 직접 입력할 수 있습니다. 내용을 확인한 뒤 HWPX로 내려받으세요.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Document Template Preview Area — 실제 공문 양식을 재현하므로 내부 표 스타일은 유지한다 */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100/50 p-4 sm:p-8">
          <div className="max-w-[210mm] mx-auto bg-white shadow-sm border border-slate-200 transition-shadow hover:shadow-md" id="swap-document">
            <div className="p-8 sm:p-12">
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
                  <span className="border-b border-black pb-1 px-20 text-center">{userSubjects.join(', ')}</span>
                </div>
              </div>

              {/* Reason Section */}
              <div className="border-2 border-black mb-6">
                <div className="flex items-center justify-center py-2 border-b-2 border-black bg-slate-50">
                  <span className="font-bold">해당 사항 아래에 ○표시</span>
                </div>
                <table className="w-full">
                  <tbody>
                    <tr>
                      <td rowSpan={2} className="border border-black px-2 py-2 text-center font-medium" style={{ width: '8%' }}>결강<br />사유</td>
                      {ABSENCE_REASONS.map((reason, index) => (
                        <td key={index} className="border border-black px-1 py-2 text-center text-xs" style={{ width: '10%', minWidth: '60px' }}>{reason}</td>
                      ))}
                    </tr>
                    <tr>
                      {ABSENCE_REASONS.map((_, index) => (
                        <td key={index} className="border border-black px-1 py-7 text-center" style={{ width: '10%', minWidth: '60px' }}>
                          <div className="flex items-center justify-center">
                            <Checkbox
                              checked={selectedReasons.has(index)}
                              onCheckedChange={() => handleReasonToggle(index)}
                              className="print:hidden data-[state=checked]:bg-black data-[state=checked]:text-white border-slate-400"
                            />
                            <span className="hidden print:inline">{selectedReasons.has(index) ? '○' : ''}</span>
                          </div>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Main Table */}
              <table className="w-full border-2 border-black mb-4">
                <thead>
                  <tr>
                    <th rowSpan={2} className="border border-black px-2 py-2 text-center font-bold bg-slate-50 text-sm">순</th>
                    <th colSpan={5} className="border border-black px-2 py-2 text-center font-bold bg-slate-50 text-sm">결 강</th>
                    <th colSpan={8} className="border border-black px-2 py-2 text-center font-bold bg-slate-50 text-sm">보 강</th>
                  </tr>
                  <tr>
                    <th className="border border-black px-2 py-1 text-center text-xs font-medium bg-slate-50">날짜</th>
                    <th className="border border-black px-2 py-1 text-center text-xs font-medium bg-slate-50">요일</th>
                    <th className="border border-black px-2 py-1 text-center text-xs font-medium bg-slate-50">학급</th>
                    <th className="border border-black px-2 py-1 text-center text-xs font-medium bg-slate-50">교시</th>
                    <th className="border border-black px-2 py-1 text-center text-xs font-medium bg-slate-50">과목</th>
                    <th className="border border-black px-2 py-1 text-center text-xs font-medium bg-slate-50">구분</th>
                    <th className="border border-black px-2 py-1 text-center text-xs font-medium bg-slate-50">과목</th>
                    <th className="border border-black px-2 py-1 text-center text-xs font-medium bg-slate-50">교사</th>
                    <th className="border border-black px-2 py-1 text-center text-xs font-medium bg-slate-50">(인)</th>
                    <th className="border border-black px-2 py-1 text-center text-xs font-medium bg-slate-50">날짜</th>
                    <th className="border border-black px-2 py-1 text-center text-xs font-medium bg-slate-50">요일</th>
                    <th className="border border-black px-2 py-1 text-center text-xs font-medium bg-slate-50">교시</th>
                    <th className="border border-black px-2 py-1 text-center text-xs font-medium bg-slate-50">장소</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 10 }).map((_, index) => {
                    const row = rowData[index];
                    return (
                      <tr key={index}>
                        <td className="border border-black px-2 py-2 text-center text-xs">{index + 1}</td>
                        {row ? (
                          <>
                            {/* 결강 정보 */}
                            <td className="border border-black px-2 py-2 text-center text-xs">{row.absenceDate}</td>
                            <td className="border border-black px-2 py-2 text-center text-xs">{row.absenceDay}</td>
                            <td className="border border-black px-2 py-2 text-center text-xs bg-brand-50/30 print:bg-transparent">
                              <Input
                                value={row.grade}
                                onChange={(e) => handleRowDataChange(index, 'grade', e.target.value)}
                                className="w-full h-6 text-xs text-center border-transparent bg-transparent hover:bg-white hover:border-brand-200 focus:bg-white focus:border-brand-400 focus:ring-1 focus:ring-brand-200 print:hidden p-0"
                                placeholder="학급"
                              />
                              <span className="hidden print:inline">{row.grade}</span>
                            </td>
                            <td className="border border-black px-2 py-2 text-center text-xs">{row.absencePeriod}</td>
                            <td className="border border-black px-2 py-2 text-center text-xs">{row.absenceSubject}</td>
                            <td className="border border-black px-2 py-2 text-center text-xs">{row.swapType}</td>
                            {/* 보강 정보 - 대체일 때는 교사명만 표시 */}
                            <td className="border border-black px-2 py-2 text-center text-xs">{row.swapType === '대체' ? '' : row.makeupSubject}</td>
                            <td className="border border-black px-2 py-2 text-center text-xs">{row.makeupTeacher}</td>
                            <td className="border border-black px-2 py-2 text-center text-xs"></td>
                            <td className="border border-black px-2 py-2 text-center text-xs">{row.swapType === '대체' ? '' : row.makeupDate}</td>
                            <td className="border border-black px-2 py-2 text-center text-xs">{row.swapType === '대체' ? '' : row.makeupDay}</td>
                            <td className="border border-black px-2 py-2 text-center text-xs">{row.swapType === '대체' ? '' : row.makeupPeriod}</td>
                            <td className={`border border-black px-2 py-2 text-center text-xs ${row.swapType === '대체' ? '' : 'bg-brand-50/30 print:bg-transparent'}`}>
                              {row.swapType === '대체' ? (
                                ''
                              ) : (
                                <>
                                  <Input
                                    value={row.makeupLocation}
                                    onChange={(e) => handleRowDataChange(index, 'makeupLocation', e.target.value)}
                                    className="w-full h-6 text-xs text-center border-transparent bg-transparent hover:bg-white hover:border-brand-200 focus:bg-white focus:border-brand-400 focus:ring-1 focus:ring-brand-200 print:hidden p-0"
                                    placeholder="장소"
                                  />
                                  <span className="hidden print:inline">{row.makeupLocation}</span>
                                </>
                              )}
                            </td>
                          </>
                        ) : (
                          <>
                            {/* 빈 행 */}
                            <td className="border border-black px-2 py-2 text-center text-xs"></td>
                            <td className="border border-black px-2 py-2 text-center text-xs"></td>
                            <td className="border border-black px-2 py-2 text-center text-xs"></td>
                            <td className="border border-black px-2 py-2 text-center text-xs"></td>
                            <td className="border border-black px-2 py-2 text-center text-xs"></td>
                            <td className="border border-black px-2 py-2 text-center text-xs"></td>
                            <td className="border border-black px-2 py-2 text-center text-xs"></td>
                            <td className="border border-black px-2 py-2 text-center text-xs"></td>
                            <td className="border border-black px-2 py-2 text-center text-xs"></td>
                            <td className="border border-black px-2 py-2 text-center text-xs"></td>
                            <td className="border border-black px-2 py-2 text-center text-xs"></td>
                            <td className="border border-black px-2 py-2 text-center text-xs"></td>
                            <td className="border border-black px-2 py-2 text-center text-xs"></td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Footer Note */}
              <div className="text-center text-sm mb-6">
                보강시 구분란은 교체 또는 대체로 적어 주시면 감사하겠습니다.
              </div>

              {/* School Name */}
              <div className="text-right text-lg font-medium">
                전 주 기 전 여 자 고 등 학 교
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className={cn(DIALOG_FOOTER_CLASS, 'justify-between')}>
          {/* 결재는 문서 단위로 붙는다 — 승인되면 결재란에 서명이 찍힌 채로 내려받게 된다.
              이미 상신한 건이 있으면 `SignatureButton` 이 현황을, 없으면 아래 상신 버튼이 뜬다. */}
          <div className="flex items-center gap-1.5">
            <SignatureButton
              subjectType="timetable.swap_document"
              subjectId={subjectId}
              label="결재"
              className="h-8 px-3 text-xs"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => setApprovalOpen(true)}
              disabled={downloading || !subjectId}
            >
              결재 상신
            </Button>
          </div>

          <div className="flex gap-1.5">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={downloading}
            className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)}
          >
            <X className="h-3.5 w-3.5" />
            닫기
          </Button>
          <Button
            onClick={handleDownload}
            disabled={downloading}
            size="sm"
            className="h-8 gap-1.5 px-3 text-xs"
          >
            {downloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {downloading ? '생성 중…' : approvedStamps.length > 0 ? '결재본 다운로드' : 'HWPX 다운로드'}
          </Button>
          </div>
        </DialogFooter>

        {/*
          상신 다이얼로그는 이 모달을 **닫지 않고 위에 쌓는다** — 두 Radix 모달을 같은 틱에
          닫고 열면 body 의 pointer-events 가 복구되지 않을 수 있다(결재에서 겪은 것과 같다).
        */}
        <ApprovalStyleRequestDialog
          open={approvalOpen}
          onOpenChange={setApprovalOpen}
          roleLabels={['계', '부장', '교감', '교장']}
          buildDocument={buildApprovalDocument}
          title={`결강시 보강 계획서 — ${userName || '교사'}`}
          subjectType="timetable.swap_document"
          subjectId={subjectId}
          meta={buildSwapDocumentPayload(documentInput) as unknown as Record<string, unknown>}
        />
      </DialogContent>
    </Dialog>
  );
}
