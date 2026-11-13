import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { globalShortcuts } from '../../hooks/useKeyboardShortcuts';

interface KeyboardHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const KeyboardHelp: React.FC<KeyboardHelpProps> = ({ open, onOpenChange }) => {
  const shortcuts = [
    { ...globalShortcuts.search, category: '일반' },
    { ...globalShortcuts.save, category: '일반' },
    { ...globalShortcuts.new, category: '일반' },
    { ...globalShortcuts.refresh, category: '일반' },
    { ...globalShortcuts.escape, category: '일반' },
    { ...globalShortcuts.nextStudent, category: '네비게이션' },
    { ...globalShortcuts.prevStudent, category: '네비게이션' },
    { key: 'Home', ctrl: true, description: '첫 번째 학생', category: '네비게이션' },
    { key: 'End', ctrl: true, description: '마지막 학생', category: '네비게이션' },
    { ...globalShortcuts.togglePanel, category: '패널' },
    { ...globalShortcuts.quickEval, category: '평가' },
    { key: 'Enter', description: '선택한 학생 평가 보기', category: '평가' },
    { key: 'Del', description: '선택한 항목 삭제', category: '편집' },
    { key: 'c', ctrl: true, description: '복사', category: '편집' },
    { key: 'v', ctrl: true, description: '붙여넣기', category: '편집' },
    { key: 'e', ctrl: true, description: '편집', category: '편집' },
  ];

  const groupedShortcuts = shortcuts.reduce((acc, shortcut) => {
    const category = shortcut.category || '기타';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(shortcut);
    return acc;
  }, {} as Record<string, typeof shortcuts>);

  const formatKey = (shortcut: any) => {
    const keys = [];
    if (shortcut.ctrl) keys.push('Ctrl');
    if (shortcut.alt) keys.push('Alt');
    if (shortcut.shift) keys.push('Shift');
    keys.push(shortcut.key);
    return keys.join(' + ');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>키보드 단축키</DialogTitle>
          <DialogDescription>
            평가 시스템에서 사용할 수 있는 키보드 단축키 목록입니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
            <div key={category}>
              <h3 className="font-semibold text-sm text-muted-foreground mb-2">
                {category}
              </h3>
              <div className="space-y-2">
                {categoryShortcuts.map((shortcut, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 rounded hover:bg-muted/50"
                  >
                    <span className="text-sm">{shortcut.description}</span>
                    <kbd className="px-2 py-1 text-xs border rounded bg-muted font-mono">
                      {formatKey(shortcut)}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default KeyboardHelp;