// 0 = 통로 (빈 공간), 1 = 좌석, 2 = 사용 불가 (좌석이지만 X 표시)
export type CellState = 0 | 1 | 2;

export interface SeatLayout {
  id: string;
  name: string;
  totalRows: number;
  totalColumns: number;
  cells: CellState[][];
  pairing: 'single' | 'pair';
  updatedAt: string;
}

export interface SeatStudent {
  resourceId: string;
  name: string;
  number: number;
  grade: number;
  classNum: number;
}

export type Constraint =
  | { id: string; kind: 'fixed'; resourceId: string; seat: string }
  | { id: string; kind: 'apart'; resourceIds: string[]; minDistance: number }
  | { id: string; kind: 'together'; resourceIds: string[] };

export interface Arrangement {
  layoutId: string;
  classKey: string;
  seatToStudent: Record<string, string | null>;
  unassigned: string[];
  warnings: string[];
  generatedAt: string;
  seed: number;
}

export interface LayoutPreset {
  key: string;
  label: string;
  description: string;
  pairing: 'single' | 'pair';
  rows: number;
  columns: number;
  build: (rows: number, columns: number) => CellState[][];
}

export interface ArrangementCurrentState {
  classKey?: string;
  layoutId?: string;
  arrangement?: Arrangement;
}

export type ClassKey = `${number}-${number}`;

export const buildClassKey = (grade: number, classNum: number): ClassKey =>
  `${grade}-${classNum}` as ClassKey;
