/**
 * 펫 집(Phase 6) — 내 펫들 · 펫 앨범 · 도감. three 를 쓰지 않는다.
 *
 * 내 펫들: 지금 함께하는 펫 하나 + 쉬는 펫(시간이 멈춰 있다). 자리는 기본 1, 어른이 되고 30일 함께한 펫마다 +1(최대 3).
 * 별이 된 펫: 따로 탭에 남고 **자리를 차지하지 않는다**(2026-10-25 사용자 결정 — 서버 tama_pet_adopt 가 같은 규칙).
 *   알림·말풍선·부름은 지금 함께하는 펫 하나만 한다(계획 §8 — 펫 수만큼 알림을 늘리지 않는다).
 * 앨범: 서버가 저장 때마다 쌓은 사건(맞이·부화·진화·가지·병·회복·받은 캐릭터) — 상태 JSON 의 사건은 16개뿐이라 여기가 기록이다.
 * 도감: 앨범에서 만난 모습(단계·가지)을 모아 보여 준다. 아직 못 만난 모습은 실루엣.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SHOP_KEY } from '../hooks/useShop';
import { CREDIT_KEY } from '../hooks/useCredit';
import { Archive, Check, Egg, Home, Image as ImageIcon, BookOpen, MoreHorizontal, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { ModePicker, TamaDialog, modeConfirm } from './AppChrome';
import type { PetMode } from '../model/petModes';
import type { TamagotchiController } from '../hooks/useTamagotchi';
import { usePetSkinFrames, type CharacterController } from '../hooks/useSocial';
import type { PetSkin } from '../services/petService';
import { STAGE_LABEL, type Stage } from '../model/petModel';
import { BRANCH_INFO } from '../model/branch';
import { SPECIES_INFO, lookName, lookOf, speciesOf, type LookKey, type Species } from '../model/species';
import type { SpeciesData } from '../model/link';
import { SPECIES_KEY } from '../hooks/useSpecies';
import { PetThumb, SpeciesPicker } from './SpeciesPicker';
import { josa } from '../model/messages';
import { nextSlotHint } from '../model/petSlots';
import { DEX, NEW_SPECIES, albumLine, dexSeen, speciesDex, speciesDexSeen, type AlbumEntry } from '../model/album';
import { baseCharacterSprite, characterSprite, skinnedSprite, type CustomPose } from '../color/characters';
import { useCustomVersion } from '../hooks/useCustomVersion';
import { PixelBuf } from '../color/pixel';
import type { DeviceStyle } from '../three/dims';

export const ALBUM_KEY = ['tama-album'] as const;
export const MEMORIAL_KEY = ['tama-memorial'] as const;

/** 떠난 펫의 기념 기록(2026-11-05 — 별이 된 뒤 그 자리에 새 알을 받은 펫 · 유학 간 펫). 서버 tama_memorial_read */
export interface MemorialPet {
  id: number; pet_id: string; name: string; stage: string; branch?: string | null; species?: string | null;
  abroad: boolean; skin_order_id?: string | null; skin_item_id?: string | null; died_at: string;
}
async function fetchMemorials(): Promise<MemorialPet[]> {
  const { data, error } = await supabase.rpc('tama_memorial_read' as never);
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? (data as unknown as MemorialPet[]) : [];
}
const shortDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : '');

export async function fetchAlbum(): Promise<AlbumEntry[]> {
  const { data, error } = await supabase.from('tama_album' as never).select('id, pet_id, pet_name, kind, stage, branch, note, at, species').order('at', { ascending: false }).limit(300);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AlbumEntry[];
}

/**
 * @param skinned 함께하는 펫이면 true — 입힌 캐릭터 스킨을 그대로(어른만 — characterSprite 의 규칙, 2026-10-13 사용자 지시
 *   «펫 집에서 캐릭터 스킨이 적용된 캐릭터는 해당 스킨으로»). 도감·앨범은 원래 모습(false).
 * @param frames 쉬는 펫의 스킨 그림(2026-10-14 — 스킨은 펫마다). 주면 skinned 대신 이것으로 그린다.
 */
