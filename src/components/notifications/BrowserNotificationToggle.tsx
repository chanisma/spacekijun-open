import React from 'react';
import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useBrowserNotificationSettings } from '@/hooks/useBrowserNotifications';

/**
 * 브라우저(OS) 알림 켜기/끄기.
 *
 * **버튼 하나로 네 가지 상태를 말한다** — 지원 안 됨 / 아직 안 물어봄 / 차단됨 / 켜짐.
 * 그리고 어느 상태에서도 **누를 수 있게** 둔다: 비활성 버튼은 "왜 안 되는지"를 말할
 * 방법이 없고, 모바일에는 hover 툴팁도 없어서 사용자가 막힌 이유를 영영 알 수 없다.
 * 눌렀을 때 할 수 있는 일이 없으면 대신 **무엇을 하면 되는지**를 토스트로 알려 준다.
 *
 * 권한이 `denied` 로 굳으면 앱에서는 되돌릴 수 없다(브라우저가 재요청을 무시한다) —
 * 그래서 그 경우만 사이트 설정을 직접 바꾸라고 안내한다.
 */
export const BrowserNotificationToggle = () => {
  const { toast } = useToast();
  const { support, permission, enabled, active, requesting, enable, disable } =
    useBrowserNotificationSettings();

  const handleClick = () => {
    if (!support.supported) {
      toast({ title: '브라우저 알림을 쓸 수 없습니다', description: support.message });
      return;
    }

    if (permission === 'denied') {
      toast({
        title: '브라우저가 알림을 차단하고 있습니다',
        description:
          '주소창 왼쪽 자물쇠 아이콘 → 알림 → 허용으로 바꾼 뒤 새로고침해 주세요. 이 설정은 앱에서 되돌릴 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    if (active) {
      disable();
      toast({
        title: '브라우저 알림을 껐습니다',
        description: '앱 안에서는 종전대로 알림을 확인할 수 있습니다.',
      });
      return;
    }

    void enable();
  };

  const { icon, label } = (() => {
    if (requesting) {
      return { icon: <Loader2 className="h-3 w-3 animate-spin sm:h-3.5 sm:w-3.5" />, label: '요청 중' };
    }
    if (!support.supported || permission === 'denied') {
      return { icon: <BellOff className="h-3 w-3 sm:h-3.5 sm:w-3.5" />, label: '알림 불가' };
    }
    if (active) {
      return { icon: <BellRing className="h-3 w-3 sm:h-3.5 sm:w-3.5" />, label: '알림 켜짐' };
    }
    // 권한은 있는데 사용자가 꺼 둔 경우와, 아직 물어보지 않은 경우를 구분해 말한다.
    return {
      icon: <Bell className="h-3 w-3 sm:h-3.5 sm:w-3.5" />,
      label: enabled ? '브라우저 알림' : '알림 꺼짐',
    };
  })();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={requesting}
      title={
        active
          ? '앱을 보고 있지 않을 때·닫았을 때도 새 알림을 알려 줍니다. 눌러서 끄기'
          : '앱을 닫아도 새 알림을 받으려면 켜 주세요'
      }
      className={`h-7 px-2 sm:px-3 flex items-center gap-1.5 text-xs sm:text-sm ${
        active
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800'
          : 'bg-white hover:bg-gray-50'
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
};
