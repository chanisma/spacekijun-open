import * as React from 'react';

type Surface = { id: string; parentId: string | null };
let surfaces: Surface[] = [];
const subscribers = new Set<() => void>();
const subscribe = (callback: () => void) => { subscribers.add(callback); return () => { subscribers.delete(callback); }; };
const snapshot = () => surfaces;
const notify = () => subscribers.forEach((callback) => callback());

function register(surface: Surface) {
  if (surfaces.some((item) => item.id === surface.id)) return;
  // React attaches child refs first when parent and child open together.
  const childIndex = surfaces.findIndex((item) => item.parentId === surface.id);
  surfaces = [...surfaces];
  surfaces.splice(childIndex < 0 ? surfaces.length : childIndex, 0, surface);
  notify();
}
function unregister(id: string) {
  surfaces = surfaces.filter((item) => item.id !== id);
  notify();
}

export const ModalSurfaceContext = React.createContext<{ id: string; container: HTMLElement | null } | null>(null);

export function useModalSurface(forwardedRef: React.ForwardedRef<HTMLDivElement>) {
  const id = React.useId();
  const parentId = React.useContext(ModalSurfaceContext)?.id ?? null;
  const [container, setContainer] = React.useState<HTMLDivElement | null>(null);
  const stack = React.useSyncExternalStore(subscribe, snapshot, snapshot);
  const index = stack.findIndex((item) => item.id === id);
  const layer = 1000 + (index < 0 ? stack.length : index) * 20;
  const ref = React.useCallback((node: HTMLDivElement | null) => {
    setContainer(node);
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }, [forwardedRef]);
  // Radix may detach/reattach composed refs during an ordinary render. Register
  // committed DOM identity, not every ref call, to avoid a stack/render feedback loop.
  React.useLayoutEffect(() => {
    if (!container) return;
    register({ id, parentId });
    return () => unregister(id);
  }, [container, id, parentId]);
  const scope = React.useMemo(() => ({ id, container }), [id, container]);
  return { ref, layer, scope };
}

export function useModalPortalContainer(explicit?: HTMLElement | null) {
  const surface = React.useContext(ModalSurfaceContext);
  return explicit !== undefined ? explicit : surface?.container ?? undefined;
}
