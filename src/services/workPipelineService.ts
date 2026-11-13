// ========================================
// 업무 진행 화면 — 산출물 읽기·쓰기와 흐름 적용 (2026-09-27)
//
// 판정은 src/lib/workPipeline.ts, 여기는 **원천에서 읽어 정규화된 산출물로 옮기는 층**이다.
// 원칙: 원천이 이미 가진 가시성 판정을 우회하지 않는다 —
//   입력 받기 = get_collect_board RPC(비공개 응답 보호) · 스펙 문서 = 만든 사람만(RLS) ·
//   제출물 = 매니저·본인(RLS) · 사람이 남긴 것 = task_output_value(RLS: 매니저·같은 업무 담당자,
//   «제한»은 매니저만)
// 그래서 같은 화면이라도 사람마다 보이는 산출물이 다르고, 못 본 것은 «비었다»가 아니라
// «볼 수 없다»로 말한다(ResolvedOutput.unavailable).
//
// ⚠️ 적대적 검증(2026-09-27)이 잡은 것:
//   · 흐름 적용이 **화면이 들고 있던 옛 설정**을 통째로 되써서 러너에서 방금 고친 본문·항목을 되돌렸다
//     → 적용 직전에 설정을 DB 에서 다시 읽는다
//   · 선언 저장이 task.meta 전체를 읽고 되써 사이에 끼어든 담당자 상태·제출 변경을 지웠다 → RPC
//   · 표 제출 행 키가 제출 순서라 다시 내면 키가 밀려 뒤 단계의 결정이 남의 줄에 붙었다 → 담당자 기준 키
// ========================================

import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { buildCollectTable, formatCollectValue, parseCollectConfig, serializeCollectConfig } from '@/lib/collectInput';
import {
  effectiveOutputKind,
  isManualOutputKind,
  manualPayloadToBody,
  mergePeopleIntoRule,
  outputSourcesForTask,
  OUTPUT_SOURCE_LABEL,
  type ManualOutputKind,
  type OutputRow,
  type OutputTable,
  type PipelineActionLike,
  type PipelineTaskLike,
  type ResolvedOutput,
  type TaskOutputDecl,
} from '@/lib/workPipeline';
import { getCollectBoard, updateCollectConfig } from '@/features/task-workflow/services/collectInputService';
import { updateMessageConfig } from '@/features/task-workflow/services/taskMessageService';
import { listSpecDocuments } from '@/features/task-workflow/services/specDocumentService';
import { MESSAGE_BODY_MAX, parseMessageConfig, serializeMessageConfig } from '@/lib/taskMessage';
import type { AudienceRule } from '@/lib/audienceRule';

// ── 사람이 남긴 산출물 ───────────────────────────────────────────────────────

export interface TaskOutputValueRow {
  task_id: string;
  kind: ManualOutputKind;
  payload: Record<string, unknown>;
  provenance: Record<string, unknown>;
  /** 비공개 원천에서 가져온 표 — 매니저만 본다(서버 RLS) */
  restricted: boolean;
  updated_by_name: string | null;
  updated_at: string;
}

export async function listTaskOutputValues(taskIds: string[]): Promise<TaskOutputValueRow[]> {
  if (taskIds.length === 0) return [];
  const { data, error } = await supabase
    .from('task_output_value')
    .select('task_id, kind, payload, provenance, restricted, updated_by_name, updated_at')
    .in('task_id', taskIds);
  if (error) throw new Error(`산출물 조회 실패: ${error.message}`);
  return (data ?? []) as unknown as TaskOutputValueRow[];
}

export async function saveTaskOutput(input: {
  taskId: string;
  kind: ManualOutputKind;
  payload: Record<string, unknown>;
  provenance?: Record<string, unknown>;
  /** 비공개·본인만 보는 원천에서 가져온 표 — 매니저만 열람. 좁히기만 할 수 있다 */
  restricted?: boolean;
}): Promise<void> {
  const { error } = await supabase.rpc('save_task_output', {
    p_task_id: input.taskId,
    p_kind: input.kind,
    p_payload: input.payload as Json,
    p_provenance: (input.provenance ?? {}) as Json,
    p_restricted: Boolean(input.restricted),
  });
  // 서버가 한국어로 던진다(권한·모양·형태 불일치) — 그대로 올린다
  if (error) throw new Error(error.message);
}

