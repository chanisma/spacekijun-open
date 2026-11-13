// ========================================
// 작업 창의 «저장하지 않은 변경» 가드 (2026-10-06 — 작업 UI 검토: 입력 받기·메시지 보내기·제출 받기 공통)
//
// 설정 화면들은 초안을 자기 상태에만 들고 있어, 창을 닫으면(✕·Esc·휴대폰 뒤로가기) 확인 없이 사라졌다.
// 화면마다 닫기를 가로채면 창(TaskActionRunnerDialog)이 화면 수만큼 분기를 갖게 된다 → 화면은 «바꾼 것이
// 있다»만 알리고, 닫기 판정은 창 하나가 한다. 뒤로가기도 같은 판정을 탄다(onOpenChange(false) 를 거부하면
// 모달이 남는다 — CLAUDE.md §2-2).
// ========================================

import { createContext, useContext, useEffect, useId, useRef, type ReactNode } from 'react';

type Registry = Map<string, string>;

const RunnerUnsavedContext = createContext<Registry | null>(null);

/** 창이 들고 있는 레지스트리 — 닫기 전에 `unsavedMessage()` 로 묻는다 */
export function useRunnerUnsavedRegistry() {
  const ref = useRef<Registry>(new Map());
  return {
    registry: ref.current,
    /** 바꾼 것이 있으면 확인 문구, 없으면 null */
    unsavedMessage: (): string | null => {
      const messages = [...ref.current.values()];
      return messages.length > 0 ? messages.join('\n') : null;
    },
    clear: () => ref.current.clear(),
  };
}

export function RunnerUnsavedProvider({ registry, children }: { registry: Registry; children: ReactNode }) {
  return <RunnerUnsavedContext.Provider value={registry}>{children}</RunnerUnsavedContext.Provider>;
}

/**
 * 화면이 «저장하지 않은 변경이 있다»를 알린다. 창 밖(문서 생성 메뉴 등)에서 쓰이면 아무 일도 하지 않는다.
 * @param message 닫기 확인창 문구 — 무엇이 사라지는지 말할 것
 */
export function useRunnerUnsaved(dirty: boolean, message = '저장하지 않은 설정이 있습니다. 닫으면 사라집니다.') {
  const registry = useContext(RunnerUnsavedContext);
  const id = useId();
  useEffect(() => {
    if (!registry) return;
    if (dirty) registry.set(id, message);
    else registry.delete(id);
    return () => { registry.delete(id); };
  }, [registry, id, dirty, message]);
}
