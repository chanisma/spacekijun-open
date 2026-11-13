// ========================================
// 앞 단계 산출물 → 스펙 문서 맥락 (2026-09-27, 업무 진행 화면)
//
// 업무 진행 화면이 **지금 할 일의 앞 단계 산출물**을 글로 옮겨 이 컨텍스트로 내려 준다.
// 스펙 러너(SpecFillActionRunner)는 컨텍스트가 있을 때만 그 글을 «앞 단계에서 넘어온 맥락»으로
// 이번 생성에 기본 포함한다(사용자가 뺄 수 있다). 다른 화면에서는 빈 배열이라 동작이 그대로다.
//
// prop 으로 내려보내지 않은 이유: 러너는 패널 → 다이얼로그 → 러너 세 겹 안에서 열린다.
// React 컨텍스트는 포털을 넘어 전달되므로 모달 안의 러너까지 그대로 닿는다.
// ⚠️ 러너의 맥락 **선택 상태와 섞지 않는다** — 라이브러리 다이얼로그가 선택을 다시 만들 때
//    라이브러리에 없는 id 가 조용히 빠질 수 있다. 앞 단계 맥락은 따로 두고 프롬프트에서만 합친다.
// ========================================

import { createContext, useContext, type ReactNode } from 'react';

export interface UpstreamContext {
  /** `upstream:` 으로 시작한다 — 라이브러리 맥락 id 와 겹치지 않게 */
  id: string;
  title: string;
  body: string;
}

export const UPSTREAM_CONTEXT_PREFIX = 'upstream:';

const UpstreamContextsContext = createContext<UpstreamContext[]>([]);

export function UpstreamContextsProvider({ value, children }: { value: UpstreamContext[]; children: ReactNode }) {
  return <UpstreamContextsContext.Provider value={value}>{children}</UpstreamContextsContext.Provider>;
}

export function useUpstreamContexts(): UpstreamContext[] {
  return useContext(UpstreamContextsContext);
}

export function isUpstreamContextId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(UPSTREAM_CONTEXT_PREFIX);
}
