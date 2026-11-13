import { PretextContent } from '@/components/ui/PretextContent';
import {
  MoreVertical,
  User,
  Pin,
  Paperclip,
  FileText,
  ImageIcon,
  File,
  Trash2,
  Upload,
  X,
  Edit,
  Send,
  Archive,
  ArchiveRestore,
  Link as LinkIcon,
  Puzzle,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  CollabNote,
} from "@/hooks/useCollabNotes";
import { useToast } from "@/hooks/use-toast";
import { NoteColorPicker } from "@/components/collab/NoteColorPicker";
import {
  DEFAULT_NOTE_PALETTE,
  normalizeNoteColor,
  resolveNoteColorStyle,
  type NotePaletteEntry,
} from "@/lib/collabNoteColors";
import { CombinedFileUpload, GoogleDriveFileInfo } from "@/components/ui/combined-file-upload";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { useQueryClient } from "@tanstack/react-query";
import { GoogleDriveIntegrationService } from "@/services/googleDriveIntegrationService";
import { Loader2 } from "lucide-react";
import { useCurrentResourceId } from "@/hooks/useCurrentResourceId";
import { MentionInput } from "./MentionInput";
import { MentionText } from "./MentionText";
import type { CardType } from "@/types/collabCardTypes";
import { CARD_TYPE_LABELS } from "@/types/collabCardTypes";
import { NoticeCardDisplay } from "@/components/collab/card-displays/NoticeCardDisplay";
import { isNoticeCardData } from "@/types/collabCardTypes";
import { LinkTaskDialog } from "@/components/collab/LinkTaskDialog";
import { LinkedItemsList } from "@/components/collab/LinkedItemsList";
import { NotePluginSelector } from "@/components/collab/NotePluginSelector";
import { usePluginInstances, useUpdatePluginInstance } from "@/hooks/usePlugins";
import { PluginRenderer } from "@/components/plugins/PluginRenderer";

interface StickyNoteProps {
  noteId: string;
  boardId: string;
  color: string;
  title: string;
  content: string;
  author: string;
  commentCount?: number;
  isAcknowledged?: boolean;
  isPinned?: boolean;
  isArchived?: boolean;
  attachments?: Array<{ name: string; type: "image" | "document" | "file" }>;
  comments?: Array<{ author: string; text: string }>;
  canDelete?: boolean;
  hasWriteAccess?: boolean;
  canManagePlugin?: boolean; // 플러그인 관리 권한
  /** 보드가 정한 색 목록. 없으면 기본 7색(= 팔레트 기능 이전과 동일) */
  palette?: NotePaletteEntry[];
  note?: {
    author_id?: string;
    // 정본은 useCollabNotes 의 CollabNote 다. 여기서 모양을 다시 적으면
    // linked_items 처럼 나중에 추가된 칸이 조용히 빠진다(실제로 그렇게 빠졌다).
    meta?: CollabNote['meta'];
  };
}


