import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase as supabaseClient } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useCurrentResourceId } from '@/hooks/useCurrentResourceId';
import { useRequesterResourceId } from './useRequesterResourceId';
import {
  CreatePurchaseRequestPageInput,
  PurchaseRequestPage,
  PurchaseRequestPageWithRelations,
  UpdatePurchaseRequestPageInput,
} from '../types';

// 새 테이블이 아직 supabase types.ts에 반영되지 않아 from() 호출 시 타입 오버로드 매칭이 실패함.
// 안전한 도메인 타입은 ../types에서 별도 관리하므로 supabase 클라이언트 자체만 느슨하게 캐스팅.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = supabaseClient as any;

const PAGES_KEY = ['purchase-request-pages'] as const;

// 모든 페이지 목록 (게시판)
export function usePurchaseRequestPages(includeArchived = false) {
  const { user } = useAuth();
  // 학생이 본인 신청 여부를 알기 위해 requester 리졸버 사용 (학생도 잡힘)
  const { data: resourceId } = useRequesterResourceId();

  return useQuery({
    queryKey: [...PAGES_KEY, { includeArchived, resourceId }],
    queryFn: async (): Promise<PurchaseRequestPageWithRelations[]> => {
      if (!user?.id) return [];

      let query = supabase
        .from('purchase_request_pages')
        .select(`
          *,
          creator:created_by(id, name),
          collaborators:purchase_request_collaborators(
            id,
            resource_id,
            resource:resource_id(id, name)
          ),
          requests:purchase_requests(id, requester_id)
        `)
        .order('created_at', { ascending: false });

      if (!includeArchived) {
        query = query.eq('is_archived', false);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map((row: any) => ({
        ...row,
        request_count: row.requests?.length || 0,
        my_request_ids:
          resourceId && row.requests
            ? row.requests
                .filter((r: any) => r.requester_id === resourceId)
                .map((r: any) => r.id as string)
            : [],
      })) as PurchaseRequestPageWithRelations[];
    },
    enabled: !!user?.id,
  });
}

// 단일 페이지
export function usePurchaseRequestPage(pageId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: [...PAGES_KEY, pageId],
    queryFn: async (): Promise<PurchaseRequestPageWithRelations | null> => {
      if (!pageId) return null;

      const { data, error } = await supabase
        .from('purchase_request_pages')
        .select(`
          *,
          creator:created_by(id, name),
          collaborators:purchase_request_collaborators(
            id,
            resource_id,
            resource:resource_id(id, name)
          )
        `)
        .eq('id', pageId)
        .single();

      if (error) throw error;
      return data as PurchaseRequestPageWithRelations;
    },
    enabled: !!user?.id && !!pageId,
  });
}

// 페이지 생성
export function useCreatePurchaseRequestPage() {
  const queryClient = useQueryClient();
  const { data: resourceId } = useCurrentResourceId();

  return useMutation({
    mutationFn: async (input: CreatePurchaseRequestPageInput): Promise<PurchaseRequestPage> => {
      if (!resourceId) throw new Error('현재 사용자의 resource_id를 찾을 수 없습니다.');

      const { data: page, error: pageError } = await supabase
        .from('purchase_request_pages')
        .insert({
          title: input.title,
          target_roles: input.target_roles,
          description: input.description || null,
          period_start: input.period_start,
          period_end: input.period_end,
          columns: input.columns as unknown as any,
          created_by: resourceId,
        })
        .select()
        .single();

      if (pageError) throw pageError;

      if (input.collaborator_resource_ids && input.collaborator_resource_ids.length > 0) {
        const uniqueIds = Array.from(new Set(input.collaborator_resource_ids)).filter(
          (id) => id !== resourceId,
        );
        if (uniqueIds.length > 0) {
          const { error: collabError } = await supabase
            .from('purchase_request_collaborators')
            .insert(uniqueIds.map((rid) => ({ page_id: page.id, resource_id: rid })));
          if (collabError) throw collabError;
        }
      }

      return page as PurchaseRequestPage;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PAGES_KEY });
    },
  });
}

// 페이지 수정
export function useUpdatePurchaseRequestPage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pageId,
      input,
    }: {
      pageId: string;
      input: UpdatePurchaseRequestPageInput;
    }) => {
      const updateData: Record<string, unknown> = {};
      if (input.title !== undefined) updateData.title = input.title;
      if (input.target_roles !== undefined) updateData.target_roles = input.target_roles;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.period_start !== undefined) updateData.period_start = input.period_start;
      if (input.period_end !== undefined) updateData.period_end = input.period_end;
      if (input.columns !== undefined) updateData.columns = input.columns;
      if (input.is_archived !== undefined) {
        updateData.is_archived = input.is_archived;
        updateData.archived_at = input.is_archived ? new Date().toISOString() : null;
      }

      if (Object.keys(updateData).length > 0) {
        const { error } = await supabase
          .from('purchase_request_pages')
          .update(updateData)
          .eq('id', pageId);
        if (error) throw error;
      }

      // 공동 작업자 동기화
      if (input.collaborator_resource_ids !== undefined) {
        const desiredIds = Array.from(new Set(input.collaborator_resource_ids));

        // 기존 collaborators 조회
        const { data: existing, error: fetchError } = await supabase
          .from('purchase_request_collaborators')
          .select('id, resource_id')
          .eq('page_id', pageId);
        if (fetchError) throw fetchError;

        const existingMap = new Map((existing || []).map((c: any) => [c.resource_id, c.id]));
        const existingIds = new Set(existingMap.keys());

        const toAdd = desiredIds.filter((id) => !existingIds.has(id));
        const toRemove = Array.from(existingIds).filter(
          (id) => !desiredIds.includes(id as string),
        );

        if (toAdd.length > 0) {
          const { error: addError } = await supabase
            .from('purchase_request_collaborators')
            .insert(toAdd.map((rid) => ({ page_id: pageId, resource_id: rid })));
          if (addError) throw addError;
        }

        if (toRemove.length > 0) {
          const idsToDelete = toRemove.map((rid) => existingMap.get(rid as string)).filter(Boolean) as string[];
          if (idsToDelete.length > 0) {
            const { error: delError } = await supabase
              .from('purchase_request_collaborators')
              .delete()
              .in('id', idsToDelete);
            if (delError) throw delError;
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PAGES_KEY });
    },
  });
}

// 페이지 삭제
export function useDeletePurchaseRequestPage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pageId: string) => {
      const { error } = await supabase
        .from('purchase_request_pages')
        .delete()
        .eq('id', pageId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PAGES_KEY });
    },
  });
}
