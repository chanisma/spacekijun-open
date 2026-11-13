import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchDistinctTerms } from '@/lib/academicTermScan';
import type { Database } from '@/integrations/supabase/types';

export type TimetableRow = Database['public']['Tables']['student_timetable']['Row'];

export interface TimetableFilter {
  academicYear: number | null;
  semester: number | null;
  grade?: number | null;
  classNum?: number | null;
  resourceId?: string | null;
}

const PAGE_SIZE = 1000;

/** 시간표 데이터가 존재하는 학기 목록(최신순). 잘림 없는 스캔 이유는 헬퍼 주석 참고. */
export function useTimetableTerms() {
  return useQuery({
    queryKey: ['student_timetable', 'terms'],
    queryFn: () => fetchDistinctTerms('student_timetable'),
  });
}

export function useTimetable(filter: TimetableFilter) {
  return useQuery({
    queryKey: ['student_timetable', 'list', filter],
    queryFn: async () => {
      if (filter.academicYear == null || filter.semester == null) return [] as TimetableRow[];

      const buildBase = () => {
        let q = supabase
          .from('student_timetable')
          .select('*', { count: 'exact', head: false })
          .eq('academic_year', filter.academicYear!)
          .eq('semester', filter.semester!);
        if (filter.grade != null) q = q.eq('student_grade', filter.grade);
        if (filter.classNum != null) q = q.eq('student_class', filter.classNum);
        if (filter.resourceId) q = q.eq('resource_id', filter.resourceId);
        return q;
      };

      // count first
      let countQ = supabase
        .from('student_timetable')
        .select('id', { count: 'exact', head: true })
        .eq('academic_year', filter.academicYear!)
        .eq('semester', filter.semester!);
      if (filter.grade != null) countQ = countQ.eq('student_grade', filter.grade);
      if (filter.classNum != null) countQ = countQ.eq('student_class', filter.classNum);
      if (filter.resourceId) countQ = countQ.eq('resource_id', filter.resourceId);
      const { count, error: ce } = await countQ;
      if (ce) throw ce;
      const total = count ?? 0;
      if (total === 0) return [];

      const pages = Math.ceil(total / PAGE_SIZE);
      const promises = Array.from({ length: pages }, (_, i) =>
        buildBase()
          .order('student_grade')
          .order('student_class')
          .order('student_no')
          .order('day_of_week')
          .order('period')
          .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1)
      );
      const results = await Promise.all(promises);
      const rows: TimetableRow[] = [];
      for (const { data, error } of results) {
        if (error) throw error;
        if (data) rows.push(...data);
      }
      return rows;
    },
    enabled: filter.academicYear != null && filter.semester != null,
  });
}

export interface StudentSlot {
  resource_id: string;
  student_grade: number;
  student_class: number;
  student_no: number;
  student_name: string;
  rows: TimetableRow[];
}

export function groupByStudent(rows: TimetableRow[]): StudentSlot[] {
  const m = new Map<string, StudentSlot>();
  for (const r of rows) {
    const k = r.resource_id;
    let g = m.get(k);
    if (!g) {
      g = {
        resource_id: r.resource_id,
        student_grade: r.student_grade,
        student_class: r.student_class,
        student_no: r.student_no,
        student_name: r.student_name,
        rows: [],
      };
      m.set(k, g);
    }
    g.rows.push(r);
  }
  return Array.from(m.values()).sort(
    (a, b) =>
      a.student_grade - b.student_grade ||
      a.student_class - b.student_class ||
      a.student_no - b.student_no
  );
}
