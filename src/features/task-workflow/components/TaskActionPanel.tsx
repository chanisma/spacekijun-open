import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ArrowDown,
  ArrowUp,
  ClipboardCheck,
  ExternalLink,
  Globe,
  Landmark,
  Loader2,
  Play,
  Plus,
  Settings2,
  Trash2,
  Unlink,
  Wrench,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/components/auth/AuthProvider';
import { isFacultyRole } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ManualCompletionRecord } from './ManualCompletionRecord';
import { RunnerUnsavedProvider, useRunnerUnsavedRegistry } from './runnerUnsaved';
import { DIALOG_HEADER_CLASS } from '@/components/tasks/dialogDesign';
import {
  useBindTaskAction,
  useDeleteTaskAction,
  useFinalizeTaskActionRun,
  useStartTaskActionRun,
  useTaskActionRunPresence,
  useTaskActionRuns,
  useTaskActions,
  useTaskActionContext,
  useSetTaskActionFlow,
  useCanManageTaskAction,
} from '../hooks/useTaskActions';
import { moveKey, orderByFlow } from '../utils/actionFlow';
import { disconnectEffect } from '../utils/disconnectEffect';
import { listableActions } from '../utils/taskActionDraft';
import { isSubmitActionType } from '@/lib/submitAction';
import { SectionLabel } from '@/components/tasks/dialogDesign';
import { useMyCollectRequests } from '../hooks/useCollectInput';
import type { TaskAction, TaskActionRunWithDetails } from '../types';
import {
  AVAILABLE_TASK_ACTION_DEFINITIONS,
  TASK_ACTION_CATEGORY_META,
  TASK_ACTION_CATEGORY_ORDER,
  getTaskActionDefinition,
  type TaskActionDefinition,
} from '../actionRegistry';
import { RunStatusBadge, ActionRunHistory } from './ActionRunHistory';
import {
  manageSummaryFor,
  resolvePanelModes,
  affordanceForUse,
  summaryForUse,
  type ActionPanelMode,
} from '../utils/actionPanelMode';
import { cn } from '@/lib/utils';

/*
 * 타인 워크플로에서도 실행 가능한 실행 종류(2026-07-27 사용자 결정)는
 * `utils/actionPanelMode.ts` 의 SHARED_RUNNABLE_TYPES 가 갖는다. 서버가 정본이다 —
 * `start_task_action_run`·RUN insert/update 정책이 같은 목록을 강제하므로, 값을 늘리기 전에
 * 서버 완화를 먼저 해야 하고, 다른 기능에 쓰기를 유발하는 연결형·관리형 실행은 넣지 않는다.
 */

const SpecFillActionRunner = lazy(() =>
  import('./SpecFillActionRunner').then((module) => ({
    default: module.SpecFillActionRunner,
  }))
);
const HwpxDirectEditRunner = lazy(() =>
  import('./HwpxDirectEditRunner').then((module) => ({
    default: module.HwpxDirectEditRunner,
  }))
);
const NeisScreenActionRunner = lazy(() =>
  import('./NeisScreenActionRunner').then((module) => ({
    default: module.NeisScreenActionRunner,
  }))
);
const SubmitActionRunner = lazy(() =>
  import('./submit/SubmitActionRunner').then((m) => ({ default: m.SubmitActionRunner })),
);
const MessageSendRunner = lazy(() =>
  import('./message/MessageSendRunner').then((module) => ({
    default: module.MessageSendRunner,
  }))
);
const CollectInputRunner = lazy(() =>
  import('./collect/CollectInputRunner').then((module) => ({
    default: module.CollectInputRunner,
  }))
);
const SignatureRequestRunner = lazy(() =>
  import('./signature/SignatureRequestRunner').then((module) => ({
    default: module.SignatureRequestRunner,
  })),
);
const TrainingSignatureRunner = lazy(() =>
  import('./signature/TrainingSignatureRunner').then((module) => ({
    default: module.TrainingSignatureRunner,
  })),
);
const ExternalScreenActionRunner = lazy(() =>
  import('./ExternalScreenActionRunner').then((module) => ({
    default: module.ExternalScreenActionRunner,
  })),
);
const EmbedActionRunner = lazy(() =>
  import('./EmbedActionRunner').then((module) => ({
    default: module.EmbedActionRunner,
  }))
);

interface TaskActionPanelProps {
  taskId: string;
  taskTitle: string;
  /** 소속 워크플로 — RUN에 기록된다. 캔버스 밖에서 열어 노드가 없으면 null */
  workflowId: string | null;
  /** 읽기 전용(타인 워크플로 열람) — 연결·실행·삭제 없이 목록과 이력만 = 관리 권한 없음 */
  readOnly?: boolean;
  /**
   * 관리자이면서 담당자일 때 먼저 보일 보기 — 할 일 목록에서 열면 'use'(하러 왔다),
   * 업무 흐름에서 열면 'manage'(짜러 왔다). 둘 중 하나만 해당하면 무시된다.
   */
  defaultMode?: ActionPanelMode;
  /**
   * 관리 보기를 허용하는가 — 할 일 목록 경로는 false(2026-09-23 사용자 결정: 작업 설정은 할 일
   * 편집 창에서 한다). 업무 흐름 인스펙터만 관리 보기를 갖는다.
   */
  allowManage?: boolean;
  /**
   * 할 일 상세 모달 본문에 끼워 넣는다(2026-09-24) — 상자·보기 전환 없이 섹션 머리 + 목록만.
   * 제출은 모달의 내 작업 패널에 이미 있으므로 목록에서 뺀다(같은 행동이 두 곳에 생긴다).
   * 연결된 작업이 없으면 아무것도 그리지 않는다.
   */
  embedded?: boolean;
}

// 실행·검수 이력 서랍 폭(px) — evalog MainLayout rightPanel 패턴
const HISTORY_PANEL_W = 360;

