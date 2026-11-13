// ========================================
// 할 일 편집 창 — 작업(Action) 카드 (2026-09-23)
//
// "담당자가 이 할 일에서 할 것"을 한 목록으로 설정한다. 제출 받기·NEIS 화면·문서 양식·기능
// 연결이 전부 같은 줄에 선다(사용자 결정: 제출도 하나의 작업이고, 할 일과 작업의 UX 를 가르지
// 않는다). 변경은 초안(ActionDraft)에 모였다가 [저장] 때 반영된다 — utils/taskActionDraft.ts.
//
// 옛 제출 받기(task.meta.submission) 줄은 2026-10-05 에 걷어 냈다 — 운영 0건이었고, 제출은 등록부의
// 「제출 받기」 작업(파일·양식 문서·실물)이 다른 작업과 같은 줄로 맡는다.
// ========================================

import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Landmark, Plus, RotateCcw, X } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { isFacultyRole } from '@/lib/roles';
import { parseNeisActionConfig, type NeisActionConfig } from '@/lib/neisScreens';
import {
  AVAILABLE_TASK_ACTION_DEFINITIONS,
  TASK_ACTION_CATEGORY_META,
  TASK_ACTION_CATEGORY_ORDER,
  getTaskActionDefinition,
  type TaskActionDefinition,
} from '@/features/task-workflow/actionRegistry';
import { KindIcon, TaskActionRunnerDialog } from '@/features/task-workflow/components/TaskActionPanel';
import { NeisScreensEditor } from '@/features/task-workflow/components/NeisScreenActionRunner';
import { manageSummaryFor } from '@/features/task-workflow/utils/actionPanelMode';
import {
  addableDefinitions,
  canRemoveAction,
  listableActions,
  type ActionDraft,
  type PendingAction,
} from '@/features/task-workflow/utils/taskActionDraft';
import { disconnectEffect } from '@/features/task-workflow/utils/disconnectEffect';
import type { TaskAction } from '@/features/task-workflow/types';
import { moveKey, orderByFlow } from '@/features/task-workflow/utils/actionFlow';

const EMPTY_NEIS: NeisActionConfig = { version: 1, screens: [] };

/**
 * 이 카드에서 화면을 **바로 고르는** 작업은 NEIS 업무 화면뿐이다 (2026-10-05).
 * ⚠️ `kind === 'external'` 로 판정하지 말 것 — 「외부 시스템에서 처리」(`external.screen`)도 같은 kind 라,
 *    종전엔 그 작업을 추가하면 NEIS 화면 고르기가 펼쳐지고 저장 뒤 [열기]가 숨겨져 제 설정 화면에 갈 수 없었다.
 */
const isNeisType = (type: string | undefined) => type === 'neis.screen';

