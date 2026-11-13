import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SeatStudent } from '../types';

interface ResourceStudentRow {
  id: string;
  name: string;
  meta: Record<string, unknown> | null;
}

interface ResourceStudentMeta {
  number?: number | string;
  grade?: number | string;
  class?: number | string;
}

const toNumber = (v: unknown, fallback = 0): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
};

export const seatArrangementKeys = {
  all: ['seat-arrangement'] as const,
  students: (grade: number | null, classNum: number | null) =>
    [...seatArrangementKeys.all, 'class-students', grade, classNum] as const,
};

export function useClassStudents(grade: number | null, classNum: number | null) {
  return useQuery({
    queryKey: seatArrangementKeys.students(grade, classNum),
    enabled: grade != null && classNum != null,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<SeatStudent[]> => {
      if (grade == null || classNum == null) return [];
      const { data, error } = await supabase
        .from('resource')
        .select('id, name, meta')
        .eq('type', 'student')
        .eq('status', 'active')
        .eq('meta->>grade', String(grade))
        .eq('meta->>class', String(classNum));

      if (error) {
        console.error('useClassStudents fetch error:', error);
        throw new Error('학생 목록을 불러올 수 없습니다.');
      }

      return ((data ?? []) as ResourceStudentRow[])
        .map((row) => {
          const meta = (row.meta ?? {}) as ResourceStudentMeta;
          return {
            resourceId: row.id,
            name: row.name,
            number: toNumber(meta.number, 0),
            grade,
            classNum,
          } satisfies SeatStudent;
        })
        .sort((a, b) => {
          if (a.number !== b.number) return a.number - b.number;
          return a.name.localeCompare(b.name);
        });
    },
  });
}