// 문서 생성(document-generation) 페이지도 이 다이얼로그를 그대로 쓴다(export 이유).
// 독립 항목은 workflowId=null로 열며, 러너·이력 서랍 동작은 캔버스 경로와 동일하다.
export function TaskActionRunnerDialog({
  action,
  taskTitle,
  workflowId,
  open,
  onOpenChange,
  initialFile,
  onInitialFileConsumed,
  initialDocumentId,
  onInitialDocumentConsumed,
  initialResumeRun,
  onInitialResumeConsumed,
  docGenMode = false,
  hideHistory: hideHistoryProp = false,
  guideOnly = false,
}: {
  action: TaskAction;
  taskTitle: string;
  workflowId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 문서 생성 메뉴에서 방금 첨부한 한글 양식 — 스펙 검수부터 시작한다 */
  initialFile?: File | null;
  onInitialFileConsumed?: () => void;
  /** 문서 생성 메뉴의 '완성 문서' 모달에서 고른 문서 */
  initialDocumentId?: string | null;
  onInitialDocumentConsumed?: () => void;
  /**
   * 이력 서랍을 감춘다 — **문서 생성 메뉴에서만 true**.
   * 그쪽은 페이지 우측에 서랍이 따로 있어, 여기서도 열면 같은 이력이 두 곳에 생긴다.
   */
  /** 페이지 이력 서랍에서 '이어서 진행'으로 고른 RUN — 서랍을 밖으로 뺀 대신 이 길로 잇는다 */
  initialResumeRun?: TaskActionRunWithDetails | null;
  onInitialResumeConsumed?: () => void;
  /**
   * **문서 생성 메뉴에서 열었다** — 행의 출신(`config.origin`)이 아니라 연 화면을 말한다.
   * 그 화면은 생성 방식 = 양식이 이미 정해진 것으로 보므로 양식 단계를 건너뛰고
   * 계획 검토부터 연다. 같은 목록에 할 일 쪽 방식이 함께 서므로, 행마다 흐름이 갈리면
   * 사용자가 볼 수 없는 이유로 카드 절반만 다르게 열린다.
   */
  docGenMode?: boolean;
  hideHistory?: boolean;
  /**
   * 안내만 연다 — 남의 업무 흐름에 붙은 NEIS 화면을 담당자가 볼 때(2026-09-23).
   * RUN 쓰기는 서버가 소유자에게만 열므로 완료 기록·편집·이력 서랍을 모두 뺀다.
   */
  guideOnly?: boolean;
}) {
  // NEIS(external)는 실행 기록이 없다 — 설정 창에 '실행·검수 이력' 서랍을 두지 않는다
  // 입력 받기도 실행 기록이 아니라 자기 표(collect_*)에 쌓인다 — 이력 서랍이 비어 있기만 하다
  const hideHistory =
    hideHistoryProp || guideOnly || getTaskActionDefinition(action.action_type)?.kind === 'external'
    || action.action_type === 'collect.input' || action.action_type === 'message.send'
    || isSubmitActionType(action.action_type);
  const isSpecFill = action.action_type === 'document.spec_fill';
  // 이력 패널 = 서랍식: 접혀도 경계 토글로 언제든 다시 연다. spec_fill 러너는
  // 단계 전환마다 기본 개폐를 요청(양식=펼침, 그 외=접힘)하고 사용자가 덮어쓸 수 있다.
  const [historyVisible, setHistoryVisible] = useState(!hideHistory);
  // 서랍 이력의 "불러와서 진행" 요청을 러너로 전달(러너가 소비 후 초기화)
  const [resumeRun, setResumeRun] = useState<TaskActionRunWithDetails | null>(null);
  // 페이지 서랍에서 온 요청을 열릴 때 1회 넘긴다(러너가 소비 후 초기화한다)
  useEffect(() => {
    if (!open || !initialResumeRun) return;
    setResumeRun(initialResumeRun);
    onInitialResumeConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialResumeRun?.id]);
  // 저장하지 않은 변경이 있으면 닫기 전에 묻는다(설정 화면들이 `useRunnerUnsaved` 로 알린다 — 2026-10-06)
  const unsaved = useRunnerUnsavedRegistry();
  // 앱 밖에서 처리(NEIS·외부 시스템)는 몇 줄짜리 안내라 큰 창이 오히려 읽기 나빴다 → 보통 크기 + 보이는 제목(2026-10-06)
  const compact = getTaskActionDefinition(action.action_type)?.kind === 'external';
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setHistoryVisible(!hideHistory);
        if (!o) {
          const message = unsaved.unsavedMessage();
          if (message && !window.confirm(`${message}\n\n그래도 닫을까요?`)) return;
          unsaved.clear();
        }
        onOpenChange(o);
      }}
    >
      <DialogContent
        className={`flex flex-col gap-0 overflow-hidden p-0 ${
          isSpecFill ? 'h-[94vh] w-[98vw] max-w-[1800px]'
            : compact ? 'max-h-[85vh] w-[96vw] max-w-2xl'
            : 'h-[90vh] w-[96vw] max-w-[1200px]'
        }`}
      >
        {compact ? (
          <div className={DIALOG_HEADER_CLASS}>
            <DialogTitle className="truncate pr-8 text-base font-semibold text-slate-800" title={action.title}>{action.title}</DialogTitle>
            <DialogDescription className="truncate text-xs text-slate-500" title={taskTitle}>{taskTitle}</DialogDescription>
          </div>
        ) : (
          <>
            {/* 시각 헤더 제거(사용자 요청) — 접근성용 제목·설명만 스크린리더에 유지 */}
            <DialogTitle className="sr-only">{action.title}</DialogTitle>
            <DialogDescription className="sr-only">
              {taskTitle} · 실행 결과는 즉시 완료 처리되지 않고 검수 대기 상태로 기록됩니다.
            </DialogDescription>
          </>
        )}
        <RunnerUnsavedProvider registry={unsaved.registry}>

        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <section className={`min-w-0 flex-1 ${isSpecFill ? 'min-h-0 overflow-hidden' : 'min-h-0 overflow-y-auto p-6'}`}>
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  실행 불러오는 중
                </div>
              }
            >
              {getTaskActionDefinition(action.action_type)?.kind === 'embed' ? (
                <EmbedActionRunner action={action} workflowId={workflowId} />
              ) : action.action_type === 'external.screen' ? (
                /* ⚠️ kind='external' 은 이제 NEIS 만이 아니다 — 유형으로 갈라야 한다.
                   kind 로만 보면 새 유형이 조용히 NEIS 러너로 들어간다(설정 칸이 달라 빈 화면). */
                <ExternalScreenActionRunner action={action} workflowId={workflowId} guideOnly={guideOnly} />
              ) : getTaskActionDefinition(action.action_type)?.kind === 'external' ? (
                <NeisScreenActionRunner action={action} workflowId={workflowId} guideOnly={guideOnly} />
              ) : getTaskActionDefinition(action.action_type)?.kind === 'link' ? (
                <LinkActionRunner action={action} workflowId={workflowId} />
              ) : action.action_type === 'document.spec_fill' ? (
                <SpecFillActionRunner
                  key={action.id}
                  action={action}
                  taskTitle={taskTitle}
                  workflowId={workflowId}
                  onHistoryVisibleChange={hideHistory ? undefined : setHistoryVisible}
                  resumeRun={resumeRun}
                  onResumeConsumed={() => setResumeRun(null)}
                  initialFile={initialFile}
                  onInitialFileConsumed={onInitialFileConsumed}
                  initialDocumentId={initialDocumentId}
                  onInitialDocumentConsumed={onInitialDocumentConsumed}
                  docGenHost={docGenMode}
                />
              ) : action.action_type === 'signature.request' ? (
                <SignatureRequestRunner action={action} workflowId={workflowId} guideOnly={guideOnly} />
              ) : action.action_type === 'signature.training' ? (
                <TrainingSignatureRunner action={action} workflowId={workflowId} guideOnly={guideOnly} />
              ) : action.action_type === 'collect.input' ? (
                <CollectInputRunner action={action} />
              ) : action.action_type === 'message.send' ? (
                <MessageSendRunner action={action} />
              ) : isSubmitActionType(action.action_type) ? (
                <SubmitActionRunner action={action} />
              ) : action.action_type === 'document.template_fill' ? (
                <HwpxDirectEditRunner
                  action={action}
                  taskTitle={taskTitle}
                  workflowId={workflowId}
                />
              ) : (
                <p className="py-8 text-center text-sm text-slate-400">
                  이 작업 유형의 실행 화면이 없습니다. 연결 정의(actionRegistry)를 확인하세요.
                </p>
              )}
            </Suspense>
          </section>
          {/* 서랍 토글 — evalog MainLayout 패턴: 패널 경계에 떠 있는 반원 버튼 */}
          {!hideHistory && (<>
          <button
            type="button"
            onClick={() => setHistoryVisible(!historyVisible)}
            className="absolute top-1/2 z-20 hidden h-10 w-5 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-slate-200/80 bg-white text-slate-400 shadow-sm transition-all duration-200 hover:text-blue-600 hover:shadow-md lg:flex"
            style={{ right: historyVisible ? HISTORY_PANEL_W : 0, opacity: 0.85 }}
            title={historyVisible ? '내 실행·검수 이력 숨기기' : '내 실행·검수 이력 보기'}
          >
            {historyVisible ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>
          {/* 이력 서랍 — width 0으로 접힘(콘텐츠는 고정폭 래퍼로 찌그러짐 방지) */}
          <aside
            className="hidden shrink-0 border-l border-slate-100 bg-slate-50/70 lg:block"
            style={{ width: historyVisible ? HISTORY_PANEL_W : 0, overflow: 'hidden' }}
          >
            <div className="h-full overflow-y-auto p-4" style={{ width: HISTORY_PANEL_W }}>
              <div className="mb-3 flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-slate-500" />
                <h3 className="text-sm font-bold text-slate-700">내 실행·검수 이력</h3>
              </div>
              <ActionRunHistory action={action} onResume={isSpecFill ? setResumeRun : undefined} />
            </div>
          </aside>
          </>)}
        </div>
        </RunnerUnsavedProvider>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 작업 종류 아이콘 칩 — 화면마다 다른 아이콘을 그리던 것을 한 곳으로(2026-10-01).
 * 옛 제출 받기(`submission`) 종류는 2026-10-05 에 걷어 냈다.
 */
/**
 * 종류·유형 → 아이콘·색 한 벌(2026-10-06). 종류(kind)만 보면 «외부 시스템에서 처리»에도 나이스용 관공서
 * 아이콘이 붙어 목록에서 둘을 가를 수 없었다 — 유형을 함께 받는다. 세 자리(칩·글리프·연결 창)가 이것만 쓴다.
 */
export function kindVisual(kind: TaskActionDefinition['kind'] | undefined, type?: string) {
  if (type === 'external.screen') return { Icon: Globe, tone: 'bg-indigo-100 text-indigo-600' };
  if (kind === 'link') return { Icon: ExternalLink, tone: 'bg-slate-100 text-slate-500' };
  if (kind === 'external') return { Icon: Landmark, tone: 'bg-indigo-100 text-indigo-600' };
  if (kind === 'embed') return { Icon: Wrench, tone: 'bg-emerald-100 text-emerald-600' };
  return { Icon: Play, tone: 'bg-blue-100 text-blue-600' };
}

export function KindIcon({ kind, type }: { kind: TaskActionDefinition['kind'] | undefined; type?: string }) {
  const { Icon, tone } = kindVisual(kind, type);
  return (
    <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tone)}>
      <Icon className="h-4 w-4" />
    </span>
  );
}

