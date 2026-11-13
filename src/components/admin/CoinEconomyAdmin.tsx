/**
 * Admin «코인 경제»(2026-10-21 사용자 요청) — 통합 지갑(academy_user_stats.coins)을 쓰는 모든 기능의
 * 얻는 코인·쓰는 코인을 한 화면에서 조절하고, 보유 현황을 보고, 코인을 부여·회수한다.
 *
 * 정본 = DB `coin_economy_setting`(서버 함수가 economy_private.num 으로 읽는다). 쓰기는 전부 관리자 RPC
 * (`admin_coin_economy_set` · `admin_coin_grant` · `admin_academy_shop_price_set`) — 서버가 범위·권한·가챠 환급을 다시 검사한다.
 * 판정은 `lib/coinEconomyAdmin.ts`, 이 파일은 그리기만 한다. 상세 = docs/features/coin-economy.md
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Coins, History, Loader2, RefreshCw, RotateCcw, Save, Store } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DIALOG_HEADER_CLASS } from '@/components/tasks/dialogDesign';
import { Bar, Stat, statCard } from './statParts';
import { COIN_ECONOMY_QUERY_KEY, fetchCoinEconomySettings, type CoinEconomySetting } from '@/lib/coinEconomy';
import {
  APP_LABEL, DEFAULT_WALLET_FILTER, applySettingEdit, DIRECTION_LABEL, ROLE_LABEL, filterWallets, groupSettings, historyKindLabel, moveReason, settingChanges, summarizeEconomy,
  WALLET_PAGE_SIZES, pageButtons, paginate, sortWallets, studentNumberOf, summarizeWallets,
  type CoinHistoryRow, type CoinMove, type EconomyKindRow, type EconomyStats, type CoinWallet, type SettingDraft, type WalletFilter, type WalletSort,
} from '@/lib/coinEconomyAdmin';

const rpc = async <T,>(name: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw new Error(error.message);
  return data as unknown as T;
};

const SETTINGS_KEY = ['coin-economy-admin'] as const;
const WALLETS_KEY = ['coin-wallets-admin'] as const;

const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

export function CoinEconomyAdmin() {
  return (
    <section aria-label="코인 경제" className="space-y-4">
      <p className="text-xs text-muted-foreground">
        아카데미 · 다마고찌 · 별까지 쌓기 · 자습실 · 플래너 · 이세계 3D 는 <b>지갑 하나</b>(코인)를 함께 씁니다. 바꾼 값은 저장하는 즉시 서버에 적용되고, 학생 화면은 다음에 열 때 새 숫자를 보여 줍니다.
      </p>
      <Tabs defaultValue="wallets">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="wallets">보유 현황 · 부여</TabsTrigger>
          <TabsTrigger value="stats">경제 통계</TabsTrigger>
          <TabsTrigger value="settings">얻기 · 쓰기 설정</TabsTrigger>
          <TabsTrigger value="shop">아카데미 상점 값</TabsTrigger>
          <TabsTrigger value="log">변경 기록</TabsTrigger>
        </TabsList>
        <TabsContent value="wallets" className="mt-4"><WalletsPanel /></TabsContent>
        <TabsContent value="stats" className="mt-4"><EconomyStatsPanel /></TabsContent>
        <TabsContent value="settings" className="mt-4"><SettingsPanel /></TabsContent>
        <TabsContent value="shop" className="mt-4"><ShopPanel /></TabsContent>
        <TabsContent value="log" className="mt-4"><LogPanel /></TabsContent>
      </Tabs>
    </section>
  );
}

// ── 보유 현황 · 부여 ─────────────────────────────────────────────────

/** 최근 획득·사용 한 칸 — 사유(이름표·메모)를 첫 줄에, 값과 시각을 둘째 줄에 */
function MoveCell({ move, sign }: { move?: CoinMove | null; sign: '+' | '−' }) {
  if (!move) return <td className="p-2 text-xs text-slate-400">—</td>;
  const reason = moveReason(move);
  return (
    <td className="max-w-[14rem] p-2 text-xs">
      <span className="block truncate text-slate-700" title={reason}>{reason}</span>
      <span className="block text-muted-foreground">
        <b className={cn('tabular-nums', sign === '+' ? 'text-emerald-600' : 'text-rose-600')}>{sign}{move.amount}</b>
        <span className="ml-1">{fmtTime(move.at)}</span>
      </span>
    </td>
  );
}

