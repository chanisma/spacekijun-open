import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchDistinctTerms } from '@/lib/academicTermScan';
import type { Database } from '@/integrations/supabase/types';

export type TeacherTimetableRow = Database['public']['Tables']['teacher_timetable']['Row'];

export interface TeacherTimetableFilter {
  academicYear: number | null;
  semester: number | null;
  grade?: number | null;
  teacherResourceId?: string | null;
}

const PAGE_SIZE = 1000;

/** 교사 시간표가 존재하는 학기 목록(최신순). 잘림 없는 스캔 이유는 헬퍼 주석 참고. */
export function useTeacherTimetableTerms() {
  return useQuery({
    queryKey: ['teacher_timetable', 'terms'],
    queryFn: () => fetchDistinctTerms('teacher_timetable'),
  });
}

export function useTeacherTimetable(filter: TeacherTimetableFilter) {
  return useQuery({
    queryKey: ['teacher_timetable', 'list', filter],
    queryFn: async () => {
      if (filter.academicYear == null || filter.semester == null) return [] as TeacherTimetableRow[];

      const buildBase = () => {
        let q = supabase
          .from('teacher_timetable')
          .select('*')
          .eq('academic_year', filter.academicYear!)
          .eq('semester', filter.semester!);
        if (filter.grade != null) q = q.eq('grade', filter.grade);
        if (filter.teacherResourceId) q = q.eq('teacher_resource_id', filter.teacherResourceId);
        return q;
      };

      let countQ = supabase
        .from('teacher_timetable')
        .select('id', { count: 'exact', head: true })
        .eq('academic_year', filter.academicYear!)
        .eq('semester', filter.semester!);
      if (filter.grade != null) countQ = countQ.eq('grade', filter.grade);
      if (filter.teacherResourceId) countQ = countQ.eq('teacher_resource_id', filter.teacherResourceId);
      const { count, error: ce } = await countQ;
      if (ce) throw ce;
      const total = count ?? 0;
      if (total === 0) return [];

      const pages = Math.ceil(total / PAGE_SIZE);
      const promises = Array.from({ length: pages }, (_, i) =>
        buildBase()
          .order('teacher_name')
          .order('day_of_week')
          .order('period')
          .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1)
      );
      const results = await Promise.all(promises);
      const rows: TeacherTimetableRow[] = [];
      for (const { data, error } of results) {
        if (error) throw error;
        if (data) rows.push(...data);
      }
      return rows;
    },
    enabled: filter.academicYear != null && filter.semester != null,
  });
}

export interface TeacherSlots {
  teacher_name: string;
  teacher_resource_id: string | null;
  rows: TeacherTimetableRow[];
}

export function groupByTeacher(rows: TeacherTimetableRow[]): TeacherSlots[] {
  const m = new Map<string, TeacherSlots>();
  for (const r of rows) {
    const k = r.teacher_resource_id ?? `name:${r.teacher_name}`;
    let g = m.get(k);
    if (!g) {
      g = { teacher_name: r.teacher_name, teacher_resource_id: r.teacher_resource_id, rows: [] };
      m.set(k, g);
    }
    g.rows.push(r);
  }
  return Array.from(m.values()).sort((a, b) => a.teacher_name.localeCompare(b.teacher_name, 'ko'));
}
