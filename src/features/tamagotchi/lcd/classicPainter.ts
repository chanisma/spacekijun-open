/**
 * 클래식 화면 그리개 — `ScreenInput` → 32×16 프레임 → 반사형 LCD 캔버스. 그림이 그대로면 다시 칠하지 않는다.
 */
import { composeFrame } from './deviceUi';
import { frameKey } from './frame';
import { PANEL, paintLcd } from './lcdPainter';
import type { ScreenInput } from '../model/screenInput';

export interface ScreenPainter {
  readonly canvas: HTMLCanvasElement;
  /** 다시 그린다. 그림이 그대로면 false */
  draw(input: ScreenInput): boolean;
}

export class ClassicScreenPainter implements ScreenPainter {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private lastKey = '';

  constructor(private readonly scale = 1.6) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(PANEL.w * scale);
    this.canvas.height = Math.round(PANEL.h * scale);
    this.ctx = this.canvas.getContext('2d')!;
  }

  draw(input: ScreenInput): boolean {
    const frame = composeFrame({
      ui: input.ui, state: input.state, view: input.view, now: input.now,
      messageKinds: input.messages.map((m) => m.kind), unread: input.unread,
    });
    const key = frameKey(frame);
    if (key === this.lastKey) return false;
    this.lastKey = key;
    paintLcd(this.ctx, frame, this.scale);
    return true;
  }
}