/**
 * 관리 보기 카드 — 연결을 **편집**하는 입장. 이 연결이 무엇을 가리키는지(요약)와
 * 설정·해제가 전부다. 실행 버튼을 크게 두지 않는다: 관리자가 여기서 할 일은 설정이다.
 */
/** 종류 글리프 — 행 안에서 제목 앞에 작게(관리 보기) */
function KindGlyph({ kind, type }: { kind: TaskActionDefinition['kind'] | undefined; type?: string }) {
  const { Icon } = kindVisual(kind, type);
  return <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />;
}

// 호버가 없는 터치 기기에서는 항상 보이게 — 숨겨 두면 누를 방법이 없다
const ROW_TOOLS_CLASS =
  'flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100';
const ROW_TOOL_BUTTON_CLASS =
  'flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-30';

/**
 * 관리 보기의 한 줄 — 번호 · (종류) 제목 · 가리키는 것 한 줄, 끝에 ↑↓·삭제.
 * 행을 누르면 설정이 열린다. 폭이 좁은 인스펙터(288px)에서 제목이 세 줄로 접히던
 * 카드(번호 원 + 화살표 열 + 큰 아이콘 + 분류 + 최근 실행 + 버튼)를 대신한다(2026-09-23).
 */
function ManageActionRow({
  step,
  kind,
  type,
  title,
  summary,
  status,
  onOpen,
  onMove,
  isFirst,
  isLast,
  movePending,
  onDelete,
  deleteLabel,
}: {
  step: number;
  kind: TaskActionDefinition['kind'] | undefined;
  type?: string;
  title: string;
  summary: string;
  status?: ReactNode;
  onOpen?: () => void;
  onMove: (direction: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
  movePending: boolean;
  onDelete?: () => void;
  deleteLabel?: string;
}) {
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-1.5">
        <KindGlyph kind={kind} type={type} />
        <span className="truncate text-xs font-semibold text-slate-700" title={title}>{title}</span>
      </span>
      <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
        <span className="truncate text-[11px] text-slate-500" title={summary}>{summary}</span>
        {status}
      </span>
    </>
  );
  return (
    <li className="group flex items-center gap-2 rounded-lg border border-slate-200 bg-white py-1.5 pl-2 pr-1 hover:border-blue-200">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10px] font-bold text-blue-700">
        {step}
      </span>
      {onOpen ? (
        <button type="button" className="flex min-w-0 flex-1 flex-col text-left" onClick={onOpen} title={`${title} 설정 열기`}>
          {body}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col">{body}</div>
      )}
      <div className={ROW_TOOLS_CLASS}>
        <button type="button" className={ROW_TOOL_BUTTON_CLASS} disabled={isFirst || movePending} aria-label={`${title} 앞으로`} onClick={() => onMove(-1)}>
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button type="button" className={ROW_TOOL_BUTTON_CLASS} disabled={isLast || movePending} aria-label={`${title} 뒤로`} onClick={() => onMove(1)}>
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        {onDelete && (
          <button
            type="button"
            className={cn(ROW_TOOL_BUTTON_CLASS, 'hover:text-rose-600')}
            aria-label={`${title} 연결 해제`}
            title={deleteLabel ?? '연결 해제'}
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </li>
  );
}

/** 연결 한 줄 — 실행 기록이 있을 때만 상태를 붙인다("최근 실행 없음"은 정보가 아니다) */
function ManageActionEntry({
  action,
  step,
  onOpen,
  canOpen,
  onDelete,
  onMove,
  isFirst,
  isLast,
  movePending,
}: {
  action: TaskAction;
  step: number;
  onOpen: () => void;
  canOpen: boolean;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
  movePending: boolean;
}) {
  const definition = getTaskActionDefinition(action.action_type);
  const external = definition?.kind === 'external';
  // NEIS 는 실행 기록이 없다 — 조회하지 않는다
  const { data: runs = [] } = useTaskActionRuns(action.id, !external);
  const latestRun = runs[0];
  // 값 제출용 실행은 삭제하지 않는다(담당자 전원의 제출 경로가 끊긴다) — 목록에서 이미 빠지지만 이중 방어
  const isSubmissionWork = (action.config as { origin?: string } | null)?.origin === 'submission';
  return (
    <ManageActionRow
      step={step}
      kind={definition?.kind}
      type={action.action_type}
      title={action.title}
      summary={manageSummaryFor(action, definition)}
      status={latestRun ? <RunStatusBadge status={latestRun.status} /> : undefined}
      onOpen={canOpen ? onOpen : undefined}
      onMove={onMove}
      isFirst={isFirst}
      isLast={isLast}
      movePending={movePending}
      onDelete={isSubmissionWork ? undefined : onDelete}
      deleteLabel={`연결 해제 — ${disconnectEffect(action.action_type, runs.length > 0).message}`}
    />
  );
}

/**
 * 사용 보기의 한 줄 — 관리 보기와 같은 모양(번호 · 종류 · 제목 / 둘째 줄). 행 전체가 주 동작이고
 * 끝에는 작은 표시만 둔다. 카드마다 큰 파란 버튼을 두면 전부가 주 동작처럼 보여 어디부터 볼지
 * 모른다 — solid 는 할 일을 **완료시키는** 제출에만 쓴다(2026-09-23).
 * 할 수 없는 작업은 누를 수 없는 행으로 두고 이유를 둘째 줄에 말한다.
 */
function UseActionRow({
  step,
  glyph,
  title,
  summary,
  trailing,
  onActivate,
  disabledReason,
}: {
  step: number;
  glyph: ReactNode;
  title: string;
  summary?: string;
  trailing?: ReactNode;
  onActivate?: () => void;
  disabledReason?: string;
}) {
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-1.5">
        {glyph}
        <span className="truncate text-xs font-semibold text-slate-800" title={title}>{title}</span>
      </span>
      {(disabledReason || summary) && (
        <span
          className={cn('mt-0.5 truncate text-[11px]', disabledReason ? 'text-slate-400' : 'text-slate-500')}
          title={disabledReason ?? summary}
        >
          {disabledReason ?? summary}
        </span>
      )}
    </>
  );
  return (
    <li className={cn(
      'flex items-center gap-2 rounded-lg border bg-white py-2 pl-2 pr-2',
      onActivate ? 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/30' : 'border-slate-100',
    )}>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10px] font-bold text-blue-700">
        {step}
      </span>
      {onActivate ? (
        <button type="button" className="flex min-w-0 flex-1 flex-col text-left" onClick={onActivate}>
          {body}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col">{body}</div>
      )}
      {trailing}
    </li>
  );
}

