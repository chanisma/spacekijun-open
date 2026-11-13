// 한 장 보기 «예산·구매» 탭 (2026-11-11 동아리 P3).
// 배정액은 담당자가, 구매 신청 페이지는 지도교사·담당자가 연다. 학생은 이 동아리 페이지에 품목을 신청하고(제안)
// 지도교사가 구매 신청 화면에서 승인·불가를 정한다(= 교사 확정). 금액은 서버가 그때그때 센다(저장하지 않는다).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, ShoppingCart, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useClubFinance, useClubMutation, useMyBudgetLines } from '../hooks/useClubs';
import { openClubPurchasePage, setClubFinance } from '../services/clubService';
import type { ClubDetail } from '../types';
import { useViewAsReadOnly, VIEW_AS_READONLY_TITLE } from '../viewAs';
import { PanelTitle } from './panel';

const won = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n).toLocaleString('ko-KR')}원`);
const NONE = '__none__';

export function FinanceTab({ club }: { club: ClubDetail }) {
  const { data: f, isLoading } = useClubFinance(club.id);
  const isStudent = club.my_role === 'leader' || club.my_role === 'member';
  const readOnly = useViewAsReadOnly();
  const open = useClubMutation(() => openClubPurchasePage(club.id), { success: () => '구매 신청 페이지를 열었습니다 — 부원이 신청하면 승인해 주세요' });

  if (isLoading || !f) return <Skeleton className="h-48 rounded-xl" />;
  const a = f.amounts;
  const base = f.allocated ?? 0;
  const remaining = f.allocated == null ? null : f.allocated - a.ordered;
  const pct = (n: number) => (base > 0 ? Math.min(100, (n / base) * 100) : 0);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="rounded-xl border bg-white p-4 ">
        <PanelTitle icon={Wallet}>예산</PanelTitle>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Figure label="배정" value={won(f.allocated)} />
          <Figure label="신청" value={won(a.requested)} />
          <Figure label="품의" value={won(a.ordered)} tone="blue" />
          <Figure label="남음" value={won(remaining)} tone={remaining != null && remaining < 0 ? 'rose' : 'emerald'} />
        </div>
        {base > 0 && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
            <div className="relative h-full">
              <div className="absolute inset-y-0 left-0 bg-slate-300" style={{ width: `${pct(a.requested)}%` }} />
              <div className="absolute inset-y-0 left-0 bg-blue-600" style={{ width: `${pct(a.ordered)}%` }} />
            </div>
          </div>
        )}
        {f.budget_line && (
          <p className="mt-2 text-xs text-slate-500">
            예산 출처 · {f.budget_line.project} › {f.budget_line.name} — 동아리들에 배정 {won(f.budget_line.allocated_to_clubs)} / {won(f.budget_line.budget_amount)}
          </p>
        )}
        {f.allocated == null && <p className="mt-2 text-xs text-slate-500">아직 배정액이 없습니다{f.can_allocate ? ' — 아래에서 정합니다' : ' — 동아리 담당자가 정합니다'}.</p>}
        {f.can_allocate && <AllocateForm club={club} allocated={f.allocated} lineId={f.budget_line?.id ?? null} note={f.note} />}
      </div>

      <div className="rounded-xl border bg-white p-4 ">
        <PanelTitle icon={ShoppingCart}>구매 신청</PanelTitle>
        {f.page ? (
          <div className="mt-2 space-y-2">
            <p className="truncate text-sm text-slate-800" title={f.page.title}>{f.page.title}</p>
            <p className="text-xs text-slate-500">
              품목 {a.items}개 · 승인 {won(a.approved)}
              {a.pending_items > 0 && !isStudent && <span className="ml-1 rounded-full bg-amber-50 px-1.5 text-amber-800">확인 대기 {a.pending_items}</span>}
            </p>
            {readOnly ? (
              <Button size="sm" disabled title={VIEW_AS_READONLY_TITLE} className="h-9 gap-1.5 bg-blue-600 text-xs">{isStudent ? '물품 신청하기' : '신청 확인·승인'}<ExternalLink className="h-3.5 w-3.5" /></Button>
            ) : (
              <Button asChild size="sm" className="h-9 gap-1.5 bg-blue-600 text-xs hover:bg-blue-700">
                <Link to={`/purchase-requests/${f.page.id}`}>{isStudent ? '물품 신청하기' : '신청 확인·승인'}<ExternalLink className="h-3.5 w-3.5" /></Link>
              </Button>
            )}
            <p className="text-xs text-slate-500">
              {isStudent ? '신청한 물품은 지도교사가 승인하면 품의로 넘어갑니다.' : '지도교사·동아리 담당자가 이 페이지의 담당자입니다. 승인한 품목은 품의 차수에 담습니다.'}
            </p>
          </div>
        ) : f.can_open_page ? (
          <div className="mt-2 space-y-2">
            <p className="text-sm text-slate-600">동아리 전용 신청 페이지를 열면 부원이 필요한 물품을 직접 신청하고, 지도교사가 승인합니다. 동아리명을 품목에 적을 필요가 없어집니다.</p>
            <Button size="sm" className="h-9 bg-blue-600 text-xs hover:bg-blue-700" disabled={open.isPending} onClick={() => open.mutate(undefined)}>구매 신청 페이지 열기</Button>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">아직 구매 신청 페이지가 없습니다. 필요하면 지도교사께 말씀해 주세요.</p>
        )}
      </div>
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'blue' | 'emerald' | 'rose' }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={cn('truncate text-sm font-semibold tabular-nums',
        tone === 'blue' ? 'text-blue-700' : tone === 'emerald' ? 'text-emerald-700' : tone === 'rose' ? 'text-rose-600' : 'text-slate-900')}>{value}</div>
    </div>
  );
}

function AllocateForm({ club, allocated, lineId, note }: { club: ClubDetail; allocated: number | null; lineId: string | null; note: string | null }) {
  const [amount, setAmount] = useState('');
  const [line, setLine] = useState<string>(NONE);
  const [memo, setMemo] = useState('');
  const { data: lines = [] } = useMyBudgetLines(club.academic_year, true);
  useEffect(() => { setAmount(allocated == null ? '' : String(allocated)); setLine(lineId ?? NONE); setMemo(note ?? ''); }, [allocated, lineId, note]);
  const save = useClubMutation(() => setClubFinance(club.id, amount.trim() ? Number(amount) : null, line === NONE ? null : line, memo.trim() || null),
    { success: () => '배정액을 저장했습니다' });
  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      <div className="grid gap-2 sm:grid-cols-[9rem_minmax(0,1fr)]">
        <div className="space-y-1">
          <Label htmlFor="cf-amt" className="text-xs">배정액(원)</Label>
          <Input id="cf-amt" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} className="h-9 text-base sm:text-sm" />
        </div>
        <div className="min-w-0 space-y-1">
          <Label className="text-xs">예산 출처(내가 담당인 사업의 줄)</Label>
          <Select value={line} onValueChange={setLine}>
            <SelectTrigger className="h-9 min-w-0" aria-label="예산 출처"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>정하지 않음</SelectItem>
              {lines.map((l) => <SelectItem key={l.id} value={l.id}>{l.project} › {l.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2">
        <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모(선택)" className="h-9 min-w-0 flex-1 text-base sm:text-sm" aria-label="메모" />
        <Button size="sm" className="h-9 bg-blue-600 text-xs hover:bg-blue-700" disabled={save.isPending} onClick={() => save.mutate(undefined)}>저장</Button>
      </div>
    </div>
  );
}
