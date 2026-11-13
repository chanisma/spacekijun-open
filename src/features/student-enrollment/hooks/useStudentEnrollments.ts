import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchDistinctTerms } from '@/lib/academicTermScan';
import type { Database } from '@/integrations/supabase/types';

export type EnrollmentRow = Database['public']['Tables']['student_enrollment']['Row'];
export type EnrollmentInsert = Database['public']['Tables']['student_enrollment']['Insert'];
export type EnrollmentUpdate = Database['public']['Tables']['student_enrollment']['Update'];

export interface EnrollmentFilter {
  academicYear: number | null;
  semester: number | null;
}

/** 편성 데이터가 존재하는 학기 목록(최신순). 잘림 없는 스캔 이유는 헬퍼 주석 참고. */
export function useEnrollmentTerms() {
  return useQuery({
    queryKey: ['student_enrollment', 'terms'],
    queryFn: () => fetchDistinctTerms('student_enrollment'),
  });
}

const PAGE_SIZE = 1000;

export function useEnrollments(filter: EnrollmentFilter) {
  return useQuery({
    queryKey: ['student_enrollment', 'list', filter],
    queryFn: async () => {
      if (filter.academicYear == null || filter.semester == null) return [] as EnrollmentRow[];

      // 1. 총 행수 head 조회
      const { count, error: countErr } = await supabase
        .from('student_enrollment')
        .select('id', { count: 'exact', head: true })
        .eq('academic_year', filter.academicYear)
        .eq('semester', filter.semester);
      if (countErr) throw countErr;
      const total = count ?? 0;
      if (total === 0) return [];

      // 2. 페이지 수만큼 병렬 fetch
      const pages = Math.ceil(total / PAGE_SIZE);
      const promises = Array.from({ length: pages }, (_, i) =>
        supabase
          .from('student_enrollment')
          .select('*')
          .eq('academic_year', filter.academicYear!)
          .eq('semester', filter.semester!)
          .order('subject_name')
          .order('classroom')
          .order('student_grade')
          .order('student_class')
          .order('student_no')
          .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1)
      );
      const results = await Promise.all(promises);
      const rows: EnrollmentRow[] = [];
      for (const { data, error } of results) {
        if (error) throw error;
        if (data) rows.push(...data);
      }
      return rows;
    },
    enabled: filter.academicYear != null && filter.semester != null,
  });
}

interface ResourceLookup {
  id: string;
  name: string | null;
  meta: { grade?: number | string; class?: number | string; number?: number | string; [k: string]: unknown } | null;
}

const studentKey = (
  grade: number | null | undefined,
  classNo: number | null | undefined,
  no: number | null | undefined,
  name: string | null | undefined
) => `${grade ?? ''}|${classNo ?? ''}|${no ?? ''}|${(name ?? '').trim()}`;

const toIntSafe = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
};

// resource.meta에서 직접 (grade, class, number, name) → resource.id 매핑
async function fetchStudentResourceMap(): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('resource')
    .select('id, name, meta')
    .eq('type', 'student');
  if (error) throw error;
  const map = new Map<string, string>();
  for (const r of (data ?? []) as ResourceLookup[]) {
    const grade = toIntSafe(r.meta?.grade);
    const cls = toIntSafe(r.meta?.class);
    const no = toIntSafe(r.meta?.number);
    const name = r.name?.trim();
    if (grade != null && cls != null && no != null && name) {
      map.set(studentKey(grade, cls, no, name), r.id);
    }
  }
  return map;
}

interface CurriculumLookup {
  id: string;
  academic_year: number;
  semester: number;
  grade: number;
  subject: string;
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

interface OfferingLookup {
  id: string;
  academic_year: number;
  semester: number;
  subject_name: string;
  classroom: string | null;
}

const normSpaces = (s: string | null | undefined): string =>
  (s ?? '').replace(/\s+/g, ' ').trim();

async function fetchOfferingMap(academicYear: number, semester: number): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('course_offering')
    .select('id, academic_year, semester, subject_name, classroom')
    .eq('academic_year', academicYear)
    .eq('semester', semester);
  if (error) throw error;
  const map = new Map<string, string>();
  for (const o of (data ?? []) as OfferingLookup[]) {
    const key = `${o.subject_name}|${normSpaces(o.classroom)}`;
    if (!map.has(key)) map.set(key, o.id);
  }
  return map;
}

export interface BatchUpsertInput {
  rows: EnrollmentInsert[];
}

export interface BatchUpsertResult {
  inserted: number;
  curriculumMatched: number;
  curriculumMissing: number;
  offeringMatched: number;
  offeringMissing: number;
  studentMatched: number;
  studentMissing: number;
}

