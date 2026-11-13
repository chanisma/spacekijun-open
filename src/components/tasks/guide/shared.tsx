/**
 * 업무 관리 안내 — 페이지들이 함께 쓰는 조각.
 *
 * **페이지(보기)마다 안내가 따로다**(2026-09-04 사용자 지시). 한 모달에 몰아넣으면
 * 지금 쓰는 화면과 상관없는 단계를 넘겨 가며 봐야 한다 — [사용 방법]은 **지금 보고 있는
 * 화면의 안내**를 연다.
 */
import React from 'react';
import { boxOf, type Rect } from '@/components/walkthrough/stageCoords';
import { Pill } from '@/components/walkthrough/atoms';
import type { TaskTabValue } from '@/lib/taskTabs';
import { SCOPE_LABELS } from './tabs';

/**
 * 목업 머리글의 왼쪽 — 실제 `TaskHeader` 와 같다(2026-10-05 탭 줄 폐지).
 * 업무 목록(`myWorks`·`works`)이면 **범위 전환**(내가 매니저인 업무 / 전체 업무)을 그리고,
 * 다른 페이지면 아무것도 그리지 않는다 — 페이지 이동은 사이드바 서랍이 하므로 머리글에 없다.
 * 이름은 종전 그대로 `TabBar` 다(씬 수십 곳이 이 이름·좌표로 그린다 — 자리는 그대로라 포인터가 안 밀린다).
 */
export const TabBar: React.FC<{ active: TaskTabValue; flash?: number; y?: number }> = ({
  active, flash = 0, y = 10,
}) => {
  if (active !== 'myWorks' && active !== 'works') return null;
  const activeIndex = active === 'works' ? 1 : 0;
  return (
    <span style={{
      position: 'absolute', left: 12, top: y,
      display: 'flex', gap: 2, padding: 2,
      borderRadius: 9, background: 'color-mix(in srgb, var(--fg) 6%, transparent)',
      border: '1px solid var(--hair-2)',
    }}>
      {SCOPE_LABELS.map((label, i) => (
        <span key={label} style={{
          borderRadius: 7, padding: '4px 10px', fontSize: 10.5,
          fontWeight: i === activeIndex ? 700 : 500,
          background: i === activeIndex ? 'var(--bg)' : 'transparent',
          color: i === activeIndex ? 'var(--primary)' : 'var(--fg-muted)',
          boxShadow: i === activeIndex
            ? (flash > 0 ? `0 0 0 ${5 * flash}px rgba(79,70,229,0.24)` : '0 1px 2px rgba(15,23,42,0.08)')
            : undefined,
        }}>{label}</span>
      ))}
    </span>
  );
};

/**
 * 담당자 진행 칩 — 실제 `TaskAssigneeSummary` 와 같은 구성:
 * `[N/M 완료] ……… [내 상태 배지]`. 비매니저에게는 **명단이 없다**는 것이 요점이라
 * 아바타 스택도 셰브론도 그리지 않는다.
 */
export const AssigneeChip: React.FC<{
  rect: Rect; done: number; total: number; mine: 'pending' | 'done'; glow?: number;
  /** 매니저가 보는 칩 — 내 상태 배지 대신 **담당자 아바타 스택**(이름 첫 글자). 명단은 매니저에게만 보인다 */
  avatars?: string[];
  /**
   * 흐름(flow) 안에 넣을 때 켠다 — 카드 하단처럼 `marginTop:auto` 로 밀어 넣는 자리.
   * 기본값인 `boxOf` 절대배치는 **가장 가까운 위치 지정 조상**을 기준으로 하므로,
   * 그대로 카드 안에 넣으면 카드 좌상단(0,0)에 그려져 체크박스·제목을 덮는다.
   */
  inline?: boolean;
}> = ({ rect, done, total, mine, glow = 0, inline = false, avatars }) => (
  <span style={{
    ...(inline ? { width: rect.w, height: rect.h } : boxOf(rect)),
    boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px',
    borderRadius: 7, fontSize: 10,
    background: 'color-mix(in srgb, var(--fg) 4%, transparent)',
    color: 'var(--fg-muted)',
    boxShadow: glow > 0 ? `0 0 0 ${5 * glow}px rgba(79,70,229,0.24)` : undefined,
  }}>
    <span style={{ fontWeight: 700, color: 'var(--fg)' }}>{done}/{total}</span> 완료
    <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
      {avatars ? (
        avatars.map((name, i) => (
          <span key={name} style={{
            width: 16, height: 16, borderRadius: '50%', marginLeft: i === 0 ? 0 : -5,
            display: 'grid', placeItems: 'center', fontSize: 8, fontWeight: 700,
            border: '1.5px solid var(--bg)',
            background: i < done ? '#d1fae5' : '#e2e8f0', color: i < done ? '#065f46' : '#475569',
          }}>{name[0]}</span>
        ))
      ) : mine === 'done'
        ? <Pill label="✓ 내 상태 완료" fg="#065f46" bg="#d1fae5" bd="#6ee7b7" />
        : <Pill label="내 상태 진행 중" fg="#475569" bg="#ffffff" bd="#e2e8f0" />}
    </span>
  </span>
);
