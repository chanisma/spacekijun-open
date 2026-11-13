/**
 * 가챠 물건 미리보기 — 기기 디자인은 작은 달걀 기기, 기기 종류는 그 기기의 모양(기본 껍데기), 방 꾸미기는 그 물건을 놓은 방 한 장(도트 그대로 확대).
 * 상품 카드와 꾸미기 창이 같이 쓴다. 3D 를 쓰지 않는다(이 컴포넌트는 three 를 import 하지 않는다).
 */
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { ITEM_BY_ID } from '../model/catalog';
import { COLOR_MODEL, MODELS, cornerCapOutline, eggOutline, handlePath, wheelAxleY, type DeviceModel } from '../three/dims';
import { SHELL_FOR, shellFromSpec, type ShellTheme } from '../three/shellTheme';
import { roomPreview } from '../color/colorScreen';
import { artSheetOf } from '../color/artSprites';
import { PixelBuf } from '../color/pixel';
import { useCustomVersion } from '../hooks/useCustomVersion';

export function PrizePreview({ itemId, className, locked = false }: { itemId: string; className?: string; locked?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const version = useCustomVersion();
  const item = ITEM_BY_ID.get(itemId);

  useEffect(() => {
    const c = ref.current;
    if (!c || !item) return;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    if (item.shell) drawDevice(c, COLOR_MODEL, shellFromSpec(COLOR_MODEL, item.id, item.name, item.shell), '#3b3070');
    else if (item.device) drawDevice(c, MODELS[item.device], SHELL_FOR[item.device], item.device === 'classic' ? '#a9b78f' : '#3b3070');
    else {
      // 캐릭터(2026-10-13) = 빈 방 가운데에 그 캐릭터(가만히). 그림이 오기 전엔 빈 방
      // roomPreview 는 캐시 버퍼라 그 위에 그리지 않고 복사본에 얹는다
      const room = roomPreview(item.slot === 'character' ? {} : { [item.slot]: item.id });
      const buf = new PixelBuf(room.w, room.h);
      buf.data.set(room.data);
      const sheet = item.slot === 'character' ? artSheetOf(item.id) : undefined;
      if (sheet) buf.blit(sheet.idle, Math.round((buf.w - sheet.idle.w) / 2), buf.h - sheet.idle.h - 22);
      const img = new ImageData(new Uint8ClampedArray(buf.data), buf.w, buf.h);
      const tmp = document.createElement('canvas');
      tmp.width = buf.w; tmp.height = buf.h;
      tmp.getContext('2d')!.putImageData(img, 0, 0);
      g.imageSmoothingEnabled = false;
      const side = Math.min(c.width, c.height);
      g.drawImage(tmp, (c.width - side) / 2, (c.height - side) / 2, side, side);
    }
  }, [item, version]);

  if (!item) return null;
  const device = item.shell || item.device;
  const [w, h] = item.device === 'digimon' ? [260, 200] : device ? [200, 240] : [256, 256];
  return (
    <canvas ref={ref} width={w} height={h} role="img" aria-label={`${item.name} 미리보기`}
      className={cn('max-w-full', !device && '[image-rendering:pixelated] rounded-xl', locked && 'opacity-30 grayscale', className)} />
  );
}

/** 작은 기기 한 대 — 외곽선 안에 껍데기 그림 · 창틀(디지털형) · 화면 테와 유리 · 버튼. 기기 비율 그대로(늘리지 않는다). */
function drawDevice(c: HTMLCanvasElement, m: DeviceModel, theme: ShellTheme, glass: string) {
  const g = c.getContext('2d')!;
  const size = 512;
  const tex = theme.paint(size);
  const pad = 6;
  // 여행 가방형은 몸 위로 손잡이가 솟는다 — 그 높이까지 담는다
  // 바퀴는 몸 아래로 내려온다
  const lift = m.handle ? m.handle.h + m.handle.thick : 0;
  const drop = m.wheels ? -m.H / 2 - (wheelAxleY(m) - m.wheels.r) : 0;
  const k = Math.min((c.width - pad * 2) / m.W, (c.height - pad * 2) / (m.H + lift + drop));
  const dw = m.W * k, dh = m.H * k, ox = (c.width - dw) / 2, oy = (c.height - dh + (lift - drop) * k) / 2;
  const P = (x: number, y: number): [number, number] => [ox + (x / m.W + 0.5) * dw, oy + (0.5 - y / m.H) * dh];
  const outline = () => {
    g.beginPath();
    eggOutline(m, 120, 0).map(([x, y]) => P(x, y)).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
  };
  g.save();
  outline();
  g.clip();
  g.drawImage(tex, ox, oy, dw, dh);
  const s = m.screen;
  const sx0 = s.x ?? 0;
  if (m.frame) {
    const f = m.frame;
    const [fx, fy] = P(f.x - f.w / 2, f.y + f.h / 2);
    g.fillStyle = theme.frame ?? theme.trim;
    g.beginPath(); g.roundRect(fx, fy, f.w * k, f.h * k, 0.2 * k); g.fill();
  }
  const [bx, by] = P(sx0 - s.w / 2 - s.pad, s.y + s.h / 2 + s.pad);
  g.fillStyle = theme.bezel;
  g.beginPath(); g.roundRect(bx, by, (s.w + s.pad * 2) * k, (s.h + s.pad * 2) * k, Math.max(2, s.bezelRadius * k)); g.fill();
  const [gx, gy] = P(sx0 - s.w / 2, s.y + s.h / 2);
  g.fillStyle = glass;
  g.fillRect(gx, gy, s.w * k, s.h * k);
  m.buttons.xs.forEach((x, i) => {
    const [px, py] = P(x, m.buttons.y + m.buttons.arc[i]);
    g.fillStyle = theme.button;
    g.beginPath(); g.arc(px, py, m.buttons.r * 0.85 * k, 0, Math.PI * 2); g.fill();
  });
  g.restore();
  if (m.handle) {
    g.beginPath();
    handlePath(m).map(([x, y]) => P(x, y)).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.lineWidth = m.handle.thick * 2.2 * k;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = theme.trim;
    g.stroke();
  }
  if (m.wheels) {
    for (const sx of [1, -1]) {
      const [wx, wy] = P(sx * m.wheels.x, wheelAxleY(m));
      g.fillStyle = theme.trim;
      g.fillRect(wx - 0.13 * k, P(0, -m.H / 2)[1] - 0.05 * k, 0.26 * k, wy - P(0, -m.H / 2)[1]);
      g.fillStyle = '#2b211c';
      g.beginPath(); g.arc(wx, wy, m.wheels.r * k, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#d4a94e';
      g.beginPath(); g.arc(wx, wy, m.wheels.r * 0.42 * k, 0, Math.PI * 2); g.fill();
    }
  }
  if (m.corners) {
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
      g.beginPath();
      cornerCapOutline(m, sx, sy, 0.04).map(([x, y]) => P(x, y)).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.fillStyle = theme.trim;
      g.fill();
    }
  }
  outline();
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(60,40,110,0.35)';
  g.stroke();
}
