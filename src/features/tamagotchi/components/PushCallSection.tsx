/**
 * «앱을 닫아도 펫이 불러요» — 도움말 대화상자 안의 켜기 칸(2026-10-07 Phase 4).
 *
 * 앱 전체의 브라우저 알림 설정과 **같은 스위치**다(따로 두면 «여기선 켰는데 알림 페이지엔 꺼짐»이 된다).
 * 켜면 권한을 묻고 Web Push 구독을 서버에 맡긴다(`useBrowserNotificationSettings`). iPhone 은 홈 화면에 추가한
 * 앱에서만 되므로 그 방법을 단계로 보여 준다 — «지원 안 함»으로 끝내지 않는다.
 */
import { BellRing, Share, SquarePlus } from 'lucide-react';
import { useBrowserNotificationSettings } from '@/hooks/useBrowserNotifications';
import { getWebPushSupport, PUSH_PET_CALL_DAILY_LIMIT, PUSH_QUIET_HOURS } from '@/lib/webPush';
import { cn } from '@/lib/utils';

export function PushCallSection({ classic }: { classic: boolean }) {
  const { support, permission, active, requesting, enable, disable } = useBrowserNotificationSettings();
  const push = getWebPushSupport();
  const rule = `하루 ${PUSH_PET_CALL_DAILY_LIMIT}번까지 · 밤 ${PUSH_QUIET_HOURS.from - 12}시~아침 ${PUSH_QUIET_HOURS.to}시는 조용히`;
  const box = cn('mt-3 rounded-2xl px-3 py-2.5 text-[12px] leading-5', classic ? 'bg-white/10' : 'bg-white/45');

  if (push.needsIosInstall) {
    return (
      <div className={box} data-tama-push="ios">
        <b>앱을 닫아도 펫이 부르게 하려면</b>
        <ol className="mt-1 space-y-1">
          <li className="flex items-center gap-1.5">1. Safari 아래쪽 <Share className="h-3.5 w-3.5" aria-label="공유" /> 공유 버튼</li>
          <li className="flex items-center gap-1.5">2. <SquarePlus className="h-3.5 w-3.5" aria-hidden="true" /> «홈 화면에 추가»</li>
          <li>3. 홈 화면의 SPACEKIJUN 에서 여기를 다시 열고 켜기</li>
        </ol>
      </div>
    );
  }

  if (!support.supported || !push.supported) {
    return <p className={box} data-tama-push="unsupported">{push.message ?? support.message}</p>;
  }

  if (permission === 'denied') {
    return (
      <p className={box} data-tama-push="denied">
        브라우저가 알림을 막고 있어요. 주소창 왼쪽 자물쇠 → 알림 → 허용으로 바꾼 뒤 새로고침해 주세요.
      </p>
    );
  }

  return (
    <div className={cn(box, 'flex items-center justify-between gap-3')} data-tama-push={active ? 'on' : 'off'}>
      <span className="min-w-0">
        <b className="flex items-center gap-1"><BellRing className="h-3.5 w-3.5" aria-hidden="true" />앱을 닫아도 펫이 불러요</b>
        <span className="block opacity-75">{active ? rule : '배고프거나 아플 때 휴대폰으로 알려요. 학교 알림도 함께 와요.'}</span>
      </span>
      <button type="button" disabled={requesting} onClick={() => (active ? disable() : void enable())}
        className={cn('h-11 shrink-0 rounded-full px-4 font-bold',
          active ? 'bg-white/50 text-violet-900' : 'bg-violet-600 text-white', requesting && 'opacity-60')}>
        {requesting ? '묻는 중' : active ? '끄기' : '켜기'}
      </button>
    </div>
  );
}
