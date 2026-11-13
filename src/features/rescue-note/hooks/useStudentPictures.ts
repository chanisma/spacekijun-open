import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

type PictureMap = Record<string, string | null>;

async function fetchPictures(codes: string[]): Promise<PictureMap> {
  if (codes.length === 0) return {};
  const unique = Array.from(new Set(codes));
  const { data, error } = await supabase
    .from('resource')
    .select('meta')
    .eq('type', 'student')
    .in('meta->>id', unique);
  if (error) throw error;
  const map: PictureMap = {};
  unique.forEach((c) => { map[c] = null; });
  (data ?? []).forEach((r: any) => {
    const meta = r.meta ?? {};
    const id = meta.id as string | undefined;
    const picture = (meta.picture as string | undefined) ?? null;
    if (id) map[id] = picture;
  });
  return map;
}

export function useStudentPictures(codes: string[]) {
  const stableKey = Array.from(new Set(codes)).sort().join(',');
  return useQuery({
    queryKey: ['rescue-note', 'student-pictures', stableKey],
    queryFn: () => fetchPictures(codes),
    enabled: codes.length > 0,
    staleTime: 10 * 60 * 1000,
  });
}

export function useStudentPicture(code: string | null) {
  const q = useStudentPictures(code ? [code] : []);
  return {
    picture: code ? (q.data?.[code] ?? null) : null,
    isLoading: q.isLoading,
  };
}