function Row({
  step,
  icon,
  title,
  summary,
  badge,
  muted,
  warn,
  open,
  onToggle,
  actions,
  children,
  onMove,
  isFirst,
  isLast,
}: {
  step: number | null;
  icon: ReactNode;
  title: string;
  summary?: string;
  badge?: ReactNode;
  muted?: boolean;
  /** 요약을 경고로 — 저장하면 막힐 조합을 미리 알린다. 잘라 내지 않는다(이유가 잘리면 안 된다) */
  warn?: boolean;
  open?: boolean;
  onToggle?: () => void;
  actions?: ReactNode;
  children?: ReactNode;
  /** 순서 이동(권장 순서 — 강제하지 않는다) */
  onMove?: (direction: -1 | 1) => void;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  return (
    <li className={cn('rounded-lg border bg-white', muted ? 'border-dashed border-slate-200 opacity-70' : 'border-slate-200')}>
      <div className="flex items-start gap-2.5 p-2.5">
        <div className="flex shrink-0 flex-col items-center gap-0.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-700">
            {step ?? '–'}
          </span>
          {onMove && (
            <span className="flex">
              <button
                type="button"
                className="flex h-6 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                disabled={isFirst}
                aria-label="앞으로"
                onClick={() => onMove(-1)}
              >
                <ArrowUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                className="flex h-6 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                disabled={isLast}
                aria-label="뒤로"
                onClick={() => onMove(1)}
              >
                <ArrowDown className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
        {icon}
        <div className="min-w-0 flex-1">
          <p className={cn('break-words text-xs font-semibold leading-5 text-slate-800', muted && 'line-through')}>
            {title}
            {badge}
          </p>
          {summary && (warn
            ? <p className="text-[11px] font-medium text-amber-700">{summary}</p>
            : <p className="truncate text-[11px] text-slate-500" title={summary}>{summary}</p>)}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          {onToggle && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-[11px] text-slate-500"
              aria-expanded={open}
              onClick={onToggle}
            >
              설정
              <ChevronDown className={cn('ml-0.5 h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
            </Button>
          )}
        </div>
      </div>
      {open && children && <div className="border-t border-slate-100 p-3">{children}</div>}
    </li>
  );
}

/** 추가 메뉴의 한 줄 — 제출 받기와 등록부 작업이 같은 줄을 쓴다 */
function AddMenuItem({
  icon, title, description, disabled = false, onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        title={disabled ? description : undefined}
        onClick={onClick}
        className="flex w-full items-center gap-2 px-1.5 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {icon}
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-slate-700">{title}</span>
          <span className="block truncate text-[11px] text-slate-500" title={description}>{description}</span>
        </span>
      </button>
    </li>
  );
}

export function TaskActionsSection({
  existing,
  draft,
  onDraftChange,
  canOpenSaved,
  order,
  onOrderChange,
}: {
  /** 저장된 연결(수정 창) — 새 할 일이면 빈 배열 */
  existing: TaskAction[];
  draft: ActionDraft;
  onDraftChange: (next: ActionDraft) => void;
  /** 저장된 작업의 실행 창을 여기서 열 수 있는가(할 일 저장 전에는 불가) */
  canOpenSaved: boolean;
  /** 작업 순서 키 목록(권장 순서) — 연결=id, 새 작업=임시 키 */
  order: string[];
  onOrderChange: (next: string[]) => void;
}) {
  const { user, profile, isAdmin } = useAuth();
  const userId = user?.id ?? null;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [adding, setAdding] = useState(false);
  const [openAction, setOpenAction] = useState<TaskAction | null>(null);

  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const canUse = (definition: TaskActionDefinition) =>
    definition.adminOnly ? isAdmin : Boolean(user) && isFacultyRole(profile?.role);
  const listed = listableActions(existing);
  const removed = new Set(draft.removeIds);
  const addable = addableDefinitions(AVAILABLE_TASK_ACTION_DEFINITIONS, { existing, draft, userId, canUse });

  const addPending = (definition: TaskActionDefinition) => {
    const tempId = `new-${definition.type}-${Date.now()}`;
    const item: PendingAction = {
      tempId,
      type: definition.type,
      ...(isNeisType(definition.type) ? { neis: EMPTY_NEIS } : {}),
    };
    onDraftChange({ ...draft, adds: [...draft.adds, item] });
    if (isNeisType(definition.type)) setExpanded((current) => new Set(current).add(tempId));
    setAdding(false);
  };

  const total = listed.filter((a) => !removed.has(a.id)).length + draft.adds.length;

  // 한 줄의 순서 목록 — 기존 연결·새 작업을 합쳐 order 대로 세운다
  type Entry =
    | { key: string; kind: 'existing'; action: TaskAction }
    | { key: string; kind: 'pending'; item: PendingAction };
  const entries = orderByFlow<Entry>(
    [
      ...listed.map((action) => ({ key: action.id, kind: 'existing' as const, action })),
      ...draft.adds.map((item) => ({ key: item.tempId, kind: 'pending' as const, item })),
    ],
    order,
    (entry) => entry.key,
  );
  const keys = entries.map((entry) => entry.key);
  const move = (key: string) => (direction: -1 | 1) => onOrderChange(moveKey(keys, key, direction));
  let step = 0;
  const stepFor = (entry: Entry) =>
    entry.kind === 'existing' && removed.has(entry.action.id)
      ? null
      : (step += 1);

  return (
    <div className="space-y-2 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
      <div>
        <Label className="flex items-center gap-1.5 text-sm">
          <Landmark className="h-3.5 w-3.5 text-indigo-600" />
          작업
          {total > 0 && <span className="text-[11px] font-normal text-slate-400">{total}개</span>}
        </Label>
        <p className="mt-0.5 text-[11px] text-slate-500">
          담당자가 이 할 일에서 할 것 — 제출 받기, 나이스 화면, 문서 양식, 앱 기능을 연결합니다. 화살표로 권장 순서를
          정할 수 있고(순서대로 하도록 막지는 않습니다), 변경은 저장할 때 반영됩니다.
        </p>
      </div>

      {total === 0 && !adding && (
        <p className="rounded-lg border border-dashed border-slate-200 bg-white/60 p-3 text-center text-[11px] text-slate-400">
          작업이 없으면 담당자는 할 일을 직접 체크해 완료합니다.
        </p>
      )}

      <ol className="space-y-2">
        {entries.map((entry, index) => {
          if (entry.kind === 'existing') {
            const action = entry.action;
          const definition = getTaskActionDefinition(action.action_type);
          const isRemoved = removed.has(action.id);
          const mine = canRemoveAction(action, userId);
          const neisEdit = draft.neisEdits[action.id];
          const effective = neisEdit ? { ...action, config: { ...(action.config ?? {}), neis: neisEdit } } : action;
          const editableNeis = isNeisType(definition?.type) && mine && !isRemoved;
          return (
            <Row
              key={entry.key}
              step={stepFor(entry)}
              onMove={move(entry.key)}
              isFirst={index === 0}
              isLast={index === entries.length - 1}
              icon={<KindIcon kind={definition?.kind} type={definition?.type} />}
              title={action.title}
              // 무엇이 남고 무엇이 사라지는지는 유형마다 다르다 — 패널의 확인창과 같은 문구(disconnectEffect)
              summary={isRemoved
                ? `저장하면 연결이 해제됩니다 — ${disconnectEffect(action.action_type, true).message}`
                : manageSummaryFor(effective, definition)}
              muted={isRemoved}
              open={expanded.has(action.id)}
              onToggle={editableNeis ? () => toggle(action.id) : undefined}
              actions={
                isRemoved ? (
                  <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-[11px]" onClick={() => onDraftChange({ ...draft, removeIds: draft.removeIds.filter((id) => id !== action.id) })}>
                    <RotateCcw className="mr-0.5 h-3.5 w-3.5" />되돌리기
                  </Button>
                ) : (
                  <>
                    {/* 내 NEIS 작업은 이 줄 안에서 펼쳐 고친다. 남이 만든 NEIS 작업도 [열기]로 읽기 전용 화면을 본다(2026-10-06) —
                        종전엔 [설정]도 [열기]도 없어 공동 책임자가 어떤 화면을 가리키는지 볼 길이 없었다 */}
                    {!(isNeisType(definition?.type) && mine) && canOpenSaved && (
                      <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-[11px] text-slate-500" onClick={() => setOpenAction(action)}>
                        열기
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-[11px] text-slate-400 hover:text-rose-600 disabled:opacity-40"
                      disabled={!mine}
                      title={mine ? undefined : '연결을 만든 사람만 뺄 수 있습니다.'}
                      onClick={() => onDraftChange({ ...draft, removeIds: [...draft.removeIds, action.id] })}
                    >
                      <X className="mr-0.5 h-3.5 w-3.5" />연결 해제
                    </Button>
                  </>
                )
              }
            >
              {editableNeis && (
                <NeisScreensEditor
                  value={parseNeisActionConfig(effective.config)}
                  editable
                  noteMode="live"
                  onChange={(next) => onDraftChange({ ...draft, neisEdits: { ...draft.neisEdits, [action.id]: next } })}
                />
              )}
            </Row>
          );
          }
          const item = entry.item;
          const definition = getTaskActionDefinition(item.type);
          const isNeis = isNeisType(definition?.type);
          return (
            <Row
              key={entry.key}
              step={stepFor(entry)}
              onMove={move(entry.key)}
              isFirst={index === 0}
              isLast={index === entries.length - 1}
              icon={<KindIcon kind={definition?.kind} type={definition?.type} />}
              title={definition?.title ?? item.type}
              badge={<span className="ml-1.5 rounded bg-emerald-50 px-1 py-0.5 text-[10px] font-medium text-emerald-700">저장하면 연결</span>}
              summary={
                isNeis
                  ? manageSummaryFor({ config: { neis: item.neis ?? EMPTY_NEIS } }, definition)
                  : '저장하면 이어서 설정 화면이 열립니다(여럿이면 첫 작업부터 — 나머지는 [열기]).'
              }
              open={expanded.has(item.tempId)}
              onToggle={isNeis ? () => toggle(item.tempId) : undefined}
              actions={
                <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-[11px] text-slate-400 hover:text-rose-600" onClick={() => onDraftChange({ ...draft, adds: draft.adds.filter((a) => a.tempId !== item.tempId) })}>
                  <X className="mr-0.5 h-3.5 w-3.5" />취소
                </Button>
              }
            >
              {isNeis && (
                <NeisScreensEditor
                  value={item.neis ?? EMPTY_NEIS}
                  editable
                  noteMode="live"
                  onChange={(next) => onDraftChange({
                    ...draft,
                    adds: draft.adds.map((a) => (a.tempId === item.tempId ? { ...a, neis: next } : a)),
                  })}
                />
              )}
            </Row>
          );
        })}
      </ol>

      {adding ? (
        <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-slate-600">연결할 작업</p>
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setAdding(false)}>닫기</Button>
          </div>
          {/* 분류별로 묶는다 (2026-10-05) — 한 줄로 늘어서면 교사 19개·관리자 42개를 끝까지 훑어야 했다.
              분류·순서는 업무 흐름의 «작업 연결» 창과 같은 정본(TASK_ACTION_CATEGORY_ORDER·META)을 쓴다 */}
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {TASK_ACTION_CATEGORY_ORDER.map((category) => {
              const items = addable.filter((definition) => definition.category === category);
              if (items.length === 0) return null;
              return (
                <section key={category} aria-label={TASK_ACTION_CATEGORY_META[category].label}>
                  <p className="px-1.5 pb-0.5 pt-1 text-[11px] font-semibold text-slate-500">{TASK_ACTION_CATEGORY_META[category].label}</p>
                  <ul className="divide-y divide-slate-100">
                    {items.map((definition) => (
                      <AddMenuItem
                        key={definition.type}
                        icon={<KindIcon kind={definition.kind} type={definition.type} />}
                        title={definition.title}
                        description={definition.description}
                        onClick={() => addPending(definition)}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full border-indigo-200 text-xs text-indigo-700 hover:bg-indigo-100"
          onClick={() => setAdding(true)}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          작업 연결
        </Button>
      )}

      {openAction && (
        <TaskActionRunnerDialog
          action={openAction}
          taskTitle={openAction.title}
          workflowId={null}
          open
          onOpenChange={(open) => { if (!open) setOpenAction(null); }}
        />
      )}
    </div>
  );
}
