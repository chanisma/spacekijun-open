/**
 * «오래 함께한 펫» 창(2026-10-19) — 모드(이지·노멀·하드)별 학교 전체 순위 20위. 펫마다 그 주인의 방(꾸미기)과 그 펫이 입은 캐릭터로 그린다.
 * 처음엔 펫 집의 탭이었다가 같은 날 «버튼을 바깥으로 빼고 난이도별로»에 따라 아래 단추 줄 «순위»가 여는 창이 됐다.
 * 주인은 나 = «나», 별빛 친구 = 이름, 그 밖 = «N학년»/«선생님»(서버가 그렇게만 싣는다 — 사용자 결정).
 * 순위 값·규칙 = model/longestPets.ts, 계산 = 서버 tama_private.longest_pets. 하드 판 = 버텨 낸 위험 → 시간(2026-10-26).
 */
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { STAGE_LABEL, type Stage } from '../model/petModel';
import { lookName, lookOf, speciesOf, type PetBranch } from '../model/species';
import { MODE_INFO, PET_MODES, deathCauseOf, type PetMode } from '../model/petModes';
import { LONGEST_PETS_SIZE, MEDAL, ageLabel, isAbroad, scoreLabel, type LongestPet } from '../model/longestPets';
import { socialService } from '../services/socialService';
import { hydrateCustomItems } from '../services/decorService';
import { usePetSkinFrames } from '../hooks/useSocial';
import { useCustomVersion } from '../hooks/useCustomVersion';
import { roomPreview } from '../color/colorScreen';
import { skinnedSprite } from '../color/characters';
import { PixelBuf } from '../color/pixel';
import { TamaDialog } from './AppChrome';
import type { DeviceStyle } from '../three/dims';

export const LONGEST_KEY = ['tama-longest-pets'] as const;

const asStage = (s: string | null | undefined): Stage => (s && s in STAGE_LABEL ? (s as Stage) : 'baby');

/** 그 펫의 방 + 그 펫이 입은 캐릭터(어른만 — skinnedSprite 규칙). 별이 된 펫은 흐린 그림자로 */
function PetRoom({ pet }: { pet: LongestPet }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const version = useCustomVersion(); // 나만의 꾸미기·캐릭터 그림이 늦게 오면 다시 그린다
  const frames = usePetSkinFrames(
    { orderId: pet.character?.image_path ? 'order' : null, itemId: pet.skin_item },
    pet.character?.image_path ? [{ id: 'order', image_path: pet.character.image_path }] : [],
  );
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    // roomPreview 는 캐시한 버퍼를 준다 — 복사해서 그 위에 그린다(캐시를 더럽히지 않게)
    const src = roomPreview(pet.equipped);
    const room = new PixelBuf(src.w, src.h);
    room.data.set(src.data);
    const spr = skinnedSprite(frames, asStage(pet.stage), 'idle0', false, lookOf(speciesOf(pet), pet.stage === 'adult' ? (pet.branch as PetBranch | null) : null));
    const body = new PixelBuf(spr.w, spr.h);
    body.data.set(spr.data);
    if (pet.dead && !isAbroad(pet)) for (let i = 0; i < body.data.length; i += 4) if (body.data[i + 3]) { body.data[i] = 205; body.data[i + 1] = 200; body.data[i + 2] = 235; body.data[i + 3] = 150; }
    room.ellipse(64, 117, spr.w * 0.36, 2, [40, 30, 70], 90);
    room.blit(body, Math.round(64 - spr.w / 2), 116 - spr.h);
    const tmp = document.createElement('canvas');
    tmp.width = room.w; tmp.height = room.h;
    tmp.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(room.data), room.w, room.h), 0, 0);
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.drawImage(tmp, 0, 0, c.width, c.height);
  }, [pet, frames, version]);
  return <canvas ref={ref} width={128} height={128} role="img" aria-label={`${pet.name}의 방`}
    className="h-24 w-24 shrink-0 rounded-xl [image-rendering:pixelated] sm:h-28 sm:w-28" />;
}

function Row({ pet, classic }: { pet: LongestPet; classic: boolean }) {
  const branch = lookName(speciesOf(pet), pet.stage, pet.branch as PetBranch | null);
  const look = pet.character?.title ?? null;
  return (
    <li data-longest-rank={pet.rank}
      className={cn('flex min-w-0 items-center gap-3 rounded-2xl p-2', classic ? 'bg-white/10' : 'bg-white/60', pet.mine && 'ring-2 ring-violet-400')}>
      <span className="w-8 shrink-0 text-center text-[15px] font-black tabular-nums" aria-label={`${pet.rank}위`}>{MEDAL[pet.rank] ?? pet.rank}</span>
      <PetRoom pet={pet} />
      <span className="min-w-0 flex-1 text-[13px]">
        <b className="block truncate" title={pet.name}>{pet.name}</b>
        <span className="block truncate text-[11px] opacity-75">
          {pet.mine ? '내 펫' : pet.friend ? `${pet.owner}의 펫` : pet.owner}
          {' · '}{STAGE_LABEL[asStage(pet.stage)]}{branch ? ` · ${branch}` : ''}{look ? ` · «${look}»` : ''}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px]">
          {pet.mode === 'hard' && (
            <span className="tabular-nums" data-longest-score>
              <b>{scoreLabel(pet.score)}</b>{pet.cares !== null ? ` · 돌봄 ${pet.cares}번` : ''}{' · '}
            </span>
          )}
          <b className="tabular-nums">{ageLabel(pet.ticks)}</b>
          {pet.mode !== 'easy' && (
            <span className={cn('rounded-full px-1.5 font-bold text-white', pet.mode === 'hard' ? 'bg-rose-500' : 'bg-amber-500')}>{MODE_INFO[pet.mode].badge}</span>
          )}
          {pet.resting && <span className="opacity-70">쉬는 중</span>}
          {pet.dead && (isAbroad(pet)
            ? <span className="opacity-80" data-longest-abroad>✈️ 유학을 떠남</span>
            : <span className="opacity-80" title={deathCauseOf(pet.death_cause).phrase}>⭐ 별이 됨</span>)}
        </span>
      </span>
    </li>
  );
}

