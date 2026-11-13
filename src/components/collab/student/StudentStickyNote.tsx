import { PretextContent } from '@/components/ui/PretextContent';
import {
  MoreVertical,
  User,
  Pin,
  Trash2,
  X,
  Edit,
  Send,
  Archive,
  ArchiveRestore,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NoteColorPicker } from "@/components/collab/NoteColorPicker";
import {
  DEFAULT_NOTE_PALETTE,
  normalizeNoteColor,
  resolveNoteColorStyle,
  type NotePaletteEntry,
} from "@/lib/collabNoteColors";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDropdownDialog } from "@/hooks/useDropdownDialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  useDeleteNote,
  useToggleNotePin,
  useUpdateNote,
  useCreateComment,
  useUpdateComment,
  useDeleteComment,
  useArchiveNote,
  useUnarchiveNote,
  CollabNoteComment,
} from "@/hooks/useCollabNotes";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { useCurrentResourceId } from "@/hooks/useCurrentResourceId";
import { MentionInput } from "../MentionInput";
import { MentionText } from "../MentionText";

export interface StudentStickyNoteProps {
  noteId: string;
  boardId: string;
  color: string;
  title: string;
  content: string;
  author: string;
  isPinned?: boolean;
  isArchived?: boolean;
  canDelete?: boolean;
  hasWriteAccess?: boolean;
  /** 보드가 정한 색 목록. 교사 화면과 **같은 값**이어야 한다 — 갈라지면 같은 보드가 화면마다 다른 색 목록을 낸다 */
  palette?: NotePaletteEntry[];
  note?: { author_id?: string };
}

