/**
 * 창의적 체험활동 안내 — 세 안내(전체·제안함·탐구 탐색)가 함께 쓰는 목업 조각.
 *
 * **탭마다 안내가 따로다.** [사용 방법]은 지금 보고 있는 세그먼트의 안내를 연다 —
 * `전체`/`내 담당`은 같은 보드를 필터만 바꿔 보는 것이라 안내도 하나이고,
 * `제안함`·`탐구 탐색`은 데이터 출처부터 다른 화면이라 각각 따로다.
 * 그래도 세 안내의 씬이 **같은 세그먼트 줄을 이고 있어야** 자기가 앱의 어느 자리에
 * 있는지 잃지 않는다.
 *
 * 색 근거: 영역 색은 `utils/activityLabels.ts` 의 `AREA_TONES`(amber·violet·emerald),
 * 분야 타일 색은 `utils/categories.ts` 의 `getCategoryTone()` — **하드코딩하지 않고
 * 실제 함수를 그대로 부른다**(이름 해시로 색이 정해지므로 안내와 실물이 같은 색이 된다).
 */
import React from 'react';
import { boxOf, type Rect } from '@/components/walkthrough/stageCoords';
import { getCategoryTone } from '../../utils/categories';
import { SCOPES } from './tabs';
import { AREA, type AreaKey, LINEAGE } from './tokens';

/* ── 세그먼트 줄 ──────────────────────────────────────────────────────────── */

/** 실제 `ActivitiesHeader` 의 `ScopeButton` — 활성은 slate-900 배경에 흰 글자다 */
export const ScopeBar: React.FC<{
  active: number; flash?: number; x?: number; y?: number;
}> = ({ active, flash = 0, x = 14, y = 12 }) => (
  <span style={{
    position: 'absolute', left: x, top: y,
    display: 'flex', gap: 2, padding: 2,
    borderRadius: 9, border: '1px solid var(--hair)', background: 'var(--bg)',
  }}>
    {SCOPES.map((label, i) => (
      <span key={label} style={{
        borderRadius: 7, padding: '3px 9px', fontSize: 10.5, whiteSpace: 'nowrap',
        fontWeight: i === active ? 700 : 500,
        background: i === active ? '#0f172a' : 'transparent',
        color: i === active ? '#ffffff' : 'var(--fg-muted)',
        boxShadow: i === active && flash > 0
          ? `0 0 0 ${5 * flash}px rgba(79,70,229,0.24)` : undefined,
      }}>{label}</span>
    ))}
  </span>
);

/** 범주(영역 그룹) 칩 줄 — 전체 + 자율·진로 / 동아리 / 봉사 */
export const AreaChips: React.FC<{
  x: number; y: number; active?: AreaKey | null; counts: [number, number, number, number];
}> = ({ x, y, active = null, counts }) => {
  const items: { key: AreaKey | null; label: string }[] = [
    { key: null, label: '전체' },
    { key: 'autonomy_career', label: AREA.autonomy_career.label },
    { key: 'club', label: AREA.club.label },
    { key: 'service', label: AREA.service.label },
  ];
  return (
    <span style={{ position: 'absolute', left: x, top: y, display: 'flex', gap: 6 }}>
      {items.map((it, i) => {
        const on = it.key === active;
        const tone = it.key ? AREA[it.key] : null;
        return (
          <span key={it.label} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            borderRadius: 999, padding: '2px 9px', fontSize: 10.5,
            border: `1px solid ${on && tone ? tone.bd : 'var(--hair)'}`,
            background: on && tone ? tone.bg : on ? '#f1f5f9' : 'var(--bg)',
            color: on && tone ? tone.fg : 'var(--fg-muted)',
          }}>
            {tone && <i style={{ width: 5, height: 5, borderRadius: '50%', background: tone.fill }} />}
            {it.label}
            <b style={{ opacity: 0.6, fontWeight: 600 }}>{counts[i]}</b>
          </span>
        );
      })}
    </span>
  );
};

/* ── 분야 타일 ────────────────────────────────────────────────────────────── */

/**
 * 진로·분야 타일. `mode='grid'` 는 첫 화면의 정사각형 타일,
 * `mode='rail'` 은 분야를 고른 뒤 왼쪽 레일로 옮겨간 모습이다.
 * 색은 실제 화면과 **같은 함수**로 뽑는다.
 */
export const Tile: React.FC<{
  rect: Rect; label: string; count: number;
  mode?: 'grid' | 'rail'; selected?: boolean; flash?: number;
}> = ({ rect, label, count, mode = 'grid', selected = false, flash = 0 }) => {
  const tone = getCategoryTone(label === '분야 미지정' ? '__uncategorized__' : label);
  const grid = mode === 'grid';
  return (
    <span style={{
      ...boxOf(rect),
      display: 'flex', boxSizing: 'border-box',
      borderRadius: 11, border: `1px solid ${tone.border}`,
      background: tone.bg, color: tone.fg,
      opacity: !grid && !selected ? 0.7 : 1,
      boxShadow: selected && !grid ? `0 0 0 2px ${tone.accent}` : undefined,
      ...(grid
        ? { alignItems: 'center', justifyContent: 'center', padding: '18px 6px 6px' }
        : { alignItems: 'center', justifyContent: 'space-between', padding: '0 8px' }),
      ...(flash > 0 ? { filter: `brightness(${1 - 0.06 * flash})` } : null),
    }}>
      {grid && (
        <b style={{
          position: 'absolute', right: 7, top: 4,
          fontSize: 19, lineHeight: 1, fontWeight: 800, opacity: 0.55,
        }}>{count}</b>
      )}
      <span style={{
        fontSize: grid ? 15 : 10.5, fontWeight: grid ? 800 : 700,
        lineHeight: 1.15, textAlign: grid ? 'center' : 'left',
        minWidth: 0, overflow: 'hidden', whiteSpace: grid ? 'normal' : 'nowrap',
        textOverflow: 'ellipsis',
      }}>{label}</span>
      {!grid && (
        <b style={{
          borderRadius: 999, background: tone.badge, padding: '0 5px',
          fontSize: 9.5, fontWeight: 700,
        }}>{count}</b>
      )}
      {/* 연결 돌기 — 선택된 레일 타일에서만. 오른쪽 목록 패널과 이어 보이게 한다 */}
      {!grid && selected && (
        <i style={{
          position: 'absolute', right: -6, top: '50%', marginTop: -6,
          width: 6, height: 12, borderRadius: '0 2px 2px 0', background: tone.accent,
        }} />
      )}
    </span>
  );
};

