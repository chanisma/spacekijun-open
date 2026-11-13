// ========================================
// 업무 지식 칸 — 업무 상세(WorkDetailDialog) 안 (2026-10-24)
// 이 업무와 지난 해들(«지난 업무 가져오기» 계보)의 수행 지식(절차·요령·주의·참고·인사이트)을 보고,
// 책임자가 남기고·고치고·보관한다. 에이전트(MCP)와 같은 표(work_knowledge)를 쓴다.
// 껍데기(조회·쓰기) = WorkKnowledgeSection, 몸(그리기만) = WorkKnowledgeView — SSR 회귀가 몸을 그린다.
// 판정·문구 단일 출처 = src/lib/workKnowledge.ts
// ========================================

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { SectionLabel } from './dialogDesign';
import {
  KNOWLEDGE_KIND_HINT,
  KNOWLEDGE_KIND_LABEL,
  WRITABLE_KNOWLEDGE_KINDS,
  archiveReasonError,
  isThisWork,
  knowledgeInputError,
  knowledgeOriginLabel,
  knowledgeTargetToColumns,
  lineageSummary,
  sortKnowledge,
  type WorkKnowledgeData,
  type WorkKnowledgeItem,
  type WorkKnowledgeKind,
} from '@/lib/workKnowledge';
import {
  AlertTriangle,
  Archive,
  BookOpen,
  Edit,
  Lightbulb,
  ListOrdered,
  Loader2,
  NotebookPen,
  Plus,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

const KIND_ICON: Record<WorkKnowledgeKind, React.ComponentType<{ className?: string }>> = {
  procedure: ListOrdered,
  tip: Lightbulb,
  caution: AlertTriangle,
  reference: BookOpen,
  insight: Sparkles,
};

/** 주의 = 앰버(놓치면 손해), 인사이트 = 바이올렛(에이전트가 찾은 것), 나머지는 중립 — 상태 색(에메랄드·블루·로즈)은 쓰지 않는다 */
const KIND_CHIP: Record<WorkKnowledgeKind, string> = {
  procedure: 'border-slate-200 bg-slate-50 text-slate-700',
  tip: 'border-slate-200 bg-slate-50 text-slate-700',
  caution: 'border-amber-200 bg-amber-50 text-amber-800',
  reference: 'border-slate-200 bg-slate-50 text-slate-700',
  insight: 'border-violet-200 bg-violet-50 text-violet-700',
};

export interface KnowledgeDraft {
  kind: WorkKnowledgeKind;
  title: string;
  body: string;
  basis: string;
  /** 붙일 곳 — '' = 업무 전체 · 'task:<id>' · 'action:<id>' (knowledgeTargetToColumns) */
  target: string;
}

const emptyDraft = (): KnowledgeDraft => ({ kind: 'procedure', title: '', body: '', basis: '', target: '' });

/** 할 일과 그 작업들 — 작업 지식은 «그 작업»에 붙는다 */
export interface KnowledgeTaskOption {
  id: string;
  title: string;
  actions?: Array<{ id: string; title: string; type: string }>;
}

export interface WorkKnowledgeViewProps {
  data: WorkKnowledgeData | undefined;
  loading?: boolean;
  error?: string | null;
  tasks: KnowledgeTaskOption[];
  showArchived: boolean;
  onToggleArchived: () => void;
  onAdd: (draft: KnowledgeDraft) => Promise<void>;
  onUpdate: (id: number, patch: { title: string; body: string; basis: string }) => Promise<void>;
  onArchive: (id: number, reason: string) => Promise<void>;
  onRestore: (id: number) => Promise<void>;
  busy?: boolean;
  /** SSR 회귀용 — 처음부터 쓰기 칸을 연다 */
  initialFormOpen?: boolean;
}

/** 그리기만 한다 — 조회·쓰기는 부모가 넘긴다 */
export function WorkKnowledgeView({
  data, loading, error, tasks, showArchived, onToggleArchived, onAdd, onUpdate, onArchive, onRestore, busy, initialFormOpen,
}: WorkKnowledgeViewProps) {
  const [formOpen, setFormOpen] = useState(!!initialFormOpen);
  const [draft, setDraft] = useState<KnowledgeDraft>(emptyDraft);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState({ title: '', body: '', basis: '' });
  const [archivingId, setArchivingId] = useState<number | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [rowError, setRowError] = useState<string | null>(null);

  // 책임자(또는 이어받은 책임자)가 아니면 칸 자체를 그리지 않는다 — 서버가 판정한다
  if (!loading && !error && data && !data.can_view) return null;

  const items = sortKnowledge(data?.items ?? []);
  const canWrite = !!data?.can_write;
  const summary = lineageSummary(data?.lineage);
  const activeCount = items.filter((i) => i.status !== 'archived').length;

  const submit = async () => {
    const err = knowledgeInputError(draft);
    if (err) { setFormError(err); return; }
    setFormError(null);
    await onAdd(draft);
    setDraft(emptyDraft());
    setFormOpen(false);
  };

  const saveEdit = async (id: number) => {
    const err = knowledgeInputError(editDraft);
    if (err) { setRowError(err); return; }
    setRowError(null);
    await onUpdate(id, editDraft);
    setEditingId(null);
  };

  const confirmArchive = async (id: number) => {
    const err = archiveReasonError(archiveReason);
    if (err) { setRowError(err); return; }
    setRowError(null);
    await onArchive(id, archiveReason.trim());
    setArchivingId(null);
    setArchiveReason('');
  };

  return (
    <section className="space-y-2" data-testid="work-knowledge">
      <SectionLabel
        icon={NotebookPen}
        trailing={
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleArchived}
              className="text-xs text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
            >
              {showArchived ? '보관한 것 숨기기' : '보관한 것도 보기'}
            </button>
            {canWrite && !formOpen && (
              <Button onClick={() => setFormOpen(true)} size="sm" className="h-7 gap-1 px-2 text-xs">
                <Plus className="h-3 w-3" />
                지식 남기기
              </Button>
            )}
          </span>
        }
      >
        업무 지식{activeCount > 0 && ` ${activeCount}`}
      </SectionLabel>

      {summary && <p className="text-[11px] text-slate-500">{summary}</p>}

      {canWrite && formOpen && (
        <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/30 p-3" data-testid="work-knowledge-form">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="지식 종류">
            {WRITABLE_KNOWLEDGE_KINDS.map((k) => {
              const Icon = KIND_ICON[k];
              const on = draft.kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setDraft((d) => ({ ...d, kind: k }))}
                  className={cn(
                    'inline-flex min-h-[44px] items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition-colors sm:min-h-0 sm:py-1',
                    on ? 'border-blue-500 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {KNOWLEDGE_KIND_LABEL[k]}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500">{KNOWLEDGE_KIND_HINT[draft.kind]}</p>
          <Input
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="한 줄 제목 (예: 계획 양식은 교과협의회에서 먼저 정한다)"
            maxLength={200}
            className="h-9 text-sm"
          />
          <Textarea
            value={draft.body}
            onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
            placeholder="내용 — 다음 해 담당자와 에이전트가 읽습니다"
            maxLength={4000}
            rows={3}
            className="text-sm"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1 text-[11px] text-slate-500">
              붙일 곳 (선택 — 작업의 설정·처리 요령은 그 작업에)
              <select
                value={draft.target}
                onChange={(e) => setDraft((d) => ({ ...d, target: e.target.value }))}
                className="h-9 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700"
              >
                <option value="">업무 전체</option>
                {tasks.map((t) => (
                  <optgroup key={t.id} label={t.title}>
                    <option value={`task:${t.id}`}>할 일 · {t.title}</option>
                    {(t.actions ?? []).map((a) => (
                      <option key={a.id} value={`action:${a.id}`}>작업 · {a.title}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-[11px] text-slate-500">
              근거 (선택)
              <Input
                value={draft.basis}
                onChange={(e) => setDraft((d) => ({ ...d, basis: e.target.value }))}
                placeholder="어디서 알았나 (예: 2026 응답 지연)"
                maxLength={1000}
                className="h-9 text-sm"
              />
            </label>
          </div>
          {formError && <p className="text-xs text-rose-600" role="alert">{formError}</p>}
          <div className="flex justify-end gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => { setFormOpen(false); setDraft(emptyDraft()); setFormError(null); }}
            >
              취소
            </Button>
            <Button size="sm" className="h-8 gap-1 bg-blue-600 text-xs hover:bg-blue-700" disabled={busy} onClick={() => void submit()}>
              {busy && <Loader2 className="h-3 w-3 animate-spin" />}
              남기기
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="py-3 text-center text-xs text-slate-500">업무 지식을 불러오는 중...</p>
      ) : error ? (
        <p className="text-xs text-rose-600" role="alert">업무 지식을 불러오지 못했습니다 — {error}</p>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs leading-relaxed text-slate-500">
          아직 남긴 지식이 없습니다. 이 업무의 절차·요령·주의할 점을 남기면
          «지난 업무 가져오기»로 이어받는 다음 해 담당자와 에이전트가 함께 봅니다.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rowError && <li className="text-xs text-rose-600" role="alert">{rowError}</li>}
          {items.map((item) => (
            <KnowledgeRow
              key={item.knowledge_id}
              item={item}
              canEdit={canWrite && isThisWork(item)}
              editing={editingId === item.knowledge_id}
              editDraft={editDraft}
              onEditDraft={setEditDraft}
              onStartEdit={() => {
                setArchivingId(null);
                setRowError(null);
                setEditingId(item.knowledge_id);
                setEditDraft({ title: item.title, body: item.body, basis: item.basis ?? '' });
              }}
              onCancelEdit={() => { setEditingId(null); setRowError(null); }}
              onSaveEdit={() => void saveEdit(item.knowledge_id)}
              archiving={archivingId === item.knowledge_id}
              archiveReason={archiveReason}
              onArchiveReason={setArchiveReason}
              onStartArchive={() => { setEditingId(null); setRowError(null); setArchivingId(item.knowledge_id); setArchiveReason(''); }}
              onCancelArchive={() => { setArchivingId(null); setRowError(null); }}
              onConfirmArchive={() => void confirmArchive(item.knowledge_id)}
              onRestore={() => void onRestore(item.knowledge_id)}
              busy={busy}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function KnowledgeRow({
  item, canEdit, editing, editDraft, onEditDraft, onStartEdit, onCancelEdit, onSaveEdit,
  archiving, archiveReason, onArchiveReason, onStartArchive, onCancelArchive, onConfirmArchive, onRestore, busy,
}: {
  item: WorkKnowledgeItem;
  canEdit: boolean;
  editing: boolean;
  editDraft: { title: string; body: string; basis: string };
  onEditDraft: (d: { title: string; body: string; basis: string }) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  archiving: boolean;
  archiveReason: string;
  onArchiveReason: (v: string) => void;
  onStartArchive: () => void;
  onCancelArchive: () => void;
  onConfirmArchive: () => void;
  onRestore: () => void;
  busy?: boolean;
}) {
  const Icon = KIND_ICON[item.kind] ?? NotebookPen;
  const archived = item.status === 'archived';
  return (
    <li
      className={cn('min-w-0 rounded-lg border px-3 py-2', archived ? 'border-slate-200 bg-slate-50/60 opacity-70' : 'border-slate-200/80 bg-white')}
      data-kind={item.kind}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium', KIND_CHIP[item.kind])}>
          <Icon className="h-3 w-3" />
          {KNOWLEDGE_KIND_LABEL[item.kind]}
        </span>
        {!editing && <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800" title={item.title}>{item.title}</span>}
        <span className="shrink-0 text-[11px] text-slate-400">{knowledgeOriginLabel(item)}</span>
      </div>

      {editing ? (
        <div className="mt-2 space-y-1.5">
          <Input value={editDraft.title} maxLength={200} onChange={(e) => onEditDraft({ ...editDraft, title: e.target.value })} className="h-8 text-sm" />
          <Textarea value={editDraft.body} maxLength={4000} rows={3} onChange={(e) => onEditDraft({ ...editDraft, body: e.target.value })} className="text-sm" />
          <Input value={editDraft.basis} maxLength={1000} placeholder="근거 (선택)" onChange={(e) => onEditDraft({ ...editDraft, basis: e.target.value })} className="h-8 text-sm" />
          <div className="flex justify-end gap-1.5">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onCancelEdit}>취소</Button>
            <Button size="sm" className="h-8 bg-blue-600 text-xs hover:bg-blue-700" disabled={busy} onClick={onSaveEdit}>저장</Button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{item.body}</p>
          {item.suggestions && item.suggestions.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-600">
              {item.suggestions.map((s, i) => (
                <li key={i} className="break-words">
                  {s.text}
                  {s.task_title && <span className="text-slate-400"> — {s.task_title}</span>}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
            {item.task_now && (
              <span className="min-w-0 truncate" title={item.task_then && item.task_then !== item.task_now.title ? `지난 해 이름: ${item.task_then}` : undefined}>
                할 일 · {item.task_now.title}
              </span>
            )}
            {item.action_now && (
              <span className="min-w-0 truncate" title={item.action_then && item.action_then !== item.action_now.title ? `지난 해 이름: ${item.action_then}` : undefined}>
                작업 · {item.action_now.title}
              </span>
            )}
            {!item.action_now && item.action_then && <span className="min-w-0 truncate">지난 해 작업 · {item.action_then} (올해 이어진 작업 없음)</span>}
            {!item.task_now && item.task_then && <span className="min-w-0 truncate">지난 해 할 일 · {item.task_then} (올해 이어진 할 일 없음)</span>}
            {item.basis && <span className="min-w-0 break-words">근거 · {item.basis}</span>}
            {item.decision && (
              <span className={item.decision === 'applied' ? 'text-blue-700' : 'text-slate-500'}>
                {item.decision === 'applied' ? '올해 따름' : '올해 따르지 않음'}
              </span>
            )}
            {archived && <span className="text-slate-500">보관 · {item.archived_reason ?? '이유 없음'}</span>}
          </div>
        </>
      )}

      {archiving && (
        <div className="mt-2 space-y-1.5">
          <Input
            value={archiveReason}
            onChange={(e) => onArchiveReason(e.target.value)}
            maxLength={500}
            placeholder="보관 이유 (예: 올해부터 일정이 바뀜)"
            className="h-8 text-sm"
            aria-label="보관 이유"
          />
          <div className="flex justify-end gap-1.5">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onCancelArchive}>취소</Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy} onClick={onConfirmArchive}>보관</Button>
          </div>
        </div>
      )}

      {!editing && !archiving && (
        <div className="mt-1 flex justify-end gap-0.5">
          {canEdit && !archived && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px] text-slate-500" onClick={onStartEdit}>
              <Edit className="h-3 w-3" />
              고치기
            </Button>
          )}
          {archived ? (
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px] text-slate-500" disabled={busy} onClick={onRestore}>
              <RotateCcw className="h-3 w-3" />
              다시 쓰기
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px] text-slate-500" onClick={onStartArchive}
              title="더는 맞지 않는 지식 — 지우지 않고 이유와 함께 보관합니다">
              <Archive className="h-3 w-3" />
              보관
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

/** 조회·쓰기 껍데기 — 업무 상세가 쓴다 */
export function WorkKnowledgeSection({ workId, tasks }: { workId: string; tasks: Array<{ id: string; title: string }> }) {
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const queryKey = ['work-knowledge', workId, showArchived] as const;
  const taskIds = tasks.map((t) => t.id);

  // «붙일 곳»에 작업을 고르려면 할 일마다 작업 목록이 필요하다(보관한 작업 제외)
  const { data: actions = [] } = useQuery({
    queryKey: ['work-knowledge', workId, 'actions', taskIds.join(',')],
    enabled: taskIds.length > 0,
    queryFn: async () => {
      const { data: rows, error: err } = await supabase
        .from('task_action')
        .select('id, task_id, title, action_type')
        .in('task_id', taskIds)
        .is('archived_at', null)
        .order('created_at', { ascending: true });
      if (err) throw err;
      return (rows ?? []) as Array<{ id: string; task_id: string; title: string; action_type: string }>;
    },
  });
  const taskOptions: KnowledgeTaskOption[] = tasks.map((t) => ({
    ...t,
    actions: actions.filter((a) => a.task_id === t.id).map((a) => ({ id: a.id, title: a.title, type: a.action_type })),
  }));

  const { data, isLoading, error } = useQuery({
    queryKey,
    enabled: !!workId,
    queryFn: async (): Promise<WorkKnowledgeData> => {
      const { data: res, error: err } = await (supabase as any).rpc('get_work_knowledge', {
        p_work_id: workId,
        p_include_archived: showArchived,
      });
      if (err) throw err;
      return res as WorkKnowledgeData;
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['work-knowledge', workId] });
  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : '업무 지식을 저장하지 못했습니다.');

  const mutation = useMutation({
    mutationFn: async (run: () => Promise<void>) => run(),
    onSuccess: refresh,
    onError: fail,
  });

  // 남에게 알림이 가지 않고 이 칸이 바로 갱신되므로 성공 토스트는 두지 않는다
  const write = (fn: () => PromiseLike<{ error: unknown }>) => mutation.mutateAsync(async () => {
    const { error: err } = await fn();
    if (err) throw err;
  });

  return (
    <WorkKnowledgeView
      data={data}
      loading={isLoading}
      error={error ? (error as Error).message : null}
      tasks={taskOptions}
      showArchived={showArchived}
      onToggleArchived={() => setShowArchived((v) => !v)}
      busy={mutation.isPending}
      // 작성자·역할·경로는 서버 트리거가 정한다 — 넣지 않는다. .select() 를 붙이지 않는다(INSERT … RETURNING 은 SELECT 정책도 본다)
      onAdd={(d) => write(() => (supabase as any).from('work_knowledge').insert({
        work_id: workId,
        kind: d.kind,
        title: d.title.trim(),
        body: d.body.trim(),
        basis: d.basis.trim() || null,
        // 작업이면 action_id 만 — 할 일은 서버 트리거가 그 작업의 할 일로 채운다
        ...knowledgeTargetToColumns(d.target),
      }))}
      onUpdate={(id, p) => write(() => (supabase as any).from('work_knowledge')
        .update({ title: p.title.trim(), body: p.body.trim(), basis: p.basis.trim() || null }).eq('id', id))}
      onArchive={(id, reason) => write(() => (supabase as any).from('work_knowledge')
        .update({ status: 'archived', archived_reason: reason }).eq('id', id))}
      onRestore={(id) => write(() => (supabase as any).from('work_knowledge')
        .update({ status: 'active', archived_reason: null }).eq('id', id))}
    />
  );
}
