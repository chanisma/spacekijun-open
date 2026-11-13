import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface ResourceTag {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_bulk_option: boolean;
  sort_order: number;
}

interface ResourceTagAssignment {
  id: string;
  resource_id: string;
  tag_id: string;
  tag?: ResourceTag;
}

/**
 * 모든 리소스 태그를 가져오는 훅
 */
export function useResourceTags(enabled = true) {
  return useQuery({
    queryKey: ["resource-tags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resource_tags")
        .select("*")
        .order("sort_order");

      if (error) throw error;
      return (data || []) as ResourceTag[];
    },
    enabled,
  });
}

/**
 * 일괄 선택 옵션으로 설정된 태그만 가져오는 훅
 */
export function useBulkOptionTags() {
  return useQuery({
    queryKey: ["resource-tags", "bulk-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resource_tags")
        .select("*")
        .eq("is_bulk_option", true)
        .order("sort_order");

      if (error) throw error;
      return (data || []) as ResourceTag[];
    },
  });
}

/**
 * 리소스의 태그 할당 정보를 가져오는 훅
 */
export function useResourceTagAssignments(resourceIds?: string[]) {
  return useQuery({
    queryKey: ["resource-tag-assignments", resourceIds],
    queryFn: async () => {
      let query = supabase
        .from("resource_tag_assignments")
        .select(`
          id,
          resource_id,
          tag_id,
          tag:resource_tags(*)
        `);

      if (resourceIds && resourceIds.length > 0) {
        query = query.in("resource_id", resourceIds);
      }

      const { data, error } = await query;

      if (error) throw error;

      // 리소스 ID별로 태그를 그룹화
      const groupedByResource = new Map<string, ResourceTag[]>();
      (data || []).forEach((assignment) => {
        const resourceId = assignment.resource_id;
        if (!groupedByResource.has(resourceId)) {
          groupedByResource.set(resourceId, []);
        }
        if (assignment.tag) {
          groupedByResource.get(resourceId)!.push(assignment.tag);
        }
      });

      return groupedByResource;
    },
    enabled: resourceIds === undefined || resourceIds.length > 0,
  });
}

/**
 * 특정 태그가 할당된 리소스 ID 목록을 가져오는 훅
 */
export function useResourcesByTag(tagId?: string) {
  return useQuery({
    queryKey: ["resources-by-tag", tagId],
    queryFn: async () => {
      if (!tagId) return [];

      const { data, error } = await supabase
        .from("resource_tag_assignments")
        .select("resource_id")
        .eq("tag_id", tagId);

      if (error) throw error;
      return (data || []).map((d) => d.resource_id);
    },
    enabled: !!tagId,
  });
}

/**
 * 리소스에 태그를 할당/해제하는 mutation 훅
 */
export function useUpdateResourceTags() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      resourceId,
      tagIds,
    }: {
      resourceId: string;
      tagIds: string[];
    }) => {
      // 기존 할당 삭제
      const { error: deleteError } = await supabase
        .from("resource_tag_assignments")
        .delete()
        .eq("resource_id", resourceId);

      if (deleteError) throw deleteError;

      // 새 할당 추가
      if (tagIds.length > 0) {
        const assignments = tagIds.map((tagId) => ({
          resource_id: resourceId,
          tag_id: tagId,
        }));

        const { error: insertError } = await supabase
          .from("resource_tag_assignments")
          .insert(assignments);

        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resource-tag-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["resources-by-tag"] });
    },
    onError: (error) => {
      console.error("태그 업데이트 오류:", error);
      toast({
        title: "오류",
        description: "태그 업데이트에 실패했습니다.",
        variant: "destructive",
      });
    },
  });
}
