import * as React from "react";
import {
  AlertCircle,
  Check,
  ClipboardPaste,
  CopyCheck,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  parseSpreadsheetClipboard,
  type SpreadsheetCellStatus,
  type SpreadsheetSelectionAnalysis,
  type SpreadsheetSelectionMode,
} from "@/components/ui/spreadsheet-selection";

interface SpreadsheetPasteSelectorProps {
  mode: SpreadsheetSelectionMode;
  matrix: string[][];
  analysis: SpreadsheetSelectionAnalysis;
  onMatrixChange: (matrix: string[][]) => void;
  onApply: () => void;
  onClose: () => void;
}

const statusStyles: Record<SpreadsheetCellStatus, string> = {
  empty: "bg-background text-foreground",
  matched:
    "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100",
  duplicate:
    "border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100",
  unmatched:
    "border-destructive/40 bg-destructive/10 text-destructive",
  ignored: "bg-muted/50 text-muted-foreground",
};

const statusTitles: Record<SpreadsheetCellStatus, string> = {
  empty: "",
  matched: "선택 목록에 추가됩니다.",
  duplicate: "이미 선택했거나 붙여넣은 범위 안에서 중복된 항목입니다.",
  unmatched: "일치하는 학생 또는 교사를 찾지 못했습니다.",
  ignored: "머리글 또는 매칭에 사용하지 않는 셀입니다.",
};

function getInstructions(mode: SpreadsheetSelectionMode): string {
  if (mode === "student") {
    return "학생은 학번(GCCNN)과 이름 두 셀을 같은 행에 포함해 주세요.";
  }
  if (mode === "mixed") {
    return "학생은 학번·이름 두 열로, 교사는 이름 셀만 붙여넣을 수 있습니다.";
  }
  return "교사 이름이 들어 있는 셀 범위를 그대로 붙여넣으세요.";
}

function getColumnLabel(
  mode: SpreadsheetSelectionMode,
  columnIndex: number,
  columnCount: number
): string {
  if (mode === "teacher") {
    return columnCount === 1 ? "교사 이름" : `교사 이름 ${columnIndex + 1}`;
  }
  if (mode === "student") {
    if (columnIndex === 0) return "학번 (GCCNN)";
    if (columnIndex === 1) return "이름";
    return `추가 열 ${columnIndex - 1}`;
  }
  if (columnIndex === 0) return "학번 / 교사 이름";
  if (columnIndex === 1) return "학생 이름";
  return `추가 열 ${columnIndex - 1}`;
}

export const SpreadsheetPasteSelector = React.forwardRef<
  HTMLDivElement,
  SpreadsheetPasteSelectorProps
>(function SpreadsheetPasteSelector(
  {
    mode,
    matrix,
    analysis,
    onMatrixChange,
    onApply,
    onClose,
  },
  forwardedRef
) {
  const localRef = React.useRef<HTMLDivElement>(null);
  const hasContent = matrix.length > 0;
  const columnCount = Math.max(
    mode === "teacher" ? 1 : 2,
    ...matrix.map(row => row.length)
  );
  const visibleRows = hasContent
    ? matrix
    : Array.from({ length: 3 }, () =>
        Array.from({ length: columnCount }, () => "")
      );
  const gridHeight = hasContent
    ? Math.min(340, Math.max(116, matrix.length * 36 + 37))
    : 146;

  React.useImperativeHandle(forwardedRef, () => localRef.current!, []);

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const nextMatrix = parseSpreadsheetClipboard(
      event.clipboardData.getData("text/plain")
    );
    if (nextMatrix.length > 0) {
      onMatrixChange(nextMatrix);
    }
  };

  return (
    <section className="border-b bg-muted/20 p-3" aria-label="스프레드시트 붙여넣기">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <ClipboardPaste className="h-4 w-4" />
            스프레드시트로 여러 명 선택
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            엑셀·구글 스프레드시트에서 셀 범위를 복사한 뒤 아래 표를 클릭하고
            Ctrl+V로 붙여넣으세요.
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {getInstructions(mode)}
          </p>
        </div>
        {hasContent && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1 px-2 text-xs"
            onClick={() => {
              onMatrixChange([]);
              localRef.current?.focus();
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            다시 붙여넣기
          </Button>
        )}
      </div>

      <div
        ref={localRef}
        role="textbox"
        tabIndex={0}
        aria-multiline="true"
        aria-label="복사한 학생 또는 교사 셀 붙여넣기"
        className={cn(
          "relative overflow-auto rounded-md border bg-background outline-none transition-[height,box-shadow]",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        )}
        style={{ height: gridHeight }}
        onClick={() => localRef.current?.focus()}
        onPaste={handlePaste}
        onKeyDown={event => event.stopPropagation()}
      >
        <table className="w-max min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              {Array.from({ length: columnCount }, (_, columnIndex) => (
                <th
                  key={columnIndex}
                  className="h-9 min-w-32 border px-2 text-left text-xs font-medium text-muted-foreground"
                >
                  {getColumnLabel(mode, columnIndex, columnCount)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {Array.from({ length: columnCount }, (_, columnIndex) => {
                  const value = row[columnIndex] ?? "";
                  const status =
                    analysis.cellStatuses[rowIndex]?.[columnIndex] ?? "empty";
                  return (
                    <td
                      key={columnIndex}
                      title={statusTitles[status]}
                      className={cn(
                        "h-9 min-w-32 whitespace-nowrap border px-2 font-mono text-xs",
                        statusStyles[status]
                      )}
                    >
                      {value || "\u00a0"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {!hasContent && (
          <div className="pointer-events-none absolute inset-x-0 top-9 flex h-[calc(100%-2.25rem)] items-center justify-center bg-background/75 px-4 text-center text-sm text-muted-foreground">
            <span>
              이 영역을 클릭한 뒤
              <kbd className="mx-1 rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">
                Ctrl+V
              </kbd>
              를 누르세요.
            </span>
          </div>
        )}
      </div>

      {hasContent && (
        <div
          className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
          aria-live="polite"
        >
          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" />
            추가 가능 {analysis.matchedCount}명
          </span>
          {analysis.duplicateCount > 0 && (
            <span className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-400">
              <CopyCheck className="h-3.5 w-3.5" />
              이미 선택/중복 {analysis.duplicateCount}명
            </span>
          )}
          {analysis.unmatchedCount > 0 && (
            <span className="inline-flex items-center gap-1 text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              확인 필요 {analysis.unmatchedCount}건
            </span>
          )}
        </div>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          닫기
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={analysis.matchedCount === 0}
          onClick={onApply}
        >
          {analysis.matchedCount > 0
            ? `${analysis.matchedCount}명 선택 목록에 추가`
            : "추가할 항목 없음"}
        </Button>
      </div>
    </section>
  );
});
