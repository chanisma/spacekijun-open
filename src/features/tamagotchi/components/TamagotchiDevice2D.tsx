/**
 * 2D 기기 — 3D 를 불러오는 동안 · WebGL 을 못 쓰는 기기 · 컨텍스트를 잃었을 때. 3D 와 같은 껍데기 그림·같은 화면·같은 자리의 버튼.
 * three.js 를 import 하지 않는다(dims·shellTheme 는 순수 값·캔버스 그리기라 가볍다).
 */
import { useMemo } from 'react';
import { cornerCapOutline, cornerRivet, eggOutline, handlePath, MODELS, wheelAxleY } from '../three/dims';
import { themeFor } from '../three/shellTheme';
import { BUTTON_LABELS, useButtonPress } from './useButtonPress';
import { HoldRing } from './LcdCanvas';
import { ScreenView } from './ScreenView';
import type { DeviceProps } from './deviceTypes';

export default function TamagotchiDevice2D({ style, subscribe, onPress, shellId }: DeviceProps) {
  const m = MODELS[style];
  const theme = themeFor(style, shellId);
  const pctX = (x: number) => `${(x / m.W + 0.5) * 100}%`;
  const pctY = (y: number) => `${(0.5 - y / m.H) * 100}%`;
  const { holding, bind } = useButtonPress(onPress);
  const shell = useMemo(() => theme.paint(512).toDataURL('image/png'), [theme]);
  const clip = useMemo(() => {
    const pts = eggOutline(m, 120).map(([x, y]) => `${((x / m.W + 0.5) * 100).toFixed(2)}% ${((0.5 - y / m.H) * 100).toFixed(2)}%`);
    return `polygon(${pts.join(',')})`;
  }, [m]);
  const s = m.screen;

  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="relative w-full max-w-[360px]" style={{ aspectRatio: `${m.W} / ${m.H}`, filter: 'drop-shadow(0 18px 24px rgba(8,10,40,0.45))' }}>
        <div className="absolute inset-0" style={{ clipPath: clip, backgroundImage: `url(${shell})`, backgroundSize: '100% 100%' }}>
          <div className="absolute inset-0" style={{ background: 'radial-gradient(70% 55% at 35% 25%, rgba(255,255,255,0.28), transparent 60%)' }} />
        </div>
        {(m.corners || m.handle) && (
          // 여행 가방형 — 위 손잡이 · 네 모서리 보호대와 징(3D 와 같은 윤곽, 장치 좌표 그대로 · y 뒤집기)
          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox={`${-m.W / 2} ${-m.H / 2} ${m.W} ${m.H}`} aria-hidden>
            <g transform="scale(1,-1)">
              {m.wheels && [1, -1].map((sx) => (
                <g key={`w${sx}`}>
                  <rect x={sx * m.wheels!.x - 0.13} y={wheelAxleY(m)} width={0.26} height={-m.H / 2 - wheelAxleY(m) + 0.05} rx={0.05} fill={theme.trim} />
                  <circle cx={sx * m.wheels!.x} cy={wheelAxleY(m)} r={m.wheels!.r} fill="#2b211c" />
                  <circle cx={sx * m.wheels!.x} cy={wheelAxleY(m)} r={m.wheels!.r * 0.42} fill="#d4a94e" />
                </g>
              ))}
              {m.handle && (
                <path d={`M ${handlePath(m).map(([x, y]) => `${x} ${y}`).join(' L ')}`} fill="none" stroke={theme.trim}
                  strokeWidth={m.handle.thick * 2.2} strokeLinecap="round" strokeLinejoin="round" />
              )}
              {([[1, 1], [-1, 1], [1, -1], [-1, -1]] as const).map(([sx, sy]) => {
                const [rx, ry] = cornerRivet(m, sx, sy);
                return (
                  <g key={`${sx}${sy}`}>
                    <polygon points={cornerCapOutline(m, sx, sy, 0.04).map(([x, y]) => `${x},${y}`).join(' ')} fill={theme.trim} />
                    <circle cx={rx} cy={ry} r={0.075} fill="#d4a94e" />
                  </g>
                );
              })}
            </g>
          </svg>
        )}
        {m.frame && (() => {
          // 디지털형 창틀 — 막대 넷 + 오른쪽 열쇠 구멍 탭(3D 와 같은 자리)
          const f = m.frame;
          const bar = (x: number, y: number, w: number, h: number, key: string) => (
            <div key={key} className="absolute rounded-[2px]" style={{
              left: pctX(x - w / 2), top: pctY(y + h / 2), width: `${(w / m.W) * 100}%`, height: `${(h / m.H) * 100}%`,
              background: theme.frame ?? theme.trim, boxShadow: '0 1px 2px rgba(0,0,0,0.35)',
            }} />
          );
          return [
            bar(f.x, f.y + f.h / 2 - f.bar / 2, f.w, f.bar, 't'), bar(f.x, f.y - f.h / 2 + f.bar / 2, f.w, f.bar, 'b'),
            bar(f.x - f.w / 2 + f.bar / 2, f.y, f.bar, f.h, 'l'), bar(f.x + f.w / 2 - f.bar / 2, f.y, f.bar, f.h, 'r'),
            bar(f.x + f.w / 2 - f.bar / 2, f.y, f.tab.w, f.tab.h, 'tab'),
          ];
        })()}
        <div className="absolute" style={{
          left: pctX((s.x ?? 0) - (s.w / 2 + s.pad)), top: pctY(s.y + s.h / 2 + s.pad), width: `${((s.w + s.pad * 2) / m.W) * 100}%`,
          padding: `${(s.pad / (s.w + s.pad * 2)) * 100}%`, borderRadius: style === 'color' ? '16%' : '18%', background: theme.bezel,
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.18)',
        }}>
          <div className="overflow-hidden" style={{ borderRadius: style === 'color' ? '5%' : '6%', boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.35)' }}>
            <ScreenView style={style} subscribe={subscribe} />
          </div>
        </div>
        {m.buttons.xs.map((x, i) => {
          const y = m.buttons.y + m.buttons.arc[i];
          return (
            <button key={i} type="button" aria-label={BUTTON_LABELS[i]} {...bind(i as 0 | 1 | 2)}
              className="absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full outline-none focus-visible:ring-4 focus-visible:ring-amber-300/80"
              style={{ left: pctX(x), top: pctY(y), width: `max(44px, ${((m.buttons.r * 2) / m.W) * 100}%)`, aspectRatio: '1', touchAction: 'none' }}>
              <span className="block rounded-full transition-transform duration-75"
                style={{
                  width: '72%', aspectRatio: '1', background: `radial-gradient(circle at 35% 30%, #ffffff, ${theme.button} 55%, #d8c7c3)`,
                  boxShadow: holding === i ? 'inset 0 2px 3px rgba(0,0,0,0.35)' : `0 2px 0 ${theme.socket}, 0 3px 5px rgba(0,0,0,0.35)`,
                  transform: holding === i ? 'translateY(2px)' : 'none',
                }} />
              {holding === i && <HoldRing size={44} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
