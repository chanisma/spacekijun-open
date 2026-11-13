import { CardHeader } from '@/components/ui/card';
import { ImprovedCard } from '@/components/ui/improved-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  RefreshCw,
  FileText,
  Sparkles,
  Search,
  X,
} from 'lucide-react';
import { useDepartments } from '@/hooks/useDepartments';
import type { DocumentFilters } from '@/features/documents/types';

/**
 * 서류함 상단 바 — 통합 검색·필터 전용 (2026-08-11 단일 뷰 개편).
 * 탭(내 문서/진학자료/문서 관리)은 제거됐고, "문서 추가" 버튼은
 * 사용자 피드백에 따라 문서 리스트 카드 툴바(EnhancedDocumentList)로 이동.
 */
interface DocumentHeaderProps {
  // 통합 검색·필터
  filters: DocumentFilters;
  onFiltersChange: (filters: DocumentFilters) => void;

  // Actions
  onRefresh: () => void;
  onAIAssistant?: () => void;

  // Loading state
  loading?: boolean;
}

function toDateInputValue(date: Date | null | undefined): string {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fromDateInputValue(value: string): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export const DocumentHeader = ({
  filters,
  onFiltersChange,
  onRefresh,
  onAIAssistant,
  loading = false,
}: DocumentHeaderProps) => {
  const { departments } = useDepartments({ source: 'database', category: 'simple' });
  const hasActiveFilters = !!(filters.q || filters.department || filters.dateFrom || filters.dateTo);

  return (
    <div className="mb-4">
      <ImprovedCard className="shadow-sm border border-white/20 bg-white/70 backdrop-blur-md">
        <CardHeader className="pb-3 pt-3 px-3 sm:px-4 md:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-700 flex-shrink-0">
              <FileText className="h-4 w-4 text-indigo-600" />
              서류함
            </span>

            {/* 통합 검색·필터 (파일명·제목·키워드·부서명 + 기간) */}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="파일명·제목·키워드·부서명 검색..."
                className="h-9 pl-8"
                value={filters.q ?? ''}
                onChange={(e) => onFiltersChange({ ...filters, q: e.target.value })}
              />
            </div>

            <Select
              value={filters.department || '__all__'}
              onValueChange={(value) =>
                onFiltersChange({ ...filters, department: value === '__all__' ? '' : value })
              }
            >
              <SelectTrigger className="h-9 w-32">
                <SelectValue placeholder="부서" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">모든 부서</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept} value={dept}>
                    {dept}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1">
              <Input
                type="date"
                className="h-9 w-[140px]"
                value={toDateInputValue(filters.dateFrom)}
                onChange={(e) => onFiltersChange({ ...filters, dateFrom: fromDateInputValue(e.target.value) })}
                title="기간 시작"
              />
              <span className="text-xs text-muted-foreground">~</span>
              <Input
                type="date"
                className="h-9 w-[140px]"
                value={toDateInputValue(filters.dateTo)}
                onChange={(e) => onFiltersChange({ ...filters, dateTo: fromDateInputValue(e.target.value) })}
                title="기간 끝"
              />
            </div>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-2 text-muted-foreground"
                onClick={() => onFiltersChange({ q: '', department: '', dateFrom: null, dateTo: null })}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                초기화
              </Button>
            )}

            <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
              {onAIAssistant && (
                <Button
                  onClick={onAIAssistant}
                  size="sm"
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 h-9 px-2 sm:px-3 flex items-center gap-1.5 text-xs sm:text-sm text-white rounded-lg"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">AI 검색</span>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={loading}
                className="bg-white/50 border-slate-200 hover:bg-white hover:border-slate-300 h-9 px-2 sm:px-3 flex items-center gap-1.5 text-xs sm:text-sm transition-all rounded-lg"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">새로고침</span>
              </Button>
            </div>
          </div>
        </CardHeader>
      </ImprovedCard>
    </div>
  );
};
