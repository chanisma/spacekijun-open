/**
 * 과목 선택 확인표 출력 — 반을 골라(여러 반 가능) A4 한 장에 여러 학생을 담아 출력한다.
 *
 * 인쇄는 예전 리로스쿨 설문 출력(toolbox/RiroSurveyPreview)과 같은 "새 창 + document.write"
 * 방식이다. 원자료는 대화상자가 열릴 때 미리 받아 둔다 — 비동기 뒤에 window.open 을 부르면
 * 브라우저가 팝업으로 막는다(클릭과 같은 동기 흐름에서 열어야 한다).
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, LayoutGrid, Loader2, Printer, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_CLASS,
  FOOTER_BUTTON_CLASS,
  FOOTER_NEUTRAL_CLASS,
  SectionLabel,
  TitleIconChip,
} from '@/components/tasks/dialogDesign';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { readStoredString, writeStoredString } from '@/lib/safeLocalStorage';
import { useCourseAnalyzeData } from '../context';
import { useCourseSelectionRoundId } from '../hooks/useCourseSelectionRoundId';
import { fetchSelectionSlipSource } from '../services/selectionSlipService';
import { buildConfirmSheetsDocument, buildSlipsDocument, buildStudentSlips } from '../utils/selectionSlips';

/** 출력 형식 — 잘라서 나눠 주는 카드 / 한 사람당 한 장 확인서 */
type PrintFormat = 'cards' | 'sheet';
const FORMAT_KEY = 'course-analyze-print-format';
const FORMAT_OPTIONS: { value: PrintFormat; label: string; hint: string; icon: typeof LayoutGrid }[] = [
  { value: 'cards', label: '한 장에 여러 명', hint: '잘라서 나눠 주기', icon: LayoutGrid },
  { value: 'sheet', label: '한 사람당 한 장', hint: '확인서로 나눠 주기', icon: FileText },
];

interface PrintSlipsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PrintSlipsDialog({ open, onOpenChange }: PrintSlipsDialogProps) {
  const { currentAcademicYear, currentGrade, currentRound } = useCourseAnalyzeData();
  const { data: roundId, isLoading: roundLoading } = useCourseSelectionRoundId(
    currentAcademicYear,
    currentGrade,
    currentRound,
  );

  const sourceQuery = useQuery({
    queryKey: ['ca-selection-slips', roundId],
    queryFn: () => fetchSelectionSlipSource(roundId!),
    enabled: open && !!roundId,
    staleTime: 0, // 출력물은 항상 지금 DB 기준이어야 한다
  });

  const slips = useMemo(
    () => (sourceQuery.data ? buildStudentSlips(sourceQuery.data) : []),
    [sourceQuery.data],
  );

