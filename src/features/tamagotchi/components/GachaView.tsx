/**
 * 별빛 가챠 화면(Phase 3, 2026-10-07) — 3D 기계(`three/gachaScene.ts`) + 단계 버튼 + 확률 공개 + 상품 카드.
 * 이 파일은 three 를 끌어오므로 페이지가 React.lazy 로만 불러온다(홈·기기 2D 경로에 three 가 새지 않게).
 *
 * 흐름: [코인 넣기] → 서버가 뽑는다(기계마다 값 — gachaMachines) → 동전이 들어간다 → 손잡이를 끌어 한 바퀴(또는 [자동으로 돌리기])
 *   → 캡슐이 배출구로 → 캡슐을 누르면 떠올라 열린다 → 상품 카드([바로 꾸미기] · [한 번 더]).
 * 코인이 모자라거나 외상이 있으면 동전이 튕겨 나오고 이유를 글로 말한다.
 *
 * 가챠 기계 다섯(2026-10-13) — 왼쪽 위 배너 메뉴(휴대폰 게임 가챠처럼 그림 배너)에서 기계를 고른다. 기계마다 나오는 자리·값·
 * 3D 모양이 다르다(`model/gachaMachines.ts`). 기계를 바꾸면 3D 장면을 새 모양으로 다시 만든다(연출 중에는 못 바꾼다).
 * 휴대폰 캐러셀은 «둘러보기»와 «바꾸기»가 따로다(2026-10-14 사용자 지시) — 밀거나 화살표로는 배너만 넘기고,
 * 보이는 배너를 눌러야 그 기계로 바꾼다. 넘길 때마다 장면을 다시 만들면 한 장 넘길 때마다 로딩을 기다려야 했다.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Dices, Info, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createGachaScene, type GachaScene } from '../three/gachaScene';
import { useGachaSound } from '../hooks/useGachaSound';
import type { ShopController } from '../hooks/useShop';
import type { DrawResult } from '../services/shopService';
import { CATALOG, ITEM_BY_ID, PITY_AT, RARITY, RARITY_ORDER, SLOT_LABEL, type Rarity } from '../model/catalog';
import { GACHA_MACHINES, machineItems, machineOf, machineProbability, type GachaMachineId } from '../model/gachaMachines';
import { PrizePreview } from './PrizePreview';
import { TamaDialog } from './AppChrome';
import type { DeviceStyle } from '../three/dims';

type Phase = 'idle' | 'paying' | 'armed' | 'turning' | 'dropping' | 'ready' | 'opening' | 'revealed';

const HINT: Record<Phase, string> = {
  idle: '',
  paying: '동전을 넣는 중…',
  armed: '손잡이를 잡고 시계 방향으로 한 바퀴 돌려요',
  turning: '딸깍, 딸깍…',
  dropping: '툭!',
  ready: '나온 캡슐을 눌러 열어 보세요',
  opening: '두근두근…',
  revealed: '',
};

export default function GachaView({ style, shop, soundOn, onClose, initialMachine = 'all' }: {
  style: DeviceStyle; shop: ShopController; soundOn: boolean; onClose: () => void;
  /** 처음 고를 기계(꾸미기 창의 «가챠 하러 가기»가 그 자리의 기계로 보낼 때) */
  initialMachine?: GachaMachineId;
}) {
  const [machineId, setMachineId] = useState<GachaMachineId>(initialMachine);
  const machine = machineOf(machineId);
  const dragged = useRef(false);
  // 휴대폰 = 배너 한 장 + 좌우로 밀어 고르기(2026-10-13 사용자 지시). 데스크톱은 왼쪽 세로 목록 그대로.
  // 손을 떼는 순간 40px 넘게 밀었으면 옆 기계로 — 연출 중(canSwitch=false)에는 제자리로 돌아온다.
  const machineIndex = Math.max(0, GACHA_MACHINES.findIndex((m) => m.id === machineId));
  // 캐러셀이 보여 주는 배너(둘러보기) — 바뀌어도 장면은 그대로. 배너를 눌러야 machineId 가 바뀐다
  const [browseIndex, setBrowseIndex] = useState(machineIndex);
  useEffect(() => { setBrowseIndex(machineIndex); }, [machineIndex]);
  const browsed = GACHA_MACHINES[browseIndex];
  const browsingOther = browsed.id !== machineId;
  const [dragX, setDragX] = useState(0);
  const swipe = useRef<{ x: number; y: number; id: number; horizontal: boolean | null } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GachaScene | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const phaseRef = useRef<Phase>('idle');
  const [result, setResult] = useState<DrawResult | null>(null);
  const resultRef = useRef<DrawResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [odds, setOdds] = useState(false);
  const [failed, setFailed] = useState(false);
  const sound = useGachaSound(soundOn);
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const data = shop.status.data;
  const isClassic = style === 'classic';
  // 값·환급은 서버가 정본(관리자는 0) — 없으면 정의값
  // 표시는 언제나 정해진 값(machine.price). 관리자는 확인용으로 무료라 서버가 0 을 주므로, 그 0 을 «값»으로 보이지 않는다
  // (2026-10-13 «가챠 가격이 다 0원» — 관리자 화면에서 값이 전부 0 으로 보였다). 실제로 빠지는 코인 = cost
  const adminFree = !!data?.admin;
  const price = machine.price;
  const refund = machine.refund;
  const cost = adminFree ? 0 : (data?.machines?.[machine.id]?.price ?? machine.price);

  const go = useCallback((p: Phase) => { phaseRef.current = p; setPhase(p); }, []);
  const rarityOf = (r: DrawResult | null): Rarity => (r ? ITEM_BY_ID.get(r.item)?.rarity ?? 'common' : 'common');

  const openCapsule = useCallback(async () => {
    const scene = sceneRef.current;
    const r = resultRef.current;
    if (!scene || !r || phaseRef.current !== 'ready') return;
    go('opening');
    const rarity = rarityOf(r);
    await scene.open(RARITY[rarity].color, rarity === 'epic' || rarity === 'legendary');
    soundRef.current.fanfare(rarity);
    shop.refresh();
    go('revealed');
  }, [go, shop]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    let scene: GachaScene;
    // 기계를 바꾸면 새 장면 — 지난 결과·단계도 처음으로
    resultRef.current = null;
    setResult(null);
    go('idle');
    try {
      scene = createGachaScene(canvas, {
        reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
        onContextLost: () => setFailed(true),
        theme: machine.theme,
        price: machine.price,
      });
    } catch {
      setFailed(true);
      return;
    }
    sceneRef.current = scene;
    if (import.meta.env.DEV) (window as unknown as { __gachaHandle?: () => unknown }).__gachaHandle = () => scene.handleScreen();
    scene.onEvent((e) => {
      if (e.type === 'notch') soundRef.current.notch(e.step);
      else if (e.type === 'coinIn') soundRef.current.coin();
      else if (e.type === 'landed') soundRef.current.drop();
      else if (e.type === 'pop') soundRef.current.pop();
      else if (e.type === 'turned') {
        const r = resultRef.current;
        go('dropping');
        const rarity = rarityOf(r);
        void scene.dispense(RARITY[rarity].color, rarity === 'epic' || rarity === 'legendary').then(() => go('ready'));
      }
    });
    scene.onCapsuleClick(() => { void openCapsule(); });
    const resize = () => scene.resize(wrap.clientWidth, wrap.clientHeight);
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => { ro.disconnect(); scene.dispose(); sceneRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machine.id]);

  const insertCoin = async () => {
    const scene = sceneRef.current;
    if (!scene || phaseRef.current !== 'idle') return;
    setMessage(null);
    setBrowseIndex(machineIndex); // 둘러보던 배너를 지금 쓰는 기계로 되돌린다(뽑는 기계와 보이는 배너가 어긋나지 않게)
    go('paying');
    try {
      const r = await shop.draw.mutateAsync(machine.id);
      resultRef.current = r;
      setResult(r);
      await scene.insertCoin();
      scene.setArmed(true);
      go('armed');
    } catch (e) {
      await scene.rejectCoin();
      setMessage(e instanceof Error ? e.message : '동전이 들어가지 않았어요.');
      go('idle');
    }
  };

  const autoTurn = async () => {
    const scene = sceneRef.current;
    if (!scene || phaseRef.current !== 'armed') return;
    go('turning');
    await scene.autoTurn();
  };

  // 손잡이를 직접 끌기 시작하면 «돌리는 중»
  const onPointerDownCanvas = () => { if (phaseRef.current === 'armed') window.setTimeout(() => { if (phaseRef.current === 'armed') go('turning'); }, 120); };

  const again = () => {
    sceneRef.current?.clear();
    resultRef.current = null;
    setResult(null);
    go('idle');
  };

  const equipNow = async () => {
    const item = result ? ITEM_BY_ID.get(result.item) : undefined;
    if (!item) return;
    try { await shop.equip.mutateAsync({ slot: item.slot, item: item.id }); setMessage(`«${item.name}»(으)로 꾸몄어요`); } catch (e) {
      setMessage(e instanceof Error ? e.message : '꾸미지 못했어요.');
    }
    again();
  };

  const coins = data?.coins;
  const debt = data?.debt ?? 0;
  const untilPity = Math.max(1, PITY_AT - (data?.since_new ?? 0));
  const blockedReason = debt > 0 ? `외상 ${debt}코인을 먼저 갚아야 뽑을 수 있어요` : coins !== undefined && coins < cost ? `코인이 ${cost - coins}개 모자라요` : null;
  // 연출 중에는 기계를 못 바꾼다(장면을 다시 만들면 진행 중인 뽑기가 사라진다)
  const canSwitch = phase === 'idle' || phase === 'revealed';
  // 넘기기 = 둘러보기만(장면을 다시 만들지 않는다). 연출 중에도 둘러볼 수는 있고, 바꾸는 것만 막힌다
  const step = (dir: -1 | 1) => {
    const next = browseIndex + dir;
    if (next >= 0 && next < GACHA_MACHINES.length) setBrowseIndex(next);
  };
  const isPhoneMenu = () => window.matchMedia?.('(max-width: 639px)').matches ?? false;
  const onSwipeDown = (e: ReactPointerEvent) => {
    if (!isPhoneMenu() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId, horizontal: null };
    dragged.current = false;
  };
  const onSwipeMove = (e: ReactPointerEvent) => {
    const s = swipe.current;
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (s.horizontal === null && Math.max(Math.abs(dx), Math.abs(dy)) > 6) {
      s.horizontal = Math.abs(dx) > Math.abs(dy);
      if (s.horizontal) { dragged.current = true; e.currentTarget.setPointerCapture(e.pointerId); }
    }
    if (!s.horizontal) return;
    // 양 끝에서는 덜 밀린다(더 갈 곳이 없다는 느낌)
    const atEdge = (dx > 0 && browseIndex === 0) || (dx < 0 && browseIndex === GACHA_MACHINES.length - 1);
    setDragX(!atEdge ? dx : dx / 4);
  };
  const onSwipeEnd = (e: ReactPointerEvent) => {
    const s = swipe.current;
    if (!s || e.pointerId !== s.id) return;
    swipe.current = null;
    const dx = e.clientX - s.x;
    setDragX(0);
    if (s.horizontal && Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
  };
  const prize = result ? ITEM_BY_ID.get(result.item) : undefined;
  // 확률은 서버가 준 «지금 풀»의 값을 쓴다(이벤트가 열리면 이벤트 물건·픽업이 반영된다). 서버 값이 없을 때만 상시 목록으로 계산.
  const serverProb = useMemo(() => new Map((data?.items ?? []).map((i) => [i.id, i])), [data?.items]);
  const machineProbs = data?.machines?.[machine.id]?.probs;
  const events = data?.events ?? [];
  // 확률 = 이 기계에서(서버가 정본). 서버 값이 없으면 같은 식으로 계산
  const probOf = (id: string) => machineProbs ? (machineProbs[id] ?? 0)
    : ITEM_BY_ID.get(id)?.event ? 0 : machineProbability(machine, ITEM_BY_ID.get(id)!);
  // 이 기계의 물건 — 풀 밖의 이벤트 물건(지난 이벤트)은 가진 것만 도감에 보인다
  const machineCatalog = useMemo(() => machineItems(machine, CATALOG)
    .filter((i) => !i.event || (machineProbs?.[i.id] ?? serverProb.get(i.id)?.prob ?? 0) > 0 || (data?.owned[i.id] ?? 0) > 0),
  [machine, machineProbs, serverProb, data?.owned]);
  const byRarity = useMemo(() => RARITY_ORDER.map((r) => ({ r, items: machineCatalog.filter((i) => i.rarity === r) })).filter((g) => g.items.length > 0), [machineCatalog]);
  const collectible = machineCatalog.length;
  const ownedHere = machineCatalog.filter((i) => (data?.owned[i.id] ?? 0) > 0).length;
  const tierShare = (r: Rarity) => byRarity.find((g) => g.r === r)?.items.reduce((sum, i) => sum + probOf(i.id), 0) ?? 0;

  return (
    <div className={cn('tama-app fixed inset-0 z-50 overflow-hidden', isClassic ? 'is-classic' : 'is-color')} data-gacha-phase={phase} role="region" aria-label="별빛 가챠">
      <div ref={wrapRef} className="absolute inset-x-0 bottom-36 top-36 sm:top-16" onPointerDown={onPointerDownCanvas}>
        <canvas ref={canvasRef} className="block h-full w-full touch-none" data-gacha-canvas aria-hidden="true" />
      </div>

      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 p-3 sm:p-4">
        <button type="button" onClick={onClose} disabled={phase === 'paying' || phase === 'turning' || phase === 'dropping' || phase === 'opening'}
          aria-label="다마고찌로" className="tama-chip flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[13px] disabled:opacity-40">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> <span className="max-sm:sr-only">다마고찌로</span>
        </button>
        <div className="flex items-center gap-2 text-[13px]">
          <span className="tama-chip whitespace-nowrap rounded-full px-3.5 py-2">코인 <b className="tabular-nums">{coins ?? '…'}</b></span>
          <button type="button" onClick={() => setOdds(true)} className="tama-chip flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full px-4">
            <Info className="h-4 w-4" aria-hidden="true" /> 확률 · 도감 {ownedHere}/{collectible}
          </button>
        </div>
      </header>

      {/* 가챠 기계 메뉴(2026-10-13) — 데스크톱 = 왼쪽 위 세로 배너 목록. 휴대폰 = 배너 한 장 + 좌우로 밀어 고르기(양옆 화살표·점은 보조).
          버튼 다섯은 두 배치가 같은 것을 쓰고, 휴대폰에서는 트랙을 --slide 만큼 옮길 뿐이다.
          ⚠️ 장면(캔버스)은 메뉴를 피해 옮기지 않는다 — 기계는 언제나 화면 가운데(사용자 지시). 메뉴는 그 위에 떠 있다 */}
      <div className="absolute inset-x-0 top-16 z-10 flex items-start justify-center gap-1.5 sm:inset-x-auto sm:left-4 sm:top-20 sm:block sm:w-56">
        <button type="button" onClick={() => step(-1)} disabled={browseIndex === 0} aria-label="이전 가챠 기계"
          className="tama-chip mt-[9px] grid h-9 w-9 shrink-0 place-items-center rounded-full disabled:opacity-30 sm:hidden">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="flex flex-col items-center gap-1.5 sm:block">
          <nav aria-label="가챠 기계" data-gacha-machines
            onPointerDown={onSwipeDown} onPointerMove={onSwipeMove} onPointerUp={onSwipeEnd} onPointerCancel={onSwipeEnd}
            className="w-56 overflow-hidden rounded-2xl shadow-md [touch-action:pan-y] sm:w-full sm:overflow-visible sm:rounded-none sm:shadow-none sm:[touch-action:auto]">
            <div data-gacha-track
              className={cn('flex sm:flex-col sm:gap-2 max-sm:[transform:translateX(calc(var(--slide)*-100%_+_var(--drag)))]',
                dragX === 0 && 'transition-transform duration-300 ease-out')}
              style={{ '--slide': browseIndex, '--drag': `${dragX}px` } as CSSProperties}>
              {GACHA_MACHINES.map((m) => {
                const on = m.id === machine.id;
                const p = m.price;
                return (
                  <button key={m.id} type="button" aria-pressed={on} disabled={!canSwitch && !on} draggable={false}
                    onClick={() => { if (dragged.current) { dragged.current = false; return; } if (canSwitch) setMachineId(m.id); }}
                    data-gacha-machine={m.id}
                    className={cn('relative h-[54px] w-full shrink-0 overflow-hidden text-left transition sm:h-[84px] sm:rounded-2xl sm:shadow-md',
                      on ? 'sm:scale-[1.02] sm:shadow-xl sm:ring-[3px] sm:ring-white' : 'sm:opacity-85 sm:hover:opacity-100', 'sm:disabled:opacity-40')}
                    style={{ background: `linear-gradient(135deg, ${m.theme.header[0]}, ${m.theme.header[1]}, ${m.theme.header[2]})` }}>
                    <img src={m.banner} alt="" loading="lazy" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    <span className="absolute inset-0" style={{ background: `linear-gradient(90deg, ${m.theme.headerStroke}e6 0%, ${m.theme.headerStroke}99 45%, transparent 80%)` }} />
                    <span className="relative flex h-full flex-col justify-between px-3 py-1.5 text-white sm:p-2.5">
                      <span className="text-[13px] font-black leading-tight drop-shadow sm:text-[15px]">{m.name}</span>
                      <span className="flex items-center gap-1.5">
                        <span className={cn('rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-black text-amber-950 shadow sm:text-[11px]', adminFree && 'line-through decoration-2')}>{p}코인</span>
                        {adminFree && <span className="shrink-0 rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-black text-violet-800 shadow">관리자 무료</span>}
                        <span className="truncate text-[10px] font-semibold [text-shadow:0_1px_3px_rgba(0,0,0,0.85)] max-sm:hidden">{m.blurb}</span>
                      </span>
                    </span>
                    {on && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-white shadow max-sm:hidden" aria-hidden="true" />}
                    {/* 휴대폰 — 보이는 배너가 지금 기계인지, 눌러야 바뀌는지 */}
                    <span className={cn('absolute right-2 top-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-black shadow sm:hidden',
                      on ? 'bg-white/90 text-violet-800' : 'animate-pulse bg-amber-300 text-amber-950')}>
                      {on ? '사용 중' : canSwitch ? '눌러서 바꾸기' : '뽑기 끝나고'}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>
          <div className="flex gap-1.5 sm:hidden" aria-hidden="true" data-gacha-dots>
            {GACHA_MACHINES.map((m, i) => (
              <span key={m.id} className={cn('h-1.5 rounded-full shadow transition-all', i === machineIndex ? 'bg-amber-300' : 'bg-white',
                i === browseIndex ? 'w-4' : i === machineIndex ? 'w-1.5' : 'w-1.5 opacity-50')} />
            ))}
          </div>
        </div>
        <button type="button" onClick={() => step(1)} disabled={browseIndex === GACHA_MACHINES.length - 1} aria-label="다음 가챠 기계"
          className="tama-chip mt-[9px] grid h-9 w-9 shrink-0 place-items-center rounded-full disabled:opacity-30 sm:hidden">
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* 펫 이벤트(Phase 5 — 관리자가 연다) — 기간 · 이벤트 물건 · 픽업 */}
      {events.length > 0 && phase === 'idle' && (
        <div className="absolute inset-x-0 top-36 z-10 flex justify-center px-3 sm:top-16" data-gacha-event>
          <button type="button" onClick={() => setOdds(true)}
            className="tama-chip flex max-w-md items-center gap-2 rounded-2xl px-4 py-2 text-left text-[12px] shadow-md ring-2 ring-amber-300">
            <Sparkles className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
            <span className="min-w-0">
              <b className="block truncate">{events[0].title}</b>
              <span className="opacity-75">{new Date(events[0].ends_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}까지 · 이벤트 물건 {events[0].item_ids.length}개{events[0].pickup_ids.length ? ` · 픽업 ${events[0].pickup_ids.length}개` : ''}</span>
            </span>
          </button>
        </div>
      )}

      {failed && (
        <div className="absolute inset-0 z-20 grid place-items-center p-6">
          <p className="tama-chip max-w-sm rounded-3xl p-6 text-center text-[14px]">이 기기에서는 3D 가챠 기계를 띄울 수 없어요. 다른 브라우저에서 열어 주세요.</p>
        </div>
      )}

      {/* 아래 — 지금 할 일 */}
      {phase !== 'revealed' && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 p-4 pb-6">
          <p className="tama-chip rounded-full px-4 py-2 text-[13px]" aria-live="polite">{message || (phase === 'idle' && browsingOther && `«${browsed.name}» 배너를 누르면 그 기계로 바꿔요`) || (phase === 'idle' && blockedReason) || HINT[phase] || (adminFree ? `${machine.name} · 관리자는 무료로 뽑아요(학생은 ${price}코인)` : `${machine.name} · 코인 ${price}개를 넣고 손잡이를 돌려요`)}</p>
          {phase === 'idle' && (
            <button type="button" onClick={insertCoin} disabled={!!blockedReason || !data}
              className={cn('flex h-14 min-w-56 items-center justify-center gap-2 rounded-full px-6 text-[16px] font-bold shadow-lg disabled:opacity-50',
                isClassic ? 'bg-white/90 text-indigo-950' : 'bg-violet-600 text-white')}>
              <span className="grid h-7 min-w-7 place-items-center rounded-full bg-amber-300 px-1 text-[12px] font-black text-amber-900">{adminFree ? '무료' : price}</span>
              코인 넣기
            </button>
          )}
          {phase === 'armed' && (
            <button type="button" onClick={autoTurn} className={cn('flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-bold', isClassic ? 'bg-white/90 text-indigo-950' : 'bg-violet-600 text-white')}>
              <Dices className="h-5 w-5" aria-hidden="true" /> 자동으로 돌리기
            </button>
          )}
          {phase === 'ready' && (
            <button type="button" onClick={() => { void openCapsule(); }} className={cn('flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-bold', isClassic ? 'bg-white/90 text-indigo-950' : 'bg-violet-600 text-white')}>
              <Sparkles className="h-5 w-5" aria-hidden="true" /> 캡슐 열기
            </button>
          )}
          {phase === 'idle' && !blockedReason && (
            <p className="text-[11px] opacity-70">앞으로 {untilPity}번 안에 새 물건 확정 · 이미 있는 물건이면 {refund}코인 돌려받아요</p>
          )}
        </div>
      )}

      {/* 상품 카드 */}
      {phase === 'revealed' && prize && result && (
        <div className="absolute inset-0 z-20 grid place-items-center p-4" data-gacha-prize={prize.id}>
          <div className="tama-pop w-full max-w-xs rounded-3xl p-5 text-center shadow-2xl"
            style={{ background: `linear-gradient(160deg, #ffffff, ${RARITY[prize.rarity].glow})`, boxShadow: `0 0 0 3px ${RARITY[prize.rarity].color}, 0 20px 60px -10px ${RARITY[prize.rarity].color}` }}>
            <p className="inline-block rounded-full px-3 py-1 text-[12px] font-bold text-white" style={{ background: RARITY[prize.rarity].color }}>
              {RARITY[prize.rarity].label}{result.pity ? ' · 천장' : ''}
            </p>
            <div className="mx-auto mt-3 grid h-48 place-items-center"><PrizePreview itemId={prize.id} className="max-h-48" /></div>
            <p className="mt-2 text-[18px] font-bold text-violet-950">{prize.name}</p>
            <p className="text-[12px] text-violet-900/70">{SLOT_LABEL[prize.slot]}{prize.note ? ` · ${prize.note}` : ''}</p>
            <p className={cn('mt-2 text-[13px] font-bold', result.is_new ? 'text-pink-600' : 'text-violet-900/70')}>
              {result.is_new ? '새로 얻었어요!' : `이미 있는 물건 — ${result.refund}코인 돌려받았어요`}
            </p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={again} className="h-11 flex-1 rounded-full bg-white/80 text-[14px] text-violet-950 ring-1 ring-violet-200">한 번 더</button>
              <button type="button" onClick={equipNow} className="h-11 flex-1 rounded-full bg-violet-600 text-[14px] font-bold text-white">바로 꾸미기</button>
            </div>
          </div>
        </div>
      )}

      {/* 확률 공개 · 도감 */}
      <TamaDialog open={odds} onOpenChange={setOdds} style={style} title={`${machine.name} · 확률 · 도감`} description={`${machine.blurb} — 물건마다 나올 확률과 내가 가진 물건`} testId="odds">
        {events.map((e) => (
          <div key={e.id} className="mt-2 rounded-2xl bg-amber-100/80 px-3 py-2 text-[12px] text-amber-950" data-odds-event>
            <b>{e.title}</b> · {new Date(e.ends_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}까지
            {e.body && <p className="mt-0.5 opacity-80">{e.body}</p>}
            <p className="mt-0.5 opacity-80">이벤트 물건은 이 기간에만 나와요. 픽업은 같은 등급 안에서 두 배로 잘 나와요(등급 확률은 그대로).</p>
          </div>
        ))}
        <p className="mt-2 text-[11px] leading-5 opacity-80">
          한 번에 {price}코인 · 뽑기는 서버가 해요. 확률은 이 기계의 물건끼리 나눈 값이에요. 새 물건 없이 {PITY_AT - 1}번 연속이면(어느 기계든 함께 세요) 다음은 이 기계에서 아직 없는 물건에서만 나와요(천장). 겹치면 {refund}코인을 돌려받아요.
        </p>
        <div className="mt-2 max-h-[55vh] space-y-3 overflow-y-auto pr-1">
          {byRarity.map(({ r, items }) => (
            <div key={r}>
              <p className="text-[12px] font-bold" style={{ color: RARITY[r].color }}>{RARITY[r].label} · 합 {tierShare(r).toFixed(tierShare(r) < 2 ? 1 : 0)}%</p>
              <ul className="mt-1 grid grid-cols-2 gap-1.5 text-[12px]">
                {items.map((i) => {
                  const have = data?.owned[i.id] ?? 0;
                  return (
                    <li key={i.id} className={cn('flex min-w-0 items-center gap-1.5 rounded-xl px-2 py-1.5', isClassic ? 'bg-white/10' : 'bg-white/65', !have && 'opacity-60')}>
                      <span className="min-w-0 flex-1 truncate" title={i.name}>{have ? i.name : '???'}</span>
                      {i.event && <span className="shrink-0 rounded-full bg-amber-300 px-1.5 text-[10px] font-bold text-amber-950">이벤트</span>}
                      {serverProb.get(i.id)?.pickup && <span className="shrink-0 rounded-full bg-pink-500 px-1.5 text-[10px] font-bold text-white">픽업</span>}
                      <span className="shrink-0 tabular-nums opacity-80">{probOf(i.id).toFixed(probOf(i.id) < 2 ? 1 : 0)}%</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </TamaDialog>
    </div>
  );
}
