// 사업 상세 › 추경 (2026-11-10) — 차수 기록 + 초안(= 시뮬레이션)
// 초안 줄은 «추경 후» 칸에 적은 줄만 저장한다(지금과 같으면 지움). 검사·제안은 budgetMath(단일 출처).
// 확정 = RPC budget_confirm_revision — 예산현액이 바뀌고 차수는 잠긴다(되돌릴 수 없다).
import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { CheckCircle2, Download, FilePlus2, Loader2, Plus, Sparkles, Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import {
  checkRevision, lineFigures, proposeRevision, signedWon, won, type RevisionIssue,
} from '../model/budgetMath';
import { displayProjectName } from '../model/parseBudgetCard';
import {
  confirmRevision, createDraftRevision, createLine, deleteDraftRevision, saveDraftLines,
} from '../services/budgetService';
import { useBudgetMutation } from '../hooks/useBudget';
import type { BudgetPlanItem, BudgetProjectDetail, BudgetRevision } from '../types';
import { AmountInput } from './OperationsTab';

const NONE = '__none__';

export function RevisionTab({ detail, canEdit }: { detail: BudgetProjectDetail; canEdit: boolean }) {
  const { project, lines, plans, revisions, revisionLines } = detail;
  const draft = revisions.find((r) => r.status === 'draft') ?? null;
  const confirmed = revisions.filter((r) => r.status === 'confirmed');
  const [viewId, setViewId] = useState<string | null>(null);
  const viewing: BudgetRevision | null = (viewId ? revisions.find((r) => r.id === viewId) : null) ?? draft ?? confirmed[confirmed.length - 1] ?? null;
  const [leftoverTarget, setLeftoverTarget] = useState<string>(NONE);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const plansByLine = useMemo(() => {
    const m = new Map<string, BudgetPlanItem[]>();
    for (const p of plans) m.set(p.line_id, [...(m.get(p.line_id) ?? []), p]);
    return m;
  }, [plans]);

  const draftAmounts = useMemo(() => {
    const m = new Map<string, number>();
    if (draft) for (const r of revisionLines) if (r.revision_id === draft.id) m.set(r.line_id, r.amount);
    return m;
  }, [draft, revisionLines]);

  const draftRows = lines.map((l) => ({ lineId: l.id, amount: draftAmounts.get(l.id) ?? l.budget_amount }));
  const issues = draft ? checkRevision(project.kind, lines, draftRows) : [];
  const issueByLine = new Map<string, RevisionIssue>();
  for (const i of issues) if ('lineId' in i) issueByLine.set(i.lineId, i);
  const totalIssue = issues.find((i) => i.kind === 'totalMismatch') as Extract<RevisionIssue, { kind: 'totalMismatch' }> | undefined;
  const blocking = issues.some((i) => i.kind === 'belowWonin' || i.kind === 'negative');
  const sumNow = lines.reduce((s, l) => s + l.budget_amount, 0);
  const sumAfter = draftRows.reduce((s, d) => s + d.amount, 0);
  const proposal = useMemo(() => proposeRevision(lines, plansByLine, null), [lines, plansByLine]);

  const startDraft = useBudgetMutation(() => createDraftRevision(
    project.id,
    `${Math.max(1, confirmed.filter((r) => r.source === 'manual').length + 1)}회 추경 (초안)`,
    (revisions.reduce((m, r) => Math.max(m, r.seq), -1)) + 1,
  ));
  const setAmount = useBudgetMutation(({ lineId, amount }: { lineId: string; amount: number }) => {
    const line = lines.find((l) => l.id === lineId)!;
    return saveDraftLines(draft!.id, project.id, [{ lineId, amount: amount === line.budget_amount ? null : amount }]);
  });
  const fillProposal = useBudgetMutation(() => {
    const p = proposeRevision(lines, plansByLine, leftoverTarget === NONE ? null : leftoverTarget);
    return saveDraftLines(draft!.id, project.id, p.draft.map((d) => {
      const line = lines.find((l) => l.id === d.lineId)!;
      return { lineId: d.lineId, amount: d.amount === line.budget_amount ? null : d.amount };
    }));
  }, { success: () => '제안대로 채웠습니다' });
  const addNewLine = useBudgetMutation(async () => {
    const line = await createLine({ project_id: project.id, name: '신설 산출내역', budget_amount: 0, sort_order: lines.length + 1 });
    return line;
  });
  const discard = useBudgetMutation(() => deleteDraftRevision(draft!.id), { success: () => '초안을 지웠습니다' });
  const confirm = useBudgetMutation(() => confirmRevision(draft!.id), { success: () => '추경을 확정했습니다 — 예산현액이 바뀌었습니다' });

  const exportXlsx = () => {
    const rev = viewing;
    const amountOf = (lineId: string, budget: number) => {
      if (!rev) return budget;
      const r = revisionLines.find((x) => x.revision_id === rev.id && x.line_id === lineId);
      return r ? r.amount : budget;
    };
    const prevOf = (lineId: string, budget: number) => {
      if (!rev || rev.status === 'draft') return budget;
      const r = revisionLines.find((x) => x.revision_id === rev.id && x.line_id === lineId);
      return r?.prev_amount ?? budget;
    };
    const rows = lines.map((l) => {
      const before = prevOf(l.id, l.budget_amount);
      const after = amountOf(l.id, l.budget_amount);
      return {
        비목: l.expense_item ?? '',
        산출내역: l.name,
        현재: before,
        품의: l.pumui,
        원인행위: l.wonin,
        '추경 후': after,
        증감: after - before,
        비고: [l.closed ? '마감' : '', l.pumui > l.wonin ? `결재 대기 ${won(l.pumui - l.wonin)}` : ''].filter(Boolean).join(' · '),
      };
    });
    rows.push({
      비목: '', 산출내역: '합계',
      현재: rows.reduce((s, r) => s + r.현재, 0), 품의: rows.reduce((s, r) => s + r.품의, 0),
      원인행위: rows.reduce((s, r) => s + r.원인행위, 0), '추경 후': rows.reduce((s, r) => s + r['추경 후'], 0),
      증감: rows.reduce((s, r) => s + r.증감, 0), 비고: '',
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 16 }, { wch: 36 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 24 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '추경');
    XLSX.writeFile(wb, `${displayProjectName(project.name)}_${rev?.title ?? '현재'}.xlsx`.replace(/[\\/:*?"<>|]/g, '_'));
  };

  return (
    <div className="space-y-3">
      {/* 차수 줄 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {revisions.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setViewId(r.id)}
            className={cn(
              'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs transition',
              viewing?.id === r.id ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50',
              r.status === 'draft' && 'border-dashed',
            )}
          >
            {r.status === 'confirmed' && <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
            {r.title}
          </button>
        ))}
        {canEdit && !draft && (
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => startDraft.mutate(undefined, { onSuccess: (r) => setViewId(r.id) })}>
            <FilePlus2 className="h-3.5 w-3.5" />추경 초안 만들기
          </Button>
        )}
        <Button size="sm" variant="ghost" className="ml-auto h-8 gap-1.5 text-xs text-slate-600" onClick={exportXlsx} disabled={!lines.length}>
          <Download className="h-3.5 w-3.5" />엑셀로 내보내기
        </Button>
      </div>

      {!revisions.length && (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
          아직 차수가 없습니다. 사업관리카드를 올리면 «본예산 (카드)» 차수가 생기고, 추경 초안을 만들어 금액을 맞춰 볼 수 있습니다.
        </p>
      )}

      {viewing?.status === 'draft' && (
        <div className="flex flex-col gap-2 rounded-xl border border-blue-100 bg-blue-50/40 px-3 py-2.5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1 text-xs text-slate-600">
            <span className="font-medium text-slate-800">제안</span> = 줄마다 원인행위 + 남은 계획(마감 줄은 원인행위).
            {proposal.leftover !== 0 && (
              <> 그러면 <span className="font-medium tabular-nums text-slate-800">{won(Math.abs(proposal.leftover))}원</span>이 {proposal.leftover > 0 ? '남습니다(미배정)' : '모자랍니다'} — 넣을 줄을 고르세요.</>
            )}
          </div>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-1.5">
              {proposal.leftover !== 0 && (
                <Select value={leftoverTarget} onValueChange={setLeftoverTarget}>
                  <SelectTrigger className="h-8 w-48 text-xs" aria-label="남는 금액을 넣을 줄"><SelectValue placeholder="남는 금액 넣을 줄" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>미배정으로 남기기</SelectItem>
                    {lines.filter((l) => !l.closed).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <Button size="sm" className="h-8 gap-1.5 bg-blue-600 text-xs hover:bg-blue-700" onClick={() => fillProposal.mutate(undefined)} disabled={fillProposal.isPending}>
                <Sparkles className="h-3.5 w-3.5" />제안대로 채우기
              </Button>
            </div>
          )}
        </div>
      )}

      {viewing && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-slate-50/80 text-[11px] font-medium text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">산출내역</th>
                <th className="w-28 px-2 py-2 text-right">{viewing.status === 'draft' ? '현재' : '직전'}</th>
                <th className="w-28 px-2 py-2 text-right">품의</th>
                <th className="w-28 px-2 py-2 text-right">원인행위</th>
                <th className="w-28 px-2 py-2 text-right">제안</th>
                <th className="w-36 px-2 py-2 text-right">추경 후</th>
                <th className="w-28 px-2 py-2 text-right">증감</th>
                <th className="w-44 px-2 py-2 text-left">검사</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const f = lineFigures(l, plansByLine.get(l.id) ?? []);
                const rl = revisionLines.find((x) => x.revision_id === viewing.id && x.line_id === l.id);
                const isDraft = viewing.status === 'draft';
                const before = isDraft ? l.budget_amount : (rl?.prev_amount ?? null);
                const after = isDraft ? (draftAmounts.get(l.id) ?? l.budget_amount) : (rl?.amount ?? null);
                const issue = isDraft ? issueByLine.get(l.id) : undefined;
                const delta = before !== null && after !== null ? after - before : null;
                if (!isDraft && !rl) return null; // 확정 차수는 바뀐 줄만 기록돼 있다
                return (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="max-w-0 px-3 py-1.5">
                      <div className="truncate font-medium text-slate-800" title={l.name}>{l.name}</div>
                      <div className="truncate text-[11px] text-slate-400">{l.expense_item}{l.closed ? ' · 마감' : ''}</div>
                    </td>
                    <td className="px-2 text-right tabular-nums text-slate-600">{before !== null ? won(before) : '—'}</td>
                    <td className="px-2 text-right tabular-nums text-slate-500">{won(l.pumui)}</td>
                    <td className="px-2 text-right tabular-nums text-slate-500">{won(l.wonin)}</td>
                    <td className="px-2 text-right tabular-nums text-slate-400">{won(f.proposedAfter)}</td>
                    <td className="px-2 py-1">
                      {isDraft && canEdit ? (
                        <AmountInput
                          value={after ?? 0}
                          ariaLabel={`${l.name} 추경 후`}
                          onCommit={(amount) => setAmount.mutate({ lineId: l.id, amount })}
                          className={cn(after !== l.budget_amount && 'border-blue-300 bg-blue-50/50 font-medium')}
                        />
                      ) : (
                        <div className="text-right font-medium tabular-nums">{after !== null ? won(after) : '—'}</div>
                      )}
                    </td>
                    <td className={cn('px-2 text-right tabular-nums', delta && delta > 0 ? 'text-blue-700' : delta && delta < 0 ? 'text-rose-600' : 'text-slate-300')}>
                      {delta !== null ? signedWon(delta) : '—'}
                    </td>
                    <td className="px-2 text-[11px]">
                      {issue?.kind === 'belowWonin' && <span className="text-rose-600">원인행위보다 작게 줄일 수 없음</span>}
                      {issue?.kind === 'overspent' && <span className="text-amber-700">원인행위가 예산을 {won(l.wonin - l.budget_amount)} 넘음 — 올려야 함</span>}
                      {issue?.kind === 'belowPumui' && <span className="text-amber-700">품의 대기 {won(l.pumui - (after ?? 0))} 이 깨짐</span>}
                      {issue?.kind === 'negative' && <span className="text-rose-600">음수</span>}
                      {!issue && isDraft && l.budget_amount === 0 && after !== null && after > 0 && <span className="text-blue-700">신설</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50/60 text-sm font-medium">
              <tr>
                <td className="px-3 py-2">합계</td>
                <td className="px-2 text-right tabular-nums">{viewing.status === 'draft' ? won(sumNow) : ''}</td>
                <td />
                <td />
                <td />
                <td className="px-2 text-right tabular-nums">{viewing.status === 'draft' ? won(sumAfter) : ''}</td>
                <td className={cn('px-2 text-right tabular-nums', viewing.status === 'draft' && sumAfter !== sumNow ? 'text-rose-600' : 'text-slate-400')}>
                  {viewing.status === 'draft' ? signedWon(sumAfter - sumNow) : ''}
                </td>
                <td className="px-2 text-[11px] font-normal">
                  {viewing.status === 'draft' && project.kind === 'purpose' && (
                    totalIssue
                      ? <span className="inline-flex items-center gap-1 text-rose-600"><AlertTriangle className="h-3 w-3" />사업 총액과 {signedWon(totalIssue.diff)} 다름</span>
                      : <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3 w-3" />사업 총액 일치</span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {viewing?.status === 'draft' && canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-xs text-slate-600" onClick={() => addNewLine.mutate(undefined)}>
            <Plus className="h-3.5 w-3.5" />신설 산출내역
          </Button>
          <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => discard.mutate(undefined)}>
            <Trash2 className="h-3.5 w-3.5" />초안 지우기
          </Button>
          <Button
            size="sm"
            className="ml-auto h-9 gap-1.5 bg-blue-600 text-xs hover:bg-blue-700"
            disabled={blocking || confirm.isPending}
            onClick={() => setConfirmOpen(true)}
            title={blocking ? '원인행위보다 작은 줄이 있어 확정할 수 없습니다' : undefined}
          >
            {confirm.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            추경 확정
          </Button>
        </div>
      )}

      {viewing?.status === 'confirmed' && (
        <p className="text-[11px] text-slate-500">
          확정 {viewing.confirmed_at ? new Date(viewing.confirmed_at).toLocaleDateString('ko-KR') : ''} · {viewing.source === 'card' ? '사업관리카드에서 예산현액이 바뀐 줄' : '직접 확정한 추경'} — 바뀐 줄만 기록됩니다.
          <Badge variant="outline" className="ml-1.5 h-5 px-1.5 text-[10px]">잠김</Badge>
        </p>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>«{draft?.title.replace(' (초안)', '')}»을 확정할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              바뀐 줄 {draftAmounts.size}개의 예산현액이 바뀌고, 이 차수는 잠겨 되돌릴 수 없습니다.
              {totalIssue && ` 사업 총액이 ${signedWon(totalIssue.diff)}원 달라집니다(목적사업은 보통 총액이 같아야 합니다).`}
              {issues.some((i) => i.kind === 'belowPumui') && ' 품의 대기분보다 작아지는 줄이 있습니다.'}
              {' '}에듀파인 추경 입력은 따로 해야 합니다 — 다음 카드를 올리면 서로 맞는지 보입니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-blue-600 hover:bg-blue-700"
              onClick={(e) => {
                e.preventDefault();
                confirm.mutate(undefined, { onSettled: () => setConfirmOpen(false) });
              }}
            >
              확정
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
