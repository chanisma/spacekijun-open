/**
 * 내 업무 관리 — 세부 할 일 **표** (2026-09-24 사용자 요청: 카드 → 표, 일정을 쉽게 수정).
 *
 * 카드 그리드는 한 화면에 3~4개밖에 안 들어가고 마감일을 고치려면 상세 모달을 열어야 했다.
 * 표는 한눈에 여러 줄을 훑고 **마감일을 그 자리에서** 고친다.
 *
 * ⚠️ **휴대폰에서는 표가 아니다** — 열이 여섯이라 390px 에서는 읽을 수 없다.
 *    데스크톱 표 / 휴대폰 목록 **두 벌을 같은 행 자료(`rows`)로** 그린다(계산은 한 번).
 *
 * ⚠️ **다중 마감은 칸에서 고치지 않는다** — `due_date` 는 «다음 회차»의 사본이고 정본은
 *    `meta.deadlines` 다. 칸에서 날짜만 바꾸면 둘이 **조용히 어긋난다**(회차 기록도 남는다).
 *    회차가 있으면 「N회」 칩을 눌러 편집 창으로 보낸다.
 *
 * 순서 칸(2026-09-26): 매니저는 «N번째 단계 / 일회성»을 그 자리에서 고른다. 번호만 바꾸면
 *    같은 번호가 둘이 되므로 계획은 `planStepPlacement`(src/lib/taskOrder.ts)가 세운다 —
 *    이 파일은 고른 값을 넘기기만 한다.
 *
 * 긴 제목·설명(2026-09-26): 한 줄로 자르고 **0.5초 머물면** 전문을 띄운다. 잘렸을 때만 띄운다.
 *    ⚠️ `table-fixed` 가 없으면 `truncate` 가 일하지 않는다 — 자동 표 배치는 칸을 내용만큼
 *    늘리므로 글이 잘리는 대신 다른 열을 밀어낸다.
 *
 * 행 동작(2026-09-26 사용자 요청): **제목을 누르면 상세**, 매니저에게는 **[수정]**(편집 창 직행).
 *    「내 할 일에서 수행 ↗」 바로가기는 뺐다 — 이 화면은 관리 화면이고 수행은 내 할 일
 *    메뉴에서 한다(완료 체크박스를 되살리지 말 것 — 수행 진입점은 하나뿐이다).
 *
 * 담당자 칸(2026-10-01 사용자 요청): 매니저는 마감일처럼 담당자도 이 칸에서 바꾼다. 다만 고르는
 *    즉시 저장하지 않고 작은 창(`TaskAssigneeEditDialog`)에서 한 번에 저장한다 — 규칙은
 *    `planAssigneeEdit`(src/lib/taskAssigneeEdit.ts). 담당자가 없는 할 일도 [+ 담당자]로 넣을 수 있다
 *    (종전엔 칸이 비어 들어갈 곳이 없었다).
 *
 * 행 아이콘(2026-10-01 사용자 결정): 연결된 작업은 **연결이 없어도** 렌치 아이콘만(없으면 흐리게),
 *    워크플로 바로가기는 할 일 행에 두지 않는다(업무 카드 머리에만). 대신 [진행] = 그 할 일을 고른
 *    채로 업무 진행 화면(`WorkPipelineDialog initialTaskId`)을 연다.
 *
 * 작업 줄(2026-10-06 사용자 결정): 연결된 작업을 **할 일 아래 들여 쓴 줄**로 늘어놓는다 — 렌치를 눌러야
 *    무엇이 붙었는지 보이던 것을 클릭 없이. 칩(아이콘·짧은 이름)은 «종류가 많아 무엇인지 알아보기
 *    어렵다»로 기각됐다 → 줄마다 종류 이름·작업 이름·설정 요약·요청 상태를 **글자로**. 작업이 없는
 *    할 일에는 줄이 없다(실측 할 일의 78%). 줄 글은 `buildActionLines`(utils/actionOverview.ts)가 만든다.
 *    표 위 [작업 함께 보기] 하나로 모든 업무의 작업 줄을 접고 편다(할 일마다 서랍을 두지 않는다 — 3층 서랍).
 */
