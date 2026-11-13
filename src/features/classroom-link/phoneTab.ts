/**
 * 휴대폰의 교실 연결 화면 탭 정리 (2026-10-14 사용자 요청)
 *
 * QR 을 찍을 때마다 휴대폰 브라우저에 새 탭이 열리고(승인 /classroom/link · 비밀번호 /classroom/type), 할 일이 끝나도
 * 남아 탭이 금세 쌓였다. 그래서
 *   · 할 일이 끝난 화면은 잠시 뒤 스스로 닫는다(useAutoCloseTab).
 *   · 새 QR 화면이 열리면 같은 종류의 예전 화면이 스스로 닫는다(useSupersededTab — BroadcastChannel).
 * 브라우저는 스크립트가 연 탭이나 방문 기록이 하나뿐인 탭만 닫게 한다(QR 로 바로 열린 탭은 보통 된다). 로그인 화면을
 * 거쳐 들어왔으면 막힐 수 있다 — 그때는 «이 창은 닫아도 됩니다»를 보인다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const CHANNEL = 'spacekijun-classroom-phone';
/** 수업 연결(link) · 드라이브 다시 연결(drive) · 비밀번호(type) — 같은 종류끼리만 닫는다(드라이브 QR 이 수업 화면을 닫지 않게) */
export type PhoneTabKind = 'link' | 'drive' | 'type';

/** 이 탭을 닫아 본다 → 막혔으면 false(닫히면 페이지가 사라져 돌아오지 않는다) */
export function tryCloseTab(): Promise<boolean> {
  try {
    window.close();
  } catch {
    /* 막힘 */
  }
  return new Promise((resolve) => window.setTimeout(() => resolve(window.closed), 400));
}

/** when 이 참이 되면 delayMs 뒤 닫아 본다. failed = 브라우저가 막았다 */
export function useAutoCloseTab(when: boolean, delayMs = 3000) {
  const [failed, setFailed] = useState(false);
  const closeNow = useCallback(() => {
    void tryCloseTab().then((closed) => setFailed(!closed));
  }, []);
  useEffect(() => {
    if (!when) return;
    const timer = window.setTimeout(closeNow, delayMs);
    return () => window.clearTimeout(timer);
  }, [when, delayMs, closeNow]);
  return { closing: when && !failed, failed, closeNow };
}

/** 같은 종류의 새 화면이 열리면 이 화면을 닫는다 — canClose() 가 거짓이면(보내는 중 등) 둔다. kind 가 null 이면(아직 모름) 기다린다 */
export function useSupersededTab(kind: PhoneTabKind | null, canClose: () => boolean) {
  const can = useRef(canClose);
  can.current = canClose;
  useEffect(() => {
    if (!kind || typeof BroadcastChannel === 'undefined') return;
    const id = Math.random().toString(36).slice(2);
    const channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event: MessageEvent<{ kind?: string; id?: string }>) => {
      if (event.data?.kind === kind && event.data.id !== id && can.current()) void tryCloseTab();
    };
    channel.postMessage({ kind, id });
    return () => channel.close();
  }, [kind]);
}
