/**
 * 별까지 쌓기 — 화면 본체(서버를 모른다: TowerApi 를 받는다 → 브라우저 확인 하네스가 모의 구현을 꽂는다).
 *
 * 장면이 화면 전체를 쓰고, 그 위에 위(자원) · 오른쪽(짓기·교환·도감·작은 창·소리) · 아래(집중 카드)만 얹는다.
 * mini = 작은 창(팝업) 모드 — 장면 + 집중 카드만.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { ArrowLeft, ArrowLeftRight, BookOpen, Hammer, PictureInPicture2, Trophy, Volume2, VolumeX } from 'lucide-react';
import { toast } from '@/lib/toast';
import { readStoredString, writeStoredString } from '@/lib/safeLocalStorage';
import {
  getBrowserNotificationPermission, requestBrowserNotificationPermission, shouldShowBrowserNotifications, showBrowserNotification,
} from '@/lib/browserNotifications';
import { TowerCanvas } from './components/TowerCanvas';
import { FocusCard, focusProgress } from './components/FocusCard';
import { BuildSheet, CatchSheet, CodexSheet, RankSheet, RankStar, TradeSheet, type CodexTab } from './components/sheets';
import { RankingSheet } from './components/RankingSheet';
import { magnitudeLabel, magnitudeOf } from './model/rank';
import { ItemIcon, RESOURCE_ICON } from './components/ui';
import { LoadingScreen } from './components/LoadingScreen';
import { getAssetProgress, loadTowerAssets, subscribeAssetProgress } from './scene/assets';
import { loadProgress } from './model/loading';
import { pixelFontSize } from './model/pixelFont';
import { openDocumentPip, openMiniPopup, supportsDocumentPip, type MiniHandle } from './components/miniWindow';
import { FLOORS, FOCUS_MINUTES, RESOURCES } from './model/catalog';
import { CONSTELLATIONS, RANK_CONSTELLATIONS } from './model/constellations';
import { readyCount } from './model/achievements';
import { kstHour, meteorShowerAt, rainbowAt, seasonAt, weatherAt, type Season, type Weather } from './model/sky';
import { FLOOR_LIFE } from './model/floorLife';
import { Ambience } from './audio/ambience';
import { VISITOR_BY_KEY } from './model/visitors';
import type { TowerScene } from './scene/TowerScene';
import { useTower, type TowerController } from './hooks/useTower';
import type { FinishResult, TowerApi } from './services/towerApi';
import type { SceneView } from './scene/TowerScene';
import './star-tower.css';

const MINUTES_KEY = 'star-tower:minutes';
/** 글꼴이 이보다 늦으면 기다리지 않는다(시스템 글꼴로 먼저 그리고 나중에 바뀐다 — 화면이 영영 안 걷히는 것보다 낫다) */
const FONT_WAIT_MS = 4000;
const SOUND_KEY = 'star-tower:sound';
const ASKED_NOTIFY_KEY = 'star-tower:asked-notify';

type SheetKind = 'build' | 'trade' | 'codex' | 'catch' | 'rank' | 'ranking' | null;

/**
 * 시험용 하늘 고정(브라우저 확인·관리자 둘러보기):
 * ?hour=18.5 · ?weather=rain|clear|rainbow · ?meteor=1(유성우) · ?summon=sky-whale,airship(방문자를 바로 불러옴)
 */
interface SkyOverride { hour: number | null; weather: Weather | null; rainbow: boolean | null; meteor: boolean | null; summon: string[]; season: Season | null }
const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
function readSkyOverride(): SkyOverride {
  if (typeof window === 'undefined') return { hour: null, weather: null, rainbow: null, meteor: null, summon: [], season: null };
  const q = new URLSearchParams(window.location.search);
  const h = q.get('hour');
  const w = q.get('weather');
  return {
    hour: h != null && !Number.isNaN(Number(h)) ? Number(h) : null,
    weather: w === 'rain' ? 'rain' : w === 'clear' || w === 'rainbow' ? 'clear' : null,
    rainbow: w === 'rainbow' ? true : w ? false : null,
    meteor: q.get('meteor') === '1' ? true : null,
    summon: (q.get('summon') ?? '').split(',').filter(Boolean),
    season: SEASONS.includes(q.get('season') as Season) ? (q.get('season') as Season) : null,
  };
}

