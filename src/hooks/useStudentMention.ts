import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MentionItem {
  // 저장 포맷: 학생 "@[1-3-15:김민준]", 교사 "@[황하준]"
  bracketContent: string; // 괄호 안 내용 (저장값의 [ ] 사이)
  name: string;
  type: 'student' | 'teacher';
  picture?: string | null;
}

export function useStudentMention(query: string) {
  const trimmed = query.trim();

  return useQuery({
    queryKey: ['mention-search', trimmed],
    queryFn: async (): Promise<MentionItem[]> => {
      const [studentRes, teacherRes] = await Promise.all([
        supabase
          .from('student_dashboard_view')
          .select('resource_id, name, grade, class_num, number, picture')
          .not('resource_id', 'is', null)
          .ilike('name', `%${trimmed}%`)
          .limit(15),
        supabase
          .from('resource')
          .select('id, name')
          .eq('type', 'teacher')
          .ilike('name', `%${trimmed}%`)
          .limit(10),
      ]);

      const students: MentionItem[] = (studentRes.data ?? []).map((row: any) => ({
        bracketContent: `${row.grade}-${row.class_num}-${row.number}:${row.name}`,
        name: row.name,
        type: 'student',
        picture: row.picture,
      }));

      const teachers: MentionItem[] = (teacherRes.data ?? []).map((row: any) => ({
        bracketContent: row.name,
        name: row.name,
        type: 'teacher',
      }));

      return [...teachers, ...students];
    },
    enabled: trimmed.length > 0,
    staleTime: 30_000,
  });
}

/** 저장된 bracketContent에서 학생/교사 여부 판별 */
export function parseMentionContent(content: string) {
  const colonIdx = content.lastIndexOf(':');
  if (colonIdx !== -1 && /^\d+-\d+-\d+$/.test(content.slice(0, colonIdx))) {
    const code = content.slice(0, colonIdx); // "1-3-15"
    const name = content.slice(colonIdx + 1);
    const [grade, classNum, number] = code.split('-').map(Number);
    return { type: 'student' as const, grade, classNum, number, name };
  }
  return { type: 'teacher' as const, name: content };
}
