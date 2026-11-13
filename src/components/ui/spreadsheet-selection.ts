import type { SelectItem } from "@/hooks/useResourceSelect";

export type SpreadsheetSelectionMode = "teacher" | "student" | "mixed";

export type SpreadsheetCellStatus =
  | "empty"
  | "matched"
  | "duplicate"
  | "unmatched"
  | "ignored";

export interface SpreadsheetSelectionAnalysis {
  matchedValues: string[];
  matchedCount: number;
  duplicateCount: number;
  unmatchedCount: number;
  cellStatuses: SpreadsheetCellStatus[][];
}

const HEADER_VALUES = new Set([
  "학번",
  "학생번호",
  "학생 번호",
  "번호",
  "이름",
  "성명",
  "학생",
  "학생명",
  "학생 이름",
  "교사",
  "교사명",
  "교사 이름",
  "선생님",
  "name",
  "student",
  "student id",
  "teacher",
]);
const GROUP_PREFIXES = ["TAG_", "CLASS_", "GRADE_", "COURSE_"];

function normalizeText(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

function cleanClipboardCell(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"').trim();
  }
  return trimmed;
}

function isHeaderRow(row: string[]): boolean {
  const values = row.map(normalizeText).filter(Boolean);
  return values.length > 0 && values.every(value => HEADER_VALUES.has(value));
}

function toInteger(value: number | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.trunc(value);
}

function extractGccnnCodes(value: string): string[] {
  return value.match(/(?<!\d)\d{5}(?!\d)/g) ?? [];
}

function getNameCandidate(value: string, code: string): string {
  return normalizeText(
    value
      .replace(code, " ")
      .replace(/^[\s,;:|/()[\]{}_-]+|[\s,;:|/()[\]{}_-]+$/g, "")
  );
}

function isPersonItem(item: SelectItem): boolean {
  return (
    !item.value.startsWith("ALL_") &&
    !GROUP_PREFIXES.some(prefix => item.value.startsWith(prefix))
  );
}

export function getStudentGccnn(item: SelectItem): string | null {
  const grade = toInteger(item.studentGrade);
  const studentClass = toInteger(item.studentClass);
  const number = toInteger(item.studentNumber);

  if (
    grade != null &&
    grade >= 0 &&
    grade <= 9 &&
    studentClass != null &&
    studentClass >= 0 &&
    studentClass <= 99 &&
    number != null &&
    number >= 0 &&
    number <= 99
  ) {
    return `${grade}${String(studentClass).padStart(2, "0")}${String(number).padStart(2, "0")}`;
  }

  if (item.studentCode) {
    const code = extractGccnnCodes(item.studentCode)[0];
    if (code) return code;
  }

  return null;
}

export function getSpreadsheetPersonLabel(item: SelectItem): string {
  const code = getStudentGccnn(item);
  return code ? `${code} ${item.label}` : item.label;
}

export function parseSpreadsheetClipboard(text: string): string[][] {
  const normalized = text.replace(/\r\n?/g, "\n");
  const rows = normalized
    .split("\n")
    .map(row => row.split("\t").map(cleanClipboardCell));

  while (rows.length > 0 && rows[0].every(cell => !cell.trim())) {
    rows.shift();
  }
  while (rows.length > 0 && rows[rows.length - 1].every(cell => !cell.trim())) {
    rows.pop();
  }

  if (rows.length === 0) return [];

  const columnCount = Math.max(...rows.map(row => row.length));
  return rows.map(row => [
    ...row,
    ...Array.from({ length: columnCount - row.length }, () => ""),
  ]);
}

