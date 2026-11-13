/**
 * 다마고찌 컨트롤러 — 펫(생명 모델) · 화면(상태 기계) · 저장 · 그리기를 잇는다.
 *
 * 흐름: 불러오기 → (서버 시각으로) 지금까지 따라잡기 → 0.1~0.25초마다 `ScreenInput` 을 만들어 구독자(기기)에게 넘긴다.
 * 기기는 그것을 자기 화면(클래식 LCD · 컬러 TFT)으로 그린다. 버튼 → 상태 기계 → 돌보기 → 저장(0.6초 묶음).
 *
 * 시계는 기기 시각이 아니라 «서버 시각 + 오차 보정»이다 — 기기 시계를 돌려 키우지 못하게.
 * 알림은 표시만 한다 — 다른 화면으로 보내지 않는다(2026-10-06 사용자 결정).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readStoredString, writeStoredString } from '@/lib/safeLocalStorage';
import { activityOfTick, tickOf, type SchoolSchedule } from '../model/clock';
import {
  advancePet, applyAction, careBlock, createEgg, modeOf, settleArrivedPet, viewPet, walkWaitMinutes,
  type PetAction, type PetMode, type PetState, type PetView, type RefuseReason,
} from '../model/petModel';
import { deathCauseOf } from '../model/petModes';
import { josa } from '../model/messages';
import type { PetMessage } from '../model/messages';
import type { Equipped } from '../model/catalog';
import { BRANCH_INFO, chooseBranch } from '../model/branch';
import { chooseForm, speciesOf, speciesStageName, type Species } from '../model/species';
import { predictNextCall, sameCall, type PetCall } from '../model/petCall';
import { restPetState } from '../model/petSlots';
import { NO_SKIN, type PetSkin, type RestingPet } from '../services/petService';
import type { CreditKind } from '../model/credit';
import { REFUSE_SHORT, type ScreenInput, type ScreenNotice } from '../model/screenInput';
import {
  afterAction, eventAnim, initialUi, press as pressUi, startGame, tickUi, type Button, type UiState,
} from '../lcd/deviceUi';
import type { PetStore, StoredPet } from '../services/petService';
import { buzz, type BeepKind } from './useBeeper';

export const REFUSE_TEXT: Record<RefuseReason, string> = {
  egg: '아직 알이에요. 곧 깨어날 거예요.',
  class: '지금은 수업 중이에요. 쉬는 시간에 돌봐 주세요.',
  asleep: '자고 있어요. 아침에 깨면 돌봐 주세요.',
  full: '배가 불러서 더는 못 먹겠대요.',
  happyFull: '지금도 충분히 행복해서 간식은 괜찮대요.',
  notSick: '아프지 않아서 주사가 필요 없어요.',
  nothing: '치울 게 없어요. 깨끗해요!',
  tooSoon: '방금 쓰다듬었어요.',
  walked: '방금 산책했어요. 한 시간 뒤에 또 가요.',
  sick: '아파서 놀 수 없어요. 주사를 먼저 놓아 주세요.',
  dead: '별이 되었어요. 기기 옆 카드에서 새 알을 받을 수 있어요.',
};

/** 컬러 기종의 화면이 꺼지기까지(실물은 30초 남짓) */
export const SCREEN_OFF_MS = 45_000;

type Status = 'loading' | 'needsEgg' | 'ready' | 'error';

