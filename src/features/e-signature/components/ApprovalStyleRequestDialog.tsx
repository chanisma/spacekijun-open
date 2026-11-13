/**
 * **결재 형태** 서명 요청 — 생성된 문서 + 결재란 칸.
 *
 * 일반 요청(`SignatureRequestWizard`)과 두 가지가 다르다:
 *   ① 파일을 **올리지 않는다** — 기능이 만들어 준 문서를 그대로 쓴다(보강 계획서 등)
 *   ② 위치를 **그리지 않는다** — HWPX 결재란의 칸 이름(계·부장·교감·교장)으로 지정한다
 *
 * 자유 위치가 아닌 이유는 **양식이 이미 그 4칸을 갖고 있기** 때문이다. 좌표로 찍으면
 * 양식이 조금만 바뀌어도 칸 밖으로 나가지만, 칸 이름으로 찾으면 따라간다.
 *
 * 순서는 **칸 순서 = 결재 순서**(순차)가 기본이다. 그래도 같은 순번을 주면 동시 결재가
 * 되므로, 결재 규정이 바뀌어도 스키마를 손댈 필요가 없다.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  DIALOG_FOOTER_CLASS, DIALOG_HEADER_CLASS, FOOTER_BUTTON_CLASS,
} from '@/components/tasks/dialogDesign';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import { useResourceSelect } from '@/hooks/useResourceSelect';
import { validateSigners } from '../lib/signatureFlow';
import { useCreateSignatureRequest } from '../hooks/useSignatureRequests';
import { defaultDueAt, dueError, type SignerDraft } from '../types';
import { SignatureDueField } from './SignatureDueField';

interface RoleRow {
  /** 결재란 칸 이름. HWPX 양식의 칸 이름과 **정확히 같아야** 찾을 수 있다 */
  label: string;
  enabled: boolean;
  signerName: string;
  signerResourceId: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 결재란 칸 이름들 — 양식이 정한다 */
  roleLabels: string[];
  /** 문서를 만들어 주는 함수. 열릴 때 한 번 호출한다 */
  buildDocument: () => Promise<{ blob: Blob; fileName: string }>;
  title: string;
  subjectType: string;
  subjectId: string;
  /** 결재 화면 미리보기용 스냅샷 — 나중에 원본이 바뀌어도 서명한 내용은 그대로 */
  meta?: Record<string, unknown>;
  /** 이전 결재선을 씨앗으로(재상신) */
  initialSigners?: { label: string; signerName: string; signerResourceId: string | null }[];
  onDone?: (requestId: string) => void;
}

