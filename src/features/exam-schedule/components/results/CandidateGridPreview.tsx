import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Users } from 'lucide-react';
import type {
  ExamSubject,
  Grade,
  GradeInput,
  SlotAssignment,
  SupervisionConfig,
} from '../../types';
import {
  buildRoomPool,
  slotSupervision,
  subjectDemandEntry,
} from '../../utils/multiGrade';
import { GRADE_ACCENTS } from '../shared/GradeTabs';

/**
 * 생성 결과 미리보기 — 학년별로 분리된 시간표를 세로로 쌓아 표시한다.
 * 감독 수요는 학년 합산 값이므로 학년 표 안에 섞지 않고, 맨 아래
 * "교시별 감독 수요" 요약 표 하나로 모아 가용 인원 대비 부담을 보여준다.
 */
export function CandidateGridPreview({
  grades,
  gradeInputs,
  assignments,
  supervision,
  compact = false,
}: {
  grades: Grade[];
  gradeInputs: Partial<Record<Grade, GradeInput>>;
  assignments: SlotAssignment[];
  supervision?: SupervisionConfig | null;
  compact?: boolean;
}) {
  const { subjectMap, dayIndexes, allPeriods, demandByCell } = useMemo(() => {
    const subjectMap = new Map<string, ExamSubject>();
    const daySet = new Set<number>();
    const periodSet = new Set<number>();
    for (const g of grades) {
      const gi = gradeInputs[g];
      if (!gi) continue;
      for (const s of gi.subjects) subjectMap.set(s.id, s);
      for (const d of gi.days) {
        daySet.add(d.dayIndex);
        for (const p of d.availablePeriods) periodSet.add(p);
      }
    }
    // 셀별 감독 수요 — 공통 과목은 반 시험실(고정), 선택과목은 고사실 풀 greedy.
    // 합산(total)·고사실 수용 여부(fits)·학년별(byGrade)을 함께 집계
    const cellSubjects = new Map<string, ExamSubject[]>();
    for (const a of assignments) {
      const sub = subjectMap.get(a.subjectId);
      if (!sub) continue;
      daySet.add(a.dayIndex);
      periodSet.add(a.period);
      const key = `${a.dayIndex}|${a.period}`;
      const arr = cellSubjects.get(key) ?? [];
      arr.push(sub);
      cellSubjects.set(key, arr);
    }
    const demandByCell = new Map<
      string,
      { total: number; fits: boolean; byGrade: Partial<Record<Grade, number>> }
    >();
    if (supervision?.enabled) {
      const pool = buildRoomPool(supervision);
      const perRoom = Math.max(1, supervision.supervisorsPerRoom);
      for (const [key, subs] of cellSubjects.entries()) {
        const res = slotSupervision(
          subs.map((s) => subjectDemandEntry(s, supervision)),
          supervision,
          pool,
        );
        if (res.supervisors <= 0) continue;
        const byGrade: Partial<Record<Grade, number>> = {};
        for (const s of subs) {
          const rooms = res.roomsByKey.get(s.id) ?? 0;
          if (rooms > 0) byGrade[s.grade] = (byGrade[s.grade] ?? 0) + rooms * perRoom;
        }
        demandByCell.set(key, { total: res.supervisors, fits: res.fits, byGrade });
      }
    }
    return {
      subjectMap,
      dayIndexes: Array.from(daySet).sort((a, b) => a - b),
      allPeriods: Array.from(periodSet).sort((a, b) => a - b),
      demandByCell,
    };
  }, [grades, gradeInputs, assignments, supervision]);

  const multiGrade = grades.length > 1;
  const available = supervision?.availableSupervisors ?? 0;
  // studentCount가 없는 구버전 저장본은 수요가 전부 0 — 빈 표 대신 숨긴다
  const maxDemand = Math.max(
    0,
    ...Array.from(demandByCell.values()).map((c) => c.total),
  );

  return (
    <div className={cn('space-y-2', !compact && 'space-y-3')}>
      {grades.map((g) => (
        <GradeSection
          key={g}
          grade={g}
          gradeInput={gradeInputs[g]}
          assignments={assignments}
          subjectMap={subjectMap}
          dayIndexes={dayIndexes}
          showHeader={multiGrade}
          compact={compact}
        />
      ))}

      {supervision?.enabled && maxDemand > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <div
            className={cn(
              'flex items-center gap-1.5 border-b bg-slate-50 px-2 py-1 font-medium text-slate-700',
              compact ? 'text-[10px]' : 'text-xs',
            )}
          >
            <Users className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
            교시별 감독 수요 (전 학년 합산 / 가용 {available}명)
          </div>
          <table className={cn('w-full text-center', compact ? 'text-[10px]' : 'text-xs')}>
            <thead className="bg-muted/40">
              <tr>
                <th className="px-1 py-1 w-10"></th>
                {dayIndexes.map((d) => (
                  <th key={d} className="px-2 py-1 font-medium">
                    {d + 1}일차
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allPeriods.map((p) => (
                <tr key={p} className="border-t">
                  <th className="px-1 py-1 bg-muted/20 font-medium">{p}교시</th>
                  {dayIndexes.map((d) => {
                    const cell = demandByCell.get(`${d}|${p}`);
                    const total = cell?.total ?? 0;
                    const over = total > available || cell?.fits === false;
                    const near = !over && total >= available * 0.85;
                    return (
                      <td key={d} className="border-l px-1 py-1 align-top">
                        {total > 0 && cell ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span
                              className={cn(
                                'inline-flex items-center justify-center rounded-full px-1.5 py-0.5 font-medium tabular-nums',
                                over
                                  ? 'bg-rose-600 text-white'
                                  : near
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-100 text-slate-600',
                              )}
                              title={`감독 ${total}명 필요 / 가용 ${available}명${
                                cell?.fits === false ? ' · 고사실 부족!' : ''
                              }`}
                            >
                              {total}/{available}
                            </span>
                            {multiGrade && (
                              <span className="inline-flex flex-wrap items-center justify-center gap-0.5">
                                {grades.map((g) => {
                                  const gd = cell.byGrade[g];
                                  if (!gd) return null;
                                  return (
                                    <span
                                      key={g}
                                      className={cn(
                                        'rounded-sm px-1 py-0.5 font-medium tabular-nums leading-none',
                                        compact ? 'text-[8px]' : 'text-[10px]',
                                        GRADE_ACCENTS[g].chip,
                                      )}
                                      title={`${g}학년 감독 수요 ${gd}명`}
                                    >
                                      {g}학년 {gd}
                                    </span>
                                  );
                                })}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** 한 학년의 시간표 표. 해당 학년의 활성 교시·배치만 표시한다. */
function GradeSection({
  grade,
  gradeInput,
  assignments,
  subjectMap,
  dayIndexes,
  showHeader,
  compact,
}: {
  grade: Grade;
  gradeInput: GradeInput | undefined;
  assignments: SlotAssignment[];
  subjectMap: Map<string, ExamSubject>;
  dayIndexes: number[];
  showHeader: boolean;
  compact: boolean;
}) {
  const { grid, periods } = useMemo(() => {
    const grid = new Map<string, ExamSubject[]>();
    const periodSet = new Set<number>(
      gradeInput?.days.flatMap((d) => d.availablePeriods) ?? [],
    );
    for (const a of assignments) {
      const sub = subjectMap.get(a.subjectId);
      if (!sub || sub.grade !== grade) continue;
      const key = `${a.dayIndex}|${a.period}`;
      const arr = grid.get(key) ?? [];
      arr.push(sub);
      grid.set(key, arr);
      periodSet.add(a.period);
    }
    return { grid, periods: Array.from(periodSet).sort((a, b) => a - b) };
  }, [grade, gradeInput, assignments, subjectMap]);

  if (!gradeInput || (gradeInput.subjects.length === 0 && grid.size === 0)) return null;

  const accent = GRADE_ACCENTS[grade];

  return (
    <div className="overflow-x-auto rounded-md border">
      {showHeader && (
        <div
          className={cn(
            'border-b px-2 py-1 font-semibold',
            accent.chip,
            compact ? 'text-[10px]' : 'text-xs',
          )}
        >
          {grade}학년
        </div>
      )}
      <table className={cn('w-full text-center', compact ? 'text-[10px]' : 'text-xs')}>
        <thead className="bg-muted/40">
          <tr>
            <th className="px-1 py-1 w-10"></th>
            {dayIndexes.map((d) => (
              <th key={d} className="px-2 py-1 font-medium">
                {d + 1}일차
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p} className="border-t">
              <th className="px-1 py-1 bg-muted/20 font-medium">{p}교시</th>
              {dayIndexes.map((d) => {
                const cellSubjects = grid.get(`${d}|${p}`) ?? [];
                const periodActive =
                  gradeInput.days
                    .find((day) => day.dayIndex === d)
                    ?.availablePeriods.includes(p) ?? false;
                return (
                  <td
                    key={d}
                    className={cn(
                      'border-l align-top',
                      compact ? 'px-1 py-1 min-h-[24px]' : 'px-2 py-2 min-h-[40px]',
                      !periodActive && 'bg-muted/20 text-muted-foreground/50',
                    )}
                  >
                    {cellSubjects.length === 0 && !periodActive && '—'}
                    {cellSubjects.length > 0 && (
                      <div className="flex flex-col gap-0.5 items-center">
                        {cellSubjects.map((s) => (
                          <span
                            key={s.id}
                            className={cn(
                              'rounded px-1.5 py-0.5 inline-block',
                              s.isMajor
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-emerald-100 text-emerald-800',
                            )}
                          >
                            {s.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
