import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchDistinctTerms } from '@/lib/academicTermScan';
import type { Database } from '@/integrations/supabase/types';

export type CourseOfferingRow = Database['public']['Tables']['course_offering']['Row'];
export type CourseOfferingInsert = Database['public']['Tables']['course_offering']['Insert'];
export type CourseOfferingUpdate = Database['public']['Tables']['course_offering']['Update'];

export interface OfferingTermFilter {
  academicYear: number | null;
  semester: number | null;
  grade?: number | null;
}

/** 개설 강좌가 존재하는 학기 목록(최신순). 잘림 없는 스캔 이유는 헬퍼 주석 참고. */
export function useOfferingTerms() {
  return useQuery({
    queryKey: ['course_offering', 'terms'],
    queryFn: () => fetchDistinctTerms('course_offering'),
  });
}

const OFFERING_PAGE_SIZE = 1000;

export function useOfferings(filter: OfferingTermFilter) {
  return useQuery({
    queryKey: ['course_offering', 'list', filter],
    queryFn: async () => {
      if (filter.academicYear == null || filter.semester == null) return [] as CourseOfferingRow[];

      // 총 행수
      let countQ = supabase
        .from('course_offering')
        .select('id', { count: 'exact', head: true })
        .eq('academic_year', filter.academicYear)
        .eq('semester', filter.semester);
      if (filter.grade != null) countQ = countQ.eq('grade', filter.grade);
      const { count, error: countErr } = await countQ;
      if (countErr) throw countErr;
      const total = count ?? 0;
      if (total === 0) return [];

      // 페이지 병렬 fetch
      const pages = Math.ceil(total / OFFERING_PAGE_SIZE);
      const promises = Array.from({ length: pages }, (_, i) => {
        let q = supabase
          .from('course_offering')
          .select('*')
          .eq('academic_year', filter.academicYear!)
          .eq('semester', filter.semester!);
        if (filter.grade != null) q = q.eq('grade', filter.grade);
        return q
          .order('grade')
          .order('subject_name')
          .order('classroom')
          .range(i * OFFERING_PAGE_SIZE, (i + 1) * OFFERING_PAGE_SIZE - 1);
      });
      const results = await Promise.all(promises);
      const rows: CourseOfferingRow[] = [];
      for (const { data, error } of results) {
        if (error) throw error;
        if (data) rows.push(...data);
      }
      return rows;
    },
    enabled: filter.academicYear != null && filter.semester != null,
  });
}

interface CurriculumLookup {
  id: string;
  academic_year: number;
  semester: number;
  grade: number;
  subject: string;
}

interface ResourceLookup {
  id: string;
  name: string | null;
  meta: { email?: string; [k: string]: unknown } | null;
}

async function fetchCurriculumMap(academicYear: number, semester: number): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('school_curriculum')
    .select('id, academic_year, semester, grade, subject')
    .eq('academic_year', academicYear)
    .eq('semester', semester);
  if (error) throw error;
  const map = new Map<string, string>();
  for (const c of (data ?? []) as CurriculumLookup[]) {
    map.set(`${c.grade}|${c.subject}`, c.id);
  }
  return map;
}

async function fetchResourceMap(): Promise<{ byUsername: Map<string, string>; byName: Map<string, string> }> {
  const { data, error } = await supabase
    .from('resource')
    .select('id, name, meta')
    .eq('type', 'teacher');
  if (error) throw error;
  const byUsername = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const r of (data ?? []) as ResourceLookup[]) {
    const email = r.meta?.email;
    if (typeof email === 'string') {
      const username = email.split('@')[0]?.trim().toLowerCase();
      if (username && !byUsername.has(username)) byUsername.set(username, r.id);
    }
    if (r.name) {
      const k = r.name.trim();
      if (k && !byName.has(k)) byName.set(k, r.id);
    }
  }
  return { byUsername, byName };
}

export interface BatchUpsertInput {
  rows: CourseOfferingInsert[];
}

