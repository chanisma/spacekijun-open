import { supabase } from '@/integrations/supabase/client';

export interface RescueRosterRow {
  studentCode: string;
  name: string;
  grade: number;
  classNum: number;
  numberInClass: number;
  gender: string | null;
  tagKeys: string[];
  status: 'open' | 'monitoring' | 'closed';
  lastNoteAt: string | null;
  noteCount: number;
}

export async function fetchRescueRoster(grade: number, classNum: number): Promise<RescueRosterRow[]> {
  const { data, error } = await supabase.rpc('get_rescue_roster', {
    p_grade: grade,
    p_class: classNum,
  });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    studentCode: r.student_code,
    name: r.name,
    grade: r.grade,
    classNum: r.class_num,
    numberInClass: r.number_in_class,
    gender: r.gender ?? null,
    tagKeys: r.tag_keys ?? [],
    status: r.status,
    lastNoteAt: r.last_note_at,
    noteCount: Number(r.note_count ?? 0),
  }));
}

/**
 * 학년 전체 로스터. 학년 내 각 반의 get_rescue_roster 를 병렬 호출해 합친다.
 * (get_rescue_roster 가 학년+반 둘 다 요구하므로 반 단위로 모아 합산)
 */
export async function fetchGradeRoster(
  grade: number,
  classNums: number[]
): Promise<RescueRosterRow[]> {
  if (classNums.length === 0) return [];
  const results = await Promise.all(
    classNums.map((c) => fetchRescueRoster(grade, c))
  );
  return results.flat();
}

export interface CrisisDashboardRow extends RescueRosterRow {
  homeroomName: string | null;
}

export async function fetchCrisisDashboard(): Promise<CrisisDashboardRow[]> {
  const { data, error } = await supabase.rpc('get_rescue_crisis_dashboard');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    studentCode: r.student_code,
    name: r.name,
    grade: r.grade,
    classNum: r.class_num,
    numberInClass: r.number_in_class,
    gender: null,
    homeroomName: r.homeroom_name,
    tagKeys: r.tag_keys ?? [],
    status: r.status,
    lastNoteAt: r.last_note_at,
    noteCount: Number(r.note_count ?? 0),
  }));
}
