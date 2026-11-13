/**
 * evalearn 3-패널 화면의 **공통 껍데기**.
 *
 * 개인 분석(모의고사 열람 · 학교 시험)과 집단 분석(학년/학급)은 구조가 같다 —
 * [탭 바] / [왼쪽 목록] / [칩 행] / [본문]. 그런데 화면마다 클래스 문자열을 따로 적어
 * 패딩(`py-2` vs `py-2.5`)·활성 색(`bg-slate-800` vs `bg-brand-50`)·모서리(`rounded-md` vs
 * `rounded-lg`)가 조금씩 어긋나 있었다. 한 앱 안에서 같은 역할의 요소가 다르게 생기면
 * 사용자는 "다른 기능"으로 읽는다.
 *
 * 여기가 단일 출처다. 새 화면에서 목록·탭·칩을 만들 때 클래스를 새로 쓰지 말 것.
 * Radix `Tabs` 처럼 자체 트리거를 쓰는 곳을 위해 클래스 상수도 함께 내보낸다.
 */
import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PANEL_TAB_BAR_CLASS, PANEL_TAB_GROUP_CLASS, PANEL_TAB_CLASS } from './panelChromeStyles';

/* ────────────────────────────── 탭 바 ────────────────────────────── */

export const PanelTabBar: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn(PANEL_TAB_BAR_CLASS, className)}>
    <div className={PANEL_TAB_GROUP_CLASS}>{children}</div>
  </div>
);

export const PanelTab: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      PANEL_TAB_CLASS,
      active ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
    )}
  >
    {children}
  </button>
);

/* ──────────────────────── 왼쪽 목록 (시험 · 과목) ──────────────────────── */

export const ListPanel: React.FC<{
  icon: LucideIcon;
  title: string;
  /** 기본 180px. 과목명이 길면 조금 넓힌다 */
  width?: number;
  children: React.ReactNode;
}> = ({ icon: Icon, title, width = 180, children }) => (
  <div
    className="shrink-0 border-r border-gray-100 bg-slate-50/50 flex flex-col min-h-0"
    style={{ width }}
  >
    <div className="px-3 py-2.5 border-b border-gray-100 shrink-0">
      <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
        <Icon className="h-3 w-3" />
        {title}
      </h3>
    </div>
    <div className="flex-1 overflow-y-auto custom-scrollbar">{children}</div>
  </div>
);

/**
 * 목록 안의 구간 구분(연도 등). 줄마다 연도를 반복하지 않고 바뀔 때만 끼운다.
 * 스크롤 중에도 지금 보는 구간을 알 수 있게 sticky.
 */
export const ListGroupLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="sticky top-0 z-10 px-3 py-1 bg-slate-100/95 backdrop-blur-sm border-b border-slate-200 text-[10px] font-semibold text-slate-500">
    {children}
  </div>
);

export const ListItem: React.FC<{
  active: boolean;
  onClick: () => void;
  /** 주 라벨 — 이 줄이 무엇인지 */
  label: React.ReactNode;
  /** 오른쪽 보조 정보(인원·등급 배지 등). 폭이 고정이라 label 을 압축하니 짧게 */
  meta?: React.ReactNode;
  /** 아랫줄 보조 정보 */
  sub?: React.ReactNode;
  title?: string;
}> = ({ active, onClick, label, meta, sub, title }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={cn(
      'w-full text-left px-3 py-2 border-b border-gray-50 transition-all text-xs',
      active
        ? 'bg-brand-50 border-l-2 border-l-brand-500'
        : 'hover:bg-white border-l-2 border-l-transparent'
    )}
  >
    <div className="flex items-baseline justify-between gap-2 min-w-0">
      <span className={cn('font-medium truncate', active ? 'text-brand-700' : 'text-slate-700')}>
        {label}
      </span>
      {meta != null && <span className="text-[10px] text-slate-400 shrink-0">{meta}</span>}
    </div>
    {sub != null && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
  </button>
);

/* ─────────────────────── 칩 행 (과목 · 고사 선택) ─────────────────────── */

export const ChipBar: React.FC<{
  children: React.ReactNode;
  /** 오른쪽 끝에 붙는 요약(응시 인원 등) */
  right?: React.ReactNode;
}> = ({ children, right }) => (
  <div className="px-4 py-2.5 bg-white border-b border-gray-100 shrink-0">
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      {children}
      {right != null && <span className="ml-auto text-[11px] text-slate-500 shrink-0">{right}</span>}
    </div>
  </div>
);

/** 칩 앞의 분야 라벨(국어·수학·…). 줄을 바꾸지 않고 흐름 안에서 구분한다 */
export const ChipGroupLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-[10px] font-semibold text-slate-400 pl-0.5">{children}</span>
);

export const Chip: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
  className?: string;
}> = ({ active, onClick, children, title, className }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={cn(
      'px-2.5 py-1 rounded-md text-xs border transition-colors',
      active
        ? 'bg-slate-800 text-white border-slate-800'
        : 'bg-white text-slate-600 border-gray-200 hover:bg-slate-50',
      className
    )}
  >
    {children}
  </button>
);