export function analyzeSpreadsheetSelection(
  matrix: string[][],
  items: SelectItem[],
  selectedValues: string[],
  mode: SpreadsheetSelectionMode
): SpreadsheetSelectionAnalysis {
  const cellStatuses: SpreadsheetCellStatus[][] = matrix.map(row =>
    row.map(cell => (cell.trim() ? "ignored" : "empty"))
  );
  const matchedValues: string[] = [];
  const seenValues = new Set(selectedValues);
  let duplicateCount = 0;
  let unmatchedCount = 0;

  if (matrix.length === 0) {
    return {
      matchedValues,
      matchedCount: 0,
      duplicateCount,
      unmatchedCount,
      cellStatuses,
    };
  }

  const people = items.filter(isPersonItem);
  const students = people.filter(
    item => item.resourceType === "student" || getStudentGccnn(item) !== null
  );
  const studentValues = new Set(students.map(item => item.value));
  const teachers = people.filter(item => !studentValues.has(item.value));

  const studentsByCode = new Map<string, SelectItem[]>();
  for (const student of students) {
    const code = getStudentGccnn(student);
    if (!code) continue;
    const candidates = studentsByCode.get(code) ?? [];
    candidates.push(student);
    studentsByCode.set(code, candidates);
  }

  const teachersByName = new Map<string, SelectItem[]>();
  for (const teacher of teachers) {
    const name = normalizeText(teacher.label);
    const candidates = teachersByName.get(name) ?? [];
    candidates.push(teacher);
    teachersByName.set(name, candidates);
  }

  const markMatch = (
    item: SelectItem,
    rowIndex: number,
    columnIndexes: number[]
  ) => {
    const status: SpreadsheetCellStatus = seenValues.has(item.value)
      ? "duplicate"
      : "matched";

    if (status === "duplicate") {
      duplicateCount += 1;
    } else {
      seenValues.add(item.value);
      matchedValues.push(item.value);
    }

    for (const columnIndex of columnIndexes) {
      cellStatuses[rowIndex][columnIndex] = status;
    }
  };

  const analyzeTeacherRow = (row: string[], rowIndex: number) => {
    row.forEach((cell, columnIndex) => {
      const name = normalizeText(cell);
      if (!name) return;

      const candidates = teachersByName.get(name) ?? [];
      if (candidates.length === 1) {
        markMatch(candidates[0], rowIndex, [columnIndex]);
      } else {
        cellStatuses[rowIndex][columnIndex] = "unmatched";
        unmatchedCount += 1;
      }
    });
  };

  matrix.forEach((row, rowIndex) => {
    if (isHeaderRow(row)) {
      return;
    }

    const codeOccurrences = row.flatMap((cell, columnIndex) =>
      extractGccnnCodes(cell).map(code => ({ code, columnIndex }))
    );

    if (mode === "teacher") {
      analyzeTeacherRow(row, rowIndex);
      return;
    }

    if (codeOccurrences.length === 0) {
      if (mode === "mixed") {
        analyzeTeacherRow(row, rowIndex);
      } else if (row.some(cell => cell.trim())) {
        row.forEach((cell, columnIndex) => {
          if (cell.trim()) cellStatuses[rowIndex][columnIndex] = "unmatched";
        });
        unmatchedCount += 1;
      }
      return;
    }

    let rowHasFailure = false;
    const handledColumns = new Set<number>();

    for (const { code, columnIndex: codeColumnIndex } of codeOccurrences) {
      const candidates = studentsByCode.get(code) ?? [];
      const exactMatches = candidates.flatMap(student => {
        const studentName = normalizeText(student.label);
        const nameColumnIndex = row.findIndex(
          cell => getNameCandidate(cell, code) === studentName
        );
        return nameColumnIndex >= 0 ? [{ student, nameColumnIndex }] : [];
      });

      if (exactMatches.length === 1) {
        const { student, nameColumnIndex } = exactMatches[0];
        const sourceColumns = [...new Set([codeColumnIndex, nameColumnIndex])];
        markMatch(student, rowIndex, sourceColumns);
        sourceColumns.forEach(index => handledColumns.add(index));
      } else {
        cellStatuses[rowIndex][codeColumnIndex] = "unmatched";
        handledColumns.add(codeColumnIndex);
        unmatchedCount += 1;
        rowHasFailure = true;
      }
    }

    row.forEach((cell, columnIndex) => {
      if (!cell.trim() || handledColumns.has(columnIndex)) return;
      cellStatuses[rowIndex][columnIndex] = rowHasFailure ? "unmatched" : "ignored";
    });
  });

  return {
    matchedValues,
    matchedCount: matchedValues.length,
    duplicateCount,
    unmatchedCount,
    cellStatuses,
  };
}
