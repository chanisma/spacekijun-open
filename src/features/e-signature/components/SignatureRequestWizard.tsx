/**
 * 서명 요청 만들기 — **한 화면**.
 *
 * ── 왜 3단계를 접었나 ──────────────────────────────────────────────────────
 * 처음엔 문서 → 서명자 → 위치 3단계 마법사였다. 단계를 나눈 논리는 "칸은 사람에게
 * 배정되므로 사람이 먼저 있어야 한다"였는데, 실제로 써 보면 **앞뒤를 계속 오가야 한다** —
 * 위치를 그리다 서명자를 하나 더 넣으려면 뒤로 갔다 다시 와야 하고, 그때 문서는 다시
 * 렌더된다. 세 화면 모두 같은 것을 다루므로 한 화면에 두는 편이 맞다.
 *
 * 지금은 **왼쪽 = 입력(문서·제목·전할 말·서명자), 오른쪽 = 문서**다.
 * 문서를 붙이기 전에는 오른쪽에 보여 줄 것이 없으므로 **모달이 좁게 시작해** 폼만 담고,
 * 붙이는 순간 **폭이 늘어나며** 문서가 나타난다(불필요한 빈 공간을 미리 차지하지 않는다).
 * 모달 폭을 컴포넌트가 직접 제어해야 그 전환이 자연스러우므로 `Dialog` 를 안에 들였다.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Check, FileText, Loader2, MousePointerClick, Trash2, Upload, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import { useResourceSelect } from '@/hooks/useResourceSelect';
import { DIALOG_HEADER_CLASS } from '@/components/tasks/dialogDesign';
import { DocumentPageView } from './DocumentPageView';
import { SignatureFieldOverlay, type FieldMark } from './SignatureFieldOverlay';
import { signerColor } from '../lib/signerColor';
import { rectFromDrag, type PageBoxPlacement } from '../lib/signatureField';
import { flowShape, FLOW_SHAPE_LABEL, validateSigners } from '../lib/signatureFlow';
import { defaultDueAt, detectSourceKind, dueError, sourceRejectReason, SOURCE_KIND_LABEL, type SignerDraft, type SourceKind } from '../types';
import { SignatureDueField } from './SignatureDueField';
import { useCreateSignatureRequest } from '../hooks/useSignatureRequests';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 다른 기능에 붙여 쓸 때 */
  subjectType?: string | null;
  subjectId?: string | null;
  onDone?: (requestId: string) => void;
}

