import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * 담임교사 매핑 — resource_tags "N학년 M반" 태그(권위 출처, rescue-note·exam-schedule 동일)에서
 * (학년, 반) → 담임 이름을 만든다. 봉사 확인서의 확인자 성명 기본값으로 사용.
 *
 * 반환: homeroomOf(grade, cls) → 담임명 | undefined
 */
export function useHomeroomTeachers() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['issue-register', 'homeroom-teachers'],
    queryFn: async () => {
      // "N학년 M반" 형식 태그만
      const { data: tags, error: tErr } = await supabase
        .from('resource_tags')
        .select('id, name')
        .like('name', '%학년%반');
      if (tErr) throw new Error(tErr.message);
      const classTags = (tags ?? []).filter(t => /^[1-3]\s*학년\s*\d+\s*반$/.test(t.name));
      if (classTags.length === 0) return [] as { grade: number; cls: number; name: string }[];

      const tagIds = classTags.map(t => t.id);
      const { data: asg, error: aErr } = await supabase
        .from('resource_tag_assignments')
        .select('tag_id, resource_id')
        .in('tag_id', tagIds);
      if (aErr) throw new Error(aErr.message);

      const resourceIds = [...new Set((asg ?? []).map(a => a.resource_id))];
      if (resourceIds.length === 0) return [];
      const { data: teachers, error: rErr } = await supabase
        .from('resource')
        .select('id, name, type')
        .in('id', resourceIds)
        .eq('type', 'teacher');
      if (rErr) throw new Error(rErr.message);
      const nameById = new Map((teachers ?? []).map(r => [r.id, r.name]));

      const tagById = new Map(classTags.map(t => [t.id, t.name]));
      const out: { grade: number; cls: number; name: string }[] = [];
      for (const a of asg ?? []) {
        const tagName = tagById.get(a.tag_id);
        const teacherName = nameById.get(a.resource_id);
        if (!tagName || !teacherName) continue;
        const m = tagName.match(/^([1-3])\s*학년\s*(\d+)\s*반$/);
        if (!m) continue;
        out.push({ grade: Number(m[1]), cls: Number(m[2]), name: teacherName });
      }
      return out;
    },
    staleTime: 5 * 60 * 1000,
  });

  const map = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of data) m.set(`${r.grade}_${r.cls}`, r.name);
    return m;
  }, [data]);

  // 안정적 identity — map이 바뀔 때만 갱신 (소비자 effect의 불필요한 재실행 방지)
  const homeroomOf = useCallback(
    (grade?: number | null, cls?: number | null): string | undefined => {
      if (grade == null || cls == null) return undefined;
      return map.get(`${grade}_${cls}`);
    },
    [map],
  );

  return { homeroomOf, isLoading };
}
