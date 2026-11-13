/**
 * `panelChrome` 의 클래스 상수.
 *
 * Radix `Tabs` 처럼 자체 트리거를 쓰는 곳은 컴포넌트 대신 이 클래스를 가져다 쓴다.
 * 컴포넌트 파일에 함께 두면 fast-refresh 가 깨지므로 분리한다.
 */
import { cn } from '@/lib/utils';

export const PANEL_TAB_BAR_CLASS = 'px-4 py-2 bg-white border-b border-gray-100 shrink-0';
export const PANEL_TAB_GROUP_CLASS = 'inline-flex flex-wrap gap-0.5 bg-slate-100/60 p-1 rounded-xl';
export const PANEL_TAB_CLASS = 'rounded-lg px-3 py-1.5 text-xs font-medium transition-all';
/** Radix `TabsTrigger` 용 — 활성 상태를 data 속성으로 받는다 */
export const PANEL_TAB_RADIX_CLASS = cn(
  PANEL_TAB_CLASS,
  'text-slate-500 hover:text-slate-700',
  'data-[state=active]:bg-white data-[state=active]:text-brand-600 data-[state=active]:shadow-sm'
);
