// ========================================
// 문서 생성 페이지 (/document-generation)
//
// HWPX 스펙 기반 문서 생성(document.spec_fill)의 메인 UI. 러너·이력·완성 문서 저장은
// 업무 흐름과 같은 컴포넌트(TaskActionRunnerDialog→SpecFillActionRunner)를 그대로 재사용한다.
//
// ── 목록은 spec_fill WORK 전부다 (2026-09-08 사용자 결정) ────────────────────
// 종전에는 이 메뉴에서 만든 것(config.origin='docgen')만 보여 줬다. 그런데 같은 종류의
// 방식이 **업무 관리에서도** 만들어진다(워크플로 캔버스 노드·업무 제출 양식) — 그것들이
// 여기 안 보이면 "문서 생성 방식을 모아 두는 자리"라는 말이 사실이 아니게 된다.
// 새 권한이 생기는 것이 아니다: 업무 쪽 WORK 는 원래 전 교직원이 읽고 공유 실행할 수
// 있었고(task_action_select_teachers), 여기서는 그것을 화면에 드러낼 뿐이다.
//
// ── 업무 연결은 업무 관리에서만 한다 (2026-09-08 사용자 결정) ────────────────
// 종전에는 카드의 [업무 연결] 버튼이 task_id 를 채웠다. 연결을 만드는 자리가 둘이면
// 어디서 끊는지가 흐려지는데, 실제로 그 경로의 연결성은 얕았다. 여기서는 연결 상태를
// **배지로 보여 주기만** 한다.
//
// - 공지 연결: [[docgen:id|라벨]] 토큰 → ?entry=<id> 딥링크로 러너 자동 오픈
//   (남의 생성 방식도 공유 실행 규칙(spec_fill)에 따라 내 문서를 만들 수 있다)
// ========================================

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  BookText,
  CalendarDays,
  Eye,
  FileOutput,
  FileText,
  Globe,
  Link2,
  Loader2,
  Lock,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  Users,
  HelpCircle,
  FileCheck2,
  Workflow,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import { Layout } from '@/components/layout/Layout';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DocGenGuideDialog } from './components/guide/DocGenGuideDialog';
import { DocGenHistoryDrawer } from './components/DocGenHistoryDrawer';
import { DocGenDocumentsDialog } from './components/DocGenDocumentsDialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { CardHeader } from '@/components/ui/card';
import { ImprovedCard } from '@/components/ui/improved-card';
import { HwpxPreviewDialog } from '@/components/rhwp/HwpxPreviewDialog';
import { getDefaultTemplate } from '@/features/task-workflow/services/taskActionService';
import {
  downloadSpecTemplateSource, getSpecTemplateById,
} from '@/features/task-workflow/services/specTemplateService';
import { TaskActionRunnerDialog } from '@/features/task-workflow/components/TaskActionPanel';
import type { TaskAction, TaskActionRunWithDetails } from '@/features/task-workflow/types';
import { useAuth } from '@/components/auth/AuthProvider';
import { DocGenCreateDialog } from './components/DocGenCreateDialog';
import { DocGenDeleteDialog } from './components/DocGenDeleteDialog';
import {
  buildDocGenRows,
  docGenActionSource,
  filterDocGenRows,
  isListedForOthers,
  type DocGenSegment,
  type DocGenActionRow,
} from './lib/docGenActionList';
import {
  useDeleteDocGenAction,
  useDocGenCreatorNames,
  useDocGenTaskTitles,
  useDocGenAction,
  useDocGenActions,
  useMyDocGenRuns,
  useSetDocGenActionVisibility,
} from './hooks/useDocGenActions';

/**
 * 헤더 세그먼트 — **전체의 분할**이다(항목 하나는 정확히 한 칸). 기준은
 * "어디서 만들어 어디서 관리하는가": 내 방식 / 업무 관리에서 만든 것 / 남이 공개한 것.
 */
