import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Download, Save, Sparkles, UserPlus } from 'lucide-react';
import type {
  MockExamInput,
  SavedExamSchedule,
  SupervisorPlan,
  SupervisorPlanRoom,
} from '../../types';
import { autoAssignMockSupervisors, buildMockRooms } from '../../supervision/mockPlan';
import {
  buildCapByDay,
  MAX_SUPERVISIONS_PER_DAY,
  planLoadByTeacher,
  validatePlan,
} from '../../supervision/autoAssign';
import { carryOverTeachers, roomStructureSignature } from '../../supervision/roomPlan';
import { downloadSupervisionXlsx } from '../../supervision/exportXlsx';
import { SCHOOL_NAME } from '../../constants';
import { useSupervisionLedger, useSupervisionTeachers } from '../../hooks/useSupervision';
import { useUpdateSchedule } from '../../hooks/useSavedSchedules';
import {
  buildDayLoadMap,
  buildPastLoadMap,
  PlanIssueList,
  TeacherExcludePicker,
  TeacherLoadSummary,
} from './SupervisionShared';
import { MockSupervisionGrid } from './MockSupervisionGrid';
import { ExamPageHeader } from '../shared/ExamPageHeader';

/**
 * 모의고사 감독 배정 패널 (저장본 상세 화면).
 * 반×교시 그리드에 교사를 배정한다. 각 학년의 첫·마지막 교시는 담임 고정.
 * headerProps가 주어지면 좌석 현황·배정 버튼을 공통 헤더 안에 렌더한다.
 */
