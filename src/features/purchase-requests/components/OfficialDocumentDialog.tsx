import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  ChevronDown,
  ClipboardCopy,
  Download,
  FileText,
  ListChecks,
  Loader2,
  Printer,
  RotateCcw,
  Sparkles,
  Table2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_CLASS,
  FOOTER_BUTTON_CLASS,
  FOOTER_NEUTRAL_CLASS,
  SectionLabel,
  TitleIconChip,
} from '@/components/tasks/dialogDesign';
import { PurchaseRequestPageWithRelations } from '../types';
import {
  DEFAULT_OFFICIAL_DOCUMENT_FORM,
  OfficialDocumentForm,
  OfficialDocumentItem,
  SelectedPurchaseItem,
  buildItemsTsv,
  orderTsvLayout,
  buildOfficialDocumentText,
  formatKrw,
  mergeDocumentItems,
  sumDocumentAmount,
  toDocumentItems,
} from '../utils/officialDocument';
import { refineOfficialDocument } from '../utils/officialDocumentAi';

interface OfficialDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: PurchaseRequestPageWithRelations;
  /** 매니저가 표에서 고른 품목들 (신청건 선택도 여기선 품목 단위로 펼쳐서 넘어온다) */
  selection: SelectedPurchaseItem[];
  /**
   * 품의 정리(2026-10-12)에서 열 때 — 차수의 품의 품목을 **그대로** 공문 품목으로 쓴다.
   * 주면 `selection` 은 무시하고, 품의 품목이 이미 사람이 묶은 단위라 '같은 물품 합치기'를 끈다.
   */
  orderItems?: OfficialDocumentItem[];
  /** 품의 차수 이름 — 머리글에 '1차 품의' 처럼 보인다 */
  orderLabel?: string;
}

/** UTF-8 BOM. 메모장·엑셀이 인코딩을 못 알아보고 한글을 깨뜨리는 것을 막는다. */
const BOM = '\uFEFF';

