import { BoardHeader } from "@/components/collab/BoardHeader";
import { Layout } from "@/components/layout/Layout";
import { ImprovedCard } from "@/components/ui/improved-card";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Users, StickyNote, Clock, Loader2, MoreVertical, Trash2, Edit, Globe, Archive, ArchiveRestore, Lock, Eye, Tag } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCollabBoards, useDeleteBoard, useArchiveBoard, useUnarchiveBoard, CollabBoard as CollabBoardType } from "@/hooks/useCollabBoards";
import { useState } from "react";
import { useDropdownDialog } from "@/hooks/useDropdownDialog";
import { CreateBoardDialog } from "@/components/collab/CreateBoardDialog";
import { EditBoardDialog } from "@/components/collab/EditBoardDialog";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/hooks/use-toast";
import { useCurrentResourceId } from "@/hooks/useCurrentResourceId";
import { getTimeAgo } from "@/lib/timeUtils";
import { BoardCategoryFilter } from "@/components/collab/BoardCategoryFilter";
import {
  boardMatchesCategories,
  buildCategoryCatalog,
  parseBoardCategory,
} from "@/lib/collabCategories";
import {
  boardAccessFieldsFromList,
  hasCollabViewAccess,
} from "@/lib/collabBoardAccess";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function CollabBoard() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { data: resourceId } = useCurrentResourceId();
  const { data: boards = [], isLoading } = useCollabBoards();
  const { mutate: deleteBoard } = useDeleteBoard();
  const { mutate: archiveBoard } = useArchiveBoard();
  const { mutate: unarchiveBoard } = useUnarchiveBoard();
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const { triggerDialog, dropdownContentProps } = useDropdownDialog();
  const [selectedBoard, setSelectedBoard] = useState<CollabBoardType | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  /**
   * 들어갈 수 없는 비공개 보드는 **목록에서 뺀다** (2026-09-18 사용자 결정).
   *
   * 종전엔 교사에게 남의 비공개 보드가 잠금 배지를 달고 보였다 —
   * 의도한 동작이었지만, 누를 수 없는 카드가 목록을 채우고 제목만 드러내
   * 쓸모보다 잡음이 컸다. 서버(RLS)는 종전대로 교직원에게 전부 내려 준다
   * (권한 변경은 별도 결정이라 손대지 않았다) — 그래서 여기서 거른다.
   *
   * ⚠ 라이브 실측(2026-09-18): 보드 7개 중 private 6 · read_only 1 · public 0.
   * 즉 이 필터가 켜지면 남의 보드에 초대되지 않은 교사의 목록은 거의 빈다.
   * 버그가 아니라 이 결정의 직접적인 결과다.
   */
  const accessibleBoards = boards.filter((board) =>
    hasCollabViewAccess(boardAccessFieldsFromList(board), resourceId, isAdmin)
  );

  // 아카이브 여부까지 적용한 "지금 화면이 다루는 집합" — 카테고리 칩의 모집단이다.
  const scopedBoards = accessibleBoards.filter((board) =>
    showArchived ? board.is_archived : !board.is_archived
  );

  /**
   * 칩은 **지금 목록에 있는 보드**에서만 유도한다(요구사항: 활성화된 보드의
   * 카테고리만). 검색어는 반영하지 않는다 — 타이핑할 때마다 칩이 사라지면
   * 고르려던 것을 놓친다.
   */
  const categories = buildCategoryCatalog(scopedBoards);

  const filteredBoards = scopedBoards
    .filter((board) =>
      boardMatchesCategories(board.meta, selectedCategory ? [selectedCategory] : [])
    )
    .filter(board =>
      searchQuery
        ? board.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        board.description?.toLowerCase().includes(searchQuery.toLowerCase())
        : true
    );

  // 아카이브된 보드 개수 (접근 가능한 것만 — 배지 숫자와 실제 목록이 어긋나면 안 된다)
  const archivedCount = accessibleBoards.filter(b => b.is_archived).length;

  const handleEditBoard = (board: CollabBoardType, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedBoard(board);
    setEditDialogOpen(true);
  };

  const handleArchiveBoard = (boardId: string, boardTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (confirm(`"${boardTitle}" 보드를 아카이브하시겠습니까?\n\n아카이브된 보드는 아카이브 보기에서 확인할 수 있습니다.`)) {
      archiveBoard(boardId, {
        onSuccess: () => {
          toast({
            title: "보드 아카이브 완료",
            description: "보드가 아카이브되었습니다.",
          });
        },
        onError: (error) => {
          toast({
            title: "보드 아카이브 실패",
            description: error.message || "보드를 아카이브하는 중 오류가 발생했습니다.",
            variant: "destructive",
          });
        },
      });
    }
  };

  const handleUnarchiveBoard = (boardId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    unarchiveBoard(boardId, {
      onSuccess: () => {
        toast({
          title: "보드 복원 완료",
          description: "보드가 복원되었습니다.",
        });
      },
      onError: (error) => {
        toast({
          title: "보드 복원 실패",
          description: error.message || "보드를 복원하는 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      },
    });
  };

  const handleDeleteBoard = (boardId: string, boardTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (confirm(`"${boardTitle}" 보드를 삭제하시겠습니까?\n\n⚠️ 보드의 모든 노트와 댓글도 함께 삭제됩니다.`)) {
      deleteBoard(boardId, {
        onSuccess: () => {
          toast({
            title: "보드 삭제 완료",
            description: "보드가 성공적으로 삭제되었습니다.",
          });
        },
        onError: (error) => {
          toast({
            title: "보드 삭제 실패",
            description: error.message || "보드를 삭제하는 중 오류가 발생했습니다.",
            variant: "destructive",
          });
        },
      });
    }
  };

  const getColorClasses = (color: string) => {
    const colors: Record<string, { gradient: string; icon: string; badge: string }> = {
      blue: {
        gradient: "from-blue-500 to-blue-600",
        icon: "text-blue-600",
        badge: "bg-blue-100 text-blue-700",
      },
      purple: {
        gradient: "from-purple-500 to-purple-600",
        icon: "text-purple-600",
        badge: "bg-purple-100 text-purple-700",
      },
      pink: {
        gradient: "from-pink-500 to-pink-600",
        icon: "text-pink-600",
        badge: "bg-pink-100 text-pink-700",
      },
      green: {
        gradient: "from-green-500 to-green-600",
        icon: "text-green-600",
        badge: "bg-green-100 text-green-700",
      },
      yellow: {
        gradient: "from-yellow-500 to-yellow-600",
        icon: "text-yellow-600",
        badge: "bg-yellow-100 text-yellow-700",
      },
      orange: {
        gradient: "from-orange-500 to-orange-600",
        icon: "text-orange-600",
        badge: "bg-orange-100 text-orange-700",
      },
    };
    return colors[color] || colors.blue;
  };

  return (
    <Layout fullWidth>
      <div className="min-h-full bg-slate-50/50 relative">
        <div className="absolute inset-0 z-0 opacity-[0.4] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
        <div className="relative z-10">
          <div className="p-4 sm:p-6 sticky top-0 z-50 pointer-events-none">
            <div className="pointer-events-auto">
              <BoardHeader
                mode="list"
                totalCount={filteredBoards.length}
                archivedCount={archivedCount}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                showArchived={showArchived}
                onToggleArchived={() => setShowArchived(!showArchived)}
                onCreateBoard={() => setCreateDialogOpen(true)}
                filterSlot={
                  <BoardCategoryFilter
                    categories={categories}
                    selected={selectedCategory}
                    onSelect={setSelectedCategory}
                    totalCount={scopedBoards.length}
                  />
                }
              />
            </div>
          </div>

          <main className="px-4 sm:px-6 pb-24 md:pb-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredBoards.length === 0 ? (
              /*
                빈 목록은 "아직 안 만들었다"와 "필터에 걸려 안 보인다"가 전혀 다른
                상황인데 화면은 똑같이 비어 보인다. 무엇 때문에 비었는지 말해 준다.
              */
              <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/50 px-6 py-16 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100">
                  <StickyNote className="h-8 w-8 text-blue-500" />
                </div>
                <h3 className="text-base font-semibold text-slate-700">
                  {showArchived
                    ? "아카이브된 보드가 없습니다"
                    : selectedCategory || searchQuery
                      ? "조건에 맞는 보드가 없습니다"
                      : "참여 중인 보드가 없습니다"}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {selectedCategory || searchQuery
                    ? "카테고리·검색어를 지우면 전체 목록을 볼 수 있습니다."
                    : "비공개 보드는 초대받은 사람에게만 보입니다. 새 보드를 만들어 시작하세요."}
                </p>
                <div className="mt-5 flex items-center justify-center gap-2">
                  {(selectedCategory || searchQuery) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        setSelectedCategory(null);
                        setSearchQuery("");
                      }}
                    >
                      필터 지우기
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 bg-blue-600 text-xs hover:bg-blue-700"
                    onClick={() => setCreateDialogOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    새 보드 만들기
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                {/* 새 보드 만들기 카드 - 데스크톱에서만 표시 */}
                <ImprovedCard
                  className="hidden sm:block cursor-pointer group hover:shadow-xl transition-all duration-300 border-2 border-dashed border-slate-200 bg-slate-50/50 hover:bg-white hover:border-blue-400/50 rounded-2xl"
                  onClick={() => setCreateDialogOpen(true)}
                >
                  <CardContent className="flex flex-col items-center justify-center h-full min-h-[220px] p-6 w-full space-y-4">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white shadow-sm border border-slate-100 group-hover:scale-110 group-hover:bg-blue-50 group-hover:border-blue-100 transition-all duration-300">
                      <Plus className="h-8 w-8 text-slate-400 group-hover:text-blue-500" />
                    </div>
                    <div className="text-center space-y-1">
                      <h3 className="text-lg font-bold text-slate-700 group-hover:text-blue-600 transition-colors">새 보드 만들기</h3>
                      <p className="text-xs text-slate-500 group-hover:text-slate-600">
                        새로운 아이디어 공간을 만들어보세요
                      </p>
                    </div>
                  </CardContent>
                </ImprovedCard>

                {/* 보드 카드들 */}
                {filteredBoards.map((board) => {
                  const colorClasses = getColorClasses(board.color);
                  const isOwner = board.created_by === resourceId;
                  const canManage = isAdmin || isOwner;
                  const category = parseBoardCategory(board.meta);

                  // 목록은 이미 접근 가능한 보드만 담는다(위 accessibleBoards).
                  // 그래서 여기서 다시 권한을 묻지 않는다 — 두 곳에서 판정하면
                  // 한쪽만 고쳤을 때 "보이는데 눌러도 안 되는" 상태가 돌아온다.
                  const handleCardClick = () => navigate(`/collab/${board.id}`);

                  return (
                    <ImprovedCard
                      key={board.id}
                      className={`cursor-pointer hover:shadow-xl transition-all duration-300 group rounded-2xl border border-slate-200 bg-white hover:-translate-y-1.5 min-h-[220px] flex flex-col justify-between overflow-hidden ${board.is_archived ? 'opacity-60 grayscale bg-slate-50' : ''
                        }`}
                      onClick={handleCardClick}
                    >
                      <CardHeader className="pb-3 sm:pb-4 space-y-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div
                              className={`p-2.5 rounded-xl bg-gradient-to-br ${colorClasses.gradient} shadow-sm group-hover:shadow-md group-hover:scale-105 transition-all duration-300 flex-shrink-0 text-white`}
                            >
                              <StickyNote className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                              <CardTitle className="text-lg font-bold truncate text-slate-800 group-hover:text-slate-900 transition-colors mb-0.5">
                                {board.title}
                              </CardTitle>
                              <div className="flex items-center gap-2 text-xs text-slate-500">
                                <Clock className="h-3 w-3" />
                                <span>{getTimeAgo(board.updated_at)}</span>
                              </div>
                            </div>
                          </div>

                          {/* Owner 또는 관리자만 관리 가능 */}
                          {canManage && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 -mr-2 text-slate-400 hover:text-slate-600 rounded-full"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()} className="rounded-xl border-slate-200 shadow-lg" {...dropdownContentProps}>
                                <DropdownMenuItem
                                  onSelect={() => triggerDialog(() => {
                                    setSelectedBoard(board);
                                    setEditDialogOpen(true);
                                  })}
                                  className="focus:bg-slate-50 text-slate-700 cursor-pointer rounded-lg"
                                >
                                  <Edit className="h-4 w-4 mr-2" />
                                  보드 수정
                                </DropdownMenuItem>
                                {board.is_archived ? (
                                  <DropdownMenuItem
                                    onClick={(e) => handleUnarchiveBoard(board.id, e)}
                                  >
                                    <ArchiveRestore className="h-4 w-4 mr-2" />
                                    아카이브 해제
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={(e) => handleArchiveBoard(board.id, board.title, e)}
                                  >
                                    <Archive className="h-4 w-4 mr-2" />
                                    아카이브에 저장
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  className="text-red-600 focus:text-red-600"
                                  onClick={(e) => handleDeleteBoard(board.id, board.title, e)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  보드 삭제
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-4 pt-1">
                        <p className={`text-sm text-slate-600 line-clamp-2 min-h-[2.5rem] leading-relaxed ${!board.description ? 'italic text-slate-400' : ''
                          }`}>
                          {board.description || "설명이 없습니다"}
                        </p>

                        <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-slate-100 mt-auto">
                          <div className="flex items-center gap-2 flex-wrap">
                            {board.is_archived && (
                              <Badge
                                variant="secondary"
                                className="gap-1 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-md px-2 py-0.5"
                              >
                                <Archive className="h-3 w-3" />
                                <span className="text-[10px]">아카이브됨</span>
                              </Badge>
                            )}
                            {category && (
                              <Badge
                                variant="secondary"
                                className="gap-1 max-w-[9rem] bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-md px-2 py-0.5"
                                title={category}
                              >
                                <Tag className="h-3 w-3 flex-shrink-0" />
                                <span className="text-[10px] truncate">{category}</span>
                              </Badge>
                            )}
                            {board.visibility === 'public' && (
                              <Badge
                                variant="secondary"
                                className="gap-1 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-md px-2 py-0.5"
                              >
                                <Globe className="h-3 w-3" />
                                <span className="text-[10px]">전체 공개</span>
                              </Badge>
                            )}
                            {board.visibility === 'read_only' && (
                              <Badge
                                variant="secondary"
                                className="gap-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-md px-2 py-0.5"
                              >
                                <Eye className="h-3 w-3" />
                                <span className="text-[10px]">부분 공개</span>
                              </Badge>
                            )}
                            {board.visibility === 'private' && (
                              <Badge
                                variant="secondary"
                                className="gap-1 bg-purple-50 text-purple-600 hover:bg-purple-100 rounded-md px-2 py-0.5"
                              >
                                <Lock className="h-3 w-3" />
                                <span className="text-[10px]">비공개</span>
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant="secondary"
                              className={`gap-1 ${colorClasses.badge} rounded-md px-2 py-0.5 border-0`}
                            >
                              <Users className="h-3 w-3" />
                              <span className="text-[10px] font-medium">{board.member_count || 0}</span>
                            </Badge>
                            <Badge
                              variant="secondary"
                              className={`gap-1 ${colorClasses.badge} rounded-md px-2 py-0.5 border-0`}
                            >
                              <StickyNote className="h-3 w-3" />
                              <span className="text-[10px] font-medium">{board.note_count || 0}</span>
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </ImprovedCard>
                  );
                })}
              </div>
            )}
          </main>

          <CreateBoardDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
          <EditBoardDialog board={selectedBoard} open={editDialogOpen} onOpenChange={setEditDialogOpen} />
        </div>
      </div>
    </Layout>
  );
}
