import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { DIALOG_HEADER_CLASS, TitleIconChip } from '@/components/tasks/dialogDesign';
import { Info } from 'lucide-react';
import type { CellDetail } from '../utils/comparisonRows';

interface Props {
  detail: CellDetail | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * 비교표 셀의 **근거**를 펼치는 모달.
 *
 * 표의 칸은 좁아 요약만 담기지만 상담에서는 "왜 그런가"를 바로 대야 한다 —
 * 어느 과목이 반영됐는지, 어느 영역 등급 합으로 충족을 판정했는지, 원문이 뭔지.
 *
 * 내용은 `comparisonRows.ts` 가 **데이터로** 만들어 준다(JSX 아님). 그래서 행 정의가
 * 순수 모듈로 남고, 근거의 구성 자체를 회귀 테스트가 검사할 수 있다.
 */
export function CellDetailDialog({ detail, onOpenChange }: Props) {
  return (
    <Dialog open={!!detail} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle className="flex items-center gap-2 text-base min-w-0">
            <TitleIconChip icon={Info} tone="blue" />
            <span className="truncate">{detail?.title ?? ''}</span>
          </DialogTitle>
          {detail?.subtitle && (
            <DialogDescription className="text-xs text-slate-500 truncate">
              {detail.subtitle}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="overflow-y-auto custom-scrollbar px-4 sm:px-6 py-4 space-y-4">
          {detail?.sections.map((sec, i) => {
            const hasBody = !!sec.text || !!sec.note || (sec.items?.length ?? 0) > 0;
            if (!hasBody && !sec.heading) return null;
            return (
              <section key={i} className="space-y-1.5">
                {sec.heading && (
                  <h3 className="text-[11.5px] font-bold text-slate-700">{sec.heading}</h3>
                )}
                {sec.text && (
                  // 원문은 줄바꿈을 그대로 살린다 — 변경 전/후를 화살표로 나눠 적는다
                  <p className="text-[12px] text-slate-700 leading-relaxed whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2">
                    {sec.text}
                  </p>
                )}
                {(sec.items?.length ?? 0) > 0 && (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200/80">
                    {sec.items!.map((it, j) => (
                      <li
                        key={j}
                        className={`flex items-start justify-between gap-3 px-2.5 py-1.5 text-[11.5px] ${
                          it.muted ? 'text-slate-400' : 'text-slate-700'
                        }`}
                      >
                        <span className="min-w-0 break-words">{it.label}</span>
                        {it.value && (
                          <span className="shrink-0 tabular-nums font-medium">{it.value}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {sec.note && <p className="text-[10.5px] text-slate-400 leading-relaxed">{sec.note}</p>}
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
