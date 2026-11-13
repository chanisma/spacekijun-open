/**
 * 학교 업무 지도 — 축을 골라 보는 조망 화면 (2026-09-24).
 *
 * ⚠️ **업무량을 재는 화면이 아니다 (사용자 결정).** 모든 업무가 이 시스템에 올라와 있지 않다 —
 * 그래서 값 이름이 「올라온 …」이고, 머리글이 그 사실을 상시로 말하며, **빈 자리 행을 지우지
 * 않는다**(빈 칸 = "여기는 아직 시스템 밖"이 이 지도의 본래 메시지다).
 *
 * ⚠️ **사람 축이 없다.** 개인별 업무량 비교표가 되기 때문이다(로드맵 원칙 2). 대신 **업무분장
 * 자리**로 세운다 — 자리는 담당자가 바뀌어도 남는다.
 *
 * 판정·집계는 전부 `src/lib/workPivot.ts`. 여기는 그리기만 한다.
 *
 * **둘로 갈라 둔다** — `WorkPivotTab`(자료를 가져오는 껍데기)과 `WorkPivotBoard`(그리는 몸).
 * 한 덩어리면 로그인 세션 없이는 아무것도 그릴 수 없어 **브라우저로 확인할 수단이 없다**
 * (이 화면의 결함은 «합계가 안 맞는다»·«빈 행이 사라진다»처럼 오류 없이 그림으로만 드러난다).
 */
import { Fragment, useMemo, useState } from 'react';
import { Map as MapIcon, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DIALOG_FOOTER_CLASS, DIALOG_HEADER_CLASS, FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS, TitleIconChip,
} from '@/components/tasks/dialogDesign';
import { cn } from '@/lib/utils';
import { useDepartments } from '@/hooks/useDepartments';
import { useAcademicTerm } from '@/hooks/useAcademicTerm';
import { useDutySeats } from '@/hooks/useDutySeats';
import { referenceDateForYear, type DutySeat } from '@/lib/dutySeats';
import { useWorkCandidates } from '@/hooks/useWorkCandidates';
import {
  candidatesForRow, countCandidatesByRow, type WorkCandidate,
} from '@/lib/workCandidates';
import { WorkCandidateDialog } from '@/components/tasks/WorkCandidateDialog';
import { candidateLinkKey, convertedCandidates } from '@/lib/candidateToWork';
import {
  academicYearOfTask,
  buildPivot,
  buildSeatLookup,
  columnLabel,
  measureOf,
  toDateKey,
  COL_AXES,
  MEASURES,
  ROW_AXES,
  type ColAxisId,
  type MeasureId,
  type PivotWork,
  type RowAxisId,
  UNASSIGNED_SEAT,
} from '@/lib/workPivot';
import type { Work } from '@/types/tasks';

/** 값의 크기를 농도로 — 0 은 색을 주지 않는다(빈 칸이 보여야 메시지가 된다) */
function toneOf(value: number, max: number, measure: MeasureId): string {
  if (value <= 0) return 'text-slate-300';
  const ratio = max > 0 ? value / max : 0;
  if (measure === 'overdue') {
    return ratio > 0.6 ? 'bg-rose-500 text-white' : ratio > 0.3 ? 'bg-rose-200 text-rose-900' : 'bg-rose-50 text-rose-700';
  }
  if (measure === 'completion') {
    return value >= 100 ? 'bg-emerald-500 text-white' : value >= 50 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600';
  }
  return ratio > 0.6 ? 'bg-blue-600 text-white' : ratio > 0.3 ? 'bg-blue-200 text-blue-900' : 'bg-blue-50 text-blue-700';
}

