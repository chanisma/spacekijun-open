/**
 * 다마고찌 (`/tamagotchi`) — 전체 화면 앱(별빛 아카데미처럼 앱 껍데기 없이). docs/features/tamagotchi.md
 *
 * 기기 모양 둘 — 클래식(1996 P1: 32×16 흑백 LCD) · 컬러(최근 Pix·Uni·Paradise: 128×128 컬러 TFT). 머리줄에서 바꾼다.
 * 알림은 기기 안의 종 메뉴에서 본다 — 컬러는 화면 안에 자세히, 클래식은 기기 옆 쪽지로. 다른 화면으로 가는 링크는 없다.
 * 학생·교사·관리자: 서버에 저장(2026-10-07 — 선생님도 키운다) · 그 밖(직원 등, 라우트가 막지만 메뉴로 열렸을 때): «체험 모드»(이 기기에만).
 * 수업 정지는 내 시간표를 따른다 — 학생은 듣는 수업, 선생님은 가르치는 수업.
 * Phase 2(2026-10-07): 기기 아래 한 줄 — 코인 · 펫 일기 · 함께 집중. 코인을 받으면(어느 화면에서든) 펫 화면을 열 때 펫이 기뻐한다.
 * Phase 3(같은 날): 가챠(3D 기계 — three 는 GachaView 청크에만) · 꾸미기(기기 디자인·방) · 치료제 외상 · 진화 가지 · 오늘의 질문.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, HelpCircle, Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { readStoredString, writeStoredString } from '@/lib/safeLocalStorage';
import { cn } from '@/lib/utils';
import { DeviceView, prefetchDevice3D } from './components/DeviceView';
import { LoadingScreen } from './components/LoadingScreen';
import { LOADING_TIMEOUT_MS, loadProgress, loadSteps, type LoadStepKey } from './model/loading';
import { AdoptCard, ClassicSlip, HelpDialog, ONBOARD_KEY, OnboardingDialog } from './components/AppChrome';
import { CoinDialog, CreditBar, DiaryDialog, FocusDialog, FocusInviteCard, type PanelKind } from './components/CreditPanels';
import { toast } from '@/lib/toast';
import { CharacterDialog, FriendsDialog, type FriendsTab, type RequestTab } from './components/SocialPanels';
import { PetHouseDialog, type HouseTab } from './components/PetHouseDialog';
import { LinkIncomingCard, LinkMeetDialog, LinkTab, linkBlock } from './components/LinkPanels';
import { SPECIES_KEY, useLinks, useSpecies } from './hooks/useSpecies';
import { LongestPetsDialog } from './components/LongestPetsDialog';
import { AchievementsDialog } from './components/AchievementsDialog';
import type { GachaMachineId } from './model/gachaMachines';
import { CHARACTER_KEY, useCharacterOrders, useDecorOrders, useSocial } from './hooks/useSocial';
import { socialService } from './services/socialService';
import { useCredit } from './hooks/useCredit';
import { SHOP_KEY, useShop } from './hooks/useShop';
import { DecorDialog } from './components/DecorDialog';
import { deviceStyleOf } from './model/catalog';
import { newCredits, pickReply, type DiaryKind } from './model/credit';
import { useBeeper } from './hooks/useBeeper';
import { usePetSchedule } from './hooks/usePetSchedule';
import { usePetMessages } from './hooks/usePetMessages';
import { useFocusInvite } from './hooks/useFocusInvite';
import { inviteLines, sulkLine } from './model/focusInvite';
import { useTamagotchi } from './hooks/useTamagotchi';
import { useCoinEconomy } from '@/lib/coinEconomy';
import './model/economySync';
import { demoPetStore, serverPetStore, type PetSkin } from './services/petService';
import type { ShopStatus } from './services/shopService';
import { createEgg, skinStopsPoop, STAGE_LABEL, viewPet, type PetView } from './model/petModel';
import { MODE_INFO, deathCauseOf } from './model/petModes';
import { EMPTY_SCHEDULE } from './model/clock';
import type { PetMessage } from './model/messages';
import type { ScreenInput } from './model/screenInput';
import { initialUi } from './lcd/deviceUi';
import { colorDetailLayout } from './color/colorScreen';
import { loadTamaFonts } from './color/text';
import { loadCodexSprites } from './color/codexSprites';
import { setCharacterArt, type CharacterArt } from './color/characters';
import { uiStyleOf, type DeviceStyle } from './three/dims';
import './tamagotchi.css';

const GachaView = lazy(() => import('./components/GachaView'));

/** 마지막으로 본 기기(서버 장착을 받기 전 첫 그림 · 홈 카드가 읽는다). 서버 모드의 정본은 가챠 «기기 종류» 장착이다. */
const STYLE_KEY = 'tamagotchi:style:v1';
const readStyle = (): DeviceStyle => {
  const v = readStoredString(STYLE_KEY);
  return v === 'classic' || v === 'digimon' || v === 'suitcase' ? v : 'color';
};
/** 컬러 캐릭터 그림체 — codex 가 그린 그림(시험, 기본) · 절차적 도트. 기기마다 기억한다. */
const ART_KEY = 'tamagotchi:art:v1';
const readArt = (): CharacterArt => (readStoredString(ART_KEY) === 'procedural' ? 'procedural' : 'codex');

