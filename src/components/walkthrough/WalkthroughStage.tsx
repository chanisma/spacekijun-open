/**
 * 씬을 올리는 무대 — 좌표계와 색 토큰을 고정한다.
 *
 * ── 왜 고정 캔버스인가 ─────────────────────────────────────────────────────
 * walkthrough 씬은 **포인터 웨이포인트를 % 로, 글자를 px 로** 적는다. 무대가
 * 모달 폭을 그대로 따라가면 같은 씬이 노트북에서는 글자가 크고 큰 모니터에서는
 * 작아지며, 무엇보다 **포인터가 버튼 위에 있는지가 폭마다 달라진다**(목업 안
 * 요소는 px 로 잡혀 있는데 % 좌표는 상대값이라 둘이 함께 늘어나지 않는다).
 *
 * 그래서 항상 **1280×720 캔버스에 그리고 통째로 축소**한다. 배치가 한 번 맞으면
 * 어느 화면에서도 같고, 저작할 때 좌표를 px 로 계산해 % 로 옮기는 산수가 성립한다.
 * (덱 엔진이 슬라이드를 다루는 방식과 같다 — 그래서 씬 코드가 그대로 오간다.)
 *
 * ── 색 토큰 ────────────────────────────────────────────────────────────────
 * 씬 코드는 `var(--primary)` 같은 덱 토큰을 쓴다. 여기서 **캔버스 루트에만** 정의해
 * 앱 전역 CSS 를 오염시키지 않는다. 값은 이 앱의 팔레트에 맞췄다(브랜드=인디고).
 */
import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * 씬 저작 기준 캔버스. 좌표·글자 크기는 전부 이 크기 기준으로 적는다.
 *
 * **960 인 이유는 글자 크기다.** 캔버스가 클수록 축소 배율이 작아지고, 목업 안 글자가
 * 그만큼 함께 줄어든다 — 1280 캔버스를 안내 모달의 시연 칸(약 870px)에 넣으면 배율이
 * 0.68 이라 14px 글자가 화면에서 9.5px 이 되어 읽히지 않는다. 960 이면 배율이 약 0.9 라
 * 저작할 때 적은 크기가 화면에서 거의 그대로 나온다(16:9 는 유지).
 */
export const STAGE_W = 960;
export const STAGE_H = 540;

/** 씬이 쓰는 덱 토큰 — 이 앱 팔레트로 매핑 */
const STAGE_TOKENS: React.CSSProperties & Record<string, string> = {
  '--bg': '#ffffff',
  '--fg': '#0f172a',          // slate-900
  '--fg-muted': '#64748b',    // slate-500
  '--fg-faint': '#94a3b8',    // slate-400
  '--hair': '#e2e8f0',        // slate-200
  '--hair-2': '#f1f5f9',      // slate-100
  '--primary': '#4f46e5',     // brand-600
  '--accent-ink': '#ffffff',
  '--shadow': '0 18px 40px -18px rgba(15, 23, 42, 0.35)',
  '--glow': '0 0 0 4px rgba(79, 70, 229, 0.18)',
  '--font-mono': 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
};

export const WalkthroughStage: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => setScale(host.clientWidth / STAGE_W);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={hostRef}
      className={cn('relative w-full overflow-hidden', className)}
      // 축소된 캔버스만큼만 자리를 차지해야 아래 내용이 뜨지 않는다
      style={{ height: STAGE_H * scale }}
    >
      <div
        style={{
          ...STAGE_TOKENS,
          position: 'absolute',
          left: 0,
          top: 0,
          width: STAGE_W,
          height: STAGE_H,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          color: 'var(--fg)',
          background: 'var(--bg)',
          // 씬 안 글자는 본문 폰트를 그대로 쓴다(모노는 토큰으로 따로 지정)
          fontFamily: 'inherit',
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default WalkthroughStage;