export async function clearTaskOutput(taskId: string): Promise<void> {
  const { error } = await supabase.rpc('clear_task_output', { p_task_id: taskId });
  if (error) throw new Error(error.message);
}

/**
 * 선언(`task.meta.output`) 저장 — **서버가 그 키만** 바꾼다(`set_task_output_decl`, 매니저·만든 사람·관리자).
 * meta 전체를 읽고 되쓰면 사이에 끼어든 담당자 상태·제출 변경이 조용히 사라진다.
 */
export async function updateTaskOutputDecl(taskId: string, decl: TaskOutputDecl | null): Promise<void> {
  const { error } = await supabase.rpc('set_task_output_decl', {
    p_task_id: taskId,
    p_decl: (decl ? { kind: decl.kind, ...(decl.label ? { label: decl.label } : {}) } : null) as Json,
  });
  if (error) throw new Error(error.message);
}

// ── 원천 → 정규화 산출물 ────────────────────────────────────────────────────

function flatValue(v: unknown): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(flatValue).filter(Boolean).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

const emptyTable = { kind: 'table' as const, columns: [], rows: [] };

/** 입력 받기 표 → 산출물 표. 줄마다 그 줄의 사람을 붙인다(명단으로 넘길 수 있게) */
async function resolveCollect(taskId: string, actionId: string, title: string): Promise<ResolvedOutput> {
  const base = {
    taskId,
    sourceType: 'collect' as const,
    sourceKey: `collect:${actionId}`,
    sourceLabel: `${OUTPUT_SOURCE_LABEL.collect} · ${title}`,
  };
  try {
    const board = await getCollectBoard(actionId);
    if (!board.request) {
      return { ...base, body: emptyTable, updatedAt: null, unavailable: '아직 요청을 보내지 않았습니다.' };
    }
    const table = buildCollectTable(board);
    const { config, dimensions } = table;
    const hasUnit = config.axis !== 'person';
    const hasDims = dimensions.some((d) => d.key !== '');
    const columns = [
      ...(hasUnit ? [{ key: '_unit', label: '단위' }] : []),
      { key: '_who', label: '대상' },
      ...(hasDims ? [{ key: '_dim', label: '구분' }] : []),
      ...config.fields.map((f) => ({ key: f.key, label: f.label })),
    ];
    const rows: OutputRow[] = [];
    let latest: string | null = null;
    for (const row of table.rows) {
      if (row.removed) continue;
      row.cells.forEach((cell, i) => {
        const cells: Record<string, string> = {
          ...(hasUnit ? { _unit: row.unitLabel } : {}),
          _who: row.people.map((p) => p.name).join(', '),
          ...(hasDims ? { _dim: dimensions[i].label } : {}),
        };
        for (const f of config.fields) cells[f.key] = formatCollectValue(f, cell.values[f.key]);
        if (cell.updatedAt && (!latest || cell.updatedAt > latest)) latest = cell.updatedAt;
        rows.push({
          key: `${row.key}|${dimensions[i].key}`,
          cells,
          people: row.people.map((p) => ({ resourceId: p.resourceId, name: p.name })),
        });
      });
    }
    const isPrivate = board.request.visibility === 'private';
    return {
      ...base,
      body: { kind: 'table', columns, rows },
      updatedAt: latest ?? board.request.started_at,
      // 비공개 수합 = 보는 사람마다 범위가 다르다 → 옮기면 «제한»
      restricted: isPrivate,
      // 비공개 수합이면 매니저가 아닌 사람은 자기 줄만 본다 — 그 사실을 말한다
      ...(!board.viewer.can_manage && isPrivate ? { unavailable: '비공개 수합이라 내 응답만 보입니다.' } : {}),
    };
  } catch (e) {
    return { ...base, body: emptyTable, updatedAt: null, unavailable: (e as Error).message };
  }
}