/** 연결 한 줄(사용 보기) — 종류별 주 동작은 affordanceForUse 가 정한다 */
function UseActionEntry({
  action,
  step,
  viewer,
  onRun,
  onGuide,
  onViewHistory,
}: {
  action: TaskAction;
  step: number;
  viewer: { userId: string | null; canUseDefinition: boolean };
  onRun: () => void;
  onGuide: () => void;
  onViewHistory: () => void;
}) {
  const definition = getTaskActionDefinition(action.action_type);
  const external = definition?.kind === 'external';
  const { data: runs = [] } = useTaskActionRuns(action.id, !external);
  const latestRun = runs[0];
  // 입력·제출 요청 — 내가 이 요청의 대상이면 바로 입력·제출한다(러너가 대상에게는 응답 화면을 연다).
  // 2026-10-06: 종전엔 입력 받기만 대상 판정을 해, 제출 요청의 대상에게 «이 제출 요청의 대상이 아닙니다»가 떴다
  const isRequest = action.action_type === 'collect.input' || isSubmitActionType(action.action_type);
  const { data: myRequests } = useMyCollectRequests(isRequest);
  const collectTarget = isRequest && Boolean(myRequests?.some((r) => r.action_id === action.id));
  // 책임자 판정 — 만든 사람만이 아니라 그 업무의 책임자 전원(서버 can_manage_task_action 과 같은 판정)
  const managedByMe = useCanManageTaskAction(action.id, isRequest || action.action_type === 'message.send');
  const affordance = affordanceForUse(action, definition, { ...viewer, collectTarget, canManage: managedByMe });
  const activate = affordance.kind === 'guide' ? onGuide : affordance.kind === 'run' ? onRun : undefined;
  return (
    <UseActionRow
      step={step}
      glyph={<KindGlyph kind={definition?.kind} type={action.action_type} />}
      title={action.title}
      summary={summaryForUse(action, definition)}
      disabledReason={affordance.kind === 'none' ? affordance.reason : undefined}
      onActivate={activate}
      trailing={
        <span className="flex shrink-0 items-center gap-1">
          {latestRun && (
            <button
              type="button"
              className="rounded-md px-1 py-0.5 hover:bg-slate-50"
              onClick={onViewHistory}
              title="내 실행·검수 이력 보기"
            >
              <RunStatusBadge status={latestRun.status} />
            </button>
          )}
          {affordance.kind !== 'none' && (
            <span className="flex items-center text-[11px] font-medium text-blue-600" aria-hidden>
              {affordance.kind === 'guide' ? '안내' : '열기'}
              <ChevronRight className="h-3.5 w-3.5" />
            </span>
          )}
        </span>
      }
    />
  );
}

