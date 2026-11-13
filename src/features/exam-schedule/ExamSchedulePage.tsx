import React, { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  FileEdit,
  Trash2,
  RefreshCw,
  CalendarRange,
  CalendarCheck,
  RotateCcw,
  Pencil,
  Users,
  MoreHorizontal,
  ArrowLeft,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  useDeleteSchedule,
  useSavedSchedules,
  useUpdateSchedule,
} from './hooks/useSavedSchedules';
import { ExamScheduleProvider, useExamScheduleStore } from './hooks/useExamScheduleStore';
import { ExamPageHeader } from './components/shared/ExamPageHeader';
import { ExamScheduleWizard } from './components/wizard/ExamScheduleWizard';
import { WizardNav } from './components/wizard/WizardNav';
import { SavedSetupLoader } from './components/wizard/SavedSetupLoader';
import { CandidateGridPreview } from './components/results/CandidateGridPreview';
import { SavedScheduleEditor } from './components/editor/SavedScheduleEditor';
import { SupervisionPanel } from './components/supervision/SupervisionPanel';
import { MockSupervisionPanel } from './components/supervision/MockSupervisionPanel';
import { MockExamCreate } from './components/supervision/MockExamCreate';
import { gradesLabel, normalizeScheduleInput } from './utils/multiGrade';
import { isMockExamInput, type SavedExamSchedule } from './types';
import { format } from 'date-fns';

function rowGradesLabel(row: SavedExamSchedule): string {
  try {
    if (isMockExamInput(row.input_payload)) {
      return gradesLabel(row.input_payload.grades);
    }
    return gradesLabel(normalizeScheduleInput(row.input_payload).grades);
  } catch {
    return row.grade === 0 ? '전학년' : `${row.grade}학년`;
  }
}

const STATUS_LABEL: Record<SavedExamSchedule['status'], string> = {
  draft: '임시저장',
  finalized: '확정',
  archived: '보관',
};

const STATUS_STYLE: Record<SavedExamSchedule['status'], string> = {
  draft: 'bg-amber-100 text-amber-700',
  finalized: 'bg-emerald-100 text-emerald-700',
  archived: 'bg-muted text-muted-foreground',
};

