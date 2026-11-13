import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export interface ExternalMenu {
  id: string;
  name: string;
  type: 'iframe' | 'link';
  meta: {
    url: string;
    mobileUrl?: string;
    iconUrl?: string;
    show: boolean;
    showStudent?: boolean;
    displayOrder?: number;
    /**
     * 사이드바 배치 위치 (교사 네비). 'external' | 'section:<id>' | 'group:<id>'.
     * 없으면 기본값 'external' = [외부 연결] 섹션의 외부 메뉴 서랍.
     * 키 목록·의미는 `src/config/navigation.ts`의 teacherNavPlacements 참고.
     */
    placement?: string;
    /** 학생 네비 배치 위치 (showStudent가 true일 때만 의미 있음) */
    studentPlacement?: string;
  } | null;
}

// Backward compatibility
export type IframeMenu = ExternalMenu;

export interface ExternalMenuInput {
  name: string;
  url: string;
  mobileUrl?: string;
  iconUrl?: string;
  show: boolean;
  showStudent?: boolean;
  type: 'iframe' | 'link';
  displayOrder?: number;
  placement?: string;
  studentPlacement?: string;
}

/**
 * 폼 값 → resource.meta.
 *
 * 생성/수정 모두 meta를 **통째로 교체**한다(빈 입력 = 해당 키 삭제 의도).
 * 따라서 새 필드를 추가할 때는 반드시 여기에 넣어야 하며, 그렇지 않으면
 * 메뉴를 한 번 수정하는 순간 그 필드가 조용히 사라진다.
 */
function buildMenuMeta(input: ExternalMenuInput): Record<string, Json> {
  const meta: Record<string, Json> = { url: input.url, show: input.show };
  if (input.mobileUrl) meta.mobileUrl = input.mobileUrl;
  if (input.iconUrl) meta.iconUrl = input.iconUrl;
  if (input.displayOrder !== undefined) meta.displayOrder = input.displayOrder;
  if (input.showStudent !== undefined) meta.showStudent = input.showStudent;
  if (input.placement) meta.placement = input.placement;
  if (input.studentPlacement) meta.studentPlacement = input.studentPlacement;
  return meta;
}

// Iframe 메뉴 목록 조회
export function useIframeMenus() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['external-menus'],
    queryFn: async (): Promise<ExternalMenu[]> => {
      const { data, error } = await supabase
        .from('resource')
        .select('id, name, type, meta')
        .in('type', ['iframe', 'link'])
        .order('name');

      if (error) {
        console.error('Error fetching external menus:', error);
        throw error;
      }

      return (data as any) || [];
    },
  });

  // 외부 메뉴 생성
  const createIframeMenu = useMutation({
    mutationFn: async (input: ExternalMenuInput) => {
      const { name, type } = input;
      const meta = buildMenuMeta(input);

      const { data, error } = await supabase
        .from('resource')
        .insert({
          name,
          type,
          meta,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating external menu:', error);
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-menus'] });
      queryClient.invalidateQueries({ queryKey: ['visible-iframe-menus'] });
    },
  });

  // 외부 메뉴 수정
  const updateIframeMenu = useMutation({
    mutationFn: async (input: ExternalMenuInput & { id: string }) => {
      const { id, name, type } = input;
      const meta = buildMenuMeta(input);

      const { data, error } = await supabase
        .from('resource')
        .update({
          name,
          type,
          meta,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating external menu:', error);
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-menus'] });
      queryClient.invalidateQueries({ queryKey: ['visible-iframe-menus'] });
    },
  });

  // 외부 메뉴 삭제
  const deleteIframeMenu = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('resource')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting external menu:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-menus'] });
      queryClient.invalidateQueries({ queryKey: ['visible-iframe-menus'] });
    },
  });

  // Iframe 메뉴 표시/숨김 토글
  const toggleIframeMenuShow = useMutation({
    mutationFn: async ({ id, show }: { id: string; show: boolean }) => {
      // 현재 meta 정보를 먼저 가져옴
      const { data: currentData, error: fetchError } = await supabase
        .from('resource')
        .select('meta')
        .eq('id', id)
        .single();

      if (fetchError) {
        console.error('Error fetching current meta:', fetchError);
        throw fetchError;
      }

      const currentMeta = (currentData as any).meta || {};
      const updatedMeta = { ...currentMeta, show };

      const { data, error } = await supabase
        .from('resource')
        .update({ meta: updatedMeta })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error toggling iframe menu show:', error);
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-menus'] });
      queryClient.invalidateQueries({ queryKey: ['visible-iframe-menus'] });
    },
  });

  // 표시 순서만 변경 (meta 병합)
  //
  // 순서 조정은 폼 전체를 보는 편집이 아니므로 meta를 통째로 교체하면 안 된다.
  // (구 구현은 화살표 버튼에서 updateIframeMenu를 호출해 폼에 없는 meta 키를 지울 수 있었다.)
  const updateIframeMenuOrder = useMutation({
    mutationFn: async ({ id, displayOrder }: { id: string; displayOrder: number }) => {
      const { data: currentData, error: fetchError } = await supabase
        .from('resource')
        .select('meta')
        .eq('id', id)
        .single();

      if (fetchError) {
        console.error('Error fetching current meta:', fetchError);
        throw fetchError;
      }

      const currentMeta = (currentData?.meta || {}) as Record<string, Json>;

      const { data, error } = await supabase
        .from('resource')
        .update({ meta: { ...currentMeta, displayOrder } })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating external menu order:', error);
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-menus'] });
      queryClient.invalidateQueries({ queryKey: ['visible-iframe-menus'] });
    },
  });

  return {
    data,
    loading: isLoading,
    createIframeMenu,
    updateIframeMenu,
    updateIframeMenuOrder,
    deleteIframeMenu,
    toggleIframeMenuShow,
  };
}

// 표시할 외부 메뉴만 조회 (사이드바용)
export function useVisibleIframeMenus() {
  const { data, isLoading } = useQuery({
    queryKey: ['visible-iframe-menus'],
    queryFn: async (): Promise<ExternalMenu[]> => {
      const { data, error } = await supabase
        .from('resource')
        .select('id, name, type, meta')
        .in('type', ['iframe', 'link'])
        .order('name');

      if (error) {
        console.error('Error fetching visible external menus:', error);
        throw error;
      }

      // meta.show가 true인 것만 필터링하고 displayOrder로 정렬
      return ((data as any) || [])
        .filter((item: any) => item.meta?.show === true)
        .sort((a: any, b: any) => (b.meta?.displayOrder ?? 0) - (a.meta?.displayOrder ?? 0));
    },
    // 캐싱 최적화 - iframe 메뉴는 자주 변경되지 않으므로 캐시 시간 증가
    staleTime: 10 * 60 * 1000, // 10분
    gcTime: 15 * 60 * 1000,    // 15분
    // 에러시 빈 배열 반환으로 네비게이션 중단 방지
    retry: 1,
    retryDelay: 1000,
  });

  return {
    data: data || [],
    loading: isLoading,
  };
}