function SpriteCanvas({ stage, branch, silhouette = false, size = 64, skinned = false, frames }: { stage: Stage; branch?: LookKey; silhouette?: boolean; size?: number; skinned?: boolean; frames?: Record<CustomPose, PixelBuf> | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const version = useCustomVersion(); // 스킨 그림이 나중에 오면 다시 그린다
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const src = frames !== undefined ? skinnedSprite(frames, stage, 'idle0', false, branch)
      : skinned ? characterSprite(stage, 'idle0', false, branch) : baseCharacterSprite(stage, 'idle0', false, branch);
    const buf = new PixelBuf(src.w, src.h);
    buf.data.set(src.data);
    if (silhouette) for (let i = 0; i < buf.data.length; i += 4) if (buf.data[i + 3]) { buf.data[i] = 70; buf.data[i + 1] = 55; buf.data[i + 2] = 110; }
    const tmp = document.createElement('canvas');
    tmp.width = buf.w; tmp.height = buf.h;
    tmp.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(buf.data), buf.w, buf.h), 0, 0);
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, c.width, c.height);
    // 배율은 그 펫의 «어른 그림» 기준(2026-11-05 — 그림마다 칸을 채우면 작은 아기·어린이가 어른만큼 커 보였다).
    // 단계가 달라도 같은 배율이라 방에서처럼 아기는 작고 어른은 크다. 발이 같은 줄에 서게 아래에 맞춘다.
    const adultRef = stage === 'adult' ? src : baseCharacterSprite('adult', 'idle0', false, branch);
    const rw = Math.max(adultRef.w, buf.w), rh = Math.max(adultRef.h, buf.h);
    const k = Math.max(1, Math.floor(Math.min(c.width / rw, c.height / rh)));
    const bottom = (c.height + rh * k) / 2;
    g.drawImage(tmp, Math.round((c.width - buf.w * k) / 2), Math.round(bottom - buf.h * k), buf.w * k, buf.h * k);
  }, [stage, branch, silhouette, skinned, frames, version]);
  return <canvas ref={ref} width={size} height={size} aria-hidden="true" className="[image-rendering:pixelated]" style={{ width: size, height: size }} />;
}

/** 쉬는 펫 — 그 펫이 입은 스킨으로(함께하는 펫의 스킨이 아니다 — 2026-10-14) */
function RestingSprite({ stage, branch, skin, orders }: { stage: Stage; branch?: LookKey; skin: PetSkin; orders: { id: string; image_path?: string | null }[] | undefined }) {
  const frames = usePetSkinFrames(skin, orders);
  return <SpriteCanvas stage={stage} branch={branch} frames={frames} />;
}

const asStage = (s: string | undefined | null): Stage => (s && s in STAGE_LABEL ? (s as Stage) : 'egg');

export type HouseTab = 'pets' | 'storage' | 'stars' | 'album' | 'dex';