/* ── 활동 목록 행 ─────────────────────────────────────────────────────────── */

/** 실제 `ActivityListRow` — 왼쪽 영역 색 기둥 · 영역 배지 · 이름 · N년째 · 메타 · 인원 */
export const ActivityRow: React.FC<{
  rect: Rect; area: AreaKey; name: string; meta: string; people: number;
  generation?: number; mine?: boolean; flash?: number;
}> = ({ rect, area, name, meta, people, generation, mine, flash = 0 }) => {
  const tone = AREA[area];
  return (
    <span style={{
      ...boxOf(rect), boxSizing: 'border-box',
      display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 9px',
      borderBottom: '1px solid var(--hair-2)',
      background: flash > 0 ? `rgba(79,70,229,${0.06 * flash})` : 'transparent',
    }}>
      <i style={{ width: 3, height: 26, borderRadius: 3, background: tone.fill, flexShrink: 0, marginTop: 2 }} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            borderRadius: 4, border: `1px solid ${tone.bd}`, background: tone.bg, color: tone.fg,
            padding: '0 4px', fontSize: 9, fontWeight: 700,
          }}>{tone.label}</span>
          <b style={{
            fontSize: 12, fontWeight: 700, color: 'var(--fg)',
            minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          }}>{name}</b>
          {generation && generation >= 2 && (
            <span style={{
              borderRadius: 4, border: `1px solid ${LINEAGE.bd}`, background: LINEAGE.bg,
              color: LINEAGE.fg, padding: '0 4px', fontSize: 9, fontWeight: 700, whiteSpace: 'nowrap',
            }}>{generation}년째</span>
          )}
          {mine && (
            <span style={{
              borderRadius: 4, border: '1px solid var(--hair)', background: '#f8fafc',
              color: 'var(--fg-muted)', padding: '0 4px', fontSize: 9,
            }}>담당</span>
          )}
        </span>
        <span style={{
          display: 'block', marginTop: 3, fontSize: 10, color: 'var(--fg-faint)',
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        }}>{meta}</span>
      </span>
      <span style={{ fontSize: 10.5, color: 'var(--fg-muted)', flexShrink: 0, marginTop: 2 }}>
        {people}명
      </span>
    </span>
  );
};

/* ── 상세 모달 탭 줄 ──────────────────────────────────────────────────────── */

/** 실제 `ActivityDetailDialog` 의 탭: 개요 · 참여자 N · 기록·성찰 N · 계보 */
export const DetailTabs: React.FC<{
  x: number; y: number; active: number; flash?: number; counts?: (string | number | null)[];
}> = ({ x, y, active, flash = 0, counts = [] }) => (
  <span style={{
    position: 'absolute', left: x, top: y, display: 'flex', gap: 14,
    borderBottom: '1px solid var(--hair-2)', paddingBottom: 6,
  }}>
    {['개요', '참여자', '기록·성찰', '계보'].map((label, i) => (
      <span key={label} style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 11, fontWeight: i === active ? 700 : 500,
        color: i === active ? 'var(--primary)' : 'var(--fg-muted)',
        borderBottom: i === active ? '2px solid var(--primary)' : '2px solid transparent',
        paddingBottom: 5, marginBottom: -7,
        boxShadow: i === active && flash > 0 ? `0 0 0 ${5 * flash}px rgba(79,70,229,0.2)` : undefined,
      }}>
        {label}
        {counts[i] != null && (
          <b style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--fg-faint)' }}>{counts[i]}</b>
        )}
      </span>
    ))}
  </span>
);

/* ── 작은 라벨 ────────────────────────────────────────────────────────────── */

/** 폼의 섹션 라벨(대문자 트래킹) — 실제 `dialogDesign.tsx` 의 `SectionLabel` 결 */
export const Sec: React.FC<{ x: number; y: number; children: React.ReactNode }> = ({ x, y, children }) => (
  <span style={{
    position: 'absolute', left: x, top: y,
    fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: 'var(--fg-faint)',
  }}>{children}</span>
);

/** 입력칸 위 라벨 */
export const Lab: React.FC<{ x: number; y: number; children: React.ReactNode }> = ({ x, y, children }) => (
  <span style={{ position: 'absolute', left: x, top: y, fontSize: 10, color: 'var(--fg-muted)' }}>
    {children}
  </span>
);

/** 보조 설명 한 줄 */
export const Note: React.FC<{
  x: number; y: number; w?: number; children: React.ReactNode;
}> = ({ x, y, w, children }) => (
  <span style={{
    position: 'absolute', left: x, top: y, width: w,
    fontSize: 10, lineHeight: 1.5, color: 'var(--fg-faint)',
  }}>{children}</span>
);
