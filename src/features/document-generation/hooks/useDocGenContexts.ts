// 맥락 라이브러리 TanStack Query 훅 (2026-09-02)
//
// 목록은 **한 벌만** 캐시한다(`['docgen-contexts']`) — 맥락 관리 화면·스펙 검수·계획 검토
// 세 곳이 같은 목록을 보므로, 각자 읽으면 한 곳에서 고친 것이 다른 곳에 안 비친다.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createDocGenContext, deleteDocGenContext, type DocGenContext,
  linkContextToSpec, listDocGenContexts, listSpecContextIds,
  unlinkContextFromSpec, updateDocGenContext,
} from '../services/contextService';

const CONTEXTS_KEY = ['docgen-contexts'] as const;
const specLinkKey = (templateId: string | null) => ['docgen-context-spec-links', templateId] as const;

export function useDocGenContexts(enabled = true) {
  return useQuery({
    queryKey: CONTEXTS_KEY,
    queryFn: listDocGenContexts,
    enabled,
    staleTime: 30_000,
  });
}

/** 이 양식(스펙)에 연결된 맥락 id — 스펙 검수·계획 검토가 공유 */
export function useSpecContextIds(templateId: string | null) {
  return useQuery({
    queryKey: specLinkKey(templateId),
    queryFn: () => listSpecContextIds(templateId!),
    enabled: !!templateId,
    staleTime: 30_000,
  });
}

export function useCreateDocGenContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createDocGenContext,
    onSuccess: () => void qc.invalidateQueries({ queryKey: CONTEXTS_KEY }),
  });
}

export function useUpdateDocGenContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; patch: Partial<Pick<DocGenContext, 'title' | 'body' | 'hidden' | 'category'>> }) =>
      updateDocGenContext(v.id, v.patch),
    onSuccess: () => void qc.invalidateQueries({ queryKey: CONTEXTS_KEY }),
  });
}

export function useDeleteDocGenContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteDocGenContext,
    // 삭제는 링크도 CASCADE로 사라지므로 연결 목록까지 무효화한다
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CONTEXTS_KEY });
      void qc.invalidateQueries({ queryKey: ['docgen-context-spec-links'] });
    },
  });
}

export function useLinkContextToSpec() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { contextId: string; templateId: string; linked: boolean }) =>
      (v.linked
        ? linkContextToSpec(v.contextId, v.templateId)
        : unlinkContextFromSpec(v.contextId, v.templateId)),
    onSuccess: (_r, v) => {
      void qc.invalidateQueries({ queryKey: specLinkKey(v.templateId) });
      // 연결 상태가 "숨김 가능 여부"를 바꾸므로 목록도 다시 읽는다
      void qc.invalidateQueries({ queryKey: CONTEXTS_KEY });
    },
  });
}
