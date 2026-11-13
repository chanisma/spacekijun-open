/**
 * 함께(Phase 5) — 친구 창(친구 펫 방문 · 쓰다듬기 · 교환) + 의뢰 창(캐릭터 · 꾸미기 — 2026-10-08). three 를 쓰지 않는다.
 *
 * 친구는 친구 코드로 맺은 학생·선생님이다(서버가 판정 — 2026-11-06 선생님도). 별빛 아카데미와 **같은 친구 관계**라 어느 쪽에서 맺어도 양쪽에 보인다 —
 * 2026-10-15 부터 다마고찌 안 «친구 맺기» 탭에서도 코드를 나누고 요청을 주고받는다(아카데미 친구 창은 제3장을 마쳐야 열린다).
 * 선생님·친구가 없는 학생에게는 그 사실과 할 일을 글로 말한다.
 * 교환은 «제안 → 친구가 수락하는 순간 서버가 두 물건을 함께 옮김». 마지막 하나를 주면 그 물건으로 꾸민 자리가 비는 것을 미리 말한다.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { lookOf, speciesOf, type PetBranch } from '../model/species';
import { ArrowLeft, Copy, Gift, Hand, Repeat2, Sparkles, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { TamaDialog } from './AppChrome';
import { PrizePreview } from './PrizePreview';
import type { BefriendAction, SocialController, CharacterController, DecorOrderController } from '../hooks/useSocial';
import { useCustomVersion } from '../hooks/useCustomVersion';
import { DECOR_PRICES, decorPriceOf, hydrateCustomItems, type DecorOrder } from '../services/decorService';
import { DECOR_SLOTS, isDesignSlot, isModelSlot, type DecorSlot } from '../model/decorDesign';
import type { ShopController } from '../hooks/useShop';
import { ITEM_BY_ID, RARITY, SLOT_LABEL, type Equipped } from '../model/catalog';
import { STAGE_LABEL, type Stage } from '../model/petModel';
import { BRANCH_INFO, type BranchOrBasic } from '../model/branch';
import { baseCharacterSprite, type CustomPose } from '../color/characters';
import { roomPreview } from '../color/colorScreen';
import { CUSTOM_POSES, CUSTOM_POSE_LABEL, loadCharacterSheet } from '../color/customCharacter';
import { PixelBuf } from '../color/pixel';
import { CHARACTER_PRICE, characterService, socialService, type CharacterOrder, type FriendPet, type TamaFriend, type TamaTrade } from '../services/socialService';
import type { DeviceStyle } from '../three/dims';
import { formatFriendCode, normalizeFriendCode } from '@/features/academy/game/friendsCore';

const STAGES: Stage[] = ['egg', 'baby', 'child', 'teen', 'adult'];
const asStage = (s: string | undefined): Stage => (STAGES.includes(s as Stage) ? (s as Stage) : 'child');

function blitTo(canvas: HTMLCanvasElement | null, buf: PixelBuf) {
  if (!canvas) return;
  const g = canvas.getContext('2d')!;
  const tmp = document.createElement('canvas');
  tmp.width = buf.w; tmp.height = buf.h;
  tmp.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(buf.data), buf.w, buf.h), 0, 0);
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, canvas.width, canvas.height);
  const side = Math.min(canvas.width / buf.w, canvas.height / buf.h);
  g.drawImage(tmp, (canvas.width - buf.w * side) / 2, (canvas.height - buf.h * side) / 2, buf.w * side, buf.h * side);
}

/** 친구의 방 한 장 — 꾸민 방 + 그 펫(입힌 캐릭터가 있으면 그것) */
function FriendRoom({ pet, equipped, custom }: { pet: FriendPet['pet']; equipped: Equipped; custom: Record<CustomPose, PixelBuf> | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const version = useCustomVersion(); // 친구의 나만의 소품 그림이 늦게 오면 다시 그린다
  useEffect(() => {
    // roomPreview 는 캐시한 버퍼를 준다 — 그 위에 그리면 캐시가 더러워지므로 복사해서 그린다
    const src = roomPreview(equipped);
    const room = new PixelBuf(src.w, src.h);
    room.data.set(src.data);
    if (pet && pet.stage !== 'egg' && !pet.dead) {
      const spr = custom ? custom.idle : baseCharacterSprite(asStage(pet.stage), 'idle0', false, lookOf(speciesOf(pet), pet.stage === 'adult' ? (pet.branch as PetBranch | null) : null));
      room.ellipse(64, 117, spr.w * 0.36, 2, [40, 30, 70], 90);
      room.blit(spr, Math.round(64 - spr.w / 2), 116 - spr.h);
    }
    blitTo(ref.current, room);
  }, [pet, equipped, custom, version]);
  return <canvas ref={ref} width={256} height={256} role="img" aria-label="친구의 방" className="mx-auto h-56 w-56 rounded-2xl [image-rendering:pixelated]" />;
}

function ItemPick({ ids, value, onChange, counts, empty }: {
  ids: string[]; value: string | null; onChange: (id: string | null) => void; counts: Record<string, number>; empty: string;
}) {
  if (!ids.length) return <p className="rounded-xl bg-white/40 px-3 py-2 text-[12px] opacity-75">{empty}</p>;
  return (
    <div className="grid max-h-48 grid-cols-3 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-4">
      {ids.map((id) => {
        const it = ITEM_BY_ID.get(id);
        if (!it) return null;
        return (
          <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(value === id ? null : id)}
            className={cn('flex min-w-0 flex-col items-center gap-0.5 rounded-xl bg-white/60 p-1.5 text-[11px]', value === id && 'ring-2 ring-violet-500')}>
            <PrizePreview itemId={id} className="h-14 w-auto" />
            <span className="w-full truncate font-bold" title={it.name}>{it.name}</span>
            <span className="text-[10px]" style={{ color: RARITY[it.rarity].color }}>{RARITY[it.rarity].label}{counts[id] > 1 ? ` · ${counts[id]}개` : ''}</span>
          </button>
        );
      })}
    </div>
  );
}

