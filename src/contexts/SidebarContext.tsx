import React, { createContext, useContext, useState, useEffect } from 'react';
import { readStoredJson, writeStoredJson } from '@/lib/safeLocalStorage';

interface SidebarContextType {
  isExpanded: boolean;
  toggleSidebar: () => void;
  setIsExpanded: (expanded: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
};

interface SidebarProviderProps {
  children: React.ReactNode;
}

const STORAGE_KEY = 'sidebar-expanded';

export const SidebarProvider = ({ children }: SidebarProviderProps) => {
  // Initialize state from localStorage immediately to prevent flash.
  //
  // **읽기는 반드시 safeLocalStorage 를 거친다.** 이 초기화는 렌더 단계에서 실행되고
  // 이 Provider 는 ErrorBoundary 보다 **위**에 있어서, 여기서 예외가 나면 잡아 줄 곳이
  // 없다 → 트리 전체가 언마운트되고 백색 화면이 된다. 게다가 원인이 저장된 값이므로
  // 새로고침해도 같은 자리에서 또 터져 사용자가 localStorage 를 비우기 전에는 낫지 않는다.
  // (종전 코드는 맨 `JSON.parse(localStorage.getItem(...))` 였다.)
  const [isExpanded, setIsExpanded] = useState<boolean>(() =>
    readStoredJson<boolean>(STORAGE_KEY, true, (v): v is boolean => typeof v === 'boolean'),
  );

  const toggleSidebar = () => {
    setIsExpanded(prev => !prev);
  };

  // Save sidebar state to localStorage whenever it changes
  useEffect(() => {
    writeStoredJson(STORAGE_KEY, isExpanded);
  }, [isExpanded]);

  // Keyboard shortcut for toggling sidebar (Ctrl+B / Cmd+B)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'b') {
        event.preventDefault();
        toggleSidebar();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <SidebarContext.Provider value={{ isExpanded, toggleSidebar, setIsExpanded }}>
      {children}
    </SidebarContext.Provider>
  );
};