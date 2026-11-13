import { CardHeader } from '@/components/ui/card';
import { ImprovedCard } from '@/components/ui/improved-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StickyNote, Users, ArrowLeft, Archive, Search, Plus } from "lucide-react";

interface BoardHeaderProps {
  // 보드 정보
  title?: string;
  description?: string;
  boardId?: string;

  // 통계
  totalCount?: number;
  memberCount?: number;
  archivedCount?: number;

  // 액션
  onBack?: () => void;
  onMembersClick?: () => void;
  onAddNote?: () => void;
  onCreateBoard?: () => void;

  // 검색 & 필터
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  showArchived?: boolean;
  onToggleArchived?: () => void;

  // 권한
  isOwner?: boolean;
  hasWriteAccess?: boolean;

  // 모드
  mode?: 'list' | 'detail';

  /**
   * 제목 줄 **아래** 한 줄을 통째로 쓰는 슬롯.
   * list = 카테고리 필터 칩, detail = 색 범례.
   *
   * 오른쪽 액션 줄에 끼워 넣지 않는 이유: 둘 다 항목 수가 데이터에 따라 늘어나
   * 검색창·버튼을 밀어낸다. 줄을 따로 두면 항목이 몇 개든 헤더 구조가 안 흔들린다.
   * 슬롯이 비면(카테고리 0개 등) 줄 자체가 사라져 헤더 높이가 그대로다.
   */
  filterSlot?: React.ReactNode;
}

export function BoardHeader({
  title = "",
  description = "",
  boardId,
  totalCount,
  memberCount,
  archivedCount = 0,
  onBack,
  onMembersClick,
  onAddNote,
  onCreateBoard,
  searchQuery = "",
  onSearchChange,
  showArchived = false,
  onToggleArchived,
  isOwner = false,
  hasWriteAccess = false,
  mode = 'list',
  filterSlot,
}: BoardHeaderProps) {
  return (
    <div className="mb-6 sticky top-4 z-50">
      <ImprovedCard className="shadow-sm border border-white/20 bg-white/70 backdrop-blur-md">
        <CardHeader className="pb-3 pt-3 px-3 sm:px-4 md:px-6">
          <div className="flex items-center justify-between">
            {/* 왼쪽: 제목과 통계 */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {mode === 'detail' && onBack && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onBack}
                  className="h-8 w-8 p-0 flex-shrink-0"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              {title && (
                <div className="flex items-center gap-2">
                  <StickyNote className="h-5 w-5 text-yellow-600" />
                  <h2 className="text-lg font-semibold truncate">{title}</h2>
                </div>
              )}
              {mode === 'list' && totalCount !== undefined && (
                <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                  <span>•</span>
                  <span>전체 {totalCount}개</span>
                </div>
              )}
              {mode === 'detail' && memberCount !== undefined && (
                <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                  <span>•</span>
                  <span>{memberCount}명 참여 중</span>
                </div>
              )}
            </div>

            {/* 오른쪽: 액션 버튼들 */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* 검색 (list 모드에서만) */}
              {mode === 'list' && onSearchChange && (
                <div className="relative hidden md:block w-48 lg:w-64">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="보드 검색..."
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="h-8 pl-8 pr-3 text-sm"
                  />
                </div>
              )}

              {/* 아카이브 토글 */}
              {onToggleArchived && (
                <Button
                  variant={showArchived ? "default" : "outline"}
                  size="sm"
                  onClick={onToggleArchived}
                  className="h-8 px-2 sm:px-3 flex items-center gap-1.5 text-xs sm:text-sm"
                >
                  <Archive className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">
                    {showArchived ? "활성 보기" : `아카이브 (${archivedCount})`}
                  </span>
                </Button>
              )}

              {/* 새 보드 만들기 버튼 (list 모드, 모바일에서만) */}
              {mode === 'list' && onCreateBoard && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={onCreateBoard}
                  className="sm:hidden h-8 px-2 flex items-center gap-1.5 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>보드</span>
                </Button>
              )}

              {/* 새 노트 만들기 버튼 (detail 모드, 모바일에서만) */}
              {mode === 'detail' && onAddNote && hasWriteAccess && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={onAddNote}
                  className="sm:hidden h-8 px-2 flex items-center gap-1.5 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>노트</span>
                </Button>
              )}

              {/* 멤버 버튼 (detail 모드) */}
              {mode === 'detail' && onMembersClick && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onMembersClick}
                  className="bg-white hover:bg-gray-50 h-8 px-2 sm:px-3 flex items-center gap-1.5 text-xs sm:text-sm"
                >
                  <Users className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  <span className="hidden sm:inline">멤버</span>
                </Button>
              )}
            </div>
          </div>

          {filterSlot && (
            <div className="mt-2.5 border-t border-slate-100 pt-2.5">{filterSlot}</div>
          )}
        </CardHeader>
      </ImprovedCard>
    </div>
  );
}
