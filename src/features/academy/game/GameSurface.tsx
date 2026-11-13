import { useContext, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { FocusScope } from '@radix-ui/react-focus-scope';
import styles from './game.module.css';
import { GameSurfaceContext, SceneReturnContext } from './surfaceContext';
export function ScenePanel({ title, onClose, children, className = '', backLabel }: { title: string; onClose: () => void; children: ReactNode; className?: string; reduced?: boolean; backLabel?: string }) {
  const surface = useContext(GameSurfaceContext);
  const placeReturn = useContext(SceneReturnContext);
  const section = useRef<HTMLElement>(null);
  useEffect(() => { section.current?.focus(); }, []);
  if (!surface) return null;
  return createPortal(<FocusScope trapped loop asChild><section ref={section} tabIndex={-1} aria-label={title} className={`${styles.scenePanel} ${className}`} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape' && e.target instanceof Node && section.current?.contains(e.target)) { e.stopPropagation(); onClose(); } }}>
    <button className={styles.sceneBack} onClick={onClose}>{backLabel ?? placeReturn}</button>{children}
  </section></FocusScope>, surface);
}
