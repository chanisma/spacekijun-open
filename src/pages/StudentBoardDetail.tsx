import { StudentStickyNote } from "@/components/collab/student/StudentStickyNote";
import { StudentAddNoteCard } from "@/components/collab/student/StudentAddNoteCard";
import { BoardHeader } from "@/components/collab/BoardHeader";
import { BoardMembersDialog } from "@/components/collab/BoardMembersDialog";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { ImprovedCard } from "@/components/ui/improved-card";
import { CardContent } from "@/components/ui/card";
import { Plus, Loader2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useCollabBoard } from "@/hooks/useCollabBoards";
import { useCollabNotes } from "@/hooks/useCollabNotes";
import { useAuth } from "@/components/auth/AuthProvider";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useCurrentResourceId } from "@/hooks/useCurrentResourceId";
import { useSidebar } from "@/contexts/SidebarContext";
import { NoteColorLegend } from "@/components/collab/NoteColorLegend";
import { NotePaletteDialog } from "@/components/collab/NotePaletteDialog";
import {
  noteMatchesColors,
  normalizeNoteColor,
  parseBoardPalette,
} from "@/lib/collabNoteColors";

export default function StudentBoardDetail(): JSX.Element {
  const navigate = useNavigate();
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const { data: resourceId } = useCurrentResourceId();
  const { isExpanded: isSidebarExpanded } = useSidebar();
  const [showAddNote, setShowAddNote] = useState(false);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [showArchivedNotes, setShowArchivedNotes] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [paletteDialogOpen, setPaletteDialogOpen] = useState(false);

  const { data: board, isLoading: boardLoading } = useCollabBoard(id);
  const { data: notes = [], isLoading: notesLoading } = useCollabNotes(id);

  // 보드가 정한 색 목록. 설정이 없으면 기본 7색으로 떨어진다.
  // meta 기준으로 memo 한다 — 매 렌더 새 배열을 만들면 이 값을 prop 으로 받는
  // 팔레트 편집 모달이 입력 도중 초기화된다.
  const palette = useMemo(() => parseBoardPalette(board?.meta), [board?.meta]);

  // 아카이브 여부까지 적용한 집합 = 범례 숫자의 모집단
  const scopedNotes = notes.filter(note =>
    showArchivedNotes ? note.is_archived : !note.is_archived
  );

  /**
   * 색별 개수. 키는 **정규화된 hex** 다 — 옛 노트는 `'yellow'`, 새 노트는
   * `'#fff176'` 로 저장돼 있어 정규화 없이 세면 같은 색이 둘로 갈라진다.
   */
  const colorCounts = scopedNotes.reduce<Record<string, number>>((acc, note) => {
    const hex = normalizeNoteColor(note.color);
    acc[hex] = (acc[hex] ?? 0) + 1;
    return acc;
  }, {});

  const filteredNotes = scopedNotes.filter(note =>
    noteMatchesColors(note.color, selectedColor ? [selectedColor] : [])
  );

  // 아카이브된 노트 개수
  const archivedNoteCount = notes.filter(n => n.is_archived).length;

  const isLoading = boardLoading || notesLoading;
  const isOwner = board?.created_by === resourceId;
  const canManage = isAdmin || isOwner;

  // Check if user is a member of the board
  const isMember = board && resourceId && board.members?.some(
    (member: any) => member.resource?.id === resourceId
  );

  // Check if user has access to view this board
  const hasViewAccess = isAdmin ||
    board?.visibility === 'public' ||
    board?.visibility === 'read_only' ||
    (board?.visibility === 'private' && isMember);

  // Check if user can create notes (write access)
  const hasWriteAccess = isAdmin ||
    board?.visibility === 'public' ||
    ((board?.visibility === 'read_only' || board?.visibility === 'private') && isMember);

  // Redirect if no access
  useEffect(() => {
    if (!isLoading && board && resourceId && !hasViewAccess) {
      navigate('/student-collab');
    }
  }, [isLoading, board, resourceId, hasViewAccess, navigate]);

  // 윈도우 너비 추적
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ResizeObserver로 실제 렌더된 노트 높이 측정
  const [noteHeights, setNoteHeights] = useState<Map<string, number>>(new Map());
  const noteRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const observerRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    observerRef.current = new ResizeObserver((entries) => {
      setNoteHeights(prev => {
        const next = new Map(prev);
        let changed = false;
        for (const entry of entries) {
          const noteId = (entry.target as HTMLDivElement).dataset.noteId;
          if (noteId) {
            const h = Math.round(entry.contentRect.height);
            if (next.get(noteId) !== h) {
              next.set(noteId, h);
              changed = true;
            }
          }
        }
        return changed ? next : prev;
      });
    });
    // 캐시된 데이터로 노트가 이미 마운트된 경우(useEffect보다 callback ref가 먼저 실행됨)
    // observer 생성 후 기존 ref들을 즉시 observe
    noteRefs.current.forEach((el) => {
      observerRef.current?.observe(el);
    });
    return () => observerRef.current?.disconnect();
  }, []);

  const setNoteRef = useCallback((noteId: string, el: HTMLDivElement | null) => {
    if (el) {
      el.dataset.noteId = noteId;
      noteRefs.current.set(noteId, el);
      observerRef.current?.observe(el);
    } else {
      const existing = noteRefs.current.get(noteId);
      if (existing) {
        observerRef.current?.unobserve(existing);
        noteRefs.current.delete(noteId);
      }
    }
  }, []);

  // 사이드바 너비를 감안한 실제 컨텐츠 영역 기준 컬럼 수
  const columnCount = useMemo(() => {
    const sidebarWidth = isSidebarExpanded ? 256 : 64;
    const contentWidth = windowWidth - sidebarWidth;
    if (contentWidth >= 1280) return 4;
    if (contentWidth >= 1024) return 3;
    if (contentWidth >= 768) return 2;
    return 1;
  }, [windowWidth, isSidebarExpanded]);

  // 모든 노트가 측정된 후에만 레이아웃 표시 (재배치 과정 숨김)
  const isLayoutReady = useMemo(() =>
    filteredNotes.length === 0 || filteredNotes.every(note => noteHeights.has(note.id)),
    [filteredNotes, noteHeights]
  );

  // Greedy shortest-column-first 배치: 실제 측정 높이 우선, 없으면 콘텐츠 기반 추정
  const noteColumns = useMemo(() => {
    const cols: (typeof filteredNotes)[] = Array.from({ length: columnCount }, () => []);
    const heights = new Array(columnCount).fill(0);
    if (hasWriteAccess) heights[0] += 320;

    for (const note of filteredNotes) {
      let h = noteHeights.get(note.id);
      if (!h) {
        // ResizeObserver 측정 전 초기 추정값
        h = 140;
        h += Math.ceil((note.title?.length || 0) / 35) * 28;
        if (note.content) h += Math.min(Math.ceil(note.content.length / 55), 8) * 20;
        h += (note.comment_count || 0) * 50;
      }
      const shortestCol = heights.indexOf(Math.min(...heights));
      cols[shortestCol].push(note);
      heights[shortestCol] += h;
    }
    return cols;
  }, [filteredNotes, columnCount, hasWriteAccess, noteHeights]);

  if (isLoading) {
    return (
      <Layout>
        <div className="min-h-full bg-background flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!board) {
    return (
      <Layout>
        <div className="min-h-full bg-background">
          <main className="container mx-auto px-0 sm:px-0 py-0 sm:py-0">
            <div className="text-center py-12">
              <p className="text-muted-foreground">보드를 찾을 수 없습니다.</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => navigate('/student-collab')}
              >
                보드 목록으로 돌아가기
              </Button>
            </div>
          </main>
        </div>
      </Layout>
    );
  }

  return (
    <Layout fullWidth>
      <div className="min-h-full bg-slate-50/50 relative">
        <div className="absolute inset-0 z-0 opacity-[0.4] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
        <div className="relative z-10">
          <div className="p-4 sm:p-6 sticky top-0 z-50 pointer-events-none">
            <div className="pointer-events-auto">
              <BoardHeader
                mode="detail"
                title={board.title}
                boardId={board.id}
                memberCount={board.members?.length || 0}
                archivedCount={archivedNoteCount}
                showArchived={showArchivedNotes}
                onToggleArchived={() => setShowArchivedNotes(!showArchivedNotes)}
                onBack={() => navigate('/student-collab')}
                onMembersClick={() => setMembersDialogOpen(true)}
                filterSlot={
                  <NoteColorLegend
                    palette={palette}
                    counts={colorCounts}
                    totalCount={scopedNotes.length}
                    selected={selectedColor}
                    onSelect={setSelectedColor}
                    canManage={canManage}
                    onManage={() => setPaletteDialogOpen(true)}
                  />
                }
                onAddNote={() => setShowAddNote(true)}
                isOwner={canManage}
                hasWriteAccess={hasWriteAccess}
              />
            </div>
          </div>

          <main className="px-4 sm:px-6 pb-24 md:pb-6">
            <div
              className="flex items-start gap-4 sm:gap-6"
              style={{
                opacity: isLayoutReady ? 1 : 0,
                transition: isLayoutReady ? 'opacity 0.15s ease' : 'none',
              }}
            >
              {noteColumns.map((colNotes, colIndex) => (
                <div key={colIndex} className="flex-1 min-w-0 flex flex-col gap-4 sm:gap-6">
                  {/* 첫 번째 컬럼에만 새 노트 만들기 카드 표시 */}
                  {colIndex === 0 && hasWriteAccess && (
                    showAddNote ? (
                      <StudentAddNoteCard boardId={id!} palette={palette} onClose={() => setShowAddNote(false)} />
                    ) : (
                      <ImprovedCard
                        className="hidden sm:block cursor-pointer hover:shadow-xl transition-all duration-200 border-2 border-dashed border-muted-foreground/25 hover:border-muted-foreground/50"
                        onClick={() => setShowAddNote(true)}
                      >
                        <CardContent className="flex flex-col items-center justify-center h-full min-h-[320px] p-6 w-full">
                          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 mb-4 hover:from-gray-200 hover:to-gray-300 transition-all">
                            <Plus className="h-8 w-8 text-gray-600" />
                          </div>
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">새 노트 만들기</h3>
                          <p className="text-sm text-muted-foreground text-center">
                            아이디어나 업무를 노트로 추가하세요
                          </p>
                        </CardContent>
                      </ImprovedCard>
                    )
                  )}
                  {colNotes.map((note) => (
                    <div key={note.id} ref={(el) => setNoteRef(note.id, el)}>
                      <StudentStickyNote
                        noteId={note.id}
                        boardId={id!}
                        color={note.color}
                        title={note.title}
                        content={note.content}
                        author={note.author?.name || "알 수 없음"}
                        isPinned={note.is_pinned}
                        isArchived={note.is_archived}
                        canDelete={note.author_id === resourceId}
                        hasWriteAccess={hasWriteAccess}
                        palette={palette}
                        note={{ author_id: note.author_id }}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </main>

          {/* 노트 색상 범례 설정 (보드 소유자·admin) */}
          <NotePaletteDialog
            boardId={board.id}
            boardTitle={board.title}
            palette={palette}
            usage={colorCounts}
            open={paletteDialogOpen}
            onOpenChange={setPaletteDialogOpen}
          />

          {/* 멤버 관리 다이얼로그 */}
          <BoardMembersDialog
            open={membersDialogOpen}
            onOpenChange={setMembersDialogOpen}
            boardId={board.id}
            boardTitle={board.title}
            members={board.members || []}
            isOwner={canManage}
            audience="student"
          />
        </div>
      </div>
    </Layout>
  );
}
