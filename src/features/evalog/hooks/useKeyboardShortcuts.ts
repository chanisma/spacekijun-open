import { useEffect, useCallback } from 'react';

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  handler: () => void;
  description?: string;
  enabled?: boolean;
}

function matchesShortcut(event: KeyboardEvent, shortcut: ShortcutConfig): boolean {
  if (shortcut.enabled === false) return false;

  const matchesKey = event.key.toLowerCase() === shortcut.key.toLowerCase();
  const matchesCtrl = shortcut.ctrl ? event.ctrlKey || event.metaKey : !event.ctrlKey && !event.metaKey;
  const matchesAlt = shortcut.alt ? event.altKey : !event.altKey;
  const matchesShift = shortcut.shift ? event.shiftKey : !event.shiftKey;

  return matchesKey && matchesCtrl && matchesAlt && matchesShift;
}

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]): void {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    for (const shortcut of shortcuts) {
      if (matchesShortcut(event, shortcut)) {
        event.preventDefault();
        shortcut.handler();
        break;
      }
    }
  }, [shortcuts]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

// 전역 단축키 목록
export const globalShortcuts = {
  search: { key: 'f', ctrl: true, description: '검색' },
  save: { key: 's', ctrl: true, description: '저장' },
  new: { key: 'n', ctrl: true, description: '새로 만들기' },
  refresh: { key: 'r', ctrl: true, description: '새로고침' },
  nextStudent: { key: 'ArrowDown', alt: true, description: '다음 학생' },
  prevStudent: { key: 'ArrowUp', alt: true, description: '이전 학생' },
  togglePanel: { key: 'Tab', ctrl: true, description: '패널 전환' },
  quickEval: { key: 'e', ctrl: true, description: '빠른 평가' },
  help: { key: 'h', ctrl: true, shift: true, description: '도움말' },
  escape: { key: 'Escape', description: '취소/닫기' },
};

interface StudentNavigationResult {
  navigateNext: () => void;
  navigatePrev: () => void;
  navigateFirst: () => void;
  navigateLast: () => void;
}

export function useStudentNavigation(
  students: unknown[],
  selectedIndex: number,
  onSelect: (index: number) => void
): StudentNavigationResult {
  const navigateNext = useCallback(() => {
    if (selectedIndex < students.length - 1) {
      onSelect(selectedIndex + 1);
    }
  }, [selectedIndex, students.length, onSelect]);

  const navigatePrev = useCallback(() => {
    if (selectedIndex > 0) {
      onSelect(selectedIndex - 1);
    }
  }, [selectedIndex, onSelect]);

  const navigateFirst = useCallback(() => {
    if (students.length > 0) {
      onSelect(0);
    }
  }, [students.length, onSelect]);

  const navigateLast = useCallback(() => {
    if (students.length > 0) {
      onSelect(students.length - 1);
    }
  }, [students.length, onSelect]);

  useKeyboardShortcuts([
    { key: 'ArrowDown', alt: true, handler: navigateNext },
    { key: 'ArrowUp', alt: true, handler: navigatePrev },
    { key: 'Home', ctrl: true, handler: navigateFirst },
    { key: 'End', ctrl: true, handler: navigateLast },
  ]);

  return { navigateNext, navigatePrev, navigateFirst, navigateLast };
}