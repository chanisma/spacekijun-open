/**
 * 관리자 «이세계 사회인» — 오락기 동전 설정(2026-10-23 사용자 요청 «코인 하나로 플레이할 수 있는 시간 설정»).
 *
 * 값의 정본은 코인 경제 설정 표(`coin_economy_setting` — 키 `isekai3d.per_coin`·`isekai3d.max_coins`·`isekai3d.coin_price`)이고,
 * 저장은 «코인 경제» 탭과 같은 RPC(`admin_coin_economy_set` — 범위·권한·변경 기록을 서버가 본다). 그래서 두 탭이 같은 값을 보인다.
 * 게임은 서버가 주는 분량(perCoin·budget)을 그대로 쓰므로 저장하면 다음 동전부터가 아니라 **그날의 분량부터** 바뀐다.
 */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { COIN_ECONOMY_QUERY_KEY, fetchCoinEconomySettings, type CoinEconomySetting } from '@/lib/coinEconomy';
import { statCard as card } from './statParts';
import { ISEKAI3D_PLAY_KEYS, gameTimeLabel, realPlayLabel } from './isekai3dAdminStats';

const QUICK_HOURS = [6, 12, 24, 48];

export function Isekai3dPlaySettings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [...COIN_ECONOMY_QUERY_KEY, 'admin-rows'], queryFn: fetchCoinEconomySettings });
  const row = (k: string): CoinEconomySetting | undefined => q.data?.find((s) => s.key === k);
  const per = row(ISEKAI3D_PLAY_KEYS.perCoin);
  const max = row(ISEKAI3D_PLAY_KEYS.maxCoins);
  const price = row(ISEKAI3D_PLAY_KEYS.price);

  const [hours, setHours] = useState('');
  const [maxCoins, setMaxCoins] = useState('');
  const [coinPrice, setCoinPrice] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (per) setHours(String(Math.round((per.value / 60) * 10) / 10));
    if (max) setMaxCoins(String(max.value));
    if (price) setCoinPrice(String(price.value));
  }, [per, max, price]);

  if (q.isPending) return <div className={card}><p className="text-sm text-muted-foreground" role="status">동전 설정을 불러오는 중…</p></div>;
  if (q.isError || !per || !max || !price) {
    return <div className={card}><p className="text-sm text-rose-600" role="alert">동전 설정을 읽지 못했어요{q.isError ? ` — ${(q.error as Error).message}` : ''}.</p></div>;
  }

  const minutes = Math.round(Number(hours) * 60);
  const hoursOk = Number.isFinite(minutes) && minutes >= per.min_value && minutes <= per.max_value;
  const maxN = Number(maxCoins);
  const priceN = Number(coinPrice);
  const maxOk = Number.isInteger(maxN) && maxN >= max.min_value && maxN <= max.max_value;
  const priceOk = Number.isInteger(priceN) && priceN >= price.min_value && priceN <= price.max_value;
  const changes: Record<string, number> = {};
  if (hoursOk && minutes !== per.value) changes[per.key] = minutes;
  if (maxOk && maxN !== max.value) changes[max.key] = maxN;
  if (priceOk && priceN !== price.value) changes[price.key] = priceN;
  const dirty = Object.keys(changes).length > 0;
  const valid = hoursOk && maxOk && priceOk;

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc('admin_coin_economy_set' as never, { p_values: changes } as never);
      if (error) throw new Error(error.message);
      await Promise.all([qc.invalidateQueries({ queryKey: COIN_ECONOMY_QUERY_KEY }), qc.invalidateQueries({ queryKey: ['isekai3d-admin-stats'] })]);
      toast.success(`오락기 설정을 바꿨어요 — 동전 하나 = 게임 ${gameTimeLabel(hoursOk ? minutes : per.value)}. 학생 게임에는 오늘 분량부터 적용돼요.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장하지 못했어요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={card} data-isekai3d-play-settings>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">오락기 동전</p>
        <p className="text-xs text-muted-foreground">«코인 경제» 탭의 이세계 3D 값과 같은 설정이에요(변경 기록도 거기 남아요)</p>
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <label htmlFor="isekai3d-per-coin" className="text-xs font-semibold">동전 하나로 하는 시간(게임 속 시간)</label>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Input id="isekai3d-per-coin" type="number" inputMode="decimal" min={per.min_value / 60} max={per.max_value / 60} step={1}
              value={hours} onChange={(e) => setHours(e.target.value)} className="h-9 w-24" aria-invalid={!hoursOk} />
            <span className="text-sm">시간</span>
            {QUICK_HOURS.map((h) => (
              <Button key={h} type="button" variant={minutes === h * 60 ? 'default' : 'outline'} size="sm" className="h-8" onClick={() => setHours(String(h))}>
                {h === 24 ? '하루' : h === 48 ? '이틀' : `${h}시간`}
              </Button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground" data-isekai3d-real-time>
            {hoursOk ? <>게임 {gameTimeLabel(minutes)} — {realPlayLabel(minutes)}</> : `게임 ${per.min_value / 60}~${per.max_value / 60}시간 사이로 적어 주세요.`}
          </p>
        </div>
        <div>
          <label htmlFor="isekai3d-max-coins" className="text-xs font-semibold">하루 동전 횟수</label>
          <Input id="isekai3d-max-coins" type="number" inputMode="numeric" min={max.min_value} max={max.max_value} step={1}
            value={maxCoins} onChange={(e) => setMaxCoins(e.target.value)} className="mt-1 h-9 w-24" aria-invalid={!maxOk} />
          <p className="mt-1 text-xs text-muted-foreground">{maxOk && hoursOk ? `하루 최대 게임 ${gameTimeLabel(minutes * maxN)}` : `${max.min_value}~${max.max_value}회`}</p>
        </div>
        <div>
          <label htmlFor="isekai3d-coin-price" className="text-xs font-semibold">둘째 동전부터 값</label>
          <Input id="isekai3d-coin-price" type="number" inputMode="numeric" min={price.min_value} max={price.max_value} step={1}
            value={coinPrice} onChange={(e) => setCoinPrice(e.target.value)} className="mt-1 h-9 w-24" aria-invalid={!priceOk} />
          <p className="mt-1 text-xs text-muted-foreground">코인 · 하루 첫 동전은 늘 무료</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          하루 중간에 바꾸면 그날 넣은 동전의 분량도 새 시간으로 다시 계산돼요. 줄였을 때 이미 그만큼 썼다면 오늘 남은 시간은 0이에요.
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" disabled={!dirty || saving}
            onClick={() => { setHours(String(Math.round((per.value / 60) * 10) / 10)); setMaxCoins(String(max.value)); setCoinPrice(String(price.value)); }}>
            되돌리기
          </Button>
          <Button type="button" size="sm" className="bg-blue-600 hover:bg-blue-700" disabled={!dirty || !valid || saving} onClick={() => void save()}>
            {saving ? '저장 중…' : '저장'}
          </Button>
        </div>
      </div>
    </div>
  );
}