const SEGMENTS = [
  { key: 'all', label: '전체', icon: FileOutput, title: '읽을 수 있는 문서 생성 방식 전부' },
  { key: 'mine', label: '내 방식', icon: FileText, title: '내가 문서 생성에서 만든 방식' },
  { key: 'task', label: '업무', icon: Workflow, title: '업무 관리에서 만들어 업무에 연결된 방식' },
  { key: 'shared', label: '공유받음', icon: Users, title: '다른 사람이 문서 생성에서 만들어 공개한 방식' },
] as const satisfies readonly { key: DocGenSegment; label: string; icon: unknown; title: string }[];

export default function DocumentGenerationPage() {
  const { user } = useAuth();
  const { data: actions = [], isLoading } = useDocGenActions();
  const deleteWork = useDeleteDocGenAction();
  const setVisibility = useSetDocGenActionVisibility();
  const [searchParams, setSearchParams] = useSearchParams();

  const [segment, setSegment] = useState<DocGenSegment>('all');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [editing, setEditing] = useState<TaskAction | null>(null);
  /** 삭제 확인 대상 — 행째로 든다(모달이 카드와 **같은 이름**을 말해야 한다) */
  const [deleting, setDeleting] = useState<DocGenActionRow | null>(null);
  /**
   * 양식 미리보기 대상(2026-09-02) — `{templateId, 표시명}`만 들고 있고 **원본은 다이얼로그가
   * 열릴 때 비로소 내려받는다**. 카드마다 미리 받으면 목록 한 화면에 HWPX 수십 개를
   * 내려받게 된다. 닫으면 상태를 비워 렌더러도 함께 언마운트된다.
   */
  const [preview, setPreview] = useState<{ id: string; name: string } | null>(null);
  /**
   * 맥락 라이브러리(2026-09-02) — 목록 페이지에서는 **양식 연결 없이** 관리만 한다
   * (`templateId` 미전달). 연결은 그 양식을 아는 스펙 검수 단계에서만 의미가 있다.
   */
  const navigate = useNavigate();
  const [activeWork, setActiveWork] = useState<TaskAction | null>(null);
  const [runnerOpen, setRunnerOpen] = useState(false);
  /**
   * 러너를 열 때 딱 한 번 넘기는 시작 조건들.
   * `pendingFile` = 방금 첨부한 한글 양식(스펙 검수부터) · `pendingDocId` = 이어 만들 완성 문서
   * · `pendingResume` = 서랍에서 고른 실행. 러너가 소비하면 비운다.
   */
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingDocId, setPendingDocId] = useState<string | null>(null);
  const [pendingResume, setPendingResume] = useState<TaskActionRunWithDetails | null>(null);
  /** 우측 이력 서랍 — 사용자 결정으로 **기본 열림** */
  const [historyOpen, setHistoryOpen] = useState(true);
  /** 완성 문서 모달(헤더) — 내 모든 문서를 한자리에서 본다 */
  const [docsOpen, setDocsOpen] = useState(false);
  /** 딥링크 항목이 내 목록에 없을 때(남의 생성 방식) 단건 조회 대상 */
  const [deepLinkId, setDeepLinkId] = useState<string | null>(null);
  const { data: deepLinkWork, isLoading: deepLinkLoading } = useDocGenAction(deepLinkId);

  // 업무에 연결된 방식의 배지 — 못 읽는 업무는 지도에서 빠지고 배지가 폴백 문구를 쓴다
  const linkedTaskIds = useMemo(
    () => [...new Set(actions.map((w) => w.task_id).filter((id): id is string => Boolean(id)))],
    [actions],
  );
  const { data: taskTitles } = useDocGenTaskTitles(linkedTaskIds);

  /**
   * 우측 서랍·완성 문서 모달의 범위 = **이 목록 전부**.
   *
   * 두 조회 모두 `created_by = 나` 로 좁히므로(listTaskActionRunsForActions·
   * listSpecDocumentsForWorks) 남의 실행·문서가 섞이지 않는다. 목록만 넓히고 여기를
   * 그대로 두면, 업무 쪽 방식으로 만든 **내 문서가 이력에서 조용히 빠진다**.
   */
  const allWorkIds = useMemo(() => actions.map((w) => w.id), [actions]);
  const { data: myRuns = [], isLoading: runsLoading } = useMyDocGenRuns(allWorkIds);

  // 남이 만든 항목의 '만든 사람' 이름(업무 쪽 방식 포함 — 누구의 자리인지가 곧 맥락이다)
  const creatorIds = useMemo(
    () => [...new Set(actions.filter((w) => w.created_by !== user?.id).map((w) => w.created_by))],
    [actions, user?.id],
  );
  const { data: creatorNames } = useDocGenCreatorNames(creatorIds);

  /**
   * 카드 행 — 분류·정렬·라벨은 순수 모듈이 갖는다(`lib/docGenActionList`).
   * 양식 이름은 `getDefaultTemplate` 을 넘겨 준다 — 같은 config 키를 두 곳에서 읽으면
   * 갈라지므로 접근자는 하나만 둔다.
   */
  const rows = useMemo(
    () =>
      buildDocGenRows(actions, {
        userId: user?.id,
        taskTitles,
        templateNameOf: (w) => getDefaultTemplate(w)?.name ?? null,
      }),
    [actions, user?.id, taskTitles],
  );
  const visibleRows = useMemo(
    () => filterDocGenRows(rows, { segment, search }),
    [rows, segment, search],
  );
  /** 서랍·완성 문서 모달이 카드와 **같은 이름**을 쓰도록 — 한 화면에서 이름이 갈리면 안 된다 */
  const workLabels = useMemo(
    () => new Map(rows.map((r) => [r.action.id, r.label])),
    [rows],
  );
  const segmentCounts = useMemo(() => {
    const counts: Record<string, number> = { all: rows.length, mine: 0, task: 0, shared: 0 };
    for (const row of rows) counts[row.segment] += 1;
    return counts;
  }, [rows]);

  const openRunner = (action: TaskAction, file?: File | null) => {
    setActiveWork(action);
    setPendingFile(file ?? null);
    setRunnerOpen(true);
  };

  // ?entry=<id> 딥링크(공지 링크 등) — 목록 로드 후 1회 소비하고 URL에서 제거
  useEffect(() => {
    const entryId = searchParams.get('entry');
    if (!entryId || isLoading) return;
    const found = actions.find((w) => w.id === entryId);
    if (found) openRunner(found);
    else setDeepLinkId(entryId); // 목록 밖 항목일 수 있다 — 단건 조회로 폴백
    searchParams.delete('entry');
    setSearchParams(searchParams, { replace: true });
  }, [isLoading, actions, searchParams, setSearchParams]);

  // 딥링크 단건 조회 결과 처리 (남의 생성 방식 — 공유 실행으로 열람)
  useEffect(() => {
    if (!deepLinkId || deepLinkLoading) return;
    if (deepLinkWork) openRunner(deepLinkWork);
    // RLS가 비공개 행을 숨기므로 "없음"과 "비공개"를 구분할 수 없다 — 두 가능성을 함께 안내
    else toast.error('문서 생성 방식을 열 수 없습니다. 삭제되었거나 만든 사람이 비공개로 전환했을 수 있습니다.');
    setDeepLinkId(null);
  }, [deepLinkId, deepLinkLoading, deepLinkWork]);

  /**
   * 공개 토글 — **무엇이 바뀌는지가 출신에 따라 다르다**(`isListedForOthers` 주석 참조).
   * docgen 방식은 서버 RLS 가 행 자체를 감추지만, 업무에서 만든 방식은 담당자가 써야 하므로
   * 서버 접근은 그대로이고 **이 목록에 세울지**만 바뀐다. 안내 문구가 그 차이를 말한다.
   */
  const handleToggleVisibility = async (action: TaskAction) => {
    const next = !isListedForOthers(action);
    const fromTask = docGenActionSource(action) === 'task';
    try {
      await setVisibility.mutateAsync({ actionId: action.id, isPublic: next });
      toast.success(
        next
          ? fromTask
            ? '공개로 전환했습니다 — 다른 교사·직원의 문서 생성 목록에 표시됩니다.'
            : '공개로 전환했습니다 — 공지 링크를 받은 교사·직원이 이 방식으로 문서를 만들 수 있습니다.'
          : fromTask
            ? '문서 생성 목록에서 감췄습니다 — 연결된 업무에서는 담당자가 종전대로 사용합니다.'
            : '비공개로 전환했습니다 — 이제 나만 열 수 있습니다(기존 공지 링크도 열리지 않습니다).',
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '공개 설정 변경에 실패했습니다.');
    }
  };

  /**
   * 삭제 — 확인 모달이 **무엇이 사라지는지 숫자로** 먼저 말한다(`DocGenDeleteDialog`).
   * 업무에 연결된 방식은 그 업무의 WORK 목록에서도 사라지므로, 카드 하나를 지우는 일이
   * 아니다. `window.confirm` 으로는 그 사실을 담을 수 없었다.
   */
  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteWork.mutateAsync(deleting.action.id);
      toast.success(
        deleting.action.task_id
          ? '생성 방식을 삭제했습니다 — 연결된 업무에서도 사라집니다.'
          : '생성 방식을 삭제했습니다.',
      );
      setDeleting(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '삭제에 실패했습니다.');
    }
  };

  return (
    <Layout>
      {/* 본문 | 이력 서랍 — 토글 버튼이 absolute 라 이 행이 기준 상자가 된다 */}
      <div className="relative flex items-start">
      <div className="min-w-0 flex-1">
      {/*
        폭은 `full` 이다 — 카드 그리드 + 우측 이력 서랍이라 가로를 쓸수록 정보가 더 들어온다.
        종전 `narrow`(mx-auto max-w-6xl)는 넓은 화면에서 좌우에 빈 여백을 만들어,
        서류함처럼 패널을 꽉 채우는 화면들과 나란히 놓으면 이 화면만 안으로 밀려 보였다.
      */}
      <PageContainer width="full">
        {/* 헤더 — 업무 관리(TaskHeader)와 같은 시각 언어: 유리 카드 + 세그먼트 스트립 +
            우측 액션 + 하단 검색 행. 타이틀 없음(사용자 결정) — 세그먼트가 헤더 겸용 */}
        <ImprovedCard className="shadow-sm border border-white/20 bg-white/70 backdrop-blur-md">
          <CardHeader className="pb-3 pt-3 px-3 sm:px-4 md:px-6">
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                {/* 어디서 만든 방식인가 — 건수를 함께 적어 "여기 없다"는 오해를 막는다 */}
                <div className="flex w-full items-center overflow-x-auto rounded-lg border border-slate-200/50 bg-slate-100/80 p-0.5 lg:w-auto">
                  {SEGMENTS.map(({ key, label, icon: Icon, title }) => (
                    <Button
                      key={key}
                      variant="ghost"
                      aria-pressed={segment === key}
                      size="sm"
                      title={title}
                      onClick={() => setSegment(key)}
                      className={`flex items-center gap-1.5 text-xs sm:text-sm h-7 px-2 sm:px-3 rounded-md transition-all ${
                        segment === key
                          ? 'bg-white text-blue-600 shadow-sm hover:bg-white hover:text-blue-600'
                          : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                      }`}
                    >
                      <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                      <span className="hidden sm:inline">{label}</span>
                      <span className="text-[10px] tabular-nums opacity-60">
                        {segmentCounts[key] ?? 0}
                      </span>
                    </Button>
                  ))}
                </div>

                {/* 액션 버튼들 */}
                <div className="flex w-full items-center justify-end gap-2 overflow-x-auto lg:w-auto lg:flex-shrink-0">
                  {/* 사용 방법 — 액션 묶음의 **맨 왼쪽**이 늘 이 자리다(사용자 규약).
                      처음 온 사람만 필요하므로 무게는 낮추되(ghost) 자리는 고정한다 */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setGuideOpen(true)}
                    title="사용 방법"
                    className="h-8 shrink-0 gap-1.5 px-2 text-xs text-slate-500 hover:text-slate-700"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                    <span className="hidden lg:inline">사용 방법</span>
                  </Button>
                  {/* 완성 문서 — **내가 만든 문서 전부**. 어느 생성 방식으로 만들었는지는
                      대개 기억나지 않으므로 방식별로 흩지 않고 한자리에 모은다 */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDocsOpen(true)}
                    title="지금까지 만들어 저장한 문서 전부"
                    className="bg-white/50 border-slate-200 hover:bg-white hover:border-slate-300 h-8 px-2 sm:px-3 flex items-center gap-1.5 text-xs sm:text-sm transition-all rounded-lg"
                  >
                    <FileCheck2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">완성 문서</span>
                  </Button>
                  {/* 맥락 관리 — 2026-11-06 부터 따로 된 기능(/contexts). 여기서는 그 «문서 맥락» 보기로 보낸다.
                      이번 생성에 쓸 맥락 고르기·양식 연결은 그대로 이 화면(계획 검토·스펙 검수) 안에서 한다 */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate('/contexts?tab=library')}
                    title="AI 초안 작성에 함께 넘길 배경 설명 — 맥락 관리 메뉴에서 만들고 고칩니다"
                    className="bg-white/50 border-slate-200 hover:bg-white hover:border-slate-300 h-8 px-2 sm:px-3 flex items-center gap-1.5 text-xs sm:text-sm transition-all rounded-lg"
                  >
                    <BookText className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">맥락 관리</span>
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setCreateOpen(true)}
                    className="h-8 px-2 sm:px-3 flex items-center gap-1.5 text-xs sm:text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">새 생성 방식</span>
                  </Button>
                </div>
              </div>

              {/* 검색 행 */}
              <div className="mt-1 border-t border-slate-100 pt-3">
                <div className="relative min-w-0">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="생성 방식 이름·설명 검색"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-9 border-slate-200 bg-white pl-9 text-xs transition-all focus:border-blue-300 focus:ring-blue-100 sm:text-sm"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
        </ImprovedCard>

        {/* 목록 */}
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            불러오는 중
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-14 text-center">
            <FileOutput className="mx-auto h-8 w-8 text-slate-300" />
            {rows.length === 0 ? (
              <>
                <p className="mt-3 text-sm font-medium text-slate-600">
                  아직 문서 생성 방식이 없습니다
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  '새 생성 방식'으로 HWPX 양식을 골라 시작하세요. 업무 관리에서 만들어진
                  방식도 여기에 함께 표시됩니다.
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                조건에 맞는 생성 방식이 없습니다 — 필터·검색어를 확인하세요.
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleRows.map((row) => {
              const { action, label, canManage, taskTitle } = row;
              const template = getDefaultTemplate(action);
              const fromTask = row.source === 'task';
              const byOther = action.created_by !== user?.id;
              // 공개 토글의 현재 상태 — 출신에 따라 기본값이 반대다(isListedForOthers 참조)
              const listed = isListedForOthers(action);
              return (
                <div
                  key={action.id}
                  className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="min-w-0 break-words text-sm font-semibold text-slate-800">
                      {label}
                    </h2>
                    {/*
                      관리 버튼은 **이 메뉴에서 만든 내 방식**에만 붙는다. 업무에서 만들어진
                      행은 소유자여도 여기서 지우지 않는다 — 그 행을 지우면 업무의 WORK
                      노드가 함께 사라지고, 지우는 자리는 한 곳이어야 한다.
                    */}
                    {canManage && (
                    <div className="flex shrink-0 items-center gap-0.5">
                      {/* 공개 토글 — 아이콘이 곧 현재 상태 표시(Globe=공개, Lock=비공개) */}
                      <Button
                        size="icon"
                        variant="ghost"
                        className={`h-7 w-7 ${
                          listed
                            ? 'text-sky-500 hover:text-slate-500'
                            : 'text-slate-400 hover:text-sky-600'
                        }`}
                        title={
                          fromTask
                            ? listed
                              ? '다른 교사의 문서 생성 목록에 표시 중 — 클릭하면 감춥니다(연결된 업무에서는 그대로 쓰입니다)'
                              : '문서 생성 목록에서 감춰짐 — 클릭하면 표시합니다(연결된 업무에서는 그대로 쓰입니다)'
                            : listed
                              ? '공개 중 — 클릭하면 비공개로 전환(나만 열 수 있음)'
                              : '비공개 — 클릭하면 공개로 전환(공지 링크로 다른 사람이 사용 가능)'
                        }
                        disabled={setVisibility.isPending}
                        onClick={() => void handleToggleVisibility(action)}
                      >
                        {listed ? (
                          <Globe className="h-3.5 w-3.5" />
                        ) : (
                          <Lock className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-slate-400 hover:text-blue-600"
                        title="이름·설명 수정"
                        onClick={() => setEditing(action)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-slate-400 hover:text-rose-600"
                        title={fromTask
                          ? '삭제 — 연결된 업무의 WORK 목록에서도 사라집니다'
                          : '삭제 (실행 이력·결과 파일 포함)'}
                        onClick={() => setDeleting(row)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    )}
                  </div>

                  {/*
                    업무에서 만들어진 방식의 출신 표시. 캔버스는 노드에 이름을 묻지 않아
                    제목이 유형 이름('HWPX 스펙 기반 문서 생성')뿐인 경우가 많고, 그때는
                    위 제목이 이미 업무 이름이다 — 같은 말을 두 번 적지 않는다.
                  */}
                  {fromTask && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-violet-600">
                      <Workflow className="h-3 w-3 shrink-0" />
                      <span className="truncate" title={taskTitle ?? undefined}>
                        {taskTitle && taskTitle !== label
                          ? `업무 관리 · ${taskTitle}`
                          : '업무 관리에서 만든 방식'}
                      </span>
                    </p>
                  )}

                  {action.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">{action.description}</p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {byOther && (
                      <Badge
                        variant="outline"
                        className="max-w-full gap-1 border-sky-200 bg-sky-50/60 text-[10px] text-sky-700"
                      >
                        <Users className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          {creatorNames?.get(action.created_by) ?? '다른 사용자'}
                        </span>
                      </Badge>
                    )}
                    {template && (
                      // 양식 배지 자체가 미리보기 버튼이다 — 카드에 행·버튼을 새로 만들지
                      // 않으면서 "이 양식이 무엇인지"를 누를 수 있는 자리에 둔다.
                      <button
                        type="button"
                        title={`${template.name ?? '기본 양식'} — 눌러서 양식 미리보기`}
                        onClick={() => setPreview({
                          id: template.id,
                          name: template.name ?? '기본 양식',
                        })}
                        className="max-w-full"
                      >
                        <Badge
                          variant="outline"
                          className="max-w-full gap-1 border-indigo-200 bg-indigo-50/60 text-[10px] text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-100"
                        >
                          <FileText className="h-3 w-3 shrink-0" />
                          <span className="truncate">{template.name ?? '기본 양식'}</span>
                          <Eye className="h-3 w-3 shrink-0 opacity-60" />
                        </Badge>
                      </button>
                    )}
                    {/* 이 메뉴에서 만들었지만 업무에도 걸려 있는 예전 항목 — 연결·해제는
                        업무 관리가 맡으므로 여기서는 사실만 알린다 */}
                    {!fromTask && action.task_id && (
                      <Badge
                        variant="outline"
                        className="max-w-full gap-1 border-emerald-200 bg-emerald-50/60 text-[10px] text-emerald-700"
                      >
                        <Link2 className="h-3 w-3 shrink-0" />
                        <span className="truncate" title={taskTitle ?? undefined}>
                          {taskTitle ?? '연결된 업무'}
                        </span>
                      </Badge>
                    )}
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                    <span className="flex items-center gap-1 text-[10px] text-slate-400">
                      <CalendarDays className="h-3 w-3" />
                      {new Date(action.created_at).toLocaleDateString('ko-KR')}
                    </span>
                    <Button
                      size="sm"
                      className="h-7 bg-blue-600 px-2.5 text-xs hover:bg-blue-700"
                      onClick={() => openRunner(action)}
                    >
                      <Play className="mr-1 h-3 w-3" />
                      {canManage ? '문서 만들기' : '이 방식으로 문서 만들기'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </PageContainer>
      </div>

      <DocGenHistoryDrawer
        open={historyOpen}
        onToggle={() => setHistoryOpen((v) => !v)}
        runs={myRuns}
        isLoading={runsLoading}
        actions={actions}
        workLabels={workLabels}
        onResume={(actionId, run) => {
          const w = actions.find((x) => x.id === actionId);
          if (!w) { toast.error('생성 방식을 찾지 못했습니다.'); return; }
          setActiveWork(w);
          setPendingResume(run);
          setRunnerOpen(true);
        }}
      />
      </div>

      {/* 맥락 라이브러리 — 여기서는 만들고 고치는 관리 용도(연결은 스펙 검수에서) */}

      {/* 양식 미리보기 — **열 때만** 원본을 내려받는다(목록 렌더에는 아무 비용도 없다).
          공용 `HwpxPreviewDialog`(SpecOverlayView, spec=null=오버레이 없는 순수 렌더) 재사용 */}
      {preview && (
        <HwpxPreviewDialog
          open={!!preview}
          onOpenChange={(o) => !o && setPreview(null)}
          title={preview.name}
          loadSource={async () => downloadSpecTemplateSource(await getSpecTemplateById(preview.id))}
        />
      )}

      {/* 생성/수정 모달 — 만들자마자 러너로 이어간다 */}
      <DocGenGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />

      <DocGenCreateDialog
        open={createOpen || Boolean(editing)}
        onOpenChange={(o) => {
          if (!o) {
            setCreateOpen(false);
            setEditing(null);
          }
        }}
        editing={editing}
        onCreated={openRunner}
      />

      <DocGenDeleteDialog
        action={deleting?.action ?? null}
        label={deleting?.label ?? ''}
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        onConfirm={handleDelete}
        isDeleting={deleteWork.isPending}
      />

      {/*
        러너 — 업무 흐름과 같은 다이얼로그. 단 문서 생성 메뉴는 **계획 검토부터** 열고
        이력 서랍은 페이지 우측이 맡는다(`hideHistory`) — 같은 목록이 두 곳에 있으면 안 된다.

        `docGenMode` 는 **이 화면에서 열었다**는 사실이지 그 행의 출신이 아니다. 종전에는
        러너가 `config.origin==='docgen'` 으로 스스로 판단했는데, 목록에 업무 쪽 방식이
        함께 서면서 같은 목록의 카드 절반만 양식 단계에서 열리게 된다 — 사용자가 볼 수
        없는 이유로 흐름이 갈린다. (같은 실수를 모델 선택에서 이미 한 번 겪었다:
        `specFillService.ts` 의 origin 분기 제거 주석 참조.)
      */}
      {activeWork && (
        <TaskActionRunnerDialog
          action={activeWork}
          taskTitle={workLabels.get(activeWork.id) ?? activeWork.title}
          workflowId={null}
          open={runnerOpen}
          onOpenChange={(o) => {
            setRunnerOpen(o);
            if (!o) {
              setActiveWork(null);
              setPendingFile(null);
              setPendingDocId(null);
              setPendingResume(null);
            }
          }}
          initialFile={pendingFile}
          onInitialFileConsumed={() => setPendingFile(null)}
          initialDocumentId={pendingDocId}
          onInitialDocumentConsumed={() => setPendingDocId(null)}
          initialResumeRun={pendingResume}
          onInitialResumeConsumed={() => setPendingResume(null)}
          docGenMode
          hideHistory
        />

      )}

      {/* 완성 문서 — 러너의 양식 단계를 건너뛴 대신 생긴 자리(헤더에서 연다).
          범위는 목록 전체다: 조회가 `created_by = 나` 로 좁히므로 남의 문서는 오지 않는다 */}
      <DocGenDocumentsDialog
        actions={actions}
        workLabels={workLabels}
        open={docsOpen}
        onOpenChange={setDocsOpen}
        onOpen={(w, docId) => {
          setActiveWork(w);
          setPendingDocId(docId);
          setRunnerOpen(true);
        }}
      />
    </Layout>
  );
}
