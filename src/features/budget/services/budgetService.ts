// 예산 관리 읽기·쓰기 (2026-11-10). 권한은 RLS 가 정한다(담당자 = 쓰기, 관리자 = 읽기).
// 카드 반영·추경 확정은 RPC(INVOKER — 한 트랜잭션), 나머지는 표 직접 쓰기.
import { supabase } from '@/integrations/supabase/client';
import type {
  BudgetCardImport, BudgetLine, BudgetMember, BudgetOrderLink, BudgetPlanItem, BudgetProject, BudgetProjectDetail,
  BudgetProjectSummary, BudgetRevision, BudgetRevisionLine, OrderLineCandidate,
} from '../types';
import type { BudgetKind } from '../model/parseBudgetCard';

// 생성 타입(types.ts)에 아직 없는 표 — ontologyLinkService 와 같은 방식
/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (f: string, a: Record<string, unknown>) => any;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** 내 resource id 들(교직원 명단) — 담당 역할 판정용 */
async function myResourceIds(userId: string): Promise<string[]> {
  const rows = must(await db.from('user_resource').select('resource_id').eq('user_id', userId)) as { resource_id: string }[];
  return (rows ?? []).map((r) => r.resource_id);
}

function roleOf(members: { resource_id: string; role: 'owner' | 'editor' }[], mine: string[]): 'owner' | 'editor' | null {
  const own = members.filter((m) => mine.includes(m.resource_id));
  if (own.some((m) => m.role === 'owner')) return 'owner';
  if (own.length) return 'editor';
  return null;
}

export async function fetchProjects(year: number, userId: string): Promise<BudgetProjectSummary[]> {
  const projects = must(await db.from('budget_project')
    .select('*')
    .eq('fiscal_year', year)
    .eq('archived', false)
    .order('kind', { ascending: true })
    .order('name', { ascending: true })) as BudgetProject[];
  if (!projects.length) return [];
  const ids = projects.map((p) => p.id);
  const [lines, plans, members, imports, mine] = await Promise.all([
    db.from('budget_line').select('id, project_id, budget_amount, pumui, wonin, closed').in('project_id', ids),
    db.from('budget_plan_item').select('project_id, line_id, amount, status, planned_month').in('project_id', ids),
    db.from('budget_member').select('project_id, resource_id, role').in('project_id', ids),
    db.from('budget_card_import').select('project_id, imported_at').in('project_id', ids).order('imported_at', { ascending: false }),
    myResourceIds(userId),
  ]);
  const L = must(lines) as Array<BudgetLine>;
  const P = must(plans) as Array<BudgetPlanItem>;
  const M = must(members) as Array<{ project_id: string; resource_id: string; role: 'owner' | 'editor' }>;
  const I = must(imports) as Array<{ project_id: string; imported_at: string }>;
  return projects.map((p) => ({
    ...p,
    lines: L.filter((l) => l.project_id === p.id),
    plans: P.filter((x) => x.project_id === p.id),
    myRole: roleOf(M.filter((m) => m.project_id === p.id), mine),
    lastImportAt: I.find((i) => i.project_id === p.id)?.imported_at ?? null,
  }));
}

/** 회계연도 목록(사업이 있는 해) */
export async function fetchProjectYears(): Promise<number[]> {
  const rows = must(await db.from('budget_project').select('fiscal_year').eq('archived', false).limit(1000)) as { fiscal_year: number }[];
  return [...new Set(rows.map((r) => r.fiscal_year))].sort((a, b) => b - a);
}

export async function fetchProjectDetail(id: string, userId: string): Promise<BudgetProjectDetail | null> {
  const project = must(await db.from('budget_project').select('*').eq('id', id).maybeSingle()) as BudgetProject | null;
  if (!project) return null;
  const [lines, plans, revisions, revisionLines, members, imports, mine, orderLinks] = await Promise.all([
    db.from('budget_line').select('*').eq('project_id', id).order('sort_order').order('created_at'),
    db.from('budget_plan_item').select('*').eq('project_id', id).order('sort_order').order('created_at'),
    db.from('budget_revision').select('*').eq('project_id', id).order('seq'),
    db.from('budget_revision_line').select('*').eq('project_id', id),
    db.from('budget_member').select('project_id, resource_id, role, resource:resource_id(name)').eq('project_id', id),
    db.from('budget_card_import').select('*').eq('project_id', id).order('imported_at', { ascending: false }).limit(50),
    myResourceIds(userId),
    fetchOrderLinks(id),
  ]);
  const M = (must(members) as Array<{ project_id: string; resource_id: string; role: 'owner' | 'editor'; resource?: { name?: string } | null }>);
  return {
    project,
    lines: must(lines) as BudgetLine[],
    plans: must(plans) as BudgetPlanItem[],
    revisions: must(revisions) as BudgetRevision[],
    revisionLines: must(revisionLines) as BudgetRevisionLine[],
    members: M.map((m) => ({ project_id: m.project_id, resource_id: m.resource_id, role: m.role, name: m.resource?.name ?? null })) as BudgetMember[],
    imports: must(imports) as BudgetCardImport[],
    orderLinks,
    myRole: roleOf(M, mine),
  };
}

