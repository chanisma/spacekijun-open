import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, History } from 'lucide-react';
import { useExamScheduleStore } from '../../hooks/useExamScheduleStore';
import { useSavedSchedule } from '../../hooks/useSavedSchedules';
import { useExamSubjectCandidates } from '../../hooks/useExamSubjectCandidates';
import { normalizeScheduleInput } from '../../utils/multiGrade';
import { buildExamSubject } from '../../utils/subjectCategorizer';
import type { ExamSubject, Grade, GradeInput } from '../../types';

/**
 * 저장된 생성 결과(/exam-schedule/new?from=<id>)에서 위저드 설정을 복원한다.
 *
 * 저장 시 studentCodes(PII)가 제거되므로, 과목명을 키로 현재 학생 시간표
 * 데이터(get_exam_subject_candidates)와 매칭해 응시자를 다시 채운다.
 * 주요교과 플래그·일차/교시 설정·고정 배치·감독/알고리즘 옵션은 저장본을
 * 그대로 복원하며, 더 이상 개설되지 않는 과목은 제외하고 경고로 알린다.
 */
export function SavedSetupLoader({ savedId }: { savedId: string }) {
  const { dispatch } = useExamScheduleStore();
  const { data: row, isLoading, error } = useSavedSchedule(savedId);

  const normalized = row ? normalizeScheduleInput(row.input_payload) : null;
  const wants = (g: Grade) => (normalized?.grades.includes(g) ? g : null);
  const q1 = useExamSubjectCandidates(wants(1));
  const q2 = useExamSubjectCandidates(wants(2));
  const q3 = useExamSubjectCandidates(wants(3));
  const queries: Record<Grade, typeof q1> = useMemo(
    () => ({ 1: q1, 2: q2, 3: q3 }),
    [q1, q2, q3],
  );

  const [missing, setMissing] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const hydratedFor = useRef<string | null>(null);

  const candidatesReady =
    !!normalized && normalized.grades.every((g) => queries[g].data !== undefined);

  useEffect(() => {
    if (!row || !normalized || !candidatesReady) return;
    if (hydratedFor.current === savedId) return;
    hydratedFor.current = savedId;

    const missingNames: string[] = [];
    const gradeInputs: Partial<Record<Grade, GradeInput>> = {};
    let examDays = 3;

    for (const g of normalized.grades) {
      const saved = normalized.gradeInputs[g];
      if (!saved) continue;
      examDays = saved.days.length || saved.examDays || examDays;
      const fresh = queries[g].data ?? [];
      const subjects: ExamSubject[] = [];
      for (const s of saved.subjects) {
        const match = fresh.find((c) => c.subject === s.name);
        if (!match) {
          missingNames.push(`${g}학년 ${s.name}`);
          continue;
        }
        const rebuilt = buildExamSubject(
          {
            name: match.subject,
            studentCodes: match.student_codes,
            isUniversal: match.is_universal,
          },
          g,
        );
        subjects.push({ ...rebuilt, isMajor: s.isMajor });
      }
      const validIds = new Set(subjects.map((s) => s.id));
      gradeInputs[g] = {
        ...saved,
        subjects,
        pinned: saved.pinned.filter((p) => validIds.has(p.subjectId)),
      };
    }

    dispatch({
      type: 'LOAD_SETUP',
      payload: {
        title: row.title,
        grades: normalized.grades,
        examDays,
        gradeInputs,
        supervision: normalized.supervision,
        options: normalized.options,
        weights: normalized.weights,
      },
    });
    setMissing(missingNames);
    setHydrated(true);
  }, [row, normalized, candidatesReady, savedId, dispatch, queries]);

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        저장된 시간표 설정을 불러오지 못했습니다:{' '}
        {error instanceof Error ? error.message : String(error)}
      </div>
    );
  }

  if (isLoading || (!hydrated && !row)) {
    return <Skeleton className="h-12 w-full" />;
  }

  if (row && !hydrated) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
        <History className="h-4 w-4 animate-pulse" />
        '{row.title}' 설정 복원 중 — 최신 학생 시간표 기준으로 응시자를 갱신하고 있습니다…
      </div>
    );
  }

  if (!row) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        저장된 시간표를 찾을 수 없습니다. 새 설정으로 진행해 주세요.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
        <History className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div>
          <b>'{row.title}'</b> 설정으로 처음부터 다시 진행합니다. 과목 응시자는{' '}
          <b>현재 학생 시간표 기준</b>으로 갱신되었으며, 모든 단계에서 설정을 수정한 뒤
          새 결과로 저장할 수 있습니다 (기존 저장본은 변경되지 않음).
        </div>
      </div>
      {missing.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            다음 과목은 현재 개설 데이터에 없어 제외되었습니다:{' '}
            <b>{missing.join(', ')}</b> — 필요하면 1단계에서 다시 선택해 주세요.
          </div>
        </div>
      )}
    </div>
  );
}
