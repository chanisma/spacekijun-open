import { useState } from 'react';
import { MonitorSmartphone } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/components/auth/AuthProvider';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

/**
 * 개인기기(자동 로그인) **ON/OFF 알약 버튼** — 헤더와 모바일 시트가 함께 쓰는 단일 출처.
 *
 * 상태는 `AuthProvider`의 파생값 `isPersonalDevice`라 두 화면과 프로필 카드
 * (`PersonalDeviceCard`)가 별도 배선 없이 항상 같은 값을 보여준다. 다른 탭에서
 * 바꾼 값도 `storage` 이벤트로 따라온다.
 *
 * **켜고 끄기 전에 반드시 확인창을 거친다.** 이 설정은 "이 브라우저에 로그인을
 * 남겨 둔다"는 뜻이라, 공용 PC에서 무심코 켜면 다음 사람이 그대로 들어온다.
 * 헤더처럼 늘 보이는 자리에 두면 오클릭이 실제로 일어나므로, 버튼 자체는
 * 한 번에 눌리지 않게 했다.
 */
export function PersonalDeviceToggle({ className }: { className?: string }): JSX.Element {
  const { isPersonalDevice, setPersonalDeviceEnabled } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  // 확인창이 묻는 것은 언제나 "지금의 반대".
  const nextEnabled = !isPersonalDevice;

  const apply = async (event: React.MouseEvent): Promise<void> => {
    // AlertDialogAction의 기본 동작은 즉시 닫기다. 막지 않으면 저장이 실패해도
    // 창이 닫혀 사용자는 무엇이 안 됐는지 알 수 없다.
    event.preventDefault();
    setSaving(true);
    try {
      await setPersonalDeviceEnabled(nextEnabled);
      toast.success(nextEnabled
        ? '개인기기로 등록했습니다. 다음 방문에도 로그인이 유지됩니다.'
        : '개인기기 등록을 해제했습니다. 다음 새벽 5시부터 자동 로그아웃이 적용됩니다.');
      setConfirming(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '개인기기 설정을 변경하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-pressed={isPersonalDevice}
        title={isPersonalDevice
          ? '개인기기로 등록됨 — 이 브라우저에서 자동 로그인됩니다'
          : '개인기기 미등록 — 매일 새벽 5시에 자동 로그아웃됩니다'}
        className={cn(
          'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          isPersonalDevice
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100',
          className,
        )}
      >
        <MonitorSmartphone className="h-3.5 w-3.5 shrink-0" />
        <span className="text-xs font-medium">개인기기</span>
        <span
          className={cn(
            'rounded-full px-1.5 text-[10px] font-bold leading-4 tracking-wide',
            isPersonalDevice ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-700',
          )}
        >
          {isPersonalDevice ? 'ON' : 'OFF'}
        </span>
      </button>

      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          // 저장 중에는 닫히지 않게 한다 — 중간에 닫으면 결과를 못 본다.
          if (!saving) setConfirming(open);
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {nextEnabled ? '이 브라우저를 개인기기로 등록할까요?' : '개인기기 등록을 해제할까요?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {nextEnabled
                ? '등록하면 매일 새벽 5시 자동 로그아웃이 적용되지 않고, 브라우저를 다시 열 때 자동으로 로그인됩니다. 이 계정과 지금 쓰는 브라우저에만 적용됩니다.'
                : '해제하면 다음 새벽 5시부터 자동 로그아웃이 다시 적용됩니다. 지금 하던 작업은 그대로 이어서 할 수 있습니다.'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <p className={cn(
            'rounded-lg border px-3 py-2 text-xs leading-5',
            nextEnabled
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-slate-200 bg-slate-50 text-slate-600',
          )}>
            {nextEnabled
              ? '여러 사람이 함께 쓰는 공용 PC에서는 등록하지 마세요. 직접 로그아웃하면 등록도 함께 해제됩니다.'
              : '다시 켜고 싶으면 같은 버튼을 한 번 더 누르면 됩니다.'}
          </p>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={apply}
              disabled={saving}
              className={nextEnabled ? 'bg-emerald-600 hover:bg-emerald-700' : undefined}
            >
              {saving ? '변경 중…' : nextEnabled ? '개인기기로 등록' : '등록 해제'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
