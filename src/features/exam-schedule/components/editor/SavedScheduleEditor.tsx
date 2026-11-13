import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Info, Save, Undo2, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  ExamScheduleInput,
  ExamSubject,
  SavedExamSchedule,
  SlotAssignment,
} from '../../types';
import { useScheduleValidator } from '../../hooks/useScheduleValidator';
import { useUpdateSchedule } from '../../hooks/useSavedSchedules';
import {
  buildRoomPool,
  slotSupervision,
  subjectDemandEntry,
} from '../../utils/multiGrade';
import { GradeTabs } from '../shared/GradeTabs';
import { HARD_CONSTRAINT_LABELS } from '../../constants';

/**
 * 저장본 배치 편집기. 위저드를 거치지 않고 저장된 시간표의
 * finalized_assignments를 직접 수정한다. 저장본은 PII(학생 코드)가 제거되어
 * 학생 충돌은 재검증할 수 없고, 감독·시험실 수요와 구조 제약만 검증한다.
 */
export function SavedScheduleEditor({
  row,
  input,
  onClose,
}: {
  row: SavedExamSchedule;
  input: ExamScheduleInput;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const update = useUpdateSchedule();
  const [draft, setDraft] = useState<SlotAssignment[]>(
    (row.finalized_assignments ?? []).map((a) => ({ ...a })),
  );
  const [activeGrade, setActiveGrade] = useState(input.grades[0] ?? 1);
  const [dragSubject, setDragSubject] = useState<string | null>(null);

  const validation = useScheduleValidator(input, draft);

  const subjectMap = useMemo(() => {
    const m = new Map<string, ExamSubject>();
    for (const g of input.grades) {
      for (const s of input.gradeInputs[g]?.subjects ?? []) m.set(s.id, s);
    }
    return m;
  }, [input]);

  const gradeInput = input.gradeInputs[activeGrade];
  const days = useMemo(() => gradeInput?.days ?? [], [gradeInput]);
  const periods = useMemo(
    () =>
      Array.from(new Set(days.flatMap((d) => d.availablePeriods))).sort(
        (a, b) => a - b,
      ),
    [days],
  );

  const activeSubjectIds = useMemo(
    () => new Set((gradeInput?.subjects ?? []).map((s) => s.id)),
    [gradeInput],
  );

  const cellAssignments = useMemo(() => {
    const m = new Map<string, SlotAssignment[]>();
    for (const a of draft) {
      if (!activeSubjectIds.has(a.subjectId)) continue;
      const k = `${a.dayIndex}|${a.period}`;
      const arr = m.get(k) ?? [];
      arr.push(a);
      m.set(k, arr);
    }
    return m;
  }, [draft, activeSubjectIds]);

  // 전 학년 합산 감독 수요 (편집 중 실시간)
  const demandByCell = useMemo(() => {
    const m = new Map<string, { total: number; fits: boolean }>();
    if (!input.supervision.enabled) return m;
    const cellSubjects = new Map<string, ExamSubject[]>();
    for (const a of draft) {
      const sub = subjectMap.get(a.subjectId);
      if (!sub) continue;
      const k = `${a.dayIndex}|${a.period}`;
      const arr = cellSubjects.get(k) ?? [];
      arr.push(sub);
      cellSubjects.set(k, arr);
    }
    const pool = buildRoomPool(input.supervision);
    for (const [k, subs] of cellSubjects) {
      const res = slotSupervision(
        subs.map((s) => subjectDemandEntry(s, input.supervision)),
        input.supervision,
        pool,
      );
      if (res.supervisors > 0) m.set(k, { total: res.supervisors, fits: res.fits });
    }
    return m;
  }, [draft, subjectMap, input.supervision]);

  const onDrop = (dayIndex: number, period: number) => {
    if (!dragSubject) return;
    const day = days.find((d) => d.dayIndex === dayIndex);
    if (!day || !day.availablePeriods.includes(period)) {
      toast({
        title: '비활성 교시',
        description: '해당 교시는 사용 불가로 설정되어 있습니다.',
        variant: 'destructive',
      });
      return;
    }
    setDraft((prev) =>
      prev.map((a) => (a.subjectId === dragSubject ? { ...a, dayIndex, period } : a)),
    );
    setDragSubject(null);
  };

  const save = async () => {
    try {
      await update.mutateAsync({
        id: row.id,
        patch: { finalized_assignments: draft },
      });
      onClose();
    } catch (e) {
      toast({
        title: '저장 실패',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  };

  const sup = input.supervision;
  const hardIssues = (validation?.score.hard ?? []).filter((h) => h.count > 0);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-1.5 rounded-md border border-sky-200 bg-sky-50 p-2 text-xs text-sky-800">
        <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
        저장본에는 학생 명단이 보관되지 않아 학생 응시 충돌은 재검증되지
        않습니다. 과목 이동 시 감독 수요·시험실 제약만 실시간으로 확인됩니다.
      </div>

      <div className="flex items-center justify-between gap-2">
        <GradeTabs
          grades={input.grades}
          active={activeGrade}
          onSelect={setActiveGrade}
          badge={(g) => `${input.gradeInputs[g]?.subjects.length ?? 0}과목`}
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setDraft((row.finalized_assignments ?? []).map((a) => ({ ...a })))
            }
            className="gap-1"
          >
            <Undo2 className="h-3.5 w-3.5" /> 되돌리기
          </Button>
          <Button size="sm" variant="outline" onClick={onClose} className="gap-1">
            <X className="h-3.5 w-3.5" /> 닫기
          </Button>
          <Button size="sm" onClick={save} disabled={update.isPending} className="gap-1">
            <Save className="h-3.5 w-3.5" /> 배치 저장
          </Button>
        </div>
      </div>

      {hardIssues.length > 0 && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700 space-y-0.5">
          {hardIssues.map((h) => (
            <div key={h.id} className="flex justify-between">
              <span>{HARD_CONSTRAINT_LABELS[h.id] ?? h.id}</span>
              <span className="tabular-nums">{h.count}건</span>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-center text-xs">
          <thead className="bg-muted/40">
            <tr>
              <th className="w-12 px-1 py-1"></th>
              {days.map((d) => (
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
                {days.map((d) => {
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
                        <div className="flex flex-col items-center gap-1">
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
                                  'cursor-grab rounded px-1.5 py-1 text-[11px] active:cursor-grabbing',
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
    </div>
  );
}