export function PetHouseDialog({ open, onOpenChange, style, pet, characters, serverMode, species, initialTab }: {
  open: boolean; onOpenChange: (o: boolean) => void; style: DeviceStyle; pet: TamagotchiController; characters: CharacterController; serverMode: boolean;
  /** 새 종 · 창고 · 알 표(2026-10-26 — 서버 tama_species_read) */
  species?: SpeciesData;
  /** 열 때의 탭(통신으로 알을 받으면 «창고») */
  initialTab?: HouseTab;
}) {
  const [tab, setTab] = useState<HouseTab>('pets');
  useEffect(() => { if (open) setTab(initialTab ?? 'pets'); }, [open, initialTab]);
  const [mode, setMode] = useState<PetMode>('easy');
  const [eggSpecies, setEggSpecies] = useState<Species>('star');
  const [more, setMore] = useState<string | null>(null);
  const [ticketName, setTicketName] = useState('');
  const [ticketMode, setTicketMode] = useState<PetMode>('easy');
  const album = useQuery({ queryKey: ALBUM_KEY, enabled: open && serverMode, queryFn: fetchAlbum, staleTime: 10_000 });
  const memorials = useQuery({ queryKey: MEMORIAL_KEY, enabled: open && serverMode, queryFn: fetchMemorials, staleTime: 10_000 });
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const now = Date.now();
  const current = pet.view && pet.status === 'ready'
    ? { id: pet.petId!, name: pet.name, stage: pet.view.stage, branch: pet.view.branch, species: pet.view.species, look: pet.view.look, createdAt: pet.primaryCreatedAt ?? new Date(now).toISOString(), dead: pet.view.dead }
    : null;
  const all = useMemo(() => [
    ...(current ? [{ stage: current.stage, createdAt: current.createdAt }] : []),
    ...pet.others.map((o) => ({ stage: o.state.stage, createdAt: o.createdAt })),
  ], [current, pet.others]);
  // 별이 된 펫 · 창고의 펫은 자리를 차지하지 않는다 — 얻은 자리 계산(all)에는 든다
  const storedPets = pet.others.filter((o) => o.storedAt);
  const alivePets = pet.others.filter((o) => !o.state.dead && !o.storedAt);
  const deadPets = pet.others.filter((o) => o.state.dead && !o.storedAt);
  const tickets = species?.tickets ?? [];
  const storageUsed = species?.storage.used ?? storedPets.length + tickets.length;
  const storageSize = species?.storage.size ?? 6;
  const movePrice = species?.storage.movePrice ?? 10;
  const occupied = (current && !current.dead ? 1 : 0) + alivePets.length;
  // 떠난 펫 = 칸에 남은 별 펫 + 기념 기록(그 자리에 새 알을 받았거나 유학을 간 펫 — 칸의 별 펫은 아직 기록 전이라 겹치지 않는다)
  const departed = memorials.data ?? [];
  const starCount = (current?.dead ? 1 : 0) + deadPets.length + departed.length;
  const canAdopt = serverMode && occupied < pet.slots;
  const qc = useQueryClient();
  const hint = nextSlotHint(all, now, pet.boughtSlots, occupied);
  const buySlot = async () => {
    if (pet.nextSlotPrice == null) return;
    if (!window.confirm(`펫 자리를 하나 더 살까요? ${pet.nextSlotPrice}코인이에요. 산 자리는 계속 남아요.`)) return;
    setBusy('slot');
    try {
      const r = await pet.buySlot();
      void qc.invalidateQueries({ queryKey: SHOP_KEY });
      void qc.invalidateQueries({ queryKey: CREDIT_KEY });
      toast.success(`펫 자리가 ${r.slots}개가 됐어요`);
    } catch (e) { toast.error(e instanceof Error ? e.message : '펫 자리를 사지 못했어요.'); } finally { setBusy(null); }
  };
  const seen = useMemo(() => dexSeen(album.data ?? []), [album.data]);
  const delivered = (characters.mine.data?.orders ?? []).filter((o) => o.status === 'delivered');
  const isClassic = style === 'classic';
  const chip = (on: boolean) => cn('flex h-10 items-center gap-1.5 rounded-full px-4 text-[13px]', on ? (isClassic ? 'bg-white/90 text-indigo-950' : 'bg-violet-600 text-white') : isClassic ? 'bg-white/10' : 'bg-white/60');

  const switchTo = async (id: string, label: string) => {
    setBusy(id);
    try { await pet.switchTo(id); toast.success(`${label}와(과) 다시 함께해요 — 쉬는 동안 시간이 멈춰 있었어요`); } catch (e) { toast.error(e instanceof Error ? e.message : '데려오지 못했어요.'); } finally { setBusy(null); }
  };
  const adopt = async () => {
    if (!window.confirm(`«${name.trim()}»의 알을 받을까요? 지금 함께하는 ${pet.name}은(는) 펫 집에서 쉬어요(시간이 멈춰요).`)) return;
    if (mode !== 'easy' && !window.confirm(modeConfirm(mode))) return;
    setBusy('new');
    try { await pet.adopt(name, mode, eggSpecies); setName(''); setMode('easy'); setEggSpecies('star'); toast.success('새 알을 받았어요!'); onOpenChange(false); } catch (e) { toast.error(e instanceof Error ? e.message : '알을 받지 못했어요.'); } finally { setBusy(null); }
  };
  const refreshAfterStorage = () => {
    void qc.invalidateQueries({ queryKey: SPECIES_KEY });
    void qc.invalidateQueries({ queryKey: ALBUM_KEY });
    void qc.invalidateQueries({ queryKey: MEMORIAL_KEY }); // 유학 간 펫이 «별이 된 펫·유학»에 바로 보이게
    void qc.invalidateQueries({ queryKey: SHOP_KEY });
    void qc.invalidateQueries({ queryKey: CREDIT_KEY });
  };
  /** 창고(2026-10-26) — 칸 → 창고(코인) · 창고 → 칸 · 유학(되돌릴 수 없다 — 확인창) */
  const storageAct = async (action: 'store' | 'unstore' | 'abroad', id: string, label: string) => {
    if (action === 'store' && !window.confirm(`${label}을(를) 창고에 둘까요? ${movePrice ? `${movePrice}코인이에요. ` : ''}창고에서는 시간이 멈추고, 꺼낼 때는 무료예요.`)) return;
    if (action === 'abroad' && !window.confirm(`${label}을(를) 다른 별로 유학 보낼까요?\n\n유학을 떠난 펫은 돌아오지 않아요(되돌릴 수 없어요). 앨범과 순위에는 기록이 남아요.`)) return;
    setBusy(`${action}:${id}`);
    try {
      await pet.storage(action, id);
      refreshAfterStorage();
      setMore(null);
      toast.success(action === 'store' ? `${label}은(는) 창고에서 쉬어요` : action === 'unstore' ? `${label}을(를) 칸으로 꺼냈어요` : `${label}이(가) 유학을 떠났어요`);
    } catch (e) { toast.error(e instanceof Error ? e.message : '처리하지 못했어요.'); } finally { setBusy(null); }
  };
  const hatchTicket = async (ticketId: string) => {
    if (ticketMode !== 'easy' && !window.confirm(modeConfirm(ticketMode))) return;
    setBusy(`ticket:${ticketId}`);
    try {
      await pet.hatchTicket(ticketId, ticketName, ticketMode);
      refreshAfterStorage();
      setTicketName(''); setTicketMode('easy');
      toast.success('전파 가족 알이 칸에 놓였어요!');
      onOpenChange(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : '알을 깨우지 못했어요.'); } finally { setBusy(null); }
  };
  /** 펫 줄 «더보기» — 창고로 · 유학 */
  const moreRow = (id: string, label: string, canStore: boolean) => more === id && (
    <div className="mt-1 flex flex-wrap gap-1.5 rounded-2xl bg-white/40 p-2" data-pet-more={id}>
      {canStore && (
        <button type="button" disabled={!!busy || storageUsed >= storageSize} onClick={() => void storageAct('store', id, label)}
          className="h-11 rounded-full bg-violet-600 px-3 text-[12px] font-bold text-white disabled:opacity-50">
          창고로 보내기{movePrice ? ` · ${movePrice}코인` : ''}
        </button>
      )}
      <button type="button" disabled={!!busy} onClick={() => void storageAct('abroad', id, label)}
        className="h-11 rounded-full bg-rose-500 px-3 text-[12px] font-bold text-white disabled:opacity-50">다른 별로 유학 보내기</button>
      {canStore && storageUsed >= storageSize && <p className="w-full text-[11px] opacity-75">창고가 가득 찼어요({storageUsed}/{storageSize}).</p>}
    </div>
  );
  const moreButton = (id: string) => (
    <button type="button" aria-label="더보기" aria-expanded={more === id} onClick={() => setMore(more === id ? null : id)}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-white/40"><MoreHorizontal className="h-5 w-5" aria-hidden="true" /></button>
  );

  return (
    <TamaDialog open={open} onOpenChange={onOpenChange} style={style} title="펫 집" description="내 펫들 · 앨범 · 도감" testId="pethouse">
      <div role="tablist" className="mt-3 flex flex-wrap gap-1.5">
        <button type="button" role="tab" aria-selected={tab === 'pets'} onClick={() => setTab('pets')} className={chip(tab === 'pets')}><Home className="h-4 w-4" aria-hidden="true" /> 내 펫들</button>
        {starCount > 0 && (
          <button type="button" role="tab" aria-selected={tab === 'stars'} onClick={() => setTab('stars')} className={chip(tab === 'stars')}><Star className="h-4 w-4" aria-hidden="true" /> 별이 된 펫·유학 {starCount}</button>
        )}
        {serverMode && (
          <button type="button" role="tab" aria-selected={tab === 'storage'} onClick={() => setTab('storage')} className={cn(chip(tab === 'storage'), 'relative')} data-pethouse-tab="storage">
            <Archive className="h-4 w-4" aria-hidden="true" /> 창고 {storageUsed}/{storageSize}
            {tickets.length > 0 && <span className="ml-1 rounded-full bg-pink-500 px-1.5 text-[11px] font-bold text-white" aria-label={`깨울 알 ${tickets.length}개`}>알 {tickets.length}</span>}
          </button>
        )}
        <button type="button" role="tab" aria-selected={tab === 'album'} onClick={() => setTab('album')} className={chip(tab === 'album')}><ImageIcon className="h-4 w-4" aria-hidden="true" /> 앨범</button>
        <button type="button" role="tab" aria-selected={tab === 'dex'} onClick={() => setTab('dex')} className={chip(tab === 'dex')}><BookOpen className="h-4 w-4" aria-hidden="true" /> 도감</button>
      </div>

      {!serverMode ? (
        <p className="mt-3 rounded-2xl bg-white/40 px-4 py-3 text-[13px]">체험 모드에서는 펫이 하나뿐이고 앨범이 남지 않아요.</p>
      ) : tab === 'pets' ? (
        <div className="mt-3 space-y-2" data-pethouse="pets">
          <p className="text-[12px] opacity-80">펫 자리 {pet.slots}개{pet.boughtSlots ? `(산 자리 ${pet.boughtSlots})` : ''} · 지금 {occupied}마리. 알림과 부름은 함께하는 펫 하나만 해요.{starCount > 0 ? ' 별이 된 펫은 자리를 차지하지 않아요.' : ''}</p>
          {current?.dead && (
            <p className="rounded-2xl bg-white/40 px-3 py-2 text-[12px]">{current.name}은(는) 별이 됐어요 — «별이 된 펫»에 남아 있어요. 새 알을 받으면 그 알과 함께해요.</p>
          )}
          {current && !current.dead && (
            <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-white/70 p-2 ring-2 ring-violet-400">
              <SpriteCanvas stage={current.stage} branch={current.look} silhouette={current.dead} skinned />
              <span className="min-w-0 flex-1 text-[13px]">
                <b className="block truncate">{current.name}</b>
                <span className="text-[11px] opacity-75">{current.dead ? '별이 됐어요 · 기기 옆 카드에서 이 자리에 새 알' : <>{STAGE_LABEL[current.stage]}{lookName(current.species, current.stage, current.branch) ? ` · ${lookName(current.species, current.stage, current.branch)}` : ''}</>}</span>
              </span>
              {/* 상태 표시 — «함께하기» 버튼과 같은 크기에 버튼이 아닌 모양(2026-11-05 — 같은 보라 작은 알약이라 작은 버튼처럼 보였다) */}
              <span className="flex h-10 min-w-[5.5rem] shrink-0 items-center justify-center gap-1 rounded-full bg-violet-100 px-3 text-[12px] font-bold text-violet-700 ring-1 ring-inset ring-violet-300" data-pet-current>
                <Check className="h-3.5 w-3.5" aria-hidden="true" />함께하는 중
              </span>
              {moreButton(current.id)}
            </div>
          )}
          {current && !current.dead && moreRow(current.id, current.name, true)}
          {alivePets.map((o) => (
            <div key={o.id}>
            <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-white/50 p-2" data-resting-pet={o.id}>
              <RestingSprite stage={asStage(o.state.stage)} branch={lookOf(speciesOf(o.state), o.state.branch)} skin={o.skin} orders={characters.mine.data?.orders} />
              <span className="min-w-0 flex-1 text-[13px]">
                <b className="block truncate">{o.name}</b>
                <span className="text-[11px] opacity-75">{STAGE_LABEL[asStage(o.state.stage)]} · 쉬는 중{o.restedAt ? `(${new Date(o.restedAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}부터)` : ''}</span>
              </span>
              <button type="button" disabled={!!busy} onClick={() => void switchTo(o.id, o.name)}
                className="h-10 min-w-[5.5rem] shrink-0 rounded-full bg-violet-600 px-3 text-[12px] font-bold text-white disabled:opacity-50">
                {busy === o.id ? '데려오는 중…' : '함께하기'}
              </button>
              {moreButton(o.id)}
            </div>
            {moreRow(o.id, o.name, true)}
            </div>
          ))}
          {canAdopt ? (
            <div className="rounded-2xl bg-white/60 p-3" data-pethouse-adopt>
              <p className="flex items-center gap-1.5 text-[13px] font-bold"><Egg className="h-4 w-4" aria-hidden="true" /> 빈 자리가 있어요 — 새 알 받기</p>
              <div className="mt-2 flex gap-2">
                <input value={name} maxLength={8} onChange={(e) => setName(e.target.value)} placeholder="이름 (1~8글자)" aria-label="새 펫 이름"
                  className="h-11 min-w-0 flex-1 rounded-xl bg-white/90 px-3 text-[16px] text-violet-950" />
                <button type="button" disabled={!name.trim() || !!busy} onClick={() => void adopt()}
                  className="h-11 shrink-0 rounded-full bg-pink-500 px-4 text-[13px] font-bold text-white disabled:opacity-50">받기</button>
              </div>
              {species && <SpeciesPicker value={eggSpecies} onChange={setEggSpecies} unlocked={species.unlocked} classic={isClassic} className="mt-2" />}
              <ModePicker value={mode} onChange={setMode} classic={isClassic} className="mt-2" />
              <p className="mt-1 text-[11px] opacity-70">새 알이 함께하는 펫이 되고, 지금 펫은 쉬어요(시간이 멈춰 배고파지지 않아요). 모드는 이 알에만, 받은 뒤로는 바꿀 수 없어요.</p>
            </div>
          ) : hint ? (
            <p className="rounded-2xl bg-white/40 px-3 py-2 text-[12px]">{hint}</p>
          ) : null}
          {/* 펫 자리 사기(2026-10-13) — 얻는 자리(최대 3)와 따로, 코인으로 최대 3개 */}
          {pet.nextSlotPrice != null && (
            <div className="flex min-w-0 items-center gap-2 rounded-2xl bg-amber-50/80 p-3 text-amber-950 ring-1 ring-amber-200" data-pethouse-buy-slot>
              <span className="min-w-0 flex-1 text-[12px]">
                <b className="block text-[13px]">펫 자리 하나 더</b>
                코인으로 자리를 늘려요(살 때마다 값이 올라요 · 최대 3개 더)
              </span>
              <button type="button" disabled={!!busy} onClick={() => void buySlot()}
                className="h-11 shrink-0 rounded-full bg-amber-400 px-4 text-[13px] font-black text-amber-950 shadow disabled:opacity-50">
                {busy === 'slot' ? '사는 중…' : `${pet.nextSlotPrice}코인`}
              </button>
            </div>
          )}
        </div>
      ) : tab === 'storage' ? (
        <div className="mt-3 max-h-[55vh] space-y-2 overflow-y-auto pr-1" data-pethouse="storage">
          <p className="text-[12px] opacity-80">창고 {storageUsed}/{storageSize} — 창고의 펫은 자리를 차지하지 않고 시간이 멈춰요. 칸으로 꺼내기는 무료예요.</p>
          {tickets.map((t) => (
            <div key={t.id} className="rounded-2xl bg-white/60 p-3" data-ticket={t.id}>
              <div className="flex min-w-0 items-center gap-3">
                <PetThumb stage="egg" look={lookOf(t.species)} size={48} />
                <span className="min-w-0 flex-1 text-[13px]">
                  <b className="block">{SPECIES_INFO[t.species].family} 알</b>
                  <span className="block text-[11px] opacity-75">{t.partner ? `${t.partner}${josa(t.partner, '과', '와')} 처음 통신해서 받았어요` : '통신으로 받은 알'}</span>
                </span>
              </div>
              {canAdopt ? (
                <>
                  <div className="mt-2 flex gap-2">
                    <input value={ticketName} maxLength={8} onChange={(e) => setTicketName(e.target.value)} placeholder="이름 (1~8글자)" aria-label="깨울 알의 이름"
                      className="h-11 min-w-0 flex-1 rounded-xl bg-white/90 px-3 text-[16px] text-violet-950" />
                    <button type="button" disabled={!ticketName.trim() || !!busy} onClick={() => void hatchTicket(t.id)} data-ticket-hatch={t.id}
                      className="h-11 shrink-0 rounded-full bg-pink-500 px-4 text-[13px] font-bold text-white disabled:opacity-50">
                      {busy === `ticket:${t.id}` ? '깨우는 중…' : '칸에 두기'}
                    </button>
                  </div>
                  <ModePicker value={ticketMode} onChange={setTicketMode} classic={isClassic} className="mt-2" />
                </>
              ) : (
                <p className="mt-2 text-[12px] opacity-80">빈 칸이 없어요 — 칸의 펫을 창고로 보내거나 다른 별로 유학을 보내면 이 알을 칸에 둘 수 있어요.</p>
              )}
            </div>
          ))}
          {storedPets.map((o) => (
            <div key={o.id}>
              <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-white/50 p-2" data-stored-pet={o.id}>
                <RestingSprite stage={asStage(o.state.stage)} branch={lookOf(speciesOf(o.state), o.state.branch)} skin={o.skin} orders={characters.mine.data?.orders} />
                <span className="min-w-0 flex-1 text-[13px]">
                  <b className="block truncate">{o.name}</b>
                  <span className="text-[11px] opacity-75">{STAGE_LABEL[asStage(o.state.stage)]} · 창고{o.storedAt ? `(${new Date(o.storedAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}부터)` : ''}</span>
                </span>
                <button type="button" disabled={!!busy || !canAdopt} onClick={() => void storageAct('unstore', o.id, o.name)}
                  className="h-11 shrink-0 rounded-full bg-violet-600 px-3 text-[12px] font-bold text-white disabled:opacity-50">
                  {busy === `unstore:${o.id}` ? '꺼내는 중…' : '칸으로'}
                </button>
                {moreButton(o.id)}
              </div>
              {moreRow(o.id, o.name, false)}
            </div>
          ))}
          {tickets.length === 0 && storedPets.length === 0 && (
            <p className="rounded-2xl bg-white/40 px-3 py-2 text-[12px]">창고가 비어 있어요. 친구와 처음 통신하면 전파 가족 알이 여기 들어와요.</p>
          )}
          {!canAdopt && storedPets.length > 0 && <p className="text-[11px] opacity-75">칸이 가득 차서 꺼낼 수 없어요({occupied}/{pet.slots}).</p>}
        </div>
      ) : tab === 'stars' ? (
        <div className="mt-3 max-h-[55vh] space-y-2 overflow-y-auto pr-1" data-pethouse="stars">
          <p className="text-[12px] opacity-80">함께했던 펫들이에요 — 별이 된 펫과 다른 별로 유학 간 펫. 펫 자리를 차지하지 않고, 앨범에 그동안의 기록이 남아 있어요.</p>
          {current?.dead && (
            <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-white/50 p-2" data-star-pet={current.id}>
              <SpriteCanvas stage={current.stage} branch={current.look} skinned />
              <span className="min-w-0 flex-1 text-[13px]">
                <b className="block truncate">{current.name}</b>
                <span className="text-[11px] opacity-75">별이 됐어요 · 기기 옆 카드에서 이 자리에 새 알을 받을 수도 있어요</span>
              </span>
            </div>
          )}
          {deadPets.map((o) => (
            <div key={o.id} className="flex min-w-0 items-center gap-3 rounded-2xl bg-white/50 p-2" data-star-pet={o.id}>
              <RestingSprite stage={asStage(o.state.stage)} branch={lookOf(speciesOf(o.state), o.state.branch)} skin={o.skin} orders={characters.mine.data?.orders} />
              <span className="min-w-0 flex-1 text-[13px]">
                <b className="block truncate">{o.name}</b>
                <span className="text-[11px] opacity-75">⭐ {STAGE_LABEL[asStage(o.state.stage)]}에 별이 됐어요{o.restedAt ? ` · ${shortDate(o.restedAt)}` : ''}</span>
              </span>
            </div>
          ))}
          {departed.map((m) => (
            <div key={`m${m.id}`} className="flex min-w-0 items-center gap-3 rounded-2xl bg-white/50 p-2" data-star-pet={m.pet_id} data-memorial={m.abroad ? 'abroad' : 'star'}>
              <RestingSprite stage={asStage(m.stage)} branch={lookOf(speciesOf(m), (m.branch ?? null) as never)}
                skin={{ orderId: m.skin_order_id ?? null, itemId: m.skin_item_id ?? null }} orders={characters.mine.data?.orders} />
              <span className="min-w-0 flex-1 text-[13px]">
                <b className="block truncate">{m.name}</b>
                <span className="text-[11px] opacity-75">
                  {m.abroad ? `✈️ ${STAGE_LABEL[asStage(m.stage)]}에 다른 별로 유학을 떠났어요` : `⭐ ${STAGE_LABEL[asStage(m.stage)]}에 별이 됐어요`} · {shortDate(m.died_at)}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : tab === 'album' ? (
        <div className="mt-3 max-h-[55vh] overflow-y-auto pr-1" data-pethouse="album">
          {album.isPending ? <p className="text-[13px] opacity-75">불러오는 중…</p> : (album.data ?? []).length === 0 ? (
            <p className="rounded-2xl bg-white/40 px-4 py-3 text-[13px]">아직 기록이 없어요. 펫이 자라면 여기에 쌓여요.</p>
          ) : (
            <ol className="space-y-1.5">
              {(album.data ?? []).map((e) => (
                <li key={e.id} className="flex min-w-0 items-center gap-2 rounded-xl bg-white/55 px-3 py-2 text-[13px]">
                  <span className="w-14 shrink-0 text-[11px] tabular-nums opacity-70">{new Date(e.at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</span>
                  <span className="min-w-0 flex-1 truncate" title={albumLine(e)}>{albumLine(e)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : (
        <div className="mt-3 max-h-[55vh] overflow-y-auto pr-1" data-pethouse="dex">
          <p className="text-[12px] opacity-80">만난 모습 {DEX.filter((d) => seen.has(d.key)).length}/{DEX.length} — 습관이 어른의 모습을 정해요(계획·돌아보기·집중·일기).</p>
          <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {DEX.map((d) => {
              const got = seen.has(d.key);
              return (
                <li key={d.key} className={cn('flex flex-col items-center gap-1 rounded-2xl p-2 text-center text-[11px]', isClassic ? 'bg-white/10' : 'bg-white/60')}>
                  <SpriteCanvas stage={d.stage} branch={d.branch} silhouette={!got} />
                  <b className={cn(!got && 'opacity-50')}>{got ? d.label : '???'}</b>
                  {d.branch && d.branch !== 'basic' && (got
                    ? <span className="break-keep opacity-60">{BRANCH_INFO[d.branch].habit}</span>
                    : <span className="break-keep opacity-75" data-dex-hint={d.branch}>힌트: {BRANCH_INFO[d.branch].hint}</span>)}
                </li>
              );
            })}
          </ul>
          {/* 새 종(2026-10-26) — 종마다 한 줄. 못 만난 종은 어떻게 만나는지 수수께끼만 */}
          {NEW_SPECIES.map((sp) => {
            const rows = speciesDex(sp);
            const got = speciesDexSeen(album.data ?? [], sp);
            const open = sp === 'signal' || species?.unlocked[sp as 'tide' | 'moon' | 'sprout'] === true || got.size > 0;
            return (
              <div key={sp} className="mt-3" data-dex-species={sp}>
                <p className="text-[12px] font-bold">{open ? SPECIES_INFO[sp].family : '??? 가족'} <span className="font-normal opacity-75">{got.size}/{rows.length}</span></p>
                <p className="text-[11px] opacity-75">{open ? SPECIES_INFO[sp].how : `힌트: ${SPECIES_INFO[sp].hint}`}{sp === 'signal' ? ' — 친구 2명과 교환하며 자라면 특별한 모습이 돼요.' : ''}</p>
                <ul className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {rows.map((d) => (
                    <li key={d.key} className={cn('flex flex-col items-center gap-1 rounded-2xl p-2 text-center text-[11px]', isClassic ? 'bg-white/10' : 'bg-white/60')}>
                      <SpriteCanvas stage={d.stage} branch={lookOf(sp, d.form ?? null)} silhouette={!got.has(d.key)} />
                      <b className={cn(!got.has(d.key) && 'opacity-50')}>{got.has(d.key) ? d.label : '???'}</b>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {delivered.length > 0 && (
            <>
              <p className="mt-3 text-[12px] font-bold">받은 캐릭터 {delivered.length}</p>
              <ul className="mt-1 flex flex-wrap gap-1.5 text-[12px]">
                {delivered.map((o) => <li key={o.id} className="rounded-full bg-white/60 px-3 py-1">{o.title}</li>)}
              </ul>
            </>
          )}
        </div>
      )}
    </TamaDialog>
  );
}
