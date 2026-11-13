/**
 * Subject Categorization Step - 과목 설정 (Step 3)
 * 과목 카테고리 관리 및 설정 (기존 vanilla JS 디자인 기반)
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  RotateCcw,
  Search,
  Download,
  X,
  ChevronRight,
  Database
} from 'lucide-react';
import { useAdmin } from '../../../context/AdminContext';
import { useCourseAnalyzeData } from '../../../context/CourseAnalyzeContext';
import type { SubjectCategory } from '../../../types/admin.types';

// Category colors matching original vanilla JS
const CATEGORY_COLORS: Record<string, string> = {
  '국어': '#e53e3e',
  '영어': '#3182ce',
  '수학': '#38a169',
  '역사': '#8b5cf6',
  '사회': '#d69e2e',
  '물리': '#805ad5',
  '화학': '#06b6d4',
  '생명': '#10b981',
  '지구과학': '#f59e0b',
  '기타': '#718096',
  '예체능': '#ec4899',
  '제2외국어': '#14b8a6',
  '진로': '#8b5cf6',
};

// Category emojis
const CATEGORY_EMOJIS: Record<string, string> = {
  '국어': '📖',
  '영어': '📚',
  '수학': '📐',
  '역사': '📜',
  '사회': '🌍',
  '물리': '⚡',
  '화학': '🧪',
  '생명': '🧬',
  '지구과학': '🌏',
  '기타': '📋',
  '예체능': '🎨',
  '제2외국어': '🗣️',
  '진로': '🧭',
  '미분류': '❓',
};

export function SubjectCategorization() {
  const {
    state,
    allSubjectsFromFiles,
    getSubjectCategory,
    addSubjectToCategory,
    removeSubjectFromCategory,
    moveSubject,
    resetConfig
  } = useAdmin();

  const courseData = useCourseAnalyzeData();

  const [searchQuery, setSearchQuery] = useState('');
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showCategorySelector, setShowCategorySelector] = useState<{ subject: string; x: number; y: number } | null>(null);
  const [draggedSubject, setDraggedSubject] = useState<{ subject: string; fromCategory: string } | null>(null);

  // 메인 시스템 데이터 확인
  const hasMainSystemData = courseData.students.length > 0;

  // 메인 시스템에서 과목 가져오기
  const mainSystemSubjects = useMemo(() => {
    if (!hasMainSystemData) return [];
    const subjects = new Set<string>();
    courseData.students.forEach(student => {
      student.semester1.forEach(s => subjects.add(s));
      student.semester2.forEach(s => subjects.add(s));
    });
    return Array.from(subjects).sort();
  }, [courseData.students, hasMainSystemData]);

  // 관리자 파일과 메인 시스템의 모든 과목 합치기
  const allSubjects = useMemo(() => {
    const subjects = new Set<string>();
    allSubjectsFromFiles.forEach(s => subjects.add(s));
    mainSystemSubjects.forEach(s => subjects.add(s));
    return Array.from(subjects).sort();
  }, [allSubjectsFromFiles, mainSystemSubjects]);

  // Get all categories including uncategorized
  const categories = useMemo(() => {
    const result = Object.entries(state.subjectConfig.categories).map(([name, category]) => ({
      name,
      ...category,
      color: CATEGORY_COLORS[name] || '#718096',
    }));

    return result;
  }, [state.subjectConfig]);

  // Find uncategorized subjects from all sources
  const uncategorizedSubjects = useMemo(() => {
    return allSubjects.filter(subject => {
      const category = getSubjectCategory(subject);
      return category === '미분류';
    });
  }, [allSubjects, getSubjectCategory]);

  // Statistics - 모든 소스 포함
  const totalSubjects = allSubjects.length;
  const categorizedCount = totalSubjects - uncategorizedSubjects.length;

  // Filter subjects by search
  const filteredCategories = useMemo(() => {
    if (!searchQuery) return categories;
    const query = searchQuery.toLowerCase();
    return categories.map(category => ({
      ...category,
      subjects: category.subjects.filter(s => s.toLowerCase().includes(query))
    })).filter(category => category.subjects.length > 0);
  }, [categories, searchQuery]);

  const filteredUncategorized = useMemo(() => {
    if (!searchQuery) return uncategorizedSubjects;
    const query = searchQuery.toLowerCase();
    return uncategorizedSubjects.filter(s => s.toLowerCase().includes(query));
  }, [uncategorizedSubjects, searchQuery]);

  // Move subject to category
  const handleMoveToCategory = (subject: string, targetCategory: string) => {
    const currentCategory = getSubjectCategory(subject);
    if (currentCategory !== targetCategory) {
      moveSubject(subject, currentCategory, targetCategory);
    }
    setShowCategorySelector(null);
  };

  // Drag handlers
  const handleDragStart = (subject: string, fromCategory: string) => {
    setDraggedSubject({ subject, fromCategory });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetCategory: string) => {
    e.preventDefault();
    if (draggedSubject && draggedSubject.fromCategory !== targetCategory) {
      moveSubject(draggedSubject.subject, draggedSubject.fromCategory, targetCategory);
    }
    setDraggedSubject(null);
  };

  // Export config
  const exportConfig = () => {
    const config = {
      categories: state.subjectConfig.categories,
      uncategorized: state.subjectConfig.uncategorized,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'subject-configuration.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  // Empty state - 모든 소스 확인
  if (allSubjects.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center p-10">
          <div className="text-6xl mb-4">⚙️</div>
          <p className="text-slate-500 dark:text-slate-400">
            파일을 업로드하면 과목 설정 도구가 여기에 표시됩니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header - 간소화 */}
      <div className="px-6 py-4 flex-shrink-0 border-b bg-white dark:bg-slate-800">
        <div className="flex items-center justify-between">
          {/* 왼쪽: 통계 */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">전체</span>
              <span className="font-bold text-slate-700 dark:text-slate-200">{totalSubjects}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-green-600">분류</span>
              <span className="font-bold text-green-600">{categorizedCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-500">미분류</span>
              <span className="font-bold text-red-500">{uncategorizedSubjects.length}</span>
            </div>
            {hasMainSystemData && (
              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full flex items-center gap-1">
                <Database className="w-3 h-3" />
                메인 데이터 포함
              </span>
            )}
          </div>

          {/* 오른쪽: 검색 + 버튼 */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="과목 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-48 h-9 bg-slate-50 dark:bg-slate-900"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowResetDialog(true)}
              className="text-slate-500 hover:text-red-500"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={exportConfig}
              className="text-slate-500 hover:text-indigo-500"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <ScrollArea className="flex-1 p-6">
        {/* Uncategorized Section - 상단에 배치 */}
        {filteredUncategorized.length > 0 && (
          <UncategorizedSection
            subjects={filteredUncategorized}
            onSubjectClick={(subject, e) => setShowCategorySelector({ subject, x: e.clientX, y: e.clientY })}
            onDragStart={(subject) => handleDragStart(subject, '미분류')}
          />
        )}

        {/* Categories Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCategories.map(category => (
            <CategoryCard
              key={category.name}
              category={category}
              onRemoveSubject={(subject) => removeSubjectFromCategory(category.name, subject)}
              onSubjectClick={(subject, e) => setShowCategorySelector({ subject, x: e.clientX, y: e.clientY })}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              isDragTarget={draggedSubject !== null && draggedSubject.fromCategory !== category.name}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Category Selector Modal */}
      {showCategorySelector && (
        <CategorySelectorModal
          subject={showCategorySelector.subject}
          categories={categories}
          position={{ x: showCategorySelector.x, y: showCategorySelector.y }}
          onSelect={(category) => handleMoveToCategory(showCategorySelector.subject, category)}
          onClose={() => setShowCategorySelector(null)}
        />
      )}

      {/* Reset Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              ⚠️ 설정 초기화
            </DialogTitle>
            <DialogDescription>
              모든 과목 카테고리 설정을 기본값으로 되돌립니다. 이 작업은 취소할 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>
              취소
            </Button>
            <Button
              className="bg-red-500 hover:bg-red-600 text-white"
              onClick={() => {
                resetConfig();
                setShowResetDialog(false);
              }}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              초기화
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Category Card Component - 간소화
function CategoryCard({
  category,
  onRemoveSubject,
  onSubjectClick,
  onDragStart,
  onDragOver,
  onDrop,
  isDragTarget,
}: {
  category: SubjectCategory & { name: string; color: string };
  onRemoveSubject: (subject: string) => void;
  onSubjectClick: (subject: string, e: React.MouseEvent) => void;
  onDragStart: (subject: string, category: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, category: string) => void;
  isDragTarget: boolean;
}) {
  const color = category.color;
  const emoji = CATEGORY_EMOJIS[category.name] || '📁';

  return (
    <div
      className={cn(
        'rounded-lg bg-white dark:bg-slate-800 overflow-hidden transition-all duration-200',
        isDragTarget && 'ring-2 ring-indigo-500'
      )}
      style={{ border: `1px solid ${color}40` }}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, category.name)}
    >
      {/* Header */}
      <div
        className="px-3 py-2 flex items-center justify-between"
        style={{ background: `${color}10` }}
      >
        <span className="font-medium text-sm flex items-center gap-1.5" style={{ color }}>
          {emoji} {category.name}
        </span>
        <span className="text-xs text-slate-500">{category.subjects.length}</span>
      </div>

      {/* Subjects */}
      <div className="p-2 min-h-[80px]">
        {category.subjects.length === 0 ? (
          <p className="text-slate-300 text-xs text-center py-4">드래그하여 추가</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {category.subjects.map(subject => (
              <div
                key={subject}
                draggable
                onDragStart={() => onDragStart(subject, category.name)}
                onClick={(e) => onSubjectClick(subject, e)}
                className="group inline-flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer hover:opacity-80"
                style={{
                  background: `${color}15`,
                  color: color,
                }}
              >
                <span>{subject}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveSubject(subject);
                  }}
                  className="opacity-40 hover:opacity-100 font-bold"
                  style={{ color }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Uncategorized Section Component - 간소화
function UncategorizedSection({
  subjects,
  onSubjectClick,
  onDragStart,
}: {
  subjects: string[];
  onSubjectClick: (subject: string, e: React.MouseEvent) => void;
  onDragStart: (subject: string) => void;
}) {
  return (
    <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-amber-600 font-medium text-sm">❓ 미분류 ({subjects.length})</span>
        <span className="text-xs text-amber-500">클릭하여 분류</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {subjects.map(subject => (
          <div
            key={subject}
            draggable
            onDragStart={() => onDragStart(subject)}
            onClick={(e) => onSubjectClick(subject, e)}
            className="px-2 py-1 rounded text-xs cursor-pointer bg-amber-100 dark:bg-amber-800 text-amber-700 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-700 transition-colors"
          >
            {subject}
          </div>
        ))}
      </div>
    </div>
  );
}

// Category Selector Modal Component
function CategorySelectorModal({
  subject,
  categories,
  position,
  onSelect,
  onClose,
}: {
  subject: string;
  categories: Array<SubjectCategory & { name: string; color: string }>;
  position: { x: number; y: number };
  onSelect: (category: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="fixed z-50 bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 max-w-sm w-[90%]"
        style={{
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)'
        }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <X className="h-5 w-5 text-slate-500" />
        </button>

        <h3 className="font-semibold text-lg text-slate-700 dark:text-slate-200 mb-2">
          "{subject}" 과목 분류
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
          이 과목을 어떤 카테고리에 분류하시겠습니까?
        </p>

        <div className="space-y-2 mb-4 max-h-[300px] overflow-y-auto">
          {categories.map(category => {
            const emoji = CATEGORY_EMOJIS[category.name] || '📁';
            return (
              <button
                key={category.name}
                onClick={() => onSelect(category.name)}
                className="w-full p-3 rounded-lg text-left transition-all duration-200 hover:scale-[1.02] flex items-center justify-between group"
                style={{
                  background: `${category.color}15`,
                  color: category.color,
                  border: `1px solid ${category.color}30`
                }}
              >
                <span className="flex items-center gap-2">
                  <span>{emoji}</span>
                  <span className="font-medium">{category.name}</span>
                </span>
                <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            );
          })}
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={onClose}
        >
          취소
        </Button>
      </div>
    </>
  );
}
