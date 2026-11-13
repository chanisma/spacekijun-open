import { useCallback, useEffect, useState } from 'react';
import { loadNotes, saveNotes } from '../utils/seatStorage';

export interface UseSeatNotesResult {
  notes: string;
  setNotes: (value: string) => void;
}

export function useSeatNotes(classKey: string | null): UseSeatNotesResult {
  const [allMap, setAllMap] = useState<Record<string, string>>(() => loadNotes());

  useEffect(() => {
    const onStorage = () => setAllMap(loadNotes());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const notes = classKey ? allMap[classKey] ?? '' : '';

  const setNotes: UseSeatNotesResult['setNotes'] = useCallback(
    (value) => {
      if (!classKey) return;
      setAllMap((prev) => {
        const next = { ...prev, [classKey]: value };
        saveNotes(next);
        return next;
      });
    },
    [classKey]
  );

  return { notes, setNotes };
}
