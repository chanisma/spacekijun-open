// ========================================
// 업무 관리 — 페이지 껍데기 (2026-10-05 탭 → 페이지)
//
// `/tasks/mine`(업무 목록) · `/tasks/workflow` · `/tasks/timeline` · `/tasks/map`(관리자) 네 페이지가
// **이 한 컴포넌트**를 쓴다. 페이지마다 다른 것은 본문과 머리글의 필터뿐이고, 업무·할 일 상세·편집·
// 진행 화면·만들기 같은 모달과 딥링크(?task= · ?work= · ?pipeline=)는 어느 페이지에서나 같아야 해서다.
// 페이지 정의·구 주소 대응의 단일 출처 = `@/lib/taskTabs`.
// 사이드바의 「업무 관리」 서랍이 이 페이지들을 담는다(`config/navigation.ts`).
// 근거 = docs/plans/2026-10-05-task-ux-audit.md §2-1
// ========================================

import { lazy, Suspense, useState, useEffect, useMemo } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { WorkList } from '@/components/tasks/WorkList';
import { IntegratedTaskView } from '@/components/tasks/IntegratedTaskView';
import { TaskHeader } from '@/components/tasks/TaskHeader';
import { TaskGuideDialog, type TaskGuideTab } from '@/components/tasks/guide/TaskGuideDialog';
import {
  MY_TASKS_PATH,
  TASKS_ROOT_PATH,
  WORK_LIST_SCOPE_PARAM,
  isMyTasksTab,
  resolveTaskPage,
  TASK_LINK_NOT_FOUND_MESSAGE,
  taskPagePath,
  taskViewOf,
  viewFromLegacyTab,
  workListScopeFrom,
  type WorkListScope,
} from '@/lib/taskTabs';
// ⚠️ `isAdmin` 은 미리보기를 반영한다 — 교사 시점 미리보기 중에는 학교 전체가 사라져야 한다
import { useAuth } from '@/components/auth/AuthProvider';
import { WorkCreateDialog } from '@/components/tasks/WorkCreateDialog';
import { WorkFromReferenceDialog } from '@/components/tasks/WorkFromReferenceDialog';
import { WorkDetailDialog } from '@/components/tasks/WorkDetailDialog';
import { WorkPipelineDialog } from '@/components/tasks/pipeline/WorkPipelineDialog';
import { PIPELINE_PARAM, PIPELINE_TASK_PARAM } from '@/lib/workPipelineLink';
import { WorkEditDialog } from '@/components/tasks/WorkEditDialog';
import { TaskDetailDialog } from '@/components/tasks/TaskDetailDialog';
import { TaskEditDialog } from '@/components/tasks/TaskEditDialog';
import { TaskSearchDialog } from '@/components/tasks/TaskSearchDialog';
import { WorkTimelineTab } from '@/components/tasks/WorkTimelineTab';
import { WorkPivotTab } from '@/components/tasks/WorkPivotTab';
import { OfficialDocInbox } from '@/features/official-docs/components/OfficialDocInbox';
import { BudgetHub } from '@/features/budget/BudgetHub';
import { Skeleton } from '@/components/ui/skeleton';
import { Work, Task } from '@/types/tasks';
import { useWorksJsonb } from '@/hooks/useTasksJsonb';
import { useDepartments } from '@/hooks/useDepartments';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DocumentIntelligenceDialog } from '@/features/document-intelligence/components/DocumentIntelligenceDialog';
import { markDocumentAnalysisApplied } from '@/features/document-intelligence/services/documentAnalysisHistoryService';
import type { DocumentTaskDraft, ExistingWorkItem } from '@/features/document-intelligence';
import { toast } from '@/lib/toast';

/**
 * 지난 업무 가져오기(연간 업무 템플릿).
 *
 * 2026-09-23 구현 후 같은 날 비활성화했다가 **2026-09-24 사용자 결정으로 켰다** — 인수인계
 * 시스템을 기다리지 않는다. 근거: 실사용 작업의 절반이 「학교정보공시」처럼 **연 1회 반복되는
 * 업무**라, 작년 업무를 가져오는 것만으로 인수인계의 절반이 해결된다.
 * 배경 = docs/plans/2026-09-23-school-mes-roadmap.md §4
 */
const WORK_ROLLOVER_ENABLED = true;

