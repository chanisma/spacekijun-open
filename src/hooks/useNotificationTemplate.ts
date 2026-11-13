import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';

/**
 * `system_settings` 에 저장되는 편집 가능한 알림 템플릿.
 *
 * 현재는 환영 알림(`welcome_notification`) 하나뿐이다. 알림 관리 화면의 카탈로그 카드가
 * 이 값을 읽어 실제 전송 문구를 보여주고, 같은 자리에서 편집한다.
 * (2026-07-28 이전에는 시스템 설정의 별도 카드에서만 편집할 수 있었다.)
 *
 * 발송 시 실제 소비자는 `notificationService.getWelcomeNotificationConfig()` 이며,
 * 행이 없으면 코드에 하드코딩된 기본값으로 폴백한다.
 */
export interface NotificationTemplate {
  title: string;
  message: string;
}

/** 편집 가능한 알림 템플릿의 setting_key. 카탈로그 항목의 settingKey 와 일치해야 한다. */
export type NotificationTemplateKey = 'welcome_notification';

export function useNotificationTemplate(settingKey: NotificationTemplateKey | undefined) {
  return useQuery<NotificationTemplate | null>({
    queryKey: ['notification-template', settingKey],
    queryFn: async () => {
      if (!settingKey) return null;

      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', settingKey)
        .maybeSingle();

      if (error) {
        console.error('알림 템플릿 조회 오류:', error);
        return null;
      }

      const value = data?.setting_value as Partial<NotificationTemplate> | null;
      if (!value || typeof value !== 'object') return null;
      if (typeof value.title !== 'string' || typeof value.message !== 'string') return null;

      return { title: value.title, message: value.message };
    },
    enabled: !!settingKey,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveNotificationTemplate(settingKey: NotificationTemplateKey) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (template: NotificationTemplate) => {
      if (!user) throw new Error('로그인이 필요합니다.');

      const title = template.title.trim();
      const message = template.message.trim();
      if (!title) throw new Error('알림 제목을 입력하세요.');
      if (!message) throw new Error('알림 메시지를 입력하세요.');

      const setting_value = { title, message };

      // 행이 없을 수도 있어 존재 확인 후 update/insert 로 분기한다.
      // (setting_key 에 유니크 제약이 없어 upsert 로 처리할 수 없다.)
      const { data: existing, error: findError } = await supabase
        .from('system_settings')
        .select('id')
        .eq('setting_key', settingKey)
        .maybeSingle();
      if (findError) throw findError;

      if (existing) {
        const { data, error } = await supabase
          .from('system_settings')
          .update({ setting_value, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select('id');
        if (error) throw error;
        // RLS 가 막으면 오류가 아니라 0행이 온다 — '저장됨'으로 오인하지 않도록 확인.
        if (!data || data.length === 0) {
          throw new Error('저장 권한이 없습니다. (관리자만 수정할 수 있습니다)');
        }
      } else {
        const { data, error } = await supabase
          .from('system_settings')
          .insert([
            {
              setting_key: settingKey,
              setting_value,
              description: '사용자 연결 완료 시 발송되는 환영 알림 메시지',
              created_by: user.id,
            },
          ])
          .select('id');
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error('저장 권한이 없습니다. (관리자만 수정할 수 있습니다)');
        }
      }

      return setting_value;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-template', settingKey] });
    },
  });
}
