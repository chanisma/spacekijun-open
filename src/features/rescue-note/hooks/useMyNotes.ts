import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { RescueVisibility } from '../constants';

export interface MyNoteRow {
  id: string;
  noteNo: string | null;
  title: string;
  occurredAt: string;
  endAt: string | null;
  remarks: string | null;
  visibility: RescueVisibility;
  content: string;
  coStudentCodes: string[];
  linkedNoteId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  meta: Record<string, unknown>;
  // Student info
  studentCode: string;
  studentName: string;
  grade: number;
  classNum: number;
  numberInClass: number | null;
  // Aggregated
  tagKeys: string[];
  status: 'open' | 'monitoring' | 'closed';
}

async function fetchMyNotes(userId: string): Promise<MyNoteRow[]> {
  const { data: notes, error: notesErr } = await supabase
    .from('rescue_notes')
    .select('*')
    .eq('created_by', userId)
    .order('occurred_at', { ascending: false });
  if (notesErr) throw notesErr;
  if (!notes || notes.length === 0) return [];

  const studentCodes = Array.from(new Set(notes.map((n: any) => n.student_code as string)));

  // Batch fetch student basic info
  const { data: students, error: studentsErr } = await supabase
    .from('student_basic_info')
    .select('id, name, grade, class_num, number')
    .in('id', studentCodes);
  if (studentsErr) throw studentsErr;
  const studentMap = new Map((students ?? []).map((s: any) => [s.id, s]));

  // Batch fetch tags for those students
  const { data: tags, error: tagsErr } = await supabase
    .from('rescue_tags')
    .select('student_code, tag_key')
    .in('student_code', studentCodes);
  if (tagsErr) throw tagsErr;
  const tagsByStudent = new Map<string, string[]>();
  (tags ?? []).forEach((t: any) => {
    const arr = tagsByStudent.get(t.student_code as string) ?? [];
    arr.push(t.tag_key as string);
    tagsByStudent.set(t.student_code as string, arr);
  });

  // Batch fetch status
  const { data: statuses, error: statusErr } = await supabase
    .from('rescue_student_status')
    .select('student_code, status')
    .in('student_code', studentCodes);
  if (statusErr) throw statusErr;
  const statusMap = new Map((statuses ?? []).map((s: any) => [s.student_code, s.status as 'open' | 'monitoring' | 'closed']));

  return notes.map((n: any) => {
    const student = studentMap.get(n.student_code) as any;
    return {
      id: n.id,
      noteNo: n.note_no ?? null,
      title: n.title ?? '',
      occurredAt: n.occurred_at,
      endAt: n.end_at ?? null,
      remarks: n.remarks ?? null,
      visibility: n.visibility,
      content: n.content,
      coStudentCodes: (n.co_student_codes as string[] | null) ?? [],
      linkedNoteId: n.linked_note_id ?? null,
      createdBy: n.created_by,
      createdAt: n.created_at,
      updatedAt: n.updated_at,
      meta: n.meta ?? {},
      studentCode: n.student_code,
      studentName: student?.name ?? '(알 수 없음)',
      grade: student?.grade ?? 0,
      classNum: student?.class_num ?? 0,
      numberInClass: student?.number ?? null,
      tagKeys: tagsByStudent.get(n.student_code) ?? [],
      status: statusMap.get(n.student_code) ?? 'open',
    } as MyNoteRow;
  });
}

export function useMyNotes(userId: string | null) {
  return useQuery({
    queryKey: ['rescue-note', 'my-notes', userId],
    queryFn: () => fetchMyNotes(userId!),
    enabled: !!userId,
    staleTime: 60_000,
  });
}