/** 알을 받기 전 — 흔들리는 알만 */
function useEggPreview() {
  return useCallback((cb: (input: ScreenInput) => void) => {
    const born = Date.now();
    const egg = createEgg('', born, 7);
    const emit = () => {
      const now = Date.now();
      cb({ ui: initialUi(born), state: egg, view: { ...viewPet(egg, EMPTY_SCHEDULE, now), hatchProgress: 0.3 }, now, messages: [], unread: false, notice: null, screenOff: false });
    };
    emit();
    const id = window.setInterval(emit, 300);
    return () => window.clearInterval(id);
  }, []);
}

function Backdrop({ style }: { style: DeviceStyle }) {
  const dots = useMemo(() => {
    let s = style === 'classic' ? 7 : 11;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: style === 'classic' ? 60 : 14 }, () => ({ left: r() * 100, top: r() * 100, size: r(), delay: r() * 6 }));
  }, [style]);
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {style === 'classic'
        ? dots.map((d, i) => <span key={i} className="tama-star" style={{ left: `${d.left}%`, top: `${d.top}%`, width: 1 + d.size * 2.2, height: 1 + d.size * 2.2, animationDelay: `${d.delay}s` }} />)
        : dots.map((d, i) => (
          <span key={i} className="tama-bokeh" style={{
            left: `${d.left}%`, top: `${d.top}%`, width: 30 + d.size * 120, height: 30 + d.size * 120, animationDelay: `${d.delay}s`,
            background: ['rgba(255,255,255,0.55)', 'rgba(255,170,215,0.35)', 'rgba(180,160,255,0.35)'][i % 3],
          }} />
        ))}
    </div>
  );
}

function srSummary(name: string, view: PetView | null): string {
  if (!view) return '';
  if (view.dead) return `${name}: ${deathCauseOf(view.deathCause).phrase} 별이 되었어요. 새 알을 받을 수 있어요.`;
  if (view.stage === 'egg') return `${name}: 알이 흔들리고 있어요.`;
  const bits = [`${name}, ${STAGE_LABEL[view.stage]} ${view.ageYears}살`, `배부름 ${view.hungerHearts}칸`, `행복 ${view.happyHearts}칸`];
  if (view.inClass) bits.push('수업 중');
  if (view.asleep) bits.push('자는 중');
  if (view.sick) bits.push(view.critical ? `위독해요(약 ${view.hoursLeft}시간 남음)` : '아파요');
  if (view.poop) bits.push(`똥 ${view.poop}개`);
  return bits.join(', ');
}

