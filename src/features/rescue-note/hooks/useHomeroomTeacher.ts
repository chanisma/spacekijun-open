import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * 특정 학급의 담임교사 이름을 조회한다.
 * 담임은 교사 resource 에 "N학년 M반" 형태의 resource_tag 가 연결되어 표현된다.
 * (useRescueAccess 의 HOMEROOM_TAG_PATTERN 과 동일 규칙의 역방향 조회)
 *
 * 조회 경로: resource_tags(name) → resource_tag_assignments(tag_id)
 *            → resource(id, name, type='teacher')
 */
async function fetchHomeroomTeacher(grade: number, classNum: number): Promise<string | null> {
  const tagName = `${grade}학년 ${classNum}반`;

  // 1) 담임 태그 id
  const { data: tag, error: tagErr } = await supabase
    .from('resource_tags')
    .select('id')
    .eq('name', tagName)
    .maybeSingle();
  if (tagErr) throw tagErr;
  if (!tag) return null;

  // 2) 태그에 연결된 resource id 들
  const { data: assigns, error: aErr } = await supabase
    .from('resource_tag_assignments')
    .select('resource_id')
    .eq('tag_id', tag.id);
  if (aErr) throw aErr;
  const resourceIds = (assigns ?? []).map((a: any) => a.resource_id as string);
  if (resourceIds.length === 0) return null;

  // 3) 교사 resource 이름
  const { data: teachers, error: rErr } = await supabase
    .from('resource')
    .select('name')
    .eq('type', 'teacher')
    .in('id', resourceIds);
  if (rErr) throw rErr;
  const names = (teachers ?? []).map((t: any) => t.name as string).filter(Boolean);
  return names.length > 0 ? names.join(', ') : null;
}

export function useHomeroomTeacher(grade: number | null, classNum: number | null) {
  return useQuery({
    queryKey: ['rescue-note', 'homeroom-teacher', grade, classNum],
    queryFn: () => fetchHomeroomTeacher(grade!, classNum!),
    enabled: grade !== null && classNum !== null,
    staleTime: 10 * 60 * 1000,
  });
}