import { Fragment, useEffect, useState } from 'react';
import { ArrowUpRight, CalendarDays, CheckCircle, ChevronRight, Circle, CornerDownRight, Loader2, Pencil, Route, UserPen, UserPlus } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ClampedText } from './ClampedText';
import { VisibleFromChip } from './VisibleFromChip';
import type { StepPlacement } from '@/lib/taskOrder';
import type { Task, TaskAssigneeJsonb } from '@/types/tasks';
import type { ActionLine, ActionLineTone } from '@/features/task-workflow/utils/actionOverview';
import { readStoredString, writeStoredString } from '@/lib/safeLocalStorage';

export interface WorkTaskRow {
  task: Task;
  /** 절차형 단계 번호. 일회성은 0 */
  orderNumber: number;
  isOneTime: boolean;
  displayStatus: string;
  assignees: TaskAssigneeJsonb[];
  isManager: boolean;
  canViewAssignees: boolean;
  updatingAssigneeId?: string;
  /** 다중 마감 회차(1회면 빈 배열로 다룬다) */
  deadlines: string[];
  dueLabel: string | null;
}

export interface WorkTaskTableProps {
  rows: WorkTaskRow[];
  isUpdating: boolean;
  updatingRoundKey?: string | null;
  updatingUnitKey?: string | null;
  currentUserResourceId?: string;
  /** 마감일을 칸에서 고친다 — 매니저만. 미지정이면 읽기 전용 */
  onDueDateChange?: (taskId: string, due: string | null) => Promise<void>;
  /** 순서(절차 N번째 / 일회성)를 칸에서 고친다 — 매니저만. 미지정이면 읽기 전용 */
  onPlacementChange?: (taskId: string, target: StepPlacement) => Promise<void>;
  onOpenDetail: (task: Task) => void;
  /** 편집 창 — 매니저 행에만 [수정] 버튼이 붙는다 */
  onOpenEdit?: (task: Task) => void;
  /** 담당자 바꾸기 — 매니저 행에만 붙는다. 미지정이면 읽기 전용 */
  onEditAssignees?: (task: Task) => void;
  /** 업무 진행 화면을 이 할 일을 고른 채로 연다. 미지정이면 버튼 없음 */
  onOpenPipeline?: (task: Task) => void;
  renderAssigneeSummary: (row: WorkTaskRow) => React.ReactNode;
  renderRoleIcon?: (task: Task) => React.ReactNode;
  renderIssueBadge?: (task: Task) => React.ReactNode;
  renderWorkflowLink?: (task: Task) => React.ReactNode;
  /** 할 일마다 연결된 작업 줄(useWorkActionOverview). 없으면 작업 줄을 그리지 않는다 */
  actionLines?: Map<string, ActionLine[]>;
  /** 작업 줄의 [열기] — 그 작업의 설정·현황 화면 */
  onOpenAction?: (task: Task, line: ActionLine) => void;
}

/** [작업 함께 보기] — 모든 업무에 같은 설정 하나(기기마다 기억). 같은 화면에 표가 여럿이라 이벤트로 맞춘다 */
const SHOW_ACTIONS_KEY = 'task-list-show-actions-v1';
const SHOW_ACTIONS_EVENT = 'task-list-show-actions';

function useShowActionLines(): [boolean, (next: boolean) => void] {
  const [show, setShow] = useState(() => readStoredString(SHOW_ACTIONS_KEY) !== 'off');
  useEffect(() => {
    const sync = () => setShow(readStoredString(SHOW_ACTIONS_KEY) !== 'off');
    window.addEventListener(SHOW_ACTIONS_EVENT, sync);
    return () => window.removeEventListener(SHOW_ACTIONS_EVENT, sync);
  }, []);
  const update = (next: boolean) => {
    writeStoredString(SHOW_ACTIONS_KEY, next ? 'on' : 'off');
    setShow(next);
    window.dispatchEvent(new Event(SHOW_ACTIONS_EVENT));
  };
  return [show, update];
}

