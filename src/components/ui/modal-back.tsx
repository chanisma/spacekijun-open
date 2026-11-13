import * as React from 'react';

import { getModalBackHistory, nextModalBackId } from '@/lib/modalBackHistory';

/**
 * 모달 부품과 `lib/modalBackHistory` 를 잇는 React 층 (2026-09-22).
 * (라우터 동기화는 라우터에 의존하므로 `components/common/ModalBackRouterSync.tsx` 에 따로 있다 —
 *  모달 부품은 라우터 밖(`ProfileDialogWrapper`)에서도 렌더된다.)
 *
 * `Dialog`·`AlertDialog`·`Sheet`·`Drawer` 의 Root 가 전부 `createBackClosableRoot`
 * 로 만들어지므로 **소비처는 아무것도 하지 않아도** 휴대폰 뒤로가기가 맨 위 모달을
 * 닫는다. Radix 를 직접 쓰는 곳(아카데미 게임 모달 등)만 `useModalBackClose` 를 부른다.
 *
 * **뒤로가기는 Esc 와 같은 규칙으로 닫힌다.** Content 에 `onEscapeKeyDown` 이 있으면
 * 먼저 불러 보고 `preventDefault()` 하면 닫지 않는다(저장 중·작성 중 가드가 그대로
 * 적용된다). 그다음 `onOpenChange(false)` — 거기서 거부해도 역시 닫지 않는다.
 * 닫히지 않으면 기록을 다시 쌓으므로 **다음 뒤로가기가 페이지를 떠나지 않는다**.
 */

type EscapeGuard = (event: KeyboardEvent) => void;

interface ModalBackScope {
  /** 이 모달의 id — 안쪽 모달이 부모로 가리킨다 */
  id: number;
  escapeGuardRef: React.MutableRefObject<EscapeGuard | undefined>;
}

const ModalBackScopeContext = React.createContext<ModalBackScope | null>(null);

/** Esc 가드를 가상의 Esc 로 실행해 본다. 가드가 막으면 true. */
export function isBlockedByEscapeGuard(guard: EscapeGuard | undefined): boolean {
  if (!guard) return false;
  const event = typeof KeyboardEvent === 'function'
    ? new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', cancelable: true })
    : (new Event('keydown', { cancelable: true }) as KeyboardEvent);
  try {
    guard(event);
  } catch (error) {
    console.error('[modal-back] onEscapeKeyDown 실행 실패', error);
    return true; // 판단할 수 없으면 닫지 않는다 — 닫아서 잃는 쪽이 더 비싸다
  }
  return event.defaultPrevented;
}

/**
 * 열려 있는 동안 뒤로가기 한 번 = `onBack` 한 번. Radix Root 를 쓰지 않는 오버레이용.
 * 반환값은 이 모달의 id(안쪽 모달의 부모 표시에 쓴다).
 *
 * id 를 **렌더 중에** 정하는 이유: 바깥·안쪽 모달이 함께 열리면 React 는 안쪽
 * effect 를 먼저 돌린다. id 를 등록할 때 받는다면 안쪽은 부모 id 를 모른 채
 * 등록되고, 그러면 바깥이 "맨 위"로 잡혀 뒤로가기가 바깥을 닫는다.
 */
export function useModalBackClose(open: boolean, onBack: () => void): number {
  const parentId = React.useContext(ModalBackScopeContext)?.id ?? null;
  const [id] = React.useState(nextModalBackId);
  const onBackRef = React.useRef(onBack);
  React.useLayoutEffect(() => {
    onBackRef.current = onBack;
  });

  React.useEffect(() => {
    if (!open) return;
    const manager = getModalBackHistory();
    if (!manager?.register({ id, parentId, requestClose: () => onBackRef.current() })) return;
    return () => manager.unregister(id);
  }, [open, id, parentId]);

  return id;
}

/** Content 부품이 자기 `onEscapeKeyDown` 을 뒤로가기 판정에 알린다. */
export function useModalBackEscapeGuard(guard: EscapeGuard | undefined): void {
  const scope = React.useContext(ModalBackScopeContext);
  React.useLayoutEffect(() => {
    if (!scope) return;
    scope.escapeGuardRef.current = guard;
    return () => {
      if (scope.escapeGuardRef.current === guard) scope.escapeGuardRef.current = undefined;
    };
  }, [scope, guard]);
}

interface RootLikeProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

export type BackClosableRootProps<P> = P & {
  /**
   * 휴대폰 뒤로가기로 닫을 것인가(기본 true). 끄는 것은 모달이 뒤로가기를 스스로
   * 다루는 경우뿐이다 — 끄면 뒤로가기가 모달을 연 채 **이전 페이지로 이동**한다.
   */
  closeOnBack?: boolean;
};

/**
 * Radix(또는 vaul) Root 를 감싸 뒤로가기로 닫히게 만든다.
 *
 * 비제어(`DialogTrigger` 만 쓰고 `open` 을 안 넘기는) 모달도 닫아야 하므로 열림 상태를
 * 여기서 소유하고 Root 에는 **항상 제어형으로** 넘긴다 — Radix 가 하던 일을 그대로
 * 대신하는 것이라 동작은 같다. `defaultOpen` 은 이 상태의 초깃값으로만 쓴다.
 */
export function createBackClosableRoot<P extends RootLikeProps>(
  Root: React.ComponentType<P>,
  displayName: string,
) {
  function BackClosableRoot(props: BackClosableRootProps<P>) {
    const { closeOnBack = true, open: openProp, defaultOpen, onOpenChange, ...rest } = props;
    const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen ?? false);
    const controlled = openProp !== undefined;
    const open = controlled ? Boolean(openProp) : uncontrolledOpen;

    const onOpenChangeRef = React.useRef(onOpenChange);
    React.useLayoutEffect(() => {
      onOpenChangeRef.current = onOpenChange;
    });
    const setOpen = React.useCallback((next: boolean) => {
      if (!controlled) setUncontrolledOpen(next);
      onOpenChangeRef.current?.(next);
    }, [controlled]);

    const escapeGuardRef = React.useRef<EscapeGuard | undefined>(undefined);
    const requestBackClose = React.useCallback(() => {
      if (isBlockedByEscapeGuard(escapeGuardRef.current)) return;
      setOpen(false);
    }, [setOpen]);

    const id = useModalBackClose(closeOnBack && open, requestBackClose);
    const scope = React.useMemo<ModalBackScope>(() => ({ id, escapeGuardRef }), [id]);

    const rootProps = { ...rest, open, onOpenChange: setOpen } as unknown as P;
    return (
      <ModalBackScopeContext.Provider value={scope}>
        <Root {...rootProps} />
      </ModalBackScopeContext.Provider>
    );
  }
  BackClosableRoot.displayName = displayName;
  return BackClosableRoot;
}
