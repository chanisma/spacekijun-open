import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, CalendarCheck, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Grade, MockExamInput, MockExamPeriod, SupervisorPlan } from '../../types';
import { ALL_GRADES, DEFAULT_SUPERVISION } from '../../constants';
import { autoAssignMockSupervisors, buildMockRooms, defaultMockPeriods } from '../../supervision/mockPlan';
import { useSupervisionLedger, useSupervisionTeachers } from '../../hooks/useSupervision';
import { useCreateMockSchedule } from '../../hooks/useSavedSchedules';
import { buildPastLoadMap, TeacherExcludePicker } from './SupervisionShared';
import { GRADE_ACCENTS } from '../shared/GradeTabs';
import { ExamPageHeader } from '../shared/ExamPageHeader';

/**
 * 모의고사 감독표 생성. 학년·반 수·교시 구성을 입력하면 담임 고정(첫·마지막
 * 교시) + 감독 횟수 균등 원칙으로 자동 배정해 저장하고 상세 화면으로 이동한다.
 * 세부 좌석 조정은 저장 후 상세 화면에서 진행한다.
 */
export function MockExamCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const teachersQ = useSupervisionTeachers();
  const ledgerQ = useSupervisionLedger();
  const create = useCreateMockSchedule();

  const [title, setTitle] = useState('');
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [grades, setGrades] = useState<Grade[]>([...ALL_GRADES]);
  const [classCountByGrade, setClassCountByGrade] = useState<Record<Grade, number>>({
    1: DEFAULT_SUPERVISION.classCountByGrade[1] ?? 9,
    2: DEFAULT_SUPERVISION.classCountByGrade[2] ?? 9,
    3: DEFAULT_SUPERVISION.classCountByGrade[3] ?? 9,
  });
  const [periodsByGrade, setPeriodsByGrade] = useState<Record<Grade, MockExamPeriod[]>>({
    1: defaultMockPeriods(1),
    2: defaultMockPeriods(2),
    3: defaultMockPeriods(3),
  });

  const toggleGrade = (g: Grade) => {
    setGrades((prev) => {
      if (prev.includes(g)) {
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== g);
      }
      return [...prev, g].sort((a, b) => a - b);
    });
  };

  const patchPeriods = (g: Grade, next: MockExamPeriod[]) => {
    setPeriodsByGrade((prev) => ({ ...prev, [g]: next }));
  };

  const input = useMemo<MockExamInput>(
    () => ({
      kind: 'mock',
      grades,
      classCountByGrade: Object.fromEntries(
        grades.map((g) => [g, classCountByGrade[g]]),
      ),
      periodsByGrade: Object.fromEntries(grades.map((g) => [g, periodsByGrade[g]])),
    }),
    [grades, classCountByGrade, periodsByGrade],
  );

  const totalRooms = useMemo(
    () =>
      grades.reduce(
        (acc, g) => acc + classCountByGrade[g] * periodsByGrade[g].length,
        0,
      ),
    [grades, classCountByGrade, periodsByGrade],
  );

  const handleCreate = async () => {
    if (!title.trim()) {
      toast({ title: '제목을 입력해 주세요', variant: 'destructive' });
      return;
    }
    const teachers = (teachersQ.data ?? []).filter((t) => !excludedIds.has(t.id));
    const rooms = buildMockRooms(input);
    const { rooms: assigned, warnings } = autoAssignMockSupervisors({
      rooms,
      teachers,
      pastLoadByTeacher: buildPastLoadMap(ledgerQ.data),
    });
    const plan: SupervisorPlan = {
      version: 1,
      examType: 'mock',
      rooms: assigned,
      excludedTeacherIds: [...excludedIds],
      generatedAt: new Date().toISOString(),
    };
    try {
      const saved = await create.mutateAsync({
        grades,
        title: title.trim(),
        input,
        supervisorPlan: plan,
      });
      toast({
        title: '모의고사 감독표 생성 완료',
        description:
          warnings.length > 0
            ? `경고 ${warnings.length}건 — 상세 화면에서 확인해 주세요.`
            : '상세 화면에서 좌석을 조정할 수 있습니다.',
      });
      navigate(`/exam-schedule/${saved.id}`);
    } catch (e) {
      toast({
        title: '생성 실패',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4">
      <ExamPageHeader
        icon={<CalendarCheck className="h-4 w-4" />}
        iconClassName="bg-violet-50 text-violet-600"
        title="새 모의고사 감독표"
        description="반(교실)마다 교시당 감독 1명 배정 · 각 학년 첫·마지막 교시는 담임 고정"
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
      />
      <Card>
        <CardContent className="space-y-4 pt-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="mock-title">제목</Label>
            <Input
              id="mock-title"
              placeholder="예: 6월 모의평가 감독표"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>대상 학년</Label>
            <div className="flex gap-2">
              {ALL_GRADES.map((g) => {
                const active = grades.includes(g);
                const accent = GRADE_ACCENTS[g];
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => toggleGrade(g)}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                      active ? cn(accent.active, 'border-transparent') : accent.idle,
                    )}
                  >
                    {g}학년
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {grades.map((g) => {
          const periods = periodsByGrade[g];
          const accent = GRADE_ACCENTS[g];
          return (
            <div key={g} className="rounded-md border">
              <div
                className={cn(
                  'flex items-center justify-between border-b px-2 py-1.5 text-xs font-semibold',
                  accent.chip,
                )}
              >
                <span>{g}학년</span>
                <span className="flex items-center gap-1.5 font-normal">
                  반 수
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={classCountByGrade[g]}
                    onChange={(e) =>
                      setClassCountByGrade((prev) => ({
                        ...prev,
                        [g]: Math.max(1, Math.min(20, Number(e.target.value) || 1)),
                      }))
                    }
                    className="h-6 w-14 bg-white/70 px-1.5 text-xs"
                  />
                </span>
              </div>
              <div className="space-y-1.5 p-2">
                {periods.map((pd, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-12 text-xs font-medium tabular-nums">
                      {pd.period}교시
                    </span>
                    <Input
                      placeholder="과목/영역 (예: 국어)"
                      value={pd.label}
                      onChange={(e) =>
                        patchPeriods(
                          g,
                          periods.map((x, i) =>
                            i === idx ? { ...x, label: e.target.value } : x,
                          ),
                        )
                      }
                      className="h-7 flex-1 text-xs"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-rose-500"
                      disabled={periods.length <= 1}
                      onClick={() =>
                        patchPeriods(
                          g,
                          periods
                            .filter((_, i) => i !== idx)
                            .map((x, i) => ({ ...x, period: i + 1 })),
                        )
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs"
                  onClick={() =>
                    patchPeriods(g, [
                      ...periods,
                      { period: periods.length + 1, label: '' },
                    ])
                  }
                >
                  <Plus className="h-3 w-3" /> 교시 추가
                </Button>
              </div>
            </div>
          );
        })}

        <div className="space-y-1.5 border-t pt-3">
          <Label className="text-xs">이번 시험 제외 교사 (출제·출장 등)</Label>
          <TeacherExcludePicker
            teachers={teachersQ.data ?? []}
            excludedIds={excludedIds}
            onChange={setExcludedIds}
          />
        </div>

        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-xs text-muted-foreground tabular-nums">
            총 {totalRooms}개 좌석 (반 × 교시) · 가용 교사{' '}
            {teachersQ.data ? teachersQ.data.length - excludedIds.size : '...'}명
            {excludedIds.size > 0 && ` (제외 ${excludedIds.size}명)`}
            {teachersQ.data && (
              <>
                {' · 공급 상한 '}
                <span
                  className={
                    totalRooms > (teachersQ.data.length - excludedIds.size) * 2
                      ? 'font-semibold text-rose-600'
                      : undefined
                  }
                >
                  {(teachersQ.data.length - excludedIds.size) * 2}회
                </span>
                (1인 하루 2회)
              </>
            )}
          </span>
          <Button
            onClick={handleCreate}
            disabled={create.isPending || teachersQ.isLoading || ledgerQ.isLoading}
            className="gap-1"
          >
            <CalendarCheck className="h-4 w-4" />
            자동 배정 후 저장
          </Button>
        </div>
        </CardContent>
      </Card>
    </div>
  );
}