/** 화면 글자 크기 — 손가락 기기는 기기 화소 비율에 맞춰 키운다(model/pixelFont.ts). 확대·회전·모니터 이동에 따라 다시 잰다 */
function usePixelFontSize(): number {
  const read = () => (typeof window === 'undefined'
    ? 12
    : pixelFontSize(window.devicePixelRatio || 1, window.matchMedia('(pointer: coarse)').matches));
  const [fs, setFs] = useState(read);
  useEffect(() => {
    const on = () => setFs(read());
    const mq = window.matchMedia('(pointer: coarse)');
    window.addEventListener('resize', on);
    mq.addEventListener('change', on);
    return () => { window.removeEventListener('resize', on); mq.removeEventListener('change', on); };
  }, []);
  return fs;
}

function MiniView({ ctl, minutes, getView, onStart }: { ctl: TowerController; minutes: number; getView: () => SceneView; onStart: () => void }) {
  // 작은 창은 아래 시계 칸(약 70px)만큼 낚시터를 올린다
  const view = useCallback((): SceneView => ({ ...getView(), bottomInset: 76 }), [getView]);
  return (
    <div className="st-root">
      <TowerCanvas getView={view} scale={2} />
      <div style={{ position: 'absolute', left: 6, right: 6, bottom: 6 }}>
        <FocusCard compact focus={ctl.snap?.focus ?? null} serverNow={ctl.serverNow} busy={ctl.busy} minutes={minutes} onMinutes={() => {}} onStart={onStart} onGiveUp={() => {}} />
      </div>
    </div>
  );
}

