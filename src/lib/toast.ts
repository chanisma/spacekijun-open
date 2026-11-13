/**
 * 앱 전체 토스트의 **단일 출처**. 새 코드는 `sonner` 를 직접 import 하지 말 것.
 *
 *     import { toast } from '@/lib/toast';
 *     toast.success('저장했습니다');
 *     toast.error('저장하지 못했습니다');
 *
 * ## 왜 얇은 래퍼가 하나 더 필요한가
 * 종전엔 토스트 시스템이 **두 벌**이었다 — Radix(`@/hooks/use-toast`, 호출 940건)와
 * sonner(호출 506건)가 `App.tsx` 에 **동시에 마운트**돼 있어, 같은 앱에서 어느 파일이
 * 어디서 import 했느냐에 따라 모양·크기·개수 제한이 달랐다. 지금은 sonner 한 벌이고
 * 구 API 는 `@/hooks/use-toast` 어댑터로 이 모듈에 얹힌다.
 *
 * 그 위에 이 래퍼를 두는 이유는 **지속 시간이 tone 마다 달라야** 하기 때문이다.
 * sonner 의 `<Toaster toastOptions>` 는 타입별 duration 을 받지 않으므로, 전역 기본값
 * 하나를 쓰면 8초짜리 오류 문장과 "저장했습니다" 가 같은 시간 동안 머문다.
 * 여기를 거치면 호출부를 고치지 않고 tone 별 기본값이 붙는다(호출부가 `duration` 을
 * 직접 주면 그쪽이 이긴다).
 *
 * 위치·닫기 버튼·색은 `src/components/ui/sonner.tsx` 가 정한다.
 * 색 유추·문구 정리 규칙은 `src/lib/toastMessage.ts` 가 정한다.
 */
import { toast as sonnerToast, type ExternalToast } from 'sonner';

import { TOAST_DURATION_MS, type ToastTone } from './toastMessage';

type Message = Parameters<typeof sonnerToast>[0];

/** 호출부가 준 옵션이 tone 기본값을 이긴다. */
const withTone = (tone: ToastTone, data?: ExternalToast): ExternalToast => ({
  duration: TOAST_DURATION_MS[tone],
  ...data,
});

const base = (message: Message, data?: ExternalToast) => sonnerToast(message, withTone('neutral', data));

export const toast = Object.assign(base, {
  success: (message: Message, data?: ExternalToast) => sonnerToast.success(message, withTone('success', data)),
  error: (message: Message, data?: ExternalToast) => sonnerToast.error(message, withTone('error', data)),
  warning: (message: Message, data?: ExternalToast) => sonnerToast.warning(message, withTone('warning', data)),
  info: (message: Message, data?: ExternalToast) => sonnerToast.info(message, withTone('info', data)),
  message: (message: Message, data?: ExternalToast) => sonnerToast.message(message, withTone('neutral', data)),
  /** 로딩은 스스로 사라지면 안 된다 — 끝났을 때 호출부가 dismiss 하거나 갈아끼운다. */
  loading: (message: Message, data?: ExternalToast) => sonnerToast.loading(message, { duration: Infinity, ...data }),
  custom: (...args: Parameters<typeof sonnerToast.custom>) => sonnerToast.custom(...args),
  promise: (<T,>(...args: Parameters<typeof sonnerToast.promise<T>>) => sonnerToast.promise<T>(...args)),
  dismiss: (id?: number | string) => sonnerToast.dismiss(id),
});

export { TOAST_DURATION_MS, type ToastTone } from './toastMessage';
