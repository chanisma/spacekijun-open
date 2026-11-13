// 임베드형(embed) 실행 러너: 기능의 "실제 등록 모달"을 워크플로 러너 안에서 그대로 열고,
// 등록 성공 시 RUN(needs_review)으로 완료를 기록한다(모의고사 마킹 러너와 같은 모델).
// 각 호스트는 기능의 공개 모달·훅을 재사용만 한다(기능 로직 복제 금지) — NoticeLinkPicker의
// ScheduleCreateDialog 재사용 패턴을 따르며, 페치 비용이 있는 훅은 모달이 열릴 때만 마운트한다.
import { lazy, Suspense, useState, type ComponentType, type LazyExoticComponent } from 'react';
import { CalendarSync, ClipboardCheck, ExternalLink, Loader2, PencilLine } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/lib/toast';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ScheduleCreateDialog } from '@/components/schedule/ScheduleCreateDialog';
import { ClassSwapDialog } from '@/components/timetable/ClassSwapDialog';
import { useSchedule } from '@/hooks/useSchedule';
import { useCurrentResourceId } from '@/hooks/useCurrentResourceId';
import { useTimetableData, type TimetableEntry } from '@/hooks/useTimetableData';
import { NoticeFormDialog } from '@/features/notice-board/components/NoticeFormDialog';
import { IssueCreateDialog } from '@/features/issue-register/components/IssueCreateDialog';
import type { DocType } from '@/features/issue-register/types';
import { AdminDialog as EvalogAdminDialog } from '@/features/evalog/components/admin/AdminDialog';
import type {
  MockMarkingExecutionInput,
  MockMarkingUploadResult,
} from '@/features/evalog/components/admin/MockMarkingImportTab';
import { useAcademicTerm } from '@/hooks/useAcademicTerm';
import { useFinalizeTaskActionRun, useStartTaskActionRun } from '../hooks/useTaskActions';
import { getTaskActionDefinition } from '../actionRegistry';
import type { TaskAction, TaskActionArtifactInput, TaskActionCheckInput } from '../types';

const VOLUNTEER_TYPES: DocType[] = ['volunteer_personal', 'volunteer_class', 'volunteer_club'];
const GAJEONG_TYPES: DocType[] = ['gajeong'];

// 학사력 미설정 시에만 쓰는 달력 근사(3월 학년도 시작, 3~7월=1학기).
// 정본은 관리자가 지정한 학사력이다 — 학기 전환 시점이 학교마다 달라 달력으로는 맞출 수 없다.
const NOW = new Date();
const FALLBACK_ACADEMIC_YEAR = NOW.getMonth() + 1 >= 3 ? NOW.getFullYear() : NOW.getFullYear() - 1;
const FALLBACK_SEMESTER = NOW.getMonth() + 1 >= 3 && NOW.getMonth() + 1 <= 7 ? 1 : 2;

// ── 신규 호스트 대상 컴포넌트는 렌더 시점 lazy 로드(러너 청크 비대 방지) ──
const LazyCurriculumUpload = lazy(() => import('@/features/curriculum-management/components/CurriculumXlsxUploadDialog').then((m) => ({ default: m.CurriculumXlsxUploadDialog })));
const LazyCourseOfferingUpload = lazy(() => import('@/features/course-offering/components/CourseOfferingXlsxUploadDialog').then((m) => ({ default: m.CourseOfferingXlsxUploadDialog })));
const LazyEnrollmentUpload = lazy(() => import('@/features/student-enrollment/components/StudentEnrollmentXlsxUploadDialog').then((m) => ({ default: m.StudentEnrollmentXlsxUploadDialog })));
const LazyStudentTimetableUpload = lazy(() => import('@/features/student-timetable/components/StudentTimetableUploadDialog').then((m) => ({ default: m.StudentTimetableUploadDialog })));
const LazyTeacherTimetableUpload = lazy(() => import('@/features/teacher-timetable/components/TeacherTimetableUploadDialog').then((m) => ({ default: m.TeacherTimetableUploadDialog })));
const LazyMockExamImportTab = lazy(() => import('@/features/evalog/components/admin/MockExamImportTab').then((m) => ({ default: m.MockExamImportTab })));
const LazyMockMarkingImportTab = lazy(() => import('@/features/evalog/components/admin/MockMarkingImportTab').then((m) => ({ default: m.MockMarkingImportTab })));
const LazyGradeAnalysisImportTab = lazy(() => import('@/features/evalearn/components/admin/GradeAnalysisImportTab').then((m) => ({ default: m.GradeAnalysisImportTab })));
const LazyAccountExcelImport = lazy(() => import('@/components/admin/AccountExcelImport').then((m) => ({ default: m.AccountExcelImport })));
const LazyResourceCsvImport = lazy(() => import('@/components/admin/ResourceCsvImport').then((m) => ({ default: m.ResourceCsvImport })));
const LazyTimetableBulkImport = lazy(() => import('@/components/admin/TimetableBulkImport').then((m) => ({ default: m.TimetableBulkImport })));
const LazyRegisterCertificateDialog = lazy(() => import('@/features/training-certificate/components/RegisterCertificateDialog').then((m) => ({ default: m.RegisterCertificateDialog })));
const LazyDocumentUpload = lazy(() => import('@/components/documents/AddDocumentDialog').then((m) => ({ default: m.AddDocumentDialog })));
const LazyWorkCreateDialog = lazy(() => import('@/components/tasks/WorkCreateDialog').then((m) => ({ default: m.WorkCreateDialog })));