interface Options {
  store: PetStore;
  schedule: SchoolSchedule;
  scheduleReady: boolean;
  messages: PetMessage[];
  beep: (kind: BeepKind) => void;
  /** 알림 하나의 자세한 내용이 몇 쪽인가 — 기기마다 다르다(클래식 = 쪽지 1쪽) */
  pagesOf?: (m: PetMessage) => number;
  /** 컬러 기종 — 오래 안 누르면 화면이 꺼진다 */
  backlight?: boolean;
  /** 함께 집중이 끝나는 시각(서버 시각 ms) — 있으면 화면이 «집중 중»을 그리고 꺼지지 않는다 */
  focusEndsAt?: number | null;
  /** 가챠로 꾸민 방 — 컬러 화면이 그린다 */
  equipped?: Equipped;
  /** 돌보기에 성공한 뒤(치료제 값 치르기 등 — Phase 3) */
  onCared?: (action: PetAction) => void;
  /** 펫이 태어난 뒤 받은 코인 종류별 횟수 — 어른의 진화 가지를 정한다(Phase 3). 모르면 null(가지를 정하지 않는다) */
  lifetime?: Partial<Record<CreditKind, number>> | null;
  /** 새 종 «전파 가족»의 특수 어른 판정 — 부화 뒤 교환을 마친 서로 다른 친구 수(서버 tama_trade_partners). 모르면 null */
  tradePartners?: number | null;
  /**
   * 함께하는 펫이 바뀐 직후(새 알 · 쉬던 펫 데려오기) — 그 펫이 입은 스킨을 알린다(2026-10-14 스킨은 펫마다).
   * 화면은 이 값으로 «입힌 캐릭터» 캐시를 즉시 바꾼다 — 다시 읽기를 기다리면 그 사이 앞 펫의 스킨이 새 펫에게 그려진다.
   */
  onPetChanged?: (skin: PetSkin) => void;
  /** 함께하는 펫이 똥을 싸지 않는 스킨을 입었는가(`skinStopsPoop`). 아직 모르면 null(저장된 값을 건드리지 않는다) */
  noPoop?: boolean | null;
}