/** 요청 상태 색 — 인디고 = 요청(앱 색 규약), 나머지는 무채색 */
const ACTION_STATE_TONE: Record<ActionLineTone, string> = {
  idle: 'bg-slate-100 text-slate-600',
  open: 'bg-indigo-50 text-indigo-700',
  closed: 'bg-slate-100 text-slate-500',
};

/** 작업 한 줄 — 종류 · 이름 — 요약 · 상태 · [열기]. 표·휴대폰 목록이 같이 쓴다 */
function ActionLineRow({ line, onOpen, compact = false }: { line: ActionLine; onOpen?: () => void; compact?: boolean }) {
  const detail = [line.name, line.summary].filter(Boolean).join(' — ');
  const state = line.state && (
    <span className={cn('inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full px-2 text-[10px] font-medium tabular-nums', ACTION_STATE_TONE[line.state.tone])}>
      {line.state.label}
    </span>
  );
  const open = onOpen && (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 shrink-0 gap-0.5 rounded-md px-2 text-[11px] text-blue-700 hover:bg-blue-50 sm:h-6"
      aria-label={`${line.typeLabel}${line.name ? ` ${line.name}` : ''} 열기`}
      onClick={onOpen}
    >
      열기<ChevronRight className="h-3 w-3" />
    </Button>
  );
  // 휴대폰: 한 줄에 다 넣으면 요약이 몇 글자만 남는다(터치에는 머물러 펼치기도 없다) → 요약은 둘째 줄에 두 줄까지
  if (compact) {
    return (
      <div className="min-w-0 text-[11px]">
        <div className="flex min-w-0 items-center gap-2">
          <CornerDownRight className="h-3 w-3 shrink-0 text-slate-300" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-semibold text-slate-600">{line.typeLabel}</span>
          {state}
          {open}
        </div>
        {detail && <p className="ml-5 line-clamp-2 break-words text-slate-500">{detail}</p>}
      </div>
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-2 text-[11px]">
      <CornerDownRight className="h-3 w-3 shrink-0 text-slate-300" aria-hidden />
      <span className="w-[7.5rem] shrink-0 truncate font-semibold text-slate-600" title={line.typeLabel}>
        {line.typeLabel}
      </span>
      <ClampedText text={detail || line.typeLabel} className="min-w-0 flex-1 text-slate-500" />
      {state}
      {open}
    </div>
  );
}

/** 순서 표시 — 절차는 번호, 일회성은 점 */
function OrderBadge({ row }: { row: WorkTaskRow }) {
  return row.isOneTime
    ? <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-300" title="일회성" />
    : <span className="text-[11px] font-bold tabular-nums text-emerald-700">{row.orderNumber}</span>;
}

/** 순서 칸 — 매니저는 «N번째 단계 / 일회성»을 고른다 */
function OrderCell({
  row, stepCount, onChange,
}: {
  row: WorkTaskRow;
  /** 이 업무의 절차 할 일 수 */
  stepCount: number;
  onChange?: (taskId: string, target: StepPlacement) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  if (!onChange) return <OrderBadge row={row} />;

  // 일회성을 절차로 옮기면 한 자리가 늘어난다(맨 뒤 = stepCount + 1)
  const slots = row.isOneTime ? stepCount + 1 : stepCount;
  const value = row.isOneTime ? 'one_time' : String(row.orderNumber);

  const commit = async (next: string) => {
    if (next === value) return;
    setSaving(true);
    try {
      await onChange(row.task.id, next === 'one_time' ? 'one_time' : Number(next));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '순서를 바꾸지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Select value={value} disabled={saving} onValueChange={(next) => void commit(next)}>
      <SelectTrigger
        aria-label={`${row.task.title} 순서 바꾸기`}
        className="mx-auto h-6 w-auto gap-0.5 border-transparent bg-transparent px-1 py-0 hover:border-slate-200 hover:bg-white focus:ring-1 focus:ring-blue-300 focus:ring-offset-0 [&>svg]:h-3 [&>svg]:w-3"
      >
        <span className="inline-flex min-w-[10px] items-center justify-center">
          {saving ? <Loader2 className="h-3 w-3 animate-spin text-blue-500" /> : <OrderBadge row={row} />}
        </span>
      </SelectTrigger>
      <SelectContent className="min-w-[8rem]">
        {Array.from({ length: slots }, (_, index) => (
          <SelectItem key={index} value={String(index + 1)} className="text-xs">
            {index + 1}번째 단계
          </SelectItem>
        ))}
        {slots > 0 && <SelectSeparator />}
        <SelectItem value="one_time" className="text-xs">일회성</SelectItem>
      </SelectContent>
    </Select>
  );
}

/** 마감일 칸 — 단일 마감만 여기서 고친다 */
function DueCell({
  row, onChange, onOpenEdit,
}: {
  row: WorkTaskRow;
  onChange?: (taskId: string, due: string | null) => Promise<void>;
  onOpenEdit?: (task: Task) => void;
}) {
  const multi = row.deadlines.length > 1;
  const [value, setValue] = useState(row.task.due_date?.slice(0, 10) ?? '');
  const [saving, setSaving] = useState(false);

  // 밖에서 바뀌면(편집 창·다른 사람) 칸도 따라간다
  useEffect(() => setValue(row.task.due_date?.slice(0, 10) ?? ''), [row.task.due_date]);

  if (multi) {
    return (
      <button
        type="button"
        onClick={() => onOpenEdit?.(row.task)}
        className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700 hover:bg-violet-100"
        title={`회차 ${row.deadlines.length}개 — 편집 창에서 고칩니다`}
      >
        <CalendarDays className="h-3 w-3" />
        {row.deadlines.length}회
      </button>
    );
  }

  if (!onChange) {
    return <span className="text-[11px] tabular-nums text-slate-500">{row.dueLabel ?? '—'}</span>;
  }

  const commit = async (next: string) => {
    const before = row.task.due_date?.slice(0, 10) ?? '';
    if (next === before) return;
    setSaving(true);
    try {
      await onChange(row.task.id, next || null);
    } catch (error) {
      setValue(before); // 실패하면 되돌린다 — 화면만 바뀌어 있으면 고쳤다고 믿는다
      toast.error(error instanceof Error ? error.message : '마감일을 바꾸지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <span className="relative inline-flex items-center">
      <Input
        type="date"
        value={value}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onBlur={(e) => void commit(e.target.value)}
        className="h-6 w-[108px] border-transparent bg-transparent px-1 text-[11px] tabular-nums md:text-[11px] hover:border-slate-200 hover:bg-white focus:border-blue-300 focus:bg-white"
      />
      {saving && <Loader2 className="ml-1 h-3 w-3 animate-spin text-blue-500" />}
    </span>
  );
}

/** 담당자 칸 — 요약 + (매니저) 바꾸기 버튼 */
function AssigneeCell({
  row, onEdit, renderSummary,
}: {
  row: WorkTaskRow;
  onEdit?: (task: Task) => void;
  renderSummary: (row: WorkTaskRow) => React.ReactNode;
}) {
  const hasAssignees = row.canViewAssignees && row.assignees.length > 0;
  if (!onEdit) return hasAssignees ? <>{renderSummary(row)}</> : null;

  if (!hasAssignees) {
    return (
      <button
        type="button"
        onClick={() => onEdit(row.task)}
        className="inline-flex h-8 items-center gap-1 rounded-md border border-dashed sm:h-6 border-slate-300 px-1.5 text-[11px] text-slate-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
      >
        <UserPlus className="h-3 w-3" />
        담당자
      </button>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-0.5">
      <span className="min-w-0">{renderSummary(row)}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 rounded-full text-slate-400 hover:bg-blue-50 hover:text-blue-600 sm:h-6 sm:w-6"
        aria-label={`${row.task.title} 담당자 바꾸기`}
        title="담당자 바꾸기"
        onClick={() => onEdit(row.task)}
      >
        <UserPen className="h-3.5 w-3.5" />
      </Button>
    </span>
  );
}

export function WorkTaskTable({
  rows,
  onDueDateChange,
  onPlacementChange,
  onOpenDetail,
  onOpenEdit,
  onEditAssignees,
  onOpenPipeline,
  renderAssigneeSummary,
  renderRoleIcon,
  renderIssueBadge,
  renderWorkflowLink,
  actionLines,
  onOpenAction,
}: WorkTaskTableProps) {
  const [showActions, setShowActions] = useShowActionLines();
  if (rows.length === 0) return null;
  const stepCount = rows.filter((row) => !row.isOneTime).length;
  const actionCount = actionLines ? rows.reduce((n, row) => n + (actionLines.get(row.task.id)?.length ?? 0), 0) : 0;
  const linesOf = (task: Task): ActionLine[] => (showActions && actionLines?.get(task.id)) || [];

  const StatusIcon = ({ status }: { status: string }) =>
    status === 'completed'
      ? <CheckCircle className="h-4 w-4 text-emerald-600" aria-label="완료" />
      : <Circle className="h-4 w-4 text-slate-300" aria-label="진행 중" />;

  return (
    <>
      {/* 작업 줄 접고 펴기 — 작업이 하나라도 있을 때만 */}
      {actionCount > 0 && (
        <div className="mb-1.5 flex justify-end">
          <button
            type="button"
            aria-pressed={showActions}
            onClick={() => setShowActions(!showActions)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-slate-500 hover:bg-white hover:text-slate-800 sm:h-6"
          >
            <span className={cn('inline-flex h-3.5 w-6 items-center rounded-full p-0.5 transition-colors', showActions ? 'bg-blue-600' : 'bg-slate-300')}>
              <span className={cn('h-2.5 w-2.5 rounded-full bg-white transition-transform', showActions && 'translate-x-2.5')} />
            </span>
            작업 함께 보기 <span className="tabular-nums text-slate-400">{actionCount}</span>
          </button>
        </div>
      )}
      {/* ── 데스크톱: 표 ─────────────────────────────────────────────── */}
      <div className="hidden overflow-x-auto sm:block">
        {/* 할 일 칸의 하한 — table-fixed 는 고정 폭 열을 먼저 주고 남는 것만 할 일에 준다. 창이 좁아지면
            할 일만 0 으로 사라지므로, 표에 최소 폭(고정 열 합 ≈570px + 할 일 220px)을 주고 그보다
            좁으면 감싼 div 가 가로로 스크롤한다 (2026-09-26 사용자 지적). */}
        <table className="w-full min-w-[820px] table-fixed border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[10px] text-slate-400">
              <th className="w-12 px-1 py-1.5 text-center font-medium">순서</th>
              <th className="w-10 px-1 py-1.5 font-medium">상태</th>
              <th className="px-2 py-1.5 font-medium">할 일</th>
              <th className="w-[124px] px-2 py-1.5 font-medium">마감일</th>
              <th className="w-[190px] px-2 py-1.5 font-medium">담당자</th>
              <th className="w-[200px] px-2 py-1.5"><span className="sr-only">동작</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.task.id}>
              <tr
                className={cn(
                  'align-middle transition-colors hover:bg-slate-50/70',
                  // 작업 줄이 있으면 경계선은 마지막 작업 줄 아래로 — 할 일과 그 작업이 한 덩어리로 읽힌다
                  linesOf(row.task).length === 0 && 'border-b border-slate-100',
                  row.displayStatus === 'completed' && 'bg-emerald-50/40',
                )}
              >
                <td className="px-1 py-1.5 text-center">
                  <OrderCell
                    row={row}
                    stepCount={stepCount}
                    onChange={row.isManager ? onPlacementChange : undefined}
                  />
                </td>
                <td className="px-1 py-1.5"><StatusIcon status={row.displayStatus} /></td>
                <td className="px-2 py-1.5">
                  <div className="flex min-w-0 items-center gap-1">
                    <ClampedText
                      text={row.task.title}
                      className="font-medium text-slate-800"
                      onClick={() => onOpenDetail(row.task)}
                      ariaLabel={`${row.task.title} 상세 보기`}
                    />
                    <span className="flex shrink-0 items-center gap-1">
                      <VisibleFromChip task={row.task} />
                      {renderIssueBadge?.(row.task)}
                      {renderRoleIcon?.(row.task)}
                    </span>
                  </div>
                  {row.task.description && (
                    <ClampedText text={row.task.description} className="text-[11px] text-slate-400" />
                  )}
                </td>
                <td className="px-2 py-1.5">
                  <DueCell
                    row={row}
                    onChange={row.isManager ? onDueDateChange : undefined}
                    onOpenEdit={onOpenEdit}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <AssigneeCell
                    row={row}
                    onEdit={row.isManager ? onEditAssignees : undefined}
                    renderSummary={renderAssigneeSummary}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <span className="flex items-center justify-end gap-0.5">
                    {renderWorkflowLink?.(row.task)}
                    {onOpenPipeline && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 rounded-full px-2 text-[11px] text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                        aria-label={`${row.task.title} 단계별 진행`}
                        title="단계별 진행"
                        onClick={() => onOpenPipeline(row.task)}
                      >
                        {/* 글자를 함께 — 아이콘만이면 작업·수정·상세와 구분되지 않았다(2026-10-06) */}
                        <Route className="h-3.5 w-3.5" />진행
                      </Button>
                    )}
                    {row.isManager && onOpenEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-full text-slate-500 hover:bg-blue-50 hover:text-blue-600"
                        aria-label={`${row.task.title} 수정`}
                        title="수정"
                        onClick={() => onOpenEdit(row.task)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-full hover:bg-emerald-50 hover:text-emerald-600"
                      aria-label={`${row.task.title} 상세 보기`}
                      onClick={() => onOpenDetail(row.task)}
                    >
                      <ArrowUpRight className="h-4 w-4" />
                    </Button>
                  </span>
                </td>
              </tr>
              {linesOf(row.task).map((line, index, all) => (
                <tr
                  key={line.action.id}
                  className={cn('bg-white/70', index === all.length - 1 && 'border-b border-slate-100')}
                >
                  <td />
                  <td />
                  <td colSpan={4} className="px-2 py-0.5 pr-3">
                    <ActionLineRow line={line} onOpen={onOpenAction ? () => onOpenAction(row.task, line) : undefined} />
                  </td>
                </tr>
              ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 휴대폰: 목록 (표는 390px 에서 읽을 수 없다) ────────────────── */}
      <div className="space-y-2 sm:hidden">
        {rows.map((row) => (
          <div
            key={row.task.id}
            className={cn(
              'rounded-lg border p-2.5',
              row.displayStatus === 'completed' ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white',
            )}
          >
            <div className="flex items-start gap-2">
              <OrderCell
                row={row}
                stepCount={stepCount}
                onChange={row.isManager ? onPlacementChange : undefined}
              />
              <StatusIcon status={row.displayStatus} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onOpenDetail(row.task)}
                    className="min-w-0 truncate text-left text-sm font-medium text-slate-800"
                  >
                    {row.task.title}
                  </button>
                  <VisibleFromChip task={row.task} />
                  {renderIssueBadge?.(row.task)}
                </div>
                {row.dueLabel && (
                  <p className="mt-0.5 text-[11px] text-orange-600">마감 {row.dueLabel}</p>
                )}
              </div>
              {onOpenPipeline && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 rounded-full text-slate-500"
                  aria-label={`${row.task.title} 단계별 진행`}
                  onClick={() => onOpenPipeline(row.task)}
                >
                  <Route className="h-4 w-4" />
                </Button>
              )}
              {row.isManager && onOpenEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 rounded-full text-slate-500"
                  aria-label={`${row.task.title} 수정`}
                  onClick={() => onOpenEdit(row.task)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-full"
                aria-label={`${row.task.title} 상세 보기`}
                onClick={() => onOpenDetail(row.task)}
              >
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </div>
            {((row.canViewAssignees && row.assignees.length > 0) || (row.isManager && onEditAssignees)) && (
              <div className="mt-2">
                <AssigneeCell
                  row={row}
                  onEdit={row.isManager ? onEditAssignees : undefined}
                  renderSummary={renderAssigneeSummary}
                />
              </div>
            )}
            {linesOf(row.task).length > 0 && (
              <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                {linesOf(row.task).map((line) => (
                  <ActionLineRow
                    key={line.action.id}
                    line={line}
                    compact
                    onOpen={onOpenAction ? () => onOpenAction(row.task, line) : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

