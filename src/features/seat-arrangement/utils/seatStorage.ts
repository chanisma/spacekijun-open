import type {
  SeatLayout,
  Constraint,
  ArrangementCurrentState,
} from '../types';

const KEYS = {
  layouts: 'spacekijun.seat-arrangement.layouts.v1',
  constraints: 'spacekijun.seat-arrangement.constraints.v1',
  current: 'spacekijun.seat-arrangement.current.v1',
  notes: 'spacekijun.seat-arrangement.notes.v1',
} as const;

export const SEAT_STORAGE_KEYS = KEYS;

const safeParse = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const safeWrite = (key: string, value: unknown): boolean => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

export const loadLayouts = (): SeatLayout[] => {
  if (typeof window === 'undefined') return [];
  return safeParse<SeatLayout[]>(window.localStorage.getItem(KEYS.layouts), []);
};

export const saveLayouts = (layouts: SeatLayout[]): boolean => {
  if (typeof window === 'undefined') return false;
  return safeWrite(KEYS.layouts, layouts);
};

export const loadConstraints = (): Record<string, Constraint[]> => {
  if (typeof window === 'undefined') return {};
  return safeParse<Record<string, Constraint[]>>(
    window.localStorage.getItem(KEYS.constraints),
    {}
  );
};

export const saveConstraints = (map: Record<string, Constraint[]>): boolean => {
  if (typeof window === 'undefined') return false;
  return safeWrite(KEYS.constraints, map);
};

export const loadCurrent = (): ArrangementCurrentState => {
  if (typeof window === 'undefined') return {};
  return safeParse<ArrangementCurrentState>(window.localStorage.getItem(KEYS.current), {});
};

export const saveCurrent = (state: ArrangementCurrentState): boolean => {
  if (typeof window === 'undefined') return false;
  return safeWrite(KEYS.current, state);
};

export const loadNotes = (): Record<string, string> => {
  if (typeof window === 'undefined') return {};
  return safeParse<Record<string, string>>(window.localStorage.getItem(KEYS.notes), {});
};

export const saveNotes = (map: Record<string, string>): boolean => {
  if (typeof window === 'undefined') return false;
  return safeWrite(KEYS.notes, map);
};