export function StickyNote({
  noteId,
  boardId,
  color,
  title,
  content,
  author,
  commentCount = 0,
  isAcknowledged = false,
  isPinned = false,
  isArchived = false,
  attachments = [],
  comments = [],
  canDelete = false,
  hasWriteAccess = true,
  canManagePlugin = false,
  palette = DEFAULT_NOTE_PALETTE,
  note,
}: StickyNoteProps) {
  const { mutate: deleteNote } = useDeleteNote();
  const { mutate: togglePin } = useToggleNotePin();
  const { mutate: updateNote } = useUpdateNote();
  const { mutate: createComment } = useCreateComment();
  const { mutate: updateComment } = useUpdateComment();
  const { mutate: deleteComment } = useDeleteComment();
  const { mutate: archiveNote } = useArchiveNote();
  const { mutate: unarchiveNote } = useUnarchiveNote();
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: currentResourceId } = useCurrentResourceId();
  const queryClient = useQueryClient();

  // Extract card type from note meta
  const cardType = (note?.meta?.card_type || 'default') as CardType;

  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const { triggerDialog, dropdownContentProps } = useDropdownDialog();
  const [localFiles, setLocalFiles] = useState<File[]>([]);
  const [googleDriveFiles, setGoogleDriveFiles] = useState<GoogleDriveFileInfo[]>([]);
  const [noteFiles, setNoteFiles] = useState<any[]>([]);
  const [noteComments, setNoteComments] = useState<CollabNoteComment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentContent, setEditingCommentContent] = useState("");
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [pluginDialogOpen, setPluginDialogOpen] = useState(false);

  // 플러그인 관련
  const { data: pluginInstances = [] } = usePluginInstances('collab_note', noteId);
  const updatePluginInstance = useUpdatePluginInstance();

  // 수정용 상태
  const [editTitle, setEditTitle] = useState(title);
  const [editContent, setEditContent] = useState(content);
  const [editColor, setEditColor] = useState(color);

  // 이름(레거시)이든 hex(팔레트)든 같은 결과를 내는 단일 출처.
  // Tailwind 임의 클래스는 빌드 때 스캔되므로 런타임 hex 에는 못 쓴다 → 인라인 style.
  const colorStyle = resolveNoteColorStyle(color);

  // props 변경 시 수정용 상태 업데이트
  useEffect(() => {
    setEditTitle(title);
    setEditContent(content);
    setEditColor(color);
  }, [title, content, color]);

  // 노트의 파일 목록 조회
  useEffect(() => {
    const fetchNoteFiles = async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('meta->>source_type', 'collab_note')
        .eq('meta->>source_id', noteId);

      if (!error && data) {
        setNoteFiles(data);
      }
    };

    fetchNoteFiles();
  }, [noteId]);

  // 댓글 목록 조회
  useEffect(() => {
    const fetchComments = async () => {
      const { data, error } = await supabase
        .from('collab_note_comments')
        .select(`
          *,
          resource:author_id(id, name)
        `)
        .eq('note_id', noteId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setNoteComments(data.map((comment: any) => ({
          ...comment,
          author: comment.resource,
        })));
      }
    };

    fetchComments();
  }, [noteId]);


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

  const handleOpenUploadDialog = (e: React.MouseEvent) => {
    e.stopPropagation();
    setUploadDialogOpen(true);
  };

  const handleOpenEditDialog = () => {
    triggerDialog(() => setEditDialogOpen(true));
  };

  const handleOpenLinkDialog = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLinkDialogOpen(true);
  };

  const handleOpenPluginDialog = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPluginDialogOpen(true);
  };

  const handlePluginAttached = () => {
    // 플러그인 인스턴스 쿼리 무효화 (즉시 업데이트)
    queryClient.invalidateQueries({
      queryKey: ['plugin-instances', 'collab_note', noteId]
    });
  };

  const handleSubmitComment = () => {
    // 권한 확인
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
          toast({
            title: "댓글 추가 완료",
            description: "댓글이 성공적으로 추가되었습니다.",
          });
          setNewComment("");
          // 댓글 목록 새로고침
          supabase
            .from('collab_note_comments')
            .select(`
              *,
              resource:author_id(id, name)
            `)
            .eq('note_id', noteId)
            .order('created_at', { ascending: true })
            .then(({ data }) => {
              if (data) {
                setNoteComments(data.map((comment: any) => ({
                  ...comment,
                  author: comment.resource,
                })));
              }
            });
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
            toast({
              title: "댓글 삭제 완료",
              description: "댓글이 삭제되었습니다.",
            });
            // 댓글 목록 새로고침
            supabase
              .from('collab_note_comments')
              .select(`
                *,
                resource:author_id(id, name)
              `)
              .eq('note_id', noteId)
              .order('created_at', { ascending: true })
              .then(({ data }) => {
                if (data) {
                  setNoteComments(data.map((comment: any) => ({
                    ...comment,
                    author: comment.resource,
                  })));
                }
              });
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

  const handleEditComment = (commentId: string, content: string) => {
    setEditingCommentId(commentId);
    setEditingCommentContent(content);
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
          // 댓글 목록 새로고침
          supabase
            .from('collab_note_comments')
            .select(`
              *,
              resource:author_id(id, name)
            `)
            .eq('note_id', noteId)
            .order('created_at', { ascending: true })
            .then(({ data }) => {
              if (data) {
                setNoteComments(data.map((comment: any) => ({
                  ...comment,
                  author: comment.resource,
                })));
              }
            });
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


  const handleUploadFiles = async () => {
    if (!user || (localFiles.length === 0 && googleDriveFiles.length === 0)) {
      return;
    }

    setUploading(true);

    try {
      // 보드 이름 조회
      const { data: boardData } = await supabase
        .from('collab_boards')
        .select('title')
        .eq('id', boardId)
        .single();

      const boardName = boardData?.title || '이름없는 보드';

      // 디렉토리 경로 생성: 년도/협업보드/보드명/노트제목
      const now = new Date();
      const year = now.getFullYear().toString();
      const directory_path = `${year}/협업보드/${boardName}/${title}`;

      // 로컬 파일 업로드
      for (const file of localFiles) {
        const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
        const uuid = crypto.randomUUID();
        const timestamp = Date.now();
        const fileName = `${timestamp}_${uuid}.${fileExt}`;
        const filePath = `collab_notes/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('kijunspace')
          .upload(filePath, file);

        if (uploadError) {
          console.error('파일 업로드 오류:', uploadError);
          continue;
        }

        const { data: urlData } = supabase.storage
          .from('kijunspace')
          .getPublicUrl(filePath);

        await supabase.from('documents').insert([{
          title: file.name.replace(/\.[^/.]+$/, ''),
          file_name: file.name,
          file_type: file.type || 'application/octet-stream',
          file_size: file.size,
          storage_path: urlData.publicUrl,
          upload_status: 'completed',
          user_id: user.id,
          meta: {
            source_type: 'collab_note',
            source_id: noteId,
            uploaded_from: 'collab_note',
            original_filename: file.name,
            storage_filename: fileName,
            upload_timestamp: new Date().toISOString(),
            file_extension: fileExt,
            feature: '협업보드',
            board_id: boardId,
            board_name: boardName,
            note_title: title,
            directory_path: directory_path,
            year: year
          }
        }]);
      }

      // Google Drive 파일 처리 (pending 파일은 실제 생성/업로드 후 등록)
      for (const gFile of googleDriveFiles) {
        const integrationOptions = {
          targetType: 'collab_note' as const,
          targetId: noteId,
          boardId: boardId
        };

        await GoogleDriveIntegrationService.processPendingAndRegister(gFile, integrationOptions);
      }

      toast({
        title: "파일 업로드 완료",
        description: "파일이 성공적으로 업로드되었습니다.",
      });

      // 파일 목록 새로고침
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('meta->>source_type', 'collab_note')
        .eq('meta->>source_id', noteId);

      if (!error && data) {
        setNoteFiles(data);
      }

      setLocalFiles([]);
      setGoogleDriveFiles([]);
      setUploadDialogOpen(false);
    } catch (error) {
      console.error('파일 업로드 중 오류:', error);
      toast({
        title: "업로드 실패",
        description: "파일 업로드 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFile = async (fileId: string, fileName: string, isGoogleDrive: boolean, storagePath: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm(`"${fileName}" 파일을 삭제하시겠습니까?`)) {
      return;
    }

    try {
      // Google Drive 파일인 경우 Drive에서도 삭제
      if (isGoogleDrive) {
        // documents 테이블에서 google_drive_id 가져오기
        const { data: doc } = await supabase
          .from('documents')
          .select('meta')
          .eq('id', fileId)
          .single();

        const googleDriveId = (doc?.meta as any)?.google_drive_id;

        if (googleDriveId) {
          try {
            // Google Drive에서 파일 삭제 (getGoogleDriveService 임포트 필요)
            const { getGoogleDriveService } = await import('@/services/googleDriveServiceNew');
            const driveService = getGoogleDriveService();

            // Google Drive 초기화 확인
            if (!(await driveService.isAuthenticated())) {
              console.log('⚠️ Google Drive 미연결 상태, 연결 시도 중...');
              await driveService.initialize();
              await driveService.signIn();

              if (!(await driveService.isAuthenticated())) {
                throw new Error('Google Drive 연결에 실패했습니다.');
              }
            }

            // Google Drive에서 파일 삭제
            await driveService.deleteFile(googleDriveId);
            console.log('✅ Google Drive에서 파일 삭제 완료:', googleDriveId);
          } catch (driveError: any) {
            console.error('❌ Google Drive 파일 삭제 실패:', driveError);

            // 파일이 이미 삭제된 경우는 무시
            if (!driveError.message?.includes('404') && !driveError.message?.includes('not found')) {
              throw new Error(`Google Drive 파일 삭제 실패: ${driveError.message}`);
            }
          }
        }
      } else if (storagePath) {
        // 일반 파일인 경우 스토리지에서 삭제
        const url = new URL(storagePath);
        const pathParts = url.pathname.split('/');
        const bucketIndex = pathParts.indexOf('kijunspace');
        if (bucketIndex !== -1) {
          const filePath = pathParts.slice(bucketIndex + 1).join('/');
          await supabase.storage.from('kijunspace').remove([filePath]);
        }
      }

      // documents 테이블에서 레코드 삭제
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', fileId);

      if (error) {
        throw error;
      }

      toast({
        title: "파일 삭제 완료",
        description: "파일이 성공적으로 삭제되었습니다.",
      });

      // 파일 목록 새로고침
      const { data, error: fetchError } = await supabase
        .from('documents')
        .select('*')
        .eq('meta->>source_type', 'collab_note')
        .eq('meta->>source_id', noteId);

      if (!fetchError && data) {
        setNoteFiles(data);
      }
    } catch (error) {
      console.error('파일 삭제 중 오류:', error);
      toast({
        title: "삭제 실패",
        description: "파일을 삭제하는 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
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
          {cardType !== 'default' && (
            <Badge variant="secondary" className="ml-2 text-xs font-normal">
              {CARD_TYPE_LABELS[cardType]}
            </Badge>
          )}
        </h3>
        <PretextContent content={content} className="text-sm text-slate-700 font-medium opacity-90" />

        {/* Card Type Specific Display */}
        {cardType === 'notice' && note?.meta?.card_data && isNoticeCardData(note.meta.card_data) && (
          <NoticeCardDisplay
            data={note.meta.card_data}
            noteId={noteId}
            boardId={boardId}
            currentResourceId={currentResourceId}
          />
        )}

        {/* Linked Items Display */}
        <LinkedItemsList
          noteId={noteId}
          boardId={boardId}
          linkedItems={note?.meta?.linked_items || []}
          canEdit={hasWriteAccess}
        />

        {/* Plugin Display */}
        {pluginInstances.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-medium opacity-75">
              <Puzzle className="h-3.5 w-3.5" />
              추가 기능
              <Badge variant="secondary" className="text-xs">{pluginInstances.length}개</Badge>
            </div>
            <div className="space-y-3">
              {pluginInstances.map((instance) => {
                return (
                  <PluginRenderer
                    key={instance.id}
                    pluginType={instance.plugin?.type || ''}
                    instance={instance}
                    entityId={noteId}
                    entityType="collab_note"
                    readonly={false}
                    onUpdate={async (data) => {
                      await updatePluginInstance.mutateAsync({
                        instanceId: instance.id,
                        data
                      });
                    }}
                  />
                );
              })}
            </div>
          </div>
        )}

        {noteFiles.length > 0 && (
          <div className="mt-4 space-y-2">
            {noteFiles.map((file) => {
              const isImage = file.file_type?.startsWith('image/');
              const isDocument = file.file_type?.includes('pdf') || file.file_type?.includes('document');
              const isGoogleDrive = file.meta?.is_google_drive_file || false;

              return (
                <div
                  key={file.id}
                  className="flex items-center gap-2 p-2 rounded-lg bg-white/50 hover:bg-white/80 border border-transparent hover:border-black/5 transition-all group/file"
                >
                  <a
                    href={file.storage_path}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-2 flex-1 min-w-0"
                  >
                    {isImage && <ImageIcon className="h-4 w-4 flex-shrink-0" />}
                    {isDocument && <FileText className="h-4 w-4 flex-shrink-0" />}
                    {!isImage && !isDocument && <File className="h-4 w-4 flex-shrink-0" />}
                    <span className="text-xs font-medium truncate">{file.file_name}</span>
                  </a>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => handleDeleteFile(file.id, file.file_name, isGoogleDrive, file.storage_path, e)}
                    className="h-6 w-6 opacity-0 group-hover/file:opacity-100 transition-opacity hover:bg-red-500/20 hover:text-red-700"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* 댓글 섹션 - 항상 표시 */}
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

          {/* File upload button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleOpenUploadDialog}
            className={`h-7 w-7 hover:bg-black/10 relative ${noteFiles.length > 0 ? "text-gray-900 bg-black/20" : "text-gray-700"}`}
          >
            <Paperclip className="h-4 w-4" />
            {noteFiles.length > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-black/30 text-[10px] font-bold flex items-center justify-center">
                {noteFiles.length}
              </span>
            )}
          </Button>

          {/* Link task/event button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleOpenLinkDialog}
            className={`h-7 w-7 hover:bg-black/10 relative ${(note?.meta?.linked_items?.length || 0) > 0 ? "text-gray-900 bg-black/20" : "text-gray-700"}`}
          >
            <LinkIcon className="h-4 w-4" />
            {(note?.meta?.linked_items?.length || 0) > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-black/30 text-[10px] font-bold flex items-center justify-center">
                {note.meta.linked_items.length}
              </span>
            )}
          </Button>

          {/* Plugin button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleOpenPluginDialog}
            className={`h-7 w-7 hover:bg-black/10 relative ${pluginInstances.length > 0 ? "text-gray-900 bg-black/20" : "text-gray-700"}`}
          >
            <Puzzle className="h-4 w-4" />
            {pluginInstances.length > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-black/30 text-[10px] font-bold flex items-center justify-center">
                {pluginInstances.length}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* File Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="sm:max-w-[600px]" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>파일 업로드</DialogTitle>
            <DialogDescription>
              로컬 파일 또는 Google Drive에서 파일을 선택하세요
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <CombinedFileUpload
              localFiles={localFiles}
              onLocalFilesChange={setLocalFiles}
              googleDriveFiles={googleDriveFiles}
              onGoogleDriveFilesChange={setGoogleDriveFiles}
              maxFileSize={5 * 1024 * 1024}
              maxFiles={10}
              disabled={uploading}
              showGoogleDrive={true}
            />

            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleUploadFiles}
                disabled={uploading || (localFiles.length === 0 && googleDriveFiles.length === 0)}
                className="flex-1"
              >
                {uploading && <Upload className="h-4 w-4 mr-2 animate-pulse" />}
                {uploading ? "업로드 중..." : "업로드"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setUploadDialogOpen(false);
                  setLocalFiles([]);
                  setGoogleDriveFiles([]);
                }}
                disabled={uploading}
              >
                취소
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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

      {/* Link Task Dialog */}
      <LinkTaskDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        noteId={noteId}
        boardId={boardId}
        existingLinks={note?.meta?.linked_items || []}
      />

      {/* Plugin Selector Dialog */}
      <NotePluginSelector
        open={pluginDialogOpen}
        onOpenChange={setPluginDialogOpen}
        noteId={noteId}
        boardId={boardId}
        onPluginAttached={handlePluginAttached}
        canManagePlugin={canManagePlugin}
      />
    </div>
  );
}
