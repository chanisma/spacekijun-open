/**
 * 관리자 «다마고찌 → 통계»(Phase 6 «측정» → 2026-10-14 개선). 서버 `tama_admin_metrics()` 하나를 읽고 그리기만 한다 —
 * 이름·비율은 `features/tamagotchi/model/adminStats.ts`(회귀가 같은 함수를 부른다).
 *
 * 읽는 순서 = ①누가 오나(다시 온 사람) ②펫이 얼마나 자랐나 ③계획 §10 의 두 지표 ④코인·가챠 ⑤함께 ⑥참여자 목록.
 * ⚠️ 관리자 계정은 집계에 없다(전부 열림·무료 뽑기). 펫 단계는 «마지막으로 연 때»의 값이다(지연 계산 — 열지 않으면 DB 에서 자라지 않는다).
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { RARITY, SLOT_LABEL, type ItemSlot, type Rarity } from '@/features/tamagotchi/model/catalog';
import {
  branchRows, careBands, diaryRows, focusRate, machineRows, percentLabel, returnRate, stageFunnel, stageLabel,
  type TamaAdminStats,
} from '@/features/tamagotchi/model/adminStats';
import { Bar, Stat, statCard as card } from './statParts';

const ROLE_LABEL: Record<string, string> = { student: '학생', teacher: '선생님' };
const CREDIT_LABEL: Record<string, string> = { plan: '계획', reflect: '돌아보기', focus: '함께 집중', diary: '펫 일기' };
const ORDER_LABEL: Record<string, string> = { submitted: '확인 기다림', crafting: '그리는 중', delivered: '배송함', declined: '거절함', cancelled: '학생이 거둠' };
const TRADE_LABEL: Record<string, string> = { pending: '기다림', accepted: '성사', declined: '거절', cancelled: '취소', expired: '지남' };
const joinCounts = (m: Record<string, number> | undefined, label: Record<string, string>) =>
  Object.entries(m ?? {}).map(([k, n]) => `${label[k] ?? k} ${n}`).join(' · ') || '없음';

export function Metrics() {
  const q = useQuery({
    queryKey: ['tama-metrics'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('tama_admin_metrics' as never);
      if (error) throw new Error(error.message);
      return data as unknown as TamaAdminStats;
    },
  });
  if (q.isPending) return <p role="status">통계를 계산하는 중…</p>;
  if (q.isError) return <p role="alert">{(q.error as Error).message}</p>;
  return <TamaStatsView stats={q.data} refreshing={q.isFetching} onRefresh={() => q.refetch()} />;
}

export function TamaStatsView({ stats: m, refreshing, onRefresh }: { stats: TamaAdminStats; refreshing?: boolean; onRefresh?: () => void }) {
  const [search, setSearch] = useState('');
  const people = Object.values(m.owners ?? {}).reduce((a, b) => a + b, 0);
  const bands = careBands(m.care_days_hist);
  const ret = returnRate(m.care_days_hist);
  const funnel = stageFunnel(m.stages);
  const branches = branchRows(m.branches);
  const diary = diaryRows(m.economy.diary_kinds_30d);
  const g = m.economy.gacha_30d;
  const machines = machineRows(g?.by_machine);
  const f = m.economy.focus_30d;
  const h = m.habits;
  const max = Math.max(1, ...m.daily.map((d) => d.owners));
  const list = useMemo(() => {
    const t = search.trim();
    const all = m.list ?? [];
    return t ? all.filter((p) => p.name.includes(t) || (p.pet?.name ?? '').includes(t)) : all;
  }, [m.list, search]);

  return (
    <div className="space-y-4" data-tama-metrics>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {m.generated_at && `${new Date(m.generated_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 기준`}
          {!!m.admins_excluded && ` · 관리자 계정 ${m.admins_excluded}명은 전부 열림·무료 뽑기라 모든 숫자에서 뺐어요`}
        </p>
        {onRefresh && (
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={cn('mr-1 h-4 w-4', refreshing && 'animate-spin')} />다시 세기
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat title="펫을 키우는 사람" value={people} sub={`${joinCounts(m.owners, ROLE_LABEL)} · 펫 ${m.pets}마리${m.resting ? ` (쉬는 펫 ${m.resting})` : ''}`} />
        <Stat title="최근 7일 돌본 사람" value={m.active_7d ?? '—'} sub={`오늘 ${m.active_today ?? 0}명`} />
        <Stat title="다시 온 사람" value={percentLabel(ret)} sub="이틀 이상 돌본 사람 / 하루라도 돌본 사람" />
        <Stat title="① 사흘 이상 돌본 학생" value={m.students_cared_3days} sub="«돌본 날» = 펫을 저장한 날(한국 날짜)" />
      </div>

      <div className={card}>
        <p className="text-sm font-semibold">하루에 돌본 사람(최근 21일) <span className="font-normal text-muted-foreground">· 위 숫자 = 그날 처음 알을 받은 사람</span></p>
        <div className="mt-3 flex h-28 items-end gap-1" role="img" aria-label={`최근 21일 하루 돌본 사람 수, 최대 ${max}명`}>
          {m.daily.map((d) => (
            <div key={d.day} className="flex h-full flex-1 flex-col justify-end" title={`${d.day} · 돌본 사람 ${d.owners}명${d.adopted ? ` · 새로 온 사람 ${d.adopted}명` : ''}`}>
              {!!d.adopted && <span className="mb-0.5 text-center text-[9px] tabular-nums text-emerald-700">+{d.adopted}</span>}
              <div className="w-full rounded-t bg-violet-500" style={{ height: `${(d.owners / max) * 100}%`, minHeight: d.owners ? 2 : 0 }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>{m.daily[0]?.day}</span><span>{m.daily[m.daily.length - 1]?.day}</span></div>
      </div>

      {(m.care_days_hist || m.stages) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={card}>
            <p className="text-sm font-semibold">며칠 돌봤나(사람)</p>
            <div className="mt-2 space-y-1.5">
              {bands.map((b) => <Bar key={b.label} label={b.label} n={b.n} max={Math.max(1, people)} tone="bg-violet-500" />)}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">«1일» = 알을 받은 날만 열고 다시 오지 않은 사람이에요. 이 줄이 줄어드는지가 가장 먼저 볼 숫자예요.</p>
          </div>
          <div className={card}>
            <p className="text-sm font-semibold">펫이 자란 만큼(펫 {m.pets}마리)</p>
            <div className="mt-2 space-y-1.5">
              {funnel.map((s) => <Bar key={s.stage} label={s.label} n={s.n} max={Math.max(1, m.pets)} tone="bg-sky-500" />)}
            </div>
            <p className="mt-3 text-xs font-semibold">어른의 모습</p>
            <div className="mt-1 space-y-1.5">
              {branches.map((b) => <Bar key={b.key} label={b.name} n={b.n} max={Math.max(1, ...branches.map((x) => x.n))} note={b.habit} tone="bg-amber-500" />)}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              단계는 «마지막으로 연 때» 기준이에요 — 펫은 열 때 그동안의 시간을 한 번에 계산하므로, 다시 열지 않은 펫은 여기서 자라지 않아요.
              {m.sick_now ? ` 지금 아픈 펫 ${m.sick_now}마리.` : ''}
            </p>
          </div>
        </div>
      )}

      <div className={card}>
        <p className="text-sm font-semibold">② 펫 전후 — 사흘 이상 돌본 학생의 하루 평균</p>
        {h.n === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">아직 비교할 학생이 없어요(펫을 맞은 지 3일 이상 + 사흘 이상 돌본 학생이 필요해요).</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">기록</th><th>펫 전(14일)</th><th>펫 뒤(최대 14일)</th><th>늘어난 학생</th></tr></thead>
            <tbody>
              <tr><td className="py-1">플래너 계획</td><td className="tabular-nums">{h.plan_before}</td><td className="tabular-nums">{h.plan_after}</td><td className="tabular-nums">{h.plan_up}/{h.n}</td></tr>
              <tr><td className="py-1">돌아보기(10자 이상)</td><td className="tabular-nums">{h.reflect_before}</td><td className="tabular-nums">{h.reflect_after}</td><td className="tabular-nums">{h.reflect_up}/{h.n}</td></tr>
            </tbody>
          </table>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          표본 {h.n}명. 전후 비교는 시험 기간·방학 같은 계절과 «원래 부지런한 학생이 펫을 먼저 키운다»(선택 편향)의 영향을 함께 받아요 — 판단 전에 표본 수를 보세요.
          ②가 0이면 펫이 «또 하나의 화면»이 된 것이고 코인 설계를 다시 봐야 해요(계획 §10).
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <p className="text-sm font-semibold">습관 — 지난 30일</p>
          <p className="mt-1 text-sm">코인 지급 {joinCounts(m.economy.credits_30d, CREDIT_LABEL)}</p>
          <p className="mt-3 text-xs font-semibold">펫 일기 {m.economy.diary_30d}편</p>
          <div className="mt-1 space-y-1.5">
            {diary.map((d) => <Bar key={d.key} label={d.label} n={d.n} max={Math.max(1, ...diary.map((x) => x.n))} tone="bg-rose-400" />)}
          </div>
          {f && (
            <p className="mt-3 text-sm">
              함께 집중 — 끝까지 채움 {f.completed ?? 0} · 그만둠 {f.gave_up ?? 0} · 시간 지남 {f.expired ?? 0}{f.open ? ` · 진행/미확인 ${f.open}` : ''}
              <span className="text-muted-foreground"> (끝까지 {percentLabel(focusRate(f))})</span>
            </p>
          )}
        </div>
        <div className={card}>
          <p className="text-sm font-semibold">가챠 — 지난 30일</p>
          {g ? (
            <>
              <p className="mt-1 text-sm">{m.economy.gacha_pulls_30d}번 · {g.people}명 · 쓴 코인 {g.spent} · 겹침 환급 {g.refunded} · 새 물건 {g.new_items}{g.pity ? ` · 천장 ${g.pity}` : ''}</p>
              <div className="mt-2 space-y-1.5">
                {machines.map((x) => <Bar key={x.id} label={x.name} n={x.n} max={Math.max(1, ...machines.map((y) => y.n))} tone="bg-teal-500" />)}
              </div>
            </>
          ) : <p className="mt-1 text-sm">{m.economy.gacha_pulls_30d}번</p>}
          <p className="mt-3 text-sm">
            의뢰 — 캐릭터 {joinCounts(m.economy.characters, ORDER_LABEL)}{m.economy.decor && ` / 꾸미기 ${joinCounts(m.economy.decor, ORDER_LABEL)}`}
          </p>
          {(m.economy.debt || m.economy.bought_slots !== undefined) && (
            <p className="mt-1 text-xs text-muted-foreground">
              외상 {m.economy.debt?.people ?? 0}명 · {m.economy.debt?.coins ?? 0}코인 · 산 펫 자리 {m.economy.bought_slots ?? 0}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {m.top_items && (
          <div className={card}>
            <p className="text-sm font-semibold">가장 많은 사람이 가진 물건</p>
            <table className="mt-2 w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">물건</th><th>자리</th><th>등급</th><th>가진 사람</th></tr></thead>
              <tbody>
                {m.top_items.map((it) => (
                  <tr key={it.id}><td className="py-0.5">{it.name}</td><td className="text-xs">{SLOT_LABEL[it.slot as ItemSlot] ?? it.slot}</td>
                    <td className="text-xs">{RARITY[it.rarity as Rarity]?.label ?? it.rarity}</td><td className="tabular-nums">{it.people}</td></tr>
                ))}
              </tbody>
            </table>
            {m.top_items.length === 0 && <p className="py-2 text-sm text-muted-foreground">아직 아무도 물건을 갖고 있지 않아요.</p>}
          </div>
        )}
        {m.social && (
          <div className={card}>
            <p className="text-sm font-semibold">함께</p>
            <p className="mt-1 text-sm">친구 교환 {joinCounts(m.social.trades, TRADE_LABEL)}</p>
            <p className="mt-1 text-sm">친구 펫 방문 {m.social.visits}번 · 다녀간 사람 {m.social.visitors}명</p>
            <p className="mt-1 text-sm">휴대폰 알림을 켠 사람 {m.social.push_people}명 <span className="text-muted-foreground">/ 펫을 키우는 {people}명</span></p>
            <p className="mt-2 text-xs text-muted-foreground">알림이 꺼져 있으면 펫이 불러도 닿지 않아요(앱 전체 알림 — 펫만의 수가 아니에요).</p>
          </div>
        )}
      </div>

      {m.list && (
        <div className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">참여자 {m.list.length}명 <span className="font-normal text-muted-foreground">· 마지막으로 돌본 날 순</span></p>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="이름·펫 이름 찾기" className="h-8 w-44 text-xs" aria-label="참여자 찾기" />
          </div>
          <div className="mt-2 max-h-[28rem] overflow-auto">
            <table className="w-full min-w-[720px] text-sm" data-tama-metrics-list>
              <thead className="sticky top-0 bg-card">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1">이름</th><th>펫</th><th>모습</th><th>돌본 날</th><th>마지막</th><th>일기</th><th>가챠</th><th>물건</th><th>코인</th>
                </tr>
              </thead>
              <tbody>
                {list.map((p, i) => (
                  <tr key={`${p.name}-${i}`} className="border-t">
                    <td className="py-1">{p.name}{p.role && p.role !== 'student' && <span className="ml-1 text-xs text-muted-foreground">{ROLE_LABEL[p.role] ?? p.role}</span>}</td>
                    <td>{p.pet?.name ?? '—'}{p.pets > 1 && <span className="ml-1 text-xs text-muted-foreground">외 {p.pets - 1}</span>}</td>
                    <td className="text-xs">{stageLabel(p.pet?.stage, p.pet?.branch)}{p.pet?.sick && <span className="ml-1 text-rose-600">아픔</span>}</td>
                    <td className="tabular-nums">{p.care_days}</td>
                    <td className="text-xs tabular-nums">{p.last_care?.slice(5) ?? '—'}</td>
                    <td className="tabular-nums">{p.diary}</td>
                    <td className="tabular-nums">{p.gacha}</td>
                    <td className="tabular-nums">{p.items}</td>
                    <td className="tabular-nums">{p.coins ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">{search ? '찾는 사람이 없어요.' : '아직 펫을 키우는 사람이 없어요.'}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
