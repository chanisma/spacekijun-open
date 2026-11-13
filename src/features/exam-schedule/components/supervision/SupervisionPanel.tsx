import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Download, Info, Save, Sparkles, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  ExamScheduleInput,
  ExamSubject,
  Grade,
  SavedExamSchedule,
  SupervisorPlan,
  SupervisorPlanRoom,
} from '../../types';
import {
  buildSlotRooms,
  carryOverTeachers,
  roomStructureSignature,
} from '../../supervision/roomPlan';
import {
  autoAssignSupervisors,
  buildCapByDay,
  MAX_SUPERVISIONS_PER_DAY,
  planLoadByTeacher,
  sectionKey,
  validatePlan,
  type SubjectInfo,
} from '../../supervision/autoAssign';
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
  TeacherSeatSelect,
} from './SupervisionShared';
import { GRADE_ACCENTS } from '../shared/GradeTabs';

/**
 * 정규고사 감독 배정 패널 (저장본 상세 화면).
 * 확정 배치(finalized_assignments)를 시험실로 전개하고, 과목 담당 우선 +
 * 감독 횟수 균등 원칙으로 자동 배정한 뒤 좌석 단위로 수동 조정할 수 있다.
 */
export function SupervisionPanel({
  row,
  input,
}: {
  row: SavedExamSchedule;
  input: ExamScheduleInput;
}) {
  const { toast } = useToast();
  const teachersQ = useSupervisionTeachers();
  const ledgerQ = useSupervisionLedger(row.id);
  const update = useUpdateSchedule();

  const assignments = useMemo(
    () => row.finalized_assignments ?? [],
    [row.finalized_assignments],
  );

  const subjects = useMemo(() => {
    const m = new Map<string, ExamSubject>();
    for (const g of input.grades) {
      for (const s of input.gradeInputs[g]?.subjects ?? []) m.set(s.id, s);
    }
    return m;
  }, [input]);

  const subjectInfo = useMemo(() => {
    const m = new Map<string, SubjectInfo>();
    for (const [id, s] of subjects) m.set(id, { name: s.name, grade: s.grade });
    return m;
  }, [subjects]);

  const freshRooms = useMemo(
    () =>
      buildSlotRooms({
        assignments,
        subjects,
        supervision: input.supervision,
      }),
    [assignments, subjects, input.supervision],
  );

  // 저장된 plan이 현재 배치와 같은 구조면 그대로, 어긋나면 좌석만 이월
  const [rooms, setRooms] = useState<SupervisorPlanRoom[]>([]);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [structureChanged, setStructureChanged] = useState(false);
  const initialized = useRef<string | null>(null);

  useEffect(() => {
    const initKey = `${row.id}:${roomStructureSignature(freshRooms)}`;
    if (initialized.current === initKey) return;
    initialized.current = initKey;
    const saved = row.supervisor_assignments;
    setExcludedIds(new Set(saved?.excludedTeacherIds ?? []));
    if (saved && saved.rooms.length > 0) {
      const savedSig = roomStructureSignature(saved.rooms);
      const freshSig = roomStructureSignature(freshRooms);
      if (savedSig === freshSig) {
        setRooms(saved.rooms.map((r) => ({ ...r, teachers: [...r.teachers] })));
        setStructureChanged(false);
      } else {
        setRooms(carryOverTeachers(freshRooms, saved.rooms));
        setStructureChanged(true);
      }
    } else {
      setRooms(freshRooms);
      setStructureChanged(false);
    }
    setDirty(false);
  }, [row.id, row.supervisor_assignments, freshRooms]);

  const teachers = useMemo(() => teachersQ.data ?? [], [teachersQ.data]);
  // 이번 시험 한정 제외 교사를 뺀 배정 대상 (자동 배정·좌석 선택·요약 모두 이 목록 사용)
  const activeTeachers = useMemo(
    () => teachers.filter((t) => !excludedIds.has(t.id)),
    [teachers, excludedIds],
  );
  const pastLoad = useMemo(() => buildPastLoadMap(ledgerQ.data), [ledgerQ.data]);
  const currentLoad = useMemo(() => planLoadByTeacher(rooms), [rooms]);
  const dayLoad = useMemo(() => buildDayLoadMap(rooms), [rooms]);
  // 일차별 일일 감독 상한 (4교시 이상인 날 = 3회, 그 외 2회)
  const capByDay = useMemo(() => buildCapByDay(rooms), [rooms]);

  const issues = useMemo(() => {
    const out = validatePlan(rooms).map((i) => i.message);
    // 제외 처리했지만 좌석에 남아 있는 교사 경고
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
  const [autoWarnings, setAutoWarnings] = useState<string[]>([]);

  const busyBySlot = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const r of rooms) {
      const k = `${r.dayIndex}|${r.period}`;
      let s = m.get(k);
      if (!s) {
        s = new Set();
        m.set(k, s);
      }
      for (const t of r.teachers) if (t) s.add(t.id);
    }
    return m;
  }, [rooms]);

  // 슬롯(일차 → 교시) 그룹
  const slotGroups = useMemo(() => {
    const m = new Map<string, SupervisorPlanRoom[]>();
    for (const r of [...rooms].sort(
      (a, b) => a.dayIndex - b.dayIndex || a.period - b.period,
    )) {
      const k = `${r.dayIndex}|${r.period}`;
      const arr = m.get(k) ?? [];
      arr.push(r);
      m.set(k, arr);
    }
    return m;
  }, [rooms]);

  const totalSeats = rooms.reduce((acc, r) => acc + r.teachers.length, 0);
  const filledSeats = rooms.reduce(
    (acc, r) => acc + r.teachers.filter(Boolean).length,
    0,
  );

  const runAutoAssign = (keepExisting: boolean) => {
    const res = autoAssignSupervisors({
      rooms,
      teachers: activeTeachers,
      subjectInfo,
      pastLoadByTeacher: pastLoad,
      keepExisting,
    });
    setRooms(res.rooms);
    setAutoWarnings(res.warnings);
    setDirty(true);
  };

  const setSeat = (roomId: string, seatIdx: number, t: SupervisorPlanRoom['teachers'][number]) => {
    setRooms((prev) =>
      prev.map((r) =>
        r.roomId === roomId
          ? { ...r, teachers: r.teachers.map((x, i) => (i === seatIdx ? t : x)) }
          : r,
      ),
    );
    setDirty(true);
  };

  const save = async () => {
    const plan: SupervisorPlan = {
      version: 1,
      examType: 'regular',
      rooms,
      excludedTeacherIds: [...excludedIds],
      generatedAt: new Date().toISOString(),
    };
    try {
      await update.mutateAsync({ id: row.id, patch: { supervisor_assignments: plan } });
      setDirty(false);
      setStructureChanged(false);
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
    if (filledSeats === 0) {
      toast({ title: '배정된 좌석이 없습니다', variant: 'destructive' });
      return;
    }
    const plan: SupervisorPlan = {
      version: 1,
      examType: 'regular',
      rooms,
      excludedTeacherIds: [...excludedIds],
      generatedAt: new Date().toISOString(),
    };
    downloadSupervisionXlsx(plan, teachers, {
      examType: 'regular',
      title: row.title,
      schoolName: SCHOOL_NAME,
    }, `감독시간표_${row.title}`);
    toast({ title: '엑셀 내보내기 완료' });
  };

  if (assignments.length === 0) {
    return (
      <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
        확정된 배치가 없어 감독을 배정할 수 없습니다. 시간표 탭에서 배치를 저장해 주세요.
      </div>
    );
  }
  if (teachersQ.isLoading || ledgerQ.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-3">
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
        <div className="flex gap-2">
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

      <TeacherExcludePicker
        teachers={teachers}
        excludedIds={excludedIds}
        onChange={(next) => {
          setExcludedIds(next);
          setDirty(true);
        }}
      />

      {structureChanged && (
        <div className="flex items-start gap-1.5 rounded-md border border-sky-200 bg-sky-50 p-2 text-xs text-sky-800">
          <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          시간표 배치가 변경되어 시험실 구성이 달라졌습니다. 기존 감독 배정은 같은
          시험실에 한해 이월되었으니 확인 후 다시 저장해 주세요.
        </div>
      )}

      <PlanIssueList issues={[...autoWarnings, ...issues]} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_260px]">
        <div className="space-y-3">
          {Array.from(slotGroups.entries()).map(([key, slotRooms]) => {
            const [d, p] = key.split('|').map(Number);
            const busy = busyBySlot.get(key) ?? new Set<string>();
            return (
              <div key={key} className="overflow-hidden rounded-md border">
                <div className="flex items-center justify-between border-b bg-slate-50 px-2 py-1">
                  <span className="text-xs font-semibold text-slate-700">
                    {d + 1}일차 {p}교시
                  </span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    시험실 {slotRooms.length}실 · 감독{' '}
                    {slotRooms.reduce((a, r) => a + r.teachers.length, 0)}명
                  </span>
                </div>
                <table className="w-full text-xs">
                  <tbody>
                    {slotRooms.map((room) => {
                      const preferred = new Set(
                        activeTeachers
                          .filter((t) =>
                            room.subjectIds.some((sid) => {
                              const info = subjectInfo.get(sid);
                              return (
                                info &&
                                (t.sectionCounts[sectionKey(info.name, info.grade)] ?? 0) > 0
                              );
                            }),
                          )
                          .map((t) => t.id),
                      );
                      return (
                        <tr key={room.roomId} className="border-t first:border-t-0">
                          <td className="w-24 px-2 py-1 align-middle">
                            <span
                              className={cn(
                                'inline-block rounded px-1.5 py-0.5 text-[10px] font-medium',
                                room.kind === 'classroom' && room.grade
                                  ? GRADE_ACCENTS[room.grade as Grade].chip
                                  : 'bg-slate-100 text-slate-600',
                              )}
                            >
                              {room.label}
                            </span>
                          </td>
                          <td className="px-2 py-1 align-middle text-muted-foreground">
                            {room.subjectNames.join(', ')}
                          </td>
                          <td className="w-44 px-2 py-1">
                            <div className="flex flex-col gap-1">
                              {room.teachers.map((t, i) => (
                                <TeacherSeatSelect
                                  key={i}
                                  value={t}
                                  teachers={activeTeachers}
                                  loads={{ current: currentLoad, past: pastLoad, day: dayLoad }}
                                  dayIndex={room.dayIndex}
                                  dayCap={capByDay.get(room.dayIndex) ?? MAX_SUPERVISIONS_PER_DAY}
                                  preferredIds={preferred}
                                  busyIds={
                                    new Set(
                                      [...busy].filter((id) => id !== t?.id),
                                    )
                                  }
                                  onChange={(next) => setSeat(room.roomId, i, next)}
                                />
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>

        {/* 교시 목록이 길어도 부담 요약이 따라오도록 사이드바 고정 */}
        <div className="space-y-3 lg:sticky lg:top-2 lg:self-start">
          <TeacherLoadSummary
            teachers={activeTeachers}
            loads={{ current: currentLoad, past: pastLoad }}
          />
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            ★ = 해당 시험실 과목의 담당 교사. 누적은 확정된 다른 감독표와 수동
            보정의 합입니다. 자동 배정은 과목 담당 교사(분반 많은 순)를 먼저
            배치한 뒤 (이번+누적) 합계가 가장 적은 교사부터 빈 좌석을 채워
            최종 편차가 1을 넘지 않으며, 시험이 여러 일차면 동률 안에서 같은 날
            이미 투입된 교사에게 2회째를 우선 배정합니다. 한 교사는 하루 최대
            2회(시험이 4교시 이상인 날은 3회, 단 3개 교시 연속 감독 금지)까지
            감독하고, 동률은 실행마다 무작위로 결정되어 특정 교사가 같은 교시에
            고정되지 않습니다. '학교관리자'·'고사운영교사' 태그 교사는 항상
            제외됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
