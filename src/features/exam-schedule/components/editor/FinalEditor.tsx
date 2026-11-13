import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Save, Undo2, AlertTriangle, CheckCircle2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SlotAssignment } from '../../types';
import { useExamScheduleStore } from '../../hooks/useExamScheduleStore';
import { useScheduleValidator } from '../../hooks/useScheduleValidator';
import { useCreateSchedule } from '../../hooks/useSavedSchedules';
import {
  buildRoomPool,
  gradeInputsWithCandidateDays,
  slotSupervision,
  subjectDemandEntry,
} from '../../utils/multiGrade';
import { GradeTabs } from '../shared/GradeTabs';
import { HARD_CONSTRAINT_LABELS, SOFT_CONSTRAINT_LABELS } from '../../constants';

export function FinalEditor() {
  const { state, dispatch, buildInput, selectedCandidate, setStep, setActiveGrade } =
    useExamScheduleStore();
  const [draftAssignments, setDraftAssignments] = useState<SlotAssignment[]>(
    state.finalizedAssignments ?? selectedCandidate?.assignments ?? [],
  );
  const [dragSubject, setDragSubject] = useState<string | null>(null);
  const { toast } = useToast();
  const create = useCreateSchedule();

  // Sync draft when the user picks a different candidate in compare view.
  // Lazy useState initializer only runs once, so without this effect the editor
  // would keep showing the previous candidate's edits after candidate switch.
  const lastSyncedCandidateId = useRef<string | null>(selectedCandidate?.id ?? null);
  useEffect(() => {
    if (!selectedCandidate) return;
    if (lastSyncedCandidateId.current === selectedCandidate.id) return;
    lastSyncedCandidateId.current = selectedCandidate.id;
    setDraftAssignments(selectedCandidate.assignments.map((a) => ({ ...a })));
  }, [selectedCandidate]);

  // 후보가 탐색한 일차별 시험 개수(dayConfigsByGrade)를 입력에 반영
  const input = useMemo(() => {
    const base = buildInput();
    return {
      ...base,
      gradeInputs: gradeInputsWithCandidateDays(base, selectedCandidate),
    };
  }, [buildInput, selectedCandidate]);

  const validation = useScheduleValidator(input, draftAssignments);

  const grade = state.activeGrade;
  const activeGradeInput = input.gradeInputs[grade] ?? state.gradeInputs[grade];

  const subjectMap = useMemo(() => {
    const m = new Map<string, (typeof activeGradeInput.subjects)[number]>();
    for (const g of input.grades) {
      for (const s of input.gradeInputs[g]?.subjects ?? []) m.set(s.id, s);
    }
    return m;
  }, [input, activeGradeInput]);

  const activeSubjectIds = useMemo(
    () => new Set(activeGradeInput.subjects.map((s) => s.id)),
    [activeGradeInput.subjects],
  );

  const periods = useMemo(() => {
    return Array.from(
      new Set(activeGradeInput.days.flatMap((d) => d.availablePeriods)),
    ).sort((a, b) => a - b);
  }, [activeGradeInput.days]);

  // 전 학년 기준 슬롯별 감독·시험실 수요 (편집 중 실시간 갱신).
  // 공통 과목 = 학년 반 수, 선택과목 = 고사실 풀 greedy.
  const demandByCell = useMemo(() => {
    const m = new Map<string, { total: number; fits: boolean }>();
    if (!input.supervision.enabled) return m;
    const cellSubjects = new Map<string, NonNullable<ReturnType<typeof subjectMap.get>>[]>();
    for (const a of draftAssignments) {
      const sub = subjectMap.get(a.subjectId);
      if (!sub) continue;
      const k = `${a.dayIndex}|${a.period}`;
      const arr = cellSubjects.get(k) ?? [];
      arr.push(sub);
      cellSubjects.set(k, arr);
    }
    const pool = buildRoomPool(input.supervision);
    for (const [k, subs] of cellSubjects.entries()) {
      const res = slotSupervision(
        subs.map((s) => subjectDemandEntry(s, input.supervision)),
        input.supervision,
        pool,
      );
      if (res.supervisors > 0) m.set(k, { total: res.supervisors, fits: res.fits });
    }
    return m;
  }, [draftAssignments, subjectMap, input.supervision]);

  const cellAssignments = useMemo(() => {
    const m = new Map<string, SlotAssignment[]>();
    for (const a of draftAssignments) {
      if (!activeSubjectIds.has(a.subjectId)) continue;
      const k = `${a.dayIndex}|${a.period}`;
      const arr = m.get(k) ?? [];
      arr.push(a);
      m.set(k, arr);
    }
    return m;
  }, [draftAssignments, activeSubjectIds]);

  const onDrop = (dayIndex: number, period: number) => {
    if (!dragSubject) return;
    const day = activeGradeInput.days.find((d) => d.dayIndex === dayIndex);
    if (!day || !day.availablePeriods.includes(period)) {
      toast({
        title: '비활성 교시',
        description: '해당 교시는 사용 불가로 설정되어 있습니다.',
        variant: 'destructive',
      });
      return;
    }
    setDraftAssignments((prev) =>
      prev.map((a) =>
        a.subjectId === dragSubject ? { ...a, dayIndex, period } : a,
      ),
    );
    setDragSubject(null);
  };

  const resetDraft = () => {
    if (selectedCandidate) {
      setDraftAssignments(selectedCandidate.assignments.map((a) => ({ ...a })));
    }
  };

  const save = async (status: 'draft' | 'finalized') => {
    if (!state.result) return;
    if (status === 'finalized' && validation && !validation.metrics.hardFeasible) {
      toast({
        title: 'hard 제약 위반',
        description: '확정 저장 전에 학생 충돌·감독 인원 등 필수 제약을 모두 해결해야 합니다.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await create.mutateAsync({
        grades: input.grades,
        title: state.title,
        input,
        result: state.result,
        selectedCandidateId: state.selectedCandidateId,
        finalizedAssignments: draftAssignments,
        status,
      });
      dispatch({ type: 'SET_FINALIZED', assignments: draftAssignments });
      toast({
        title: status === 'finalized' ? '확정 저장 완료' : '임시 저장 완료',
        description: '시험 시간표 목록에서 확인할 수 있습니다.',
      });
      setStep('saved');
    } catch (e) {
      toast({
        title: '저장 실패',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  };

  const sup = input.supervision;
  const overCells = Array.from(demandByCell.entries())
    .filter(([, d]) => d.total > sup.availableSupervisors || !d.fits)
    .sort(([, a], [, b]) => b.total - a.total);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>최종 편집</CardTitle>
          <p className="text-sm text-muted-foreground">
            학년 탭을 전환하며 과목 칩을 드래그해 이동할 수 있습니다. 변경 즉시 전 학년
            제약(학생 충돌·감독 인원)이 재계산됩니다.
          </p>
        </CardHeader>
        <CardContent>
          <div className="mb-3">
            <GradeTabs
              grades={input.grades}
              active={grade}
              onSelect={setActiveGrade}
              badge={(g) => `${input.gradeInputs[g]?.subjects.length ?? 0}과목`}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-center text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="w-12 px-1 py-1"></th>
                    {activeGradeInput.days.map((d) => (
                      <th key={d.dayIndex} className="px-2 py-1 font-medium">
                        {d.dayIndex + 1}일차
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periods.map((p) => (
                    <tr key={p} className="border-t">
                      <th className="bg-muted/20 px-1 py-1 font-medium">{p}교시</th>
                      {activeGradeInput.days.map((d) => {
                        const cellKey = `${d.dayIndex}|${p}`;
                        const cellSubjects = cellAssignments.get(cellKey) ?? [];
                        const periodActive = d.availablePeriods.includes(p);
                        const cellDemand = demandByCell.get(cellKey);
                        const demand = cellDemand?.total ?? 0;
                        const over =
                          sup.enabled &&
                          (demand > sup.availableSupervisors || cellDemand?.fits === false);
                        return (
                          <td
                            key={d.dayIndex}
                            onDragOver={(e) => {
                              if (periodActive) e.preventDefault();
                            }}
                            onDrop={() => onDrop(d.dayIndex, p)}
                            className={cn(
                              'border-l align-top px-1.5 py-2 min-h-[60px]',
                              !periodActive && 'bg-muted/20 text-muted-foreground/40',
                              periodActive && 'hover:bg-amber-50',
                              over && 'bg-rose-50',
                            )}
                          >
                            {!periodActive && '—'}
                            {periodActive && (
                              <div className="flex flex-col gap-1 items-center">
                                {cellSubjects.map((a) => {
                                  const sub = subjectMap.get(a.subjectId);
                                  if (!sub) return null;
                                  return (
                                    <div
                                      key={a.subjectId}
                                      draggable
                                      onDragStart={() => setDragSubject(a.subjectId)}
                                      onDragEnd={() => setDragSubject(null)}
                                      className={cn(
                                        'cursor-grab active:cursor-grabbing rounded px-1.5 py-1 text-[11px]',
                                        sub.isMajor
                                          ? 'bg-rose-100 text-rose-800'
                                          : 'bg-emerald-100 text-emerald-800',
                                      )}
                                    >
                                      {sub.name}
                                    </div>
                                  );
                                })}
                                {sup.enabled && demand > 0 && (
                                  <span
                                    className={cn(
                                      'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium tabular-nums',
                                      over
                                        ? 'bg-rose-600 text-white'
                                        : 'bg-slate-100 text-slate-600',
                                    )}
                                    title={`전 학년 감독 수요 ${demand}명 / 가용 ${sup.availableSupervisors}명${
                                      cellDemand?.fits === false ? ' · 고사실 부족!' : ''
                                    }`}
                                  >
                                    <Users className="h-2.5 w-2.5" />
                                    {demand}/{sup.availableSupervisors}
                                  </span>
                                )}
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

            <div className="space-y-3 text-sm">
              <div className="rounded-md border p-3">
                <div className="font-medium mb-2 flex items-center gap-2">
                  {validation?.metrics.hardFeasible ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      필수 제약 만족
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-4 w-4 text-rose-600" />
                      필수 제약 위반
                    </>
                  )}
                </div>
                {validation && (
                  <ul className="space-y-1 text-xs">
                    {validation.score.hard
                      .filter((h) => h.count > 0)
                      .map((h) => (
                        <li key={h.id} className="flex justify-between text-rose-700">
                          <span>{HARD_CONSTRAINT_LABELS[h.id] ?? h.id}</span>
                          <span className="tabular-nums">{h.count}건</span>
                        </li>
                      ))}
                    {validation.score.hard.every((h) => h.count === 0) && (
                      <li className="text-emerald-700">모든 hard 제약을 만족합니다.</li>
                    )}
                  </ul>
                )}
              </div>

              {sup.enabled && (
                <div className="rounded-md border p-3">
                  <div className="font-medium mb-2 flex items-center gap-2">
                    <Users className="h-4 w-4 text-slate-600" />
                    감독 인원 현황
                  </div>
                  <ul className="space-y-1 text-xs">
                    <li className="flex justify-between">
                      <span>가용 인원 (교시당)</span>
                      <span className="tabular-nums font-medium">
                        {sup.availableSupervisors}명
                      </span>
                    </li>
                    <li className="flex justify-between">
                      <span>현재 피크 수요</span>
                      <span
                        className={cn(
                          'tabular-nums font-medium',
                          (validation?.metrics.peakSupervisorDemand ?? 0) >
                            sup.availableSupervisors && 'text-rose-600',
                        )}
                      >
                        {validation?.metrics.peakSupervisorDemand ?? 0}명
                      </span>
                    </li>
                    {overCells.length > 0 ? (
                      overCells.slice(0, 5).map(([key, cell]) => {
                        const [d, p] = key.split('|').map(Number);
                        const overBy = cell.total - sup.availableSupervisors;
                        return (
                          <li key={key} className="flex justify-between text-rose-700">
                            <span>
                              {d + 1}일차 {p}교시 {cell.fits ? '초과' : '고사실 부족'}
                            </span>
                            <span className="tabular-nums">
                              {overBy > 0 ? `${overBy}명` : '—'}
                            </span>
                          </li>
                        );
                      })
                    ) : (
                      <li className="text-emerald-700">모든 교시가 가용 인원 이내입니다.</li>
                    )}
                  </ul>
                </div>
              )}

              <div className="rounded-md border p-3">
                <div className="font-medium mb-2">soft 페널티</div>
                {validation && (
                  <ul className="space-y-1 text-xs">
                    {validation.score.soft
                      .filter((s) => s.weight !== 0 || s.count > 0)
                      .map((s) => (
                        <li
                          key={s.id}
                          className={cn(
                            'flex justify-between',
                            s.penalty > 0 ? 'text-amber-700' : 'text-muted-foreground',
                          )}
                        >
                          <span>{SOFT_CONSTRAINT_LABELS[s.id] ?? s.id}</span>
                          <span className="tabular-nums">
                            {s.count} × {s.weight} = {s.penalty.toFixed(1)}
                          </span>
                        </li>
                      ))}
                    <li className="flex justify-between border-t pt-1 font-medium">
                      <span>총점</span>
                      <span className="tabular-nums">
                        {Number.isFinite(validation.score.total)
                          ? validation.score.total.toFixed(1)
                          : '∞'}
                      </span>
                    </li>
                  </ul>
                )}
              </div>

              <div className="rounded-md border p-3">
                <div className="font-medium mb-2">메트릭</div>
                {validation && (
                  <ul className="space-y-1 text-xs">
                    <li>
                      평균 시험 수: <b>{validation.metrics.avgExamsPerStudent.toFixed(1)}</b>
                    </li>
                    <li>
                      하루 최대: <b>{validation.metrics.maxExamsPerStudentInOneDay}</b>
                    </li>
                    <li>
                      일차별 부담 편차: <b>{validation.metrics.studentLoadStdev.toFixed(2)}</b>
                    </li>
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <Button variant="outline" onClick={() => setStep('compare')}>
              비교 화면으로
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={resetDraft} className="gap-1">
                <Undo2 className="h-4 w-4" /> 후보 원본으로 되돌리기
              </Button>
              <Button variant="outline" onClick={() => save('draft')} className="gap-1">
                <Save className="h-4 w-4" /> 임시 저장
              </Button>
              <Button onClick={() => save('finalized')} className="gap-1">
                <CheckCircle2 className="h-4 w-4" /> 확정 저장
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
