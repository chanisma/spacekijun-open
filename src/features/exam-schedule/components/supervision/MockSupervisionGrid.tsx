import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type {
  Grade,
  MockExamInput,
  SupervisionTeacher,
  SupervisorPlanRoom,
  SupervisorTeacherRef,
} from '../../types';
import { GRADE_ACCENTS } from '../shared/GradeTabs';
import { TeacherSeatSelect, type TeacherLoads } from './SupervisionShared';
import { MAX_SUPERVISIONS_PER_DAY } from '../../supervision/autoAssign';

/**
 * 모의고사 감독 그리드: 학년별 표 (행 = 반, 열 = 교시).
 * 담임 고정 칸(첫·마지막 교시)은 노란 배경으로 표시한다.
 */
export function MockSupervisionGrid({
  input,
  rooms,
  teachers,
  loads,
  capByDay,
  onChange,
}: {
  input: MockExamInput;
  rooms: SupervisorPlanRoom[];
  teachers: SupervisionTeacher[];
  loads: TeacherLoads;
  /** dayIndex -> 일일 감독 상한 (당일 횟수 뱃지 색상 기준) */
  capByDay: Map<number, number>;
  onChange: (rooms: SupervisorPlanRoom[]) => void;
}) {
  const roomByKey = useMemo(() => {
    const m = new Map<string, SupervisorPlanRoom>();
    for (const r of rooms) m.set(`${r.grade}-${r.classNum}-${r.period}`, r);
    return m;
  }, [rooms]);

  const busyByPeriod = useMemo(() => {
    const m = new Map<number, Set<string>>();
    for (const r of rooms) {
      let s = m.get(r.period);
      if (!s) {
        s = new Set();
        m.set(r.period, s);
      }
      for (const t of r.teachers) if (t) s.add(t.id);
    }
    return m;
  }, [rooms]);

  const homeroomIdOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of teachers) {
      if (t.homeroom) m.set(`${t.homeroom.grade}-${t.homeroom.classNum}`, t.id);
    }
    return m;
  }, [teachers]);

  const setSeat = (roomId: string, next: SupervisorTeacherRef | null) => {
    onChange(
      rooms.map((r) => (r.roomId === roomId ? { ...r, teachers: [next] } : r)),
    );
  };

  return (
    <div className="space-y-3">
      {[...input.grades]
        .sort((a, b) => a - b)
        .map((g) => {
          const periods = [...(input.periodsByGrade[g] ?? [])].sort(
            (a, b) => a.period - b.period,
          );
          const classCount = input.classCountByGrade[g] ?? 0;
          if (periods.length === 0 || classCount === 0) return null;
          const accent = GRADE_ACCENTS[g as Grade];
          return (
            <div key={g} className="overflow-x-auto rounded-md border">
              <div
                className={cn(
                  'border-b px-2 py-1 text-xs font-semibold',
                  accent.chip,
                )}
              >
                {g}학년
              </div>
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="w-16 px-2 py-1 font-medium">반</th>
                    {periods.map((pd) => (
                      <th key={pd.period} className="px-2 py-1 font-medium min-w-[120px]">
                        {pd.period}교시
                        {pd.label && (
                          <span className="ml-1 font-normal text-muted-foreground">
                            {pd.label}
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: classCount }, (_, i) => i + 1).map((c) => {
                    const homeroomId = homeroomIdOf.get(`${g}-${c}`);
                    return (
                      <tr key={c} className="border-t">
                        <th className="bg-muted/20 px-2 py-1 font-medium">{c}반</th>
                        {periods.map((pd) => {
                          const room = roomByKey.get(`${g}-${c}-${pd.period}`);
                          if (!room) {
                            return (
                              <td key={pd.period} className="border-l px-1.5 py-1" />
                            );
                          }
                          const seat = room.teachers[0] ?? null;
                          const busy = busyByPeriod.get(pd.period) ?? new Set<string>();
                          // 담임 고정 칸: 담임을 과목 담당처럼 ★ 상단 노출
                          const preferred =
                            room.homeroomRequired && homeroomId
                              ? new Set([homeroomId])
                              : undefined;
                          return (
                            <td
                              key={pd.period}
                              className={cn(
                                'border-l px-1.5 py-1 align-middle',
                                room.homeroomRequired && 'bg-amber-50/70',
                              )}
                            >
                              <TeacherSeatSelect
                                value={seat}
                                teachers={teachers}
                                loads={loads}
                                dayIndex={room.dayIndex}
                                dayCap={capByDay.get(room.dayIndex) ?? MAX_SUPERVISIONS_PER_DAY}
                                preferredIds={preferred}
                                busyIds={
                                  new Set([...busy].filter((id) => id !== seat?.id))
                                }
                                highlight={room.homeroomRequired}
                                onChange={(next) => setSeat(room.roomId, next)}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
    </div>
  );
}
