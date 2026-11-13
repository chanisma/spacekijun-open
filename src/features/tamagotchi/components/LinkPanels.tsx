/**
 * 통신(2026-10-26 — 실시간, 원작 적외선 통신처럼). 사용자 결정: 둘이 동시에 접속 · 새 친구와 첫 통신이면 둘 다 전파 가족 알.
 *
 * - LinkTab: 친구 창 «통신» 탭 — 친구에게 통신 걸기 · 기다리는 동안 남은 초 · 취소
 * - LinkIncomingCard: 다마고찌 화면 어디서든 받은 신청 카드(2분 안에 [받기])
 * - LinkMeetDialog: 통신이 이어지면 두 펫이 화면 양쪽에서 걸어와 인사하는 연출 + 첫 통신이면 알
 * 통신 결과 판정·알 표는 서버(tama_link_write). 화면은 그리기만.
 */
import { useEffect, useRef, useState } from 'react';
import { Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { readStoredJson, writeStoredJson } from '@/lib/safeLocalStorage';
import { baseCharacterSprite } from '../color/characters';
import { PixelBuf } from '../color/pixel';
import { STAGE_LABEL, type Stage } from '../model/petModel';
import { linkSecondsLeft, type TamaLink } from '../model/link';
import { lookOf, speciesOf, type LookKey, type PetBranch } from '../model/species';
import type { TamaFriend } from '../services/socialService';
import type { useLinks } from '../hooks/useSpecies';
import { TamaDialog } from './AppChrome';
import { josa } from '../model/messages';
import { PetThumb } from './SpeciesPicker';
import type { DeviceStyle } from '../three/dims';

type Links = ReturnType<typeof useLinks>;
const asStage = (s: string | null | undefined): Stage => (s && s in STAGE_LABEL ? (s as Stage) : 'baby');
const friendLook = (f: TamaFriend | undefined): LookKey | undefined =>
  f?.pet ? lookOf(speciesOf(f.pet), f.pet.stage === 'adult' ? (f.pet.branch as PetBranch | null) : null) : undefined;

/** 통신할 수 없는 이유(없으면 null) — 서버도 같은 것을 거절한다(알에서 나온 함께하는 펫이 있어야 한다) */
export function linkBlock(view: { stage: Stage; dead: boolean; inClass: boolean } | null): string | null {
  if (!view) return '함께하는 펫이 있어야 통신할 수 있어요.';
  if (view.dead) return '별이 된 펫과는 통신할 수 없어요.';
  if (view.stage === 'egg') return '알에서 나오면 통신할 수 있어요.';
  if (view.inClass) return '수업 중에는 통신할 수 없어요.';
  return null;
}

export function LinkTab({ friends, links, block, classic }: { friends: TamaFriend[]; links: Links; block: string | null; classic: boolean }) {
  const out = links.outgoing;
  const offer = (f: TamaFriend) => links.act.mutate({ action: 'offer', payload: { friend: f.id } }, {
    onError: (e) => toast.error(e instanceof Error ? e.message : '통신을 걸지 못했어요.'),
  });
  return (
    <div className="mt-3 text-[13px]" data-link-tab>
      <p className="rounded-2xl bg-white/40 px-3 py-2 text-[12px] leading-5">
        친구도 다마고찌를 <b>지금 열어 두고</b> 있어야 해요. 통신을 걸면 친구 화면에 카드가 뜨고, <b>2분 안에</b> 받으면 두 펫이 만나요.
        <span className="block">처음 통신하는 친구면 <b>둘 다 전파 가족 알</b>을 받아요(펫 집 › 창고).</span>
      </p>
      {block && <p className="mt-2 text-[12px] text-rose-500">{block}</p>}
      {out && (
        <div className="mt-2 flex items-center gap-2 rounded-2xl bg-violet-600/90 px-3 py-2 text-white" data-link-waiting>
          <Radio className="h-4 w-4 shrink-0 animate-pulse" aria-hidden="true" />
          <span className="min-w-0 flex-1">{out.partner}에게 신호를 보내는 중… <b className="tabular-nums">{linkSecondsLeft(out, links.serverNow)}초</b></span>
          <button type="button" onClick={() => links.act.mutate({ action: 'cancel', payload: { id: out.id } })}
            className="h-9 shrink-0 rounded-full bg-white/20 px-3 text-[12px] font-bold">취소</button>
        </div>
      )}
      <ul className="mt-2 max-h-[45vh] space-y-1.5 overflow-y-auto pr-1">
        {friends.map((f) => (
          <li key={f.id} className={cn('flex min-h-12 min-w-0 items-center gap-3 rounded-2xl px-3 py-1.5', classic ? 'bg-white/10' : 'bg-white/60')}>
            {f.pet ? <PetThumb stage={asStage(f.pet.stage)} look={friendLook(f)} size={36} /> : <span className="h-9 w-9" />}
            <span className="min-w-0 flex-1">
              <b className="block truncate">{f.name}</b>
              <span className="block truncate text-[11px] opacity-75">{f.pet ? `${f.pet.name} · ${STAGE_LABEL[asStage(f.pet.stage)]}` : '아직 펫이 없어요'}</span>
            </span>
            <button type="button" onClick={() => offer(f)} disabled={!!block || !!out || !f.pet || f.pet.stage === 'egg' || !!f.pet.dead || links.act.isPending}
              data-link-offer={f.id}
              className="h-11 shrink-0 rounded-full bg-blue-600 px-3 text-[12px] font-bold text-white hover:bg-blue-700 disabled:opacity-40">통신 걸기</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LinkIncomingCard({ links, block }: { links: Links; block: string | null }) {
  const l = links.incoming;
  if (!l) return null;
  const act = (action: 'accept' | 'decline') => links.act.mutate({ action, payload: { id: l.id } }, {
    onSuccess: (r) => { if (r?.status === 'expired') toast.error('시간이 지나 통신이 끊겼어요.'); },
    onError: (e) => toast.error(e instanceof Error ? e.message : '통신을 받지 못했어요.'),
  });
  return (
    <div role="alertdialog" aria-label="받은 통신" data-link-incoming={l.id}
      className="tama-chip tama-pop fixed inset-x-4 top-20 z-50 mx-auto max-w-sm rounded-3xl p-4 text-violet-950 shadow-2xl">
      <p className="flex items-center gap-2 text-[14px] font-bold"><Radio className="h-4 w-4 animate-pulse" aria-hidden="true" /> {l.partner}{josa(l.partner, '이', '가')} 통신을 걸어왔어요</p>
      <p className="mt-1 text-[12px] opacity-80">{linkSecondsLeft(l, links.serverNow)}초 안에 받으면 두 펫이 만나요.{block ? ` — ${block}` : ''}</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => act('decline')} disabled={links.act.isPending} className="h-11 flex-1 rounded-full bg-white/60 text-[13px] font-bold">거절</button>
        <button type="button" onClick={() => act('accept')} disabled={links.act.isPending || !!block} data-link-accept
          className="h-11 flex-1 rounded-full bg-blue-600 text-[13px] font-bold text-white hover:bg-blue-700 disabled:opacity-40">받기</button>
      </div>
    </div>
  );
}

const SEEN_KEY = 'tamagotchi:link-seen:v1';
const readSeen = () => readStoredJson<string[]>(SEEN_KEY, [], (v): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string'));

/** 아직 연출을 보지 않은, 이어진 통신(10분 안) — 받은 쪽·건 쪽 모두 */
export function unseenMeeting(links: TamaLink[] | undefined): TamaLink | null {
  const seen = new Set(readSeen());
  return links?.find((l) => l.status === 'accepted' && !seen.has(l.id)) ?? null;
}

/** 두 펫이 만나는 장면(128×64) — 양쪽에서 걸어와 가운데서 인사, 하트 */
function MeetScene({ mine, theirs }: { mine: { stage: Stage; look?: LookKey }; theirs: { stage: Stage; look?: LookKey } }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const toCanvas = (b: PixelBuf, flip = false) => {
      const t = document.createElement('canvas');
      t.width = b.w; t.height = b.h;
      const tg = t.getContext('2d')!;
      tg.putImageData(new ImageData(new Uint8ClampedArray(b.data), b.w, b.h), 0, 0);
      if (!flip) return t;
      const f = document.createElement('canvas');
      f.width = b.w; f.height = b.h;
      const fg = f.getContext('2d')!;
      fg.translate(b.w, 0); fg.scale(-1, 1); fg.drawImage(t, 0, 0);
      return f;
    };
    let raf = 0;
    const start = performance.now();
    const W = 128, H = 64, GROUND = 58;
    const draw = (now: number) => {
      const t = Math.min(1, (now - start) / 1800);
      const ease = 1 - (1 - t) ** 3;
      const happy = t >= 1 && Math.floor((now - start) / 300) % 2 === 0;
      const a = baseCharacterSprite(mine.stage, happy ? 'happy' : 'idle0', false, mine.look);
      const b = baseCharacterSprite(theirs.stage, happy ? 'happy' : 'idle0', false, theirs.look);
      g.clearRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(0, GROUND, W, H - GROUND);
      // 왼쪽 밖 → 가운데 왼편, 오른쪽 밖 → 가운데 오른편(친구 펫은 마주 보게 뒤집는다)
      const ax = -a.w + (W / 2 - 2) * ease, bx = W - (W / 2 - 2) * ease;
      g.drawImage(toCanvas(a), Math.round(ax), GROUND - a.h);
      g.drawImage(toCanvas(b, true), Math.round(bx), GROUND - b.h);
      if (t >= 1) {
        // 하트 — 가운데 위로 떠오른다
        const k = ((now - start - 1800) % 1200) / 1200;
        g.fillStyle = '#ec4899';
        const hx = W / 2, hy = 18 - k * 10;
        [[0, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [2, 1], [3, 1], [0, 2], [1, 2], [2, 2], [1, 3]].forEach(([x, y]) => g.fillRect(hx - 2 + x * 2, hy + y * 2, 2, 2));
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [mine, theirs]);
  return <canvas ref={ref} width={128} height={64} aria-hidden="true" className="w-full rounded-2xl bg-sky-200/60 [image-rendering:pixelated]" />;
}

/**
 * 이어진 통신의 연출 — 한 통신에 한 번(이 기기의 기억). 열리는 순간 내 펫이 반가워한다(cheer — 돌보기가 아니라 소식).
 * 첫 통신이면 전파 가족 알을 보여 주고 펫 집(창고)으로 안내한다.
 */
export function LinkMeetDialog({ links, friends, mine, style, onCheer, onOpenHouse }: {
  links: Links; friends: TamaFriend[]; mine: { stage: Stage; look?: LookKey } | null; style: DeviceStyle;
  onCheer: (partner: string) => void; onOpenHouse: () => void;
}) {
  const [shown, setShown] = useState<TamaLink | null>(null);
  const meeting = unseenMeeting(links.links.data?.links);
  useEffect(() => {
    if (!meeting || shown || !mine) return;
    writeStoredJson(SEEN_KEY, [...readSeen(), meeting.id].slice(-50));
    setShown(meeting);
    onCheer(meeting.partner);
  }, [meeting, shown, mine, onCheer]);
  if (!shown || !mine) return null;
  const partnerId = shown.mine ? shown.to_user : shown.from_user;
  const friend = friends.find((f) => f.id === partnerId);
  const theirs = { stage: asStage(friend?.pet?.stage), look: friendLook(friend) };
  return (
    <TamaDialog open onOpenChange={(o) => { if (!o) setShown(null); }} style={style} title="통신 성공!" description={`${shown.partner}의 펫과 만났어요`} testId="link-meet">
      <div className="mt-3" data-link-meet={shown.first_contact ? 'first' : 'again'}>
        <MeetScene mine={mine} theirs={theirs} />
        <p className="mt-3 text-[13px] leading-5">{friend?.pet ? `${shown.partner}의 펫 «${friend.pet.name}»${josa(friend.pet.name, '과', '와')}` : `${shown.partner}의 펫과`} 반갑게 인사했어요.</p>
        {shown.first_contact && (
          <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white/50 p-3" data-link-egg>
            <PetThumb stage="egg" look={lookOf('signal')} size={48} />
            <p className="min-w-0 flex-1 text-[13px] leading-5"><b>전파 가족 알</b>을 받았어요! 통신으로만 만날 수 있는 알이에요. 펫 집 › 창고에서 깨울 수 있어요.</p>
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => setShown(null)} className="h-11 flex-1 rounded-full bg-white/60 text-[13px] font-bold">닫기</button>
          {shown.first_contact && (
            <button type="button" onClick={() => { setShown(null); onOpenHouse(); }} className="h-11 flex-1 rounded-full bg-blue-600 text-[13px] font-bold text-white hover:bg-blue-700">펫 집 열기</button>
          )}
        </div>
      </div>
    </TamaDialog>
  );
}