/** 카드 올리기 짝짓기용 — 여러 사업의 줄 */
export async function fetchLinesForProjects(ids: string[]): Promise<BudgetLine[]> {
  if (!ids.length) return [];
  return must(await db.from('budget_line').select('*').in('project_id', ids)) as BudgetLine[];
}

// ── 사업 ───────────────────────────────────────────────────────────────

export async function createProject(input: {
  fiscal_year: number; name: string; kind: BudgetKind; group_name?: string | null; department?: string | null;
  card_key?: string | null; rolled_over_from?: string | null; note?: string | null;
}): Promise<BudgetProject> {
  return must(await db.from('budget_project').insert(input).select('*').single()) as BudgetProject;
}

export async function updateProject(id: string, patch: Partial<Pick<BudgetProject, 'name' | 'kind' | 'department' | 'note' | 'archived' | 'group_name' | 'rolled_over_from'>>) {
  must(await db.from('budget_project').update(patch).eq('id', id));
}

export async function deleteProject(id: string) {
  must(await db.from('budget_project').delete().eq('id', id));
}

// ── 산출내역 ────────────────────────────────────────────────────────────

export async function createLine(input: { project_id: string; name: string; expense_item?: string | null; budget_amount?: number; sort_order?: number }) {
  return must(await db.from('budget_line').insert({ origin: 'manual', ...input }).select('*').single()) as BudgetLine;
}

export async function updateLine(id: string, patch: Partial<Pick<BudgetLine,
  'name' | 'expense_item' | 'budget_amount' | 'pumui' | 'wonin' | 'closed' | 'note' | 'manual_override' | 'sort_order'>>) {
  must(await db.from('budget_line').update(patch).eq('id', id));
}

export async function deleteLine(id: string) {
  must(await db.from('budget_line').delete().eq('id', id));
}

// ── 계획 ────────────────────────────────────────────────────────────────

export async function createPlan(input: {
  project_id: string; line_id: string; title: string; amount: number; planned_month: string | null; sort_order?: number;
}) {
  return must(await db.from('budget_plan_item').insert(input).select('*').single()) as BudgetPlanItem;
}

export async function updatePlan(id: string, patch: Partial<Pick<BudgetPlanItem, 'title' | 'amount' | 'planned_month' | 'status' | 'note' | 'line_id' | 'task_id'>>) {
  must(await db.from('budget_plan_item').update(patch).eq('id', id));
}

export async function deletePlan(id: string) {
  must(await db.from('budget_plan_item').delete().eq('id', id));
}

// ── 카드 ────────────────────────────────────────────────────────────────

export async function applyCard(projectId: string, fileName: string | null, card: unknown) {
  return must(await db.rpc('budget_apply_card', { p_project: projectId, p_file_name: fileName, p_card: card })) as {
    new: number; updated: number; missing: number; budget_changed: number; revision_id: string | null;
  };
}

// ── 추경 ────────────────────────────────────────────────────────────────

export async function createDraftRevision(projectId: string, title: string, seq: number) {
  return must(await db.from('budget_revision').insert({ project_id: projectId, title, seq }).select('*').single()) as BudgetRevision;
}

export async function updateRevision(id: string, patch: Partial<Pick<BudgetRevision, 'title' | 'note'>>) {
  must(await db.from('budget_revision').update(patch).eq('id', id));
}

export async function deleteDraftRevision(id: string) {
  must(await db.from('budget_revision').delete().eq('id', id).eq('status', 'draft'));
}

/** 초안 줄 금액 — 지금 예산현액과 같으면 줄을 지운다(바뀐 줄만 남긴다) */
export async function saveDraftLines(revisionId: string, projectId: string, rows: { lineId: string; amount: number | null }[]) {
  const upserts = rows.filter((r) => r.amount !== null).map((r) => ({
    revision_id: revisionId, project_id: projectId, line_id: r.lineId, amount: r.amount as number,
  }));
  const removes = rows.filter((r) => r.amount === null).map((r) => r.lineId);
  if (upserts.length) must(await db.from('budget_revision_line').upsert(upserts, { onConflict: 'revision_id,line_id' }));
  if (removes.length) must(await db.from('budget_revision_line').delete().eq('revision_id', revisionId).in('line_id', removes));
}