async function resolveMessage(taskId: string, actionId: string, title: string): Promise<ResolvedOutput> {
  const base = {
    taskId,
    sourceType: 'message' as const,
    sourceKey: `message:${actionId}`,
    sourceLabel: `${OUTPUT_SOURCE_LABEL.message} · ${title}`,
  };
  const { data, error } = await supabase
    .from('task_message_send')
    .select('title, body, sent_at, sender_name')
    .eq('action_id', actionId)
    .order('sent_at', { ascending: false })
    .limit(1);
  if (error) return { ...base, body: { kind: 'value', text: '' }, updatedAt: null, unavailable: error.message };
  const last = data?.[0];
  if (!last) return { ...base, body: { kind: 'value', text: '' }, updatedAt: null, unavailable: '아직 보내지 않았습니다(보낸 기록은 책임자만 봅니다).' };
  const text = [last.title ? `[${last.title}]` : '', last.body].filter(Boolean).join('\n');
  return { ...base, body: { kind: 'value', text }, updatedAt: last.sent_at, updatedByName: last.sender_name };
}

async function resolveSpec(taskId: string, actionId: string, title: string): Promise<ResolvedOutput> {
  const base = {
    taskId,
    sourceType: 'spec' as const,
    sourceKey: `spec:${actionId}`,
    sourceLabel: `${OUTPUT_SOURCE_LABEL.spec} · ${title}`,
    // 스펙 문서는 만든 사람만 본다 — 옮기면 «제한»
    restricted: true,
  };
  try {
    const docs = await listSpecDocuments(actionId);
    const doc = docs.find((d) => d.status === 'final') ?? docs[0];
    if (!doc) {
      return {
        ...base,
        body: { kind: 'spec_document', title: '', fields: [] },
        updatedAt: null,
        unavailable: '내가 저장한 문서가 없습니다(스펙 문서는 만든 사람만 봅니다).',
      };
    }
    const fields = Object.entries(doc.field_values)
      .map(([key, value]) => ({ key, value: flatValue(value) }))
      .filter((f) => f.value.trim());
    for (const [key, rows] of Object.entries(doc.row_values)) {
      if (Array.isArray(rows) && rows.length) fields.push({ key, value: `${rows.length}줄` });
    }
    return { ...base, body: { kind: 'spec_document', title: doc.title, fields }, updatedAt: doc.updated_at };
  } catch (e) {
    return { ...base, body: { kind: 'spec_document', title: '', fields: [] }, updatedAt: null, unavailable: (e as Error).message };
  }
}

async function resourceNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data } = await supabase.from('resource').select('id, name').in('id', unique);
  return new Map((data ?? []).map((r) => [r.id as string, r.name as string]));
}

/** 매니저가 아니면 제출물은 **내 것만** 보인다 — «비었다»가 아니라 그 사실을 말한다 */
const ownOnlyNote = (viewerCanManage: boolean) => (viewerCanManage ? {} : { unavailable: '책임자가 아니면 내 제출물만 보입니다.' });

