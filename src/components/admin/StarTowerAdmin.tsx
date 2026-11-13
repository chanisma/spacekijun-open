/**
 * 관리자 «별까지 쌓기» 통계(2026-10-14 사용자 요청). 서버 `tower_admin_stats()` 하나를 읽고 그리기만 한다 —
 * 이름·비율은 `features/star-tower/model/adminStats.ts`(회귀가 같은 함수를 부른다).
 *
 * ⚠️ 관리자 계정은 집계에 없다(재화 무한 — 층 숫자가 학생과 같은 뜻이 아니다). 화면이 그 사실과 뺀 수를 말한다.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Bar, Stat, statCard } from './statParts';
import {
  achievementRows, catchRows, completionRate, constellationReach, durationLabel, floorBands, floorRows, letterReach, letterRows, percentLabel,
  rankConstellationReach, rankRows, visitorRows, type TowerAdminStats,
} from '@/features/star-tower/model/adminStats';
import { magnitudeLabel, magnitudeOf } from '@/features/star-tower/model/rank';

const ROLE_LABEL: Record<string, string> = { student: '학생', teacher: '선생님' };
const card = statCard;

export function StarTowerAdmin() {
  const q = useQuery({
    queryKey: ['tower-admin-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('tower_admin_stats' as never);
      if (error) throw new Error(error.message);
      return data as unknown as TowerAdminStats;
    },
  });
  if (q.isPending) return <p role="status">통계를 계산하는 중…</p>;
  if (q.isError) return <p role="alert">{(q.error as Error).message}</p>;
  return <StarTowerStatsView stats={q.data} refreshing={q.isFetching} onRefresh={() => q.refetch()} />;
}

export function StarTowerStatsView({ stats: s, refreshing, onRefresh }: { stats: TowerAdminStats; refreshing?: boolean; onRefresh?: () => void }) {
  const [search, setSearch] = useState('');
  const rate = completionRate(s.focus.completed, s.focus.gave_up);
  const bands = floorBands(s.floors_hist);
  // 탑을 완성한 사람은 새 탑이 낮아도 별자리를 다 봤다 — reach_hist(서버가 16으로 셈), 옛 응답이면 지금 높이
  const stars = constellationReach(s.reach_hist ?? s.floors_hist);
  const ranks = rankRows(s.towers_hist);
  const letters = letterReach(s.letters_hist);
  const letterKinds = letterRows(s.letters_by);
  const rankStars = rankConstellationReach(s.towers_hist);
  const achievements = achievementRows(s.achievements);
  const achCoins = achievements.reduce((a, x) => a + x.coins, 0);
  const fish = catchRows(s.catches);
  const floors = floorRows(s.floor_built, s.first_floor);
  const visitors = visitorRows(s.visitors_by);
  const dailyMax = Math.max(1, ...s.daily.map((d) => d.people));
  const hourMax = Math.max(1, ...s.by_hour);
  const list = useMemo(() => {
    const t = search.trim();
    return t ? s.list.filter((p) => p.name.includes(t)) : s.list;
  }, [s.list, search]);
  const roles = Object.entries(s.players.by_role).map(([r, n]) => `${ROLE_LABEL[r] ?? r} ${n}`).join(' · ');

  return (
    <section aria-label="별까지 쌓기 통계" className="space-y-4" data-tower-admin>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {new Date(s.generated_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 기준
          {s.admins_excluded > 0 && ` · 관리자 계정 ${s.admins_excluded}명은 재화 무한이라 모든 숫자에서 뺐어요`}
        </p>
        {onRefresh && (
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={cn('mr-1 h-4 w-4', refreshing && 'animate-spin')} />다시 세기
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat title="탑을 연 사람" value={s.players.total} sub={`${roles || '아직 없음'} · 집중해 본 사람 ${s.players.focused_ever}`} />
        <Stat title="최근 7일 집중한 사람" value={s.players.active_7d} sub={`오늘 ${s.players.active_today}명`} />
        <Stat title="모은 집중 시간" value={durationLabel(s.focus.seconds)} sub={`끝까지 채운 집중 ${s.focus.completed}번`} />
        <Stat title="끝까지 채운 비율" value={percentLabel(rate)}
          sub={`그만둠 ${s.focus.gave_up} · 지금 집중 중 ${s.focus.running}${s.focus.open_stale ? ` · 결과 안 받음 ${s.focus.open_stale}` : ''}`} />
      </div>
      {s.focus.open_stale > 0 && (
        <p className="text-xs text-muted-foreground">
          «결과 안 받음» = 시간은 다 찼는데 탑을 다시 열지 않아 아직 건져 올리지 않은 집중이에요. 다음에 열거나 새 집중을 시작하면 완주로 받아요(집중 시간·자원에는 그때 들어가요).
        </p>
      )}

      <div className={card}>
        <p className="text-sm font-semibold">하루에 집중한 사람(최근 21일)</p>
        <div className="mt-3 flex h-28 items-end gap-1" role="img" aria-label={`최근 21일 하루 집중한 사람 수, 최대 ${dailyMax}명`}>
          {s.daily.map((d) => (
            <div key={d.day} className="flex h-full flex-1 flex-col justify-end" title={`${d.day} · ${d.people}명 · 집중 ${d.sessions}번 · ${durationLabel(d.minutes * 60)}`}>
              <div className="w-full rounded-t bg-indigo-500" style={{ height: `${(d.people / dailyMax) * 100}%`, minHeight: d.people ? 2 : 0 }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>{s.daily[0]?.day}</span><span>{s.daily[s.daily.length - 1]?.day}</span></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <p className="text-sm font-semibold">집중 길이별</p>
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">길이</th><th>끝난 집중</th><th>끝까지 채움</th></tr></thead>
            <tbody>
              {s.by_minutes.map((m) => (
                <tr key={m.minutes}><td className="py-1">{m.minutes}분</td><td className="tabular-nums">{m.n}</td>
                  <td className="tabular-nums">{m.completed} ({percentLabel(completionRate(m.completed, m.n - m.completed))})</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={card}>
          <p className="text-sm font-semibold">집중을 시작한 시각(한국 시각)</p>
          <div className="mt-3 flex h-24 items-end gap-0.5" role="img" aria-label={`시각별 집중 시작 수, 최대 ${hourMax}번`}>
            {s.by_hour.map((n, h) => (
              <div key={h} className="flex h-full flex-1 flex-col justify-end" title={`${h}시 · ${n}번`}>
                <div className="w-full rounded-t bg-sky-500" style={{ height: `${(n / hourMax) * 100}%`, minHeight: n ? 2 : 0 }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>0시</span><span>6시</span><span>12시</span><span>18시</span><span>23시</span></div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <p className="text-sm font-semibold">탑 높이</p>
          <div className="mt-2 space-y-1.5">
            {bands.map((b) => <Bar key={b.label} label={b.label} n={b.n} max={Math.max(1, ...bands.map((x) => x.n))} />)}
          </div>
          <p className="mt-3 text-xs font-semibold">별자리를 연 사람(2층마다 하나)</p>
          <div className="mt-1 space-y-1.5">
            {stars.map((c) => <Bar key={c.name} label={c.name} n={c.n} max={Math.max(1, s.players.total)} tone="bg-amber-500" />)}
          </div>
          {ranks.length > 0 && (
            <>
              <p className="mt-3 text-xs font-semibold">등성(완성한 탑 수 — 하나 완성할 때마다 한 등성씩 밝아진다)</p>
              <div className="mt-1 space-y-1.5" data-tower-admin-ranks>
                {ranks.map((r) => <Bar key={r.label} label={r.label} n={r.n} max={Math.max(1, s.players.total)} tone="bg-sky-500" />)}
              </div>
            </>
          )}
          <p className="mt-3 text-xs font-semibold">등성 별자리를 연 사람(탑을 완성할 때마다 하나)</p>
          <div className="mt-1 space-y-1.5" data-tower-admin-rank-stars>
            {rankStars.map((c) => <Bar key={c.name} label={c.name} n={c.n} max={Math.max(1, s.players.total)} note={`탑 ${c.towersAt}개`} tone="bg-indigo-400" />)}
          </div>
        </div>
        <div className={card}>
          <p className="text-sm font-semibold">층별로 지은 사람</p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">층</th><th>지은 사람</th><th>첫 층으로 고름</th></tr></thead>
              <tbody>
                {floors.map((f) => (
                  <tr key={f.key} className={cn(f.n === 0 && 'text-muted-foreground')}><td className="py-0.5">{f.name}</td><td className="tabular-nums">{f.n}</td><td className="tabular-nums">{f.first || ''}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <p className="text-sm font-semibold">낚은 것(기본 일곱 · {fish.baseTotal}번)</p>
          <div className="mt-2 space-y-1.5">
            {fish.base.map((c) => (
              <Bar key={c.key} label={c.label} n={c.n} max={Math.max(1, ...fish.base.map((x) => x.n))}
                note={`${percentLabel(c.share)} / 기대 ${percentLabel(c.expected)}`} tone="bg-teal-500" />
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">비율은 희귀 물고기를 뺀 것 중에서예요. 서버가 굴리는 확률이라, 표본이 쌓일수록 «기대»에 가까워져야 해요.</p>
        </div>
        <div className={card}>
          <p className="text-sm font-semibold">희귀 물고기({fish.rareTotal}마리) · 깊은 바다({fish.deepTotal}마리)</p>
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">물고기</th><th>때</th><th>낚은 수</th><th>도감에 있는 사람</th></tr></thead>
            <tbody>
              {[...fish.rare, ...fish.deep].map((r) => (
                <tr key={r.key} className={cn(r.n === 0 && 'text-muted-foreground')}>
                  <td className="py-0.5">{r.label}</td><td className="text-xs">{r.hint}</td><td className="tabular-nums">{r.n}</td><td className="tabular-nums">{s.caught_by[r.key] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <p className="text-sm font-semibold">하늘 방문자를 만난 사람</p>
          <div className="mt-2 space-y-1.5">
            {visitors.map((v) => <Bar key={v.key} label={`${v.name}`} n={v.n} max={Math.max(1, s.players.total)} note={v.towersAt ? `탑 ${v.towersAt}개 · ${v.unlockAt}층~` : `${v.unlockAt}층~`} tone="bg-violet-500" />)}
          </div>
        </div>
        <div className={card}>
          <p className="text-sm font-semibold">병 편지를 읽은 사람</p>
          {letters[0].n === 0 ? <p className="mt-2 text-sm text-muted-foreground">아직 아무도 병 편지를 줍지 않았어요.</p> : (
            <div className="mt-2 space-y-1.5">
              {letters.map((l) => <Bar key={l.count} label={l.all ? `${l.count}통 모두` : `${l.count}통 이상`} n={l.n} max={Math.max(1, s.players.total)} tone="bg-rose-400" />)}
            </div>
          )}
          {s.bottles && (
            <p className="mt-2 text-xs text-muted-foreground" data-tower-admin-bottles>
              남는 병(편지를 다 모은 뒤) {s.bottles.spare}개 · {s.bottles.spare_people}명 — 상인에게 판 코인 {s.bottles.sold_coins} · {s.bottles.sold_people}명
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">편지는 무작위로 와요(별지기의 편지만 순서대로). 아래 «받은 사람»이 고르게 퍼지는지 봐요.</p>
        </div>
      </div>

      <div className={card} data-tower-admin-letters>
        <p className="text-sm font-semibold">편지마다 받은 사람</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {letterKinds.map((k) => (
            <div key={k.kind}>
              <p className="text-xs font-semibold">{k.label} <span className="font-normal text-muted-foreground">· {k.total}</span></p>
              <table className="mt-1 w-full text-xs">
                <tbody>
                  {k.rows.map((r) => (
                    <tr key={r.key} className={cn(r.n === 0 && 'text-muted-foreground')}><td className="truncate py-0.5 pr-2" title={r.title}>{r.title}</td><td className="text-right tabular-nums">{r.n}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>

      <div className={card} data-tower-admin-achievements>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold">업적</p>
          <p className="text-xs text-muted-foreground">나간 코인 {achCoins} · 보상 값은 «코인 경제» 탭에서 바꿔요</p>
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">업적</th><th>목표</th><th>달성</th><th>받음</th><th>안 받음</th><th>코인</th></tr></thead>
            <tbody>
              {achievements.map((a) => (
                <tr key={a.id} className={cn(a.done === 0 && 'text-muted-foreground')}>
                  <td className="py-0.5">{a.title}</td><td className="tabular-nums">{a.goal}</td><td className="tabular-nums">{a.done}</td>
                  <td className="tabular-nums">{a.claimed}</td><td className="tabular-nums">{a.unclaimed || ''}</td><td className="tabular-nums">{a.coins || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">«달성»은 지금 진행도로 다시 센 수예요(서버가 받기 때도 같은 셈으로 판정). 관리자 계정은 받을 수 없어 숫자에 없어요.</p>
      </div>

      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">참여자 {s.list.length}명 <span className="font-normal text-muted-foreground">· 마지막 집중 순</span></p>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="이름 찾기" className="h-8 w-40 text-xs" aria-label="참여자 이름 찾기" />
        </div>
        <div className="mt-2 max-h-[28rem] overflow-auto">
          <table className="w-full min-w-[760px] text-sm" data-tower-admin-list>
            <thead className="sticky top-0 bg-card">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1">이름</th><th>층</th><th>등성</th><th>집중 시간</th><th>채움 / 그만둠</th><th>도감</th><th>방문자</th><th>편지</th><th>업적</th><th>마지막 집중</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p, i) => (
                <tr key={`${p.name}-${i}`} className="border-t">
                  <td className="py-1">{p.name}{p.role && p.role !== 'student' && <span className="ml-1 text-xs text-muted-foreground">{ROLE_LABEL[p.role] ?? p.role}</span>}</td>
                  <td className="tabular-nums">{p.floors}</td>
                  <td className="tabular-nums">{magnitudeLabel(magnitudeOf(p.towers ?? 0))}</td>
                  <td className="tabular-nums">{p.seconds ? durationLabel(p.seconds) : '—'}</td>
                  <td className="tabular-nums">{p.completed} / {p.gave_up}</td>
                  <td className="tabular-nums">{p.caught}</td>
                  <td className="tabular-nums">{p.visitors}</td>
                  <td className="tabular-nums">{p.letters ?? '—'}{p.bottles ? <span className="text-xs text-muted-foreground"> +{p.bottles}</span> : null}</td>
                  <td className="tabular-nums">{p.achievements ?? '—'}</td>
                  <td className="text-xs">{p.last_focus ? new Date(p.last_focus).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '집중 전'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">{search ? '그 이름의 참여자가 없어요.' : '아직 탑을 연 사람이 없어요.'}</p>}
        </div>
      </div>
    </section>
  );
}