/** 자료를 가져오는 껍데기 — 판정도 그리기도 하지 않는다 */
export function WorkPivotTab({ works }: { works: Work[] }) {
  const { departmentObjects } = useDepartments();
  const { data: academicTerm } = useAcademicTerm();
  // 기본값은 학사력 — 고른 값이 있으면 그것을 쓴다(학사력이 늦게 와도 덮지 않는다)
  const [picked, setPicked] = useState<number | null>(null);
  const year = picked ?? academicTerm?.year ?? new Date().getFullYear();

  const { data: seats = [], isLoading } = useDutySeats(year);
  const { data: candidates = [], error: candidateError } = useWorkCandidates(year);

  /**
   * 고를 수 있는 학년도 — **자료가 실제로 있는 해 ∪ 학사력**.
   * 업무의 해는 마감일에서 유도한다(`academicYearOfTask`) — 표에 학년도 컬럼이 없다.
   */
  const years = useMemo(() => {
    const set = new Set<number>();
    if (academicTerm?.year) set.add(academicTerm.year);
    for (const work of works) {
      for (const task of work.tasks ?? []) {
        const y = academicYearOfTask(work as unknown as PivotWork, task as never);
        if (y) set.add(y);
      }
    }
    set.add(year);
    return [...set].sort((a, b) => b - a);
  }, [works, academicTerm?.year, year]);

  return (
    <WorkPivotBoard
      works={works}
      seats={seats}
      departments={departmentObjects ?? []}
      candidates={candidates}
      candidateError={candidateError instanceof Error ? candidateError.message : null}
      year={year}
      years={years}
      onYearChange={setPicked}
      isLoading={isLoading}
    />
  );
}