const TaskWorkflowTab = lazy(() =>
  import('@/features/task-workflow').then((module) => ({ default: module.TaskWorkflowTab }))
);

export default function TaskManagement() {
  const [searchParams, setSearchParams] = useSearchParams();
  // `/tasks/:page` 의 조각. 없으면 뿌리(`/tasks`) — 구 주소를 받아 페이지로 넘겨 주는 자리다
  const { page: pageSegment } = useParams<{ page?: string }>();
  const [workSummary, setWorkSummary] = useState<HTMLDivElement | null>(null);
  const [workToolbar, setWorkToolbar] = useState<HTMLDivElement | null>(null);
  const [createWorkOpen, setCreateWorkOpen] = useState(false);
  const [rolloverOpen, setRolloverOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [documentAnalyzerOpen, setDocumentAnalyzerOpen] = useState(false);
  const [documentTaskDraft, setDocumentTaskDraft] = useState<DocumentTaskDraft | null>(null);
  const [workflowDirty, setWorkflowDirty] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  // URL 쿼리 파라미터에서 create=true인 경우 WorkCreateDialog 자동 열기
  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setCreateWorkOpen(true);
      // URL에서 create 파라미터 제거
      searchParams.delete('create');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // 내 할 일 뷰를 위한 상태
  const [selectedWork, setSelectedWork] = useState<Work | null>(null);
  const [workDetailOpen, setWorkDetailOpen] = useState(false);
  const [editingWork, setEditingWork] = useState<Work | null>(null);
  const [workEditOpen, setWorkEditOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskEditOpen, setTaskEditOpen] = useState(false);

  // 내 업무 필터 상태
  const [myWorksFilter, setMyWorksFilter] = useState<'all' | 'active' | 'completed' | 'pending'>('active');

  // 업무 필터 상태
  const [workFilters, setWorkFilters] = useState({
    status: 'all',
    keyword: '',
    manager_id: 'all',
    department: 'all'
  });

  const { isAdmin } = useAuth();

  // 필터 옵션을 위한 상태
  const [managers, setManagers] = useState<{ id: string; name: string }[]>([]);

  // 부서 목록은 useDepartments hook으로 관리 (display_order 순으로 정렬됨)
  const { departmentObjects } = useDepartments({ source: 'database', category: 'school' });

  // ⚠️ 관리자 전용 페이지(학교 전체)는 여기서도 걸러진다 — 메뉴만 숨기면 주소로 들어와진다.
  //    `isAdmin` 은 미리보기를 반영하므로 교사 시점 미리보기 중에도 막힌다.
  const activePage = resolveTaskPage(pageSegment, isAdmin);
  // 업무 목록의 범위(구 「내 업무 관리」/「업무 검색」) — 주소 `?scope=all` 이 전체 업무
  const scope = workListScopeFrom(searchParams.get(WORK_LIST_SCOPE_PARAM));
  // 보기 = 페이지 + 범위. 머리글 필터·본문·사용 방법 안내가 이 값으로 갈린다
  const activeTab = taskViewOf(activePage, scope);
  const selectedDepartmentId = searchParams.get('department') || 'all';
  const selectedDepartment = departmentObjects.find(
    (department) => department.id === selectedDepartmentId
  ) ?? null;

  const handleDepartmentChange = (departmentId: string) => {
    if (
      activeTab === 'workflow' &&
      workflowDirty &&
      !window.confirm('저장하지 않은 업무 흐름 변경사항이 있습니다. 부서를 변경할까요?')
    ) {
      return;
    }
    if (activeTab === 'workflow') setWorkflowDirty(false);
    const nextParams = new URLSearchParams(searchParams);
    if (departmentId === 'all') nextParams.delete('department');
    else nextParams.set('department', departmentId);
    setSearchParams(nextParams, { replace: true });
  };

  // 업무 목록의 범위 전환 — 주소에 남겨 새로고침·공유 때 같은 범위로 돌아온다.
  // (페이지 사이 이동은 사이드바 링크가 한다. 업무 흐름의 «저장 안 한 변경» 확인은
  //  라우터가 아니라 업무 흐름 화면 스스로 링크 클릭을 가로채 묻는다 — BrowserRouter 라 useBlocker 가 없다)
  const handleScopeChange = (next: WorkListScope) => {
    const nextParams = new URLSearchParams(searchParams);
    if (next === 'all') nextParams.set(WORK_LIST_SCOPE_PARAM, 'all');
    else nextParams.delete(WORK_LIST_SCOPE_PARAM);
    setSearchParams(nextParams);
  };

  useEffect(() => {
    setWorkFilters((current) => ({
      ...current,
      department: selectedDepartment?.name ?? 'all',
    }));
  }, [selectedDepartment?.name]);

  // 관리자 목록 로드 (부서 목록은 useDepartments hook에서 관리)
  useEffect(() => {
    const loadManagers = async () => {
      try {
        // 관리자 목록 (teacher 타입 resource) 로드
        const { data: managersData } = await supabase
          .from('resource')
          .select('id, name')
          .eq('type', 'teacher')
          .order('name');

        if (managersData) {
          setManagers(managersData);
        }
      } catch (error) {
        console.error('관리자 목록 로드 실패:', error);
      }
    };

    loadManagers();
  }, []);

  // 업무 필터 핸들러
  const handleWorkFiltersChange = (newFilters: typeof workFilters) => {
    setWorkFilters(newFilters);
  };

  // [초기화]는 부서까지 푼다 (2026-10-05) — 부서는 주소(?department=)에 있어 따로 비워야 한다.
  // 업무 흐름 탭의 '저장 안 한 변경' 확인은 handleDepartmentChange 가 맡는데, 이 버튼은 업무 검색에만 있다.
  const handleClearWorkFilters = () => {
    setWorkFilters({
      status: 'all',
      keyword: '',
      manager_id: 'all',
      department: 'all'
    });
    if (selectedDepartmentId !== 'all') handleDepartmentChange('all');
  };

  // 통계 데이터 가져오기
  const { data: workData, isLoading, refetch } = useWorksJsonb();
  const queryClient = useQueryClient();
  const departmentScopedWorks = useMemo(
    () =>
      (workData ?? []).filter(
        (work) => !selectedDepartment || work.meta?.department === selectedDepartment.name
      ),
    [workData, selectedDepartment]
  );

  // ?task=<id> 딥링크 — 공지사항 링크 등에서 특정 할 일 상세 다이얼로그 자동 오픈.
  // workData 로드 후 1회 소비하고 URL에서 제거 (tab 등 다른 파라미터는 유지).
  useEffect(() => {
    const taskId = searchParams.get('task');
    if (!taskId || !workData || workData.length === 0) return;

    let opened = false;
    for (const work of workData) {
      const found = (work.tasks || []).find((t: Task) => t.id === taskId);
      if (found) {
        setSelectedTask({ ...found, event_id: found.event_id ?? work.id });
        setTaskDetailOpen(true);
        opened = true;
        break;
      }
    }
    // 못 찾으면 말한다 (2026-10-06, 감사 §4-9) — 종전엔 파라미터만 지워 «링크를 눌렀는데 아무 일도 없음»이었다
    if (!opened) toast.info(TASK_LINK_NOT_FOUND_MESSAGE);
    searchParams.delete('task');
    setSearchParams(searchParams, { replace: true });
  }, [workData, searchParams, setSearchParams]);

  // ?work=<id> 딥링크 — 업무 상세를 연다. 「원본 {작년 업무}」 라벨이 이 길로 보낸다
  // (계보 `meta.rolledOverFrom.workId`). 못 찾으면 **파라미터를 지우지 않는다** — 다른 부서
  // 필터에 가려 아직 안 왔을 수 있고, 먼저 지우면 조용히 아무 일도 일어나지 않는다.
  useEffect(() => {
    const workId = searchParams.get('work');
    if (!workId || !workData || workData.length === 0) return;
    const found = workData.find((work) => work.id === workId);
    if (!found) return;
    setSelectedWork(found as Work);
    setWorkDetailOpen(true);
    searchParams.delete('work');
    setSearchParams(searchParams, { replace: true });
  }, [workData, searchParams, setSearchParams]);

  // ?pipeline=<업무>&pipelineTask=<할 일> 딥링크 — 업무 진행 모달(옛 /tasks/works/:id 주소가 이리로 온다).
  // 업무 목록을 기다리지 않는다: 모달이 업무를 스스로 읽고, 볼 수 없으면 «찾지 못했습니다»를 말한다.
  // 읽은 즉시 지운다 — 남겨 두면 모달을 닫자마자 다시 열린다(ModalBackRouterSync 주석 참고).
  const [pipelineLink, setPipelineLink] = useState<{ workId: string; taskId: string | null } | null>(null);
  const [pipelineOpen, setPipelineOpen] = useState(false);
  useEffect(() => {
    const workId = searchParams.get(PIPELINE_PARAM);
    if (!workId) return;
    setPipelineLink({ workId, taskId: searchParams.get(PIPELINE_TASK_PARAM) });
    setPipelineOpen(true);
    searchParams.delete(PIPELINE_PARAM);
    searchParams.delete(PIPELINE_TASK_PARAM);
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // 통계 계산
  const totalWorks = departmentScopedWorks.length;
  const allTasks = departmentScopedWorks.flatMap(work => work.tasks || []) as Task[];
  const totalTasks = allTasks.length;
  const completedTasks = allTasks.filter(task => {
    const assigneeData = Array.isArray(task.assignees_jsonb) ? task.assignees_jsonb : [];
    return assigneeData.some((assignee) => assignee.status === 'completed');
  }).length;

  const existingWorkItems = useMemo<ExistingWorkItem[]>(() => (workData ?? []).flatMap((work) => [
    {
      workId: work.id,
      workName: work.name,
      taskId: null,
      title: work.name,
      description: work.description ?? '',
      dueDate: null,
    },
    ...(work.tasks ?? []).map((task) => ({
      workId: work.id,
      workName: work.name,
      taskId: task.id,
      title: task.title,
      description: task.description ?? '',
      dueDate: task.due_date ?? null,
    })),
  ]), [workData]);

  // 새로고침 핸들러
  const handleRefresh = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['works-jsonb'] });
    queryClient.invalidateQueries({ queryKey: ['my-tasks-jsonb'] });
  };

  const handleCreateWork = () => {
    setDocumentTaskDraft(null);
    setCreateWorkOpen(true);
  };

  const handleDocumentDraftPrepared = (draft: DocumentTaskDraft) => {
    setDocumentTaskDraft(draft);
    setDocumentAnalyzerOpen(false);
    setCreateWorkOpen(true);
  };

  const handleWorkCreated = async (result: {
    workId: string;
    taskIdsBySourceCandidateId: Record<string, string>;
    analysisRunId: string | null;
  }) => {
    if (result.analysisRunId) {
      try {
        await markDocumentAnalysisApplied(
          result.analysisRunId,
          result.workId,
          result.taskIdsBySourceCandidateId
        );
      } catch (error) {
        console.warn('문서 분석 적용 이력 저장 실패:', error);
        toast.warning('할 일은 생성했지만 문서 분석 적용 이력은 갱신하지 못했습니다.');
      }
    }
    setDocumentTaskDraft(null);
    handleRefresh();
    // 만든 업무를 바로 연다(2026-10-06 — 종전엔 창만 닫혀 방금 만든 업무를 목록에서 다시 찾아야 했다).
    // 업무 목록이 새로 오면 `?work=` 딥링크가 업무 상세를 연다 — 거기서 [할 일 추가]로 이어 간다
    searchParams.set('work', result.workId);
    setSearchParams(searchParams, { replace: true });
  };

  // 내 할 일 뷰 핸들러들
  const handleWorkEdit = (work: Work) => {
    setEditingWork(work);
    setWorkEditOpen(true);
  };

  const handleTaskEdit = (task: Task) => {
    setEditingTask(task);
    setTaskEditOpen(true);
  };

  const handleTaskDetail = (task: Task) => {
    setSelectedTask(task);
    setTaskDetailOpen(true);
  };

  const handleWorkflowWorkOpen = (workId: string) => {
    const work = workData?.find((item) => item.id === workId);
    if (!work) {
      toast.error('원본 업무를 찾을 수 없습니다.');
      return;
    }
    setSelectedWork(work as Work);
    setWorkDetailOpen(true);
  };

  const handleWorkflowTaskOpen = (taskId: string) => {
    const task = workData
      ?.flatMap((work) => work.tasks ?? [])
      .find((item) => item.id === taskId);
    if (!task) {
      toast.error('원본 할 일을 찾을 수 없습니다.');
      return;
    }
    handleTaskDetail(task as Task);
  };

  // ── 주소 고쳐 쓰기 ─────────────────────────────────────────────────────────
  // 뿌리 `/tasks` = 구 주소 `?tab=…` 를 받아 페이지로 넘긴다. 다른 파라미터(`?task=` · `?work=` ·
  // `?pipeline=` · `?create=` · `?department=` · `?workflow=`)는 **실은 채** 넘긴다 — 알림·공지·
  // 진행 화면 링크가 아직 `/tasks?…` 를 만들 수 있고, 그 링크가 «아무 일도 안 일어남»이 되면 안 된다.
  if (!pageSegment || taskPagePath(activePage) !== `${TASKS_ROOT_PATH}/${pageSegment}`) {
    const rest = new URLSearchParams(searchParams);
    const legacyTab = rest.get('tab');
    rest.delete('tab');
    // '내 할 일'은 2026-09-21 에 별도 메뉴로 나갔다(`?tab=myTasks`, 구 `myWork`·`integrated`·`analytics`)
    if (!pageSegment && isMyTasksTab(legacyTab)) {
      const query = rest.toString();
      return <Navigate to={query ? `${MY_TASKS_PATH}?${query}` : MY_TASKS_PATH} replace />;
    }
    // 구 탭 값 → 보기. 업무 검색(`works`)과 페이지 시절 잠깐 제안된 `/tasks/search` 는 업무 목록의 전체 범위다
    const view = pageSegment
      ? (pageSegment === 'search' || pageSegment === 'works' ? 'works' : activePage)
      : viewFromLegacyTab(legacyTab, isAdmin);
    if (view === 'works') rest.set(WORK_LIST_SCOPE_PARAM, 'all');
    const query = rest.toString();
    const path = taskPagePath(view === 'works' ? 'myWorks' : view);
    return <Navigate to={query ? `${path}?${query}` : path} replace />;
  }

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        {/* 예산은 머리글이 따로다(학년도·범위·카드 올리기) — 업무 머리글의 부서·업무 필터가 맞지 않는다 */}
        {activeTab === 'budget' ? (
          <BudgetHub onGuide={() => setGuideOpen(true)} />
        ) : (
        <TaskHeader
          activeTab={activeTab}
          workListScope={scope}
          onWorkListScopeChange={handleScopeChange}
          myWorksFilter={myWorksFilter}
          onMyWorksFilterChange={setMyWorksFilter}
          workFilters={workFilters}
          onWorkFiltersChange={handleWorkFiltersChange}
          managers={managers}
          departmentOptions={departmentObjects}
          selectedDepartmentId={selectedDepartmentId}
          onDepartmentChange={handleDepartmentChange}
          onAnalyzeDocument={() => setDocumentAnalyzerOpen(true)}
          onSearch={() => setSearchOpen(true)}
          workToolbarRef={setWorkToolbar}
          workSummaryRef={setWorkSummary}
          onCreateWork={handleCreateWork}
          onRolloverWork={WORK_ROLLOVER_ENABLED ? () => setRolloverOpen(true) : undefined}
          onRefresh={handleRefresh}
          onGuide={() => setGuideOpen(true)}
          onClearWorkFilters={handleClearWorkFilters}
          totalWorks={totalWorks}
          totalTasks={totalTasks}
          completedTasks={completedTasks}
          loading={isLoading}
        />
        )}

        {/* 페이지 본문 — 보기(페이지 + 범위)마다 하나. 탭이 아니라 주소가 고른다 */}
        <div className="space-y-3 sm:space-y-4">
          {activeTab === 'myWorks' && (
            <IntegratedTaskView
              summaryContainer={workSummary}
              toolbarContainer={workToolbar}
              filter={myWorksFilter}
              onWorkEdit={handleWorkEdit}
              onTaskEdit={handleTaskEdit}
            />
          )}

          {activeTab === 'works' && (
            <WorkList
              toolbarContainer={workToolbar}
              filters={workFilters}
              onTaskDetail={handleTaskDetail}
              onTaskEdit={handleTaskEdit}
            />
          )}

          {/*
            학교 전체 지도는 **부서 선택기를 따르지 않는다** — 한 부서만 보는 순간
            "학교를 조망한다"는 이 페이지의 목적이 사라지고, 빈 자리 행(=아직 시스템 밖)이
            보여 주려던 이야기도 함께 없어진다. 그래서 `departmentScopedWorks` 가 아니라
            `workData` 전체를 넘긴다.
          */}
          {/* 관리자 전용 (2026-09-25 사용자 결정) — 메뉴·주소(resolveTaskPage)에 이어 세 번째 자물쇠 */}
          {activeTab === 'map' && isAdmin && <WorkPivotTab works={(workData ?? []) as Work[]} />}

          {/* 공문 판단함 — 관리자 전용 (2026-10-30). 메뉴·주소에 이어 세 번째 자물쇠, 표 RLS 가 네 번째 */}
          {activeTab === 'docs' && isAdmin && <OfficialDocInbox />}

          {activeTab === 'timeline' && <WorkTimelineTab department={selectedDepartment?.name ?? null} onEditWork={handleWorkEdit} />}

          {activeTab === 'workflow' && (
            <Suspense fallback={<Skeleton className="h-[736px] w-full rounded-2xl" />}>
              <TaskWorkflowTab
                works={departmentScopedWorks as Work[]}
                managers={managers}
                departments={departmentObjects}
                selectedDepartmentId={selectedDepartmentId === 'all' ? null : selectedDepartmentId}
                requestedWorkflowId={searchParams.get('workflow')}
                onDepartmentChange={(departmentId) =>
                  handleDepartmentChange(departmentId ?? 'all')
                }
                onDirtyChange={setWorkflowDirty}
                onOpenWork={handleWorkflowWorkOpen}
                onOpenTask={handleWorkflowTaskOpen}
              />
            </Suspense>
          )}
        </div>

        {/* Dialogs */}
        <WorkCreateDialog
          open={createWorkOpen}
          onOpenChange={(nextOpen) => {
            setCreateWorkOpen(nextOpen);
            if (!nextOpen) setDocumentTaskDraft(null);
          }}
          initialDraft={documentTaskDraft}
          onSuccess={(result) => void handleWorkCreated(result)}
          onStartFromReference={WORK_ROLLOVER_ENABLED ? () => { setCreateWorkOpen(false); setDocumentTaskDraft(null); setRolloverOpen(true); } : undefined}
        />

        {WORK_ROLLOVER_ENABLED && (
          <WorkFromReferenceDialog
            open={rolloverOpen}
            onOpenChange={setRolloverOpen}
            startedIn="task_management"
          />
        )}

        <DocumentIntelligenceDialog
          open={documentAnalyzerOpen}
          onOpenChange={setDocumentAnalyzerOpen}
          existingWorkItems={existingWorkItems}
          onDraftPrepared={handleDocumentDraftPrepared}
        />

        <WorkDetailDialog
          work={selectedWork}
          open={workDetailOpen}
          onOpenChange={(nextOpen) => {
            setWorkDetailOpen(nextOpen);
            if (!nextOpen) setSelectedWork(null);
          }}
          onEdit={(work) => {
            setWorkDetailOpen(false);
            setSelectedWork(null);
            handleWorkEdit(work);
          }}
        />

        <WorkPipelineDialog
          workId={pipelineLink?.workId ?? null}
          initialTaskId={pipelineLink?.taskId ?? null}
          open={pipelineOpen}
          onOpenChange={setPipelineOpen}
        />

        <WorkEditDialog
          work={editingWork}
          open={workEditOpen}
          onOpenChange={setWorkEditOpen}
        />

        <TaskDetailDialog
          task={selectedTask}
          open={taskDetailOpen}
          onOpenChange={setTaskDetailOpen}
          onEdit={handleTaskEdit}
        />

        <TaskEditDialog
          // 편집 대상의 업무를 먼저 본다 — 목록의 [수정]은 상세를 거치지 않아 selectedTask 가 다른 할 일일 수 있다
          workId={editingTask?.event_id || selectedTask?.event_id || ''}
          task={editingTask}
          open={taskEditOpen}
          onOpenChange={setTaskEditOpen}
        />

        <TaskSearchDialog
          open={searchOpen}
          onOpenChange={setSearchOpen}
        />
      </div>
      {/* 페이지(보기)마다 안내가 따로다 — 지금 보고 있는 화면의 것을 연다 */}
      <TaskGuideDialog tab={activeTab as TaskGuideTab} open={guideOpen} onOpenChange={setGuideOpen} />
    </Layout>
  );
}
