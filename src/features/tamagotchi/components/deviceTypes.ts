import type { ScreenInput } from '../model/screenInput';
import type { DeviceStyle } from '../three/dims';
import { ClassicScreenPainter, type ScreenPainter } from '../lcd/classicPainter';
import { ColorScreenPainter } from '../color/colorPainter';

/** 3D·2D 기기가 같은 모양으로 받는 것. 3D 모듈에 두지 않는다 — 2D 쪽이 3D 파일을 import 하는 일 자체를 없앤다. */
export interface DeviceProps {
  style: DeviceStyle;
  subscribe: (cb: (input: ScreenInput) => void) => () => void;
  onPress: (index: 0 | 1 | 2, long: boolean) => void;
  onContextLost?: () => void;
  /** 가챠에서 고른 기기 디자인(물건 id) — 없으면 기종의 기본 껍데기 */
  shellId?: string | null;
  /** 기기가 처음 실제로 그려졌을 때(첫 로딩 화면을 걷는 신호 — 2026-10-09) */
  onReady?: () => void;
}

/** 기기 모양에 맞는 화면 그리개 */
export function createPainter(style: DeviceStyle, size?: number): ScreenPainter {
  // 클래식만 흑백 LCD — 나머지(컬러 · 디지털)는 컬러 화면(2026-10-07 사용자 결정)
  return style === 'classic' ? new ClassicScreenPainter(size) : new ColorScreenPainter(size);
}