export function useUpsertEnrollmentBatch() {
  const qc = useQueryClient();
  return useMutation<BatchUpsertResult, Error, BatchUpsertInput>({
    mutationFn: async ({ rows }) => {
      // 학기별 캐시
      const termKeys = new Set(rows.map((r) => `${r.academic_year}|${r.semester}`));
      const curriculumMaps = new Map<string, Map<string, string>>();
      const offeringMaps = new Map<string, Map<string, string>>();
      for (const k of termKeys) {
        const [ay, sem] = k.split('|').map(Number);
        curriculumMaps.set(k, await fetchCurriculumMap(ay, sem));
        offeringMaps.set(k, await fetchOfferingMap(ay, sem));
      }
      const studentMap = await fetchStudentResourceMap();

      let curriculumMatched = 0, offeringMatched = 0, studentMatched = 0;

      const enriched: EnrollmentInsert[] = rows.map((r) => {
        const cMap = curriculumMaps.get(`${r.academic_year}|${r.semester}`);
        const cKey = r.academic_grade != null
          ? `${r.academic_grade}|${r.subject_name.replace(/\(공동\)\s*/g, '').trim()}`
          : null;
        const cId = cKey ? cMap?.get(cKey) ?? null : null;
        if (cId) curriculumMatched++;

        const oMap = offeringMaps.get(`${r.academic_year}|${r.semester}`);
        const oKey = `${r.subject_name}|${normSpaces(r.classroom)}`;
        const oId = oMap?.get(oKey) ?? null;
        if (oId) offeringMatched++;

        // 학생 매칭: (학년, 반 번호, 출석번호, 이름) — resource.meta 직접 매칭
        const classNo = (() => {
          if (!r.student_class) return null;
          const m = String(r.student_class).match(/(\d+)/);
          return m ? parseInt(m[1], 10) : null;
        })();
        const sKey = studentKey(r.student_grade, classNo, r.student_no, r.student_name);
        const sId = studentMap.get(sKey) ?? null;
        if (sId) studentMatched++;

        return { ...r, curriculum_id: cId, course_offering_id: oId, student_resource_id: sId };
      });

      // chunk upsert (한 번에 너무 많으면 timeout 가능 → 500개씩)
      const CHUNK = 500;
      let inserted = 0;
      for (let i = 0; i < enriched.length; i += CHUNK) {
        const chunk = enriched.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from('student_enrollment')
          .upsert(chunk, {
            onConflict: 'academic_year,semester,subject_name,classroom,student_grade,student_class,student_no,student_name',
          })
          .select('id');
        if (error) throw error;
        inserted += data?.length ?? 0;
      }

      return {
        inserted,
        curriculumMatched,
        curriculumMissing: rows.length - curriculumMatched,
        offeringMatched,
        offeringMissing: rows.length - offeringMatched,
        studentMatched,
        studentMissing: rows.length - studentMatched,
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student_enrollment'] });
    },
  });
}

export function useUpdateEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: EnrollmentUpdate }) => {
      const { data, error } = await supabase.from('student_enrollment').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['student_enrollment'] }),
  });
}

export function useDeleteEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('student_enrollment').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['student_enrollment'] }),
  });
}

export interface SubjectClassroomGroup {
  subject_name: string;
  credits: number | null;
  classroom: string | null;
  academic_grade: number | null;
  curriculum_id: string | null;
  course_offering_id: string | null;
  rows: EnrollmentRow[];
}

export function groupBySubjectClassroom(rows: EnrollmentRow[]): SubjectClassroomGroup[] {
  const map = new Map<string, SubjectClassroomGroup>();
  for (const r of rows) {
    const key = `${r.subject_name}|${r.classroom ?? ''}`;
    let g = map.get(key);
    if (!g) {
      g = {
        subject_name: r.subject_name,
        credits: r.credits,
        classroom: r.classroom,
        academic_grade: r.academic_grade,
        curriculum_id: r.curriculum_id,
        course_offering_id: r.course_offering_id,
        rows: [],
      };
      map.set(key, g);
    }
    g.rows.push(r);
  }
  return Array.from(map.values()).sort((a, b) => {
    const ag = (a.academic_grade ?? 99) - (b.academic_grade ?? 99);
    if (ag !== 0) return ag;
    const sj = a.subject_name.localeCompare(b.subject_name);
    if (sj !== 0) return sj;
    return (a.classroom ?? '').localeCompare(b.classroom ?? '');
  });
}