export interface BatchUpsertResult {
  inserted: number;
  curriculumMatched: number;
  curriculumMissing: number;
  teacherMatched: number;
  teacherMissing: number;
}

export function useUpsertOfferingBatch() {
  const qc = useQueryClient();
  return useMutation<BatchUpsertResult, Error, BatchUpsertInput>({
    mutationFn: async ({ rows }) => {
      // 그룹별 (academic_year, semester)로 curriculum map 캐시
      const termKeys = new Set(rows.map((r) => `${r.academic_year}|${r.semester}`));
      const curriculumMaps = new Map<string, Map<string, string>>();
      for (const k of termKeys) {
        const [ay, sem] = k.split('|').map(Number);
        curriculumMaps.set(k, await fetchCurriculumMap(ay, sem));
      }
      const { byUsername, byName } = await fetchResourceMap();

      let curriculumMatched = 0;
      let teacherMatched = 0;

      const enriched: CourseOfferingInsert[] = rows.map((r) => {
        const cMap = curriculumMaps.get(`${r.academic_year}|${r.semester}`);
        const cKey = r.grade != null && r.subject_name
          ? `${r.grade}|${r.subject_name.replace(/\(공동\)\s*/g, '').trim()}`
          : null;
        const cId = cKey ? cMap?.get(cKey) ?? null : null;
        if (cId) curriculumMatched++;

        const meta = r.meta as { teacher_username?: string } | null | undefined;
        const username = meta?.teacher_username?.toLowerCase();
        let tId = username ? byUsername.get(username) ?? null : null;
        if (!tId && r.teacher_name) tId = byName.get(r.teacher_name.trim()) ?? null;
        if (tId) teacherMatched++;

        return { ...r, curriculum_id: cId, teacher_resource_id: tId };
      });

      const { data, error } = await supabase
        .from('course_offering')
        .upsert(enriched, { onConflict: 'academic_year,semester,subject_name,classroom,teacher_name' })
        .select('id');
      if (error) throw error;

      return {
        inserted: data?.length ?? 0,
        curriculumMatched,
        curriculumMissing: rows.length - curriculumMatched,
        teacherMatched,
        teacherMissing: rows.length - teacherMatched,
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course_offering'] });
    },
  });
}

export function useUpdateOffering() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: CourseOfferingUpdate }) => {
      const { data, error } = await supabase
        .from('course_offering')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course_offering'] });
    },
  });
}

export function useDeleteOffering() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('course_offering').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course_offering'] });
    },
  });
}

export interface OfferingGroup {
  subject_name: string;
  credits: number | null;
  curriculumMatched: boolean;
  rows: CourseOfferingRow[];
}

export function groupBySubject(rows: CourseOfferingRow[]): OfferingGroup[] {
  const groups = new Map<string, OfferingGroup>();
  for (const r of rows) {
    const key = r.subject_name;
    const g = groups.get(key) ?? {
      subject_name: r.subject_name,
      credits: r.credits,
      curriculumMatched: false,
      rows: [],
    };
    if (r.curriculum_id) g.curriculumMatched = true;
    if (r.credits != null) g.credits = r.credits;
    g.rows.push(r);
    groups.set(key, g);
  }
  return Array.from(groups.values()).sort((a, b) => a.subject_name.localeCompare(b.subject_name));
}

export function groupByGradeThenSubject(rows: CourseOfferingRow[]): { grade: number | null; groups: OfferingGroup[] }[] {
  const byGrade = new Map<number | null, CourseOfferingRow[]>();
  for (const r of rows) {
    const arr = byGrade.get(r.grade ?? null) ?? [];
    arr.push(r);
    byGrade.set(r.grade ?? null, arr);
  }
  return Array.from(byGrade.entries())
    .sort(([a], [b]) => (a ?? 99) - (b ?? 99))
    .map(([grade, rs]) => ({ grade, groups: groupBySubject(rs) }));
}
