import { useCallback, useEffect, useState } from 'react';
import type { CellState, SeatLayout } from '../types';
import { loadLayouts, saveLayouts } from '../utils/seatStorage';
import { createEmptyCells } from '../utils/seatGeometry';

const MAX_LAYOUTS = 50;

const generateId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `layout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export interface UseSeatLayoutsResult {
  layouts: SeatLayout[];
  createLayout: (input: {
    name: string;
    rows: number;
    columns: number;
    cells?: CellState[][];
    pairing?: 'single' | 'pair';
  }) => SeatLayout;
  updateLayout: (id: string, patch: Partial<SeatLayout>) => SeatLayout | null;
  deleteLayout: (id: string) => void;
  getLayout: (id: string) => SeatLayout | undefined;
  reload: () => void;
}

export function useSeatLayouts(): UseSeatLayoutsResult {
  const [layouts, setLayouts] = useState<SeatLayout[]>(() => loadLayouts());

  // localStorage 변경 시 동기화 (다른 탭/창에서 변경)
  useEffect(() => {
    const onStorage = () => setLayouts(loadLayouts());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const persist = useCallback((next: SeatLayout[]) => {
    setLayouts(next);
    saveLayouts(next);
  }, []);

  const createLayout: UseSeatLayoutsResult['createLayout'] = useCallback(
    ({ name, rows, columns, cells, pairing }) => {
      const layout: SeatLayout = {
        id: generateId(),
        name,
        totalRows: rows,
        totalColumns: columns,
        cells: cells ?? createEmptyCells(rows, columns, 1),
        pairing: pairing ?? 'single',
        updatedAt: new Date().toISOString(),
      };
      const next = [layout, ...layouts].slice(0, MAX_LAYOUTS);
      persist(next);
      return layout;
    },
    [layouts, persist]
  );

  const updateLayout: UseSeatLayoutsResult['updateLayout'] = useCallback(
    (id, patch) => {
      const idx = layouts.findIndex((l) => l.id === id);
      if (idx < 0) return null;
      const updated: SeatLayout = {
        ...layouts[idx],
        ...patch,
        id: layouts[idx].id,
        updatedAt: new Date().toISOString(),
      };
      const next = layouts.slice();
      next[idx] = updated;
      persist(next);
      return updated;
    },
    [layouts, persist]
  );

  const deleteLayout: UseSeatLayoutsResult['deleteLayout'] = useCallback(
    (id) => {
      persist(layouts.filter((l) => l.id !== id));
    },
    [layouts, persist]
  );

  const getLayout: UseSeatLayoutsResult['getLayout'] = useCallback(
    (id) => layouts.find((l) => l.id === id),
    [layouts]
  );

  const reload = useCallback(() => setLayouts(loadLayouts()), []);

  return { layouts, createLayout, updateLayout, deleteLayout, getLayout, reload };
}
