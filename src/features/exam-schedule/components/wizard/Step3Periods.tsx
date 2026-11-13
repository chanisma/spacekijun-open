import React, { useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Wand2, CalendarDays, ShieldCheck, Plus, X } from 'lucide-react';
import { useExamScheduleStore } from '../../hooks/useExamScheduleStore';
import { useTeacherCount } from '../../hooks/useTeacherCount';
import { useClassCounts } from '../../hooks/useClassCounts';
import { runPreflight } from '../../algorithm/preflight';
import { DEFAULT_SUPERVISION } from '../../constants';
import { GradeTabs } from '../shared/GradeTabs';

const PERIODS = [1, 2, 3, 4, 5, 6, 7];

export function Step3Periods() {
  const { state, dispatch, setStep, setActiveGrade, activeGradeInput, buildInput } =
    useExamScheduleStore();
  const teacherCount = useTeacherCount();

  const grade = state.activeGrade;
  const days = activeGradeInput.days;
  const subjectCount = activeGradeInput.subjects.length;
  const autoExamCounts = state.options.examCountMode === 'auto';
  const sup = state.supervision;

  // 교사 수 로딩 완료 시 가용 감독 인원 기본값을 1회 동기화.
  // 사용자가 조정했거나 저장본에서 복원된 값(기본 상수와 다른 값)은 덮어쓰지 않는다.
  const appliedTeacherDefault = useRef(false);
  useEffect(() => {
    if (appliedTeacherDefault.current) return;
    if (typeof teacherCount.data === 'number' && teacherCount.data > 0) {
      appliedTeacherDefault.current = true;
      if (sup.availableSupervisors === DEFAULT_SUPERVISION.availableSupervisors) {
        dispatch({
          type: 'SET_SUPERVISION',
          patch: { availableSupervisors: teacherCount.data },
        });
      }
    }
  }, [teacherCount.data, sup.availableSupervisors, dispatch]);

  // 학년별 반 수 기본값 — DB(student_basic_info) 집계로 1회 보정.
  // 사용자가 조정한 값(기본 상수와 다른 값)은 덮어쓰지 않는다.
  const classCounts = useClassCounts();
  const appliedClassDefault = useRef(false);
  useEffect(() => {
    if (appliedClassDefault.current) return;
    const data = classCounts.data;
    if (!data || Object.keys(data).length === 0) return;
    appliedClassDefault.current = true;
    const untouched = state.grades.every(
      (g) =>
        sup.classCountByGrade[g] === DEFAULT_SUPERVISION.classCountByGrade[g],
    );
    if (untouched) {
      dispatch({
        type: 'SET_SUPERVISION',
        patch: { classCountByGrade: { ...sup.classCountByGrade, ...data } },
      });
    }
  }, [classCounts.data, state.grades, sup.classCountByGrade, dispatch]);

  // 자동 분배: 사용자가 해당 학년을 커스터마이즈하지 않았다면 과목 수에 맞춰 분배
  useEffect(() => {
    if (autoExamCounts || state.daysCustomized[grade] || subjectCount === 0) return;
    const slotCount = days.reduce((acc, d) => acc + d.examCount, 0);
    if (slotCount !== subjectCount) {
      dispatch({ type: 'AUTO_DISTRIBUTE_EXAM_COUNTS', grade });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grade]);

  const preflight = useMemo(
    () => runPreflight(buildInput()),
    [buildInput],
  );
  const gradePreflight = preflight.byGrade.find((g) => g.grade === grade);

  const togglePeriod = (dayIndex: number, period: number) => {
    dispatch({ type: 'TOGGLE_PERIOD_ACTIVE', grade, dayIndex, period });
  };

  const setExamCount = (dayIndex: number, raw: string) => {
    const day = days.find((d) => d.dayIndex === dayIndex);
    const cap = day ? day.availablePeriods.length : 7;
    const v = Math.max(0, Math.min(cap, Number(raw) || 0));
    dispatch({ type: 'SET_DAY_CONFIG', grade, dayIndex, patch: { examCount: v } });
  };

  const totalSlotCount = days.reduce(
    (acc, d) => acc + (autoExamCounts ? d.availablePeriods.length : d.examCount),
    0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>일차별 시험 개수·교시 및 감독 설정</CardTitle>
        <p className="text-sm text-muted-foreground">
          시험 일수는 전 학년이 공유합니다. 일차별 시험 개수와 사용 교시는 학년별로,
          감독 인원 제약은 전교 공통으로 설정합니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-amber-600" />
            <Label className="text-sm font-medium">시험 일수 (전 학년 공유)</Label>
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((d) => (
              <Button
                key={d}
                type="button"
                size="sm"
                variant={state.examDays === d ? 'default' : 'outline'}
                onClick={() => dispatch({ type: 'SET_EXAM_DAYS', days: d })}
              >
                {d}일
              </Button>
            ))}
          </div>
        </div>

        {/* 감독 인원 제약 — 전 학년 결합 제약 */}
        <div className="rounded-md border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <Label className="text-sm font-medium">감독 인원 제약</Label>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {sup.enabled ? (sup.hard ? 'HARD 적용' : 'Soft 페널티') : '미사용'}
              </span>
              <Switch
                checked={sup.enabled}
                onCheckedChange={(v) =>
                  dispatch({ type: 'SET_SUPERVISION', patch: { enabled: v } })
                }
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            <b>공통 과목</b>은 모든 학생이 각 반에서 응시 → 시험실 수 = 학년 반 수.{' '}
            <b>선택과목</b>은 지정 고사실로 이동 → 정원이 다른 고사실 풀에서 배정.
            교시별 감독 수요는 (반 시험실 + 고사실) × 실당 감독 인원의 전 학년 합산이며,
            이 제약이 학년 간 배치를 자동으로 분산시킵니다.
          </p>
          {sup.enabled && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">가용 감독 인원 (교시당)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={sup.availableSupervisors}
                    onChange={(e) =>
                      dispatch({
                        type: 'SET_SUPERVISION',
                        patch: {
                          availableSupervisors: Math.max(1, Number(e.target.value) || 1),
                        },
                      })
                    }
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {teacherCount.data
                      ? `교사 리소스 ${teacherCount.data}명 기준 · 출제/결강 인원을 빼고 조정하세요`
                      : '교사 수 조회 중…'}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">시험실당 감독 인원</Label>
                  <Input
                    type="number"
                    min={1}
                    max={3}
                    value={sup.supervisorsPerRoom}
                    onChange={(e) =>
                      dispatch({
                        type: 'SET_SUPERVISION',
                        patch: {
                          supervisorsPerRoom: Math.max(
                            1,
                            Math.min(3, Number(e.target.value) || 1),
                          ),
                        },
                      })
                    }
                  />
                </div>
              </div>

              {/* 공통 과목 시험실: 학년별 반 수 */}
              <div className="space-y-2 rounded-md border p-2.5">
                <Label className="text-xs">
                  학년별 반 수{' '}
                  <span className="font-normal text-muted-foreground">
                    — 공통(전체 응시) 과목은 각 반에서 응시 (시험실 수 = 반 수)
                  </span>
                </Label>
                <div className="flex flex-wrap gap-3">
                  {state.grades.map((g) => (
                    <div key={g} className="flex items-center gap-1.5">
                      <span className="text-xs font-medium">{g}학년</span>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        value={sup.classCountByGrade[g] ?? 9}
                        onChange={(e) =>
                          dispatch({
                            type: 'SET_SUPERVISION',
                            patch: {
                              classCountByGrade: {
                                ...sup.classCountByGrade,
                                [g]: Math.max(1, Math.min(20, Number(e.target.value) || 1)),
                              },
                            },
                          })
                        }
                        className="w-16 text-center"
                      />
                      <span className="text-xs text-muted-foreground">반</span>
                    </div>
                  ))}
                </div>
                {classCounts.data && Object.keys(classCounts.data).length > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    DB 기준:{' '}
                    {Object.entries(classCounts.data)
                      .map(([g, n]) => `${g}학년 ${n}반`)
                      .join(' · ')}
                  </p>
                )}
              </div>

              {/* 선택과목 고사실 풀: 정원이 다른 교실 묶음 */}
              <div className="space-y-2 rounded-md border p-2.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">
                    선택과목 고사실{' '}
                    <span className="font-normal text-muted-foreground">
                      — 정원이 다른 교실을 묶음으로 추가 (응시자가 많은 과목부터 큰 교실 배정)
                    </span>
                  </Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    onClick={() =>
                      dispatch({
                        type: 'SET_SUPERVISION',
                        patch: { roomTiers: [...sup.roomTiers, { capacity: 28, count: 1 }] },
                      })
                    }
                  >
                    <Plus className="h-3 w-3" /> 고사실 추가
                  </Button>
                </div>
                <div className="space-y-1.5">
                  {sup.roomTiers.map((tier, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">정원</span>
                      <Input
                        type="number"
                        min={5}
                        max={60}
                        value={tier.capacity}
                        onChange={(e) =>
                          dispatch({
                            type: 'SET_SUPERVISION',
                            patch: {
                              roomTiers: sup.roomTiers.map((t, j) =>
                                j === i
                                  ? {
                                      ...t,
                                      capacity: Math.max(
                                        5,
                                        Math.min(60, Number(e.target.value) || 28),
                                      ),
                                    }
                                  : t,
                              ),
                            },
                          })
                        }
                        className="w-16 text-center"
                      />
                      <span className="text-muted-foreground">명 ×</span>
                      <Input
                        type="number"
                        min={1}
                        max={40}
                        value={tier.count}
                        onChange={(e) =>
                          dispatch({
                            type: 'SET_SUPERVISION',
                            patch: {
                              roomTiers: sup.roomTiers.map((t, j) =>
                                j === i
                                  ? {
                                      ...t,
                                      count: Math.max(
                                        1,
                                        Math.min(40, Number(e.target.value) || 1),
                                      ),
                                    }
                                  : t,
                              ),
                            },
                          })
                        }
                        className="w-16 text-center"
                      />
                      <span className="text-muted-foreground">실</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-rose-600"
                        disabled={sup.roomTiers.length <= 1}
                        onClick={() =>
                          dispatch({
                            type: 'SET_SUPERVISION',
                            patch: { roomTiers: sup.roomTiers.filter((_, j) => j !== i) },
                          })
                        }
                        aria-label="고사실 묶음 삭제"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  총{' '}
                  <b>
                    {sup.roomTiers.reduce((acc, t) => acc + Math.max(0, t.count), 0)}실 ·{' '}
                    {sup.roomTiers.reduce(
                      (acc, t) => acc + Math.max(0, t.count) * Math.max(1, t.capacity),
                      0,
                    )}
                    명 수용
                  </b>{' '}
                  — 공통 과목용 반 교실은 여기에 포함하지 마세요.
                </p>
              </div>
              <div className="flex items-center justify-between rounded-md bg-muted/30 p-2">
                <div className="text-xs">
                  <span className="font-medium">HARD 적용</span>
                  <span className="ml-2 text-muted-foreground">
                    켜면 수요 초과 후보를 생성 단계에서 제외, 끄면 큰 페널티로만 회피
                  </span>
                </div>
                <Switch
                  checked={sup.hard}
                  onCheckedChange={(v) =>
                    dispatch({ type: 'SET_SUPERVISION', patch: { hard: v } })
                  }
                  className="data-[state=checked]:bg-rose-600"
                />
              </div>
              {preflight.supervision && (
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                  <div className="rounded border p-2">
                    <div className="text-muted-foreground">가용 인원</div>
                    <div className="font-semibold tabular-nums">
                      {preflight.supervision.available}명
                    </div>
                  </div>
                  <div className="rounded border p-2">
                    <div className="text-muted-foreground">고사실 (선택과목)</div>
                    <div className="font-semibold tabular-nums">
                      {preflight.supervision.totalRooms}실 ·{' '}
                      {preflight.supervision.totalSeats}명
                    </div>
                  </div>
                  <div
                    className={`rounded border p-2 ${
                      preflight.supervision.maxSubjectDemand >
                      preflight.supervision.available
                        ? 'border-rose-300 bg-rose-50'
                        : ''
                    }`}
                  >
                    <div className="text-muted-foreground">최대 단일 과목 수요</div>
                    <div className="font-semibold tabular-nums">
                      {preflight.supervision.maxSubjectDemand}명
                    </div>
                  </div>
                  <div className="rounded border p-2">
                    <div className="text-muted-foreground">전체 수요 합계</div>
                    <div className="font-semibold tabular-nums">
                      {preflight.supervision.totalDemand}명
                    </div>
                  </div>
                  <div
                    className={`rounded border p-2 ${
                      preflight.supervision.totalDemand >
                      preflight.supervision.totalCapacity
                        ? 'border-rose-300 bg-rose-50'
                        : ''
                    }`}
                  >
                    <div className="text-muted-foreground">공급 상한 (슬롯×인원)</div>
                    <div className="font-semibold tabular-nums">
                      {preflight.supervision.totalCapacity}명
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between rounded-md border p-3 text-sm">
          <div>
            <div className="font-medium">일차별 시험 개수 자동 탐색</div>
            <div className="text-xs text-muted-foreground">
              켜면 아래 시험 개수를 고정값으로 쓰지 않고, 사용 교시 범위 안에서 학년별 시험 개수
              조합을 함께 탐색합니다.
            </div>
          </div>
          <Switch
            checked={autoExamCounts}
            onCheckedChange={(v) =>
              dispatch({
                type: 'SET_OPTIONS',
                patch: { examCountMode: v ? 'auto' : 'fixed' },
              })
            }
          />
        </div>

        <GradeTabs
          grades={state.grades}
          active={grade}
          onSelect={setActiveGrade}
          badge={(g) => {
            const gi = state.gradeInputs[g];
            const slots = gi.days.reduce(
              (acc, d) => acc + (autoExamCounts ? d.availablePeriods.length : d.examCount),
              0,
            );
            return `${gi.subjects.length}과목/${slots}슬롯`;
          }}
        />

        <div className="flex items-center justify-between rounded-md bg-muted/30 p-3 text-xs">
          <div>
            {grade}학년 과목 <b className="text-foreground">{subjectCount}</b>개를{' '}
            {state.examDays}일에 분배: 기본은 균등이며 나머지가 있으면 마지막 날에 더해집니다.
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => dispatch({ type: 'AUTO_DISTRIBUTE_EXAM_COUNTS', grade })}
            disabled={autoExamCounts}
          >
            <Wand2 className="h-3.5 w-3.5" />
            과목 수에 맞춰 재분배
          </Button>
        </div>

        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left">일자</th>
                <th className="px-3 py-2 text-center">시험 개수</th>
                <th className="px-3 py-2 text-left">사용 교시</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.dayIndex} className="border-t align-middle">
                  <td className="px-3 py-2 font-medium">{d.dayIndex + 1}일차</td>
                  <td className="px-3 py-2 text-center">
                    <Input
                      type="number"
                      min={0}
                      max={7}
                      value={d.examCount}
                      onChange={(e) => setExamCount(d.dayIndex, e.target.value)}
                      disabled={autoExamCounts}
                      className="mx-auto w-20 text-center"
                    />
                    {autoExamCounts && (
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        자동 탐색
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      {PERIODS.map((p) => {
                        const checked = d.availablePeriods.includes(p);
                        return (
                          <label
                            key={p}
                            className={`flex items-center gap-1 rounded border px-2 py-1 cursor-pointer text-xs ${
                              checked ? 'border-amber-500 bg-amber-50' : 'border-muted'
                            }`}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => togglePeriod(d.dayIndex, p)}
                            />
                            {p}교시
                          </label>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-md bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
          <div>
            {grade}학년 과목 수: <b className="text-foreground">{subjectCount}</b> ·{' '}
            {autoExamCounts ? '탐색 가능 슬롯' : '설정 슬롯'}:{' '}
            <b className="text-foreground">{totalSlotCount}</b>
            {gradePreflight && (
              <>
                {' '}· 동시 충돌 최대: <b className="text-foreground">{gradePreflight.maxClique}</b>
                {' '}(최소 {gradePreflight.minSlotsRequired}슬롯 필요)
              </>
            )}
          </div>
          {!preflight.feasible && preflight.warnings.length > 0 && (
            <ul className="list-disc list-inside text-rose-600">
              {preflight.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          {preflight.feasible && preflight.totalSubjects > 0 && (
            <div className="text-emerald-600">
              ✓ 현재 설정으로 전 학년 시간표 생성이 가능합니다.
            </div>
          )}
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setStep('scope')}>이전</Button>
          <Button
            onClick={() => setStep('pinned')}
            disabled={!preflight.feasible || preflight.totalSubjects === 0}
            title={!preflight.feasible ? '슬롯/교시/감독 설정을 먼저 확인해 주세요.' : ''}
          >
            다음 단계
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