async function resolveSubmission(
  task: PipelineTaskLike,
  mode: 'file' | 'spec' | 'spreadsheet',
  viewerCanManage: boolean,
): Promise<ResolvedOutput> {
  const base = { taskId: task.id, sourceType: 'submission' as const, sourceKey: `submission:${mode}`, sourceLabel: OUTPUT_SOURCE_LABEL.submission };
  if (mode === 'spec') {
    // 값 제출 = 담당자 × 항목 표(매니저 현황과 같은 뷰 — 권한도 그 뷰가 정한다)
    const { data, error } = await supabase
      .from('task_spec_submission_view')
      .select('assignee_name, assignee_resource_id, unit_key, field_values, submitted_at, resubmitted_at')
      .eq('task_id', task.id);
    if (error) return { ...base, body: emptyTable, updatedAt: null, unavailable: error.message };
    const keys = new Set<string>();
    for (const r of data ?? []) Object.keys((r.field_values as Record<string, unknown>) ?? {}).forEach((k) => keys.add(k));
    const columns = [{ key: '_who', label: '제출자' }, ...[...keys].map((k) => ({ key: k, label: k }))];
    let latest: string | null = null;
    const rows: OutputRow[] = (data ?? []).map((r, i) => {
      const values = (r.field_values as Record<string, unknown>) ?? {};
      const cells: Record<string, string> = { _who: r.assignee_name ?? '' };
      for (const k of keys) cells[k] = flatValue(values[k]);
      const at = r.resubmitted_at ?? r.submitted_at;
      if (at && (!latest || at > latest)) latest = at;
      return {
        // 담당자 × 단위 — 한 사람이 단위 둘을 내면 키가 겹치지 않게
        key: `${r.assignee_resource_id ?? `s${i}`}|${r.unit_key ?? ''}`,
        cells,
        people: r.assignee_name ? [{ resourceId: r.assignee_resource_id, name: r.assignee_name }] : undefined,
      };
    });
    return { ...base, body: { kind: 'table', columns, rows }, updatedAt: latest, restricted: true, ...ownOnlyNote(viewerCanManage) };
  }

  const { data, error } = await supabase
    .from('task_submission')
    .select('file_name, file_url, kind, spreadsheet_data, created_at, assignee_resource_id, unit_key')
    .eq('task_id', task.id)
    .order('created_at', { ascending: true });
  if (error) return { ...base, body: mode === 'spreadsheet' ? emptyTable : { kind: 'file', files: [] }, updatedAt: null, unavailable: error.message };
  const list = data ?? [];
  const latest = list.reduce<string | null>((m, r) => (!m || r.created_at > m ? r.created_at : m), null);

  if (mode === 'spreadsheet') {
    const visibility = ((task.meta?.submission ?? {}) as { visibility?: string }).visibility === 'all' ? 'all' : 'own';
    const names = await resourceNames(list.map((s) => s.assignee_resource_id as string));
    let sheetColumns: { key: string; label: string }[] = [];
    const rows: OutputRow[] = [];
    for (const s of list) {
      const sheet = s.spreadsheet_data as { columns?: { key: string; label: string }[]; rows?: string[][] } | null;
      if (!sheet?.columns) continue;
      if (sheetColumns.length === 0) sheetColumns = sheet.columns.map((c) => ({ key: c.key, label: c.label }));
      const who = names.get(s.assignee_resource_id as string) ?? '';
      (sheet.rows ?? []).forEach((cellsArr, ri) => {
        const cells: Record<string, string> = { _who: who };
        sheetColumns.forEach((c, ci) => { cells[c.key] = String(cellsArr?.[ci] ?? ''); });
        rows.push({
          // 제출 순서가 아니라 **담당자·단위·줄 번호** — 다시 내도 키가 밀리지 않는다
          key: `${s.assignee_resource_id}|${s.unit_key ?? ''}|${ri}`,
          cells,
          people: who ? [{ resourceId: s.assignee_resource_id as string, name: who }] : undefined,
        });
      });
    }
    const columns = [{ key: '_who', label: '제출자' }, ...sheetColumns];
    return {
      ...base,
      body: { kind: 'table', columns, rows },
      updatedAt: latest,
      restricted: visibility === 'own',
      ...(visibility === 'own' ? ownOnlyNote(viewerCanManage) : {}),
    };
  }

  const files = list
    .filter((s) => s.kind === 'file' && s.file_url)
    .map((s) => ({ name: s.file_name, url: s.file_url as string }));
  return { ...base, body: { kind: 'file', files }, updatedAt: latest, restricted: true, ...ownOnlyNote(viewerCanManage) };
}

async function canViewTaskOutput(taskId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('can_view_task_output', { p_task_id: taskId });
  return !error && Boolean(data);
}

/**
 * 한 할 일의 산출물 전부 — **원천마다 하나씩**. 한 원천이 실패해도 나머지는 보여 준다
 * (실패한 원천은 unavailable 에 까닭을 담는다).
 *
 * 사람이 남긴 값은 **지금 선언된 형태와 같을 때만** 흐름에 싣는다 — 선언을 바꾼 뒤 옛 값이 뒤 단계로 계속
 * 흘러가면서 정작 이 할 일의 편집기에는 안 보이는 상태가 됐다(적대적 검증 2026-09-27). 어긋난 옛 값은
 * 이 할 일 화면이 «지우기»와 함께 따로 보여 준다.
 */