export const ApprovalStyleRequestDialog: React.FC<Props> = ({
  open, onOpenChange, roleLabels, buildDocument, title,
  subjectType, subjectId, meta, initialSigners, onDone,
}) => {
  const create = useCreateSignatureRequest();
  /*
    교직원 명단 — **`resourceType` 을 반드시 준다**.
    인자 없이 부르면 `types = []` 이 되어 교직원 쿼리의 `enabled` 가 false 로 남고
    `items` 가 빈 배열이 된다(오류 없이 조용히). 그러면 아래 이름 조회가 전부 실패해
    화면에 UUID 가 그대로 찍힌다. `SearchableMultiSelect` 가 `filterByTeacher` 로
    내부에서 쓰는 값과 같아야 목록과 이름이 어긋나지 않는다.
  */
  const { items: resourceItems } = useResourceSelect({ resourceType: ['teacher', 'staff'] });

  const [rows, setRows] = useState<RoleRow[]>([]);
  const [message, setMessage] = useState('');
  const [dueAt, setDueAt] = useState(() => defaultDueAt());
  const [docTitle, setDocTitle] = useState(title);
  const [doc, setDoc] = useState<{ blob: Blob; fileName: string } | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  /**
   * 씨앗 심기는 **열릴 때 1회만**.
   * 폴링·재조회가 입력 중인 결재선을 지우면 안 된다(결재에서 얻은 교훈).
   */
  useEffect(() => {
    if (!open) return;
    setRows(roleLabels.map((label) => {
      const seed = initialSigners?.find((s) => s.label === label);
      return {
        label,
        enabled: seed ? !!seed.signerName : true,
        signerName: seed?.signerName ?? '',
        signerResourceId: seed?.signerResourceId ?? null,
      };
    }));
    setDocTitle(title);
    setDueAt(defaultDueAt());
    setDoc(null);
    setDocError(null);

    let cancelled = false;
    buildDocument()
      .then((made) => { if (!cancelled) setDoc(made); })
      .catch((e) => {
        console.error('결재 문서 생성 실패', e);
        if (!cancelled) setDocError(e instanceof Error ? e.message : '문서를 만들지 못했습니다.');
      });
    return () => { cancelled = true; };
    // buildDocument 는 호출부에서 useCallback 으로 고정한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const signers: SignerDraft[] = useMemo(
    () => rows
      .filter((r) => r.enabled && r.signerName.trim())
      // 칸 순서가 곧 결재 순서 — 체크 해제된 칸은 번호를 소비하지 않는다
      .map((r, i) => ({
        key: r.label,
        orderIndex: i,
        roleLabel: r.label,
        signerResourceId: r.signerResourceId,
        signerName: r.signerName.trim(),
        fields: [{ kind: 'hwpx-cell' as const, label: r.label }],
      })),
    [rows],
  );

  const setRow = (label: string, patch: Partial<RoleRow>) =>
    setRows((prev) => prev.map((r) => (r.label === label ? { ...r, ...patch } : r)));

  const submit = async () => {
    if (!doc) { toast.error('문서를 아직 만들지 못했습니다.'); return; }
    if (!docTitle.trim()) { toast.error('제목을 입력하세요.'); return; }

    const problem = validateSigners(signers);
    if (problem) { toast.error(problem); return; }
    const dueProblem = dueError(dueAt);
    if (dueProblem) { toast.error(dueProblem); return; }

    const file = new File([doc.blob], doc.fileName, {
      type: doc.blob.type || 'application/haansofthwpx',
    });
    const id = await create.mutateAsync({
      title: docTitle.trim(),
      message: message.trim() || null,
      dueAt: dueAt.toISOString(),
      file,
      sourceKind: 'hwpx',
      signers,
      subjectType,
      subjectId,
      meta,
    });
    onOpenChange(false);
    onDone?.(id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* overflow 를 여기 두면 이름 검색 드롭다운이 잘린다 — 팝오버가 DialogContent 안으로
          포털되기 때문(`usePortalContainer`). 스크롤은 안쪽 패널이 맡는다. */}
      <DialogContent className="flex max-h-[90vh] max-w-lg flex-col gap-0 p-0">
        <DialogHeader className={cn(DIALOG_HEADER_CLASS, 'rounded-t-lg')}>
          <DialogTitle className="text-sm">결재 상신</DialogTitle>
          <p className="text-[11px] text-slate-500">
            칸마다 결재자를 지정하세요. 필요 없는 칸은 체크를 해제합니다.
          </p>
        </DialogHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 sm:px-6">
          <div className="space-y-1.5">
            <Label htmlFor="approval-title" className="text-xs">제목</Label>
            <Input id="approval-title" value={docTitle} onChange={(e) => setDocTitle(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">결재선</Label>
            {rows.map((row) => (
              <div
                key={row.label}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-2',
                  row.enabled ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50/60',
                )}
              >
                <Checkbox
                  checked={row.enabled}
                  onCheckedChange={(v) => setRow(row.label, { enabled: !!v })}
                  aria-label={`${row.label} 칸 사용`}
                />
                <span className="w-12 shrink-0 text-xs font-medium text-slate-600">{row.label}</span>
                <div className="min-w-0 flex-1">
                  <SearchableMultiSelect
                    selectedValues={row.signerResourceId ? [row.signerResourceId] : []}
                    onSelectionChange={(values) => {
                      // 칸 하나에 한 명 — 마지막에 고른 사람으로 대체한다
                      const last = values[values.length - 1];
                      if (!last) { setRow(row.label, { signerResourceId: null, signerName: '' }); return; }
                      const found = resourceItems.find((o) => o.value === last);
                      // 이름을 못 찾으면 아무것도 넣지 않는다 — 빈 이름으로 저장되면
                      // 상신 시점에야 "이름이 비어 있습니다" 로 막혀 원인을 알기 어렵다
                      if (!found) return;
                      setRow(row.label, { signerResourceId: found.value, signerName: found.label });
                    }}
                    placeholder="결재자 선택"
                    filterByTeacher
                    disabled={!row.enabled}
                    maxSelectedDisplay={1}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="approval-message" className="text-xs">전할 말 (선택)</Label>
            <Textarea
              id="approval-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              className="text-xs"
            />
          </div>

          <SignatureDueField id="approval-due" value={dueAt} onChange={setDueAt} />

          {/* 문서 준비 상태 — 실패를 조용히 두면 상신 버튼만 안 눌리는 이유 모를 상태가 된다 */}
          <p className={cn('text-[11px]', docError ? 'text-rose-600' : 'text-slate-400')}>
            {docError
              ? `문서 생성 실패: ${docError}`
              : doc
                ? `문서 준비됨 · ${doc.fileName}`
                : '문서를 만드는 중…'}
          </p>
        </div>

        <div className={cn(DIALOG_FOOTER_CLASS, 'rounded-b-lg')}>
          <Button variant="ghost" size="sm" className={FOOTER_BUTTON_CLASS} onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700"
            onClick={submit}
            disabled={create.isPending || !doc}
          >
            {create.isPending
              ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />상신 중…</>
              : <><Check className="mr-1 h-3.5 w-3.5" />상신</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ApprovalStyleRequestDialog;
