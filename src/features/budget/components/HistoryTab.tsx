// 사업 상세 › 기록 (2026-11-10) — 카드 업로드 이력 · 확정된 추경 차수
import { CheckCircle2, FileSpreadsheet } from 'lucide-react';
import { won } from '../model/budgetMath';
import type { BudgetProjectDetail } from '../types';

function day(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
}

export function HistoryTab({ detail }: { detail: BudgetProjectDetail }) {
  const events = [
    ...detail.imports.map((i) => ({
      at: i.imported_at,
      icon: FileSpreadsheet,
      tone: 'text-emerald-600',
      title: `카드 반영 — ${i.file_name ?? '파일 이름 없음'}`,
      body: [
        i.card_date ? `카드 날짜 ${i.card_date}` : null,
        `원인행위 합 ${won((i.snapshot?.lines ?? []).reduce((s, l) => s + (l.wonin || 0), 0))}`,
        i.summary?.new ? `새 줄 ${i.summary.new}` : null,
        i.summary?.budget_changed ? `예산현액 바뀐 줄 ${i.summary.budget_changed}` : null,
        i.summary?.missing ? `카드에 없는 줄 ${i.summary.missing}` : null,
      ].filter(Boolean).join(' · '),
    })),
    ...detail.revisions.filter((r) => r.status === 'confirmed').map((r) => {
      const rl = detail.revisionLines.filter((x) => x.revision_id === r.id);
      const delta = rl.reduce((s, x) => s + (x.amount - (x.prev_amount ?? 0)), 0);
      return {
        at: r.confirmed_at ?? r.created_at,
        icon: CheckCircle2,
        tone: 'text-blue-600',
        title: `${r.title} 확정`,
        body: `${rl.length}줄 바뀜 · 합계 ${delta >= 0 ? '+' : '−'}${won(Math.abs(delta))}${r.source === 'card' ? ' · 카드에서' : ''}`,
      };
    }),
  ].sort((a, b) => b.at.localeCompare(a.at));

  if (!events.length) {
    return <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">아직 기록이 없습니다.</p>;
  }
  return (
    <ol className="space-y-2">
      {events.map((e, i) => (
        <li key={`${e.at}-${i}`} className="flex min-w-0 gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <e.icon className={`mt-0.5 h-4 w-4 shrink-0 ${e.tone}`} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-slate-800" title={e.title}>{e.title}</div>
            <div className="text-xs text-slate-500">{day(e.at)} · {e.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
