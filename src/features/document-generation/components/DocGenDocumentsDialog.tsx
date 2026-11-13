/**
 * 완성 문서 — **내가 만든 문서 전부**를 보는 모달(헤더에서 연다).
 *
 * ── 왜 모달로 뺐나 ─────────────────────────────────────────────────────────
 * 종전에는 이 목록이 러너의 **양식 단계**에 얹혀 있었다. 그래서 기본 양식이 정해진
 * 생성 방식도 양식 단계를 건너뛸 수 없었다 — 건너뛰면 "이어서 작업할 문서"를 찾을 길이
 * 사라지기 때문이었다(그 제약이 코드 주석에 그대로 남아 있었다).
 *
 * 목록을 밖으로 빼면서 그 제약이 풀렸고, 문서 생성 메뉴는 이제 **계획 검토부터** 시작한다.
 *
 * ── 카드가 아니라 헤더인 이유 (2026-09-04 사용자 결정) ─────────────────────
 * 사람이 찾는 것은 "그 생성 방식으로 만든 문서"가 아니라 **"내가 지난번에 만든 그 문서"**다.
 * 어느 방식으로 만들었는지는 대개 기억나지 않으므로, 방식별로 흩어 놓으면 카드를 하나씩
 * 열어 보게 된다. 그래서 전부 한자리에 모으고 방식 이름은 각 줄에 적는다.
 */
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileCheck2, FileText, Loader2, Search } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { DIALOG_HEADER_CLASS, TitleIconChip } from '@/components/tasks/dialogDesign';
import { listSpecDocumentsForWorks } from '@/features/task-workflow/services/specDocumentService';
import type { TaskAction } from '@/features/task-workflow/types';

interface Props {
  /** 목록에 선 생성 방식 전부 — 문서를 어느 방식이 만들었는지 붙이는 데도 쓴다 */
  actions: TaskAction[];
  /**
   * 카드에 쓰는 이름(action.id → 라벨). 캔버스에서 만들어진 방식은 제목이 유형 이름
   * ('HWPX 스펙 기반 문서 생성')뿐이라, 그대로 적으면 줄마다 같은 말이 선다 —
   * 목록 규칙(`docGenActionLabel`)이 정한 이름을 그대로 쓴다.
   */
  workLabels?: Map<string, string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 고른 문서로 러너를 연다 */
  onOpen: (action: TaskAction, documentId: string) => void;
}

export const DocGenDocumentsDialog: React.FC<Props> = ({
  actions, workLabels, open, onOpenChange, onOpen,
}) => {
  const [search, setSearch] = useState('');
  const workIds = useMemo(() => actions.map((w) => w.id), [actions]);
  const workById = useMemo(() => new Map(actions.map((w) => [w.id, w])), [actions]);
  const labelOf = (id: string) => workLabels?.get(id) ?? workById.get(id)?.title ?? null;

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['docgen-documents', 'all', [...workIds].sort().join('|')],
    queryFn: () => listSpecDocumentsForWorks(workIds),
    enabled: open && workIds.length > 0,
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        (labelOf(d.action_id) ?? '').toLowerCase().includes(q),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, search, workById, workLabels]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[82vh] flex-col gap-0 p-0 sm:max-w-xl">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle className="flex items-center gap-2 text-base">
            <TitleIconChip icon={FileCheck2} tone="indigo" />
            완성 문서
          </DialogTitle>
          <DialogDescription className="pt-1 text-xs text-slate-500">
            지금까지 만들어 저장한 문서 전부입니다. 골라서 값을 그대로 이어 만들 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 border-b px-4 py-2.5 sm:px-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="문서 제목·생성 방식으로 검색"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">
          {isLoading ? (
            <div className="flex justify-center py-10 text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : visible.length === 0 ? (
            <p className="py-10 text-center text-xs leading-relaxed text-slate-400">
              {search.trim() ? '검색 결과가 없습니다.' : (
                <>
                  아직 저장한 완성 문서가 없습니다.<br />
                  문서를 만든 뒤 마지막 단계에서 저장하면 여기에 쌓입니다.
                </>
              )}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {visible.map((d) => {
                const w = workById.get(d.action_id);
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      disabled={!w}
                      onClick={() => { if (w) { onOpen(w, d.id); onOpenChange(false); } }}
                      className="flex w-full items-center gap-2.5 rounded-lg border border-slate-200 p-2.5 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/40 disabled:opacity-50"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                        <FileText className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-700" title={d.title}>
                          {d.title}
                        </span>
                        {/* 어느 방식으로 만든 문서인지 — 한자리에 모았으므로 줄마다 필요하다 */}
                        <span className="block truncate text-[11px] text-slate-400"
                              title={labelOf(d.action_id) ?? undefined}>
                          {labelOf(d.action_id) ?? '(삭제된 생성 방식)'} · v{d.version} ·{' '}
                          {new Date(d.created_at).toLocaleDateString('ko-KR')}
                        </span>
                      </span>
                      <span className={cn(
                        'shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium',
                        d.status === 'final'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 bg-slate-50 text-slate-500',
                      )}>
                        {d.status === 'final' ? '완료' : '작성 중'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DocGenDocumentsDialog;