export default function TamagotchiPage() {
  const { user, profile, isAdmin } = useAuth();
  const navigate = useNavigate();
  useCoinEconomy(); // 관리자 코인 설정 — 가챠·의뢰·자리·보상 문구가 서버 값과 같게
  const role = profile?.role;
  const owns = role === 'student' || role === 'teacher' || role === 'admin';
  const store = owns ? serverPetStore : demoPetStore;
  // 관리자도 자기 시간표(가르치는 수업)가 있으면 그것을 따른다. 학생 미리보기 중이어도 펫은 관리자 본인의 것이다.
  const who = role === 'student' ? 'student' : owns ? 'teacher' : 'none';
  const [localStyle, setLocalStyle] = useState<DeviceStyle>(readStyle);
  const [help, setHelp] = useState(false);
  // 처음 안내(Phase 7) — 펫이 처음 준비됐을 때 한 번(사람마다 기억)
  const [guide, setGuide] = useState(false);
  // 첫 로딩이 끝났는가(한 번 걷히면 다시 덮지 않는다 — 기기·그림체를 바꿔도)
  const [booted, setBooted] = useState(false);
  const [panel, setPanel] = useState<PanelKind | null>(null);
  const credit = useCredit(store.mode === 'server');
  const shop = useShop(store.mode === 'server');
  // 함께(Phase 5) — 친구·교환·캐릭터 의뢰
  const social = useSocial(store.mode === 'server', user?.id ?? null);
  // 새 종 · 창고 · 통신(2026-10-26) — 통신은 별빛 친구(학생)끼리만
  const speciesQ = useSpecies(store.mode === 'server');
  const linkEnabled = store.mode === 'server' && !!social.friends.data?.eligible;
  const links = useLinks(linkEnabled, user?.id ?? null);
  const [houseTab, setHouseTab] = useState<HouseTab>('pets');
  const characters = useCharacterOrders(store.mode === 'server', shop.status.data?.equipped?.character ?? null);
  // 꾸미기 의뢰(2026-10-08) — 의뢰 창의 둘째 탭
  const decorOrders = useDecorOrders(store.mode === 'server');
  const [requestTab, setRequestTab] = useState<RequestTab>('character');
  // 가챠를 열 때 고를 기계(꾸미기 창에서 오면 그 자리의 기계)
  const [gachaMachine, setGachaMachine] = useState<GachaMachineId>('all');
  const incomingTrades = (social.friends.data?.trades ?? []).filter((t) => t.status === 'pending' && !t.expired && t.to_user === user?.id).length;
  // 받은 친구 요청(2026-10-15) — 교환 제안과 함께 «친구» 단추의 배지가 된다(둘 다 친구 창에서 답할 것)
  const incomingFriendRequests = social.codes.data?.eligible ? (social.codes.data.incoming?.length ?? 0) : 0;
  // 친구 창을 어느 탭으로 열지 — 친구 요청 알림에서 오면 «친구 맺기»
  const [friendsTab, setFriendsTab] = useState<FriendsTab>('friends');
  const eventOn = (shop.status.data?.events?.length ?? 0) > 0;
  // 알림에서 들어올 때 — ?friends=1 · ?character=1 · ?decor=1(의뢰 창의 꾸미기 탭) · ?gacha=1 (한 번 읽고 지운다)
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (store.mode !== 'server') return;
    const want: PanelKind | null = params.get('friends') ? 'friends' : params.get('character') || params.get('decor') ? 'character' : params.get('gacha') ? 'gacha' : null;
    if (!want) return;
    if (want === 'character') setRequestTab(params.get('decor') ? 'decor' : 'character');
    if (want === 'friends') setFriendsTab(params.get('friends') === 'requests' ? 'add' : 'friends');
    setPanel(want);
    const next = new URLSearchParams(params);
    ['friends', 'character', 'decor', 'gacha'].forEach((k) => next.delete(k));
    setParams(next, { replace: true });
  }, [params, setParams, store.mode]);
  const equipped = useMemo(() => shop.status.data?.equipped ?? {}, [shop.status.data?.equipped]);
  // 기기 종류는 가챠의 한 자리(2026-10-07) — 서버 모드에서는 «기기 종류» 장착이 정본(없으면 컬러), 받기 전에는 마지막으로 본 기기.
  // 바꾸는 곳은 꾸미기 창 하나뿐이다(머리글 단추는 사용자 결정으로 없앴다 — 같은 일을 두 곳에서 하지 않는다)
  const serverShop = store.mode === 'server' ? shop.status.data : undefined;
  const style: DeviceStyle = serverShop ? deviceStyleOf(equipped) : localStyle;
  // 화면·알림·페이지 꾸밈은 두 갈래 — 클래식만 흑백, 디지털은 컬러처럼 움직인다
  const ui = uiStyleOf(style);
  useEffect(() => {
    if (!serverShop) return;
    setLocalStyle(style);
    writeStoredString(STYLE_KEY, style);
  }, [serverShop, style]);
  // 치료제는 무료다(2026-10-10 — `20261010130000_tamagotchi_medicine_free.sql`). 주사 뒤 서버를 부르지 않는다.
  // 외상 갚기는 남는다(옛 외상이 있을 때만 코인 창에 보인다 — 적용 시점 0명)
  const sayRef = useRef<(short: string, text: string) => void>(() => undefined);
  const shopRef = useRef(shop);
  shopRef.current = shop;
  const payDebt = useCallback(async () => {
    try {
      const r = await shopRef.current.payDebt.mutateAsync();
      sayRef.current(r.debt ? '조금 갚았어!' : '다 갚았어!', r.debt ? `외상 ${r.paid}코인을 갚았어요 — ${r.debt}코인 남았어요` : `외상 ${r.paid}코인을 다 갚았어요`);
    } catch { /* 코인 창이 다시 읽으며 말해 준다 */ }
  }, []);
  const { schedule, ready, timetable, weekly } = usePetSchedule(who);
  const beeper = useBeeper();
  const [snapshot, setSnapshot] = useState<{ name: string; view: PetView | null } | null>(null);

  const [art, setArt] = useState<CharacterArt>(readArt);
  // 첫 로딩(2026-10-09) — 다 준비될 때까지 로딩 화면이 덮는다(그 전의 «다른 모습»이 먼저 보이지 않게). 단계 = model/loading
  const [loadDone, setLoadDone] = useState<Partial<Record<LoadStepKey, boolean>>>({});
  const mark = useCallback((k: LoadStepKey) => setLoadDone((d) => (d[k] ? d : { ...d, [k]: true })), []);
  useEffect(() => {
    prefetchDevice3D(); // 3D 묶음을 펫·상점과 함께 받기 시작
    void loadTamaFonts().finally(() => mark('fonts'));
  }, [mark]);
  useEffect(() => {
    setCharacterArt(art);
    if (art === 'codex') void loadCodexSprites().finally(() => mark('art'));
    else mark('art');
  }, [art, mark]);
  const changeArt = (next: CharacterArt) => { setArt(next); writeStoredString(ART_KEY, next); };

  const messages = usePetMessages({ plannerEnabled: owns, userId: user?.id ?? null, timetable, weekly, pet: snapshot });
  const pagesOf = useMemo(() => (ui === 'color' ? (m: PetMessage) => colorDetailLayout(m).pages.length : undefined), [ui]);
  // 스킨은 펫마다(2026-10-14) — 함께하는 펫이 바뀌면 «입힌 캐릭터» 캐시를 그 펫의 스킨으로 바로 바꾸고 서버 값으로 다시 확인한다.
  // 기다리기만 하면 다시 읽는 사이 앞 펫의 스킨이 새 펫에게 그려진다(제보: 새 알이 어른이 되면 다른 펫의 스킨으로 자란다고 보였다).
  const qc = useQueryClient();
  const onPetChanged = useCallback((skin: PetSkin) => {
    qc.setQueryData<ShopStatus>(SHOP_KEY, (prev) => {
      if (!prev) return prev;
      const next = { ...prev.equipped };
      if (skin.itemId) next.character = skin.itemId; else delete next.character;
      return { ...prev, equipped: next };
    });
    qc.setQueryData<{ orders: unknown[]; equipped: string | null }>(CHARACTER_KEY, (prev) => (prev ? { ...prev, equipped: skin.orderId } : prev));
    void qc.invalidateQueries({ queryKey: SHOP_KEY });
    void qc.invalidateQueries({ queryKey: CHARACTER_KEY });
  }, [qc]);
  const pet = useTamagotchi({ store, schedule, scheduleReady: ready, messages, beep: beeper.beep, pagesOf, backlight: ui === 'color', focusEndsAt: credit.focusEndsAt,
    equipped, lifetime: credit.status.data?.lifetime ?? null, tradePartners: speciesQ.data?.tradePartners ?? null,
    noPoop: serverShop && characters.mine.data ? skinStopsPoop(equipped.character, characters.mine.data.equipped) : null, onPetChanged });
  // 통신으로 만나면 펫이 반가워한다(돌보기가 아니라 소식) · 첫 통신이면 받은 알이 창고에 생겼다
  const onLinkCheer = useCallback((partner: string) => {
    pet.cheer(1, '반가워!', `${partner}의 펫과 통신했어요 — 반가워해요`);
    void qc.invalidateQueries({ queryKey: SPECIES_KEY });
  }, [pet, qc]);

  // 새로 받은 코인을 펫이 알아챈다 — 펫 화면을 안 연 사이 플래너에서 번 것도 열 때 한꺼번에(지연 계산과 같은 생각)
  const recent = credit.status.data?.recent;
  const { cheer, say, sulk, petId } = pet;
  sayRef.current = say;
  useEffect(() => {
    if (!recent || pet.status !== 'ready' || !petId) return;
    const key = `tamagotchi:cheered:${petId}`;
    const seen = readStoredString(key) || new Date(credit.serverNow() - 86_400_000).toISOString();
    const fresh = newCredits(recent, seen);
    if (fresh.latest && fresh.latest !== seen) writeStoredString(key, fresh.latest);
    if (fresh.total > 0) cheer(fresh.rows.length, `+${fresh.total} 코인!`, `코인 +${fresh.total} — ${fresh.text}`);
  }, [recent, pet.status, petId, cheer, credit.serverNow]);
  const [lastReply, setLastReply] = useState<string | null>(null);
  const onDiaryWritten = (kind: DiaryKind) => {
    const reply = pickReply(kind, Math.random(), lastReply);
    setLastReply(reply);
    say(reply, `${pet.name || '펫'}: «${reply}»`);
  };
  const onFocusFinished = (outcome: string, got: number) => {
    if (outcome === 'completed') say(got > 0 ? '해냈다!' : '수고했어!', got > 0 ? '함께 집중 완료 — 코인은 펫이 곧 알려 줄 거예요' : '함께 집중 완료 — 오늘 받을 수 있는 코인은 다 받았어요');
    else if (outcome === 'gave_up') say('다음에 또!', '이번 집중은 여기까지 — 괜찮아요, 다음에 또 해요');
    else say('다음엔 같이!', '끝난 뒤 15분이 지나서 이번 집중은 기록만 닫았어요');
    setPanel(null);
  };
  useEffect(() => {
    setSnapshot((prev) => (prev?.view === pet.view && prev?.name === pet.name ? prev : { name: pet.name, view: pet.view }));
  }, [pet.view, pet.name]);
  // 친구가 다녀가 쓰다듬은 것 — 펫 화면을 열 때 한꺼번에(받은 것은 서버가 «가져감»으로 표시해 두 번 기뻐하지 않는다)
  const visitsTaken = useRef(false);
  useEffect(() => {
    if (pet.status !== 'ready' || store.mode !== 'server' || visitsTaken.current) return;
    visitsTaken.current = true;
    socialService.takeVisits().then((visits) => {
      if (!visits.length) return;
      const names = [...new Set(visits.map((v) => v.name))];
      cheer(visits.length, '친구가 왔어!', `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` 외 ${names.length - 3}명` : ''}이(가) 놀러 와서 쓰다듬어 줬어요`);
    }).catch(() => undefined);
  }, [pet.status, store.mode, cheer]);

  useEffect(() => {
    if (pet.status !== 'ready' || !user?.id || !booted) return; // 로딩 화면이 걷힌 뒤에
    if (readStoredString(ONBOARD_KEY(user.id))) return;
    writeStoredString(ONBOARD_KEY(user.id), new Date().toISOString());
    setGuide(true);
  }, [pet.status, user?.id, booted]);
  const eggPreview = useEggPreview();
  const live = pet.status === 'ready';

  // 집중 권하기(2026-10-15) — 자습 신청·시간이 정해진 계획의 시간이 되면 펫이 «같이 집중할래?». 강제가 아니라 선택권이다
  // (수업만 멈춘다). [나중에]는 펫이 조금 아쉬워할 뿐 상태는 그대로 — 판정 = model/focusInvite.ts
  const { invite, dismiss: dismissInvite } = useFocusInvite({
    enabled: live && store.mode === 'server',
    userId: user?.id ?? null,
    isStudent: role === 'student',
    serverNow: credit.serverNow,
    focusOpen: !!credit.focus,
    busy: !pet.view || pet.view.inClass || pet.view.asleep || pet.view.dead,
  });
  const announcedInvite = useRef<string | null>(null);
  useEffect(() => {
    if (!invite || !booted || announcedInvite.current === invite.key) return;
    announcedInvite.current = invite.key;
    const l = inviteLines(invite);
    say(l.short, `${l.title} — ${l.detail}. 함께 집중 ${invite.minutes}분 어때요?`);
  }, [invite, booted, say]);
  const acceptInvite = async () => {
    if (!invite) return;
    try {
      await credit.startFocus.mutateAsync({ minutes: invite.minutes, taskId: invite.taskId });
      say('좋아, 시작!', `함께 집중 ${invite.minutes}분을 시작했어요`);
      setPanel('focus');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '시작하지 못했어요.');
    }
  };
  const laterInvite = () => {
    if (!invite) return;
    dismissInvite();
    const line = sulkLine(Date.now() / 1000);
    sulk(line, `${pet.name || '펫'}: «${line}» — 이 시간에는 다시 권하지 않을게요`);
  };
  // 꾸민 모습(장착 기기·껍데기)을 알 때까지 기기를 만들지 않는다 — 기본 모습으로 만들었다가 다시 만들면 한 번 더 바뀌어 보인다
  const shopSettled = store.mode !== 'server' || shop.status.isSuccess || shop.status.isError;
  useEffect(() => { if (pet.status !== 'loading') mark('pet'); }, [pet.status, mark]);
  useEffect(() => { if (shopSettled) mark('decor'); }, [shopSettled, mark]);
  const onDeviceReady = useCallback(() => mark('device'), [mark]);
  const loadingSteps = useMemo(() => loadSteps({ codexArt: art === 'codex', server: store.mode === 'server' }), [art, store.mode]);
  const loadComplete = loadProgress(loadingSteps, loadDone).complete;
  useEffect(() => { if (loadComplete || pet.status === 'error') setBooted(true); }, [loadComplete, pet.status]);
  // 무엇 하나가 멈춰도 갇히지 않게 — 시간이 지나면 걷는다(각자 늦게라도 들어와 그려진다)
  useEffect(() => { const t = window.setTimeout(() => setBooted(true), LOADING_TIMEOUT_MS); return () => window.clearTimeout(t); }, []);
  const [loadingGone, setLoadingGone] = useState(false);
  useEffect(() => { if (!booted) return undefined; const t = window.setTimeout(() => setLoadingGone(true), 320); return () => window.clearTimeout(t); }, [booted]);
  const screen = pet.ui.screen;
  const slipOpen = ui === 'classic' && live && (screen.kind === 'messages' || screen.kind === 'detail');
  // 별이 된 펫(죽음 옵션) — 기기 옆에 «이 자리에 새 알» 카드
  const departed = live && pet.view?.dead ? { name: pet.name, mode: pet.view.mode, cause: pet.view.deathCause } : undefined;
  const listIndex = screen.kind === 'messages' || screen.kind === 'detail' ? screen.index : 0;
  const announce = screen.kind === 'detail' && messages.length
    ? (() => { const m = messages[screen.index % messages.length]; return `${m.title}. ${m.lines.filter(Boolean).join('. ')}`; })()
    : screen.kind === 'messages' && messages.length ? `알림 ${messages.length}개. ${messages[screen.index % messages.length].title}` : '';
  const isClassic = ui === 'classic';

  return (
    <div className={cn('tama-app fixed inset-0 z-40 overflow-hidden', isClassic ? 'is-classic' : 'is-color')}
      data-screen={screen.kind === 'anim' ? `anim:${screen.anim}` : screen.kind} data-cursor={pet.ui.cursor ?? ''} data-style={style}>
      <Backdrop style={ui} />
      {!loadingGone && <LoadingScreen steps={loadingSteps} done={loadDone} leaving={booted} classic={isClassic} />}

      {/* 머리줄 — 나가기 · 펫 이름 / 기기 모양 · 소리 · 도움말 */}
      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 p-3 sm:p-4">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={() => navigate('/')} aria-label="나가기 — 홈으로"
            className="tama-chip grid h-11 w-11 shrink-0 place-items-center rounded-full">
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          {live && pet.view && (
            <span className="tama-chip hidden truncate rounded-full px-3.5 py-2 text-[13px] sm:inline">
              {pet.name} · {pet.view.dead ? '별이 됨' : <>{STAGE_LABEL[pet.view.stage]}{pet.view.stage !== 'egg' && ` ${pet.view.ageYears}살`}</>}
              {pet.view.mode !== 'easy' && <span className={cn('ml-1.5 font-bold', pet.view.mode === 'hard' ? 'text-rose-400' : 'text-amber-400')}>{MODE_INFO[pet.view.mode].badge}</span>}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={beeper.toggle} aria-pressed={beeper.enabled} aria-label={beeper.enabled ? '소리 끄기' : '소리 켜기'}
            className="tama-chip grid h-11 w-11 place-items-center rounded-full">
            {beeper.enabled ? <Volume2 className="h-5 w-5" aria-hidden="true" /> : <VolumeX className="h-5 w-5" aria-hidden="true" />}
          </button>
          <button type="button" onClick={() => setHelp(true)} aria-haspopup="dialog" aria-label="조작 방법"
            className="tama-chip grid h-11 w-11 place-items-center rounded-full">
            <HelpCircle className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      {pet.status === 'error' ? (
        <div className="absolute inset-0 grid place-items-center p-6">
          <div className="tama-chip max-w-sm rounded-3xl p-6 text-center">
            <p className="text-[15px] font-bold">펫을 불러오지 못했어요</p>
            <p className="mt-1 text-[12px] opacity-75">{pet.error}</p>
            <button type="button" onClick={() => window.location.reload()} className="mt-4 h-11 rounded-xl bg-pink-500 px-5 text-[14px] font-bold text-white">다시 시도</button>
          </div>
        </div>
      ) : (
        <main className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto px-3 pb-12 pt-16 lg:flex-row lg:gap-6 lg:overflow-visible">
          <div className="flex w-full max-w-[720px] shrink-0 flex-col items-center gap-2">
            {/* 집중 권하기 카드가 뜨면 데스크톱에서 기기를 조금 줄인다(카드 한 줄만큼 — 아래 단추 줄이 바닥 안내와 겹치지 않게) */}
            <div className={cn('relative h-[min(60vh,620px)] w-full', invite ? 'lg:h-[min(70vh,780px)]' : 'lg:h-[min(80vh,780px)]')}>
              {shopSettled && <DeviceView style={style} shellId={equipped.shell ?? null} subscribe={live ? pet.subscribe : eggPreview} onPress={live ? pet.press : () => undefined}
                onReady={onDeviceReady} />}
            </div>
            {live && store.mode === 'server' && invite && (
              <FocusInviteCard style={ui} invite={invite} busy={credit.startFocus.isPending} onAccept={() => { void acceptInvite(); }} onLater={laterInvite} />
            )}
            {live && store.mode === 'server' && <CreditBar style={ui} credit={credit} onOpen={setPanel} showAchievements friendsBadge={incomingTrades + incomingFriendRequests} eventOn={eventOn}
              houseBadge={(pet.status === 'ready' && !pet.view?.dead ? 1 : 0) + pet.others.filter((o) => !o.storedAt && !o.state.dead).length < pet.slots || (speciesQ.data?.tickets.length ?? 0) > 0} />}
          </div>
          {/* 옆 자리 — 알 받기 · 클래식 알림 쪽지(도움말은 화면 위 대화상자) (데스크톱은 오른쪽, 휴대폰은 아래) */}
          {(pet.status === 'needsEgg' || slipOpen || departed) && (
            <aside className="w-full max-w-[360px] shrink-0 space-y-3 lg:w-[340px]">
              {pet.status === 'needsEgg' && <AdoptCard onAdopt={pet.adopt} demo={store.mode === 'demo'} style={ui} unlocked={speciesQ.data?.unlocked} />}
              {departed && <AdoptCard onAdopt={pet.rebirth} demo={store.mode === 'demo'} style={ui} departed={departed} unlocked={speciesQ.data?.unlocked} />}
              {slipOpen && <ClassicSlip messages={messages} index={listIndex} open={screen.kind === 'detail'} />}
            </aside>
          )}
        </main>
      )}

      <HelpDialog open={help} onOpenChange={setHelp} style={ui} art={art} onArt={changeArt} onReplayGuide={() => { setHelp(false); setGuide(true); }}
        mode={live && pet.view && !pet.view.dead ? { mode: pet.view.mode, hoursLeft: pet.view.hoursLeft } : undefined} />
      <OnboardingDialog open={guide} onOpenChange={setGuide} style={ui} />
      {store.mode === 'server' && (
        <>
          <CoinDialog open={panel === 'coins'} onOpenChange={(o) => setPanel(o ? 'coins' : null)} style={ui} credit={credit} onPayDebt={payDebt} />
          <DecorDialog open={panel === 'decor'} onOpenChange={(o) => setPanel(o ? 'decor' : null)} style={ui} shop={shop} onGacha={(m) => { setGachaMachine(m); setPanel('gacha'); }}
            grown={pet.view?.stage === 'adult'} onRequest={() => { setRequestTab('decor'); setPanel('character'); }} />
          {panel === 'gacha' && (
            <Suspense fallback={<div className="fixed inset-0 z-50 grid place-items-center text-sm">가챠 기계를 준비하는 중…</div>}>
              <GachaView style={ui} shop={shop} soundOn={beeper.enabled} onClose={() => { setPanel(null); setGachaMachine('all'); }} initialMachine={gachaMachine} />
            </Suspense>
          )}
          <DiaryDialog open={panel === 'diary'} onOpenChange={(o) => setPanel(o ? 'diary' : null)} style={ui} credit={credit} onWritten={onDiaryWritten} />
          <FocusDialog open={panel === 'focus'} onOpenChange={(o) => setPanel(o ? 'focus' : null)} style={ui} credit={credit}
            userId={user?.id ?? null} onFinished={onFocusFinished} />
          <FriendsDialog open={panel === 'friends'} onOpenChange={(o) => { setPanel(o ? 'friends' : null); if (!o) setFriendsTab('friends'); }} style={ui} social={social} shop={shop} me={user?.id ?? null}
            tab={friendsTab} onTab={setFriendsTab} linkBadge={links.incoming ? 1 : 0}
            linkPanel={linkEnabled ? <LinkTab friends={social.friends.data?.friends ?? []} links={links} block={linkBlock(live && pet.view ? pet.view : null)} classic={isClassic} /> : undefined} />
          {store.mode === 'server' && <AchievementsDialog open={panel === 'achievements'} onOpenChange={(o) => setPanel(o ? 'achievements' : null)} style={ui} />}
          <LongestPetsDialog open={panel === 'longest'} onOpenChange={(o) => setPanel(o ? 'longest' : null)} style={ui} initialMode={pet.view?.mode ?? 'easy'} />
          <PetHouseDialog open={panel === 'pethouse'} onOpenChange={(o) => { setPanel(o ? 'pethouse' : null); if (!o) setHouseTab('pets'); }} style={ui} pet={pet} characters={characters} serverMode
            species={speciesQ.data} initialTab={houseTab} />
          {linkEnabled && (
            <>
              <LinkIncomingCard links={links} block={linkBlock(live && pet.view ? pet.view : null)} />
              <LinkMeetDialog links={links} friends={social.friends.data?.friends ?? []} style={ui} onCheer={onLinkCheer}
                mine={live && pet.view ? { stage: pet.view.stage, look: pet.view.look } : null}
                onOpenHouse={() => { setHouseTab('storage'); setPanel('pethouse'); }} />
            </>
          )}
          <CharacterDialog open={panel === 'character'} onOpenChange={(o) => setPanel(o ? 'character' : null)} style={ui} characters={characters}
            decor={decorOrders} shop={shop} coins={credit.status.data?.coins} tab={requestTab} onTab={setRequestTab} grown={pet.view?.stage === 'adult'} />
        </>
      )}

      {/* 바닥줄 — 클래식의 거절 말(컬러는 화면 말풍선) · 체험 모드 · 저장 실패 */}
      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 p-3 text-[12px]">
        {isClassic && pet.notice && <p className="tama-chip tama-pop rounded-full px-4 py-2">{pet.notice}</p>}
        {pet.saveError && <p className="tama-chip rounded-full px-4 py-2 text-rose-500">저장하지 못했어요 — 다시 돌보면 함께 저장돼요</p>}
        {booted && <p className="opacity-60">
          {store.mode === 'demo' ? '체험 모드 · 이 기기에만 저장 · ' : ''}끌어서 돌려 보기 · 키보드 A S D
          {!isClassic && pet.screenOff ? ' · 아무 버튼이나 누르면 화면이 켜져요' : ''}
        </p>}
      </footer>

      {/* 화면(캔버스)을 읽지 못하는 스크린리더를 위해 — 상태와 알림을 글로 */}
      <div className="sr-only" aria-live="polite">
        {srSummary(pet.name, pet.view)} {announce} {pet.notice ?? ''}
      </div>
    </div>
  );
}
