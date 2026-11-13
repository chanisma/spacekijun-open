import { createContext } from 'react';
export const GameSurfaceContext = createContext<HTMLElement | null>(null);
/**
 * 장면 패널(ScenePanel)의 기본 «돌아가기» 문구 — 지금 리아가 서 있는 장소로 돌아간다(2026-10-03).
 * 핵심 기능 줄 덕분에 망원경·연구대·플래너를 어느 장소에서든 펼치므로, 패널마다 «연구시설로»처럼 박아 둔 문구는
 * 광장에서 연 학생에게 거짓말이 되었다. 패널이 문구를 직접 주면(backLabel) 그것이 이긴다.
 */
export const SceneReturnContext = createContext<string>('← 돌아가기');
