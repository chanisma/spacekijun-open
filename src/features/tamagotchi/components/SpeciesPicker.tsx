/**
 * 알의 종 고르기(2026-10-26) — 별 가족 + 키운 방식으로 해금한 종(물결·달·숲). 전파 가족은 통신으로 받은 알 표로만(여기 없다).
 * 잠긴 종은 그림자 알 + 수수께끼 한 줄(정답 = 해금 방법은 만난 뒤에 — branch.ts 의 hint 와 같은 결).
 * 해금 판정은 서버(tama_species_read) — 화면은 그 답을 그리기만 한다.
 */
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { baseCharacterSprite } from '../color/characters';
import { PixelBuf } from '../color/pixel';
import { useCustomVersion } from '../hooks/useCustomVersion';
import type { Stage } from '../model/petModel';
import { SPECIES_INFO, UNLOCK_SPECIES, type LookKey, type Species } from '../model/species';
import { lookOf } from '../model/species';

/** 펫 그림 한 칸 — 단계·모습 열쇠로(새 종 그림이 늦게 오면 판 번호로 다시 그린다) */
export function PetThumb({ stage, look, size = 48, silhouette = false }: { stage: Stage; look?: LookKey; size?: number; silhouette?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const version = useCustomVersion();
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const src = baseCharacterSprite(stage, 'idle0', false, look);
    const buf = new PixelBuf(src.w, src.h);
    buf.data.set(src.data);
    if (silhouette) for (let i = 0; i < buf.data.length; i += 4) if (buf.data[i + 3]) { buf.data[i] = 70; buf.data[i + 1] = 55; buf.data[i + 2] = 110; }
    const tmp = document.createElement('canvas');
    tmp.width = buf.w; tmp.height = buf.h;
    tmp.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(buf.data), buf.w, buf.h), 0, 0);
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, c.width, c.height);
    const k = Math.max(1, Math.floor(Math.min(c.width / buf.w, c.height / buf.h)));
    g.drawImage(tmp, (c.width - buf.w * k) / 2, (c.height - buf.h * k) / 2, buf.w * k, buf.h * k);
  }, [stage, look, silhouette, version]);
  return <canvas ref={ref} width={size} height={size} aria-hidden="true" className="shrink-0 [image-rendering:pixelated]" style={{ width: size, height: size }} />;
}

export function SpeciesPicker({ value, onChange, unlocked, classic, className }: {
  value: Species; onChange: (s: Species) => void; unlocked: Partial<Record<Species, boolean>>; classic: boolean; className?: string;
}) {
  const options: Species[] = ['star', ...UNLOCK_SPECIES];
  // 잠긴 종만 있으면(아직 아무것도 못 열었으면) 그래도 보여 준다 — 무엇이 있는지 아는 것이 재미다
  return (
    <div className={cn('text-[12px]', className)} data-species-picker={value}>
      <p className="mb-1 font-bold">어떤 알을 받을까요?</p>
      <div role="radiogroup" aria-label="알의 종" className={cn('grid grid-cols-4 gap-1 rounded-2xl p-1', classic ? 'bg-white/15' : 'bg-white/40')}>
        {options.map((s) => {
          const open = s === 'star' || unlocked[s] === true;
          return (
            <button key={s} type="button" role="radio" aria-checked={value === s} disabled={!open} onClick={() => onChange(s)}
              data-species-option={s} data-locked={open ? undefined : 'true'}
              className={cn('flex min-h-[64px] flex-col items-center justify-center rounded-xl px-1 py-1 transition',
                value === s ? 'bg-violet-600 text-white' : open ? 'opacity-85' : 'opacity-60')}>
              <PetThumb stage="egg" look={lookOf(s)} size={36} silhouette={!open} />
              <span className="mt-0.5 text-[11px] font-bold leading-tight">{open ? SPECIES_INFO[s].family : '???'}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 leading-5 opacity-80">
        {value === 'star' ? '습관으로 모습이 갈리는 별 가족이에요.' : `${SPECIES_INFO[value].family} — ${SPECIES_INFO[value].how}.`}
        {UNLOCK_SPECIES.some((s) => !unlocked[s]) && (
          <span className="block opacity-80">잠긴 알: {UNLOCK_SPECIES.filter((s) => !unlocked[s]).map((s) => SPECIES_INFO[s].hint).join(' · ')}</span>
        )}
      </p>
    </div>
  );
}
