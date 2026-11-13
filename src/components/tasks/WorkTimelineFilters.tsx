// src/components/tasks/WorkTimelineFilters.tsx
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type ViewMode = "Day" | "Week" | "Month" | "Year";

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  Day: "일",
  Week: "주",
  Month: "월",
  Year: "연",
};

interface WorkTimelineFiltersProps {
  academicYear: number;
  viewMode: ViewMode;
  onYearChange: (year: number) => void;
  onViewModeChange: (mode: ViewMode) => void;
  workCount: number;
  noDateCount: number;
  /**
   * 학사력에 학기 기간이 설정돼 있을 때만 노출되는 "이번 학기" 범위 토글.
   * 켜면 타임라인이 학년도 전체 대신 설정된 학기 기간(예: 3.2 ~ 8.14)만 보여준다.
   */
  termScope?: {
    active: boolean;
    label: string; // 예: "2026-1학기 (3.2 ~ 8.14)"
    onToggle: (active: boolean) => void;
  } | null;
}

export function getCurrentAcademicYear(): number {
  const now = new Date();
  // month is 0-indexed: 2 = March
  return now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1;
}

export function getAcademicYearRange(year: number): { start: Date; end: Date } {
  return {
    start: new Date(year, 2, 1),        // March 1
    end: new Date(year + 1, 2, 0),      // Last day of Feb next year (leap-year safe)
  };
}

export function WorkTimelineFilters({
  academicYear,
  viewMode,
  onYearChange,
  onViewModeChange,
  workCount,
  noDateCount,
  termScope = null,
}: WorkTimelineFiltersProps) {
  const currentYear = getCurrentAcademicYear();
  const scopeActive = !!termScope?.active;
  // Show current year ±3
  const years = Array.from({ length: 7 }, (_, i) => currentYear - 3 + i);
  const minYear = years[0];
  const maxYear = years[years.length - 1];

  return (
    <div className="flex flex-col gap-2">
      {/* 첫 번째 줄: 학사연도 네비게이션 + 뷰 모드 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onYearChange(academicYear - 1)}
            disabled={scopeActive || academicYear <= minYear}
            className="h-8 w-8 rounded-full p-0 text-slate-500 hover:bg-slate-100"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>

          <Select
            value={String(academicYear)}
            onValueChange={(v) => onYearChange(Number(v))}
            disabled={scopeActive}
          >
            <SelectTrigger className="h-9 w-44 justify-center gap-1 rounded-xl border-0 text-sm font-bold text-slate-800 shadow-none hover:bg-slate-100 focus:ring-0 sm:text-base">
              <SelectValue placeholder="학사연도 선택" />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}-{year + 1}학년도
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onYearChange(academicYear + 1)}
            disabled={scopeActive || academicYear >= maxYear}
            className="h-8 w-8 rounded-full p-0 text-slate-500 hover:bg-slate-100"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>

          {termScope && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => termScope.onToggle(!termScope.active)}
              className={cn(
                "ml-1 h-8 rounded-full border px-3 text-xs font-medium transition-colors",
                termScope.active
                  ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              )}
              title={
                termScope.active
                  ? "학년도 전체 보기로 돌아갑니다"
                  : "학사력에 설정된 학기 기간만 표시합니다"
              }
            >
              {termScope.label}
            </Button>
          )}
        </div>

        <div className="flex items-center gap-0.5 rounded-lg border border-slate-200/50 bg-slate-100/80 p-0.5">
          {(Object.keys(VIEW_MODE_LABELS) as ViewMode[]).map((mode) => (
            <Button
              key={mode}
              variant="ghost"
              size="sm"
              onClick={() => onViewModeChange(mode)}
              className={cn(
                "h-7 rounded-md px-3 text-xs transition-all sm:text-sm",
                viewMode === mode
                  ? "bg-white font-medium text-blue-600 shadow-sm"
                  : "text-slate-500 hover:bg-slate-200/50 hover:text-slate-700"
              )}
            >
              {VIEW_MODE_LABELS[mode]}
            </Button>
          ))}
        </div>
      </div>

      {/* 두 번째 줄: 업무 수 + 범례 */}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <span className="text-xs text-slate-400">
          업무 <b className="font-semibold text-slate-600">{workCount}</b>개
          {noDateCount > 0 && <> · 날짜 미설정 {noDateCount}개</>}
        </span>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/60 bg-slate-50/80 px-3 py-1">
          <span className="mr-1 hidden text-xs font-semibold text-slate-500 sm:inline">범례</span>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <div className="h-2.5 w-5 overflow-hidden rounded-full bg-blue-100">
                <div className="h-full w-1/2 rounded-full bg-blue-500" />
              </div>
              <span>절차적 · 기간</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <div
                className="relative h-3.5 w-3.5 rounded-full"
                style={{ background: "conic-gradient(#3b82f6 50%, #e2e8f0 0)" }}
              >
                <div className="absolute inset-[2px] rounded-full bg-white" />
              </div>
              <span>일회성 · 일자</span>
            </div>
            <div
              className="flex items-center gap-1.5 text-xs text-slate-600"
              title="절차적 할 일의 단계별 마감 — 안의 숫자는 단계 번호입니다"
            >
              <div
                className="relative flex h-3.5 w-3.5 items-center justify-center rounded-full"
                style={{ background: "conic-gradient(#3b82f6 50%, #e2e8f0 0)" }}
              >
                <div className="absolute inset-[2px] rounded-full bg-white" />
                <span className="relative text-[7px] font-bold leading-none text-slate-600">1</span>
              </div>
              <span>단계 마감</span>
            </div>
            <div
              className="flex items-center gap-1.5 text-xs text-slate-600"
              title="시작일이 없는 절차적 할 일은 앞 단계의 마감일부터 이어 그립니다"
            >
              <div
                className="h-2.5 w-5 rounded-full border border-dashed border-blue-300"
                style={{
                  background:
                    "repeating-linear-gradient(135deg, #dbeafe 0 3px, transparent 3px 6px)",
                }}
              />
              <span>추정 구간</span>
            </div>
          </div>
          <div className="hidden h-4 w-px bg-slate-200 sm:block" />
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <div className="h-2.5 w-2.5 rounded-full bg-blue-500 ring-2 ring-blue-100"></div>
              <span>진행 중</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <div className="h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-green-100"></div>
              <span>완료</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <div className="h-2.5 w-2.5 rounded-full bg-slate-400 ring-2 ring-slate-100"></div>
              <span>취소</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <div className="h-3 w-0.5 rounded-full bg-rose-500"></div>
              <span>오늘</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
