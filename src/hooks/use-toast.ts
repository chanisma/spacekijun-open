/**
 * 구 shadcn `toast({ title, description, variant })` API 를 **sonner 위에 얹은 어댑터**.
 *
 * 종전엔 여기에 Radix 토스트용 자체 store(reducer + listener 배열)가 들어 있었고,
 * 그 store 가 `App.tsx` 의 `<Toaster />` 를 통해 sonner 와 **나란히** 렌더됐다.
 * 두 시스템이 동시에 살아 있었기 때문에 같은 앱에서 토스트 모양이 두 가지였다.
 * 이제 표시는 sonner 하나가 맡고, 이 파일은 호출 형태만 변환한다.
 *
 * **호출부는 한 줄도 고치지 않았다.** 실측으로 이 API 의 실사용 표면이 아주 좁았기
 * 때문이다 — 반환값(`.dismiss()`/`.update()`/`.id`) 사용 0건, `action:` 0건,
 * `duration:` 0건, title/description 에 JSX 0건, variant 는 `destructive`/`default` 뿐,
 * `useToast()` 는 항상 `const { toast } = useToast()` 형태.
 * 그래서 940개 호출을 손대지 않고도 시스템을 갈아끼울 수 있었다.
 *
 * 새 코드는 이 API 대신 `import { toast } from '@/lib/toast'` 를 쓸 것.
 * (`toast.success('저장했습니다')` — 제목/설명 두 칸을 채우지 않아도 된다)
 */
import * as React from 'react';

import { toast as appToast } from '@/lib/toast';
import { resolveLegacyToast } from '@/lib/toastMessage';

export interface LegacyToastOptions {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: 'default' | 'destructive' | null;
  duration?: number;
}

export interface LegacyToastHandle {
  id: string | number;
  dismiss: () => void;
  /** 구 API 호환용. 실사용 0건이라 새 토스트를 띄우는 것으로 갈음한다. */
  update: (next: LegacyToastOptions) => void;
}

function toast(options: LegacyToastOptions = {}): LegacyToastHandle {
  const { tone, message, description } = resolveLegacyToast(options);
  const data = {
    description,
    ...(options.duration != null ? { duration: options.duration } : {}),
  };

  const id =
    tone === 'error'
      ? appToast.error(message, data)
      : tone === 'success'
        ? appToast.success(message, data)
        : tone === 'warning'
          ? appToast.warning(message, data)
          : tone === 'info'
            ? appToast.info(message, data)
            : appToast(message, data);

  return {
    id,
    dismiss: () => appToast.dismiss(id),
    update: (next) => {
      appToast.dismiss(id);
      toast(next);
    },
  };
}

/**
 * 훅 형태를 유지한다(호출부 167곳이 `const { toast } = useToast()`).
 * sonner 가 자체 store 를 갖고 있으므로 여기엔 구독할 상태가 없다.
 */
function useToast() {
  return React.useMemo(
    () => ({
      toast,
      dismiss: (toastId?: string | number) => appToast.dismiss(toastId),
    }),
    [],
  );
}

export { useToast, toast };
