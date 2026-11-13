/**
 * 목업 원자 — 안내 씬이 우리 앱 화면을 흉내 낼 때 쓰는 최소 부품.
 *
 * ── 이것은 "목업 템플릿"이 아니다 ──────────────────────────────────────────
 * 원래 walkthrough 문법은 **목업용 공용 템플릿을 만들지 말라**고 한다 — 화면 내용은
 * 씬마다 자유롭게 저작해야 그 화면의 성격이 살기 때문이다. 여기 있는 것은 화면이
 * 아니라 **버튼·입력칸·회색 막대** 같은 원자이고, 안내 씬들이 전부 **같은 앱**을
 * 보여 주므로 버튼이 화면마다 다르게 생기면 오히려 거짓말이 된다.
 *
 * 화면 구조(어떤 창에 무엇이 어떻게 놓이는지)는 여전히 씬마다 직접 짠다.
 *
 * 좌표계는 `WalkthroughStage` 의 고정 캔버스 px (`stageCoords.ts` 참고).
 */
import React from 'react';
import { interpolate } from '@/lib/walkthrough';
import { boxOf, type Rect } from './stageCoords';

/** 내용 대신 자리를 암시하는 회색 막대 — 랜드마크가 아닌 것은 전부 이걸로 */
export const Stub: React.FC<{ w: number; h?: number; o?: number }> = ({ w, h = 6, o = 1 }) => (
  <span style={{
    display: 'block', width: w, height: h, borderRadius: h / 2,
    background: 'var(--hair)', opacity: o,
  }} />
);

/** 목업 버튼. `flash` 는 `clickFlash()` 강도(0~1) — 클릭 순간 빛난다 */
export const Btn: React.FC<{
  rect: Rect;
  label: string;
  /** primary=주 행동 · brand=그라데이션(서명 요청 등) · ghost=보조 · ok=완료 */
  tone?: 'primary' | 'ghost' | 'brand' | 'ok';
  flash?: number;
}> = ({ rect, label, tone = 'primary', flash = 0 }) => (
  <span style={{
    ...boxOf(rect),
    display: 'grid', placeItems: 'center',
    borderRadius: 8, fontSize: 12.5, fontWeight: 650, whiteSpace: 'nowrap',
    background: tone === 'ghost' ? 'transparent'
      : tone === 'brand' ? 'linear-gradient(90deg,#8b5cf6,#4f46e5)'
      : tone === 'ok' ? '#059669'
      : 'var(--primary)',
    color: tone === 'ghost' ? 'var(--fg-muted)' : 'var(--accent-ink)',
    border: tone === 'ghost' ? '1px solid var(--hair)' : 'none',
    boxShadow: flash > 0 ? `0 0 0 ${6 * flash}px rgba(79,70,229,${0.28 * flash})` : undefined,
  }}>{label}</span>
);

/**
 * 입력칸.
 *
 * **`inline` 은 표 셀처럼 "흐름 안"에 넣을 때 쓴다.** 기본값은 `boxOf` 절대배치인데,
 * 절대배치는 **가장 가까운 위치 지정 조상**을 기준으로 하므로 `position:static` 인
 * 표 셀 안에 넣으면 셀이 아니라 **창 본문 좌상단**에 그려진다(실제로 구매 신청 안내의
 * 품목명 칸이 표 밖으로 튀어나갔다). 흐름 안에서는 좌표가 아니라 크기만 쓴다.
 */
export const Field: React.FC<{
  rect: Rect; children?: React.ReactNode; flash?: number; inline?: boolean;
}> = ({ rect, children, flash = 0, inline = false }) => (
  <span style={{
    ...(inline
      ? { display: 'inline-flex', width: rect.w, height: rect.h, verticalAlign: 'middle' }
      : { ...boxOf(rect), display: 'flex' }),
    alignItems: 'center', gap: 4, padding: '0 9px',
    borderRadius: 7, fontSize: 12.5, color: 'var(--fg-muted)',
    border: `1px solid ${flash > 0 ? 'var(--primary)' : 'var(--hair)'}`,
    background: 'var(--bg)',
    boxSizing: 'border-box',
    boxShadow: flash > 0 ? `0 0 0 ${5 * flash}px rgba(79,70,229,${0.22 * flash})` : undefined,
  }}>{children}</span>
);

/** 상태 알약 */
export const Pill: React.FC<{
  label: string; fg: string; bg: string; bd: string; style?: React.CSSProperties;
}> = ({ label, fg, bg, bd, style }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', borderRadius: 999,
    border: `1px solid ${bd}`, background: bg, color: fg,
    padding: '1px 7px', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', ...style,
  }}>{label}</span>
);

/**
 * 씬 제목 밴드 — 무대 위쪽 고정.
 * 한 줄로 **이 단계가 무엇인지** 말한다(오른쪽 설명과 중복되지 않게 짧게).
 */
export const Band: React.FC<{ t: number; children: React.ReactNode }> = ({ t, children }) => (
  <div style={{
    position: 'absolute', left: 32, top: 16, right: 32,
    fontSize: 15, fontWeight: 700, color: 'var(--fg)',
    opacity: interpolate(t, [0, 0.5], [0, 1]),
  }}>{children}</div>
);

/** 씬 안에서 강조할 낱말 */
export const Hi: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{ color: 'var(--primary)' }}>{children}</span>
);
