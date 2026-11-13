/**
 * «이 조건으로 만든 설계가 이미 있어요» — 가져올지 새로 만들지 묻는다 (2026-09-18).
 *
 * 종전엔 서버 LLM 캐시가 같은 조건의 이전 결과를 **말없이** 돌려줬다. 지금은
 * 누르기 전에 화면이 먼저 묻는다(판정 = `utils/priorDesignMatch.ts`).
 *
 * **무엇으로 찾았는지 반드시 밝힌다** — 대상과 근거는 대조했지만 «탐구 방향» 글은
 * 설계 행에 저장되지 않아 비교할 수 없다. 그 사실을 말하지 않으면, 방향을 고쳐
 * 적고 누른 사람이 왜 옛 설계를 권하는지 알 수 없다.
 */
import { Clock, FileText, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SavedInquiryDesign } from '../types';

const STATUS_META: Record<string, { label: string; badge: string }> = {
  draft: { label: '임시', badge: 'border-amber-300 bg-amber-50 text-amber-800' },
  proposed: { label: '선생님 제안', badge: 'border-violet-300 bg-violet-50 text-violet-800' },
  saved: { label: '저장', badge: 'border-emerald-300 bg-emerald-50 text-emerald-800' },
};

function whenLabel(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const minutes = Math.floor((Date.now() - then.getTime()) / 60000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return then.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}

interface Props {
  /** 후보 설계들(가장 쓸 만한 것이 앞). 비어 있으면 열리지 않는다. */
  designs: SavedInquiryDesign[];
  open: boolean;
  /** 근거를 하나도 고르지 않은 채 누른 경우 — 문구가 달라진다. */
  noSelection: boolean;
  onOpenChange: (open: boolean) => void;
  onReuse: (design: SavedInquiryDesign) => void;
  onCreateNew: () => void;
}

export function PriorDesignPromptDialog({
  designs,
  open,
  noSelection,
  onOpenChange,
  onReuse,
  onCreateNew,
}: Props) {
  const primary = designs[0];
  if (!primary) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 목록이 길어질 수 있으나 DialogContent 에는 overflow 를 주지 않는다 —
          안쪽 패널에 준다(중첩 팝오버가 모달 경계에서 잘리는 문제, CLAUDE.md §Gotchas). */}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-brand-600" />
            이전에 만든 설계가 있어요
          </DialogTitle>
          <DialogDescription className="text-xs leading-5">
            {noSelection
              ? `같은 «${primary.target_name}»으로 만든 설계가 ${designs.length}개 있습니다.`
              : `같은 «${primary.target_name}»에 같은 근거로 만든 설계가 ${designs.length}개 있습니다.`}
            {' '}가져와서 이어 쓸 수도 있고, 새로 설계할 수도 있어요.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {designs.slice(0, 5).map((design) => {
            const meta = STATUS_META[design.status] ?? STATUS_META.saved;
            const summary = design.llm_result?.summary ?? '';
            return (
              <button
                key={design.id}
                type="button"
                onClick={() => onReuse(design)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-left transition duration-200 hover:border-brand-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className={cn('shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold', meta.badge)}>
                    {meta.label}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800" title={design.title}>
                    {design.title}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-[11px] text-slate-400">
                    <Clock className="h-3 w-3" />
                    {whenLabel(design.created_at)}
                  </span>
                </div>
                {summary && (
                  <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-500">{summary}</p>
                )}
              </button>
            );
          })}
          {designs.length > 5 && (
            <p className="px-1 text-[11px] text-slate-400">
              외 {designs.length - 5}개는 «분석 이력»에서 볼 수 있어요.
            </p>
          )}
        </div>

        {/* 무엇으로 찾았는지 — 방향 글은 대조하지 않았다는 사실이 여기에만 있다. */}
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-500">
          대상 활동{noSelection ? '' : '과 고른 근거'}가 같은 설계를 찾았습니다.
          «탐구 방향»에 적은 글은 설계에 저장되지 않아 대조하지 못했어요 — 방향을 바꿔 적었다면
          «새로 설계하기»를 눌러 주세요.
        </p>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" className="h-9 text-xs" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="h-9 text-xs" onClick={() => onReuse(primary)}>
              이전 설계 가져오기
            </Button>
            <Button type="button" className="h-9 text-xs" onClick={onCreateNew}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              새로 설계하기
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