/** 저장본 상태(임시저장/확정/보관) 변경 셀렉트. 확정된 감독표만 누적 횟수에 반영된다. */
function StatusSelect({ row }: { row: SavedExamSchedule }) {
  const update = useUpdateSchedule();
  const { toast } = useToast();
  return (
    <Select
      value={row.status}
      onValueChange={async (next) => {
        if (next === row.status) return;
        try {
          await update.mutateAsync({
            id: row.id,
            patch: { status: next as SavedExamSchedule['status'] },
          });
          toast({ title: `상태 변경: ${STATUS_LABEL[next as SavedExamSchedule['status']]}` });
        } catch (e) {
          toast({
            title: '상태 변경 실패',
            description: e instanceof Error ? e.message : String(e),
            variant: 'destructive',
          });
        }
      }}
    >
      <SelectTrigger
        className={`h-7 w-28 text-xs font-medium border-0 ${STATUS_STYLE[row.status]}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="draft">임시저장</SelectItem>
        <SelectItem value="finalized">확정</SelectItem>
        <SelectItem value="archived">보관</SelectItem>
      </SelectContent>
    </Select>
  );
}

function ListView() {
  const { data, isLoading, isFetching, refetch } = useSavedSchedules();
  const del = useDeleteSchedule();
  const { toast } = useToast();
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      {/* 목록 = 기능 첫 화면이라 제목·아이콘 없이 액션만(CLAUDE.md "UI 큰 틀 규약" §1) */}
      <ExamPageHeader
        actions={
          <>
            <Button
              asChild
              variant="default"
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white h-8 px-3 sm:px-4 flex items-center gap-1.5 text-xs sm:text-sm shadow-sm transition-all rounded-lg"
            >
              <Link to="/exam-schedule/new">
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">새 시험 시간표</span>
              </Link>
            </Button>
            <Button
              asChild
              variant="default"
              size="sm"
              className="bg-violet-600 hover:bg-violet-700 text-white h-8 px-3 sm:px-4 flex items-center gap-1.5 text-xs sm:text-sm shadow-sm transition-all rounded-lg"
            >
              <Link to="/exam-schedule/mock/new">
                <CalendarCheck className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">모의고사 감독표</span>
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="bg-white/50 border-slate-200 hover:bg-white hover:border-slate-300 h-8 px-2 sm:px-3 flex items-center gap-1.5 text-xs sm:text-sm transition-all rounded-lg"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">새로고침</span>
            </Button>
          </>
        }
      />

      {isLoading ? (
        <Card>
          <CardContent className="p-4 space-y-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : (data ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <CalendarRange className="h-6 w-6" />
            </div>
            <p className="text-sm text-muted-foreground">
              저장된 시험 시간표가 없습니다. 새 시험 시간표를 만들어보세요.
            </p>
            <Button asChild size="sm" className="gap-1.5">
              <Link to="/exam-schedule/new">
                <Plus className="h-3.5 w-3.5" /> 새 시험 시간표
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 border-slate-200">
                <TableHead className="h-10 w-[88px] px-3 text-xs font-semibold text-slate-500">
                  유형
                </TableHead>
                <TableHead className="h-10 w-[76px] px-3 text-xs font-semibold text-slate-500">
                  학년
                </TableHead>
                <TableHead className="h-10 px-3 text-xs font-semibold text-slate-500">
                  제목
                </TableHead>
                <TableHead className="h-10 w-[116px] px-3 text-xs font-semibold text-slate-500">
                  상태
                </TableHead>
                <TableHead className="h-10 w-[72px] px-3 text-center text-xs font-semibold text-slate-500">
                  감독
                </TableHead>
                <TableHead className="hidden h-10 w-[150px] px-3 text-xs font-semibold text-slate-500 md:table-cell">
                  생성 · 수정
                </TableHead>
                <TableHead className="h-10 w-[52px] px-2" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((row) => (
                <TableRow key={row.id} className="border-slate-100">
                  <TableCell className="px-3 py-2.5">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                        row.exam_type === 'mock'
                          ? 'bg-violet-100 text-violet-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {row.exam_type === 'mock' ? '모의고사' : '정기고사'}
                    </span>
                  </TableCell>
                  <TableCell className="px-3 py-2.5">
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                      {rowGradesLabel(row)}
                    </span>
                  </TableCell>
                  <TableCell className="px-3 py-2.5">
                    <Link
                      to={`/exam-schedule/${row.id}`}
                      className="font-medium text-slate-900 hover:text-blue-600 hover:underline"
                    >
                      {row.title || '(제목 없음)'}
                    </Link>
                    <div className="mt-0.5 text-[11px] text-muted-foreground md:hidden">
                      {format(new Date(row.created_at), 'yyyy-MM-dd HH:mm')}
                    </div>
                  </TableCell>
                  <TableCell className="px-3 py-2.5">
                    <StatusSelect row={row} />
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-center">
                    {row.supervisor_assignments ? (
                      <span
                        className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
                        title="감독 배정 있음"
                      >
                        <Users className="h-2.5 w-2.5" /> 배정
                      </span>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden px-3 py-2.5 text-xs text-muted-foreground md:table-cell">
                    <div className="tabular-nums">
                      {format(new Date(row.created_at), 'yyyy-MM-dd HH:mm')}
                    </div>
                    {row.updated_at !== row.created_at && (
                      <div className="tabular-nums text-[11px] text-slate-400">
                        수정 {format(new Date(row.updated_at), 'MM-dd HH:mm')}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="px-2 py-2.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-500 hover:text-slate-900"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={() => navigate(`/exam-schedule/${row.id}`)}>
                          <FileEdit className="mr-2 h-3.5 w-3.5" /> 열기
                        </DropdownMenuItem>
                        {row.exam_type === 'regular' && (
                          <DropdownMenuItem
                            onClick={() => navigate(`/exam-schedule/new?from=${row.id}`)}
                          >
                            <RotateCcw className="mr-2 h-3.5 w-3.5" /> 이 설정으로 다시 생성
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-rose-600 focus:text-rose-600"
                          onClick={async () => {
                            if (!confirm(`'${row.title}' 시간표를 삭제할까요?`)) return;
                            try {
                              await del.mutateAsync(row.id);
                              toast({ title: '삭제됨' });
                            } catch (e) {
                              toast({
                                title: '삭제 실패',
                                description: e instanceof Error ? e.message : String(e),
                                variant: 'destructive',
                              });
                            }
                          }}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> 삭제
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function NewView() {
  return (
    <ExamScheduleProvider>
      <NewViewInner />
    </ExamScheduleProvider>
  );
}

function NewViewInner() {
  const { state, setStep } = useExamScheduleStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromId = searchParams.get('from');
  const saved = state.step === 'saved';

  return (
    <div className="space-y-4">
      <ExamPageHeader
        icon={<CalendarRange className="h-4 w-4" />}
        title="새 시험 시간표"
        description="단계별로 진행해 TOP 후보를 생성하고 편집합니다"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/exam-schedule')}
            className="h-8 gap-1.5 text-xs sm:text-sm rounded-lg"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">목록으로</span>
          </Button>
        }
      >
        {!saved && <WizardNav current={state.step} onNavigate={setStep} />}
      </ExamPageHeader>

      {saved ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <div className="text-lg font-medium">시험 시간표가 저장되었습니다.</div>
            <p className="text-sm text-muted-foreground">
              감독 교사 배정은 목록에서 시간표를 열어 [감독 배정] 탭에서 진행할 수 있습니다.
            </p>
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={() => setStep('basic')}>
                새로 만들기
              </Button>
              <Button onClick={() => navigate('/exam-schedule')}>목록으로</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {fromId && <SavedSetupLoader savedId={fromId} />}
          <ExamScheduleWizard />
        </>
      )}
    </div>
  );
}

/** 정규고사 상세: 시간표 열람·편집 + 감독 배정 탭. 탭·배치 편집 버튼을 헤더 안에 표시. */
function RegularDetail({
  row,
  headerProps,
}: {
  row: SavedExamSchedule;
  headerProps: React.ComponentProps<typeof ExamPageHeader>;
}) {
  const input = normalizeScheduleInput(
    row.input_payload as Exclude<SavedExamSchedule['input_payload'], { kind: 'mock' }>,
  );
  const finalized = row.finalized_assignments ?? [];
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState('schedule');

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <ExamPageHeader {...headerProps}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="schedule" className="gap-1.5">
              <CalendarRange className="h-3.5 w-3.5" /> 시간표
            </TabsTrigger>
            <TabsTrigger value="supervision" className="gap-1.5">
              <Users className="h-3.5 w-3.5" /> 감독 배정
            </TabsTrigger>
          </TabsList>
          {tab === 'schedule' &&
            finalized.length > 0 &&
            (editing ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(false)}
                className="h-8 gap-1"
              >
                <CalendarRange className="h-3.5 w-3.5" /> 편집 닫기
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(true)}
                className="h-8 gap-1"
              >
                <Pencil className="h-3.5 w-3.5" /> 배치 편집
              </Button>
            ))}
        </div>
      </ExamPageHeader>

      <TabsContent value="schedule" className="mt-0 space-y-3">
        {finalized.length === 0 ? (
          <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
            확정된 배치가 없습니다. [다시 생성]으로 위저드에서 후보를 만들어 저장해 주세요.
          </div>
        ) : editing ? (
          <SavedScheduleEditor row={row} input={input} onClose={() => setEditing(false)} />
        ) : (
          <CandidateGridPreview
            grades={input.grades}
            gradeInputs={input.gradeInputs}
            assignments={finalized}
            supervision={input.supervision.enabled ? input.supervision : null}
          />
        )}
      </TabsContent>

      <TabsContent value="supervision" className="mt-0">
        <SupervisionPanel row={row} input={input} />
      </TabsContent>
    </Tabs>
  );
}

function DetailView({ id }: { id: string }) {
  const { data, isLoading } = useSavedSchedules();
  const navigate = useNavigate();
  const row = data?.find((r) => r.id === id);

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }
  if (!row) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          시험 시간표를 찾을 수 없습니다.
        </CardContent>
      </Card>
    );
  }

  const isMock = row.exam_type === 'mock' && isMockExamInput(row.input_payload);

  // 공통 헤더 props — 각 상세 패널이 이 헤더를 렌더하고 자기 컨트롤을 children/안에 배치한다.
  const headerProps: React.ComponentProps<typeof ExamPageHeader> = {
    icon: isMock ? <CalendarCheck className="h-4 w-4" /> : <CalendarRange className="h-4 w-4" />,
    iconClassName: isMock ? 'bg-violet-50 text-violet-600' : 'bg-blue-50 text-blue-600',
    title: row.title || '(제목 없음)',
    description: (
      <span className="flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
            isMock ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'
          }`}
        >
          {isMock ? '모의고사' : '정기고사'}
        </span>
        <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
          {rowGradesLabel(row)}
        </span>
        <span className="text-slate-400">
          · 생성 {format(new Date(row.created_at), 'yyyy-MM-dd HH:mm')}
        </span>
      </span>
    ),
    actions: (
      <>
        <StatusSelect row={row} />
        {row.exam_type === 'regular' && (
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-8 gap-1 text-sky-700 rounded-lg"
            title="이 설정을 불러와 위저드를 처음부터 다시 진행 (응시자는 최신 데이터로 갱신)"
          >
            <Link to={`/exam-schedule/new?from=${row.id}`}>
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">다시 생성</span>
            </Link>
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/exam-schedule')}
          className="h-8 gap-1.5 rounded-lg"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">목록으로</span>
        </Button>
      </>
    ),
  };

  return (
    <div className="space-y-4">
      {isMock ? (
        <MockSupervisionPanel row={row} input={row.input_payload} headerProps={headerProps} />
      ) : (
        <RegularDetail row={row} headerProps={headerProps} />
      )}
    </div>
  );
}

export interface ExamSchedulePageProps {
  mode?: 'list' | 'new' | 'detail' | 'mock-new';
}

export default function ExamSchedulePage({ mode = 'list' }: ExamSchedulePageProps) {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const detailId = params.id;

  let active: 'list' | 'new' | 'detail' | 'mock-new' = mode;
  if (detailId) active = 'detail';
  else if (searchParams.get('new') === '1') active = 'new';

  return (
    <Layout>
      <div className="space-y-4">
        {active === 'list' && <ListView />}
        {active === 'new' && <NewView />}
        {active === 'mock-new' && <MockExamCreate />}
        {active === 'detail' && detailId && <DetailView id={detailId} />}
      </div>
    </Layout>
  );
}
