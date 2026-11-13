import { useCallback, useEffect, useState } from 'react';
import type { Constraint } from '../types';
import { loadConstraints, saveConstraints } from '../utils/seatStorage';

const generateId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `constraint-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export interface UseConstraintsResult {
  constraints: Constraint[];
  addConstraint: (input: Omit<Constraint, 'id'>) => Constraint;
  removeConstraint: (id: string) => void;
  clearConstraints: () => void;
  setFixed: (resourceId: string, seat: string) => void; // seat이 null/undefined면 해제
  removeFixed: (resourceId: string) => void;
}

export function useConstraints(classKey: string | null): UseConstraintsResult {
  const [allMap, setAllMap] = useState<Record<string, Constraint[]>>(() =>
    loadConstraints()
  );

  useEffect(() => {
    const onStorage = () => setAllMap(loadConstraints());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const persist = useCallback((next: Record<string, Constraint[]>) => {
    setAllMap(next);
    saveConstraints(next);
  }, []);

  const constraints: Constraint[] = classKey ? allMap[classKey] ?? [] : [];

  const addConstraint: UseConstraintsResult['addConstraint'] = useCallback(
    (input) => {
      if (!classKey) {
        return { ...(input as Constraint), id: generateId() };
      }
      const next: Constraint = { ...(input as Constraint), id: generateId() };
      const updatedList = [...(allMap[classKey] ?? []), next];
      persist({ ...allMap, [classKey]: updatedList });
      return next;
    },
    [classKey, allMap, persist]
  );

  const removeConstraint: UseConstraintsResult['removeConstraint'] = useCallback(
    (id) => {
      if (!classKey) return;
      const list = (allMap[classKey] ?? []).filter((c) => c.id !== id);
      persist({ ...allMap, [classKey]: list });
    },
    [classKey, allMap, persist]
  );

  const clearConstraints: UseConstraintsResult['clearConstraints'] = useCallback(() => {
    if (!classKey) return;
    const next = { ...allMap };
    delete next[classKey];
    persist(next);
  }, [classKey, allMap, persist]);

  const setFixed: UseConstraintsResult['setFixed'] = useCallback(
    (resourceId, seat) => {
      if (!classKey) return;
      const list = (allMap[classKey] ?? []).filter(
        (c) => !(c.kind === 'fixed' && c.resourceId === resourceId)
      );
      list.push({ id: generateId(), kind: 'fixed', resourceId, seat });
      persist({ ...allMap, [classKey]: list });
    },
    [classKey, allMap, persist]
  );

  const removeFixed: UseConstraintsResult['removeFixed'] = useCallback(
    (resourceId) => {
      if (!classKey) return;
      const list = (allMap[classKey] ?? []).filter(
        (c) => !(c.kind === 'fixed' && c.resourceId === resourceId)
      );
      persist({ ...allMap, [classKey]: list });
    },
    [classKey, allMap, persist]
  );

  return {
    constraints,
    addConstraint,
    removeConstraint,
    clearConstraints,
    setFixed,
    removeFixed,
  };
}