export function StudentStickyNote({
  noteId,
  boardId,
  color,
  title,
  content,
  author,
  isPinned = false,
  isArchived = false,
  canDelete = false,
  hasWriteAccess = true,
  palette = DEFAULT_NOTE_PALETTE,
  note: _note, // note: API-surface parity; not used by student card
}: StudentStickyNoteProps): JSX.Element {
  const { mutate: deleteNote } = useDeleteNote();
  const { mutate: togglePin } = useToggleNotePin();
  const { mutate: updateNote } = useUpdateNote();
  const { mutate: createComment } = useCreateComment();
  const { mutate: updateComment } = useUpdateComment();
  const { mutate: deleteComment } = useDeleteComment();
  const { mutate: archiveNote } = useArchiveNote();
  const { mutate: unarchiveNote } = useUnarchiveNote();
  const { toast } = useToast();
  const { data: currentResourceId } = useCurrentResourceId();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const { triggerDialog, dropdownContentProps } = useDropdownDialog();

  const [noteComments, setNoteComments] = useState<CollabNoteComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentContent, setEditingCommentContent] = useState("");
  const [updating, setUpdating] = useState(false);

  // 수정용 상태
  const [editTitle, setEditTitle] = useState(title);
  const [editContent, setEditContent] = useState(content);
  const [editColor, setEditColor] = useState(color);

  // 색 판정은 교사용과 같은 단일 출처를 쓴다(@/lib/collabNoteColors).
  const colorStyle = resolveNoteColorStyle(color);

  // props 변경 시 수정용 상태 업데이트
  useEffect(() => {
    setEditTitle(title);
    setEditContent(content);
    setEditColor(color);
  }, [title, content, color]);

  // 댓글 목록 조회 — single helper used by both initial load and post-mutation refresh
  const refreshComments = useCallback(async () => {
    const { data, error } = await supabase
      .from('collab_note_comments')
      .select(`
        *,
        resource:author_id(id, name)
      `)
      .eq('note_id', noteId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      // 조인 별칭(resource)을 author 로 옮겨 담는다. 캐스팅 대신 구조분해를 쓰면
      // 나머지(comment)가 이미 CollabNoteComment 라 결과 타입이 저절로 맞는다.
      setNoteComments(
        data.map((row: CollabNoteComment & { resource: CollabNoteComment['author'] | null }) => {
          const { resource, ...comment } = row;
          return { ...comment, author: resource ?? undefined };
        })
      );
    }
  }, [noteId]);

  useEffect(() => {
    refreshComments();
  }, [refreshComments]);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("이 노트를 삭제하시겠습니까?")) {
      deleteNote(
        { noteId, boardId },
        {
          onSuccess: () => {
          },
          onError: (error) => {
            toast({
              title: "노트 삭제 실패",
              description: error.message || "노트를 삭제하는 중 오류가 발생했습니다.",
              variant: "destructive",
            });
          },
        }
      );
    }
  };

  const handleTogglePin = (e: React.MouseEvent) => {
    e.stopPropagation();
    togglePin({ noteId, isPinned: !isPinned });
  };

  const handleOpenEditDialog = () => {
    triggerDialog(() => setEditDialogOpen(true));
  };

  const handleArchiveNote = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`"${title}" 노트를 아카이브하시겠습니까?\n\n아카이브된 노트는 아카이브 보기에서 확인할 수 있습니다.`)) {
      archiveNote(noteId, {
        onSuccess: () => {
          toast({
            title: "노트 아카이브 완료",
            description: "노트가 아카이브되었습니다.",
          });
        },
        onError: (error) => {
          toast({
            title: "노트 아카이브 실패",
            description: error.message || "노트를 아카이브하는 중 오류가 발생했습니다.",
            variant: "destructive",
          });
        },
      });
    }
  };

  const handleUnarchiveNote = (e: React.MouseEvent) => {
    e.stopPropagation();
    unarchiveNote(noteId, {
      onSuccess: () => {
        toast({
          title: "노트 복원 완료",
          description: "노트가 복원되었습니다.",
        });
      },
      onError: (error) => {
        toast({
          title: "노트 복원 실패",
          description: error.message || "노트를 복원하는 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      },
    });
  };

  const handleUpdateNote = () => {
    if (!editTitle.trim()) {
      toast({
        title: "입력 오류",
        description: "노트 제목을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (!editContent.trim()) {
      toast({
        title: "입력 오류",
        description: "노트 내용을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    setUpdating(true);

    updateNote(
      {
        noteId,
        input: {
          title: editTitle.trim(),
          content: editContent.trim(),
          color: normalizeNoteColor(editColor),
        },
      },
      {
        onSuccess: () => {
          toast({
            title: "노트 수정 완료",
            description: "노트가 성공적으로 수정되었습니다.",
          });
          setEditDialogOpen(false);
        },
        onError: (error) => {
          toast({
            title: "노트 수정 실패",
            description: error.message || "노트를 수정하는 중 오류가 발생했습니다.",
            variant: "destructive",
          });
        },
        onSettled: () => {
          setUpdating(false);
        },
      }
    );
  };

  const handleSubmitComment = () => {
    if (!hasWriteAccess) {
      toast({
        title: "권한 없음",
        description: "이 보드는 부분 공개 보드입니다. 멤버만 댓글을 작성할 수 있습니다.",
        variant: "destructive",
      });
      return;
    }

    if (!newComment.trim()) {
      toast({
        title: "입력 오류",
        description: "댓글 내용을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    setSubmittingComment(true);

    createComment(
      {
        noteId,
        content: newComment.trim(),
      },
      {
        onSuccess: () => {
          setNewComment("");
          refreshComments();
        },
        onError: (error) => {
          toast({
            title: "댓글 추가 실패",
            description: error.message || "댓글을 추가하는 중 오류가 발생했습니다.",
            variant: "destructive",
          });
        },
        onSettled: () => {
          setSubmittingComment(false);
        },
      }
    );
  };

  const handleDeleteComment = (commentId: string) => {
    if (confirm("이 댓글을 삭제하시겠습니까?")) {
      deleteComment(
        { commentId, noteId },
        {
          onSuccess: () => {
            refreshComments();
          },
          onError: (error) => {
            toast({
              title: "댓글 삭제 실패",
              description: error.message || "댓글을 삭제하는 중 오류가 발생했습니다.",
              variant: "destructive",
            });
          },
        }
      );
    }
  };

  const handleEditComment = (commentId: string, commentContent: string) => {
    setEditingCommentId(commentId);
    setEditingCommentContent(commentContent);
  };

  const handleSaveEditComment = () => {
    if (!editingCommentId || !editingCommentContent.trim()) return;

    updateComment(
      {
        commentId: editingCommentId,
        noteId,
        content: editingCommentContent.trim(),
      },
      {
        onSuccess: () => {
          setEditingCommentId(null);
          setEditingCommentContent("");
          refreshComments();
        },
        onError: (error) => {
          toast({
            title: "댓글 수정 실패",
            description: error.message || "댓글을 수정하는 중 오류가 발생했습니다.",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div
      style={{
        background: colorStyle.background,
        color: colorStyle.text,
        borderColor: colorStyle.border,
      }}
      className={`border rounded-3xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_10px_32px_rgba(0,0,0,0.13),0_2px_8px_rgba(0,0,0,0.06)] transition-all duration-300 hover:-translate-y-2 cursor-pointer min-h-[220px] flex flex-col relative group overflow-hidden ${isArchived ? 'opacity-60 grayscale' : ''
        }`}
    >
      {isPinned && (
        <div className="absolute top-3 left-3 h-7 w-7 rounded-full bg-black/15 backdrop-blur-sm flex items-center justify-center shadow-sm">
          <Pin className="h-3.5 w-3.5 fill-current" />
        </div>
      )}

      {canDelete && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3 h-8 w-8 text-gray-700 hover:bg-black/10"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()} {...dropdownContentProps}>
            <DropdownMenuItem onSelect={handleOpenEditDialog}>
              <Edit className="h-4 w-4 mr-2" />
              노트 수정
            </DropdownMenuItem>
            {isArchived ? (
              <DropdownMenuItem onClick={handleUnarchiveNote}>
                <ArchiveRestore className="h-4 w-4 mr-2" />
                아카이브 해제
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={handleArchiveNote}>
                <Archive className="h-4 w-4 mr-2" />
                아카이브에 저장
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              노트 삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <div className="flex-1">
        <h3 className={`font-sans font-semibold text-lg mb-2.5 text-slate-800 leading-snug tracking-tight ${isPinned ? "pl-10" : "pr-8"}`}>
          {title}
        </h3>
        <PretextContent content={content} className="text-sm text-slate-700 font-medium opacity-90" />

        {/* 댓글 섹션 */}
        <div className="mt-4 pt-4 border-t border-slate-900/10 space-y-3">
          {/* 댓글 목록 */}
          {noteComments.length > 0 && (
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {noteComments.map((comment) => (
                <div
                  key={comment.id}
                  className="p-2.5 rounded-2xl bg-white/55 backdrop-blur-md space-y-1.5 shadow-sm ring-1 ring-inset ring-white/60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-5 rounded-full bg-slate-200/50 flex items-center justify-center flex-shrink-0 text-slate-500">
                        <User className="h-2.5 w-2.5" />
                      </div>
                      <span className="text-xs font-semibold text-slate-700">{comment.author?.name || "알 수 없음"}</span>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {new Date(comment.created_at).toLocaleString('ko-KR', {
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    {currentResourceId === comment.author_id && (
                      <div className="flex items-center gap-0.5">
                        {editingCommentId === comment.id ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSaveEditComment();
                              }}
                              className="h-5 w-5 hover:bg-green-500/20 hover:text-green-700"
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingCommentId(null);
                                setEditingCommentContent("");
                              }}
                              className="h-5 w-5 hover:bg-slate-500/20 hover:text-slate-700"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditComment(comment.id, comment.content);
                              }}
                              className="h-5 w-5 hover:bg-blue-500/20 hover:text-blue-700"
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteComment(comment.id);
                              }}
                              className="h-5 w-5 hover:bg-red-500/20 hover:text-red-700"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  {editingCommentId === comment.id ? (
                    <div className="pl-7 flex">
                      <MentionInput
                        value={editingCommentContent}
                        onChange={setEditingCommentContent}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSaveEditComment();
                          }
                        }}
                        onEscape={() => {
                          setEditingCommentId(null);
                          setEditingCommentContent("");
                        }}
                        autoFocus
                        className="h-7 text-xs bg-white/80 border-blue-300 focus:border-blue-400 rounded-lg"
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-slate-700 leading-relaxed pl-7">
                      <MentionText content={comment.content} />
                      {comment.updated_at && comment.updated_at !== comment.created_at && (
                        <span className="text-[10px] text-slate-400 ml-1">(수정됨)</span>
                      )}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 댓글 입력 - 쓰기 권한이 있을 때만 표시 */}
          {hasWriteAccess && (
            <div className="flex gap-2 items-center">
              <MentionInput
                placeholder="댓글 달기... (@이름으로 학생 멘션)"
                value={newComment}
                onChange={setNewComment}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitComment();
                  }
                }}
                disabled={submittingComment}
                className="h-9 text-xs bg-white/50 border-white/40 focus:bg-white/80 focus:border-slate-300 transition-all rounded-full px-4 placeholder:text-slate-400"
              />
              <Button
                size="icon"
                className="h-9 w-9 rounded-full bg-slate-800 hover:bg-slate-700 text-white shadow-sm flex-shrink-0"
                disabled={!newComment.trim() || submittingComment}
                onClick={handleSubmitComment}
              >
                {submittingComment ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5 ml-0.5" />
                )}
              </Button>
            </div>
          )}
          {!hasWriteAccess && (
            <div className="text-center py-2 px-3 rounded-lg bg-blue-50/50 border border-blue-200/50">
              <p className="text-xs text-blue-700 font-medium">
                이 보드는 부분 공개입니다. 멤버만 댓글을 작성할 수 있습니다.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 pt-3.5 border-t border-black/[0.07] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-black/10 flex items-center justify-center">
            <User className="h-4 w-4" />
          </div>
          <span className="text-xs font-medium opacity-75">{author}</span>
          {isArchived && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 text-xs font-medium">
              <Archive className="h-3 w-3" />
              아카이브됨
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Pin button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleTogglePin}
            className={`h-7 w-7 hover:bg-black/10 ${isPinned ? "text-gray-900 bg-black/20" : "text-gray-700"}`}
          >
            <Pin className={`h-4 w-4 ${isPinned ? "fill-current" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Edit Note Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent mobile="fullscreen" className="sm:max-w-[500px]" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>노트 수정</DialogTitle>
            <DialogDescription>
              노트의 제목, 내용, 색상을 수정하세요
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Title Input */}
            <div className="space-y-2">
              <Label htmlFor="edit-title">제목 *</Label>
              <Input
                id="edit-title"
                placeholder="노트 제목을 입력하세요..."
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                disabled={updating}
              />
            </div>

            {/* Content Input */}
            <div className="space-y-2">
              <Label htmlFor="edit-content">내용 *</Label>
              <Textarea
                id="edit-content"
                placeholder="무엇을 생각하고 계신가요..."
                rows={4}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                disabled={updating}
              />
            </div>

            {/* Color Selection */}
            <div className="space-y-2">
              <Label>색상</Label>
              <NoteColorPicker
                palette={palette}
                value={editColor}
                onChange={setEditColor}
                disabled={updating}
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleUpdateNote}
                disabled={updating}
                className="flex-1"
              >
                {updating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {updating ? "수정 중..." : "수정"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setEditDialogOpen(false);
                  setEditTitle(title);
                  setEditContent(content);
                  setEditColor(color);
                }}
                disabled={updating}
              >
                취소
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