// ── 바로가기형(link.*) 러너: 기능 화면으로 이동해 처리하고, 완료를 RUN으로 기록 ──
function LinkActionRunner({ action, workflowId }: { action: TaskAction; workflowId: string | null }) {
  const definition = getTaskActionDefinition(action.action_type);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-blue-50/40 p-4">
        <p className="text-sm font-semibold text-slate-800">{definition?.title ?? action.title}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{definition?.description ?? action.description}</p>
        <Button
          size="sm"
          className="mt-3 bg-blue-600 hover:bg-blue-700"
          disabled={!definition?.route}
          onClick={() => definition?.route && window.open(definition.route, '_blank')}
        >
          기능 화면 열기
          <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </div>
      <ManualCompletionRecord
        action={action}
        workflowId={workflowId}
        snapshot={{ mode: 'link', route: definition?.route ?? null }}
      />
    </div>
  );
}

// ── 실질 작업 연결 모달: 카테고리(기능/행정/문서) 그룹 카탈로그 ──
/** 연결 목록의 묶음(서랍) — 등록부 카테고리와 제출 받기가 같은 머리를 쓴다 */
function ConnectCategory({
  label, description, count, opened, onToggle, children,
}: {
  label: string;
  description: string;
  count: number;
  opened: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 bg-gradient-to-r from-indigo-50/70 to-blue-50/40 px-3 py-2 text-left"
        onClick={onToggle}
        aria-expanded={opened}
      >
        <div>
          <p className="text-xs font-bold text-slate-700">{label}</p>
          <p className="text-[10px] text-slate-400">{description}</p>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
          {count}개
          <ChevronDown className={cn('h-4 w-4 transition-transform', opened && 'rotate-180')} />
        </span>
      </button>
      {opened && <div className="border-t border-slate-100">{children}</div>}
    </section>
  );
}

/** 연결 목록의 한 줄 — 연결 전 [연결]/[추가], 연결 후 «연결됨» + [열기] [해제] */
function ConnectRow({
  glyph, tone, title, description, adminOnly, multipleCount = 0, connectLabel = '연결',
  connected, allowed, pending, onConnect, onOpen, onDisconnect, disconnectTitle,
}: {
  glyph: ReactNode;
  /** 아이콘 칩 배경·글자색 */
  tone: string;
  title: string;
  description: string;
  adminOnly?: boolean;
  /** 여러 개 유형 — 연결 개수(0이면 표시 안 함) */
  multipleCount?: number;
  connectLabel?: string;
  connected: boolean;
  allowed: boolean;
  pending: boolean;
  onConnect: () => void;
  onOpen: () => void;
  onDisconnect: () => void;
  disconnectTitle?: string;
}) {
  return (
    <li className={cn('flex items-center gap-2 px-3 py-2', connected && 'bg-blue-50/40')}>
      <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', tone)}>{glyph}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-700">
          {title}
          {connected && (
            <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-blue-100 px-1 py-0.5 text-[10px] font-medium text-blue-700">
              <CheckCircle2 className="h-3 w-3" />연결됨
            </span>
          )}
          {adminOnly && <span className="ml-1 text-[10px] font-normal text-amber-600">관리자</span>}
          {multipleCount > 0 && (
            <span className="ml-1.5 rounded bg-blue-100 px-1 py-0.5 text-[10px] font-medium text-blue-700">
              {multipleCount}개 연결됨
            </span>
          )}
        </p>
        <p className="truncate text-[10px] text-slate-400" title={description}>{description}</p>
      </div>
      {connected ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={!allowed} onClick={onOpen}>
            열기
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px] text-slate-400 hover:text-red-500"
            disabled={pending}
            title={disconnectTitle}
            onClick={onDisconnect}
          >
            <Unlink className="mr-1 h-3 w-3" />연결 해제
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 px-2 text-[11px]"
          disabled={!allowed || pending}
          onClick={onConnect}
        >
          {connectLabel}
        </Button>
      )}
    </li>
  );
}

