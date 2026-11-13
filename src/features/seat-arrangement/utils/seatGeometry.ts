import type { CellState, SeatLayout } from '../types';

export interface SeatCoord {
  row: number;
  col: number;
}

export const seatNumber = (row: number, col: number): string => {
  return `${String.fromCharCode(65 + row)}${col + 1}`;
};

export const seatCoord = (s: string): SeatCoord => {
  const match = /^([A-Z])(\d+)$/.exec(s);
  if (!match) return { row: 0, col: 0 };
  return {
    row: match[1].charCodeAt(0) - 65,
    col: parseInt(match[2], 10) - 1,
  };
};

export const chebyshev = (a: SeatCoord, b: SeatCoord): number =>
  Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));

export const manhattan = (a: SeatCoord, b: SeatCoord): number =>
  Math.abs(a.row - b.row) + Math.abs(a.col - b.col);

export const seatDistance = (a: string, b: string): number =>
  chebyshev(seatCoord(a), seatCoord(b));

export const areAdjacent = (a: string, b: string): boolean => seatDistance(a, b) === 1;

export const extractSeats = (layout: SeatLayout): string[] => {
  const result: string[] = [];
  for (let r = 0; r < layout.totalRows; r++) {
    for (let c = 0; c < layout.totalColumns; c++) {
      if (layout.cells[r]?.[c] === 1) {
        result.push(seatNumber(r, c));
      }
    }
  }
  return result;
};

export const cellStateAt = (layout: SeatLayout, s: string): CellState | undefined => {
  const { row, col } = seatCoord(s);
  return layout.cells[row]?.[col];
};

export const createEmptyCells = (
  rows: number,
  columns: number,
  fill: CellState = 0
): CellState[][] => {
  return Array.from({ length: rows }, () => Array<CellState>(columns).fill(fill));
};

export const resizeCells = (
  cells: CellState[][],
  newRows: number,
  newCols: number,
  fill: CellState = 0
): CellState[][] => {
  return Array.from({ length: newRows }, (_, r) =>
    Array.from({ length: newCols }, (_, c): CellState => {
      const existing = cells[r]?.[c];
      return existing !== undefined ? existing : fill;
    })
  );
};