export function StarTowerApp({ api, mini = false, onExit }: { api: TowerApi; mini?: boolean; onExit: () => void }) {
  const ctl = useTower(api);
  const { snap } = ctl;
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [codexTab, setCodexTab] = useState<CodexTab>('stars');
  const [result, setResult] = useState<{ r: FinishResult } | null>(null);
  const [minutes, setMinutesState] = useState<number>(() => {
    const v = Number(readStoredString(MINUTES_KEY));
    return (FOCUS_MINUTES as readonly number[]).includes(v) ? v : 25;
  });
  const [sound, setSound] = useState(() => readStoredString(SOUND_KEY) !== 'off');
  const [pip, setPip] = useState<MiniHandle | null>(null);
  const override = useMemo(readSkyOverride, []);

  // 첫 로딩 — 탑 기록 · 그림 · 글꼴이 다 되면 걷힌다(model/loading.ts). 그림 promise 는 캔버스와 같은 캐시를 쓴다.
  const art = useSyncExternalStore(subscribeAssetProgress, getAssetProgress);
  const [fontReady, setFontReady] = useState(false);
  useEffect(() => {
    void loadTowerAssets();
    let alive = true;
    const done = () => { if (alive) setFontReady(true); };
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!fonts) { done(); return; }
    const t = setTimeout(done, FONT_WAIT_MS);
    Promise.all([fonts.load("12px 'StarTowerGalmuri'"), fonts.load("700 24px 'StarTowerGalmuri'")]).then(done, done);
    return () => { alive = false; clearTimeout(t); };
  }, []);
  const loadState = { tower: snap != null, font: fontReady, art };
  const allLoaded = loadProgress(loadState).done;
  // 다 되면 0.35초 흐려지며 걷히고, 그 뒤 화면에서 뺀다. 한 번 걷히면 다시 덮지 않는다(다시 읽기는 조용히).
  const [veil, setVeil] = useState<'on' | 'leaving' | 'off'>('on');
  useEffect(() => { if (allLoaded) setVeil((v) => (v === 'on' ? 'leaving' : v)); }, [allLoaded]);
  useEffect(() => {
    if (veil !== 'leaving') return;
    const t = setTimeout(() => setVeil('off'), 380);
    return () => clearTimeout(t);
  }, [veil]);

  // 소리 — 파도·비·바람(높이) 배경 + 누를 때의 효과음. 첫 손짓에서 길을 연다(브라우저 자동 재생 정책)
  const ambience = useRef(new Ambience());
  useEffect(() => {
    const a = ambience.current;
    const unlock = () => a.unlock();
    window.addEventListener('pointerdown', unlock);
    const onVis = () => a.setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => { window.removeEventListener('pointerdown', unlock); document.removeEventListener('visibilitychange', onVis); a.setVisible(false); };
  }, []);
  useEffect(() => { ambience.current.setEnabled(sound); }, [sound]);

  const setMinutes = (m: number) => { setMinutesState(m); writeStoredString(MINUTES_KEY, String(m)); };

  // 넓은 화면은 집중 카드를 왼쪽 아래로(탑을 가리지 않게), 휴대폰은 가운데 아래 + 장면이 카드 높이만큼 낚시터를 올린다
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)');
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const fontPx = usePixelFontSize();
  const rootRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const cardH = useRef(0);
  const loaded = snap != null;
  // 위 자원 막대의 아래 끝 · 아래 집중 카드의 높이를 CSS 변수로 — 오른쪽 단추 줄과 인사 한 줄이 그 사이에 들어간다
  // (글자가 커지면 둘 다 커지므로 숫자로 적어 두면 휴대폰에서 겹친다)
  useEffect(() => {
    const root = rootRef.current;
    const top = topRef.current;
    const card = cardRef.current;
    if (!root || !top || !card) return;
    const ro = new ResizeObserver(() => {
      cardH.current = card.getBoundingClientRect().height + 12;
      root.style.setProperty('--st-top-h', `${Math.ceil(top.getBoundingClientRect().bottom)}px`);
      root.style.setProperty('--st-card-h', `${Math.ceil(root.getBoundingClientRect().bottom - card.getBoundingClientRect().top)}px`);
    });
    ro.observe(top);
    ro.observe(card);
    ro.observe(root);
    return () => ro.disconnect();
  }, [loaded]);

  // 장면은 매 프레임 이 함수를 부른다 — React 상태를 ref 로 넘겨 다시 그리기 없이 최신 값을 읽게
  const live = useRef({ ready: false, floors: [] as string[], towers: 0, pastTowers: [] as string[][], focus: null as SceneView['focus'], inset: 0 });
  live.current = {
    ready: snap != null,
    floors: snap?.floors ?? [],
    towers: snap?.towers ?? 0,
    pastTowers: (snap?.pastTowers ?? []).map((p) => p.floors),
    focus: snap?.focus ? { startedAt: snap.focus.startedAt, plannedSeconds: snap.focus.plannedSeconds } : null,
    inset: wide || mini ? 0 : -1,
  };
  const { serverNow } = ctl;
  const getView = useCallback((): SceneView => {
    const now = serverNow();
    return {
      ready: live.current.ready,
      floors: live.current.floors,
      towers: live.current.towers,
      pastTowers: live.current.pastTowers,
      focus: live.current.focus,
      bottomInset: live.current.inset < 0 ? cardH.current : live.current.inset,
      now,
      hour: override.hour ?? kstHour(now),
      weather: override.weather ?? weatherAt(now),
      rainbow: override.rainbow ?? rainbowAt(now),
      meteorShower: override.meteor ?? meteorShowerAt(now),
      season: override.season ?? seasonAt(now),
    };
  }, [serverNow, override]);

  const start = useCallback(async () => {
    if (getBrowserNotificationPermission() === 'default' && !readStoredString(ASKED_NOTIFY_KEY)) {
      writeStoredString(ASKED_NOTIFY_KEY, '1');
      void requestBrowserNotificationPermission();
    }
    await ctl.start(minutes);
  }, [ctl, minutes]);

  const finishAndShow = useCallback(async (giveUp: boolean) => {
    const r = await ctl.finish(giveUp);
    if (!r) return;
    if (r.outcome === 'running') { void ctl.reload(); return; }
    setResult({ r });
    setSheet('catch');
    ambience.current.play('chime');
    if (document.visibilityState !== 'visible' && shouldShowBrowserNotifications()) {
      void showBrowserNotification({
        title: r.outcome === 'completed' ? '집중을 끝까지 채웠어요' : '집중을 마쳤어요',
        body: `${r.catches.length}번 걸렸어요 — 무엇이 걸렸는지 탑에서 확인해 보세요.`,
        tag: 'star-tower-focus',
        destination: { to: '/star-tower' },
      });
    }
  }, [ctl]);

  // 시간이 다 차면 저절로 건져 올린다(집중마다 한 번)
  const autoDone = useRef<string | null>(null);
  useEffect(() => {
    if (mini) return;
    const id = setInterval(() => {
      const f = snap?.focus;
      if (!f || ctl.busy || autoDone.current === f.id) return;
      if (focusProgress(f, ctl.serverNow()).remaining <= 0) { autoDone.current = f.id; void finishAndShow(false); }
    }, 1000);
    return () => clearInterval(id);
  }, [snap?.focus, ctl, finishAndShow, mini]);

  const giveUp = useCallback(() => {
    const f = snap?.focus;
    if (!f) return;
    const { rolls } = focusProgress(f, ctl.serverNow());
    const ok = window.confirm(rolls > 0
      ? `지금 그만두면 다 찬 5분 칸 ${rolls}번만 건집니다.\n끝까지 채웠을 때의 한 번 더와 별 조각은 없어요.`
      : '아직 5분이 차지 않아 아무것도 걸리지 않았어요. 그만둘까요?');
    if (ok) void finishAndShow(true);
  }, [snap?.focus, ctl, finishAndShow]);

  // 방문자를 누르면 — 장면이 반응(말풍선·반짝이)하고, 여기서는 한 줄을 띄우고 처음이면 도감에 적는다
  const [say, setSay] = useState<{ text: string; first: boolean; at: number } | null>(null);
  const [tradeFocus, setTradeFocus] = useState<'raft' | 'merchant'>('raft');
  useEffect(() => {
    if (!say) return;
    const id = setTimeout(() => setSay(null), 3200);
    return () => clearTimeout(id);
  }, [say]);
  const { meet } = ctl;
  const onTap = useCallback((hit: string) => {
    if (hit === 'rank-star') { ambience.current.play('sparkle'); setSheet('rank'); return; }
    if (hit === 'merchant') { ambience.current.play('horn'); setTradeFocus('merchant'); setSheet('trade'); return; }
    if (hit.startsWith('floor:')) {
      const life = FLOOR_LIFE[hit.slice(6)];
      if (life) { ambience.current.play(life.sound); setSay({ text: life.line, first: false, at: Date.now() }); }
      return;
    }
    const v = VISITOR_BY_KEY[hit];
    if (!v) return;
    ambience.current.play(v.sound);
    const first = !(snap?.visitors ?? []).includes(hit);
    setSay({ text: v.reaction, first, at: Date.now() });
    if (first) void meet(hit);
  }, [snap?.visitors, meet]);
  const sceneRef = useRef<TowerScene | null>(null);
  // 배경 섞기 — 물이 많이 보이면 파도, 비 오면 빗소리, 높이 올라갈수록 바람
  useEffect(() => {
    const id = setInterval(() => {
      const s = sceneRef.current;
      if (!s) return;
      const v = getView();
      const water = s.cam < 0 ? Math.min(1, -s.cam / (s.H * 0.3)) : 0;
      const altitude = Math.max(0, (s.cam + s.H / 2) / 900);
      ambience.current.mix(water, v.weather === 'rain' && v.season !== 'winter', altitude);
    }, 1000);
    return () => clearInterval(id);
  }, [getView]);
  const onScene = useCallback((s: TowerScene) => {
    sceneRef.current = s;
    // ?summon= — 브라우저 확인용으로 방문자를 바로 불러온다
    if (override.summon.length) setTimeout(() => override.summon.forEach((k) => s.summon(k)), 900);
  }, [override.summon]);

  const build = useCallback(async (key: string) => {
    const before = snap?.floors.length ?? 0;
    const ok = await ctl.build(key);
    if (!ok) return;
    setSheet(null);
    // 16층째 = 탑 완성 → 등성이 오른다(서버 tower_build 가 그 순간 towers +1). 장면은 나의 별에서 고리를 퍼뜨린다
    if (before + 1 === FLOORS.length) {
      const next = magnitudeOf((snap?.towers ?? 0) + 1);
      const rankStar = RANK_CONSTELLATIONS.find((c) => c.towersAt === (snap?.towers ?? 0) + 1);
      ambience.current.play('chime');
      toast.success(`탑을 완성했어요! 나의 별이 ${magnitudeLabel(next)}이 되었어요. 돔 위의 별을 눌러 보세요.${rankStar ? ` 등성 별자리 «${rankStar.name}»도 하늘에 이어졌어요.` : ''}`);
      return;
    }
    const opened = CONSTELLATIONS.find((c) => c.unlockAt === before + 1);
    // 새 별자리는 밤에만 보인다 — 낮이면 화면이 말해 주지 않으므로 알린다
    if (opened) toast.success(`새 별자리 «${opened.name}»가 탑 위 하늘에 이어졌어요. 밤에 올려다보세요.`);
  }, [ctl, snap?.floors.length, snap?.towers]);

  // 새 탑 — 지금 탑이 수평선으로 물러난다(되돌릴 수 없으므로 묻는다)
  const newTower = useCallback(async () => {
    const ok = window.confirm('지금 탑을 수평선으로 물리고 1층부터 새 탑을 쌓을까요?\n가진 재료·도감·병 편지·집중 기록과 등성은 그대로이고, 지금 탑은 되돌릴 수 없어요.');
    if (!ok) return;
    if (await ctl.newTower()) {
      setSheet(null);
      toast.success('새 탑을 시작했어요. 지난 탑은 수평선에 서 있어요.');
    }
  }, [ctl]);

  // 작은 창(PiP) — 그 창의 root 에 지금 상태를 그때그때 다시 그린다
  useEffect(() => {
    pip?.root.render(<MiniView ctl={ctl} minutes={minutes} getView={getView} onStart={start} />);
  }, [pip, ctl, minutes, getView, start]);
  const openMini = useCallback(async () => {
    if (pip) { pip.win.close(); return; }
    if (!supportsDocumentPip()) { openMiniPopup(); return; }
    try {
      setPip(await openDocumentPip(() => setPip(null)));
    } catch {
      openMiniPopup();
    }
  }, [pip]);
  useEffect(() => () => { pip?.win.close(); }, [pip]);

  if (mini) {
    return <MiniView ctl={ctl} minutes={minutes} getView={getView} onStart={start} />;
  }

  const inv = snap?.inventory;
  // 받을 수 있는 업적 수 — 도감 단추 배지(관리자는 0)
  const achReady = readyCount(ctl.achievements);
  return (
    <div ref={rootRef} className="st-root" style={{ '--st-fs': `${fontPx}px` } as CSSProperties}>
      <TowerCanvas getView={getView} onTap={onTap} onScene={onScene} />

      {/* 방문자에게 인사한 한 줄 */}
      {say && (
        <div key={say.at} className="st-panel st-say" role="status" style={{ position: 'absolute', left: '50%', top: 'calc(var(--st-top-h, 60px) + 8px)', transform: 'translateX(-50%)', padding: '6px 12px', maxWidth: 'min(92vw, 420px)', textAlign: 'center' }}>
          {say.text}{say.first && <span className="st-good"> · 도감에 적었어요</span>}
        </div>
      )}

      {/* 위 — 나가기 · 자원 */}
      <div ref={topRef} style={{ position: 'absolute', top: 'max(8px, env(safe-area-inset-top))', left: 8, right: 8, display: 'flex', gap: 8, alignItems: 'flex-start', justifyContent: 'space-between', pointerEvents: 'none' }}>
        <button type="button" className="st-icon st-exit" style={{ pointerEvents: 'auto' }} aria-label="나가기 — 홈으로" onClick={onExit}><ArrowLeft /><span>나가기</span></button>
        {inv && (
          <div className="st-panel" style={{ pointerEvents: 'auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: wide ? 2 : 0, padding: '4px 4px' }} aria-label="가진 것">
            {wide && <span className="st-res" title="쌓은 층"><b style={{ color: 'var(--st-accent)' }}>{snap!.floors.length}</b>층</span>}
            {RESOURCES.map((r) => (
              <span key={r.key} className="st-res" title={r.label}>
                {/* 병 편지 = 읽은 편지 수(+남는 병) — 관리자도 실제 값을 보인다(2026-10-23: bottle 은 «남는 병») */}
                <ItemIcon name={RESOURCE_ICON[r.key]} size={1} label={r.label} />
                <b>{r.key === 'bottle' ? `${snap!.letters.length}${inv.bottle > 0 ? `+${inv.bottle}` : ''}` : snap!.unlimited ? '∞' : inv[r.key]}</b>
              </span>
            ))}
            {snap!.unlimited && <span className="st-res st-admin" title="테스트용 — 저장된 값은 그대로이고 짓기·교환에서 빼지 않습니다">관리자 · 재화 무한</span>}
          </div>
        )}
      </div>

      {/* 오른쪽 — 할 수 있는 일 */}
      {snap && (
        <nav className="st-nav" aria-label="탑에서 할 일" style={{ position: 'absolute', right: 8, top: 'calc(var(--st-top-h, 68px) + 8px)', bottom: wide ? 8 : 'var(--st-card-h, 160px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, pointerEvents: 'none' }}>
          <button type="button" className="st-icon" data-rank-button onClick={() => setSheet('rank')} aria-label={`나의 별 — ${magnitudeLabel(magnitudeOf(snap.towers))}`}>
            <RankStar towers={snap.towers} size={20} /><span>{magnitudeLabel(magnitudeOf(snap.towers))}</span>
          </button>
          <button type="button" className="st-icon" data-ranking-button onClick={() => setSheet('ranking')} aria-label="순위 — 별을 쌓은 사람들"><Trophy /><span>순위</span></button>
          <button type="button" className="st-icon" onClick={() => setSheet('build')}><Hammer /><span>짓기</span></button>
          <button type="button" className="st-icon" onClick={() => { setTradeFocus('raft'); setSheet('trade'); }}><ArrowLeftRight /><span>교환</span></button>
          <button type="button" className="st-icon" data-codex-button onClick={() => { setCodexTab(achReady > 0 ? 'achievements' : 'stars'); setSheet('codex'); }}
            aria-label={achReady > 0 ? `도감 — 받을 업적 ${achReady}개` : '도감'} style={{ position: 'relative' }}>
            <BookOpen /><span>도감</span>
            {achReady > 0 && <span className="st-badge" aria-hidden>{achReady}</span>}
          </button>
          <button type="button" className="st-icon" aria-pressed={!!pip} onClick={() => void openMini()} title="다른 창 위에 떠 있는 작은 창으로 띄웁니다"><PictureInPicture2 /><span>작은 창</span></button>
          <button type="button" className="st-icon" aria-pressed={sound} aria-label={sound ? '소리 끄기' : '소리 켜기'} onClick={() => { setSound(!sound); writeStoredString(SOUND_KEY, sound ? 'off' : 'on'); }}>
            {sound ? <Volume2 /> : <VolumeX />}<span>소리</span>
          </button>
        </nav>
      )}

      {/* 아래 — 집중 */}
      {snap && (
        <div ref={cardRef} style={wide
          ? { position: 'absolute', left: 12, bottom: 12, width: 400 }
          : { position: 'absolute', left: '50%', bottom: 'max(10px, env(safe-area-inset-bottom))', transform: 'translateX(-50%)', width: 'min(440px, calc(100% - 16px))' }}>
          <FocusCard focus={snap.focus} serverNow={ctl.serverNow} busy={ctl.busy} minutes={minutes} onMinutes={setMinutes} onStart={() => void start()} onGiveUp={giveUp} />
        </div>
      )}

      {veil !== 'off' && (
        <LoadingScreen state={loadState} leaving={veil === 'leaving'} error={snap ? null : ctl.loadError} onRetry={() => void ctl.reload()} onExit={onExit} />
      )}

      {sheet === 'build' && snap && <BuildSheet inventory={snap.inventory} floors={snap.floors} busy={ctl.busy} onBuild={(k) => void build(k)} onReorder={(next) => void ctl.reorder(next)} onClose={() => setSheet(null)}
        towers={snap.towers} onNewTower={() => void newTower()} />}
      {sheet === 'rank' && snap && <RankSheet towers={snap.towers} floors={snap.floors.length} pastTowers={snap.pastTowers} onClose={() => setSheet(null)} onOpenRanking={() => setSheet('ranking')} />}
      {sheet === 'ranking' && snap && <RankingSheet api={api} onClose={() => setSheet(null)} />}
      {sheet === 'trade' && snap && <TradeSheet inventory={snap.inventory} floors={snap.floors.length} focus={tradeFocus} busy={ctl.busy} onTrade={(k, t) => void ctl.trade(k, t)} onClose={() => setSheet(null)}
        coins={snap.coins} starCoinsToday={snap.starCoinsToday} unlimited={snap.unlimited} onSellStars={(t) => void ctl.sellStars(t)}
        letters={snap.letters.length} bottleCoinsToday={snap.bottleCoinsToday} onSellBottles={(t) => void ctl.sellBottles(t)} />}
      {sheet === 'codex' && snap && <CodexSheet floors={snap.floors} visitors={snap.visitors} caught={snap.caught} letters={snap.letters} focusSeconds={snap.focusSeconds} sessions={snap.sessions} towers={snap.towers} initialTab={codexTab} onClose={() => setSheet(null)}
        achievements={ctl.achievements} busy={ctl.busy} onClaim={(id, title) => void ctl.claimAchievement(id, title)} />}
      {sheet === 'catch' && result && (
        <CatchSheet result={result.r} onClose={() => setSheet(null)} onReadLetters={() => { setCodexTab('letters'); setSheet('codex'); }} />
      )}
    </div>
  );
}