export function useTamagotchi({ store, schedule, scheduleReady, messages, beep, pagesOf, backlight = false, focusEndsAt = null, equipped, onCared, lifetime = null, tradePartners = null, onPetChanged, noPoop = null }: Options) {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);
  const [view, setView] = useState<PetView | null>(null);
  const [ui, setUi] = useState<UiState>(() => initialUi(Date.now()));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [screenOff, setScreenOff] = useState(false);

  const petRef = useRef<StoredPet | null>(null);
  const uiRef = useRef<UiState>(ui);
  const offsetRef = useRef(0);
  const scheduleRef = useRef(schedule);
  const messagesRef = useRef(messages);
  const pagesRef = useRef(pagesOf);
  const noticeRef = useRef<ScreenNotice | null>(null);
  const backlightRef = useRef(backlight);
  const focusRef = useRef(focusEndsAt);
  const equippedRef = useRef(equipped);
  const caredRef = useRef(onCared);
  const lifetimeRef = useRef(lifetime);
  const tradePartnersRef = useRef(tradePartners);
  const petChangedRef = useRef(onPetChanged);
  const noPoopRef = useRef(noPoop);
  const listeners = useRef(new Set<(input: ScreenInput) => void>());
  const lastInput = useRef<ScreenInput | null>(null);
  const dirty = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const seenRef = useRef(-1);
  const lastAttention = useRef<string | null>(null);
  const saving = useRef(false);
  /** 종 메뉴에서 이미 본 알림 — 새 알림이 있을 때만 종이 깜빡인다 */
  const seenMessages = useRef(new Set<string>());

  scheduleRef.current = schedule;
  messagesRef.current = messages;
  pagesRef.current = pagesOf;
  backlightRef.current = backlight;
  focusRef.current = focusEndsAt;
  equippedRef.current = equipped;
  caredRef.current = onCared;
  lifetimeRef.current = lifetime;
  tradePartnersRef.current = tradePartners;
  petChangedRef.current = onPetChanged;
  noPoopRef.current = noPoop;

  const now = useCallback(() => Date.now() + offsetRef.current, []);
  const activityNow = useCallback(() => activityOfTick(tickOf(now()), scheduleRef.current), [now]);

  const setUiBoth = useCallback((next: UiState) => {
    uiRef.current = next;
    setUi((prev) => (prev.screen.kind !== next.screen.kind || prev.cursor !== next.cursor
      || (next.screen.kind === 'anim' && prev.screen.kind === 'anim' && prev.screen.anim !== next.screen.anim)
      || ((next.screen.kind === 'messages' || next.screen.kind === 'detail') && (prev.screen.kind === 'messages' || prev.screen.kind === 'detail')
        && (prev.screen.index !== next.screen.index || (prev.screen.kind === 'detail' && next.screen.kind === 'detail' && prev.screen.page !== next.screen.page)))
      ? next : prev));
  }, []);

  const showNotice = useCallback((reason: RefuseReason) => {
    const n = { text: REFUSE_TEXT[reason], short: REFUSE_SHORT[reason], at: now() };
    noticeRef.current = n;
    setNotice(n);
  }, [now]);

  const seenKey = (id: string) => `tamagotchi:seen:${id}`;

  // ── 탭을 닫아도 부르기(Phase 4) — 저장·불러오기 뒤에 «다음 부름»을 서버에 맡긴다. 바뀌었을 때만 보낸다. ──
  const sentCall = useRef<{ petId: string; call: PetCall | null } | null>(null);
  const syncCall = useCallback(() => {
    const pet = petRef.current;
    if (!pet || !store.scheduleCall) return;
    const call = predictNextCall(pet.state, scheduleRef.current, now());
    const last = sentCall.current;
    if (last && last.petId === pet.id && sameCall(last.call, call)) return;
    sentCall.current = { petId: pet.id, call };
    store.scheduleCall(pet.id, call).catch((e) => {
      sentCall.current = null; // 다음 저장에서 다시 보낸다
      console.warn('[tamagotchi] 부름 예약 실패:', e);
    });
  }, [store, now]);

  // ── 저장 ──
  const flush = useCallback(async () => {
    const pet = petRef.current;
    if (!pet || !dirty.current || saving.current) return;
    saving.current = true;
    dirty.current = false;
    try {
      const result = await store.save(pet);
      offsetRef.current = result.clockOffset;
      if (result.conflict) {
        petRef.current = { ...result.pet, state: advancePet(result.pet.state, now(), scheduleRef.current) };
        const n = { text: '다른 기기에서 돌본 기록을 불러왔어요.', short: '다시 왔어!', at: now() };
        noticeRef.current = n;
        setNotice(n);
      } else if (petRef.current) {
        petRef.current = { ...petRef.current, version: result.pet.version };
      }
      setSaveError(null);
      syncCall();
    } catch (e) {
      dirty.current = true;
      setSaveError(e instanceof Error ? e.message : '저장하지 못했어요.');
    } finally {
      saving.current = false;
    }
  }, [store, now, syncCall]);

  const scheduleSave = useCallback(() => {
    dirty.current = true;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void flush(); }, 600);
  }, [flush]);

  // ── 불러오기 ──
  useEffect(() => {
    let alive = true;
    setStatus('loading');
    store.load().then(({ pet, clockOffset, others: rest, slots: n, primaryCreatedAt, boughtSlots: b, nextSlotPrice: np }) => {
      if (!alive) return;
      offsetRef.current = clockOffset;
      petRef.current = pet;
      setOthers(rest ?? []);
      setSlots(n ?? 1);
      setBoughtSlots(b ?? 0);
      setNextSlotPrice(np ?? null);
      setPrimaryCreatedAt(primaryCreatedAt ?? null);
      setStatus(pet ? 'ready' : 'needsEgg');
    }).catch((e) => {
      if (!alive) return;
      setError(e instanceof Error ? e.message : '펫을 불러오지 못했어요.');
      setStatus('error');
    });
    return () => { alive = false; };
  }, [store]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') void flush(); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      void flush();
    };
  }, [flush]);

  // ── 여러 캐릭터(Phase 6) — 쉬는 펫 · 자리 ──
  const [others, setOthers] = useState<RestingPet[]>([]);
  const [slots, setSlots] = useState(1);
  const [boughtSlots, setBoughtSlots] = useState(0);
  const [nextSlotPrice, setNextSlotPrice] = useState<number | null>(null);
  const [primaryCreatedAt, setPrimaryCreatedAt] = useState<string | null>(null);
  /** 화면을 깜빡이지 않고 펫 목록만 다시 읽는다(바꾸기·새 알 뒤) */
  const refreshPets = useCallback(async () => {
    const r = await store.load();
    offsetRef.current = r.clockOffset;
    setOthers(r.others ?? []);
    setSlots(r.slots ?? 1);
    setBoughtSlots(r.boughtSlots ?? 0);
    setNextSlotPrice(r.nextSlotPrice ?? null);
    setPrimaryCreatedAt(r.primaryCreatedAt ?? null);
  }, [store]);
  /** 펫 자리 사기(2026-10-13) — 산 뒤 자리·값을 다시 읽는다 */
  const buySlot = useCallback(async () => {
    if (!store.buySlot) throw new Error('체험 모드에서는 펫 자리를 살 수 없어요.');
    const r = await store.buySlot();
    await refreshPets();
    return r;
  }, [store, refreshPets]);

  const adopt = useCallback(async (name: string, mode: PetMode = 'easy', species: Species = 'star') => {
    // 둘째 알부터 — 지금 펫의 마지막 상태를 먼저 저장해 둔다(서버가 이 펫을 쉬게 한다)
    if (petRef.current) { dirty.current = true; await flush(); }
    const seed = (crypto.getRandomValues(new Uint32Array(1))[0]) >>> 0;
    const egg = createEgg(name.trim(), now(), seed, { mode, species });
    const result = await store.adopt(egg);
    offsetRef.current = result.clockOffset;
    petRef.current = result.pet;
    petChangedRef.current?.(NO_SKIN); // 새 알은 스킨이 없다 — 앞 펫의 스킨을 물려받지 않는다
    if (result.pet) writeStoredString(seenKey(result.pet.id), String(result.pet.state.tick));
    seenRef.current = result.pet?.state.tick ?? -1;
    uiRef.current = { ...initialUi(now()), lastInput: now() };
    setStatus('ready');
    if (store.mode === 'server') await refreshPets().catch(() => undefined);
  }, [store, now, flush, refreshPets]);

  /**
   * 별이 된 펫 자리에 새 알(죽음 옵션 — 2026-10-19). 같은 자리를 새 알로 바꾼다 — 다른 펫은 그대로 쉰다.
   * 새 알은 죽음 옵션을 이어받는다(켠 사람이 고른 놀이 방식이다. 끄려면 도움말에서).
   */
  const rebirth = useCallback(async (name: string, mode?: PetMode, species?: Species) => {
    const pet = petRef.current;
    if (!pet?.state.dead) throw new Error('별이 된 펫이 없어요.');
    // 서버는 저장된 상태로 «별이 된 자리»를 판정한다 — 이 기기에서만 별이 된 상태를 먼저 저장한다
    while (saving.current) await new Promise((r) => window.setTimeout(r, 50));
    dirty.current = true;
    await flush();
    const seed = (crypto.getRandomValues(new Uint32Array(1))[0]) >>> 0;
    // 새 알의 종 — 고르지 않으면 별 가족(전파 가족은 알 표로만 — 서버가 거절한다)
    const sp = species ?? (speciesOf(pet.state) === 'signal' ? 'star' : speciesOf(pet.state));
    const egg = createEgg(name.trim(), now(), seed, { mode: mode ?? modeOf(pet.state), species: sp });
    const result = await store.rebirth(pet.id, egg);
    offsetRef.current = result.clockOffset;
    petRef.current = result.pet;
    petChangedRef.current?.(NO_SKIN); // 새 알은 스킨이 없다
    if (result.pet) writeStoredString(seenKey(result.pet.id), String(result.pet.state.tick));
    seenRef.current = result.pet?.state.tick ?? -1;
    uiRef.current = { ...initialUi(now()), lastInput: now() };
    sentCall.current = null;
    setStatus(result.pet ? 'ready' : 'needsEgg');
    if (store.mode === 'server') await refreshPets().catch(() => undefined);
    step();
  }, [store, now, flush, refreshPets]);

  /** 함께하는 펫이 바뀌었을 수 있는 동작 뒤(창고·유학·알 표) — 펫과 목록을 통째로 다시 읽는다 */
  const reloadAll = useCallback(async (skin: PetSkin = NO_SKIN) => {
    const before = petRef.current?.id ?? null;
    const r = await store.load();
    offsetRef.current = r.clockOffset;
    petRef.current = r.pet;
    setOthers(r.others ?? []);
    setSlots(r.slots ?? 1);
    setBoughtSlots(r.boughtSlots ?? 0);
    setNextSlotPrice(r.nextSlotPrice ?? null);
    setPrimaryCreatedAt(r.primaryCreatedAt ?? null);
    if ((r.pet?.id ?? null) !== before) {
      petChangedRef.current?.(skin);
      seenRef.current = -1; // 이 펫의 «본 사건»은 이 기기의 기억에서 다시 읽는다(switchTo 와 같다)
      uiRef.current = { ...initialUi(now()), lastInput: now() };
      sentCall.current = null;
    }
    setStatus(r.pet ? 'ready' : 'needsEgg');
    if (r.pet) step();
  }, [store, now]);

  /** 통신으로 받은 알 표를 깨운다(2026-10-26) — 칸이 있어야 한다. 알 받기처럼 함께하는 펫이 된다 */
  const hatchTicket = useCallback(async (ticketId: string, name: string, mode: PetMode = 'easy', species: Species = 'signal') => {
    if (!store.hatchTicket) throw new Error('체험 모드에서는 알을 깨울 수 없어요.');
    if (petRef.current) { dirty.current = true; await flush(); }
    const seed = (crypto.getRandomValues(new Uint32Array(1))[0]) >>> 0;
    const egg = createEgg(name.trim(), now(), seed, { mode, species });
    const result = await store.hatchTicket(ticketId, egg);
    if (result.pet) writeStoredString(seenKey(result.pet.id), String(result.pet.state.tick));
    await reloadAll(NO_SKIN);
  }, [store, now, flush, reloadAll]);

  /** 창고(2026-10-26) — 칸 → 창고(코인) · 창고 → 칸 · 유학(되돌릴 수 없다). 함께하는 펫이면 먼저 저장한다 */
  const storage = useCallback(async (action: 'store' | 'unstore' | 'abroad', petId: string) => {
    if (!store.storage) throw new Error('체험 모드에서는 창고를 쓸 수 없어요.');
    if (petRef.current?.id === petId) {
      while (saving.current) await new Promise((r) => window.setTimeout(r, 50));
      dirty.current = true;
      await flush();
    }
    const target = others.find((o) => o.id === petId);
    // 꺼낸 펫은 시계만 지금으로 옮겨 온다(쉬는 펫과 같다 — 창고에 있던 동안 시간이 멈춰 있었다)
    const r = await store.storage(action, petId, action === 'unstore' && target ? settleArrivedPet(restPetState(target.state, now()), scheduleRef.current) : undefined);
    await reloadAll(action === 'unstore' && target ? target.skin : NO_SKIN);
    return r;
  }, [store, others, flush, now, reloadAll]);

  /** 쉬던 펫과 함께하기 — 지금 펫은 쉬러 간다(시간이 멈춘다). 쉬던 펫은 시계만 지금으로 옮겨 온다. */
  const switchTo = useCallback(async (petId: string) => {
    const target = others.find((o) => o.id === petId);
    if (!target || !store.switchTo) return;
    if (petRef.current) { dirty.current = true; await flush(); }
    // 시계를 지금으로 옮기고 잠·깸을 지금 시각에 맞춘다(잘 시간에 데려오면 자고 있게 — 2026-11-06)
    const result = await store.switchTo(petId, settleArrivedPet(restPetState(target.state, now()), scheduleRef.current));
    offsetRef.current = result.clockOffset;
    petRef.current = result.pet;
    petChangedRef.current?.(target.skin); // 쉬던 펫은 자기 스킨을 간직하고 있다
    seenRef.current = -1; // 이 펫의 «본 사건»은 이 기기의 기억에서 다시 읽는다
    uiRef.current = { ...initialUi(now()), lastInput: now() };
    await refreshPets().catch(() => undefined);
    step();
  }, [others, store, flush, now, refreshPets]);

  // 불러온 뒤 한 번(시간표가 준비돼야 수업 칸을 안다) — 저장 없이 둘러보고 떠나도 부름이 맞춰진다
  useEffect(() => {
    if (status === 'ready' && scheduleReady) syncCall();
  }, [status, scheduleReady, syncCall]);

  /** 별이 된 순간을 알린다 — 왜 별이 됐는지(하드 = 개복치의 이유)를 함께 */
  const announceDeath = useCallback((petId: string, state: PetState, t: number) => {
    const tick = state.deadTick ?? state.tick;
    seenRef.current = Math.max(seenRef.current, tick);
    writeStoredString(seenKey(petId), String(seenRef.current));
    const cause = deathCauseOf(state.deathCause);
    const n = { text: `${state.name}${josa(state.name, '이', '가')} ${cause.phrase} 별이 되었어요. ${cause.tip}`, short: '…', at: t };
    noticeRef.current = n;
    setNotice(n);
    beep('cancel');
  }, [beep]);

  // ── 한 걸음: 따라잡기 · 사건 · 화면 ──
  const step = useCallback(() => {
    let pet = petRef.current;
    if (!pet || !scheduleReady) return;
    const t = now();
    // 스킨 효과는 상태에 적어 둔다 — 다음 접속의 따라잡기(스킨을 읽기 전에 돈다)도 지키게
    const wantNoPoop = noPoopRef.current;
    if (wantNoPoop !== null && !!pet.state.noPoop !== wantNoPoop) {
      const { noPoop: _old, ...rest } = pet.state;
      pet = { ...pet, state: wantNoPoop ? { ...rest, noPoop: true } : rest };
      petRef.current = pet;
      scheduleSave();
    }
    const advanced = advancePet(pet.state, t, scheduleRef.current);
    if (advanced !== pet.state) petRef.current = { ...pet, state: advanced };
    const state = petRef.current!.state;

    if (seenRef.current < 0) {
      const stored = Number(readStoredString(seenKey(pet.id)));
      seenRef.current = Number.isFinite(stored) && stored > 0 ? stored : state.tick;
    }
    const fresh = state.events.filter((e) => e.tick > seenRef.current && (e.kind === 'hatch' || e.kind === 'evolve'));
    // 별이 된 순간 — 한 번만 알린다(이 기기에서 본 사건 칸 뒤의 것만). 돌보다가 별이 된 것(하드)은 누른 자리에서 알렸다
    const death = state.dead ? state.events.find((e) => e.kind === 'death' && e.tick > seenRef.current) : undefined;
    if (death) {
      announceDeath(pet.id, state, t);
      scheduleSave(); // 시간이 흘러 별이 된 것(누르지 않고)도 서버에 남긴다 — 안 남기면 앨범이 모르고 새 알 받기가 거절된다
      setUiBoth({ ...uiRef.current, screen: { kind: 'main' }, cursor: null, lastInput: t });
    }
    if (fresh.length > 0 && uiRef.current.screen.kind !== 'anim' && !state.dead) {
      const last = fresh[fresh.length - 1];
      const order = ['egg', 'baby', 'child', 'teen', 'adult'] as const;
      const from = last.kind === 'hatch' ? 'egg' : order[Math.max(0, order.indexOf(last.stage ?? 'baby') - 1)];
      setUiBoth({ ...eventAnim(uiRef.current, last.kind as 'hatch' | 'evolve', from, t), lastInput: t });
      seenRef.current = last.tick;
      writeStoredString(seenKey(pet.id), String(last.tick));
      beep('happy');
    }

    // 어른이 되었는데 가지가 아직 없으면 — 그동안의 습관으로 정한다(한 번). 새 종은 종마다의 모습(species.ts chooseForm)
    const sp = speciesOf(state);
    if (state.stage === 'adult' && state.branch === undefined && sp !== 'star' && (sp !== 'signal' || tradePartnersRef.current !== null)) {
      const form = chooseForm(sp, { tradePartners: tradePartnersRef.current });
      petRef.current = { ...petRef.current!, state: { ...state, branch: form } };
      scheduleSave();
      if (form === 'courier') {
        if (uiRef.current.screen.kind !== 'anim') setUiBoth({ ...eventAnim(uiRef.current, 'evolve', 'teen', t), lastInput: t });
        const name = speciesStageName(sp, 'adult', form) ?? '';
        const n = { text: `친구들과 교환하며 «${name}»(으)로 자랐어요!`, short: `${name}!`, at: t };
        noticeRef.current = n;
        setNotice(n);
        beep('happy');
      }
    }
    if (state.stage === 'adult' && state.branch === undefined && sp === 'star' && lifetimeRef.current) {
      const branch = chooseBranch(lifetimeRef.current);
      petRef.current = { ...petRef.current!, state: { ...state, branch } };
      scheduleSave();
      if (branch !== 'basic') {
        if (uiRef.current.screen.kind !== 'anim') setUiBoth({ ...eventAnim(uiRef.current, 'evolve', 'teen', t), lastInput: t });
        const n = { text: `${BRANCH_INFO[branch].habit} «${BRANCH_INFO[branch].name}»(으)로 자랐어요!`, short: `${BRANCH_INFO[branch].name}!`, at: t };
        noticeRef.current = n;
        setNotice(n);
        beep('happy');
      }
    }
    const v = viewPet(petRef.current!.state, scheduleRef.current, t);
    if (v.attention && v.attention !== lastAttention.current) {
      if (document.visibilityState === 'visible') beep('alert');
      uiRef.current = { ...uiRef.current, lastInput: t }; // 부르면 화면이 켜진다(실물)
    }
    lastAttention.current = v.attention;

    const ticked = tickUi(uiRef.current, t);
    if (ticked.gameOver) {
      const action: PetAction = { type: 'game', ...ticked.gameOver };
      const result = applyAction(state, action, activityNow());
      if (!('reason' in result)) { petRef.current = { ...petRef.current!, state: result.state }; scheduleSave(); }
      setUiBoth(afterAction(ticked.ui, action, result, t, state));
      if (!('reason' in result) && result.detail === 'died') announceDeath(pet.id, result.state, t);
      else beep('reason' in result ? 'cancel' : result.detail === 'win' ? 'happy' : 'select');
    } else if (ticked.ui !== uiRef.current) {
      setUiBoth(ticked.ui);
    }

    const k = uiRef.current.screen.kind;
    if (k === 'messages' || k === 'detail') messagesRef.current.forEach((m) => seenMessages.current.add(m.id));
    const focusing = !!focusRef.current && focusRef.current > t - 60_000;
    const off = !focusing && backlightRef.current && k === 'main' && uiRef.current.cursor === null && t - uiRef.current.lastInput > SCREEN_OFF_MS;
    setScreenOff((prev) => (prev === off ? prev : off));
    const input: ScreenInput = {
      ui: uiRef.current, state: petRef.current!.state, view: v, now: t, messages: messagesRef.current,
      unread: messagesRef.current.some((m) => m.priority >= 50 && !seenMessages.current.has(m.id)),
      notice: noticeRef.current, screenOff: off, focusEndsAt: focusing ? focusRef.current : null,
      equipped: equippedRef.current,
    };
    lastInput.current = input;
    listeners.current.forEach((cb) => cb(input));
    setView((prev) => (prev && JSON.stringify(prev) === JSON.stringify(v) ? prev : v));
  }, [scheduleReady, now, activityNow, setUiBoth, scheduleSave, beep, announceDeath]);

  useEffect(() => {
    if (status !== 'ready') return;
    step();
    let timer = 0;
    const loop = () => {
      step();
      const fast = uiRef.current.screen.kind === 'anim' || uiRef.current.screen.kind === 'game';
      timer = window.setTimeout(loop, fast ? 90 : 240);
    };
    timer = window.setTimeout(loop, 90);
    return () => window.clearTimeout(timer);
  }, [status, step]);

  // ── 버튼 ──
  const press = useCallback((index: 0 | 1 | 2, long: boolean) => {
    const pet = petRef.current;
    if (!pet) return;
    buzz(long ? 22 : 10);
    const t = now();
    // 꺼진 화면은 첫 누름에 켜지기만 한다(실물 컬러 기종)
    if (backlightRef.current && uiRef.current.screen.kind === 'main' && uiRef.current.cursor === null
      && t - uiRef.current.lastInput > SCREEN_OFF_MS) {
      setUiBoth({ ...uiRef.current, lastInput: t });
      beep('tick');
      step();
      return;
    }
    const button: Button = (['A', 'B', 'C'] as const)[index];
    const state = advancePet(pet.state, t, scheduleRef.current);
    const msgs = messagesRef.current;
    const result = pressUi(uiRef.current, button, long, {
      stage: state.stage, lightsOn: state.lightsOn, messageCount: msgs.length, rand: Math.random(),
      messagePages: msgs.map((m) => pagesRef.current?.(m) ?? 1),
    }, t);
    if (result.sound !== 'none') beep(result.sound);
    let nextUi = result.ui;
    const intent = result.intent;
    if (intent?.type === 'action') {
      const outcome = applyAction(state, intent.action, activityNow());
      // 이 저장소는 strictNullChecks 가 꺼져 있어 `ok` 로는 좁혀지지 않는다 → `in` 으로 가른다
      if (!('reason' in outcome)) {
        petRef.current = { ...pet, state: outcome.state };
        scheduleSave();
        caredRef.current?.(intent.action);
        if (outcome.detail === 'died') announceDeath(pet.id, outcome.state, t);
        else if (intent.action.type === 'walk') {
          const n = { text: `${pet.state.name}${josa(pet.state.name, '과', '와')} 산책했어요. 기분이 좋아졌어요!`, short: '상쾌해!', at: t };
          noticeRef.current = n; setNotice(n);
        }
      } else if (intent.action.type === 'walk' && outcome.reason === 'walked') {
        const n = { text: `방금 산책했어요. 약 ${walkWaitMinutes(state)}분 뒤에 또 갈 수 있어요.`, short: REFUSE_SHORT.walked, at: t };
        noticeRef.current = n; setNotice(n);
      } else if (intent.action.type !== 'pat' || outcome.reason !== 'tooSoon') {
        showNotice(outcome.reason);
      }
      nextUi = afterAction(result.ui, intent.action, outcome, t, state);
    } else if (intent?.type === 'startGame') {
      const blocked = careBlock(state, activityNow()) ?? (state.sick ? 'sick' : null);
      if (blocked) showNotice(blocked);
      nextUi = startGame(result.ui, !!blocked, t, intent.game, Math.random());
    }
    setUiBoth(nextUi);
    step();
  }, [now, activityNow, beep, scheduleSave, setUiBoth, showNotice, step, announceDeath]);

  /**
   * 코인을 받았다는 소식 — 펫이 기뻐한다(하트 반 칸 × 건수). 수업·잠 중에는 애니메이션 없이 하트만 오른다.
   * 알은 아직 소식을 못 알아듣는다(거절되면 아무 일도 없다).
   */
  const cheer = useCallback((count: number, short: string, text: string) => {
    const pet = petRef.current;
    if (!pet || count <= 0) return false;
    const t = now();
    const state = advancePet(pet.state, t, scheduleRef.current);
    const action: PetAction = { type: 'cheer', count };
    const outcome = applyAction(state, action, activityNow());
    if ('reason' in outcome) return false;
    petRef.current = { ...pet, state: outcome.state };
    scheduleSave();
    // 방금 한 말(일기 대답 등)이 아직 떠 있으면 지우지 않고 뒤에 붙인다
    const prev = noticeRef.current;
    const n = prev && t - prev.at < 3000 ? { text: `${prev.text} · ${text}`, short: prev.short, at: prev.at } : { text, short, at: t };
    noticeRef.current = n;
    setNotice(n);
    const quiet = uiRef.current.screen.kind !== 'main' || state.asleep || activityNow() === 'class';
    setUiBoth(quiet ? { ...uiRef.current, lastInput: t } : { ...afterAction(uiRef.current, action, outcome, t, state), lastInput: t });
    beep('happy');
    step();
    return true;
  }, [now, activityNow, scheduleSave, setUiBoth, beep, step]);

  /** 펫이 한마디 한다(상태는 그대로) — 일기에 대한 대답처럼. 행복은 코인 소식(cheer)만 올린다(일기를 여러 번 써서 올리지 못하게). */
  const say = useCallback((short: string, text: string) => {
    const t = now();
    const n = { text, short, at: t };
    noticeRef.current = n;
    setNotice(n);
    uiRef.current = { ...uiRef.current, lastInput: t };
    step();
  }, [now, step]);

  /**
   * 조금 아쉬워한다(2026-10-15 집중 권하기의 [나중에]) — 시무룩한 얼굴로 고개를 젓고 한마디. 상태 수치는 그대로다
   * (권하기는 선택권이라 거절에 벌을 주지 않는다 — 사용자 결정 «살짝 아쉬워함»). 수업·잠·다른 화면이면 말만 한다.
   */
  const sulk = useCallback((short: string, text: string) => {
    const t = now();
    const n = { text, short, at: t };
    noticeRef.current = n;
    setNotice(n);
    const pet = petRef.current;
    const calm = !pet || uiRef.current.screen.kind !== 'main' || pet.state.asleep || activityNow() === 'class';
    setUiBoth(calm ? { ...uiRef.current, lastInput: t } : { ...uiRef.current, screen: { kind: 'anim', anim: 'refuse', at: t }, lastInput: t });
    step();
  }, [now, activityNow, setUiBoth, step]);

  const subscribe = useCallback((cb: (input: ScreenInput) => void) => {
    listeners.current.add(cb);
    if (lastInput.current) cb(lastInput.current);
    return () => { listeners.current.delete(cb); };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(id);
  }, [notice]);

  return useMemo(() => ({
    status, error, view, ui, notice: notice?.text ?? null, saveError, screenOff,
    name: petRef.current?.state.name ?? '',
    mode: store.mode,
    petId: petRef.current?.id ?? null,
    adopt, press, subscribe, cheer, say, sulk, rebirth, hatchTicket, storage, reloadAll,
    others, slots, primaryCreatedAt, switchTo, boughtSlots, nextSlotPrice, buySlot,
  }), [status, error, view, ui, notice, saveError, screenOff, store.mode, adopt, press, subscribe, cheer, say, sulk, rebirth, hatchTicket, storage, reloadAll, others, slots, primaryCreatedAt, switchTo, boughtSlots, nextSlotPrice, buySlot]);
}

export type TamagotchiController = ReturnType<typeof useTamagotchi>;
