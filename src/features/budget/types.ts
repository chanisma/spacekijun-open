// 예산 관리 표 모양 (2026-11-10) — 정본 = supabase/migrations/20261110100000_budget_management.sql
import type { BudgetKind } from './model/parseBudgetCard';
import type { PlanStatus } from './model/budgetMath';

export type { BudgetKind, PlanStatus };

export interface BudgetProject {
  id: string;
  fiscal_year: number;
  name: string;
  kind: BudgetKind;
  group_name: string | null;
  department: string | null;
  note: string | null;
  card_key: string | null;
  rolled_over_from: string | null;
  archived: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface BudgetLine {
  id: string;
  project_id: string;
  sort_order: number;
  expense_item: string | null;
  name: string;
  card_key: string | null;
  budget_amount: number;
  pumui: number;
  wonin: number;
  jichul: number;
  jigeup: number;
  manual_override: boolean;
  origin: 'card' | 'manual';
  missing_from_card: boolean;
  closed: boolean;
  note: string | null;
}

export interface BudgetPlanItem {
  id: string;
  project_id: string;
  line_id: string;
  title: string;
  amount: number;
  planned_month: string | null;
  status: PlanStatus;
  task_id: string | null;
  note: string | null;
  sort_order: number;
  created_at: string;
}

export interface BudgetRevision {
  id: string;
  project_id: string;
  seq: number;
  title: string;
  status: 'draft' | 'confirmed';
  source: 'manual' | 'card';
  note: string | null;
  confirmed_at: string | null;
  created_at: string;
}

export interface BudgetRevisionLine {
  revision_id: string;
  project_id: string;
  line_id: string;
  amount: number;
  prev_amount: number | null;
  note: string | null;
}

export interface BudgetMember {
  project_id: string;
  resource_id: string;
  role: 'owner' | 'editor';
  name?: string | null;
}

export interface BudgetCardImport {
  id: string;
  project_id: string;
  file_name: string | null;
  card_date: string | null;
  snapshot: { lines: Array<{ line_id: string; name: string; budget: number; pumui: number; wonin: number }>; card_total?: unknown };
  summary: { new?: number; updated?: number; missing?: number; budget_changed?: number };
  imported_at: string;
}

/** 품의 품목 ↔ 예산 줄(+계획) — 품목·차수·페이지 이름을 함께 읽는다 */
export interface BudgetOrderLink {
  order_line_id: string;
  project_id: string;
  line_id: string;
  plan_item_id: string | null;
  order: {
    name: string;
    unit_price: number | null;
    qty: number | null;
    vendor: string | null;
    batch_id: string;
    batch_title: string | null;
    batch_status: 'draft' | 'submitted' | 'purchased' | string | null;
    page_id: string;
    page_title: string | null;
  } | null;
}

/** 이을 수 있는 품의 품목(내가 담당인 구매 신청 페이지의 것 — RLS) */
export interface OrderLineCandidate {
  id: string;
  name: string;
  unit_price: number | null;
  qty: number | null;
  vendor: string | null;
  batch_id: string;
  batch_title: string | null;
  batch_status: string | null;
  page_id: string;
  page_title: string | null;
  linked: boolean;
}

/** 목록용 — 사업 + 줄 + 계획(막대 계산에 필요한 것만) */
export interface BudgetProjectSummary extends BudgetProject {
  lines: Pick<BudgetLine, 'id' | 'budget_amount' | 'pumui' | 'wonin' | 'closed'>[];
  plans: Pick<BudgetPlanItem, 'line_id' | 'amount' | 'status' | 'planned_month'>[];
  myRole: 'owner' | 'editor' | null;
  lastImportAt: string | null;
}

export interface BudgetProjectDetail {
  project: BudgetProject;
  lines: BudgetLine[];
  plans: BudgetPlanItem[];
  revisions: BudgetRevision[];
  revisionLines: BudgetRevisionLine[];
  members: BudgetMember[];
  imports: BudgetCardImport[];
  orderLinks: BudgetOrderLink[];
  myRole: 'owner' | 'editor' | null;
}

export const KIND_LABEL: Record<BudgetKind, string> = {
  purpose: '목적',
  total: '총액배분',
  basic: '기본',
};

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  planned: '계획',
  in_order: '품의 중',
  done: '완료',
  cancelled: '취소',
};
