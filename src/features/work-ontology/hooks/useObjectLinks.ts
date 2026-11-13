// 객체 하나의 연결(ontology_link) + 상대 이름 (2026-11-08, P1)
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import type { ObjectType } from '../model/objectRef';
import type { LinkKind } from '../model/explicitLinks';
import { fetchLinks, linkObjects, resolveObjects, unlinkObjects } from '../services/ontologyLinkService';

export const OBJECT_LINKS_KEY = 'object-links';

export function useObjectLinks(type: ObjectType | null, id: string | null) {
  return useQuery({
    queryKey: [OBJECT_LINKS_KEY, type, id],
    enabled: !!type && !!id,
    queryFn: async () => {
      const rows = await fetchLinks(type!, id!);
      const refs = rows.map((r) => (r.from_type === type && r.from_id === id
        ? { type: r.to_type, id: r.to_id }
        : { type: r.from_type, id: r.from_id }));
      const resolved = await resolveObjects(refs);
      return { rows, resolved };
    },
  });
}

export function useLinkMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: [OBJECT_LINKS_KEY] });
  const link = useMutation({
    mutationFn: (input: { fromType: ObjectType; fromId: string; toType: ObjectType; toId: string; kind: LinkKind; note?: string | null }) =>
      linkObjects(input),
    onSuccess: refresh,
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : '잇지 못했습니다'),
  });
  // 끊기는 흔한 동작 — 묻지 않고 [되돌리기](CLAUDE.md «확인창은 되돌릴 수 없거나 남에게 번지는 것만»)
  const unlink = useMutation({
    mutationFn: async (input: { id: string; restore: Parameters<typeof linkObjects>[0] }) => {
      const ok = await unlinkObjects(input.id);
      if (!ok) throw new Error('끊지 못했습니다 — 만든 사람이나 관리자만 끊을 수 있습니다');
      return input.restore;
    },
    onSuccess: (restore) => {
      refresh();
      toast.success('연결을 끊었습니다', {
        action: { label: '되돌리기', onClick: () => { void linkObjects(restore).then(refresh); } },
      });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : '끊지 못했습니다'),
  });
  return { link, unlink };
}