// 관리형(지속 관리 화면) — 완료 신호가 없어 사람이 직접 완료를 기록한다
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MANAGED_HOSTS: Partial<Record<string, { title: string; component: LazyExoticComponent<ComponentType<any>> }>> = {
  'link.admin_users': { title: '사용자 관리', component: lazy(() => import('@/components/admin/UserManagement').then((m) => ({ default: m.UserManagement }))) },
  'link.admin_teachers': { title: '교사 관리', component: lazy(() => import('@/components/admin/TeacherManagement').then((m) => ({ default: m.TeacherManagement }))) },
  'link.admin_resources': { title: '리소스 관리', component: lazy(() => import('@/components/admin/ResourceManagement').then((m) => ({ default: m.ResourceManagement }))) },
  'link.admin_accounts': { title: '계정 관리', component: lazy(() => import('@/components/admin/AccountManagement').then((m) => ({ default: m.AccountManagement }))) },
  'link.admin_sections': { title: '분반(섹션) 관리', component: lazy(() => import('@/components/admin/SectionManagement').then((m) => ({ default: m.SectionManagement }))) },
  'link.admin_students': { title: '학생 학적 관리', component: lazy(() => import('@/components/admin/StudentManagement').then((m) => ({ default: m.StudentManagement }))) },
  'link.admin_departments': { title: '부서 관리', component: lazy(() => import('@/components/admin/DepartmentManagement').then((m) => ({ default: m.DepartmentManagement }))) },
  'link.admin_tags': { title: '태그 관리', component: lazy(() => import('@/components/admin/TagManagement').then((m) => ({ default: m.TagManagement }))) },
};

interface HostProps {
  onClose: () => void;
  /** 등록 성공 시 RUN 기록(요약 페이로드 포함) */
  onDone: (summary: Record<string, unknown>) => void;
}

/** 일정 추가 — 스케줄 기능의 ScheduleCreateDialog + useSchedule.createWork 재사용 */
function ScheduleCreateHost({ onClose, onDone }: HostProps) {
  const { createEvent } = useSchedule({ loadEvents: false });
  const queryClient = useQueryClient();
  const handleCreate = async (workData: { title: string; kind: string; [key: string]: unknown }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await createEvent(workData as any);
    if (result) {
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
      onDone({
        title: workData.title,
        kind: workData.kind,
        meetingId: typeof result === 'string' ? result : null,
      });
    }
    return result;
  };
  return (
    <ScheduleCreateDialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      onCreateEvent={handleCreate}
      selectedDate={new Date()}
    />
  );
}

/** 공지사항 작성 — notice-board의 작성 모달 재사용 */
function NoticeCreateHost({ onClose, onDone }: HostProps) {
  return (
    <NoticeFormDialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      editing={null}
      onCreated={(notice) => onDone({ noticeId: notice.id, title: notice.title, department: notice.department })}
    />
  );
}

/** 발급(봉사/가정통신문) — issue-register의 발급 모달 재사용 */
function IssueCreateHost({ variant, onClose, onDone }: HostProps & { variant: 'volunteer' | 'gajeong' }) {
  return (
    <IssueCreateDialog
      open
      docType={variant === 'volunteer' ? 'volunteer_class' : 'gajeong'}
      docTypesForList={variant === 'volunteer' ? VOLUNTEER_TYPES : GAJEONG_TYPES}
      allowVolunteerTypeChoice={variant === 'volunteer'}
      onClose={onClose}
      onCreated={() => onDone({ variant })}
    />
  );
}

