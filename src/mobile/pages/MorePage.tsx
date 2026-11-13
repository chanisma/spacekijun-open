import { useState } from 'react';
import { Bell, BellOff, LogOut, Monitor, Share, Smartphone } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  getBrowserNotificationPermission, isBrowserNotificationEnabled, requestBrowserNotificationPermission,
  setBrowserNotificationEnabled,
} from '@/lib/browserNotifications';
import { PUSH_DAILY_LIMIT, getWebPushSupport, isIosDevice, subscribeWebPush, unsubscribeWebPush } from '@/lib/webPush';
import { toast } from '@/lib/toast';
import { openFullView } from '../MobileGate';

/** 설정 — 휴대폰 알림(웹 푸시) 켜고 끄기 · 전체 웹사이트로 보기 · 로그아웃 */
export default function MorePage() {
  const { profile, user, signOut } = useAuth();
  const support = getWebPushSupport();
  const [on, setOn] = useState(() => getBrowserNotificationPermission() === 'granted' && isBrowserNotificationEnabled());
  const [busy, setBusy] = useState(false);

  const turnOn = async () => {
    setBusy(true);
    try {
      const permission = await requestBrowserNotificationPermission();
      if (permission !== 'granted') throw new Error('알림 권한을 허용해야 받을 수 있어요. 브라우저 설정에서 허용해 주세요.');
      setBrowserNotificationEnabled(true);
      await subscribeWebPush();
      setOn(true);
      toast.success('이 휴대폰으로 쪽지·알림이 옵니다');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async () => {
    setBusy(true);
    setBrowserNotificationEnabled(false);
    await unsubscribeWebPush().catch(() => undefined);
    setOn(false);
    setBusy(false);
    toast.success('휴대폰 알림을 껐습니다');
  };

  return (
    <div className="space-y-3">
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">{profile?.name ?? ''}</div>
        <div className="text-xs text-slate-500">{user?.email}</div>
      </section>

      <section className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          {on ? <Bell className="h-5 w-5 text-blue-600" /> : <BellOff className="h-5 w-5 text-slate-400" />}
          <span className="flex-1 text-sm font-semibold">휴대폰 알림</span>
          {support.supported && (
            <button disabled={busy} onClick={() => void (on ? turnOff() : turnOn())}
                    className={on ? 'rounded-full border px-3 py-1.5 text-xs' : 'rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white'}>
              {on ? '끄기' : '켜기'}
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500">
          {support.supported
            ? `새 쪽지·알림을 앱을 닫아 두어도 받습니다 (하루 ${PUSH_DAILY_LIMIT}건까지, 밤 10시~아침 7시는 보내지 않음).`
            : support.message}
        </p>
        {support.needsIosInstall && (
          <p className="flex items-start gap-1.5 rounded-xl bg-slate-50 p-2.5 text-xs text-slate-600">
            <Share className="mt-0.5 h-3.5 w-3.5 shrink-0" />사파리 아래 <b>공유</b> → <b>홈 화면에 추가</b> 로 설치한 뒤, 홈 화면의 스페이스기전에서 켜 주세요.
          </p>
        )}
      </section>

      {!isIosDevice() && (
        <section className="flex items-start gap-2 rounded-2xl bg-white p-4 text-xs text-slate-600 shadow-sm">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          브라우저 메뉴의 <b>홈 화면에 추가</b>(또는 <b>앱 설치</b>)를 누르면 앱처럼 바로 열 수 있어요.
        </section>
      )}

      <button onClick={() => openFullView('/')} className="flex w-full items-center gap-2 rounded-2xl bg-white p-4 text-left text-sm shadow-sm">
        <Monitor className="h-5 w-5 text-slate-500" />
        <span className="flex-1"><b>전체 웹사이트로 보기</b><br /><span className="text-xs text-slate-500">스페이스기전 웹사이트의 모든 메뉴를 이 탭에서 엽니다. 웹사이트 메뉴의 «모바일 화면» 또는 앱을 다시 열면 모바일로 돌아옵니다.</span></span>
      </button>
      <button onClick={() => void signOut()} className="flex w-full items-center gap-2 rounded-2xl bg-white p-4 text-left text-sm text-rose-600 shadow-sm">
        <LogOut className="h-5 w-5" />로그아웃
      </button>
    </div>
  );
}
