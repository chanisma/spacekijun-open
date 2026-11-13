/**
 * 꾸미기(Phase 3) — 가챠로 모은 물건을 자리마다 하나씩 쓴다. 기기 종류(2026-10-07)는 펫이 사는 기기 자체이고 기본은 컬러,
 * 기기 디자인은 세 기종 모두에, 방 꾸미기는 컬러 화면에 보인다.
 */
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { TamaDialog } from './AppChrome';
import { PrizePreview } from './PrizePreview';
import type { ShopController } from '../hooks/useShop';
import { RARITY, SLOTS, SLOT_LABEL, allItems, type ItemSlot } from '../model/catalog';
import { useCustomVersion } from '../hooks/useCustomVersion';
import { josa } from '../model/messages';
import { machineForSlot, type GachaMachineId } from '../model/gachaMachines';
import type { DeviceStyle } from '../three/dims';

export function DecorDialog({ open, onOpenChange, style, shop, onGacha, onRequest, grown = true }: {
  open: boolean; onOpenChange: (o: boolean) => void; style: DeviceStyle; shop: ShopController;
  /** 가챠로 — 지금 보는 자리의 기계를 넘긴다(2026-10-13) */
  onGacha: (machine: GachaMachineId) => void;
  /** 꾸미기 의뢰 창으로(2026-10-08) */
  onRequest?: () => void;
  /** 함께하는 펫이 다 자랐는가 — 캐릭터 스킨은 어른만 입는다(2026-10-13) */
  grown?: boolean;
}) {
  useCustomVersion(); // 나만의 꾸미기가 도착하면 목록을 다시 그린다
  const [slot, setSlot] = useState<ItemSlot>('shell');
  const data = shop.status.data;
  const owned = data?.owned ?? {};
  const equipped = data?.equipped ?? {};
  // 이벤트 전용 물건은 가진 것만 센다(이벤트가 끝나면 못 모으는 물건을 «아직 못 모은»에 넣지 않는다)
  // 나만의 꾸미기(의뢰)도 가진 것만 — 남이 만들 수 없는 물건이라 «아직 못 모은»에 넣지 않는다
  const items = allItems().filter((i) => i.slot === slot && (!(i.event || i.custom) || owned[i.id]));
  const mine = items.filter((i) => owned[i.id]);
  const isClassic = style === 'classic';

  const choose = async (id: string | null) => {
    try { await shop.equip.mutateAsync({ slot, item: id }); } catch (e) { toast.error(e instanceof Error ? e.message : '꾸미지 못했어요.'); }
  };

  return (
    <TamaDialog open={open} onOpenChange={onOpenChange} style={style} title="꾸미기" description="가챠로 모은 물건으로 기기와 방을 꾸며요" testId="decor">
      <div role="radiogroup" aria-label="꾸밀 자리" className="mt-3 flex flex-wrap gap-1.5 text-[12px]">
        {SLOTS.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={slot === s} onClick={() => setSlot(s)}
            className={cn('h-9 rounded-full px-3', slot === s ? (isClassic ? 'bg-white/90 text-indigo-950' : 'bg-violet-600 text-white') : isClassic ? 'bg-white/10' : 'bg-white/60')}>
            {SLOT_LABEL[s]} <span className="opacity-70">{allItems().filter((i) => i.slot === s && owned[i.id]).length}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] opacity-75">
        {slot === 'device' ? '펫이 사는 기기예요. 기본은 컬러 기기이고, 가챠로 모은 기기로 바꿀 수 있어요(펫과 꾸미기는 그대로).'
          : slot === 'character' ? (grown ? '컬러 화면에서 펫이 이 모습으로 지내요. 의뢰로 받은 캐릭터를 입고 있으면 그쪽이 먼저 보여요.'
            : '캐릭터 스킨은 다 자란(어른) 펫만 입을 수 있어요. 펫이 어른이 되면 고를 수 있어요.')
          : slot === 'shell' ? '기기 디자인은 컬러·클래식·디지털 세 기기 모두에 입혀요.' : '방 꾸미기는 컬러 화면 기기의 방에 보여요.'}
      </p>
      <div className="mt-2 grid max-h-[50vh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
        <button type="button" onClick={() => choose(null)} aria-pressed={!equipped[slot]}
          className={cn('flex min-h-32 flex-col items-center justify-center gap-1 rounded-2xl p-2 text-[12px]', isClassic ? 'bg-white/10' : 'bg-white/65', !equipped[slot] && 'ring-2 ring-violet-500')}>
          {slot === 'device' ? '컬러 (기본)' : '기본'}
        </button>
        {mine.map((i) => (
          <button key={i.id} type="button" onClick={() => choose(i.id)} aria-pressed={equipped[slot] === i.id}
            disabled={slot === 'character' && !grown && equipped[slot] !== i.id}
            className={cn('flex min-w-0 flex-col items-center gap-1 rounded-2xl p-2 text-[12px]', isClassic ? 'bg-white/10' : 'bg-white/65', equipped[slot] === i.id && 'ring-2 ring-violet-500', 'disabled:opacity-50')}>
            <PrizePreview itemId={i.id} className="h-24 w-auto" />
            <span className="w-full truncate font-bold" title={i.name}>{i.name}</span>
            <span className="text-[10px] font-bold" style={{ color: i.custom ? '#b8327a' : RARITY[i.rarity].color }}>{i.custom ? '나만의 꾸미기' : RARITY[i.rarity].label}</span>
          </button>
        ))}
      </div>
      {mine.length < items.length && (
        <div className="mt-3 flex items-center justify-between gap-2 text-[12px]">
          <span className="opacity-75">아직 못 모은 {SLOT_LABEL[slot]} {items.length - mine.length}개</span>
          <button type="button" onClick={() => onGacha(machineForSlot(slot))} className={cn('h-10 rounded-full px-4 font-bold', isClassic ? 'bg-white/90 text-indigo-950' : 'bg-violet-600 text-white')}>가챠 하러 가기</button>
        </div>
      )}
      {onRequest && slot !== 'character' && (
        <div className="mt-2 flex items-center justify-between gap-2 text-[12px]">
          <span className="opacity-75">원하는 {SLOT_LABEL[slot]}{josa(SLOT_LABEL[slot], '이', '가')} 없나요?</span>
          <button type="button" onClick={onRequest} className={cn('h-10 rounded-full px-4', isClassic ? 'bg-white/15' : 'bg-white/80 text-violet-950')}>나만의 꾸미기 의뢰하기</button>
        </div>
      )}
    </TamaDialog>
  );
}