export async function resolveTaskOutputs(
  task: PipelineTaskLike,
  actions: PipelineActionLike[],
  manual: TaskOutputValueRow | null,
  opts: { viewerCanManage: boolean },
): Promise<ResolvedOutput[]> {
  const sources = outputSourcesForTask(task, actions);
  const ownKind = effectiveOutputKind(task, actions);
  const jobs = sources.map(async (source): Promise<ResolvedOutput | null> => {
    switch (source.type) {
      case 'manual': {
        if (!isManualOutputKind(ownKind)) return null;
        if (!manual) {
          // 보이지 않는 것인지, 아직 없는 것인지 — 권한을 물어 구분한다
          if (await canViewTaskOutput(task.id)) return null;
          return {
            taskId: task.id, sourceType: 'manual', sourceKey: 'manual', sourceLabel: OUTPUT_SOURCE_LABEL.manual,
            body: manualPayloadToBody(ownKind, {}) ?? { kind: 'value', text: '' },
            updatedAt: null,
            unavailable: '이 업무의 책임자·담당자만 봅니다.',
          };
        }
        if (manual.kind !== ownKind) return null;
        const body = manualPayloadToBody(manual.kind, manual.payload);
        if (!body) return null;
        return {
          taskId: task.id,
          sourceType: 'manual',
          sourceKey: 'manual',
          sourceLabel: OUTPUT_SOURCE_LABEL.manual,
          body,
          updatedAt: manual.updated_at,
          updatedByName: manual.updated_by_name,
          restricted: manual.restricted,
        };
      }
      case 'collect': return resolveCollect(task.id, source.actionId, source.title);
      case 'message': return resolveMessage(task.id, source.actionId, source.title);
      case 'spec': return resolveSpec(task.id, source.actionId, source.title);
      case 'submission': return resolveSubmission(task, source.mode, opts.viewerCanManage);
    }
  });
  const settled = await Promise.all(jobs);
  return settled.filter((o): o is ResolvedOutput => !!o);
}

// ── L2 흐름 적용 ────────────────────────────────────────────────────────────
// 서버 RPC 가 권한(매니저)·잠금(보낸 뒤 대상 변경)을 다시 판정한다. 여기서 흉내 내지 않는다.
// ⚠️ 설정은 **적용 직전에 DB 에서 다시 읽는다** — 화면이 들고 있던 설정은 러너에서 방금 고친 것보다 옛것일
//    수 있고, update_*_config 는 설정을 통째로 받으므로 옛것을 넘기면 방금 고친 것이 사라진다.

async function freshActionConfig(actionId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.from('task_action').select('config').eq('id', actionId).single();
  if (error) throw new Error(`작업 설정을 읽지 못했습니다: ${error.message}`);
  return (data?.config ?? null) as Record<string, unknown> | null;
}

export async function applyPeopleToMessageAudience(actionId: string, ids: string[], mode: 'add' | 'replace'): Promise<void> {
  const config = parseMessageConfig(await freshActionConfig(actionId));
  const audience = mergePeopleIntoRule(config.audience, ids, mode) as AudienceRule;
  await updateMessageConfig(actionId, serializeMessageConfig({ ...config, audience }));
}

export async function applyPeopleToCollectAudience(actionId: string, ids: string[], mode: 'add' | 'replace'): Promise<{ warning: string | null }> {
  const config = parseCollectConfig(await freshActionConfig(actionId));
  const audience = mergePeopleIntoRule(config.audience, ids, mode) as AudienceRule;
  const result = await updateCollectConfig(actionId, serializeCollectConfig({ ...config, audience }));
  return { warning: result?.warning ?? null };
}

/** 본문에 넣은 결과 — 넣기 전에 길이를 재서 서버 거부 전에 말한다 */
export function composeMessageBody(current: string, text: string, mode: 'append' | 'replace'): string {
  return mode === 'replace' || !current.trim() ? text : `${current.trim()}\n\n${text}`;
}

/** 메시지 본문에 글을 넣는다 — 기본은 **덧붙이기**(이미 쓴 본문을 지우지 않는다) */
export async function applyTextToMessageBody(actionId: string, text: string, mode: 'append' | 'replace'): Promise<void> {
  const config = parseMessageConfig(await freshActionConfig(actionId));
  const body = composeMessageBody(config.body, text, mode);
  if (body.length > MESSAGE_BODY_MAX) {
    throw new Error(`본문이 ${body.length.toLocaleString()}자가 되어 한도(${MESSAGE_BODY_MAX.toLocaleString()}자)를 넘습니다. 표에서 줄을 골라 줄이거나 [AI 글로 정리]를 쓰세요.`);
  }
  await updateMessageConfig(actionId, serializeMessageConfig({ ...config, body }));
}

/** 표를 저장 모양으로 — 줄에 붙은 사람까지 함께 남긴다(다음 단계가 명단으로 쓸 수 있게) */
export function tablePayload(table: OutputTable): Record<string, unknown> {
  return {
    columns: table.columns,
    rows: table.rows.map((r) => ({ key: r.key, cells: r.cells, ...(r.people?.length ? { people: r.people } : {}) })),
  };
}