  const classes = useMemo(() => {
    const counts = new Map<number, number>();
    for (const s of slips) {
      if (s.classNo == null) continue;
      counts.set(s.classNo, (counts.get(s.classNo) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0] - b[0]);
  }, [slips]);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [format, setFormat] = useState<PrintFormat>(() =>
    readStoredString(FORMAT_KEY) === 'sheet' ? 'sheet' : 'cards',
  );
  const chooseFormat = (f: PrintFormat) => {
    setFormat(f);
    writeStoredString(FORMAT_KEY, f);
  };
  // 자료가 (다시) 들어오면 전체 반 선택. 한 장 학생 수는 출력 창이 내용에 맞춰 정한다.
  useEffect(() => {
    if (!sourceQuery.data) return;
    setSelected(new Set(classes.map(([c]) => c)));
  }, [sourceQuery.data, classes]);

  const targets = useMemo(
    () => slips.filter((s) => s.classNo != null && selected.has(s.classNo)),
    [slips, selected],
  );
  const allSelected = classes.length > 0 && selected.size === classes.length;

  const toggleClass = (c: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  const handlePrint = () => {
    if (!sourceQuery.data || targets.length === 0) return;
    const chosen = classes.map(([c]) => c).filter((c) => selected.has(c));
    const scopeLabel = allSelected ? `${currentGrade}학년 전체` : chosen.map((c) => `${c}반`).join('·');
    const docOpts = { roundTitle: sourceQuery.data.roundTitle, scopeLabel };
    const html = format === 'sheet' ? buildConfirmSheetsDocument(targets, docOpts) : buildSlipsDocument(targets, docOpts);
    const win = window.open('', '_blank', 'width=960,height=900');
    if (!win) {
      toast.error('팝업이 차단되어 출력 창을 열지 못했습니다. 브라우저에서 이 사이트의 팝업을 허용해 주세요.');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    onOpenChange(false);
  };

  const loading = roundLoading || (!!roundId && sourceQuery.isLoading);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-center gap-2.5">
            <TitleIconChip icon={Printer} />
            <div className="min-w-0">
              <DialogTitle className="text-base">과목 선택 확인표 출력</DialogTitle>
              <DialogDescription className="truncate text-xs">
                {sourceQuery.data?.roundTitle ?? `${currentGrade}학년 ${currentRound}차`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 px-4 py-4 sm:px-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              신청 내역을 불러오는 중…
            </div>
          ) : !roundId ? (
            <p className="py-8 text-center text-sm text-slate-500">
              지금 보고 있는 학년·차수에 해당하는 신청 차수를 찾지 못했습니다.
            </p>
          ) : sourceQuery.isError ? (
            <p className="py-8 text-center text-sm text-rose-600">
              신청 내역을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.
            </p>
          ) : classes.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">이 차수에 신청한 학생이 없습니다.</p>
          ) : (
            <>
              <div className="space-y-2">
                <SectionLabel
                  icon={Users}
                  trailing={
                    <button
                      type="button"
                      onClick={() => setSelected(allSelected ? new Set() : new Set(classes.map(([c]) => c)))}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700"
                    >
                      {allSelected ? '전체 해제' : '전체 선택'}
                    </button>
                  }
                >
                  출력할 반
                </SectionLabel>
                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                  {classes.map(([c, n]) => {
                    const on = selected.has(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleClass(c)}
                        className={cn(
                          'flex h-11 flex-col items-center justify-center rounded-lg border text-xs transition-colors sm:h-10',
                          on
                            ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50',
                        )}
                      >
                        <span className="font-semibold">{c}반</span>
                        <span className={cn('text-[10px]', on ? 'text-blue-100' : 'text-slate-400')}>{n}명</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <SectionLabel icon={Printer}>출력 형식</SectionLabel>
                <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="출력 형식">
                  {FORMAT_OPTIONS.map((o) => {
                    const on = format === o.value;
                    const Icon = o.icon;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => chooseFormat(o.value)}
                        className={cn(
                          'flex min-h-11 items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors',
                          on
                            ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600'
                            : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50',
                        )}
                      >
                        <Icon className={cn('h-4 w-4 shrink-0', on ? 'text-blue-600' : 'text-slate-400')} />
                        <span className="min-w-0">
                          <span className={cn('block text-xs font-semibold', on ? 'text-blue-700' : 'text-slate-700')}>
                            {o.label}
                          </span>
                          <span className="block text-[10px] text-slate-500">{o.hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                학생 <strong className="text-slate-900">{targets.length}</strong>명
                {format === 'sheet' && <> · A4 <strong className="text-slate-900">{targets.length}</strong>장</>}
                <span className="text-slate-400"> · 신청(제출)한 학생만 출력됩니다</span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500">
                {format === 'sheet' ? (
                  <>
                    학생마다 A4 한 장에 학번·이름, 고른 과목, 확인 문구와 날짜, 학생·학부모 서명 칸을 담습니다.
                    자르지 않고 그대로 나눠 주면 됩니다.
                  </>
                ) : (
                  <>
                    학생 카드 사이에 종이 여백의 두 배만큼 간격을 두었습니다. 간격 가운데 점선을 자르면
                    모든 카드가 사방에 같은 흰 여백을 두르게 되어, 종이 바깥쪽은 자르지 않아도 됩니다.
                    반마다 새 장에서 시작하므로 한 장에 두 반이 섞이지 않습니다. 한 장에 들어갈 학생 수는 내용이 칸을 넘치지 않도록 출력 창이 자동으로 정합니다(최대 8명). 같은 학생 수로 넘칠 때만 글자를 조금 줄여 맞춥니다.
                  </>
                )}
                {currentGrade === 1 && ' 1학년은 2학년·3학년 수강 과목이 나뉘어 표시됩니다.'}
              </p>
            </>
          )}
        </div>

        <div className={DIALOG_FOOTER_CLASS}>
          <Button
            variant="ghost"
            className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)}
            onClick={() => onOpenChange(false)}
          >
            닫기
          </Button>
          <Button
            className={cn(FOOTER_BUTTON_CLASS, 'bg-blue-600 text-white hover:bg-blue-700')}
            disabled={loading || targets.length === 0}
            onClick={handlePrint}
          >
            <Printer className="h-3.5 w-3.5" />
            출력 창 열기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