export function OfficialDocumentDialog({
  open,
  onOpenChange,
  page,
  selection,
  orderItems,
  orderLabel,
}: OfficialDocumentDialogProps) {
  const fromOrder = !!orderItems;
  const { toast } = useToast();

  const [form, setForm] = useState<OfficialDocumentForm>(DEFAULT_OFFICIAL_DOCUMENT_FORM);
  /** 초안에서 뺄 품목 — 병합 전(원본 행) 기준이라 '동일 품목 합치기'와 무관하게 안정적이다 */
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState('');
  /** 사용자가 미리보기를 직접 고쳤으면 폼 변경으로 덮어쓰지 않는다 */
  const [manuallyEdited, setManuallyEdited] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiPending, setAiPending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);


  // 열릴 때마다 폼을 페이지 기준으로 초기화 — 이전 공문의 잔여 입력이 남으면 위험하다
  useEffect(() => {
    if (!open) return;
    setForm(DEFAULT_OFFICIAL_DOCUMENT_FORM);
    setExcluded(new Set());
    setManuallyEdited(false);
    setAiInstruction('');
    setItemsOpen(false);
  }, [open, page.title]);

  useEffect(() => () => abortRef.current?.abort(), []);

  /**
   * '포함 품목' 목록의 원본 — 병합 전 한 줄씩. 신청 품목이면 행마다, 품의 품목이면 품목마다.
   * 빼기(excluded)는 이 목록의 sourceKeys[0] 기준이라 합치기와 무관하게 안정적이다.
   */
  const baseItems = useMemo(
    () => orderItems ?? toDocumentItems(selection, page.columns),
    [orderItems, selection, page.columns],
  );
  const includedItems = useMemo(
    () => baseItems.filter((item) => !excluded.has(item.sourceKeys[0])),
    [baseItems, excluded],
  );
  const hasUrl = baseItems.some((item) => !!item.url);

  const documentItems = useMemo(
    () => (form.mergeSameItems && !fromOrder ? mergeDocumentItems(includedItems) : includedItems),
    [includedItems, form.mergeSameItems, fromOrder],
  );

  const total = useMemo(() => sumDocumentAmount(documentItems), [documentItems]);

  const generated = useMemo(
    () => buildOfficialDocumentText(form, documentItems),
    [form, documentItems],
  );

  // 직접 편집 전에는 폼·품목 변화를 그대로 따라간다
  useEffect(() => {
    if (!manuallyEdited) setDraft(generated);
  }, [generated, manuallyEdited]);

  const setField = <K extends keyof OfficialDocumentForm>(key: K, value: OfficialDocumentForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleExcluded = (key: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label}를 복사했습니다.` });
    } catch {
      toast({
        title: '복사 실패',
        description: '브라우저가 클립보드 접근을 막았습니다. 내용을 직접 선택해 복사해 주세요.',
        variant: 'destructive',
      });
    }
  };

  const handleDownload = () => {
    // BOM 없이 저장하면 메모장·엑셀이 한글을 깨서 연다
    const blob = new Blob([BOM, draft], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // 본문에 제목을 쓰지 않으므로 파일명은 게시글 제목에서 만든다(사용자에게 또 묻지 않는다)
    const safeTitle = (page.title || '구매 신청').replace(/[\\/:*?"<>|]/g, '_');
    a.download = `${safeTitle}-공문.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=900,height=1000');
    if (!win) {
      toast({
        title: '인쇄 창을 열지 못했습니다',
        description: '팝업 차단을 해제한 뒤 다시 시도해 주세요.',
        variant: 'destructive',
      });
      return;
    }
    const escaped = draft.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    win.document.write(
      `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${
        page.title || '공문'
      }</title><style>@page{size:A4;margin:20mm}body{font-family:'맑은 고딕','Malgun Gothic',monospace;font-size:11pt;line-height:1.7}pre{white-space:pre-wrap;font-family:inherit;margin:0}</style></head><body><pre>${escaped}</pre></body></html>`,
    );
    win.document.close();
    win.focus();
    win.print();
  };

  const handleAiRefine = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setAiPending(true);
    try {
      const result = await refineOfficialDocument(
        { form, items: documentItems, draft, instruction: aiInstruction },
        controller.signal,
      );
      setDraft(result);
      setManuallyEdited(true);
      toast({ title: 'AI 초안을 반영했습니다.', description: '숫자와 품목은 반드시 확인해 주세요.' });
    } catch (e) {
      toast({
        title: '공문 생성 실패',
        description: e instanceof Error ? e.message : '알 수 없는 오류',
        variant: 'destructive',
      });
    } finally {
      setAiPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle className="flex min-w-0 items-center gap-2 text-base">
            <TitleIconChip icon={FileText} tone="emerald" />
            <span className="truncate">공문 본문 만들기</span>
            {orderLabel && (
              <Badge variant="secondary" className="max-w-[10rem] truncate bg-blue-50 text-blue-700">
                {orderLabel}
              </Badge>
            )}
            <Badge variant="secondary" className="bg-slate-100 text-slate-700">
              품목 {documentItems.length}종
            </Badge>
            {total > 0 && (
              <Badge variant="secondary" className="bg-emerald-50 font-semibold text-emerald-700">
                {formatKrw(total)}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="pt-1 text-xs text-slate-500">
            본문만 만듭니다. 품목 표는 본문이 아니라 [붙임 표 복사]로 뽑아 붙임 문서로 씁니다.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[70vh] gap-4 overflow-y-auto px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          {/* ── 좌: 본문에 필요한 것만 ─────────────────── */}
          <div className="min-w-0 space-y-3">
            <SectionLabel icon={FileText}>본문 내용</SectionLabel>

            <Field label="구매 목적·사유" hint="본문의 뼈대. 비우면 AI가 품목에서 유추합니다">
              <Textarea
                value={form.purpose}
                onChange={(e) => setField('purpose', e.target.value)}
                placeholder="예: 2학기 과학실 실험 수업 운영"
                rows={2}
                className="resize-none text-sm"
              />
            </Field>

            <Field label="관련 근거" hint="있으면 본문 1항이 '관련:'으로 시작합니다">
              <Input
                value={form.basis}
                onChange={(e) => setField('basis', e.target.value)}
                placeholder="2026학년도 ○○과 교육과정 운영 계획"
                className="h-8 text-sm"
              />
            </Field>

            <Field label="붙임" hint="비우면 붙임 줄 없이 본문 끝에 '끝.'만 붙습니다">
              <Input
                value={form.attachment}
                onChange={(e) => setField('attachment', e.target.value)}
                placeholder="구매 물품 내역 1부."
                className="h-8 text-sm"
              />
            </Field>

            <div className="space-y-1.5 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
              <SectionLabel icon={Table2}>붙임 표 구성</SectionLabel>
              <OptionCheck
                checked={form.includeRequester}
                onChange={(v) => setField('includeRequester', v)}
                label="신청자 열 포함"
              />
              <OptionCheck
                checked={form.includeUrl}
                onChange={(v) => setField('includeUrl', v)}
                label="구매처(링크) 열 포함"
                disabled={!hasUrl}
                hint={!hasUrl ? '고른 품목에 구매처·링크가 없습니다' : undefined}
              />
              {/* 품의 품목은 이미 사람이 묶은 단위다 — 다시 합치면 품의 정리와 공문이 어긋난다 */}
              {!fromOrder && (
                <OptionCheck
                  checked={form.mergeSameItems}
                  onChange={(v) => setField('mergeSameItems', v)}
                  label="같은 물품 합치기"
                  hint="물품명·규격·단가가 모두 같은 행만 수량을 합칩니다"
                />
              )}
            </div>
          </div>

          {/* ── 우: 포함 품목 + 미리보기 ─────────────── */}
          <div className="flex min-w-0 flex-col gap-3">
            <div className="rounded-lg border">
              <button
                type="button"
                onClick={() => setItemsOpen((v) => !v)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left"
              >
                <ListChecks className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  포함 품목
                </span>
                <Badge variant="secondary" className="bg-slate-100 text-[10px] text-slate-600">
                  {includedItems.length}/{baseItems.length}
                </Badge>
                <ChevronDown
                  className={`ml-auto h-4 w-4 text-slate-400 transition-transform ${
                    itemsOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {itemsOpen && (
                <div className="max-h-44 overflow-y-auto border-t">
                  {baseItems.map((item) => {
                    const key = item.sourceKeys[0];
                    const included = !excluded.has(key);
                    const { name, spec } = item;
                    const price = item.unitPrice ?? 0;
                    const qty = item.qty ?? 0;
                    const requester = item.requesters.join(', ');
                    return (
                      <label
                        key={key}
                        className={`flex cursor-pointer items-center gap-2 border-b px-3 py-1.5 text-xs last:border-b-0 ${
                          included ? '' : 'opacity-45'
                        }`}
                      >
                        <Checkbox checked={included} onCheckedChange={() => toggleExcluded(key)} />
                        <span className="min-w-0 flex-1 truncate" title={name}>
                          {name || '(물품명 없음)'}
                          {spec && <span className="ml-1 text-slate-400">· {spec}</span>}
                        </span>
                        <span className="shrink-0 tabular-nums text-slate-500">
                          {price ? `${price.toLocaleString('ko-KR')}×${qty || 0}` : '—'}
                        </span>
                        <span
                          className="w-16 shrink-0 truncate text-right text-slate-400"
                          title={requester}
                        >
                          {requester}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-1.5">
              <SectionLabel
                icon={FileText}
                trailing={
                  manuallyEdited ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setManuallyEdited(false);
                        setDraft(generated);
                      }}
                      className="h-7 gap-1 px-2 text-[11px] text-slate-500"
                    >
                      <RotateCcw className="h-3 w-3" /> 초안 되돌리기
                    </Button>
                  ) : null
                }
              >
                공문 본문
              </SectionLabel>

              <div className="flex items-center gap-1.5">
                <Input
                  value={aiInstruction}
                  onChange={(e) => setAiInstruction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !aiPending && documentItems.length > 0) {
                      e.preventDefault();
                      void handleAiRefine();
                    }
                  }}
                  placeholder="AI 지시 (선택) — 예: 구매 목적을 더 구체적으로"
                  className="h-8 flex-1 text-xs"
                />
                <Button
                  size="sm"
                  onClick={handleAiRefine}
                  disabled={aiPending || documentItems.length === 0}
                  className="h-8 shrink-0 gap-1 bg-blue-600 px-2.5 text-xs hover:bg-blue-700"
                >
                  {aiPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  AI로 작성
                </Button>
              </div>

              <Textarea
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setManuallyEdited(true);
                }}
                spellCheck={false}
                className="min-h-[320px] flex-1 resize-y whitespace-pre font-mono text-[11px] leading-relaxed"
              />
              <p className="text-[11px] text-slate-400">
                {manuallyEdited
                  ? 'AI 결과 또는 직접 수정한 내용입니다. 품목·금액이 맞는지 확인하세요.'
                  : '왼쪽 항목을 바꾸면 초안이 즉시 갱신됩니다.'}
              </p>
            </div>
          </div>
        </div>

        <div className={DIALOG_FOOTER_CLASS}>
          <Button
            variant="ghost"
            onClick={() =>
              copy(
                buildItemsTsv(documentItems, form, fromOrder ? orderTsvLayout(documentItems) : undefined),
                '붙임 표',
              )
            }
            className={`${FOOTER_BUTTON_CLASS} ${FOOTER_NEUTRAL_CLASS}`}
            title="본문에는 표가 없다. 이 버튼으로 붙임 문서를 만든다(엑셀·한글에 표로 붙는 TSV)"
          >
            <Table2 className="h-3.5 w-3.5" /> 붙임 표 복사
          </Button>
          <Button
            variant="ghost"
            onClick={handlePrint}
            className={`${FOOTER_BUTTON_CLASS} ${FOOTER_NEUTRAL_CLASS}`}
          >
            <Printer className="h-3.5 w-3.5" /> 인쇄
          </Button>
          <Button
            variant="ghost"
            onClick={handleDownload}
            className={`${FOOTER_BUTTON_CLASS} ${FOOTER_NEUTRAL_CLASS}`}
          >
            <Download className="h-3.5 w-3.5" /> .txt 저장
          </Button>
          <Button
            onClick={() => copy(draft, '공문 본문')}
            className={`${FOOTER_BUTTON_CLASS} bg-blue-600 text-white hover:bg-blue-700`}
          >
            <ClipboardCopy className="h-3.5 w-3.5" /> 본문 복사
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="flex flex-wrap items-baseline gap-1.5">
        <span className="text-[11px] font-medium text-slate-600">{label}</span>
        {hint && <span className="text-[10px] text-slate-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function OptionCheck({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-2 text-xs ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      }`}
    >
      <Checkbox
        checked={checked && !disabled}
        disabled={disabled}
        onCheckedChange={(v) => onChange(!!v)}
        className="mt-0.5"
      />
      <span className="min-w-0">
        <span className="text-slate-700">{label}</span>
        {hint && <span className="block text-[10px] leading-snug text-slate-400">{hint}</span>}
      </span>
    </label>
  );
}
