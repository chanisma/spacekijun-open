/**
 * 컬러 화면(128×128 버퍼) → 기기에 붙는 캔버스. 3D 텍스처와 2D 화면이 같은 함수를 쓴다.
 *
 * 실물 컬러 TFT 를 가까이서 보면 보이는 것 둘을 넣었다:
 *  ① 화소 사이의 아주 가는 검은 틈(4배로 키운 뒤 4칸마다 옅은 선)
 *  ② 백라이트가 가운데서 조금 더 밝다(가장자리로 갈수록 살짝 어둡게)
 */
import { PixelBuf } from './pixel';
import { COLOR_SIZE, drawColorScreen } from './colorScreen';
import type { ScreenInput } from '../model/screenInput';

export const COLOR_SCALE = 4;
export const COLOR_CANVAS = COLOR_SIZE * COLOR_SCALE;

export class ColorScreenPainter {
  readonly canvas: HTMLCanvasElement;
  private readonly buf = new PixelBuf(COLOR_SIZE, COLOR_SIZE);
  private readonly small: HTMLCanvasElement;
  private readonly smallCtx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly overlay: HTMLCanvasElement;
  private lastHash = -1;

  constructor(size = COLOR_CANVAS) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = size;
    this.small = document.createElement('canvas');
    this.small.width = this.small.height = COLOR_SIZE;
    this.smallCtx = this.small.getContext('2d')!;
    this.image = this.smallCtx.createImageData(COLOR_SIZE, COLOR_SIZE);
    this.overlay = makeOverlay(size);
  }

  /** 다시 그린다. 그림이 그대로면 false(텍스처를 다시 올리지 않는다). */
  draw(input: ScreenInput): boolean {
    drawColorScreen(this.buf, input);
    const hash = this.buf.hash();
    if (hash === this.lastHash) return false;
    this.lastHash = hash;
    this.image.data.set(this.buf.data);
    this.smallCtx.putImageData(this.image, 0, 0);
    const g = this.canvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.drawImage(this.small, 0, 0, this.canvas.width, this.canvas.height);
    g.drawImage(this.overlay, 0, 0);
    return true;
  }
}

function makeOverlay(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const step = size / COLOR_SIZE;
  g.fillStyle = 'rgba(0,0,0,0.16)';
  for (let i = 0; i < COLOR_SIZE; i += 1) {
    g.fillRect(Math.round(i * step), 0, Math.max(1, step / 4), size);
    g.fillRect(0, Math.round(i * step), size, Math.max(1, step / 4));
  }
  const light = g.createRadialGradient(size / 2, size * 0.45, size * 0.2, size / 2, size / 2, size * 0.75);
  light.addColorStop(0, 'rgba(255,255,255,0.05)');
  light.addColorStop(1, 'rgba(0,0,20,0.22)');
  g.fillStyle = light;
  g.fillRect(0, 0, size, size);
  return c;
}