function WorkConnectDialog({
  open, onOpenChange, canUse, pending, onConnect, onDisconnect, onOpen, connectedByType, countByType, isAdmin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canUse: (definition: TaskActionDefinition) => boolean;
  pending: boolean;
  onConnect: (definition: TaskActionDefinition) => void;
  /** 연결 해제(이력 있으면 confirm 후 이력·파일 포함 삭제) */
  onDisconnect: (action: TaskAction) => void;
  /** 연결된 실행 실행 화면 열기 */
  onOpen: (action: TaskAction) => void;
  /** action_type → 이 태스크에 연결된 실행(bind 행 존재 = 연결) */
  connectedByType: Map<string, TaskAction>;
  /** action_type → 연결 개수(여러 개를 두는 유형 표시용) */
  countByType: Map<string, number>;
  /** SPACEKIJUN 기능 연결(데이터 구축) 그룹은 admin에게만 노출 */
  isAdmin: boolean;
}) {
  const visibleCategories = TASK_ACTION_CATEGORY_ORDER.filter(
    (category) => category !== 'data_import' || isAdmin
  );
  // 서랍식: 메인 카테고리를 열고 닫는다 — 기본은 모두 펼침
  const [openCategories, setOpenCategories] = useState<Set<string>>(
    () => new Set<string>(visibleCategories)
  );
  const toggleCategory = (category: string) => {
    setOpenCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl lg:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Wrench className="h-4 w-4" />
            </span>
            작업 연결
          </DialogTitle>
          <DialogDescription>
            [연결]을 누르면 할 일에 작업이 바로 연결되고, 연결된 항목은 이 목록에서 열거나 해제할 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {visibleCategories.map((category) => {
            const meta = TASK_ACTION_CATEGORY_META[category];
            const definitions = AVAILABLE_TASK_ACTION_DEFINITIONS.filter(
              (definition) => definition.category === category && !definition.hidden
            );
            if (definitions.length === 0) return null;
            // 서브 카테고리(feature 단위) 그룹 — 같은 서브는 등재 위치와 무관하게 한 묶음으로
            // 집계(첫 등장 순서 보존). 연속 구간 방식은 흩어진 같은 서브가 중복 key를 만들었다.
            const subGroups: Array<{ sub?: string; items: TaskActionDefinition[] }> = [];
            const groupBySub = new Map<string | undefined, { sub?: string; items: TaskActionDefinition[] }>();
            definitions.forEach((definition) => {
              let group = groupBySub.get(definition.subcategory);
              if (!group) {
                group = { sub: definition.subcategory, items: [] };
                groupBySub.set(definition.subcategory, group);
                subGroups.push(group);
              }
              group.items.push(definition);
            });
            return (
              <ConnectCategory
                key={category}
                label={meta.label}
                description={meta.description}
                count={definitions.length}
                opened={openCategories.has(category)}
                onToggle={() => toggleCategory(category)}
              >
                {subGroups.map((group) => (
                  <div key={group.sub ?? 'direct'}>
                    {group.sub && (
                      <p className="border-b border-slate-100 bg-slate-50/70 px-3 py-1 text-[10px] font-semibold text-slate-500">
                        {group.sub}
                      </p>
                    )}
                    <ul className="divide-y divide-slate-100">
                      {group.items.map((definition) => {
                        // 여러 개 유형은 '연결됨'으로 잠그지 않는다 — 개수만 보이고 계속 추가한다
                        const connected = definition.multiple ? undefined : connectedByType.get(definition.type);
                        const multipleCount = definition.multiple ? (countByType.get(definition.type) ?? 0) : 0;
                        return (
                          <ConnectRow
                            key={definition.type}
                            glyph={(() => { const { Icon } = kindVisual(definition.kind, definition.type); return <Icon className="h-3.5 w-3.5" />; })()}
                            tone={kindVisual(definition.kind, definition.type).tone}
                            title={definition.title}
                            description={definition.description}
                            adminOnly={definition.adminOnly}
                            multipleCount={multipleCount}
                            connectLabel={definition.multiple ? '추가' : '연결'}
                            connected={Boolean(connected)}
                            allowed={canUse(definition)}
                            pending={pending}
                            onConnect={() => onConnect(definition)}
                            onOpen={() => { if (connected) onOpen(connected); }}
                            onDisconnect={() => { if (connected) onDisconnect(connected); }}
                          />
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </ConnectCategory>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TaskActionPanel({
  taskId,
  taskTitle,
  workflowId,
  readOnly = false,
  defaultMode = 'manage',
  allowManage = true,
  embedded = false,
}: TaskActionPanelProps) {
  const { user, profile, isAdmin } = useAuth();
  const { isAssignee, flow } = useTaskActionContext(taskId);
  const setFlow = useSetTaskActionFlow();
  // 누른 즉시 순서가 바뀌어 보이도록 로컬 사본을 둔다(저장 결과가 오면 그 값으로 맞춘다)
  const [localFlow, setLocalFlow] = useState<string[] | null>(null);
  const flowSignature = flow.join('|');
  useEffect(() => setLocalFlow(null), [flowSignature, taskId]);
  const effectiveFlow = localFlow ?? flow;
  const panelModes = resolvePanelModes({ canManage: allowManage && !readOnly, isAssignee, preferred: defaultMode });
  const [chosenMode, setChosenMode] = useState<ActionPanelMode | null>(null);
  // 고른 보기가 지금 허용되지 않으면(권한·담당 판정이 늦게 도착) 기본값으로
  const mode: ActionPanelMode =
    chosenMode && panelModes.modes.includes(chosenMode) ? chosenMode : panelModes.initial;
  const { data: actions = [], isLoading, error } = useTaskActions(taskId);
  const workIds = actions.map((action) => action.id);
  const presence = useTaskActionRunPresence(workIds);
  const bindWork = useBindTaskAction();
  const deleteWork = useDeleteTaskAction();
  const [activeWork, setActiveWork] = useState<TaskAction | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  // 읽기 전용 이력 열람 다이얼로그(타인 워크플로)
  const [historyWork, setHistoryWork] = useState<TaskAction | null>(null);
  // 읽기 전용 안내 열람(담당자가 NEIS 화면을 볼 때)
  const [guideWork, setGuideWork] = useState<TaskAction | null>(null);

  // 연결 = bind 행 존재(2026-07-26 완화 — 사용자 결정: [연결] 클릭 즉시 연결, 해제 용이).
  // 이력(run) 유무는 카드의 '최근 실행'과 해제 confirm 분기에만 쓰인다.
  const ranWorkIds = presence.data ?? new Set<string>();
  const connectedWorks = listableActions(actions);
  const connectedByType = new Map(actions.map((action) => [action.action_type, action]));
  const countByType = new Map<string, number>();
  for (const action of listableActions(actions)) {
    countByType.set(action.action_type, (countByType.get(action.action_type) ?? 0) + 1);
  }
  // 열어 둔 러너에는 **최신 행**을 넘긴다 — activeWork 는 연 순간의 스냅샷이라, 러너 안에서
  // 설정(config)을 저장해도 그대로 남는다(NEIS 화면 추가가 목록에 안 보이던 원인).
  const liveAction = (snapshot: TaskAction | null) =>
    snapshot ? actions.find((action) => action.id === snapshot.id) ?? snapshot : null;

  // 해제 — 무엇이 사라지는지는 작업 유형마다 다르다(utils/disconnectEffect.ts 단일 출처).
  // 종전엔 «실행 이력이 있을 때만» 물어, 이력을 남기지 않는 입력·제출·메시지 작업은 요청을 보낸 뒤에도
  // 확인 없이 풀렸다(2026-10-05).
  const handleDisconnect = async (action: TaskAction) => {
    const effect = disconnectEffect(action.action_type, ranWorkIds.has(action.id));
    if (effect.confirm && !window.confirm(`"${action.title}" 연결을 해제할까요?
${effect.message}`)) return;
    try {
      await deleteWork.mutateAsync(action.id);
      if (activeWork?.id === action.id) setActiveWork(null);
      toast.success('연결을 해제했습니다.');
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : '연결을 해제하지 못했습니다.');
    }
  };

  // 학생 정보를 다루는 연결형 실행는 definition.adminOnly로 이미 걸러진다.
  // 나머지(행정 할 일 연결·문서 작성)는 직원(staff)도 쓸 수 있다.
  const canUseDefinition = (definition: TaskActionDefinition) =>
    definition.adminOnly
      ? isAdmin
      : Boolean(user) && isFacultyRole(profile?.role);

  // 연결 클릭 = bind 생성만(러너는 [열기]로) — 모달을 닫지 않아 여러 항목을 잇달아 연결·해제할 수 있다
  const handleConnect = async (definition: TaskActionDefinition) => {
    // 여러 개를 두는 유형(NEIS 화면)은 이미 있어도 새로 만든다 — 작업 하나 = 과정 하나
    if (!definition.multiple && connectedByType.has(definition.type)) return;
    try {
      const bound = await bindWork.mutateAsync({ taskId, workType: definition.type });
      if (definition.kind === 'external') {
        // 외부 처리 작업(NEIS 화면·외부 시스템)은 설정 전엔 아무것도 가리키지 않는다 — 바로 설정 화면을 연다
        setConnectOpen(false);
        setActiveWork(bound);
        return;
      }
      toast.success(`"${definition.title}" 기능을 연결했습니다.`);
    } catch (bindError) {
      // Supabase 오류는 Error 가 아니라 {code, message} 객체다 — instanceof 만 보면 원인이 버려진다
      const message =
        bindError instanceof Error
          ? bindError.message
          : (bindError as { message?: string } | null)?.message;
      toast.error(message ? `작업을 연결하지 못했습니다 — ${message}` : '작업을 연결하지 못했습니다.');
    }
  };

  const busyLoading = isLoading || (workIds.length > 0 && presence.isLoading);

  const viewerBase = { userId: user?.id ?? null, canUseDefinition: false };

  // 연결을 한 줄의 순서 목록으로(utils/actionFlow.ts) — 두 보기가 같은 순서를 쓴다.
  // 옛 제출 받기(task.meta.submission) 줄은 2026-10-05 에 걷어 냈다 — 제출은 「제출 받기」 작업이다
  type FlowEntry = { key: string; kind: 'action'; action: TaskAction };
  const flowEntries = orderByFlow<FlowEntry>(
    connectedWorks.map((action) => ({ key: action.id, kind: 'action' as const, action })),
    effectiveFlow,
    (entry) => entry.key,
  );
  const moveFlow = async (key: string, direction: -1 | 1) => {
    const next = moveKey(flowEntries.map((entry) => entry.key), key, direction);
    setLocalFlow(next);
    try {
      await setFlow.mutateAsync({ taskId, flow: next });
    } catch (flowError) {
      setLocalFlow(null);
      toast.error(flowError instanceof Error ? flowError.message : '작업 순서를 저장하지 못했습니다.');
    }
  };

  if (embedded && !busyLoading && !error && flowEntries.length === 0) return null;

  return (
    <section className={embedded ? 'space-y-2' : 'space-y-2 rounded-xl border border-blue-100 bg-blue-50/50 p-3'}>
      {embedded ? (
        <SectionLabel icon={Wrench}>연결된 작업{flowEntries.length > 0 && ` ${flowEntries.length}`}</SectionLabel>
      ) : (
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Wrench className="h-3.5 w-3.5 shrink-0 text-blue-600" />
          <h3 className="text-xs font-bold text-slate-700">
            {mode === 'manage' ? '연결된 작업' : '이 할 일에서 쓸 작업'}
          </h3>
        </div>
        {panelModes.modes.length > 1 && (
          <div
            role="tablist"
            aria-label="보기 선택"
            className="flex shrink-0 rounded-lg border border-slate-100 bg-slate-100/50 p-0.5"
          >
            {panelModes.modes.map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                onClick={() => setChosenMode(value)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors',
                  mode === value ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700',
                )}
              >
                {value === 'manage' ? '관리' : '사용'}
              </button>
            ))}
          </div>
        )}
      </div>
      )}

      {busyLoading ? (
        <div className="flex items-center py-2 text-xs text-slate-500">
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          연결된 작업 확인 중
        </div>
      ) : error ? (
        <p className="text-xs text-red-600">연결된 작업을 불러오지 못했습니다.</p>
      ) : mode === 'manage' ? (
        <>
          {flowEntries.length > 0 ? (
            <ol className="space-y-1.5">
              {flowEntries.map((entry, index) => {
                const common = {
                  step: index + 1,
                  onMove: (direction: -1 | 1) => void moveFlow(entry.key, direction),
                  isFirst: index === 0,
                  isLast: index === flowEntries.length - 1,
                  movePending: setFlow.isPending,
                };
                const definition = getTaskActionDefinition(entry.action.action_type);
                return (
                  <ManageActionEntry
                    key={entry.key}
                    {...common}
                    action={entry.action}
                    canOpen={definition ? canUseDefinition(definition) : true}
                    onOpen={() => setActiveWork(entry.action)}
                    onDelete={() => void handleDisconnect(entry.action)}
                  />
                );
              })}
            </ol>
          ) : (
            <p className="text-[11px] leading-4 text-slate-500">
              아직 연결된 작업이 없습니다. 담당자가 이 할 일에서 쓸 나이스 화면·문서 양식·기능을 연결하세요.
            </p>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-full border-dashed border-blue-200 text-xs text-blue-700 hover:bg-blue-50"
            onClick={() => setConnectOpen(true)}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            작업 연결
          </Button>
          {flowEntries.length > 1 && (
            <p className="text-[10px] leading-4 text-slate-400">번호는 권장 순서입니다 — 순서대로 하도록 막지는 않습니다.</p>
          )}
        </>
      ) : flowEntries.length > 0 ? (
        <>
          <ol className="space-y-1.5">
            {flowEntries.map((entry, index) => {
              const definition = getTaskActionDefinition(entry.action.action_type);
              return (
                <UseActionEntry
                  key={entry.key}
                  action={entry.action}
                  step={index + 1}
                  viewer={{ ...viewerBase, canUseDefinition: definition ? canUseDefinition(definition) : false }}
                  onRun={() => setActiveWork(entry.action)}
                  onGuide={() => setGuideWork(entry.action)}
                  onViewHistory={() => setHistoryWork(entry.action)}
                />
              );
            })}
          </ol>
          <p className="text-[10px] leading-4 text-slate-400">
            {embedded
              ? isAssignee
                ? '번호는 권장 순서입니다. 작업을 마친 뒤 아래에서 완료로 바꾸세요 — 작업을 하지 않고도 완료할 수 있습니다(단, 열린 제출 요청은 내야 완료됩니다).'
                : '번호는 권장 순서입니다.'
              : '번호는 권장 순서입니다. 마치면 내 할 일에서 완료를 체크하세요.'}
          </p>
        </>
      ) : (
        <p className="text-[11px] leading-4 text-slate-500">이 할 일에 연결된 작업이 없습니다.</p>
      )}

      {/* 읽기 전용: 이력 열람 전용 다이얼로그(실행 러너 대신) */}
      {historyWork && (
        <Dialog open onOpenChange={(open) => { if (!open) setHistoryWork(null); }}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-slate-500" />
                실행·검수 이력 — {historyWork.title}
              </DialogTitle>
              <DialogDescription>내가 실행한 이력만 보입니다. 읽기 전용이며 실행·검수·삭제는 소유자만 할 수 있습니다.</DialogDescription>
            </DialogHeader>
            <ActionRunHistory action={historyWork} readOnly />
          </DialogContent>
        </Dialog>
      )}

      <WorkConnectDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        canUse={canUseDefinition}
        pending={bindWork.isPending || deleteWork.isPending}
        onConnect={(definition) => void handleConnect(definition)}
        onDisconnect={(action) => void handleDisconnect(action)}
        onOpen={(action) => {
          setConnectOpen(false);
          setActiveWork(action);
        }}
        connectedByType={connectedByType}
        countByType={countByType}
        isAdmin={isAdmin}
      />

      {guideWork && (
        <TaskActionRunnerDialog
          action={liveAction(guideWork)!}
          taskTitle={taskTitle}
          workflowId={workflowId}
          open
          guideOnly
          onOpenChange={(open) => {
            if (!open) setGuideWork(null);
          }}
        />
      )}

      {activeWork && (
        <TaskActionRunnerDialog
          action={liveAction(activeWork)!}
          taskTitle={taskTitle}
          workflowId={workflowId}
          open
          onOpenChange={(open) => {
            if (!open) setActiveWork(null);
          }}
        />
      )}
    </section>
  );
}