export function WorkPivotBoard({
  works,
  seats,
  departments,
  candidates = [],
  candidateError = null,
  year,
  years,
  onYearChange,
  isLoading = false,
  /** 오늘 — 스크린샷 검증이 고정할 수 있게 받는다 */
  today,
}: {
  works: Work[];
  seats: DutySeat[];
  departments: { id: string; name: string }[];
  candidates?: WorkCandidate[];
  candidateError?: string | null;
  year: number;
  /** 고를 수 있는 학년도 — 주지 않으면 선택기를 그리지 않는다(고정 화면·스크린샷용) */
  years?: number[];
  onYearChange?: (year: number) => void;
  isLoading?: boolean;
  today?: string;
}) {
  const [rowAxis, setRowAxis] = useState<RowAxisId>('seat');
  const [colAxis, setColAxis] = useState<ColAxisId>('month');
  const [measure, setMeasure] = useState<MeasureId>('tasks');
  const [openOnly, setOpenOnly] = useState(true);
  const [picked, setPicked] = useState<{ row: string; col: string } | null>(null);
  const [candidateRow, setCandidateRow] = useState<{ key: string; label: string } | null>(null);

  // `duty_seat.department_id` → 부서 이름. 자리 이름표와 «같은 부서 먼저» 판정이 이걸 쓴다
  const departmentLabel = useMemo(
    () => new Map(departments.map((d) => [d.id, d.name] as const)),
    [departments],
  );
  const todayKey = today ?? toDateKey(new Date().toISOString())!;
  // 담당자는 «그 학년도 기준일»로 푼다 — 지난 학년도를 오늘로 풀면 전원 빈다
  const seatLookup = useMemo(
    () => buildSeatLookup(seats, departmentLabel, referenceDateForYear(year, new Date(todayKey))),
    [seats, departmentLabel, year, todayKey],
  );

  // 업무로 만든 후보(2026-10-05) — 서랍에는 «업무로 만듦»으로 남기고, 후보 수에서는 뺀다
  // (안 빼면 같은 일이 «올라온 것»과 «올라올 수 있는 것» 양쪽에 세어진다)
  const converted = useMemo(() => convertedCandidates(works), [works]);
  const candidateCounts = useMemo(
    () => countCandidatesByRow(candidates.filter((c) => !converted.has(candidateLinkKey(c))), rowAxis),
    [candidates, rowAxis, converted],
  );

  // 값(measure)은 집계에 들어가지 않는다 — 칸이 네 가지 원자료를 다 들고 있고 `measureOf` 가
  // 그릴 때 하나를 고른다. 그래서 값 드롭다운을 바꿔도 다시 집계하지 않는다.
  const pivot = useMemo(
    () =>
      buildPivot({
        works: works as unknown as PivotWork[],
        seats: seatLookup,
        rowAxis,
        colAxis,
        today: todayKey,
        openOnly,
        candidateCounts,
        academicYear: year,
        allDepartments: departments.map((d) => d.name),
      }),
    [works, seatLookup, rowAxis, colAxis, openOnly, todayKey, candidateCounts, year, departments],
  );

  const max = useMemo(() => {
    let out = 0;
    for (const row of pivot.rows) for (const col of pivot.columns) {
      out = Math.max(out, measureOf(row.cells.get(col), measure));
    }
    return out;
  }, [pivot, measure]);

  const pickedCell = picked
    ? pivot.rows.find((r) => r.key === picked.row)?.cells.get(picked.col)
    : null;
  const pickedRowLabel = picked ? pivot.rows.find((r) => r.key === picked.row)?.label ?? '' : '';
  /**
   * 그 칸에 든 업무 → **그 칸에 든 할 일만**.
   * ⚠️ 업무의 할 일을 통째로 보여 주면 안 된다 — 9월 칸을 눌렀는데 11월 할 일이 섞여 나오면
   * 격자의 숫자(3)와 목록의 개수가 어긋나고, 그 순간 이 표를 믿을 수 없게 된다.
   */
  const pickedGroups = useMemo(() => {
    if (!pickedCell) return [];
    const inCell = new Set(pickedCell.taskIds);
    return works
      .filter((work) => pickedCell.workIds.has(work.id))
      .map((work) => ({ work, tasks: (work.tasks ?? []).filter((task) => inCell.has(task.id)) }));
  }, [pickedCell, works]);

  /**
   * 업무분장 축은 **부서로 묶는다** (2026-09-24 사용자 결정 — 종전엔 관리자·부장·담당·지원
   * 종류 묶음이었다). 부서 안에서는 부장이 먼저 서고, 순서는 엔진이 이미 정해 두었으므로
   * 여기서는 «이웃한 같은 이름»만 접는다(다시 정렬하면 엔진과 규칙이 갈린다).
   */
  const grouped = useMemo(() => {
    if (rowAxis !== 'seat') return [{ key: 'all', label: '', rows: pivot.rows }];
    const out: { key: string; label: string; rows: typeof pivot.rows }[] = [];
    for (const row of pivot.rows) {
      const label = row.group ?? '부서 없음';
      const last = out[out.length - 1];
      if (last && last.label === label) last.rows.push(row);
      else out.push({ key: `${label}-${out.length}`, label, rows: [row] });
    }
    return out;
  }, [pivot.rows, rowAxis]);

  /**
   * 후보 열을 그릴 수 있는 축인가 — 업무·상태·유형 축에는 대응하는 후보가 없다.
   *
   * ⚠️ **«후보가 0건이면 열을 숨긴다»로 두지 말 것** (2026-09-24 실제 사고). 새 표가
   * PostgREST 스키마 캐시에 아직 없어 조회가 실패했는데, 화면은 그냥 열이 없는 모습이었다 —
   * 사용자에게는 "기능이 안 만들어졌다"로 보이고 아무 신호도 없다. 축이 받쳐 주면 **언제나
   * 그리고**, 실패는 아래 문구가 말한다.
   */
  const showCandidates = candidateCounts !== null;
  // 이름 칸 + 달 + 합계 (+ 후보) — 한 곳에서 세지 않으면 구획 머리글이 한 칸씩 어긋난다
  const colSpan = pivot.columns.length + 2 + (showCandidates ? 1 : 0);
  const candidateTotal = useMemo(
    () => (candidateCounts ? [...candidateCounts.values()].reduce((n, v) => n + v, 0) : 0),
    [candidateCounts],
  );

  return (
    <div className="space-y-3">
      {/* 툴바 — 업무 관리 탭들의 공통 어휘(rounded-xl 카드 + 아이콘 칩 + h-8 컨트롤) */}
      <div className="rounded-xl border bg-card p-2.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <MapIcon className="h-4 w-4" />
          </span>
          <div className="mr-auto min-w-0">
            <p className="text-sm font-semibold text-slate-800">학교 업무 지도</p>
            <p className="text-[10px] text-slate-400">
              {year}학년도 · 분장 자리 {pivot.coverage.all}개 중 {pivot.coverage.filled}개에 업무가 올라와 있습니다
            </p>
          </div>

          {/* 학년도 — 자리·후보·할 일이 **한 해 기준**으로 함께 움직인다 */}
          {years && years.length > 0 && onYearChange && (
            <Select value={String(year)} onValueChange={(v) => { onYearChange(Number(v)); setPicked(null); }}>
              <SelectTrigger className="h-8 w-auto gap-1 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)} className="text-xs">{y}학년도</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={rowAxis} onValueChange={(v) => { setRowAxis(v as RowAxisId); setPicked(null); }}>
            <SelectTrigger className="h-8 w-auto gap-1 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROW_AXES.map((axis) => (
                <SelectItem key={axis.id} value={axis.id} className="text-xs">행 · {axis.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={colAxis} onValueChange={(v) => { setColAxis(v as ColAxisId); setPicked(null); }}>
            <SelectTrigger className="h-8 w-auto gap-1 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {COL_AXES.map((axis) => (
                <SelectItem key={axis.id} value={axis.id} className="text-xs">열 · {axis.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={measure} onValueChange={(v) => setMeasure(v as MeasureId)}>
            <SelectTrigger className="h-8 w-auto gap-1 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MEASURES.map((item) => (
                <SelectItem key={item.id} value={item.id} className="text-xs">{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={openOnly ? 'default' : 'outline'}
            size="sm"
            className={cn('h-8 text-xs', openOnly && 'bg-blue-600 hover:bg-blue-700')}
            onClick={() => setOpenOnly((v) => !v)}
          >
            진행 중만
          </Button>
        </div>

        {/* 이 화면이 무엇을 재지 «않는지»를 늘 말한다 */}
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] leading-4 text-amber-700">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          이 시스템에 올라온 업무만 셉니다 — 학교의 실제 업무량이 아닙니다. 빈 칸은 «아직 올라오지 않음»입니다.
        </p>

        {/* 후보를 못 읽으면 «열이 없는 것»이 아니라 «못 읽었다»를 말한다 */}
        {candidateError && (
          <p className="mt-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] leading-4 text-rose-700">
            후보를 불러오지 못했습니다 — {candidateError}
          </p>
        )}
        {!candidateError && showCandidates && candidates.length === 0 && (
          <p className="mt-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] leading-4 text-slate-500">
            {year}학년도 후보가 아직 없습니다. 후보는 업무 지도(공문 분석)에서 들어옵니다.
          </p>
        )}
      </div>

      {/* 격자 */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="max-h-[68vh] overflow-auto">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-white">
              <tr>
                {/* 휴대폰에서 이름 칸이 절반을 먹으면 달이 세 개밖에 안 보인다 */}
                <th className="sticky left-0 z-20 min-w-28 bg-white px-3 py-2 text-left font-semibold text-slate-500 sm:min-w-48">
                  {ROW_AXES.find((a) => a.id === rowAxis)?.label}
                </th>
                {pivot.columns.map((col) => (
                  <th key={col} className="min-w-14 px-1 py-2 text-center font-medium text-slate-500">
                    {columnLabel(colAxis, col)}
                  </th>
                ))}
                <th className="min-w-14 px-2 py-2 text-center font-semibold text-slate-600">합계</th>
                {showCandidates && (
                  <th
                    className="min-w-14 border-l border-slate-200 px-2 py-2 text-center font-semibold text-amber-700"
                    title="업무 지도(공문 분석)가 말하는 «올라올 수 있는 일». 합계에 들어가지 않습니다."
                  >
                    후보
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={colSpan} className="px-3 py-10 text-center text-slate-400">불러오는 중…</td></tr>
              )}
              {grouped.map((group) => (
                <Fragment key={group.key}>
                  {group.label && (
                    <tr>
                      <td colSpan={colSpan} className="bg-slate-50 px-3 py-1 text-[10px] font-bold text-slate-500">
                        {group.label}
                      </td>
                    </tr>
                  )}
                  {group.rows.map((row) => (
                    <tr key={row.key} className="border-t border-slate-100">
                      <td
                        className="sticky left-0 z-10 max-w-28 bg-white px-3 py-1.5 text-slate-700 sm:max-w-64"
                        title={row.holders?.length ? `${row.label} — ${row.holders.join(', ')}` : row.label}
                      >
                        <span className="block truncate">{row.label}</span>
                        {/* 자리는 담당자가 있어야 «누구 일인지»가 읽힌다. 비어 있으면 그 사실도 말한다 */}
                        {rowAxis === 'seat' && row.key !== UNASSIGNED_SEAT && (
                          <span
                            className={cn(
                              'block truncate text-[10px]',
                              row.holders?.length ? 'text-slate-400' : 'text-amber-600',
                            )}
                          >
                            {row.holders?.length ? row.holders.join(', ') : '담당자 없음'}
                          </span>
                        )}
                      </td>
                      {pivot.columns.map((col) => {
                        const value = measureOf(row.cells.get(col), measure);
                        const active = picked?.row === row.key && picked?.col === col;
                        return (
                          <td key={col} className="p-0.5 text-center">
                            <button
                              type="button"
                              disabled={value === 0}
                              onClick={() => setPicked(active ? null : { row: row.key, col })}
                              className={cn(
                                'h-6 w-full rounded text-[11px] font-medium tabular-nums transition-all',
                                toneOf(value, max, measure),
                                value > 0 && 'hover:ring-2 hover:ring-blue-400',
                                active && 'ring-2 ring-blue-500',
                                value === 0 && 'cursor-default',
                              )}
                            >
                              {measure === 'completion' && value > 0 ? `${value}%` : value || '·'}
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5 text-center font-semibold tabular-nums text-slate-700">
                        {measure === 'completion'
                          ? `${measureOf(row.total, measure)}%`
                          : measureOf(row.total, measure) || '·'}
                      </td>
                      {showCandidates && (
                        <td className="border-l border-slate-200 p-0.5 text-center">
                          <button
                            type="button"
                            disabled={!row.candidates}
                            onClick={() => setCandidateRow({ key: row.key, label: row.label })}
                            className={cn(
                              'h-6 w-full rounded text-[11px] font-medium tabular-nums transition-all',
                              row.candidates
                                ? 'bg-amber-50 text-amber-700 hover:ring-2 hover:ring-amber-400'
                                : 'cursor-default text-slate-300',
                            )}
                          >
                            {row.candidates || '·'}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 bg-white">
              <tr className="border-t-2 border-slate-200">
                <td className="sticky left-0 z-10 bg-white px-3 py-2 font-semibold text-slate-600">합계</td>
                {pivot.columns.map((col) => {
                  const sum = pivot.rows.reduce((n, r) => n + measureOf(r.cells.get(col), measure), 0);
                  return (
                    <td key={col} className="px-1 py-2 text-center font-semibold tabular-nums text-slate-600">
                      {measure === 'completion' ? '' : sum || '·'}
                    </td>
                  );
                })}
                <td className="px-2 py-2 text-center font-bold tabular-nums text-slate-800">
                  {measure === 'completion' ? `${measureOf(pivot.total, measure)}%` : measureOf(pivot.total, measure)}
                </td>
                {showCandidates && (
                  <td className="border-l border-slate-200 px-2 py-2 text-center font-bold tabular-nums text-amber-700">
                    {candidateTotal}
                  </td>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/*
        고른 칸의 내용은 **모달**이다 (2026-09-24 사용자 요청).
        표가 세로로 길어 아래에 붙이면 목록을 보려고 스크롤을 내리는 사이 **누른 칸이 화면 밖으로
        나간다** — 어느 칸을 보고 있는지 잃는다. 모달은 표 위에 뜨므로 그 일이 없고, 자리가 넉넉해
        업무 이름만이 아니라 **그 칸에 든 할 일까지** 보여 줄 수 있다.
      */}
      <Dialog open={Boolean(pickedCell)} onOpenChange={(open) => { if (!open) setPicked(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] gap-0 overflow-hidden p-0">
          <DialogHeader className={DIALOG_HEADER_CLASS}>
            <DialogTitle className="flex items-center gap-2 text-base">
              <TitleIconChip icon={MapIcon} />
              {pickedRowLabel}
              <span className="text-slate-400">·</span>
              {picked ? columnLabel(colAxis, picked.col) : ''}
            </DialogTitle>
            <DialogDescription className="text-xs">
              업무 {pickedCell?.workIds.size ?? 0}개 · 할 일 {pickedCell?.taskIds.length ?? 0}개
              {openOnly && <span className="ml-1 text-slate-400">(진행 중만)</span>}
            </DialogDescription>
          </DialogHeader>

          {/*
            ⚠️ 높이를 `max-h-[60vh]` 로 못 박지 말 것 — 휴대폰 전체화면(844px)에서 내용이 짧으면
            본문이 그 자리에서 끝나고 **푸터가 화면 한가운데 뜬다**. `flex-1 min-h-0` 으로 남는
            공간을 먹게 두면 `modal.css` 의 `margin-top:auto` 가 푸터를 바닥에 붙인다.
          */}
          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3 sm:px-6">
            {pickedGroups.map(({ work, tasks }) => (
              <div key={work.id} className="rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800" title={work.name}>
                    {work.name}
                  </p>
                  <span className="shrink-0 text-[10px] text-slate-400">할 일 {tasks.length}개</span>
                </div>
                <ul className="divide-y divide-slate-50">
                  {tasks.map((task) => (
                    <li key={task.id} className="flex items-center gap-2 px-3 py-1.5">
                      <span className="min-w-0 flex-1 truncate text-xs text-slate-700" title={task.title}>
                        {task.title}
                      </span>
                      {task.due_date && (
                        <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
                          {toDateKey(task.due_date)?.slice(5).replace('-', '/')}
                        </span>
                      )}
                      <span
                        className={cn(
                          'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                          task.status === 'completed' ? 'bg-emerald-50 text-emerald-700'
                            : task.status === 'cancelled' ? 'bg-slate-100 text-slate-500'
                            : 'bg-blue-50 text-blue-700',
                        )}
                      >
                        {task.status === 'completed' ? '완료' : task.status === 'cancelled' ? '취소' : '진행 중'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* ⚠️ 날 `<div>` 로 쓰지 말 것 — 휴대폰 전체화면에서 푸터를 바닥에 붙이는 CSS 가
              `[data-slot="dialog-footer"]` 를 찾는다(`DialogFooter` 가 그 속성을 단다) */}
          <DialogFooter className={DIALOG_FOOTER_CLASS}>
            {/* 이 화면은 보는 곳이다 — 고치러 가는 길만 알려 주고 여기서 바꾸지 않는다 */}
            <span className="mr-auto text-[10px] text-slate-400">
              고치려면 「업무 목록」, 수행하려면 「내 할 일」로 갑니다
            </span>
            <Button
              variant="ghost"
              size="sm"
              className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)}
              onClick={() => setPicked(null)}
            >
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 후보 서랍 — 수정·삭제는 여기서만 한다 */}
      {candidateRow && (
        <WorkCandidateDialog
          open
          onOpenChange={(v) => { if (!v) setCandidateRow(null); }}
          rowLabel={candidateRow.label}
          candidates={candidatesForRow(candidates, rowAxis, candidateRow.key)}
          academicYear={year}
          seatId={rowAxis === 'seat' ? candidateRow.key : null}
          department={rowAxis === 'department' ? candidateRow.key : seatLookup.department.get(candidateRow.key) ?? null}
          converted={converted}
        />
      )}
    </div>
  );
}