export function WalletsPanel() {
  const cache = useQueryClient();
  const q = useQuery({ queryKey: WALLETS_KEY, queryFn: () => rpc<CoinWallet[]>('admin_coin_wallets') });
  const [filter, setFilter] = useState<WalletFilter>(DEFAULT_WALLET_FILTER);
  const [sort, setSort] = useState<WalletSort>('coins_desc');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [historyOf, setHistoryOf] = useState<CoinWallet | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(WALLET_PAGE_SIZES[0]);

  const rows = useMemo(() => sortWallets(filterWallets(q.data ?? [], filter), sort), [q.data, filter, sort]);
  const summary = useMemo(() => summarizeWallets(rows), [rows]);
  const grades = useMemo(() => [...new Set((q.data ?? []).map((r) => r.grade).filter(Boolean) as string[])].sort(), [q.data]);
  const classes = useMemo(() => [...new Set((q.data ?? []).filter((r) => !filter.grade || r.grade === filter.grade).map((r) => r.class).filter(Boolean) as string[])]
    .sort((a, b) => Number(a) - Number(b)), [q.data, filter.grade]);

  // 거르기·정렬이 바뀌면 첫 쪽으로(뒤쪽에 남아 있으면 바뀐 결과의 앞을 못 본다)
  const set = (patch: Partial<WalletFilter>) => { setFilter((f) => ({ ...f, ...patch })); setPage(1); };
  const view = paginate(rows, page, pageSize);
  // 머리 체크박스 = 이 쪽만. 다른 쪽까지는 «결과 전체 고르기»
  const allPicked = view.items.length > 0 && view.items.every((r) => picked.has(r.user_id));
  const allRowsPicked = rows.length > 0 && rows.every((r) => picked.has(r.user_id));
  const pickedOffPage = [...picked].filter((id) => !view.items.some((r) => r.user_id === id)).length;
  const togglePick = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setPicked((s) => {
    const n = new Set(s);
    if (allPicked) view.items.forEach((r) => n.delete(r.user_id)); else view.items.forEach((r) => n.add(r.user_id));
    return n;
  });

  if (q.isPending) return <p role="status" className="text-sm text-muted-foreground">지갑을 불러오는 중…</p>;
  if (q.isError) return <p role="alert" className="text-sm text-rose-600">{(q.error as Error).message}</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat title="보이는 사람" value={summary.people} sub={`지갑 있음 ${summary.withWallet}명`} />
        <Stat title="코인 합" value={summary.total.toLocaleString()} sub="지갑 있는 사람만" />
        <Stat title="중앙값 · 평균" value={summary.median === null ? '—' : `${summary.median} · ${summary.mean}`} />
        <Stat title="가장 많이" value={summary.max ?? '—'} />
        <Stat title="사용한 코인 합" value={summary.spentTotal.toLocaleString()} sub={`한 번이라도 쓴 사람 ${summary.spenders}명`} />
      </div>

      <GrantPanel
        targets={(q.data ?? []).filter((r) => picked.has(r.user_id))}
        onDone={() => { setPicked(new Set()); void cache.invalidateQueries({ queryKey: WALLETS_KEY }); }}
      />

      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2.5 shadow-sm">
        <div className="flex rounded-lg border border-slate-100 bg-slate-100/50 p-1 text-xs">
          {([['student', '학생'], ['faculty', '교직원'], ['all', '전체']] as const).map(([v, label]) => (
            <button key={v} type="button" onClick={() => set({ role: v, grade: '', klass: '' })}
              className={cn('rounded-md px-2.5 py-1', filter.role === v ? 'bg-white font-semibold shadow-sm' : 'text-slate-500')}>{label}</button>
          ))}
        </div>
        {filter.role !== 'faculty' && (
          <>
            <select aria-label="학년" className="h-8 rounded-md border bg-background px-2 text-xs" value={filter.grade} onChange={(e) => set({ grade: e.target.value, klass: '' })}>
              <option value="">전 학년</option>
              {grades.map((g) => <option key={g} value={g}>{g}학년</option>)}
            </select>
            <select aria-label="반" className="h-8 rounded-md border bg-background px-2 text-xs" value={filter.klass} onChange={(e) => set({ klass: e.target.value })}>
              <option value="">전체 반</option>
              {classes.map((c) => <option key={c} value={c}>{c}반</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs">
              <Checkbox checked={filter.activeOnly} onCheckedChange={(v) => set({ activeOnly: v === true })} /> 재학생만
            </label>
          </>
        )}
        <label className="flex items-center gap-1.5 text-xs">
          <Checkbox checked={filter.withWallet} onCheckedChange={(v) => set({ withWallet: v === true })} /> 지갑 있는 사람만
        </label>
        <Input value={filter.search} onChange={(e) => set({ search: e.target.value })} placeholder="이름 · 이메일 · 학번" className="h-8 w-44 text-xs" />
        <select aria-label="정렬" className="h-8 rounded-md border bg-background px-2 text-xs" value={sort} onChange={(e) => { setSort(e.target.value as WalletSort); setPage(1); }}>
          <option value="coins_desc">코인 많은 순</option>
          <option value="recent">최근 변동 순</option>
          <option value="earned_recent">최근 획득 순</option>
          <option value="coins_asc">코인 적은 순</option>
          <option value="spent_desc">많이 쓴 순</option>
          <option value="number">학번 순</option>
          <option value="name">이름 순</option>
        </select>
        <Button variant="ghost" size="sm" className="ml-auto h-8 gap-1 text-xs" onClick={() => void q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={cn('h-3.5 w-3.5', q.isFetching && 'animate-spin')} /> 새로고침
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>고른 사람 <b className="text-slate-800">{picked.size}</b>명{pickedOffPage > 0 && ` (다른 쪽 ${pickedOffPage}명 포함)`}</span>
        <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={!rows.length || allRowsPicked}
          onClick={() => setPicked((s) => { const n = new Set(s); rows.forEach((r) => n.add(r.user_id)); return n; })}>
          결과 {rows.length}명 모두 고르기
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={!picked.size} onClick={() => setPicked(new Set())}>고르기 해제</Button>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[1040px] text-sm">
          <thead className="border-b bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="w-10 p-2"><Checkbox aria-label="이 쪽 모두 고르기" checked={allPicked} onCheckedChange={toggleAll} /></th>
              <th className="p-2 text-left font-medium">이름</th>
              <th className="p-2 text-left font-medium">학번 · 역할</th>
              <th className="p-2 text-right font-medium">코인</th>
              <th className="p-2 text-right font-medium" title="스스로 쓴 코인(낸 값 − 돌려받은 값). 출석 취소·관리자 회수는 빼고 셉니다">사용한 코인</th>
              <th className="p-2 text-left font-medium">최근 획득 · 사유</th>
              <th className="p-2 text-left font-medium">최근 사용 · 사유</th>
              <th className="p-2 text-right font-medium">마지막 변동</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {view.items.map((r) => (
              <tr key={r.user_id} className={cn('border-b last:border-0', picked.has(r.user_id) && 'bg-blue-50/60')}>
                <td className="p-2 text-center"><Checkbox aria-label={`${r.name} 고르기`} checked={picked.has(r.user_id)} onCheckedChange={() => togglePick(r.user_id)} /></td>
                <td className="max-w-[16rem] p-2">
                  <p className="truncate font-medium" title={r.name}>{r.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground" title={r.email ?? ''}>{r.email}</p>
                </td>
                <td className="p-2 text-xs text-slate-600">
                  {r.role === 'student' ? (studentNumberOf(r) ?? '학번 없음') : ROLE_LABEL[r.role] ?? r.role}
                  {r.role === 'student' && r.status && r.status !== 'active' && <span className="ml-1 text-slate-400">({r.status})</span>}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {r.coins === null ? <span className="text-xs text-slate-400" title="처음 쓰면 100 코인으로 시작">지갑 없음</span> : <b>{r.coins.toLocaleString()}</b>}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {(r.spent ?? 0) > 0
                    ? <span title={r.spent_approx ? '아카데미 상점 구매·펫 자리는 값이 남지 않아 지금 값으로 셌어요' : undefined}>{r.spent_approx ? '≈' : ''}{r.spent!.toLocaleString()}</span>
                    : <span className="text-xs text-slate-400">0</span>}
                </td>
                <MoveCell move={r.last_earned} sign="+" />
                <MoveCell move={r.last_spent} sign="−" />
                <td className="p-2 text-right text-xs text-muted-foreground">{fmtTime(r.updated_at)}</td>
                <td className="p-2 text-right">
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setHistoryOf(r)}>
                    <History className="h-3.5 w-3.5" /> 기록
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-sm text-muted-foreground">조건에 맞는 사람이 없어요.</td></tr>}
          </tbody>
        </table>
      </div>

      <Pager page={view.page} pages={view.pages} from={view.from} to={view.to} total={rows.length} size={pageSize}
        onPage={setPage} onSize={(n) => { setPageSize(n); setPage(1); }} />

      <HistoryDialog wallet={historyOf} onClose={() => setHistoryOf(null)} />
    </div>
  );
}

function Pager({ page, pages, from, to, total, size, onPage, onSize }: {
  page: number; pages: number; from: number; to: number; total: number; size: number; onPage: (p: number) => void; onSize: (n: number) => void;
}) {
  if (!total) return null;
  return (
    <nav aria-label="쪽 넘기기" className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
      <span className="tabular-nums">{from}–{to} / {total}명</span>
      <div className="mx-auto flex items-center gap-1">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="이전 쪽">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {pageButtons(page, pages).map((n, i) => n === null
          ? <span key={`gap-${i}`} className="px-1">…</span>
          : <Button key={n} variant={n === page ? 'default' : 'ghost'} size="sm" aria-current={n === page ? 'page' : undefined}
              className={cn('h-8 min-w-8 px-2 text-xs tabular-nums', n === page && 'bg-blue-600 hover:bg-blue-700')} onClick={() => onPage(n)}>{n}</Button>)}
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="다음 쪽">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <select aria-label="한 쪽에 몇 명" className="h-8 rounded-md border bg-background px-2 text-xs" value={size} onChange={(e) => onSize(Number(e.target.value))}>
        {WALLET_PAGE_SIZES.map((n) => <option key={n} value={n}>{n}명씩</option>)}
      </select>
    </nav>
  );
}

function GrantPanel({ targets, onDone }: { targets: CoinWallet[]; onDone: () => void }) {
  const [mode, setMode] = useState<'grant' | 'revoke'>('grant');
  const [amount, setAmount] = useState('10');
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const n = Number(amount);
  const amountOk = /^\d+$/.test(amount.trim()) && n >= 1 && n <= 10000;
  const ready = targets.length > 0 && amountOk && note.trim().length > 0 && !busy;

  // 확인 = 화면 안 상자. window.confirm 은 크롬 «추가 대화상자 차단»을 한 번 누르면 창 없이 곧바로 «취소»가 돼
  // 단추가 아무 일도 안 하는 것처럼 보였다(2026-10-21 제보 — 설정 저장과 같은 원인)
  const [confirming, setConfirming] = useState(false);
  const names = targets.slice(0, 5).map((t) => t.name).join(', ') + (targets.length > 5 ? ` 외 ${targets.length - 5}명` : '');
  const verb = mode === 'grant' ? `${n}코인씩 부여` : `${n}코인씩 회수(가진 만큼만)`;
  async function submit() {
    const signed = mode === 'grant' ? n : -n;
    setConfirming(false);
    setBusy(true);
    try {
      const res = await rpc<{ users: number; moved: number }>('admin_coin_grant', {
        p_users: targets.map((t) => t.user_id), p_amount: signed, p_note: note.trim(), p_notify: notify && mode === 'grant',
      });
      toast.success(mode === 'grant' ? `${res.users}명에게 모두 ${res.moved}코인을 부여했어요.` : `${res.users}명에게서 모두 ${-res.moved}코인을 회수했어요.`);
      setNote('');
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><Coins className="h-4 w-4" /></span>
        <p className="text-sm font-semibold text-slate-800">코인 부여 · 회수</p>
        <p className="text-[11px] text-slate-400">아래 목록에서 사람을 고르세요 — 지금 {targets.length}명 골랐어요</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-100 bg-slate-100/50 p-1 text-xs">
          <button type="button" onClick={() => setMode('grant')} className={cn('rounded-md px-2.5 py-1', mode === 'grant' ? 'bg-emerald-600 font-semibold text-white' : 'text-slate-500')}>부여</button>
          <button type="button" onClick={() => setMode('revoke')} className={cn('rounded-md px-2.5 py-1', mode === 'revoke' ? 'bg-rose-600 font-semibold text-white' : 'text-slate-500')}>회수</button>
        </div>
        <Input aria-label="한 사람당 코인" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-8 w-24 text-xs" />
        <span className="text-xs text-slate-500">코인씩</span>
        <Input aria-label="사유" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="사유(학생 알림·기록에 남아요)" className="h-8 min-w-[14rem] flex-1 text-xs" />
        {mode === 'grant' && (
          <label className="flex items-center gap-1.5 text-xs"><Checkbox checked={notify} onCheckedChange={(v) => setNotify(v === true)} /> 받는 사람에게 알림</label>
        )}
        <Button size="sm" className={cn('h-8 text-xs', mode === 'grant' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-rose-600 hover:bg-rose-700')} disabled={!ready || confirming} onClick={() => setConfirming(true)}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {targets.length}명에게 {mode === 'grant' ? '부여' : '회수'}
        </Button>
      </div>
      {confirming && ready && (
        <div role="group" aria-label="부여 확인" className={cn('rounded-lg border p-3 text-xs text-slate-800', mode === 'grant' ? 'border-blue-200 bg-blue-50' : 'border-rose-200 bg-rose-50')} data-grant-confirm>
          <p className="font-semibold">{targets.length}명({names})에게 {verb}할까요?</p>
          <p className="mt-0.5">사유: {note.trim()} · 되돌리려면 반대로 다시 처리해야 합니다.</p>
          <div className="mt-2 flex justify-end gap-1.5">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setConfirming(false)}>취소</Button>
            <Button size="sm" className={cn('h-8 text-xs', mode === 'grant' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-rose-600 hover:bg-rose-700')} onClick={() => void submit()}>
              {mode === 'grant' ? '부여하기' : '회수하기'}
            </Button>
          </div>
        </div>
      )}
      {!amountOk && <p className="text-[11px] text-rose-600">1~10000 사이의 정수로 적어 주세요.</p>}
      <p className="text-[11px] text-slate-400">회수는 가진 코인을 넘지 않습니다(0 아래로 내려가지 않음). 지갑이 없는 사람은 100 코인으로 지갑이 만들어진 뒤 더하거나 뺍니다.</p>
    </div>
  );
}

function HistoryDialog({ wallet, onClose }: { wallet: CoinWallet | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['coin-history-admin', wallet?.user_id],
    queryFn: () => rpc<{ coins: number | null; spent?: number; rows: CoinHistoryRow[] }>('admin_coin_history', { p_user: wallet!.user_id, p_limit: 120 }),
    enabled: !!wallet,
  });
  return (
    <Dialog open={!!wallet} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle className="truncate">{wallet?.name} · 코인 기록</DialogTitle>
          <DialogDescription>지금 {q.data?.coins ?? wallet?.coins ?? '—'}코인 · 사용한 코인 {(q.data?.spent ?? wallet?.spent ?? 0).toLocaleString()} · 기록이 남는 경로만 보입니다(플래너 «오늘 완료»는 따로 기록되지 않아요).</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto px-4 pb-4 sm:px-6">
          {q.isPending && <p className="py-6 text-center text-sm text-muted-foreground">불러오는 중…</p>}
          {q.isError && <p className="py-6 text-center text-sm text-rose-600">{(q.error as Error).message}</p>}
          {q.data && q.data.rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">기록이 없어요.</p>}
          <ul className="divide-y">
            {q.data?.rows.map((r, i) => (
              <li key={i} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-24 shrink-0 text-[11px] text-muted-foreground">{fmtTime(r.at)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{historyKindLabel(r.kind)}</span>
                  {r.note && <span className="block truncate text-[11px] text-muted-foreground" title={r.note}>{r.note}</span>}
                </span>
                <span className={cn('shrink-0 tabular-nums font-semibold', r.delta > 0 ? 'text-emerald-600' : r.delta < 0 ? 'text-rose-600' : 'text-slate-400')}>
                  {r.delta > 0 ? `+${r.delta}` : r.delta}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── 얻기 · 쓰기 설정 ─────────────────────────────────────────────────

export function SettingsPanel() {
  const cache = useQueryClient();
  const q = useQuery({ queryKey: SETTINGS_KEY, queryFn: fetchCoinEconomySettings });
  const [draft, setDraft] = useState<SettingDraft>({});
  const [autoNote, setAutoNote] = useState('');
  const [busy, setBusy] = useState(false);
  const settings = useMemo(() => q.data ?? [], [q.data]);
  const groups = useMemo(() => groupSettings(settings), [settings]);
  const { changes, problems } = useMemo(() => settingChanges(settings, draft), [settings, draft]);
  const changed = Object.keys(changes).length;
  const hasProblem = Object.keys(problems).length > 0;

  // 확인은 화면 안 상자 — window.confirm 은 크롬 «추가 대화상자 차단»을 한 번 누르면 창 없이 곧바로 «취소»가 돼
  // 저장 단추가 아무 일도 안 하는 것처럼 보였다(2026-10-21 제보: 가챠 값 · 이세계 하루 동전 횟수. 서버는 정상, 요청이 0건)
  const [confirming, setConfirming] = useState(false);
  const changeLines = Object.entries(changes).map(([k, v]) => {
    const s = settings.find((x) => x.key === k);
    return s ? `${s.label}: ${s.value} → ${v}${s.unit === '코인' ? '' : s.unit}` : `${k}: ${v}`;
  });
  async function save() {
    setConfirming(false);
    setBusy(true);
    try {
      await rpc('admin_coin_economy_set', { p_values: changes });
      toast.success(`코인 설정 ${changed}개를 바꿨어요.`);
      setDraft({});
      setAutoNote('');
      await Promise.all([cache.invalidateQueries({ queryKey: SETTINGS_KEY }), cache.invalidateQueries({ queryKey: COIN_ECONOMY_QUERY_KEY })]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (q.isPending) return <p role="status" className="text-sm text-muted-foreground">설정을 불러오는 중…</p>;
  if (q.isError) return <p role="alert" className="text-sm text-rose-600">{(q.error as Error).message}</p>;

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-card/95 p-2.5 shadow-sm backdrop-blur">
        <p className="text-sm font-semibold text-slate-800">얻기 · 쓰기 설정</p>
        <p className="text-[11px] text-slate-400">{changed ? `바꾼 값 ${changed}개` : '값을 고치면 여기서 한 번에 저장합니다'}</p>
        {hasProblem && (
          <p role="alert" className="w-full text-[11px] font-medium text-rose-600 sm:order-last">
            저장할 수 없어요 — {Object.entries(problems).map(([k, why]) => `«${settings.find((x) => x.key === k)?.label ?? k}» ${why}`).join(' · ')}
          </p>
        )}
        {autoNote && !hasProblem && <p className="w-full text-[11px] text-blue-600 sm:order-last">{autoNote}</p>}
        <div className="ml-auto flex gap-1.5">
          <Button variant="ghost" size="sm" className="h-8 text-xs" disabled={!Object.keys(draft).length || busy} onClick={() => { setDraft({}); setAutoNote(''); setConfirming(false); }}>되돌리기</Button>
          <Button size="sm" className="h-8 gap-1 bg-blue-600 text-xs hover:bg-blue-700" disabled={!changed || hasProblem || busy || confirming} onClick={() => setConfirming(true)}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} 저장
          </Button>
        </div>
        {confirming && changed > 0 && !hasProblem && (
          <div role="group" aria-label="저장 확인" className="w-full rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-slate-800 sm:order-last" data-coin-confirm>
            <p className="font-semibold">{changed}개 값을 바꿀까요? 저장하는 즉시 모든 학생에게 적용됩니다.</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">{changeLines.map((l) => <li key={l}>{l}</li>)}</ul>
            <div className="mt-2 flex justify-end gap-1.5">
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setConfirming(false)}>취소</Button>
              <Button size="sm" className="h-8 gap-1 bg-blue-600 text-xs hover:bg-blue-700" onClick={() => void save()}><Save className="h-3.5 w-3.5" /> 바꾸기</Button>
            </div>
          </div>
        )}
      </div>

      {groups.map((g) => (
        <div key={`${g.app}-${g.direction}`} className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b px-4 py-2">
            <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-semibold',
              g.direction === 'earn' ? 'bg-emerald-50 text-emerald-700' : g.direction === 'spend' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600')}>
              {DIRECTION_LABEL[g.direction]}
            </span>
            <p className="text-sm font-semibold text-slate-800">{APP_LABEL[g.app] ?? g.app}</p>
          </div>
          <ul className="divide-y">
            {g.rows.map((s) => <SettingRow key={s.key} s={s} draft={draft[s.key]} problem={problems[s.key]} onChange={(v) => {
              const r = applySettingEdit(settings, draft, s.key, v);
              setDraft(r.draft);
              setAutoNote(r.adjusted ? `겹침 환급도 ${r.adjusted.value}코인으로 함께 낮췄어요(값보다 클 수 없어요).` : '');
            }} />)}
          </ul>
        </div>
      ))}
    </div>
  );
}

function SettingRow({ s, draft, problem, onChange }: { s: CoinEconomySetting; draft: string | undefined; problem?: string; onChange: (v: string) => void }) {
  const shown = draft ?? String(s.value);
  const dirty = draft !== undefined && draft.trim() !== String(s.value);
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
      <div className="min-w-0">
        <p className="truncate text-sm" title={s.label}>{s.label}</p>
        <p className="text-[11px] text-muted-foreground">
          {s.note ? `${s.note} · ` : ''}기본 {s.default_value}{s.unit} · 범위 {s.min_value}~{s.max_value}
          {s.value !== s.default_value && <span className="ml-1 font-semibold text-amber-600">(기본값과 다름)</span>}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <Input aria-label={s.label} inputMode="numeric" value={shown} onChange={(e) => onChange(e.target.value)}
          className={cn('h-8 w-20 text-right text-xs tabular-nums', dirty && 'border-blue-400 bg-blue-50', problem && 'border-rose-400 bg-rose-50')} />
        <span className="w-6 text-xs text-slate-500">{s.unit}</span>
      </div>
      <Button variant="ghost" size="sm" className="col-span-2 h-7 justify-self-end gap-1 text-[11px] text-slate-500 sm:col-span-1"
        disabled={String(s.default_value) === shown.trim()} onClick={() => onChange(String(s.default_value))} title="기본값으로">
        <RotateCcw className="h-3 w-3" /> 기본값
      </Button>
      {problem && <p className="col-span-full text-[11px] text-rose-600">{problem}</p>}
    </li>
  );
}

// ── 아카데미 상점 값 ─────────────────────────────────────────────────

interface ShopItem { id: number; name: string; slot: string; type: string; price: number; active: boolean; owners: number }

function ShopPanel() {
  const cache = useQueryClient();
  const q = useQuery({ queryKey: ['academy-shop-admin'], queryFn: () => rpc<ShopItem[]>('admin_academy_shop_items') });
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);

  async function save(item: ShopItem) {
    const v = Number(draft[item.id]);
    if (!Number.isInteger(v) || v < 0 || v > 10000) { toast.error('값은 0~10000 사이의 정수로 적어 주세요.'); return; }
    setBusy(item.id);
    try {
      await rpc('admin_academy_shop_price_set', { p_item: item.id, p_price: v });
      setDraft((d) => { const n = { ...d }; delete n[item.id]; return n; });
      await cache.invalidateQueries({ queryKey: ['academy-shop-admin'] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (q.isPending) return <p role="status" className="text-sm text-muted-foreground">상점을 불러오는 중…</p>;
  if (q.isError) return <p role="alert" className="text-sm text-rose-600">{(q.error as Error).message}</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        별빛 아카데미 옷장·방 상점 물건의 값입니다. 학생 공방 작품의 값은 «얻기 · 쓰기 설정»의 «공방 작품 진열 가격»이 정합니다(새로 배송되는 작품부터).
      </p>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="border-b bg-slate-50 text-xs text-slate-500">
            <tr><th className="p-2 text-left font-medium">물건</th><th className="p-2 text-left font-medium">자리</th><th className="p-2 text-right font-medium">가진 사람</th><th className="p-2 text-right font-medium">값</th></tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((item) => {
              const value = draft[item.id] ?? String(item.price);
              const dirty = draft[item.id] !== undefined && draft[item.id] !== String(item.price);
              return (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="max-w-[16rem] p-2"><span className="block truncate" title={item.name}>{item.name}</span>{!item.active && <span className="text-[11px] text-slate-400">판매 중지</span>}</td>
                  <td className="p-2 text-xs text-slate-500">{item.slot}</td>
                  <td className="p-2 text-right text-xs tabular-nums">{item.owners}</td>
                  <td className="p-2">
                    <div className="flex items-center justify-end gap-1.5">
                      <Input aria-label={`${item.name} 값`} inputMode="numeric" value={value} onChange={(e) => setDraft((d) => ({ ...d, [item.id]: e.target.value }))}
                        className={cn('h-8 w-20 text-right text-xs tabular-nums', dirty && 'border-blue-400 bg-blue-50')} />
                      <Button size="sm" className="h-8 gap-1 bg-blue-600 text-xs hover:bg-blue-700" disabled={!dirty || busy === item.id} onClick={() => void save(item)}>
                        {busy === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Store className="h-3.5 w-3.5" />} 저장
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 변경 기록 ────────────────────────────────────────────────────────

interface SettingLog { id: number; key: string; old_value: number | null; new_value: number; changed_by: string | null; changed_at: string }
interface GrantLog { id: string; admin_id: string | null; amount: number; note: string; user_count: number; moved_total: number; created_at: string }

// ── 경제 통계(2026-10-26) ───────────────────────────────────────────

const RARITY_LABEL: Record<string, string> = { common: '보통', rare: '특별', epic: '희귀', legendary: '전설' };
const n0 = (n: number | null | undefined) => (n ?? 0).toLocaleString();

export function EconomyStatsPanel() {
  const q = useQuery({ queryKey: ['coin-economy-stats-admin'], queryFn: () => rpc<EconomyStats>('admin_coin_economy_stats') });
  if (q.isPending) return <p role="status" className="text-sm text-muted-foreground">통계를 불러오는 중…</p>;
  if (q.isError) return <p role="alert" className="text-sm text-rose-600">{(q.error as Error).message}</p>;
  const s = q.data;
  const sum = summarizeEconomy(s);
  const dayMax = Math.max(1, ...s.daily.flatMap((d) => [d.earned, d.spent]));
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-xs text-muted-foreground">
          발행 = 지갑 시작 지급({s.start_per_wallet}코인 × {n0(s.wallets)}개) + 활동으로 얻은 코인. 사용·획득은 「기록」 창과 같은 기준으로 셉니다(환급·환불은 뺀 값).
        </p>
        <Button variant="ghost" size="sm" className="ml-auto h-8 gap-1 text-xs" onClick={() => void q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={cn('h-3.5 w-3.5', q.isFetching && 'animate-spin')} /> 새로고침
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat title="발행된 총 코인" value={n0(sum.issued)} sub={`시작 ${n0(s.started)} + 획득 ${n0(s.earned)}`} />
        <Stat title="시중에 풀린 코인" value={n0(s.circulating)} sub={`지갑 ${n0(s.wallets)}개에 남은 합`} />
        <Stat title="사용된 코인" value={`${s.spent_approx ? '≈' : ''}${n0(s.spent)}`} sub={sum.spendRate === null ? undefined : `발행의 ${sum.spendRate}%`} />
        <Stat title="벌어들인 코인" value={n0(s.earned)} sub="출석·업적·보상·관리자 부여 등" />
        <Stat title="수익화(의뢰 작품)" value={n0(s.royalty)} sub={`받은 사람 ${n0(s.royalty_people)}명`} />
        <Stat title="회수된 코인" value={n0(s.revoked)} sub="출석 취소 · 관리자 회수" />
      </div>
      <p className={cn('rounded-lg border px-3 py-2 text-xs', sum.unexplained === 0 ? 'text-muted-foreground' : 'border-amber-200 bg-amber-50 text-amber-900')}>
        기록대로라면 지갑에 남아 있어야 할 코인 = 발행 − 사용 − 회수 =<b className="tabular-nums">{n0(sum.expected)}</b>
        {sum.unexplained === 0
          ? ' — 시중 코인과 같습니다.'
          : <> · 시중과의 차이 <b className="tabular-nums">{sum.unexplained > 0 ? '+' : ''}{n0(sum.unexplained)}</b> — 통합 원장이 생기기 전의 지급처럼 기록 밖에서 움직인 코인입니다{s.spent_approx ? '(상점 구매·펫 자리는 지금 값으로 세어 오차가 섞입니다)' : ''}.</>}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <KindTable title="어디서 얻었나" rows={s.earn_by_kind} tone="bg-emerald-500" />
        <KindTable title="어디에 썼나" rows={s.spend_by_kind} tone="bg-rose-500" />
      </div>

      <div className={statCard}>
        <p className="mb-2 text-sm font-semibold">최근 14일 — 얻기 · 쓰기</p>
        <div className="space-y-1">
          {s.daily.map((d) => (
            <div key={d.day} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-2">
              <span className="text-xs tabular-nums text-muted-foreground">{d.day.slice(5).replace('-', '/')}</span>
              <div className="space-y-0.5">
                <Bar label="얻기" n={d.earned} max={dayMax} tone="bg-emerald-500" />
                <Bar label="쓰기" n={d.spent} max={dayMax} tone="bg-rose-500" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <p className="border-b px-4 py-2 text-sm font-semibold">수익화 — 의뢰로 만든 가챠 물건</p>
        <p className="px-4 pt-2 text-xs text-muted-foreground">다른 사람이 코인을 내고 뽑으면 의뢰자가 뽑기 값의 일부를 받습니다(비율·상한은 «얻기 · 쓰기 설정» ▸ 다마고찌). 뽑힌 횟수는 수익이 생기기 전 기록까지 셉니다.</p>
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-xs text-slate-500">
            <tr><th className="p-2 text-left font-medium">물건</th><th className="p-2 text-left font-medium">의뢰자</th><th className="p-2 text-right font-medium">남이 뽑은 횟수</th><th className="p-2 text-right font-medium">지급한 수익</th></tr>
          </thead>
          <tbody>
            {s.royalty_items.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.name} <span className="text-xs text-muted-foreground">{RARITY_LABEL[r.rarity] ?? r.rarity}</span></td>
                <td className="p-2">{r.creator ?? '—'}</td>
                <td className="p-2 text-right tabular-nums">{n0(r.draws)}</td>
                <td className="p-2 text-right tabular-nums font-medium">{n0(r.paid)}</td>
              </tr>
            ))}
            {s.royalty_items.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-sm text-muted-foreground">의뢰자가 적힌 가챠 물건이 없어요.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KindTable({ title, rows, tone }: { title: string; rows: EconomyKindRow[]; tone: string }) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <div className={statCard}>
      <p className="mb-2 text-sm font-semibold">{title}</p>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">기록이 없어요.</p>}
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.kind} title={`${r.times.toLocaleString()}번 · ${r.people.toLocaleString()}명 · 최근 7일 ${(r.week ?? 0).toLocaleString()}`}>
            <Bar label={historyKindLabel(r.kind)} n={r.amount} max={max} tone={tone} note={`${r.people}명${r.approx ? ' · ≈' : ''}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

function LogPanel() {
  const q = useQuery({
    queryKey: ['coin-economy-log-admin'],
    queryFn: async () => {
      const [logs, grants, settings] = await Promise.all([
        supabase.from('coin_economy_setting_log' as never).select('*').order('changed_at', { ascending: false }).limit(200),
        supabase.from('coin_admin_grant' as never).select('*').order('created_at', { ascending: false }).limit(100),
        fetchCoinEconomySettings(),
      ]);
      if (logs.error) throw new Error(logs.error.message);
      if (grants.error) throw new Error(grants.error.message);
      const L = (logs.data ?? []) as unknown as SettingLog[];
      const G = (grants.data ?? []) as unknown as GrantLog[];
      const ids = [...new Set([...L.map((l) => l.changed_by), ...G.map((g) => g.admin_id)].filter(Boolean) as string[])];
      const names = new Map<string, string>();
      if (ids.length) {
        const { data } = await supabase.from('profiles').select('id, name').in('id', ids);
        for (const p of data ?? []) names.set(p.id, p.name ?? '');
      }
      return { logs: L, grants: G, labels: new Map(settings.map((s) => [s.key, s.label])), names };
    },
  });
  if (q.isPending) return <p role="status" className="text-sm text-muted-foreground">기록을 불러오는 중…</p>;
  if (q.isError) return <p role="alert" className="text-sm text-rose-600">{(q.error as Error).message}</p>;
  const { logs, grants, labels, names } = q.data;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border bg-card shadow-sm">
        <p className="border-b px-4 py-2 text-sm font-semibold">설정 변경</p>
        {logs.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">아직 바꾼 설정이 없어요.</p>}
        <ul className="divide-y">
          {logs.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="w-24 shrink-0 text-[11px] text-muted-foreground">{fmtTime(l.changed_at)}</span>
              <span className="min-w-0 flex-1 truncate" title={labels.get(l.key) ?? l.key}>{labels.get(l.key) ?? l.key}</span>
              <span className="shrink-0 tabular-nums">{l.old_value ?? '—'} → <b>{l.new_value}</b></span>
              <span className="w-16 shrink-0 truncate text-right text-[11px] text-muted-foreground">{(l.changed_by && names.get(l.changed_by)) || ''}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border bg-card shadow-sm">
        <p className="border-b px-4 py-2 text-sm font-semibold">코인 부여 · 회수</p>
        {grants.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">아직 부여한 적이 없어요.</p>}
        <ul className="divide-y">
          {grants.map((g) => (
            <li key={g.id} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="w-24 shrink-0 text-[11px] text-muted-foreground">{fmtTime(g.created_at)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate" title={g.note}>{g.note}</span>
                <span className="block text-[11px] text-muted-foreground">{g.user_count}명 · 한 사람 {g.amount > 0 ? `+${g.amount}` : g.amount} · 실제 합 {g.moved_total}</span>
              </span>
              <span className="w-16 shrink-0 truncate text-right text-[11px] text-muted-foreground">{(g.admin_id && names.get(g.admin_id)) || ''}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