export const SignatureRequestWizard: React.FC<Props> = ({
  open, onOpenChange, subjectType, subjectId, onDone,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [sourceKind, setSourceKind] = useState<SourceKind | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [dueAt, setDueAt] = useState(() => defaultDueAt());
  const [signers, setSigners] = useState<SignerDraft[]>([]);
  const [activeSignerKey, setActiveSignerKey] = useState<string | null>(null);

  const create = useCreateSignatureRequest();
  /*
    교직원 명단 — **`resourceType` 을 반드시 준다**.
    인자 없이 부르면 `types = []` 이 되어 교직원 쿼리의 `enabled` 가 false 로 남고
    `items` 가 빈 배열이 된다(오류 없이 조용히). 그러면 이름 조회가 전부 실패해
    화면에 UUID 가 그대로 찍힌다.
  */
  const { items: resourceItems } = useResourceSelect({ resourceType: ['teacher', 'staff'] });

  const reset = useCallback(() => {
    setFile(null); setSourceKind(null); setPageCount(null);
    setTitle(''); setMessage(''); setDueAt(defaultDueAt()); setSigners([]); setActiveSignerKey(null);
  }, []);

  const close = () => { onOpenChange(false); reset(); };

  const shape = useMemo(
    () => flowShape(signers.map((s) => ({
      id: s.key, orderIndex: s.orderIndex, roleLabel: null, signerUserId: null,
      signerName: s.signerName, status: 'pending' as const, fields: s.fields,
    }))),
    [signers],
  );

  /* ── 문서 ───────────────────────────────────────────────────────── */

  const onPickFile = (picked: File | null) => {
    if (!picked) return;
    const kind = detectSourceKind(picked.name, picked.type);
    if (!kind) {
      // 왜 안 되는지와 어떻게 하면 되는지를 함께 — 특히 .hwp 는 다시 저장하면 되는 문제다
      toast.error(sourceRejectReason(picked.name));
      return;
    }
    setFile(picked);
    setSourceKind(kind);
    setPageCount(null);
    // 문서를 바꾸면 이전 문서 위에 그린 칸은 의미가 없다
    setSigners((prev) => prev.map((s) => ({ ...s, fields: [] })));
    if (!title.trim()) {
      const dot = picked.name.lastIndexOf('.');
      setTitle(dot > 0 ? picked.name.slice(0, dot) : picked.name);
    }
  };

  const handlePagesReady = useCallback((count: number) => setPageCount(count), []);

  /* ── 서명자 ─────────────────────────────────────────────────────── */

  const addSigners = (picked: { name: string; resourceId: string }[]) => {
    setSigners((prev) => {
      const existing = new Set(prev.map((s) => s.signerResourceId ?? s.signerName));
      const added = picked
        .filter((p) => !existing.has(p.resourceId))
        .map((p, i) => ({
          key: `${p.resourceId}-${Date.now()}-${i}`,
          // 기본은 **동시**(0). 대부분의 서명은 순서가 없고, 필요할 때만 위계를 준다.
          orderIndex: 0,
          signerResourceId: p.resourceId,
          signerName: p.name,
          fields: [],
        }));
      // 방금 추가한 사람을 바로 활성화 — 다음 행동이 "이 사람 자리를 그리는 것"이다
      if (added.length > 0) setActiveSignerKey(added[added.length - 1].key);
      return [...prev, ...added];
    });
  };

  const setOrder = (key: string, orderIndex: number) =>
    setSigners((prev) => prev.map((s) => (s.key === key ? { ...s, orderIndex } : s)));

  const removeSigner = (key: string) => {
    setSigners((prev) => prev.filter((s) => s.key !== key));
    setActiveSignerKey((k) => (k === key ? null : k));
  };

  /* ── 위치 ───────────────────────────────────────────────────────── */

  const marks: FieldMark[] = useMemo(
    () => signers.flatMap((s) =>
      s.fields
        .filter((f): f is PageBoxPlacement => f.kind === 'page-box')
        .map((f, i) => ({
          key: `${s.key}:${i}`,
          placement: f,
          signerName: s.signerName,
          highlight: s.key === activeSignerKey,
        })),
    ),
    [signers, activeSignerKey],
  );

  const onDragEnd = useCallback((
    page: number,
    start: { x: number; y: number },
    end: { x: number; y: number },
    size: { width: number; height: number },
  ) => {
    if (!activeSignerKey) {
      toast.error('왼쪽에서 서명자를 먼저 고른 뒤 위치를 그려 주세요.');
      return;
    }
    const rect = rectFromDrag(start, end, size);
    if (!rect) {
      toast.error('서명 칸이 너무 작습니다. 조금 더 크게 끌어 주세요.');
      return;
    }
    setSigners((prev) => prev.map((s) =>
      s.key === activeSignerKey
        ? { ...s, fields: [...s.fields, { kind: 'page-box', page, ...rect }] }
        : s,
    ));
  }, [activeSignerKey]);

  const removeMark = (markKey: string) => {
    const [signerKey, idxStr] = markKey.split(':');
    const idx = Number(idxStr);
    setSigners((prev) => prev.map((s) =>
      s.key === signerKey ? { ...s, fields: s.fields.filter((_, i) => i !== idx) } : s,
    ));
  };

  /* ── 제출 ───────────────────────────────────────────────────────── */

  const submit = async () => {
    if (!file || !sourceKind) { toast.error('문서를 올려 주세요.'); return; }
    if (!title.trim()) { toast.error('제목을 입력하세요.'); return; }

    const problem = validateSigners(signers);
    if (problem) { toast.error(problem); return; }
    const dueProblem = dueError(dueAt);
    if (dueProblem) { toast.error(dueProblem); return; }

    const id = await create.mutateAsync({
      title: title.trim(),
      message: message.trim() || null,
      dueAt: dueAt.toISOString(),
      file, sourceKind, pageCount,
      signers,
      subjectType, subjectId,
    });
    onOpenChange(false);
    reset();
    onDone?.(id);
  };

  const expanded = !!file;
  const totalFields = signers.reduce((n, s) => n + s.fields.length, 0);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent
        className={cn(
          /*
            **`overflow-hidden` 을 여기 두면 안 된다.** 이 저장소의 `usePortalContainer` 는
            팝오버를 **DialogContent 안으로** 포털하므로(Radix 중첩 포털 문제를 피하려는
            기존 패턴), Content 에 overflow 를 주면 이름 검색 드롭다운이 모달 경계에서
            **잘린다**(실사용 확인). 스크롤·클리핑은 안쪽 패널이 맡고 모서리는
            헤더·푸터의 `rounded-t/b` 로 처리한다.
          */
          'flex max-h-[92vh] flex-col gap-0 p-0',
          /*
            문서를 붙이면 **폭이 늘어난다**. `max-width` 는 transition 이 걸리는 속성이라
            클래스만 바꿔도 부드럽게 벌어진다. Radix 의 열림 애니메이션(zoom/slide)과
            겹치지 않는 속성이라 서로 방해하지 않는다.
          */
          'transition-[max-width] duration-500 ease-out',
          expanded ? 'max-w-6xl' : 'max-w-lg',
        )}
      >
        <DialogHeader className={cn(DIALOG_HEADER_CLASS, 'shrink-0 rounded-t-lg pb-3')}>
          <DialogTitle className="text-sm">서명 요청 만들기</DialogTitle>
          <p className="text-[11px] text-slate-500">
            문서를 올리고 서명자를 고른 뒤, 문서 위에 서명 자리를 그려 주세요.
          </p>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* ── 왼쪽: 입력 ── */}
          <div className={cn(
            'flex min-h-0 flex-col gap-3 overflow-y-auto px-4 py-3 sm:px-5',
            expanded ? 'lg:w-[380px] lg:shrink-0 lg:border-r' : 'flex-1',
          )}>
            {/* 문서 */}
            <label
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed transition-colors',
                file ? 'border-blue-300 bg-blue-50/40 p-3' : 'border-slate-300 p-6 hover:border-slate-400 hover:bg-slate-50',
              )}
            >
              <Upload className={cn('text-slate-400', file ? 'h-4 w-4' : 'h-6 w-6')} />
              {file ? (
                <>
                  {/* 파일명은 길다 — 한 줄로 자르고 title 로 전체를 남긴다 */}
                  <span className="max-w-full truncate text-xs font-medium text-slate-700" title={file.name}>
                    {file.name}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {SOURCE_KIND_LABEL[sourceKind!]}
                    {pageCount != null && ` · ${pageCount}쪽`}
                    {' · 클릭해 바꾸기'}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-sm font-medium text-slate-600">서명받을 문서를 올리세요</span>
                  <span className="text-xs text-slate-400">한글(hwpx) · PDF · 이미지</span>
                </>
              )}
              <input
                type="file"
                className="hidden"
                accept=".hwpx,.pdf,image/*"
                onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              />
            </label>

            <div className="space-y-1.5">
              <Label htmlFor="sig-title" className="text-xs">제목</Label>
              <Input
                id="sig-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 2026학년도 현장체험학습 계획서"
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sig-message" className="text-xs">서명자에게 전할 말 (선택)</Label>
              <Textarea
                id="sig-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
                placeholder="예: 9월 10일까지 부탁드립니다"
                className="min-h-[46px] text-xs"
              />
            </div>

            <SignatureDueField value={dueAt} onChange={setDueAt} />

            {/* 서명자 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1 text-xs">
                  <Users className="h-3 w-3 text-slate-400" />서명자
                </Label>
                {signers.length > 1 && (
                  <span className="text-[10px] text-slate-400">{FLOW_SHAPE_LABEL[shape]}</span>
                )}
              </div>
              {/*
                선택값을 상태로 들고 있지 않고 **고르는 즉시 목록으로 옮긴다** —
                여기서는 "누구를 골랐나"가 아니라 "서명자 목록"이 정본이고 순서·칸이 붙는다.
              */}
              <SearchableMultiSelect
                selectedValues={[]}
                onSelectionChange={(values) => addSigners(
                  values
                    .map((v) => resourceItems.find((o) => o.value === v))
                    // 이름을 못 찾으면 **버린다** — UUID 를 이름 자리에 넣으면 그대로 남는다
                    .filter((o): o is NonNullable<typeof o> => !!o)
                    .map((o) => ({ name: o.label, resourceId: o.value })),
                )}
                placeholder="이름으로 검색"
                filterByTeacher
              />
            </div>

            {signers.length > 0 && (
              <div className="space-y-1.5">
                {signers.map((s) => {
                  const active = s.key === activeSignerKey;
                  return (
                    <div
                      key={s.key}
                      className={cn(
                        'rounded-lg border transition-colors',
                        active ? 'border-slate-800 bg-slate-50' : 'border-slate-200 bg-white',
                      )}
                    >
                      {/*
                        행 자체가 **활성 서명자 선택**이다 — 고른 뒤 오른쪽 문서에 드래그하면
                        그 사람 자리가 된다. 버튼을 따로 두면 "고르는 것"이 한 단계 더 늘어난다.
                      */}
                      <button
                        type="button"
                        onClick={() => setActiveSignerKey(s.key)}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: signerColor(s.signerName) }} />
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">
                          {s.signerName}
                        </span>
                        <span className={cn(
                          'shrink-0 rounded px-1.5 py-0.5 text-[10px]',
                          s.fields.length === 0
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-600',
                        )}>
                          {s.fields.length === 0 ? '자리 없음' : `${s.fields.length}곳`}
                        </span>
                      </button>

                      <div className="flex items-center gap-2 border-t border-slate-100 px-2.5 py-1">
                        <span className="text-[10px] text-slate-400">순서</span>
                        <Input
                          type="number"
                          min={0}
                          max={29}
                          value={s.orderIndex}
                          onChange={(e) => setOrder(s.key, Math.max(0, Number(e.target.value) || 0))}
                          className="h-6 w-12 px-1 text-center text-[11px]"
                        />
                        <span className="min-w-0 flex-1 truncate text-[10px] text-slate-400">
                          같은 숫자 = 동시
                        </span>
                        <Button
                          variant="ghost" size="sm"
                          className="h-6 w-6 shrink-0 p-0 text-slate-400 hover:text-rose-500"
                          onClick={() => removeSigner(s.key)}
                          aria-label={`${s.signerName} 제거`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── 오른쪽: 문서 (붙였을 때만) ── */}
          {expanded && sourceKind && (
            <div className="flex min-h-0 flex-1 flex-col bg-slate-100/60">
              <div className="shrink-0 border-b border-slate-200 bg-white/80 px-4 py-2 backdrop-blur">
                <p className="flex items-center gap-1.5 text-[11px] text-slate-600">
                  <MousePointerClick className="h-3.5 w-3.5 text-slate-400" />
                  {activeSignerKey ? (
                    <>
                      <span
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-white"
                        style={{
                          backgroundColor: signerColor(
                            signers.find((s) => s.key === activeSignerKey)?.signerName ?? '',
                          ),
                        }}
                      >
                        {signers.find((s) => s.key === activeSignerKey)?.signerName}
                      </span>
                      님의 자리를 문서 위에 <strong className="text-slate-800">드래그</strong>해 그리세요.
                    </>
                  ) : signers.length === 0 ? (
                    '왼쪽에서 서명자를 추가하면 문서 위에 자리를 그릴 수 있습니다.'
                  ) : (
                    '왼쪽에서 서명자를 고른 뒤 문서 위에 드래그하세요.'
                  )}
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                <DocumentPageView
                  source={file}
                  sourceKind={sourceKind}
                  onPagesReady={handlePagesReady}
                  onDragEnd={onDragEnd}
                  renderOverlay={(page) => (
                    <SignatureFieldOverlay page={page} marks={marks} onRemove={removeMark} />
                  )}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── 푸터 ── */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-b-lg border-t bg-slate-50/50 px-4 py-3 sm:px-5">
          <p className="text-[11px] text-slate-500">
            {signers.length === 0
              ? '서명자를 추가해 주세요.'
              : totalFields === 0
                ? '서명 자리를 하나 이상 그려 주세요.'
                : `서명자 ${signers.length}명 · 자리 ${totalFields}곳`}
          </p>
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" className="h-8 px-3 text-xs" onClick={close}>
              취소
            </Button>
            <Button
              size="sm"
              className="h-8 bg-blue-600 px-3 text-xs hover:bg-blue-700"
              onClick={submit}
              disabled={create.isPending}
            >
              {create.isPending
                ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />요청 중…</>
                : <><Check className="mr-1 h-3.5 w-3.5" />서명 요청</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SignatureRequestWizard;