const TRADE_DONE_TEXT: Record<string, string> = {
  accepted: '오갔어요', declined: '친구가 거절했어요', cancelled: '거뒀어요', failed: '이루어지지 못했어요',
};
const FAIL_DETAIL: Record<string, string> = { expired: '7일이 지나서', not_friends: '친구가 아니어서', item_gone: '물건이 없어져서' };

function tradeLine(t: TamaTrade) {
  const give = ITEM_BY_ID.get(t.give_item)?.name ?? t.give_item;
  const want = t.want_item ? ITEM_BY_ID.get(t.want_item)?.name ?? t.want_item : null;
  return want ? `${give} ↔ ${want}` : `${give} 선물`;
}

export type FriendsTab = 'friends' | 'trades' | 'add' | 'link';

export function FriendsDialog({ open, onOpenChange, style, social, shop, me, tab, onTab: setTab, linkPanel, linkBadge = 0 }: {
  open: boolean; onOpenChange: (o: boolean) => void; style: DeviceStyle; social: SocialController; shop: ShopController; me: string | null;
  /** 지금 탭 — 페이지가 쥔다(친구 요청 알림에서 오면 «친구 맺기»로 연다) */
  tab: FriendsTab; onTab: (t: FriendsTab) => void;
  /** 통신 탭 내용(2026-10-26 — LinkPanels 의 LinkTab, 페이지가 통신 훅과 함께 넘긴다) · 받은 신청 수 */
  linkPanel?: ReactNode; linkBadge?: number;
}) {
  const data = social.friends.data;
  const requests = social.codes.data?.eligible ? (social.codes.data.incoming?.length ?? 0) : 0;
  const [visiting, setVisiting] = useState<TamaFriend | null>(null);
  const [friendPet, setFriendPet] = useState<FriendPet | null>(null);
  const [custom, setCustom] = useState<Record<CustomPose, PixelBuf> | null>(null);
  const [composing, setComposing] = useState(false);
  const [give, setGive] = useState<string | null>(null);
  const [want, setWant] = useState<string | null>(null);
  const trades = data?.trades ?? [];
  const incoming = trades.filter((t) => t.status === 'pending' && !t.expired && t.to_user === me);
  const outgoing = trades.filter((t) => t.status === 'pending' && !t.expired && t.from_user === me);
  const finished = trades.filter((t) => t.status !== 'pending' || t.expired).slice(0, 10);
  const owned = shop.status.data?.owned ?? {};
  const equipped = shop.status.data?.equipped ?? {};

  useEffect(() => { if (!open) { setVisiting(null); setComposing(false); } }, [open]);
  useEffect(() => {
    let alive = true;
    setFriendPet(null); setCustom(null); setGive(null); setWant(null); setComposing(false);
    if (!visiting) return () => { alive = false; };
    socialService.friendPet(visiting.id).then(async (p) => {
      if (!alive) return;
      hydrateCustomItems(p.custom); // 친구가 꾸민 나만의 꾸미기 — 그 방을 그대로 그리려면 디자인·그림이 필요하다
      setFriendPet(p);
      if (p.character?.image_path) {
        try {
          const frames = await loadCharacterSheet(await characterService.signedUrl(p.character.image_path));
          if (alive) setCustom(frames);
        } catch { /* 기본 캐릭터로 */ }
      }
    }).catch((e) => toast.error(e instanceof Error ? e.message : '친구의 펫을 불러오지 못했어요.'));
    return () => { alive = false; };
  }, [visiting]);

  const pat = async () => {
    if (!visiting) return;
    try {
      const r = await social.pat.mutateAsync(visiting.id);
      toast.success(r.fresh ? `${friendPet?.pet?.name ?? '친구 펫'}을(를) 쓰다듬었어요 — 친구가 펫 화면을 열면 펫이 기뻐해요` : '오늘은 이미 쓰다듬었어요');
      setFriendPet((p) => (p ? { ...p, patted_today: true } : p));
    } catch (e) { toast.error(e instanceof Error ? e.message : '쓰다듬지 못했어요.'); }
  };
  const propose = async () => {
    if (!visiting || !give) return;
    try {
      await social.trade.mutateAsync({ action: 'propose', payload: { to: visiting.id, give, want } });
      toast.success(want ? '교환을 제안했어요 — 친구가 수락하면 오가요' : '선물을 보냈어요 — 친구가 받으면 건너가요');
      setComposing(false); setGive(null); setWant(null); setTab('trades'); setVisiting(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : '제안하지 못했어요.'); }
  };
  const act = async (t: TamaTrade, action: 'accept' | 'decline' | 'cancel') => {
    try {
      const r = await social.trade.mutateAsync({ action, payload: { id: t.id } });
      if (action === 'accept') {
        if (r.status === 'accepted') toast.success(`${tradeLine(t)} — 받았어요`);
        else toast.error(`교환이 이루어지지 못했어요(${FAIL_DETAIL[r.detail ?? ''] ?? '알 수 없음'})`);
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : '처리하지 못했어요.'); }
  };

  const isClassic = style === 'classic';
  const chip = (on: boolean) => cn('h-10 rounded-full px-4 text-[13px]', on ? (isClassic ? 'bg-white/90 text-indigo-950' : 'bg-violet-600 text-white') : isClassic ? 'bg-white/10' : 'bg-white/60');
  const giveLeft = give ? (owned[give] ?? 0) : 0;
  const giveEquipped = give ? Object.values(equipped).includes(give) : false;

  return (
    <TamaDialog open={open} onOpenChange={onOpenChange} style={style} title="친구" description="친구 코드로 친구를 맺고, 친구의 펫을 보러 가고 물건을 바꿔요" testId="friends">
      {!data ? (
        <p className="mt-3 text-[13px] opacity-75">불러오는 중…</p>
      ) : !data.eligible ? (
        <p className="mt-3 rounded-2xl bg-white/40 px-4 py-3 text-[13px] leading-6" data-friends-ineligible>
          친구는 <b>학생과 선생님</b>이 맺어요. 직원 계정은 친구를 맺을 수 없어 펫 방문·교환을 쓸 수 없어요.
        </p>
      ) : visiting ? (
        <div className="mt-3" data-friend-visit={visiting.id}>
          <button type="button" onClick={() => setVisiting(null)} className="mb-2 flex h-10 items-center gap-1 rounded-full px-2 text-[13px] opacity-80">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> 친구 목록
          </button>
          {!friendPet ? <p className="text-[13px] opacity-75">놀러 가는 중…</p> : !friendPet.pet ? (
            <p className="rounded-2xl bg-white/40 px-4 py-3 text-[13px]">{friendPet.name}은(는) 아직 펫을 키우지 않아요.</p>
          ) : composing ? (
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-[12px] font-bold">내가 줄 것</p>
                <ItemPick ids={Object.keys(owned).filter((id) => !ITEM_BY_ID.get(id)?.custom)} value={give} onChange={setGive} counts={owned} empty="아직 가진 물건이 없어요 — 가챠로 모아 보세요." />
                {give && giveLeft === 1 && giveEquipped && (
                  <p className="mt-1 text-[11px] text-rose-600">마지막 하나예요 — 건너가면 그 물건으로 꾸민 자리가 기본으로 돌아가요.</p>
                )}
              </div>
              <div>
                <p className="mb-1 text-[12px] font-bold">받고 싶은 것 <span className="font-normal opacity-70">(고르지 않으면 선물)</span></p>
                <ItemPick ids={Object.keys(friendPet.items)} value={want} onChange={setWant} counts={friendPet.items} empty="친구가 가진 물건이 없어요 — 선물만 보낼 수 있어요." />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setComposing(false)} className="h-11 flex-1 rounded-full bg-white/60 text-[14px]">취소</button>
                <button type="button" disabled={!give || social.trade.isPending} onClick={propose}
                  className="h-11 flex-1 rounded-full bg-violet-600 text-[14px] font-bold text-white disabled:opacity-50">
                  {want ? '교환 제안하기' : '선물 보내기'}
                </button>
              </div>
              <p className="text-[11px] opacity-70">친구가 수락하는 순간 함께 오가요(한쪽만 건너가는 일은 없어요). 7일 안에 답이 없으면 사라져요.</p>
            </div>
          ) : (
            <div className="space-y-3 text-center">
              <FriendRoom pet={friendPet.pet} equipped={friendPet.equipped} custom={custom} />
              <p className="text-[14px] font-bold">
                {friendPet.name}의 {friendPet.pet.name}
                <span className="ml-1 text-[12px] font-normal opacity-75">
                  {friendPet.pet.dead ? '별이 되었어요' : STAGE_LABEL[asStage(friendPet.pet.stage)]}
                  {!friendPet.pet.dead && friendPet.pet.stage === 'adult' && friendPet.pet.branch && friendPet.pet.branch !== 'basic' && BRANCH_INFO[friendPet.pet.branch as BranchOrBasic]
                    ? ` · ${BRANCH_INFO[friendPet.pet.branch as BranchOrBasic].name}` : ''}
                  {friendPet.character ? ` · «${friendPet.character.title}»` : ''}
                </span>
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={pat} disabled={friendPet.patted_today || social.pat.isPending || !!friendPet.pet.dead}
                  className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-pink-500 text-[14px] font-bold text-white disabled:opacity-50">
                  <Hand className="h-4 w-4" aria-hidden="true" /> {friendPet.patted_today ? '오늘 쓰다듬었어요' : '쓰다듬기'}
                </button>
                <button type="button" onClick={() => setComposing(true)}
                  className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-violet-600 text-[14px] font-bold text-white">
                  <Repeat2 className="h-4 w-4" aria-hidden="true" /> 교환·선물
                </button>
              </div>
              <p className="text-[11px] opacity-70">쓰다듬기는 친구 한 명에게 하루 한 번 — 친구가 펫 화면을 열면 펫이 기뻐해요.</p>
            </div>
          )}
        </div>
      ) : (
        <>
          <div role="tablist" className="mt-3 flex flex-wrap gap-1.5">
            <button type="button" role="tab" aria-selected={tab === 'friends'} onClick={() => setTab('friends')} className={chip(tab === 'friends')}>친구 펫</button>
            <button type="button" role="tab" aria-selected={tab === 'trades'} onClick={() => setTab('trades')} className={cn(chip(tab === 'trades'), 'relative')}>
              교환 {incoming.length > 0 && <span className="ml-1 rounded-full bg-pink-500 px-1.5 text-[11px] font-bold text-white">{incoming.length}</span>}
            </button>
            {linkPanel && (
              <button type="button" role="tab" aria-selected={tab === 'link'} onClick={() => setTab('link')} className={cn(chip(tab === 'link'), 'relative')} data-friends-tab="link">
                통신 {linkBadge > 0 && <span className="ml-1 rounded-full bg-pink-500 px-1.5 text-[11px] font-bold text-white" aria-label={`받은 통신 ${linkBadge}건`}>{linkBadge}</span>}
              </button>
            )}
            <button type="button" role="tab" aria-selected={tab === 'add'} onClick={() => setTab('add')} className={cn(chip(tab === 'add'), 'relative')} data-friends-tab="add">
              친구 맺기 {requests > 0 && <span className="ml-1 rounded-full bg-pink-500 px-1.5 text-[11px] font-bold text-white" aria-label={`받은 친구 요청 ${requests}건`}>{requests}</span>}
            </button>
          </div>
          {tab === 'link' ? (
            linkPanel ?? null
          ) : tab === 'add' ? (
            <BefriendPanel social={social} style={style} />
          ) : tab === 'friends' ? (
            (data.friends ?? []).length === 0 ? (
              <div className="mt-3 rounded-2xl bg-white/40 px-4 py-3 text-[13px] leading-6">
                <p>아직 친구가 없어요. 친구와 <b>친구 코드</b>를 나누면 친구의 펫을 보러 가고 물건을 바꿀 수 있어요.</p>
                <button type="button" onClick={() => setTab('add')} className="mt-2 flex h-10 items-center gap-1.5 rounded-full bg-violet-600 px-4 text-[13px] font-bold text-white">
                  <UserPlus className="h-4 w-4" aria-hidden="true" /> 친구 맺으러 가기
                </button>
              </div>
            ) : (
              <ul className="mt-3 max-h-[50vh] space-y-1.5 overflow-y-auto pr-1">
                {(data.friends ?? []).map((f) => (
                  <li key={f.id}>
                    <button type="button" onClick={() => setVisiting(f)} disabled={!f.pet}
                      className="flex min-h-12 w-full min-w-0 items-center gap-3 rounded-2xl bg-white/60 px-3 py-2 text-left text-[13px] disabled:opacity-60">
                      <span className="min-w-0 flex-1">
                        <b className="block truncate">{f.name}</b>
                        <span className="block truncate text-[11px] opacity-75">{f.pet ? `${f.pet.name} · ${STAGE_LABEL[asStage(f.pet.stage)]}` : '아직 펫이 없어요'}</span>
                      </span>
                      {f.pet && <span className="shrink-0 text-[11px] opacity-80">{f.patted_today ? '쓰다듬음' : '놀러 가기'}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className="mt-3 max-h-[55vh] space-y-3 overflow-y-auto pr-1 text-[13px]">
              <section>
                <p className="mb-1 text-[12px] font-bold">받은 제안</p>
                {incoming.length === 0 ? <p className="text-[12px] opacity-70">없어요</p> : incoming.map((t) => (
                  <div key={t.id} className="mb-1.5 rounded-2xl bg-white/60 px-3 py-2" data-trade-incoming={t.id}>
                    <p className="min-w-0 truncate"><b>{t.from_name}</b> · {tradeLine(t)}</p>
                    <div className="mt-1.5 flex gap-2">
                      <button type="button" onClick={() => act(t, 'decline')} className="h-10 flex-1 rounded-full bg-white/80 text-[13px]">거절</button>
                      <button type="button" onClick={() => act(t, 'accept')} disabled={social.trade.isPending}
                        className="flex h-10 flex-1 items-center justify-center gap-1 rounded-full bg-violet-600 text-[13px] font-bold text-white">
                        <Gift className="h-4 w-4" aria-hidden="true" /> {t.want_item ? '바꾸기' : '받기'}
                      </button>
                    </div>
                  </div>
                ))}
              </section>
              <section>
                <p className="mb-1 text-[12px] font-bold">보낸 제안</p>
                {outgoing.length === 0 ? <p className="text-[12px] opacity-70">없어요</p> : outgoing.map((t) => (
                  <div key={t.id} className="mb-1.5 flex min-w-0 items-center gap-2 rounded-2xl bg-white/60 px-3 py-2">
                    <p className="min-w-0 flex-1 truncate"><b>{t.to_name}</b> · {tradeLine(t)}</p>
                    <button type="button" onClick={() => act(t, 'cancel')} className="h-10 shrink-0 rounded-full bg-white/80 px-3 text-[12px]">거두기</button>
                  </div>
                ))}
              </section>
              {finished.length > 0 && (
                <section>
                  <p className="mb-1 text-[12px] font-bold">지난 교환</p>
                  {finished.map((t) => (
                    <p key={t.id} className="truncate text-[12px] opacity-75">
                      {t.from_user === me ? `→ ${t.to_name}` : `← ${t.from_name}`} · {tradeLine(t)} · {t.expired ? '7일이 지나 사라졌어요' : TRADE_DONE_TEXT[t.status]}
                      {t.status === 'failed' && t.detail ? `(${FAIL_DETAIL[t.detail] ?? t.detail})` : ''}
                    </p>
                  ))}
                </section>
              )}
            </div>
          )}
        </>
      )}
    </TamaDialog>
  );
}

// ── 친구 맺기 (2026-10-15) ───────────────────────────────────────────
//
// 아카데미 친구 창(GameFriends)과 같은 일·같은 RPC 다: 내 코드 → 코드로 요청 → 받은 요청 → 맺은 친구 → 보낸 요청.
// 빠진 것은 «망원경 공개» 하나(아카데미의 별자리 이야기라 여기서는 뜻이 없다). 서버가 상대의 알림을 이 창으로
// 보내도록 요청·받기에 from: 'tamagotchi' 를 싣는다(useSocial.befriend).

const BEFRIEND_DONE: Partial<Record<string, string>> = {
  cancelled: '보낸 요청을 취소했어요', removed: '친구를 끊었어요',
};

function BefriendPanel({ social, style }: { social: SocialController; style: DeviceStyle }) {
  const state = social.codes.data;
  const [input, setInput] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const busy = social.befriend.isPending;
  const isClassic = style === 'classic';
  const normalized = normalizeFriendCode(input);

  const run = async (action: BefriendAction, payload: Record<string, unknown> = {}) => {
    try {
      const r = await social.befriend.mutateAsync({ action, payload });
      if (action === 'request') {
        setInput('');
        toast.success(r.status === 'accepted' ? `${String(r.name)}와(과) 친구가 되었어요` : `${String(r.name)}에게 친구 요청을 보냈어요 — 받아 주면 알림이 와요`);
      } else if (action === 'respond') {
        toast.success(r.status === 'accepted' ? '친구가 되었어요 — 친구 펫을 보러 갈 수 있어요' : '요청을 거절했어요');
      } else if (action === 'reset_code') {
        setConfirmReset(false);
        toast.success('친구 코드를 바꿨어요 — 이미 맺은 친구는 그대로예요');
      } else if (BEFRIEND_DONE[String(r.status)]) {
        toast.success(BEFRIEND_DONE[String(r.status)]!);
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : '처리하지 못했어요.'); }
  };
  const copy = async () => {
    if (!state?.code) return;
    try { await navigator.clipboard.writeText(formatFriendCode(state.code)); toast.success('친구 코드를 복사했어요'); }
    catch { toast.error('복사하지 못했어요 — 코드를 직접 불러 주세요'); }
  };

  if (social.codes.isError) return <p className="mt-3 rounded-2xl bg-white/40 px-4 py-3 text-[13px]">{(social.codes.error as Error).message}</p>;
  if (!state) return <p className="mt-3 text-[13px] opacity-75">불러오는 중…</p>;
  const incoming = state.incoming ?? [];
  const outgoing = state.outgoing ?? [];
  const friends = state.friends ?? [];
  const row = 'flex min-w-0 items-center gap-2 rounded-2xl bg-white/60 px-3 py-2';
  const ghost = 'h-10 shrink-0 rounded-full bg-white/80 px-3 text-[12px] disabled:opacity-50';
  const primary = 'h-10 shrink-0 rounded-full bg-violet-600 px-3 text-[12px] font-bold text-white disabled:opacity-50';

  return (
    <div className="mt-3 max-h-[60vh] space-y-4 overflow-y-auto pr-1 text-[13px]" data-befriend>
      <section>
        <p className="mb-1 text-[12px] font-bold">내 친구 코드</p>
        <div className={row}>
          <output className="min-w-0 flex-1 truncate font-mono text-[20px] font-bold tracking-[0.15em]" data-friend-code>{formatFriendCode(state.code)}</output>
          <button type="button" onClick={() => void copy()} className={cn(ghost, 'flex items-center gap-1')}><Copy className="h-4 w-4" aria-hidden="true" /> 복사</button>
        </div>
        <p className="mt-1 text-[11px] opacity-70">친구에게 이 코드를 알려 주세요. 별빛 아카데미의 친구 코드와 같아요 — 어디서 맺어도 양쪽에 함께 보여요.</p>
        {confirmReset ? (
          <div className="mt-1.5 flex min-w-0 items-center gap-2">
            <p className="min-w-0 flex-1 text-[11px]">코드를 바꾸면 예전 코드로는 요청할 수 없어요. 이미 맺은 친구는 그대로예요.</p>
            <button type="button" onClick={() => setConfirmReset(false)} className={ghost}>그만두기</button>
            <button type="button" onClick={() => void run('reset_code')} disabled={busy} className={primary}>바꾸기</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmReset(true)} className="mt-1 h-9 rounded-full px-2 text-[11px] underline opacity-70">코드 바꾸기</button>
        )}
      </section>

      <section>
        <p className="mb-1 text-[12px] font-bold">친구 코드로 요청하기</p>
        <form className="flex min-w-0 gap-2" onSubmit={(e) => { e.preventDefault(); if (normalized.length === 8) void run('request', { code: normalized }); }}>
          <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} maxLength={11} placeholder="ABCD-1234"
            aria-label="친구 코드" autoCapitalize="characters" autoComplete="off" spellCheck={false} data-friend-code-input
            className="h-11 min-w-0 flex-1 rounded-xl bg-white/80 px-3 font-mono text-[16px] tracking-widest text-violet-950" />
          <button type="submit" disabled={normalized.length !== 8 || busy}
            className={cn('h-11 shrink-0 rounded-full px-4 text-[13px] font-bold disabled:opacity-50', isClassic ? 'bg-white/90 text-indigo-950' : 'bg-violet-600 text-white')}>
            요청 보내기
          </button>
        </form>
      </section>

      <section>
        <p className="mb-1 text-[12px] font-bold">받은 요청</p>
        {incoming.length === 0 ? <p className="text-[12px] opacity-70">없어요</p> : incoming.map((r) => (
          <div key={r.id} className={cn(row, 'mb-1.5')} data-friend-request-incoming={r.id}>
            <b className="min-w-0 flex-1 truncate" title={r.name}>{r.name}</b>
            <button type="button" onClick={() => void run('respond', { id: r.id, accept: false })} disabled={busy} className={ghost}>거절</button>
            <button type="button" onClick={() => void run('respond', { id: r.id, accept: true })} disabled={busy} className={primary}>친구 되기</button>
          </div>
        ))}
      </section>

      {friends.length > 0 && (
        <section>
          <p className="mb-1 text-[12px] font-bold">맺은 친구 <span className="font-normal opacity-70">{friends.length}명</span></p>
          {friends.map((f) => (
            <div key={f.id} className={cn(row, 'mb-1.5')}>
              <b className="min-w-0 flex-1 truncate" title={f.name}>{f.name}</b>
              <button type="button" disabled={busy} className={ghost}
                onClick={() => { if (window.confirm(`${f.name}와(과) 친구를 끊을까요? 별빛 아카데미에서도 함께 끊겨요.`)) void run('remove', { user_id: f.id }); }}>
                끊기
              </button>
            </div>
          ))}
        </section>
      )}

      {outgoing.length > 0 && (
        <section>
          <p className="mb-1 text-[12px] font-bold">보낸 요청</p>
          {outgoing.map((r) => (
            <div key={r.id} className={cn(row, 'mb-1.5')} data-friend-request-outgoing={r.id}>
              <b className="min-w-0 flex-1 truncate" title={r.name}>{r.name}</b>
              <span className="shrink-0 text-[11px] opacity-70">기다리는 중</span>
              <button type="button" onClick={() => void run('cancel', { id: r.id })} disabled={busy} className={ghost}>요청 취소</button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

// ── 캐릭터 의뢰 ──────────────────────────────────────────────────────

const ORDER_STATUS: Record<CharacterOrder['status'], string> = {
  submitted: '관리자 확인 기다림', crafting: '그리는 중', delivered: '도착했어요', declined: '답장이 왔어요', cancelled: '거뒀어요',
};

function SheetPreview({ path }: { path: string }) {
  const [frames, setFrames] = useState<Record<CustomPose, PixelBuf> | null>(null);
  const [error, setError] = useState(false);
  const refs = useRef<(HTMLCanvasElement | null)[]>([]);
  useEffect(() => {
    let alive = true;
    characterService.signedUrl(path).then(loadCharacterSheet).then((f) => { if (alive) setFrames(f); }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [path]);
  useEffect(() => { if (frames) CUSTOM_POSES.forEach((p, i) => blitTo(refs.current[i], frames[p])); }, [frames]);
  if (error) return <p className="text-[11px] text-rose-600">그림을 불러오지 못했어요.</p>;
  return (
    <div className="flex justify-center gap-1">
      {CUSTOM_POSES.map((p, i) => (
        <canvas key={p} ref={(el) => { refs.current[i] = el; }} width={64} height={64} role="img" aria-label={CUSTOM_POSE_LABEL[p]}
          className="h-14 w-14 rounded-lg bg-white/50 [image-rendering:pixelated]" />
      ))}
    </div>
  );
}

function CharacterOrderBody({ style, characters, coins, grown }: { style: DeviceStyle; characters: CharacterController; coins: number | undefined; grown: boolean }) {
  const orders = characters.mine.data?.orders ?? [];
  const busy = orders.some((o) => o.status === 'submitted' || o.status === 'crafting');
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [token, setToken] = useState(() => crypto.randomUUID());
  const valid = title.trim().length >= 2 && title.trim().length <= 30 && prompt.trim().length >= 10 && prompt.trim().length <= 500;
  const short = coins !== undefined && coins < CHARACTER_PRICE;
  const isClassic = style === 'classic';

  const submit = async () => {
    if (!window.confirm(`${CHARACTER_PRICE}코인으로 의뢰할까요? 관리자가 거절하거나 내가 거두면 돌려받아요.`)) return;
    try {
      await characters.write.mutateAsync({ action: 'submit', payload: { client_token: token, title: title.trim(), prompt: prompt.trim(), confirm_cost: String(CHARACTER_PRICE) } });
      toast.success('의뢰를 보냈어요 — 관리자가 확인하면 알림이 와요');
      setTitle(''); setPrompt(''); setToken(crypto.randomUUID());
    } catch (e) { toast.error(e instanceof Error ? e.message : '의뢰하지 못했어요.'); }
  };
  const run = async (action: 'cancel' | 'equip', payload: Record<string, unknown>, done: string) => {
    try { await characters.write.mutateAsync({ action, payload }); toast.success(done); } catch (e) { toast.error(e instanceof Error ? e.message : '처리하지 못했어요.'); }
  };

  const sorted = useMemo(() => orders, [orders]);
  return (
    <>
      <p className="mt-2 text-[12px] leading-5 opacity-80">
        원하는 모습을 글로 적으면 <b>관리자가 확인하고 그려서</b> 보내 줘요. 의뢰는 {CHARACTER_PRICE}코인 — 거절되거나 거두면 돌려받아요.
        받은 캐릭터는 {isClassic ? '컬러·디지털 기기' : '컬러·디지털 화면'}에서 펫의 모습이 돼요(클래식 흑백 화면은 그대로).
        완성된 캐릭터는 <b>가챠에도 들어가요</b> — 다른 친구가 뽑으면 의뢰한 나에게 코인이 와요.
      </p>
      {busy ? (
        <p className="mt-3 rounded-2xl bg-white/50 px-4 py-3 text-[13px]">진행 중인 의뢰가 있어요. 답을 받은 뒤 다시 의뢰할 수 있어요.</p>
      ) : (
        <div className="mt-3 space-y-2" data-character-form>
          <label className="block text-[12px] font-bold">
            캐릭터 이름 <span className="font-normal opacity-60">{title.trim().length}/30</span>
            <input value={title} maxLength={30} onChange={(e) => setTitle(e.target.value)} placeholder="예: 별빛 고양이"
              className="mt-1 h-11 w-full rounded-xl bg-white/80 px-3 text-[16px] font-normal text-violet-950" />
          </label>
          <label className="block text-[12px] font-bold">
            원하는 모습 <span className="font-normal opacity-60">{prompt.trim().length}/500 · 10자 이상</span>
            <textarea value={prompt} maxLength={500} rows={4} onChange={(e) => setPrompt(e.target.value)}
              placeholder="예: 보라색 털에 이마에 별 무늬가 있고, 꼬리가 길고 끝이 반짝이는 고양이"
              className="mt-1 w-full rounded-xl bg-white/80 px-3 py-2 text-[16px] font-normal leading-6 text-violet-950" />
          </label>
          <p className="text-[11px] opacity-70">만화·게임 캐릭터를 그대로 그리거나 실제 사람을 그리는 의뢰는 거절될 수 있어요.</p>
          <button type="button" onClick={submit} disabled={!valid || short || characters.write.isPending}
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-violet-600 text-[14px] font-bold text-white disabled:opacity-50">
            <Sparkles className="h-4 w-4" aria-hidden="true" /> {short ? `코인이 모자라요(${CHARACTER_PRICE}코인)` : `${CHARACTER_PRICE}코인으로 의뢰하기`}
          </button>
        </div>
      )}
      {characters.loadError && <p className="mt-2 text-[11px] text-rose-600">입힌 캐릭터를 불러오지 못해 기본 모습으로 보여요: {characters.loadError}</p>}
      {sorted.length > 0 && (
        <ul className="mt-4 max-h-[40vh] space-y-2 overflow-y-auto pr-1">
          {sorted.map((o) => (
            <li key={o.id} className="rounded-2xl bg-white/60 px-3 py-2 text-[13px]" data-character-order={o.status}>
              <div className="flex min-w-0 items-center gap-2">
                <b className="min-w-0 flex-1 truncate" title={o.title}>{o.title}</b>
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold',
                  o.status === 'delivered' ? 'bg-emerald-500 text-white' : o.status === 'declined' ? 'bg-rose-100 text-rose-700' : 'bg-violet-100 text-violet-800')}>
                  {characters.equippedId === o.id ? '입는 중' : ORDER_STATUS[o.status]}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-[12px] opacity-75">{o.prompt}</p>
              {o.admin_note && <p className="mt-1 rounded-xl bg-white/70 px-2 py-1 text-[12px]">관리자: {o.admin_note}</p>}
              {o.status === 'declined' && o.refunded_coins > 0 && <p className="mt-0.5 text-[11px] opacity-70">{o.refunded_coins}코인을 돌려받았어요</p>}
              {o.status === 'delivered' && o.image_path && (
                <div className="mt-2 space-y-2">
                  <SheetPreview path={o.image_path} />
                  <button type="button" onClick={() => run('equip', { id: o.id, on: characters.equippedId !== o.id },
                    characters.equippedId === o.id ? '기본 모습으로 돌아왔어요' : `«${o.title}»(으)로 갈아입었어요`)}
                    disabled={!grown && characters.equippedId !== o.id}
                    className="h-10 w-full rounded-full bg-violet-600 text-[13px] font-bold text-white disabled:opacity-50">
                    {characters.equippedId === o.id ? '벗기(기본 모습)' : grown ? '입히기' : '다 자라면 입힐 수 있어요'}
                  </button>
                  {!grown && <p className="text-[11px] opacity-70">캐릭터 스킨은 어른이 된 펫만 입어요. 지금 입혀 둔 것도 어른이 되면 보여요.</p>}
                </div>
              )}
              {o.status === 'submitted' && (
                <button type="button" onClick={() => run('cancel', { id: o.id }, `의뢰를 거뒀어요 — ${o.charged_coins}코인을 돌려받았어요`)}
                  className="mt-1.5 h-10 rounded-full bg-white/80 px-4 text-[12px]">거두기</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export type RequestTab = 'character' | 'decor';

/** 의뢰 창 — 캐릭터 의뢰 · 꾸미기 의뢰(2026-10-08 사용자 지시 «의뢰에 캐릭터 의뢰만 있는데 꾸미기 관련 의뢰도 추가») */
export function CharacterDialog({ open, onOpenChange, style, characters, decor, shop, coins, tab, onTab, grown = true }: {
  open: boolean; onOpenChange: (o: boolean) => void; style: DeviceStyle; characters: CharacterController; decor: DecorOrderController;
  shop: ShopController; coins: number | undefined; tab: RequestTab; onTab: (t: RequestTab) => void;
  /** 함께하는 펫이 다 자랐는가 — 캐릭터 스킨은 어른만 입는다(2026-10-13) */
  grown?: boolean;
}) {
  const isClassic = style === 'classic';
  return (
    <TamaDialog open={open} onOpenChange={onOpenChange} style={style} title="의뢰" description="원하는 캐릭터나 꾸미기를 글로 적으면 관리자가 만들어 보내 줘요" testId="character">
      <div role="radiogroup" aria-label="의뢰 종류" className="mt-3 grid grid-cols-2 gap-1 rounded-full bg-white/40 p-1 text-[13px]">
        {([['character', '캐릭터'], ['decor', '꾸미기']] as const).map(([value, label]) => (
          <button key={value} type="button" role="radio" aria-checked={tab === value} onClick={() => onTab(value)}
            className={cn('h-10 rounded-full', tab === value ? (isClassic ? 'bg-white/90 text-indigo-950' : 'bg-violet-600 text-white') : 'opacity-80')}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'character'
        ? <CharacterOrderBody style={style} characters={characters} coins={coins} grown={grown} />
        : <DecorOrderBody style={style} decor={decor} shop={shop} coins={coins} />}
    </TamaDialog>
  );
}

const DECOR_STATUS: Record<DecorOrder['status'], string> = {
  submitted: '관리자 확인 기다림', crafting: '만드는 중', delivered: '도착했어요', declined: '답장이 왔어요', cancelled: '거뒀어요',
};

function DecorOrderBody({ style, decor, shop, coins }: { style: DeviceStyle; decor: DecorOrderController; shop: ShopController; coins: number | undefined }) {
  const orders = decor.mine.data ?? [];
  const busy = orders.some((o) => o.status === 'submitted' || o.status === 'crafting');
  const [slot, setSlot] = useState<DecorSlot>('wallpaper');
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [token, setToken] = useState(() => crypto.randomUUID());
  const valid = title.trim().length >= 2 && title.trim().length <= 20 && prompt.trim().length >= 10 && prompt.trim().length <= 500;
  const price = decorPriceOf(slot);
  const short = coins !== undefined && coins < price;
  const equipped = shop.status.data?.equipped ?? {};
  const isClassic = style === 'classic';

  const submit = async () => {
    if (!window.confirm(`${SLOT_LABEL[slot]} 의뢰를 ${price}코인으로 보낼까요? 관리자가 거절하거나 내가 거두면 돌려받아요.`)) return;
    try {
      await decor.write.mutateAsync({ action: 'submit', payload: { client_token: token, slot, title: title.trim(), prompt: prompt.trim(), confirm_cost: String(price) } });
      toast.success('의뢰를 보냈어요 — 관리자가 확인하면 알림이 와요');
      setTitle(''); setPrompt(''); setToken(crypto.randomUUID());
    } catch (e) { toast.error(e instanceof Error ? e.message : '의뢰하지 못했어요.'); }
  };
  const cancel = async (o: DecorOrder) => {
    try { await decor.write.mutateAsync({ action: 'cancel', payload: { id: o.id } }); toast.success(`의뢰를 거뒀어요 — ${o.charged_coins}코인을 돌려받았어요`); }
    catch (e) { toast.error(e instanceof Error ? e.message : '처리하지 못했어요.'); }
  };
  const use = async (o: DecorOrder) => {
    if (!o.item_id) return;
    const on = equipped[o.slot] !== o.item_id;
    try { await shop.equip.mutateAsync({ slot: o.slot, item: on ? o.item_id : null }); toast.success(on ? `«${o.title}»(으)로 꾸몄어요` : '기본으로 돌아왔어요'); }
    catch (e) { toast.error(e instanceof Error ? e.message : '꾸미지 못했어요.'); }
  };

  return (
    <>
      <p className="mt-2 text-[12px] leading-5 opacity-80">
        꾸밀 자리 하나를 골라 원하는 모습을 글로 적으면 <b>관리자가 만들어서</b> 보내 줘요. 의뢰 값은 자리마다 달라요 — 거절되거나 거두면 돌려받아요.
        받은 물건은 <b>나만의 꾸미기</b>예요(교환할 수 없어요. 친구가 놀러 오면 보여요). 완성된 작품은 <b>가챠에도 들어가요</b> — 다른 친구가 뽑으면 의뢰한 나에게 코인이 와요.
      </p>
      {busy ? (
        <p className="mt-3 rounded-2xl bg-white/50 px-4 py-3 text-[13px]">진행 중인 꾸미기 의뢰가 있어요. 답을 받은 뒤 다시 의뢰할 수 있어요.</p>
      ) : (
        <div className="mt-3 space-y-2" data-decor-form>
          <div role="radiogroup" aria-label="꾸밀 자리" className="flex flex-wrap gap-1.5 text-[12px]">
            {DECOR_SLOTS.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={slot === s} onClick={() => setSlot(s)}
                className={cn('h-9 rounded-full px-3', slot === s ? (isClassic ? 'bg-white/90 text-indigo-950' : 'bg-violet-600 text-white') : isClassic ? 'bg-white/10' : 'bg-white/60')}>
                {SLOT_LABEL[s]} <span className="opacity-70">{DECOR_PRICES[s]}</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] opacity-70">
            {isModelSlot(slot) ? '새 기기(3D)를 개발자가 직접 만들어 보내요 — 모양·화면·버튼을 자세히 적어 주세요. 완성까지 몇 주 걸릴 수 있어요.'
              : isDesignSlot(slot) ? '관리자가 색과 무늬를 골라 만들어요 — 원하는 색과 분위기를 적어 주세요.' : '관리자가 작은 도트 소품을 그려서 보내요 — 무엇을 어떤 색으로 원하는지 적어 주세요.'}
            {isModelSlot(slot) ? ' 받은 기기는 꾸미기 «기기 종류»에서 골라요.' : slot === 'shell' ? ' 기기 디자인은 세 기기 모두에 입혀요.' : ' 방 꾸미기는 컬러 화면 기기의 방에 보여요.'}
          </p>
          <label className="block text-[12px] font-bold">
            이름 <span className="font-normal opacity-60">{title.trim().length}/20</span>
            <input value={title} maxLength={20} onChange={(e) => setTitle(e.target.value)} placeholder={slot === 'wallpaper' ? '예: 새벽 바다 벽지' : slot === 'shell' ? '예: 보라 별빛' : '예: 작은 우주선'}
              className="mt-1 h-11 w-full rounded-xl bg-white/80 px-3 text-[16px] font-normal text-violet-950" />
          </label>
          <label className="block text-[12px] font-bold">
            원하는 모습 <span className="font-normal opacity-60">{prompt.trim().length}/500 · 10자 이상</span>
            <textarea value={prompt} maxLength={500} rows={3} onChange={(e) => setPrompt(e.target.value)}
              placeholder={isDesignSlot(slot) ? '예: 새벽 바다처럼 푸른 바탕에 하얀 줄무늬' : '예: 은색 몸통에 빨간 날개가 달린 작은 우주선'}
              className="mt-1 w-full rounded-xl bg-white/80 px-3 py-2 text-[16px] font-normal leading-6 text-violet-950" />
          </label>
          <p className="text-[11px] opacity-70">글자·로고나 만화·게임 캐릭터를 그대로 넣는 의뢰는 거절될 수 있어요.</p>
          <button type="button" onClick={submit} disabled={!valid || short || decor.write.isPending}
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-violet-600 text-[14px] font-bold text-white disabled:opacity-50">
            <Sparkles className="h-4 w-4" aria-hidden="true" /> {short ? `코인이 모자라요(${price}코인)` : `${price}코인으로 의뢰하기`}
          </button>
        </div>
      )}
      {orders.length > 0 && (
        <ul className="mt-4 max-h-[40vh] space-y-2 overflow-y-auto pr-1">
          {orders.map((o) => {
            const using = !!o.item_id && equipped[o.slot] === o.item_id;
            const ready = !!o.item_id && ITEM_BY_ID.has(o.item_id);
            return (
              <li key={o.id} className="rounded-2xl bg-white/60 px-3 py-2 text-[13px]" data-decor-order={o.status}>
                <div className="flex min-w-0 items-center gap-2">
                  <b className="min-w-0 flex-1 truncate" title={o.title}>{o.title}</b>
                  <span className="shrink-0 text-[11px] opacity-70">{SLOT_LABEL[o.slot]}</span>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold',
                    o.status === 'delivered' ? 'bg-emerald-500 text-white' : o.status === 'declined' ? 'bg-rose-100 text-rose-700' : 'bg-violet-100 text-violet-800')}>
                    {using ? '쓰는 중' : DECOR_STATUS[o.status]}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[12px] opacity-75">{o.prompt}</p>
                {o.admin_note && <p className="mt-1 rounded-xl bg-white/70 px-2 py-1 text-[12px]">관리자: {o.admin_note}</p>}
                {o.status === 'declined' && o.refunded_coins > 0 && <p className="mt-0.5 text-[11px] opacity-70">{o.refunded_coins}코인을 돌려받았어요</p>}
                {o.status === 'delivered' && o.item_id && (
                  <div className="mt-2 space-y-2">
                    <div className="grid place-items-center">{ready ? <PrizePreview itemId={o.item_id} className="h-28 w-auto" /> : <p className="text-[11px] opacity-70">물건을 불러오는 중…</p>}</div>
                    <button type="button" onClick={() => void use(o)} disabled={!ready || shop.equip.isPending}
                      className="h-10 w-full rounded-full bg-violet-600 text-[13px] font-bold text-white disabled:opacity-50">
                      {using ? '빼기(기본으로)' : '바로 꾸미기'}
                    </button>
                  </div>
                )}
                {o.status === 'submitted' && (
                  <button type="button" onClick={() => void cancel(o)} className="mt-1.5 h-10 rounded-full bg-white/80 px-4 text-[12px]">거두기</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
