import React, { useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useExamScheduleStore } from '../../hooks/useExamScheduleStore';
import { useExamScheduleRun } from '../../hooks/useExamScheduleRun';
import { gradesLabel } from '../../utils/multiGrade';
import type { ExamScheduleInput, Grade, GradeInput, PreflightReport } from '../../types';
import { Sparkles, Loader2, AlertTriangle } from 'lucide-react';

const PHASE_LABEL: Record<string, string> = {
  init: '초기화',
  csp: 'CSP 초기 해 탐색',
  sa: 'Simulated Annealing 최적화',
  finalize: 'TOP 5 정리',
};

function gradeShortages(p: PreflightReport): Array<{ grade: Grade; shortage: number }> {
  return p.byGrade
    .map((g) => ({ grade: g.grade, shortage: g.minSlotsRequired - g.totalSlots }))
    .filter((x) => x.shortage > 0);
}

export function Step5Generate() {
  const { state, dispatch, buildInput, setStep } = useExamScheduleStore();
  const { status, progress, result, error, start } = useExamScheduleRun();

  /**
   * 학년별 슬롯 부족분을 해당 학년의 일차에 라운드로빈으로 분배한 뒤,
   * 갱신된 입력으로 즉시 재실행한다 (React 상태 커밋 레이스 방지).
   */
  const autoFixDistribute = useCallback(
    (shortages: Array<{ grade: Grade; shortage: number }>) => {
      if (shortages.length === 0) return;
      const nextGradeInputs: Partial<Record<Grade, GradeInput>> = {};
      for (const { grade, shortage } of shortages) {
        const gi = state.gradeInputs[grade];
        const updates = gi.days.map((d) => ({ ...d }));
        let remaining = shortage;
        let idx = 0;
        let safetyHops = 0;
        while (remaining > 0 && safetyHops < updates.length * 4) {
          const target = updates[idx % updates.length];
          if (target.examCount < target.availablePeriods.length) {
            target.examCount += 1;
            remaining -= 1;
          }
          idx += 1;
          safetyHops += 1;
        }
        for (const u of updates) {
          dispatch({
            type: 'SET_DAY_CONFIG',
            grade,
            dayIndex: u.dayIndex,
            patch: { examCount: u.examCount },
          });
        }
        nextGradeInputs[grade] = { ...gi, days: updates };
      }
      const base = buildInput();
      const input: ExamScheduleInput = {
        ...base,
        gradeInputs: { ...base.gradeInputs, ...nextGradeInputs },
      };
      start(input);
    },
    [state.gradeInputs, dispatch, buildInput, start],
  );

  useEffect(() => {
    if (status === 'done' && result) {
      dispatch({ type: 'SET_RESULT', result });
      // Only auto-advance if we actually generated candidates. Otherwise stay
      // here so the user can read the diagnostic instead of seeing an empty
      // compare screen.
      if (result.candidates.length > 0) setStep('compare');
    }
  }, [status, result, dispatch, setStep]);

  const ratio = progress
    ? Math.min(100, Math.round((progress.current / Math.max(1, progress.total)) * 100))
    : 0;

  const launch = () => {
    start(buildInput());
  };

  const sup = state.supervision;
  const totalSubjects = state.grades.reduce(
    (acc, g) => acc + state.gradeInputs[g].subjects.length,
    0,
  );
  const totalPinned = state.grades.reduce(
    (acc, g) => acc + state.gradeInputs[g].pinned.length,
    0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>TOP 5 통합 시험 시간표 생성</CardTitle>
        <p className="text-sm text-muted-foreground">
          {gradesLabel(state.grades)} 시간표를 한 번에 생성합니다. 교시별 감독 수요를
          학년 합산으로 검증하며, 처리 모드에 따라 수 초 ~ 30초가 소요됩니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-md border bg-muted/20 p-4 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div>대상: <b>{gradesLabel(state.grades)}</b></div>
            <div>시험 일수: <b>{state.examDays}일</b></div>
            <div>
              과목 수:{' '}
              <b>
                {state.grades
                  .map((g) => `${g}학년 ${state.gradeInputs[g].subjects.length}`)
                  .join(' · ')}{' '}
                (총 {totalSubjects})
              </b>
            </div>
            <div>고정 배치: <b>{totalPinned}건</b></div>
            <div>처리 모드: <b>{state.options.runMode}</b></div>
            <div>주요교과 정책: <b>{state.options.majorSubjectsSpread}</b></div>
            <div>
              감독 제약:{' '}
              <b>
                {sup.enabled
                  ? `${sup.availableSupervisors}명 / 실당 ${sup.supervisorsPerRoom}명 / 고사실 ${sup.roomTiers.reduce((acc, t) => acc + t.count, 0)}실 (${sup.hard ? 'Hard' : 'Soft'})`
                  : '미사용'}
              </b>
            </div>
            <div>시험 개수: <b>{state.options.examCountMode === 'auto' ? '자동 탐색' : '고정'}</b></div>
          </div>
        </div>

        {status === 'idle' && (
          <Button size="lg" onClick={launch} className="w-full gap-2">
            <Sparkles className="h-4 w-4" />
            TOP 5 시간표 생성 시작
          </Button>
        )}

        {status === 'running' && progress && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
              <span>{PHASE_LABEL[progress.phase] ?? progress.phase}</span>
              <span className="ml-auto tabular-nums">{ratio}%</span>
            </div>
            <Progress value={ratio} />
            {progress.message && (
              <p className="text-xs text-muted-foreground">{progress.message}</p>
            )}
          </div>
        )}

        {status === 'error' && error && (
          <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-800">
            <AlertTriangle className="h-4 w-4 mt-0.5" />
            <div className="text-sm">
              <div className="font-medium">알고리즘 실행 중 오류</div>
              <div className="text-xs mt-1">{error}</div>
              <Button size="sm" variant="outline" className="mt-2" onClick={launch}>
                다시 시도
              </Button>
            </div>
          </div>
        )}

        {status === 'done' && result && result.candidates.length === 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="text-sm space-y-2 flex-1">
              <div className="font-medium">생성된 시간표가 없습니다</div>
              {result.diagnostics.preflight && (
                <div className="text-xs space-y-0.5">
                  {result.diagnostics.preflight.byGrade.map((g) => (
                    <div key={g.grade}>
                      {g.grade}학년: 과목 <b>{g.totalSubjects}개</b> · 슬롯{' '}
                      <b>{g.totalSlots}개</b> · 최소 필요 <b>{g.minSlotsRequired}개</b>{' '}
                      (충돌 동시 응시 {g.maxClique}개 기준)
                    </div>
                  ))}
                  {result.diagnostics.preflight.supervision && (
                    <div>
                      감독: 가용 <b>{result.diagnostics.preflight.supervision.available}명</b>{' '}
                      · 최대 단일 과목 수요{' '}
                      <b>{result.diagnostics.preflight.supervision.maxSubjectDemand}명</b> ·
                      총수요 <b>{result.diagnostics.preflight.supervision.totalDemand}명</b> /
                      상한 <b>{result.diagnostics.preflight.supervision.totalCapacity}명</b>
                    </div>
                  )}
                </div>
              )}
              {/* warnings 또는 reason 중 하나만 표시. preflight 실패면 warnings 우선,
                  아니면 reason (CSP 단계 실패 등). */}
              {result.diagnostics.preflight?.warnings?.length ? (
                <ul className="list-disc list-inside text-xs space-y-0.5">
                  {result.diagnostics.preflight.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              ) : result.diagnostics.reason ? (
                <div className="text-xs whitespace-pre-line">{result.diagnostics.reason}</div>
              ) : null}

              {result.diagnostics.preflight &&
                gradeShortages(result.diagnostics.preflight).length > 0 && (
                  <div className="rounded border border-amber-400 bg-amber-100 p-2 text-xs">
                    <div className="font-medium mb-1">💡 자동 수정 제안</div>
                    <div>
                      {gradeShortages(result.diagnostics.preflight)
                        .map((s) => `${s.grade}학년 슬롯 +${s.shortage}`)
                        .join(', ')}{' '}
                      만큼 일차별 시험 개수를 늘리면 해결됩니다.
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          autoFixDistribute(
                            gradeShortages(result.diagnostics.preflight!),
                          )
                        }
                      >
                        자동으로 늘리기
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setStep('periods')}>
                        직접 조정
                      </Button>
                    </div>
                  </div>
                )}

              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => setStep('periods')}>
                  교시/감독 설정으로
                </Button>
                <Button size="sm" variant="outline" onClick={() => setStep('basic')}>
                  과목 다시 선택
                </Button>
                <Button size="sm" onClick={launch}>다시 시도</Button>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setStep('pinned')} disabled={status === 'running'}>
            이전
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