export function MockSupervisionPanel({
  row,
  input,
  headerProps,
}: {
  row: SavedExamSchedule;
  input: MockExamInput;
  headerProps?: React.ComponentProps<typeof ExamPageHeader>;
}) {
  const { toast } = useToast();
  const teachersQ = useSupervisionTeachers();
  const ledgerQ = useSupervisionLedger(row.id);
  const update = useUpdateSchedule();

  const freshRooms = useMemo(() => buildMockRooms(input), [input]);

  const [rooms, setRooms] = useState<SupervisorPlanRoom[]>([]);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [autoWarnings, setAutoWarnings] = useState<string[]>([]);
  const initialized = useRef<string | null>(null);

  useEffect(() => {
    const initKey = `${row.id}:${roomStructureSignature(freshRooms)}`;
    if (initialized.current === initKey) return;
    initialized.current = initKey;
    const saved = row.supervisor_assignments;
    setExcludedIds(new Set(saved?.excludedTeacherIds ?? []));
    if (saved && saved.rooms.length > 0) {
      const same =
        roomStructureSignature(saved.rooms) === roomStructureSignature(freshRooms);
      setRooms(
        same
          ? saved.rooms.map((r) => ({ ...r, teachers: [...r.teachers] }))
          : carryOverTeachers(freshRooms, saved.rooms),
      );
    } else {
      setRooms(freshRooms);
    }
    setDirty(false);
  }, [row.id, row.supervisor_assignments, freshRooms]);

  const teachers = useMemo(() => teachersQ.data ?? [], [teachersQ.data]);
  // 이번 시험 한정 제외 교사를 뺀 배정 대상
  const activeTeachers = useMemo(
    () => teachers.filter((t) => !excludedIds.has(t.id)),
    [teachers, excludedIds],
  );
  const pastLoad = useMemo(() => buildPastLoadMap(ledgerQ.data), [ledgerQ.data]);
  const currentLoad = useMemo(() => planLoadByTeacher(rooms), [rooms]);
  const dayLoad = useMemo(() => buildDayLoadMap(rooms), [rooms]);
  const capByDay = useMemo(() => buildCapByDay(rooms), [rooms]);
  const issues = useMemo(() => {
    const out = validatePlan(rooms).map((i) => i.message);
    const nameById = new Map(teachers.map((t) => [t.id, t.name]));
    const stillSeated = new Set<string>();
    for (const r of rooms) {
      for (const t of r.teachers) {
        if (t && excludedIds.has(t.id)) stillSeated.add(nameById.get(t.id) ?? t.name);
      }
    }
    if (stillSeated.size > 0) {
      out.push(
        `제외 교사(${[...stillSeated].join(', ')})가 좌석에 남아 있습니다 — 전체 자동 배정을 다시 실행하거나 좌석을 직접 변경해 주세요`,
      );
    }
    // 공급 상한 사전 안내: 일일 좌석 수 > 가용 교사 × 그날 상한(2 또는 3회)
    const seatsByDay = new Map<number, number>();
    for (const r of rooms) {
      seatsByDay.set(r.dayIndex, (seatsByDay.get(r.dayIndex) ?? 0) + r.teachers.length);
    }
    for (const [d, seats] of [...seatsByDay.entries()].sort((a, b) => a[0] - b[0])) {
      const cap = capByDay.get(d) ?? MAX_SUPERVISIONS_PER_DAY;
      const supply = activeTeachers.length * cap;
      if (seats > supply) {
        out.push(
          `${d + 1}일차 좌석 ${seats}개 > 공급 상한 ${supply}회 (가용 ${activeTeachers.length}명 × 하루 ${cap}회) — 제외 교사를 줄이지 않으면 일부 좌석이 미배정으로 남습니다`,
        );
      }
    }
    return out;
  }, [rooms, teachers, excludedIds, activeTeachers, capByDay]);

  const runAutoAssign = (keepExisting: boolean) => {
    const res = autoAssignMockSupervisors({
      rooms,
      teachers: activeTeachers,
      pastLoadByTeacher: pastLoad,
      keepExisting,
    });
    setRooms(res.rooms);
    setAutoWarnings(res.warnings);
    setDirty(true);
  };

  const save = async () => {
    const plan: SupervisorPlan = {
      version: 1,
      examType: 'mock',
      rooms,
      excludedTeacherIds: [...excludedIds],
      generatedAt: new Date().toISOString(),
    };
    try {
      await update.mutateAsync({ id: row.id, patch: { supervisor_assignments: plan } });
      setDirty(false);
      toast({ title: '감독 배정 저장 완료' });
    } catch (e) {
      toast({
        title: '저장 실패',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  };

  const exportXlsx = () => {
    if (!rooms.some((r) => r.teachers[0])) {
      toast({ title: '배정된 좌석이 없습니다', variant: 'destructive' });
      return;
    }
    const plan: SupervisorPlan = {
      version: 1,
      examType: 'mock',
      rooms,
      excludedTeacherIds: [...excludedIds],
      generatedAt: new Date().toISOString(),
    };
    downloadSupervisionXlsx(plan, teachers, {
      examType: 'mock',
      title: row.title,
      schoolName: SCHOOL_NAME,
    }, `모의고사감독_${row.title}`);
    toast({ title: '엑셀 내보내기 완료' });
  };

  if (teachersQ.isLoading || ledgerQ.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  const totalSeats = rooms.length;
  const filledSeats = rooms.filter((r) => r.teachers[0]).length;

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">
          좌석 <span className="tabular-nums">{filledSeats}/{totalSeats}</span>
        </span>
        {totalSeats - filledSeats > 0 && (
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700 tabular-nums">
            미배정 {totalSeats - filledSeats}
          </span>
        )}
        {dirty && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
            저장되지 않은 변경
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => runAutoAssign(true)}
          className="gap-1"
          disabled={activeTeachers.length === 0}
        >
          <UserPlus className="h-3.5 w-3.5" /> 빈 좌석만 배정
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => runAutoAssign(false)}
          className="gap-1"
          disabled={activeTeachers.length === 0}
        >
          <Sparkles className="h-3.5 w-3.5" /> 전체 자동 배정
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={exportXlsx}
          className="gap-1"
          disabled={filledSeats === 0}
          title="학교 표준 양식(교사별 고사 감독 시간표)으로 내보내기"
        >
          <Download className="h-3.5 w-3.5" /> 엑셀
        </Button>
        <Button size="sm" onClick={save} disabled={update.isPending} className="gap-1">
          <Save className="h-3.5 w-3.5" /> 저장
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {headerProps ? (
        <ExamPageHeader {...headerProps}>{toolbar}</ExamPageHeader>
      ) : (
        toolbar
      )}

      <TeacherExcludePicker
        teachers={teachers}
        excludedIds={excludedIds}
        onChange={(next) => {
          setExcludedIds(next);
          setDirty(true);
        }}
      />

      <PlanIssueList issues={[...autoWarnings, ...issues]} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_260px]">
        <MockSupervisionGrid
          input={input}
          rooms={rooms}
          teachers={activeTeachers}
          loads={{ current: currentLoad, past: pastLoad, day: dayLoad }}
          capByDay={capByDay}
          onChange={(next) => {
            setRooms(next);
            setDirty(true);
          }}
        />
        {/* 학년 그리드가 길어도 부담 요약이 따라오도록 사이드바 고정 */}
        <div className="space-y-3 lg:sticky lg:top-2 lg:self-start">
          <TeacherLoadSummary
            teachers={activeTeachers}
            loads={{ current: currentLoad, past: pastLoad }}
          />
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            노란 칸 = 담임 고정 교시(각 학년의 첫·마지막 교시). 자동 배정은 담임
            고정을 먼저 채운 뒤 (이번+누적) 감독 횟수가 적은 교사부터 전원에게
            1회씩 펼쳐 배정하고, 좌석이 남을 때만 2회째를 줍니다. 한 교사는
            같은 교시에 한 반만, 하루 최대 2회(시험이 4교시 이상인 날은 3회, 단
            3개 교시 연속 감독 금지)까지 감독할 수 있으며, 동률은 실행마다
            무작위로 결정됩니다. '학교관리자'·'고사운영교사' 태그 교사는 항상
            제외됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