export async function confirmRevision(revisionId: string) {
  return must(await db.rpc('budget_confirm_revision', { p_revision: revisionId })) as { lines: number };
}

// ── 품의 연결 (P3) ──────────────────────────────────────────────────────
// 품의 품목은 구매 신청 페이지 담당자만 보인다(RLS) — 담당이 아닌 사람에게는 연결이 «품목을 볼 수 없음»으로 남는다

type OrderLineRow = {
  id: string; name: string; unit_price: number | null; qty: number | null; vendor: string | null; batch_id: string; page_id: string;
  batch?: { title: string | null; status: string | null } | null; page?: { title: string | null } | null;
};
const ORDER_LINE_SELECT = 'id, name, unit_price, qty, vendor, batch_id, page_id, batch:batch_id(title, status), page:page_id(title)';

export async function fetchOrderLinks(projectId: string): Promise<BudgetOrderLink[]> {
  const links = must(await db.from('budget_order_link').select('order_line_id, project_id, line_id, plan_item_id').eq('project_id', projectId)) as
    Omit<BudgetOrderLink, 'order'>[];
  if (!links.length) return [];
  const rows = must(await db.from('purchase_order_lines').select(ORDER_LINE_SELECT).in('id', links.map((l) => l.order_line_id))) as OrderLineRow[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return links.map((l) => {
    const r = byId.get(l.order_line_id);
    return {
      ...l,
      order: r ? {
        name: r.name, unit_price: r.unit_price, qty: r.qty, vendor: r.vendor, batch_id: r.batch_id,
        batch_title: r.batch?.title ?? null, batch_status: r.batch?.status ?? null, page_id: r.page_id, page_title: r.page?.title ?? null,
      } : null,
    };
  });
}

/** 이을 수 있는 품의 품목 — 최근 차수부터(내가 담당인 페이지만 보인다) */
export async function fetchOrderLineCandidates(): Promise<OrderLineCandidate[]> {
  const rows = must(await db.from('purchase_order_lines').select(ORDER_LINE_SELECT).order('created_at', { ascending: false }).limit(300)) as OrderLineRow[];
  if (!rows.length) return [];
  const linked = must(await db.from('budget_order_link').select('order_line_id').in('order_line_id', rows.map((r) => r.id))) as { order_line_id: string }[];
  const set = new Set(linked.map((l) => l.order_line_id));
  return rows.map((r) => ({
    id: r.id, name: r.name, unit_price: r.unit_price, qty: r.qty, vendor: r.vendor, batch_id: r.batch_id,
    batch_title: r.batch?.title ?? null, batch_status: r.batch?.status ?? null, page_id: r.page_id, page_title: r.page?.title ?? null,
    linked: set.has(r.id),
  }));
}

export async function linkOrderLines(input: { projectId: string; lineId: string; planItemId: string | null; orderLineIds: string[] }) {
  if (!input.orderLineIds.length) return;
  must(await db.from('budget_order_link').upsert(
    input.orderLineIds.map((id) => ({ order_line_id: id, project_id: input.projectId, line_id: input.lineId, plan_item_id: input.planItemId })),
    { onConflict: 'order_line_id' },
  ));
}

export async function unlinkOrderLine(orderLineId: string) {
  must(await db.from('budget_order_link').delete().eq('order_line_id', orderLineId));
}

export function orderAmount(o: { unit_price: number | null; qty: number | null } | null): number | null {
  if (!o || o.unit_price === null || o.qty === null) return null;
  return Math.round(Number(o.unit_price) * Number(o.qty));
}

// ── 담당자 ──────────────────────────────────────────────────────────────

/** 교직원 이름 → resource id (교사 우선 — findLinkableResourceByName 과 같은 규칙) */
export async function resourceIdsByNames(names: string[]): Promise<Map<string, string>> {
  if (!names.length) return new Map();
  const rows = must(await db.from('resource').select('id, name, type').in('name', names).in('type', ['teacher', 'staff'])) as
    { id: string; name: string; type: string }[];
  const out = new Map<string, string>();
  for (const r of rows.sort((a, b) => (a.type === 'teacher' ? -1 : 1) - (b.type === 'teacher' ? -1 : 1))) {
    if (!out.has(r.name)) out.set(r.name, r.id);
  }
  return out;
}

export async function addMembers(projectId: string, resourceIds: string[]) {
  if (!resourceIds.length) return;
  must(await db.from('budget_member').upsert(
    resourceIds.map((resource_id) => ({ project_id: projectId, resource_id, role: 'editor' })),
    { onConflict: 'project_id,resource_id', ignoreDuplicates: true },
  ));
}

export async function removeMember(projectId: string, resourceId: string) {
  must(await db.from('budget_member').delete().eq('project_id', projectId).eq('resource_id', resourceId));
}
