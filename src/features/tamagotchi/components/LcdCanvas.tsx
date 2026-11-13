/** 버튼 둘레에 차오르는 길게 누르기 링 — 3D·2D 기기가 같이 쓴다. (2D 화면은 `ScreenView`) */
export function HoldRing({ size }: { size: number }) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  return (
    <svg className="pointer-events-none absolute inset-0" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,226,150,0.95)" strokeWidth={3}
        strokeDasharray={c} strokeDashoffset={c} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ animation: 'tama-hold 550ms linear forwards', ['--tama-c' as string]: `${c}` }} />
    </svg>
  );
}