/** 한 판(모드 하나)의 순위 */
function Board({ mode, open, classic }: { mode: PetMode; open: boolean; classic: boolean }) {
  const q = useQuery({
    queryKey: [...LONGEST_KEY, mode],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      const data = await socialService.longestPets(mode);
      // 순위 펫들의 나만의 꾸미기 — 그 방을 그대로 그리려면 디자인·그림이 필요하다(친구의 방과 같은 길)
      hydrateCustomItems(data.pets.flatMap((p) => p.custom));
      return data;
    },
  });
  if (q.isPending) return <p className="mt-3 text-[13px] opacity-75">불러오는 중…</p>;
  if (q.isError) return <p className="mt-3 rounded-2xl bg-white/40 px-4 py-3 text-[13px]">순위를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>;
  const { pets, me } = q.data;
  const meInList = pets.some((p) => p.mine);
  return (
    <div className="mt-3 max-h-[55vh] overflow-y-auto pr-1" data-longest-board={mode}>
      <p className="mb-2 text-[12px] opacity-80" data-longest-rule>
        배고프거나 심심하거나, 똥을 그대로 두었거나 아픈 동안은 시간이 쌓이지 않아요.
        {mode === 'hard' && <span data-longest-hard-rule> 개복치 판은 «버텨 낸 위험» 순 — 돌볼 때마다 점수가 쌓여요.</span>}
      </p>
      {pets.length === 0 ? (
        <p className="rounded-2xl bg-white/40 px-4 py-3 text-[13px]">
          {mode === 'hard' ? '아직 개복치를 키운 사람이 없어요. 첫 기록의 주인공이 되어 보세요!' : '아직 알에서 나온 펫이 없어요.'}
        </p>
      ) : (
        <ol className="space-y-1.5">
          {pets.map((p) => <Row key={`${p.rank}-${p.name}`} pet={p} classic={classic} />)}
        </ol>
      )}
      {me && !meInList && (
        <p className="mt-2 rounded-2xl bg-white/50 px-3 py-2 text-[12px]" data-longest-me>
          이 판의 내 최고 기록 — <b>{me.rank}위</b> · {me.name} · {mode === 'hard' ? `${scoreLabel(me.score)} · ` : ''}{ageLabel(me.ticks)}
        </p>
      )}
    </div>
  );
}

/**
 * «오래 함께한 펫» 창(2026-10-19 — «버튼을 바깥으로 빼고 난이도별로»). 아래 단추 줄 «순위»가 연다.
 * 판 = 이지·노멀·하드(모드는 알을 받을 때 정해 바뀌지 않으므로 판을 옮겨 다니지 않는다). 처음 펼친 판 = 지금 펫의 모드.
 */
export function LongestPetsDialog({ open, onOpenChange, style, initialMode }: {
  open: boolean; onOpenChange: (o: boolean) => void; style: DeviceStyle; initialMode: PetMode;
}) {
  const [mode, setMode] = useState<PetMode>(initialMode);
  useEffect(() => { if (open) setMode(initialMode); }, [open, initialMode]);
  const classic = style === 'classic';
  const chip = (on: boolean, m: PetMode) => cn('h-10 rounded-full px-3 text-[13px] font-bold transition',
    on ? (m === 'hard' ? 'bg-rose-500 text-white' : m === 'normal' ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white') : classic ? 'bg-white/10' : 'bg-white/60');
  return (
    <TamaDialog open={open} onOpenChange={onOpenChange} style={style} title="오래 함께한 펫" description="모드별 학교 전체 순위" testId="longest">
      <div role="tablist" aria-label="모드" className="mt-3 flex flex-wrap gap-1.5">
        {PET_MODES.map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={chip(mode === m, m)} data-longest-tab={m}>
            {MODE_INFO[m].label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[12px] leading-5 opacity-80">
        모드마다 학교에서 가장 오래 함께한 펫 {LONGEST_PETS_SIZE}마리 — 부화한 날부터 마지막으로 돌본 때까지예요(쉬는 동안은 세지 않아요). 별빛 친구의 펫에만 주인 이름이 보여요.
      </p>
      <Board mode={mode} open={open} classic={classic} />
    </TamaDialog>
  );
}
