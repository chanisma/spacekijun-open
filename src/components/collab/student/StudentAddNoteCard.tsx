"use client";

import { Plus, Loader2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useCreateNote, useCollabNotes } from "@/hooks/useCollabNotes";
import { useToast } from "@/hooks/use-toast";
import { NoteColorPicker } from "@/components/collab/NoteColorPicker";
import {
  DEFAULT_NOTE_COLOR,
  DEFAULT_NOTE_PALETTE,
  normalizeNoteColor,
  type NotePaletteEntry,
} from "@/lib/collabNoteColors";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface StudentAddNoteCardProps {
  boardId: string;
  /** 보드가 정한 색 목록. 없으면 기본 7색 */
  palette?: NotePaletteEntry[];
  onClose: () => void;
}

export function StudentAddNoteCard({ boardId, onClose, palette = DEFAULT_NOTE_PALETTE }: StudentAddNoteCardProps): JSX.Element {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [selectedColor, setSelectedColor] = useState<string>(
    () => palette[0]?.color ?? DEFAULT_NOTE_COLOR,
  );
  const [selectedNoteId, setSelectedNoteId] = useState<string>("");
  const [showCopySelector, setShowCopySelector] = useState(false);

  const { mutate: createNote, isPending } = useCreateNote();
  const { data: notes = [] } = useCollabNotes(boardId);
  const { toast } = useToast();

  // 복사할 수 있는 노트 목록 (아카이브 제외)
  const copyableNotes = notes.filter((note) => !note.is_archived);

  // 노트 복사 핸들러 (텍스트 prefill만)
  const handleCopyNote = (noteId: string) => {
    const selectedNote = notes.find((note) => note.id === noteId);
    if (!selectedNote) return;

    setTitle(selectedNote.title);
    setContent(selectedNote.content);
    setSelectedColor(normalizeNoteColor(selectedNote.color));

    toast({
      title: "노트 복사 완료",
      description: "노트 내용이 입력창에 로드되었습니다. 수정 후 생성하세요.",
    });
  };

  const handleSubmit = () => {
    if (!title.trim()) {
      toast({
        title: "입력 오류",
        description: "노트 제목을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (!content.trim()) {
      toast({
        title: "입력 오류",
        description: "노트 내용을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    createNote(
      {
        board_id: boardId,
        title: title.trim(),
        content: content.trim(),
        color: normalizeNoteColor(selectedColor),
        card_type: "default",
        card_data: null,
      },
      {
        onSuccess: () => {
          setTitle("");
          setContent("");
          setSelectedColor(palette[0]?.color ?? DEFAULT_NOTE_COLOR);
          setSelectedNoteId("");
          onClose();
        },
        onError: (error) => {
          toast({
            title: "노트 생성 실패",
            description: error.message || "노트를 생성하는 중 오류가 발생했습니다.",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-[360px] sm:min-h-[420px] rounded-3xl border border-gray-200/80 bg-white/90 backdrop-blur-sm shadow-[0_2px_12px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_28px_rgba(0,0,0,0.10)] transition-all duration-300 p-5 flex flex-col gap-4 ring-1 ring-inset ring-white/60">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
          </div>
          <span className="font-semibold text-xs sm:text-sm text-muted-foreground">새 노트</span>
        </div>
        {copyableNotes.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowCopySelector(!showCopySelector)}
            className="h-7 w-7 sm:h-8 sm:w-8"
            title="기존 노트에서 복사"
          >
            <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Button>
        )}
      </div>

      {/* Copy Note Selector */}
      {showCopySelector && copyableNotes.length > 0 && (
        <div className="space-y-1.5 sm:space-y-2 p-2.5 sm:p-3 rounded-lg bg-muted/50 border border-border">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
            <label className="text-xs font-medium text-muted-foreground">기존 노트에서 복사</label>
          </div>
          <Select
            value={selectedNoteId}
            onValueChange={(value) => {
              setSelectedNoteId(value);
              handleCopyNote(value);
            }}
            disabled={isPending}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="복사할 노트를 선택하세요..." />
            </SelectTrigger>
            <SelectContent>
              {copyableNotes.map((note) => (
                <SelectItem key={note.id} value={note.id}>
                  <span className="truncate">{note.title}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Title Input */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">제목 *</label>
        <input
          type="text"
          placeholder="노트 제목을 입력하세요..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={isPending}
          className="w-full px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg bg-background border border-border focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-xs sm:text-sm font-medium placeholder:text-muted-foreground/50"
        />
      </div>

      {/* Content Input */}
      <div className="space-y-1 flex-1">
        <label className="text-xs font-medium text-muted-foreground">내용 *</label>
        <textarea
          placeholder="무엇을 생각하고 계신가요..."
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={isPending}
          className="w-full px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg bg-background border border-border focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-xs sm:text-sm resize-none placeholder:text-muted-foreground/50"
        />
      </div>

      {/* Color Selection */}
      <div className="space-y-1.5 sm:space-y-2">
        <label className="text-xs font-medium text-muted-foreground">색상</label>
        <NoteColorPicker
          palette={palette}
          value={selectedColor}
          onChange={setSelectedColor}
          disabled={isPending}
          size="sm"
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-1.5 sm:gap-2 pt-1 sm:pt-2">
        <Button
          className="flex-1"
          size="sm"
          onClick={handleSubmit}
          disabled={isPending}
        >
          {isPending && <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 animate-spin" />}
          {!isPending && <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />}
          <span className="text-xs sm:text-sm">노트 생성</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="px-2.5 sm:px-3 bg-transparent"
          onClick={onClose}
          disabled={isPending}
        >
          <span className="text-xs sm:text-sm">취소</span>
        </Button>
      </div>
    </div>
  );
}
