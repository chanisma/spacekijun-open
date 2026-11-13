/**
 * 관리자 «이세계 사회인» 통계(2026-10-21 사용자 요청). 서버 `isekai3d_admin_stats()` 하나를 읽고 그리기만 한다 —
 * 이름·비율은 `isekai3dAdminStats.ts`.
 *
 * 통계(`isekai3d_admin_stats`)는 숫자만이다. 학생별 답은 아래 `Isekai3dAnswers` 가 따로 읽는다
 * (2026-10-22 사용자 결정으로 관리자 열람을 열었다 — 20261022120000).
 * ⚠️ 관리자 계정은 집계에 없다(한도 없는 시험 계정). 화면이 그 사실과 뺀 수를 말한다.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Bar, Stat, statCard as card } from './statParts';
import { Isekai3dAnswers } from './Isekai3dAnswers';
import { Isekai3dPlaySettings } from './Isekai3dPlaySettings';
import {
  gameTimeLabel, LIFE_EVENT_LABEL, QUESTION_KIND_LABEL, rateLabel, usageBands,
  type Isekai3dAdminStats, type Isekai3dQuestionKind,
} from './isekai3dAdminStats';

const ROLE_LABEL: Record<string, string> = { student: '학생', teacher: '선생님', staff: '직원' };
const KINDS: Isekai3dQuestionKind[] = ['career', 'life', 'explore'];

export function Isekai3dAdmin() {
  const q = useQuery({
    queryKey: ['isekai3d-admin-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('isekai3d_admin_stats' as never);
      if (error) throw new Error(error.message);
      return data as unknown as Isekai3dAdminStats;
    },
  });
  // 오락기 동전 설정(2026-10-23) — 통계와 따로 읽어 통계가 실패해도 설정은 바꿀 수 있다
  return (
    <div className="space-y-4">
      <Isekai3dPlaySettings />
      {q.isPending ? <p role="status">통계를 계산하는 중…</p>
        : q.isError ? <p role="alert">{(q.error as Error).message}</p>
        : <Isekai3dStatsView stats={q.data} refreshing={q.isFetching} onRefresh={() => q.refetch()} showAnswers />}
    </div>
  );
}

export function Isekai3dStatsView({ stats: s, refreshing, onRefresh, showAnswers }: { stats: Isekai3dAdminStats; refreshing?: boolean; onRefresh?: () => void; showAnswers?: boolean }) {
  const [search, setSearch] = useState('');
  const dailyMax = Math.max(1, ...s.daily.map((d) => d.people));
  const coinMax = Math.max(1, ...s.play.coins_hist);
  const bands = usageBands(s.play.use_hist);
  const dayMax = Math.max(1, ...s.saves.day_hist.map((d) => d.n));
  const roles = Object.entries(s.players.by_role).map(([r, n]) => `${ROLE_LABEL[r] ?? r} ${n}`).join(' · ');
  // 하루 첫 동전은 무료 — 동전을 넣은 날마다 정확히 하나(관리자는 이미 빠졌다)
  const freeCoins = s.play.days;
  const lifeEvents = Object.keys(LIFE_EVENT_LABEL).map((k) => ({ key: k, label: LIFE_EVENT_LABEL[k], ...(s.questions.life_events[k] ?? { made: 0, answered: 0 }) }));
  const careerLabels = useMemo(() => Object.fromEntries(s.questions.careers.map((c) => [c.id, c.label ?? c.id])), [s.questions.careers]);
  const list = useMemo(() => {
    const t = search.trim();
    return t ? s.list.filter((p) => p.name.includes(t)) : s.list;
  }, [s.list, search]);

  return (
    <section aria-label="이세계 사회인 통계" className="space-y-4" data-isekai3d-admin>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {new Date(s.generated_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 기준
          {s.admins_excluded > 0 && ` · 관리자 계정 ${s.admins_excluded}명은 한도 없는 시험 계정이라 모든 숫자에서 뺐어요`}
        </p>
        {onRefresh && (
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={cn('mr-1 h-4 w-4', refreshing && 'animate-spin')} />다시 세기
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat title="게임을 연 사람" value={s.players.total} sub={`${roles || '아직 없음'} · 동전을 넣어 본 사람 ${s.players.played_ever}`} />
        <Stat title="최근 7일 플레이한 사람" value={s.players.active_7d} sub={`오늘 ${s.players.active_today}명`} />
        <Stat title="넣은 동전" value={s.play.coins} sub={`무료 ${freeCoins} · 코인으로 ${s.play.coins - freeCoins}개 (쓴 코인 ${s.play.paid_coins})`} />
        <Stat title="함께 보낸 게임 시간" value={gameTimeLabel(s.play.minutes)} sub={`동전 하나 = 게임 ${gameTimeLabel(s.rule.per_coin)} · 플레이한 날 ${s.play.days}`} />
      </div>

      <div className={card}>
        <p className="text-sm font-semibold">하루에 플레이한 사람(최근 21일)</p>
        <div className="mt-3 flex h-28 items-end gap-1" role="img" aria-label={`최근 21일 하루 플레이한 사람 수, 최대 ${dailyMax}명`}>
          {s.daily.map((d) => (
            <div key={d.day} className="flex h-full flex-1 flex-col justify-end" title={`${d.day} · ${d.people}명 · 동전 ${d.coins}개 · 게임 ${gameTimeLabel(d.minutes)}`}>
              <div className="w-full rounded-t bg-indigo-500" style={{ height: `${(d.people / dailyMax) * 100}%`, minHeight: d.people ? 2 : 0 }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>{s.daily[0]?.day}</span><span>{s.daily[s.daily.length - 1]?.day}</span></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <p className="text-sm font-semibold">하루에 넣은 동전 수</p>
          <div className="mt-2 space-y-1.5">
            {s.play.coins_hist.map((n, i) => (
              <Bar key={i} label={`${i + 1}개${i === 0 ? ' (무료)' : ''}`} n={n} max={coinMax} note="날" />
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">첫 동전만 무료이고 그다음은 {s.rule.price}코인씩, 하루 {s.rule.max_coins}개까지예요.</p>
        </div>
        <div className={card}>
          <p className="text-sm font-semibold">넣은 분량을 얼마나 썼나</p>
          <div className="mt-2 space-y-1.5">
            {bands.map((b) => <Bar key={b.label} label={b.label} n={b.n} max={Math.max(1, s.play.days)} note="날" tone="bg-teal-500" />)}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">그날 쓴 게임 시간 ÷ (넣은 동전 × 동전 하나의 시간). 남은 분량은 다음 날로 넘어가지 않아요.</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <p className="text-sm font-semibold">AI 질문</p>
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">종류</th><th>만든</th><th>받은</th><th>답한</th></tr></thead>
            <tbody>
              {KINDS.map((k) => {
                const v = s.questions.by_kind[k] ?? { made: 0, delivered: 0, answered: 0 };
                return (
                  <tr key={k} className={cn(v.made === 0 && 'text-muted-foreground')}>
                    <td className="py-1">{QUESTION_KIND_LABEL[k]}</td><td className="tabular-nums">{v.made}</td>
                    <td className="tabular-nums">{v.delivered}</td><td className="tabular-nums">{v.answered} ({rateLabel(v.answered, v.delivered)})</td>
                  </tr>
                );
              })}
              <tr className="border-t font-medium">
                <td className="py-1">합계</td><td className="tabular-nums">{s.questions.made}</td>
                <td className="tabular-nums">{s.questions.delivered}</td><td className="tabular-nums">{s.questions.answered} ({rateLabel(s.questions.answered, s.questions.delivered)})</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            받기는 세 종류 합쳐 하루 1개예요. 답의 내용은 아래 «학생별 질문과 답»에서 볼 수 있어요.
            {s.players.memory_off > 0 && ` 기억을 끈 사람 ${s.players.memory_off}명.`}
          </p>
        </div>
        <div className={card}>
          <p className="text-sm font-semibold">인생의 큰 사건</p>
          <div className="mt-2 space-y-1.5">
            {lifeEvents.map((e) => <Bar key={e.key} label={e.label} n={e.made} max={Math.max(1, ...lifeEvents.map((x) => x.made))} note={`답 ${e.answered}`} tone="bg-violet-500" />)}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <p className="text-sm font-semibold">근무 카드 — 직업별</p>
          {s.questions.careers.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">아직 학생에게 만든 근무 카드가 없어요.</p> : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[360px] text-sm">
                <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">직업</th><th>만든</th><th>답한</th><th>입문</th><th>전문</th><th>리더</th></tr></thead>
                <tbody>
                  {s.questions.careers.map((c) => (
                    <tr key={c.id}>
                      <td className="py-0.5">{c.label ?? c.id}</td><td className="tabular-nums">{c.made}</td><td className="tabular-nums">{c.answered}</td>
                      <td className="tabular-nums">{c.junior || ''}</td><td className="tabular-nums">{c.expert || ''}</td><td className="tabular-nums">{c.leader || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className={card}>
          <p className="text-sm font-semibold">서버 저장 — 가장 멀리 간 날</p>
          <div className="mt-2 space-y-1.5">
            {s.saves.day_hist.map((d) => <Bar key={d.label} label={d.label} n={d.n} max={dayMax} note="명" tone="bg-amber-500" />)}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            저장한 사람 {s.players.with_saves}명 · 칸 {s.saves.slots}개 (1번 {s.saves.by_slot[0] ?? 0} · 2번 {s.saves.by_slot[1] ?? 0} · 3번 {s.saves.by_slot[2] ?? 0}).
            이 PC에만 저장하고 올리지 않은 판은 세지 못해요.
          </p>
        </div>
      </div>

      {showAnswers && <Isekai3dAnswers careerLabels={careerLabels} />}

      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">참여자 {s.list.length}명 <span className="font-normal text-muted-foreground">· 마지막 플레이 순</span></p>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="이름 찾기" className="h-8 w-40 text-xs" aria-label="참여자 이름 찾기" />
        </div>
        <div className="mt-2 max-h-[28rem] overflow-auto">
          <table className="w-full min-w-[680px] text-sm" data-isekai3d-admin-list>
            <thead className="sticky top-0 bg-card">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1">이름</th><th>플레이한 날</th><th>동전</th><th>쓴 코인</th><th>게임 시간</th><th>멀리 간 날</th><th>질문 받음 / 답함</th><th>마지막 플레이</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p, i) => (
                <tr key={`${p.name}-${i}`} className="border-t">
                  <td className="py-1">{p.name}{p.role && p.role !== 'student' && <span className="ml-1 text-xs text-muted-foreground">{ROLE_LABEL[p.role] ?? p.role}</span>}</td>
                  <td className="tabular-nums">{p.days}</td>
                  <td className="tabular-nums">{p.coins}</td>
                  <td className="tabular-nums">{p.paid || ''}</td>
                  <td className="tabular-nums">{p.minutes ? gameTimeLabel(p.minutes) : '—'}</td>
                  <td className="tabular-nums">{p.game_day ? `${p.game_day}일째` : p.saves ? '—' : '저장 없음'}</td>
                  <td className="tabular-nums">{p.questions} / {p.answered}</td>
                  <td className="text-xs">{p.last_day ?? '동전 전'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">{search ? '그 이름의 참여자가 없어요.' : '아직 게임을 연 사람이 없어요.'}</p>}
        </div>
      </div>
    </section>
  );
}
