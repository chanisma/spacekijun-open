import type { CellState, LayoutPreset } from '../types';
import { createEmptyCells } from './seatGeometry';

// 1인 좌석 그리드: 모든 셀이 좌석
const buildSinglePattern = (rows: number, columns: number): CellState[][] => {
  return Array.from({ length: rows }, () =>
    Array.from({ length: columns }, (): CellState => 1)
  );
};

// 2인 짝 그리드: pairsPerRow 쌍, 짝 사이 통로 1열
// 패턴: 좌석, 좌석, 통로, 좌석, 좌석, 통로, ...
// columns = 2*pairsPerRow + (pairsPerRow - 1) = 3*pairsPerRow - 1
const pairColumns = (pairsPerRow: number): number =>
  Math.max(1, 3 * pairsPerRow - 1);

const buildPairPattern = (rows: number, pairsPerRow: number): CellState[][] => {
  const columns = pairColumns(pairsPerRow);
  return Array.from({ length: rows }, () =>
    Array.from({ length: columns }, (_, c): CellState => {
      if (pairsPerRow <= 1) return 1;
      return c % 3 === 2 ? 0 : 1;
    })
  );
};

// 학생 수 → 필요한 행 수 (per-row 좌석 수 기반)
export const computeRows = (
  studentCount: number,
  seatsPerRow: number,
  fallback: number
): number => {
  if (studentCount <= 0 || seatsPerRow <= 0) return fallback;
  return Math.max(1, Math.ceil(studentCount / seatsPerRow));
};

// 한 행당 좌석 수 (1인=columns, 2인=pairsPerRow*2)
export const seatsPerRowFor = (preset: LayoutPreset): number => {
  if (preset.pairing === 'pair') {
    // pair preset에서 columns = pairsPerRow * 3 - 1
    const pairsPerRow = Math.max(1, Math.round((preset.columns + 1) / 3));
    return pairsPerRow * 2;
  }
  return preset.columns;
};

// 학생 수 기준으로 행을 자동 조정한 LayoutPreset 빌더
export const buildAdaptivePreset = (
  base: LayoutPreset,
  studentCount: number
): LayoutPreset => {
  if (base.key === 'free') return base;

  const seatsPerRow = seatsPerRowFor(base);
  const adaptedRows = computeRows(studentCount, seatsPerRow, base.rows);
  return {
    ...base,
    rows: adaptedRows,
    build: (rows, columns) => base.build(rows, columns),
  };
};

// 프리셋 정의 — rows는 기본값(학생 미선택 시), 실제로는 buildAdaptivePreset으로 학생 수 기반 산출
export const PRESETS: LayoutPreset[] = [
  {
    key: 'single-5',
    label: '1인 좌석 · 5열',
    description: '한 행 5명, 학생 수에 맞춰 행 자동',
    pairing: 'single',
    rows: 5,
    columns: 5,
    build: (rows, columns) => buildSinglePattern(rows, columns),
  },
  {
    key: 'pair-3',
    label: '2인 짝 · 3쌍',
    description: '한 행 6명 (3쌍 + 통로), 학생 수에 맞춰 행 자동',
    pairing: 'pair',
    rows: 5,
    columns: pairColumns(3),
    build: (rows) => buildPairPattern(rows, 3),
  },
  {
    key: 'free',
    label: '자유 그리드',
    description: '직접 행·열 입력 후 페인트',
    pairing: 'single',
    rows: 5,
    columns: 5,
    build: (rows, columns) => createEmptyCells(rows, columns, 1),
  },
];

export const findPreset = (key: string): LayoutPreset | undefined =>
  PRESETS.find((p) => p.key === key);
