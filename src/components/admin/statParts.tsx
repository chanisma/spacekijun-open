/**
 * 관리자 통계 탭 공용 부품(2026-10-14) — 별까지 쌓기 · 다마고찌 통계가 같은 모양으로 읽히게.
 * 막대 색은 표면(흰 카드) 대비 3:1 이상인 500 단계만 쓴다(데이터 색 — CLAUDE.md «색»).
 */
import { cn } from '@/lib/utils';

export const statCard = 'rounded-lg border bg-card p-4';

/** 가로 막대 한 줄 — 값 / 최댓값 */
export function Bar({ label, n, max, note, tone = 'bg-indigo-500' }: { label: string; n: number; max: number; note?: string; tone?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto] items-center gap-2 text-sm">
      <span className="truncate" title={label}>{label}</span>
      <div className="h-3 rounded bg-slate-100">
        <div className={cn('h-3 rounded', tone)} style={{ width: `${max ? (n / max) * 100 : 0}%`, minWidth: n ? 3 : 0 }} />
      </div>
      <span className="text-right tabular-nums text-xs text-muted-foreground">{n}{note ? ` · ${note}` : ''}</span>
    </div>
  );
}

export function Stat({ title, value, sub }: { title: string; value: string | number; sub?: string }) {
  return (
    <div className={statCard}>
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
