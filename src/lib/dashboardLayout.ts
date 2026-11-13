/**
 * 홈 대시보드 꾸미기 — 순수 판정 단일 출처 (2026-10-25). React 비의존, 회귀 `scripts/dashboard-layout-test`.
 *
 * 저장 = 표 `dashboard_layout`(사람 × 네비 종류 한 행) — `{ version: 1, widgets: [{ id, size?, hidden? }] }`.
 * 카드 목록(정의)은 코드에 있고(`TeacherDashboardV2`·`StudentHome`), 저장값은 그 위에 얹는 그 사람의 순서·크기·숨김이다.
 *
 * 불변식
 *   · 코드에 새로 생긴 카드는 저장값에 없어도 **기본 자리**(정의 순서에서 바로 앞 카드의 뒤)에 나타난다.
 *   · 저장값에만 있는 카드(지워진 카드)는 버린다.
 *   · 크기는 12칸 중 몇 칸인가 — 사람이 고르는 것은 `WIDGET_SIZES` 넷, 기본값은 화면 맥락에 따라 다른 칸수일 수 있다.
 *   · 카드가 스스로 아무것도 그리지 않으면(대기 0건 등) 자리를 차지하지 않는다(그리드 칸 `empty:hidden`).
 */

export type DashboardKind = 'teacher' | 'student';

/** 사람이 고르는 크기 — 12칸 기준 */
export const WIDGET_SIZES = [
  { span: 4, label: '작게' },
  { span: 6, label: '반' },
  { span: 8, label: '크게' },
  { span: 12, label: '한 줄' },
] as const;

export interface DashboardWidgetDef {
  id: string;
  label: string;
  /** 꾸미기 화면에 보일 한 줄 설명 */
  description?: string;
  /** 기본 칸수(12칸 중) */
  defaultSpan: number;
  /** 크기를 바꿀 수 없는 카드(맨 위 인사 등) — 숨기기·순서만 */
  fixedSpan?: boolean;
}

export interface SavedWidget {
  id: string;
  span?: number;
  hidden?: boolean;
}

export interface DashboardLayout {
  version: 1;
  widgets: SavedWidget[];
}

export interface ResolvedWidget {
  def: DashboardWidgetDef;
  span: number;
  hidden: boolean;
}

const clampSpan = (n: unknown): number | undefined =>
  typeof n === 'number' && Number.isInteger(n) && n >= 3 && n <= 12 ? n : undefined;

/** 저장값 읽기 — 모양이 틀린 부분은 버린다(그 사람의 홈이 깨지지 않게) */
export function parseDashboardLayout(raw: unknown): DashboardLayout | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const list = (raw as { widgets?: unknown }).widgets;
  if (!Array.isArray(list)) return null;
  const seen = new Set<string>();
  const widgets: SavedWidget[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const { id, span, hidden } = item as Record<string, unknown>;
    if (typeof id !== 'string' || !id || seen.has(id)) continue;
    seen.add(id);
    const s = clampSpan(span);
    widgets.push({ id, ...(s ? { span: s } : {}), ...(hidden === true ? { hidden: true } : {}) });
  }
  return { version: 1, widgets };
}

/** 정의 + 저장값 → 화면 순서. 저장값이 없으면 정의 순서·기본 크기 그대로 */
export function resolveDashboard(defs: readonly DashboardWidgetDef[], layout: DashboardLayout | null | undefined): ResolvedWidget[] {
  const byId = new Map(defs.map((d) => [d.id, d]));
  const saved = (layout?.widgets ?? []).filter((w) => byId.has(w.id));
  const out: ResolvedWidget[] = saved.map((w) => {
    const def = byId.get(w.id)!;
    return { def, span: def.fixedSpan ? def.defaultSpan : (w.span ?? def.defaultSpan), hidden: !!w.hidden };
  });
  // 저장값에 없는 카드(새로 생긴 카드) — 정의 순서에서 바로 앞 카드의 뒤에 끼운다
  defs.forEach((def, index) => {
    if (out.some((r) => r.def.id === def.id)) return;
    let at = 0;
    for (let i = index - 1; i >= 0; i -= 1) {
      const prev = out.findIndex((r) => r.def.id === defs[i].id);
      if (prev >= 0) { at = prev + 1; break; }
    }
    out.splice(at, 0, { def, span: def.defaultSpan, hidden: false });
  });
  return out;
}

/** 화면 순서 → 저장값. 기본과 같으면 null(= 저장하지 않는다 — 코드 기본이 바뀌면 따라가게) */
export function toDashboardLayout(defs: readonly DashboardWidgetDef[], widgets: readonly ResolvedWidget[]): DashboardLayout | null {
  const isDefault = widgets.length === defs.length
    && widgets.every((w, i) => w.def.id === defs[i].id && !w.hidden && w.span === defs[i].defaultSpan);
  if (isDefault) return null;
  return {
    version: 1,
    widgets: widgets.map((w) => ({
      id: w.def.id,
      ...(w.span !== w.def.defaultSpan ? { span: w.span } : {}),
      ...(w.hidden ? { hidden: true } : {}),
    })),
  };
}

/** 순서 바꾸기(끌어 놓기) — from 자리를 to 자리로 */
export function moveWidget(widgets: readonly ResolvedWidget[], fromId: string, toId: string): ResolvedWidget[] {
  const from = widgets.findIndex((w) => w.def.id === fromId);
  const to = widgets.findIndex((w) => w.def.id === toId);
  if (from < 0 || to < 0 || from === to) return [...widgets];
  const next = [...widgets];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

// ── 그리드 칸 클래스 — Tailwind 가 찾을 수 있게 문자열을 통째로 적는다 ─────────────
const LG_SPAN: Record<number, string> = {
  3: 'lg:col-span-3', 4: 'lg:col-span-4', 5: 'lg:col-span-5', 6: 'lg:col-span-6', 7: 'lg:col-span-7',
  8: 'lg:col-span-8', 9: 'lg:col-span-9', 10: 'lg:col-span-10', 11: 'lg:col-span-11', 12: 'lg:col-span-12',
};
const XL_SPAN: Record<number, string> = {
  3: 'xl:col-span-3', 4: 'xl:col-span-4', 5: 'xl:col-span-5', 6: 'xl:col-span-6', 7: 'xl:col-span-7',
  8: 'xl:col-span-8', 9: 'xl:col-span-9', 10: 'xl:col-span-10', 11: 'xl:col-span-11', 12: 'xl:col-span-12',
};

/**
 * 카드 칸 클래스. 교사 홈 = `md:grid-cols-2 lg:grid-cols-12`, 학생 홈 = `md:grid-cols-2 xl:grid-cols-12`
 * (두 홈의 그리드가 원래 그렇다 — 바꾸지 않는다). 휴대폰은 늘 한 줄.
 */
export function widgetSpanClass(kind: DashboardKind, span: number): string {
  const md = span <= 6 ? 'md:col-span-1' : 'md:col-span-2';
  return `col-span-1 ${md} ${(kind === 'teacher' ? LG_SPAN : XL_SPAN)[span] ?? ''}`.trim();
}