/** NEIS 학사일정 가져오기 — useSchedule.importNeisSchedule 재사용(현재 학년도 전체 교체) */
function NeisImportHost({ onClose, onDone }: HostProps) {
  const { importNeisSchedule } = useSchedule({ loadEvents: false });
  const [running, setRunning] = useState(false);
  const run = async () => {
    setRunning(true);
    try {
      const imported = await importNeisSchedule();
      if (imported > 0) {
        onDone({ importedCount: imported, schoolYear: new Date().getFullYear() });
        onClose();
      }
    } finally {
      setRunning(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !running) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarSync className="h-4 w-4 text-blue-600" />
            NEIS 학사일정 가져오기
          </DialogTitle>
          <DialogDescription>
            나이스에서 현재 학년도 학사일정을 불러와 스케줄에 반영합니다. 기존 NEIS 일정은 최신 데이터로 교체됩니다.
          </DialogDescription>
        </DialogHeader>
        <Button className="bg-blue-600 hover:bg-blue-700" disabled={running} onClick={() => void run()}>
          {running ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CalendarSync className="mr-1.5 h-4 w-4" />}
          {running ? '가져오는 중…' : '학사일정 가져오기 실행'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 수업 교체 — 내 시간표에서 교체할 수업 칸을 고른 뒤 ClassSwapDialog 재사용.
 *
 * 2026-08-14: 구 `TimetableChangeDialog` 를 쓰고 있었는데 그 모달은 신청을 **DB 에 저장하지
 * 않고** 성공 토스트만 띄웠다(후보 조회도 `resource.meta.section` 을 배열로 가정해 항상 0건).
 * 실제로 `class_swap` 행을 만드는 경로는 ClassSwapDialog 하나뿐이다.
 */
const WEEKDAY_LABELS = ['', '월', '화', '수', '목', '금', '토', '일'];

function TimetableChangeHost({ onClose, onDone }: HostProps) {
  // 이 훅은 `{ data }` 를 준다(`resourceId` 가 아니다) — 구 코드는 undefined 를 넘겨
  // useTimetableData 내부 폴백에 우연히 기대고 있었다.
  const { data: resourceId } = useCurrentResourceId();
  const { data: entries = [], isLoading } = useTimetableData(resourceId ?? undefined, new Date());
  const [entry, setEntry] = useState<TimetableEntry | null>(null);
  const lessons = entries
    .filter((item) => item.type === 'pattern')
    .sort((a, b) => (a.weekday - b.weekday) || (a.period - b.period));

  if (entry) {
    return (
      <ClassSwapDialog
        open
        onOpenChange={(open) => { if (!open) setEntry(null); }}
        selectedEntry={entry}
        currentTeacherEntries={entries}
        onRequested={() => {
          onDone({
            subject: entry.subject ?? entry.section_name ?? '',
            weekday: entry.weekday,
            period: entry.period,
          });
          onClose();
        }}
      />
    );
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>수업 교체 — 교체할 수업 선택</DialogTitle>
          <DialogDescription>이번 주 내 시간표에서 교체를 요청할 수업을 선택하세요.</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-sm text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />시간표 불러오는 중
          </div>
        ) : lessons.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">이번 주 내 수업이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {lessons.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-blue-50/60"
                  onClick={() => setEntry(item)}
                >
                  <span className="w-14 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-center text-[11px] font-semibold text-slate-600">
                    {WEEKDAY_LABELS[item.weekday] ?? item.weekday}요일 {item.period}교시
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-700">
                    {item.subject ?? item.section_name ?? '수업'}
                  </span>
                  {item.room_name && <span className="shrink-0 text-[10px] text-slate-400">{item.room_name}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** 생기부·성적 데이터 등록 — evalog 관리자 다이얼로그(실사용 업로드 탭 포함) 재사용.
 *  업로드가 성공할 때마다 RUN을 기록한다(다이얼로그는 계속 열려 추가 작업 가능). */
function EvalogImportHost({ onClose, onDone }: HostProps) {
  return (
    <EvalogAdminDialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      onDataUploaded={(summary) => onDone({
        basicCount: summary.basicCount,
        activityCount: summary.activityCount,
      })}
    />
  );
}

/** 연수 이수증 등록 — 현재 사용자 리소스로 등록 모달 재사용 */
function TrainingCertificateHost({ onClose, onDone }: HostProps) {
  // @/hooks/useCurrentResourceId 는 { data } 로 돌려준다
  // ({ resourceId } 는 @/services/hooks/useUnifiedAuth 쪽 시그니처다)
  const { data: resourceId } = useCurrentResourceId();
  return (
    <LazyRegisterCertificateDialog
      open
      onOpenChange={(open: boolean) => { if (!open) onClose(); }}
      trainingType={null}
      resourceId={resourceId ?? null}
      onRegistered={() => onDone({ kind: 'training_certificate' })}
    />
  );
}

// ── 모의고사 마킹: 자체 실행 콜백(start/complete/error)로 RUN 전 주기 기록(체크·산출물 포함) ──
function buildMockMarkingChecks(result: MockMarkingUploadResult): TaskActionCheckInput[] {
  const changed = result.inserted + result.updated;
  return [
    {
      key: 'student_matching', label: '학생 매칭',
      status: result.unmatched > 0 ? 'warn' : 'pass',
      message: `매칭 ${changed}건 · 미매칭 ${result.unmatched}건`,
      evidence: { inserted: result.inserted, updated: result.updated, unmatched: result.unmatched },
    },
    {
      key: 'group_processing', label: '그룹 처리',
      status: 'pass',
      message: `${result.perGroup.length}개 학년·월 그룹 처리`,
      evidence: { groupCount: result.perGroup.length },
    },
  ];
}

function buildMockMarkingArtifacts(result: MockMarkingUploadResult): TaskActionArtifactInput[] {
  return result.perGroup.map((group, index) => ({
    key: `mock-marking-group-${index + 1}`,
    type: 'record_set',
    label: `${group.label} 모의고사 마킹 데이터`,
    locator: { feature: 'evalearn', group: group.label },
    metadata: { inserted: group.inserted, updated: group.updated },
  }));
}

function MockMarkingHost({ action, workflowId, onClose }: { action: TaskAction; workflowId: string | null; onClose: () => void }) {
  const startRun = useStartTaskActionRun();
  const finalizeRun = useFinalizeTaskActionRun(action.id);
  const [runId, setRunId] = useState<string | null>(null);

  const handleStart = async (input: MockMarkingExecutionInput) => {
    const run = await startRun.mutateAsync({
      actionId: action.id, workflowId, inputSnapshot: { groups: input.groups },
    });
    setRunId(run.id);
  };
  const handleComplete = async (result: MockMarkingUploadResult) => {
    if (!runId) throw new Error('작업 실행 기록을 찾을 수 없습니다.');
    await finalizeRun.mutateAsync({
      runId, status: 'needs_review', outputSummary: { ...result },
      checks: buildMockMarkingChecks(result), artifacts: buildMockMarkingArtifacts(result),
    });
    setRunId(null);
    toast.success('실행 결과가 저장되었습니다 — 이력에서 검수하세요.');
  };
  const handleError = async (error: Error, partial: MockMarkingUploadResult) => {
    if (!runId) return;
    await finalizeRun.mutateAsync({
      runId, status: 'failed', outputSummary: { ...partial }, errorSummary: error.message,
      checks: partial.perGroup.length > 0 ? buildMockMarkingChecks(partial) : [],
      artifacts: partial.perGroup.length > 0 ? buildMockMarkingArtifacts(partial) : [],
    });
    setRunId(null);
  };

  return (
    <TabDialogHost title="모의고사 마킹 및 정오 데이터 등록" onClose={onClose}>
      <LazyMockMarkingImportTab
        onExecutionStart={handleStart}
        onExecutionComplete={handleComplete}
        onExecutionError={handleError}
      />
    </TabDialogHost>
  );
}

/** 탭형 컴포넌트(자체 다이얼로그 아님)를 다이얼로그로 감싸는 공용 셸 */
function TabDialogHost({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>실제 기능과 동일한 화면입니다 — 업로드 성공 시 자동으로 검수 대기(RUN)가 기록됩니다.</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** 관리형(지속 관리 화면) 공용 호스트 — 화면을 그대로 열고, 완료는 사람이 메모와 함께 기록 */
function ManagedHost({ workType, onClose, onDone }: HostProps & { workType: string }) {
  const config = MANAGED_HOSTS[workType];
  const [memo, setMemo] = useState('');
  if (!config) return null;
  const Component = config.component;
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex h-[92vh] max-w-[92vw] flex-col overflow-hidden p-4">
        <DialogTitle className="text-sm">{config.title} — 처리 후 아래에서 완료를 기록하세요</DialogTitle>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 p-3">
          <Component />
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-2">
          <Textarea
            rows={1}
            className="min-h-9 flex-1 text-xs"
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            placeholder="처리한 내용 메모(선택)"
          />
          <Button size="sm" onClick={() => { onDone({ managed: config.title, memo: memo.trim().slice(0, 500) }); onClose(); }}>
            <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" />
            처리 완료 기록
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function EmbedActionRunner({ action, workflowId }: { action: TaskAction; workflowId: string | null }) {
  const definition = getTaskActionDefinition(action.action_type);
  // 업로드 모달의 기본 학년도·학기는 학사력을 따른다(미설정이면 달력 근사로 폴백).
  const { data: academicTerm } = useAcademicTerm();
  const ACADEMIC_YEAR = academicTerm?.year ?? FALLBACK_ACADEMIC_YEAR;
  const SEMESTER = academicTerm?.semester ?? FALLBACK_SEMESTER;
  const startRun = useStartTaskActionRun();
  const finalizeRun = useFinalizeTaskActionRun(action.id);
  const [modalOpen, setModalOpen] = useState(false);
  const [recording, setRecording] = useState(false);

  // 등록 모달의 성공 콜백 → RUN(needs_review) 기록. 취소는 아무 기록도 남기지 않는다.
  const recordCompletion = async (summary: Record<string, unknown>) => {
    setRecording(true);
    let runId: string | null = null;
    try {
      const run = await startRun.mutateAsync({
        actionId: action.id,
        workflowId,
        inputSnapshot: { mode: 'embed', workType: action.action_type },
      });
      runId = run.id;
      await finalizeRun.mutateAsync({
        runId,
        status: 'needs_review',
        outputSummary: { mode: 'embed', ...summary },
        checks: [],
        artifacts: [],
      });
      toast.success('등록 완료를 기록했습니다 — 오른쪽 이력에서 검수하세요.');
    } catch (e) {
      const message = e instanceof Error ? e.message : '완료 기록에 실패했습니다.';
      if (runId) {
        try {
          await finalizeRun.mutateAsync({ runId, status: 'failed', errorSummary: message.slice(0, 500) });
        } catch { /* 이중 실패는 이력에 남김 */ }
      }
      toast.error(message);
    } finally {
      setRecording(false);
    }
  };

  const handleDone = (summary: Record<string, unknown>) => {
    void recordCompletion(summary);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-blue-50/40 p-4">
        <p className="text-sm font-semibold text-slate-800">{definition?.title ?? action.title}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{definition?.description ?? action.description}</p>
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700" disabled={recording} onClick={() => setModalOpen(true)}>
            {recording ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <PencilLine className="mr-1.5 h-3.5 w-3.5" />}
            등록 모달 열기
          </Button>
          {definition?.route && (
            <Button size="sm" variant="ghost" className="text-slate-500" onClick={() => window.open(definition.route!, '_blank')}>
              기능 화면
              <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      <p className="text-[11px] leading-4 text-slate-400">
        등록 모달에서 실제 기능과 동일하게 처리됩니다. 등록이 성공하면 자동으로 검수 대기(RUN)로 기록되고, 취소하면 아무 기록도 남지 않습니다.
      </p>

      {modalOpen && action.action_type === 'link.schedule_add' && (
        <ScheduleCreateHost onClose={() => setModalOpen(false)} onDone={handleDone} />
      )}
      {modalOpen && action.action_type === 'link.notice_write' && (
        <NoticeCreateHost onClose={() => setModalOpen(false)} onDone={handleDone} />
      )}
      {modalOpen && action.action_type === 'link.volunteer_issue' && (
        <IssueCreateHost variant="volunteer" onClose={() => setModalOpen(false)} onDone={handleDone} />
      )}
      {modalOpen && action.action_type === 'link.gajeong_issue' && (
        <IssueCreateHost variant="gajeong" onClose={() => setModalOpen(false)} onDone={handleDone} />
      )}
      {modalOpen && action.action_type === 'link.neis_schedule_import' && (
        <NeisImportHost onClose={() => setModalOpen(false)} onDone={handleDone} />
      )}
      {modalOpen && action.action_type === 'link.timetable_change' && (
        <TimetableChangeHost onClose={() => setModalOpen(false)} onDone={handleDone} />
      )}
      {modalOpen && action.action_type === 'link.evalog_import' && (
        <EvalogImportHost onClose={() => setModalOpen(false)} onDone={handleDone} />
      )}

      {modalOpen && (
        <Suspense fallback={null}>
          {action.action_type === 'link.curriculum_upload' && (
            <LazyCurriculumUpload open onOpenChange={(o: boolean) => { if (!o) setModalOpen(false); }} defaultAcademicYear={ACADEMIC_YEAR} onImported={() => handleDone({ kind: 'curriculum_upload' })} />
          )}
          {action.action_type === 'link.course_offering_upload' && (
            <LazyCourseOfferingUpload open onOpenChange={(o: boolean) => { if (!o) setModalOpen(false); }} onImported={() => handleDone({ kind: 'course_offering_upload' })} />
          )}
          {action.action_type === 'link.enrollment_upload' && (
            <LazyEnrollmentUpload open onOpenChange={(o: boolean) => { if (!o) setModalOpen(false); }} onImported={() => handleDone({ kind: 'enrollment_upload' })} />
          )}
          {action.action_type === 'link.student_timetable_upload' && (
            <LazyStudentTimetableUpload open onOpenChange={(o: boolean) => { if (!o) setModalOpen(false); }} defaultAcademicYear={ACADEMIC_YEAR} defaultSemester={SEMESTER} onImported={() => handleDone({ kind: 'student_timetable_upload' })} />
          )}
          {action.action_type === 'link.teacher_timetable_upload' && (
            <LazyTeacherTimetableUpload open onOpenChange={(o: boolean) => { if (!o) setModalOpen(false); }} defaultAcademicYear={ACADEMIC_YEAR} defaultSemester={SEMESTER} onImported={() => handleDone({ kind: 'teacher_timetable_upload' })} />
          )}
          {action.action_type === 'evalearn.mock_marking_import' && (
            <MockMarkingHost action={action} workflowId={workflowId} onClose={() => setModalOpen(false)} />
          )}
          {action.action_type === 'evalearn.mock_exam_import' && (
            <TabDialogHost title="모의고사 성적 등록" onClose={() => setModalOpen(false)}>
              <LazyMockExamImportTab onUploaded={(summary: { inserted: number; updated: number }) => handleDone({ ...summary })} />
            </TabDialogHost>
          )}
          {action.action_type === 'evalearn.grade_analysis_import' && (
            <TabDialogHost title="학년 성적분석 파일 등록" onClose={() => setModalOpen(false)}>
              <LazyGradeAnalysisImportTab onUploaded={(summary: { year: number; grade: number; month: number }) => handleDone({ ...summary })} />
            </TabDialogHost>
          )}
          {action.action_type === 'link.account_excel' && (
            <LazyAccountExcelImport open onOpenChange={(o: boolean) => { if (!o) setModalOpen(false); }} onImportComplete={() => handleDone({ kind: 'account_excel' })} />
          )}
          {action.action_type === 'link.resource_csv' && (
            <LazyResourceCsvImport open onOpenChange={(o: boolean) => { if (!o) setModalOpen(false); }} onImportComplete={() => handleDone({ kind: 'resource_csv' })} />
          )}
          {action.action_type === 'link.timetable_csv' && (
            <LazyTimetableBulkImport open onOpenChange={(o: boolean) => { if (!o) setModalOpen(false); }} onImportComplete={() => handleDone({ kind: 'timetable_csv' })} />
          )}
          {action.action_type === 'link.training_certificate' && (
            <TrainingCertificateHost onClose={() => setModalOpen(false)} onDone={handleDone} />
          )}
          {action.action_type === 'link.document_upload' && (
            <LazyDocumentUpload isOpen onOpenChange={(o: boolean) => { if (!o) setModalOpen(false); }} onFileUploaded={() => handleDone({ kind: 'document_upload' })} />
          )}
          {action.action_type === 'link.work_create' && (
            <LazyWorkCreateDialog open onOpenChange={(o: boolean) => { if (!o) setModalOpen(false); }} onSuccess={(result: { workId: string }) => handleDone({ workId: result.workId })} />
          )}
          {MANAGED_HOSTS[action.action_type] && (
            <ManagedHost workType={action.action_type} onClose={() => setModalOpen(false)} onDone={handleDone} />
          )}
        </Suspense>
      )}
    </div>
  );
}
