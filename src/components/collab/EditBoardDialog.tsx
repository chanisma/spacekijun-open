import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useUpdateBoard, useCollabBoards, CollabBoard, type BoardVisibility } from "@/hooks/useCollabBoards";
import { BoardCategorySelect } from "@/components/collab/BoardCategorySelect";
import { categoryNames, parseBoardCategory } from "@/lib/collabCategories";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Globe, Eye, Lock } from "lucide-react";

interface EditBoardDialogProps {
  board: CollabBoard | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditBoardDialog({ board, open, onOpenChange }: EditBoardDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedColor, setSelectedColor] = useState("blue");
  const [visibility, setVisibility] = useState<BoardVisibility>("public");
  const [category, setCategory] = useState<string | null>(null);

  const { mutate: updateBoard, isPending } = useUpdateBoard();
  // 선택지는 내가 받아본 보드 전부에서 — 남이 만든 이름도 고를 수 있어야 한다.
  const { data: allBoards = [] } = useCollabBoards();
  const categoryOptions = categoryNames(allBoards);
  const { toast } = useToast();

  const colors = [
    { name: "blue", class: "bg-blue-500" },
    { name: "purple", class: "bg-purple-500" },
    { name: "pink", class: "bg-pink-500" },
    { name: "orange", class: "bg-orange-500" },
    { name: "green", class: "bg-green-500" },
    { name: "yellow", class: "bg-yellow-500" },
  ];

  // 보드 데이터가 변경되면 폼 초기화
  useEffect(() => {
    if (board) {
      setTitle(board.title);
      setDescription(board.description || "");
      setSelectedColor(board.color);
      setVisibility(board.visibility);
      setCategory(parseBoardCategory(board.meta));
    }
  }, [board]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!board) return;

    if (!title.trim()) {
      toast({
        title: "입력 오류",
        description: "보드 제목을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    updateBoard(
      {
        boardId: board.id,
        input: {
          title: title.trim(),
          description: description.trim() || undefined,
          color: selectedColor,
          visibility: visibility,
          // null 을 그대로 보낸다 = "카테고리 지움". undefined 였다면 meta 를
          // 건드리지 않는다는 뜻이라 지우기가 불가능해진다.
          category,
        },
      },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
        onError: (error) => {
          toast({
            title: "보드 수정 실패",
            description: error.message || "보드를 수정하는 중 오류가 발생했습니다.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleCancel = () => {
    if (board) {
      setTitle(board.title);
      setDescription(board.description || "");
      setSelectedColor(board.color);
      setVisibility(board.visibility);
      setCategory(parseBoardCategory(board.meta));
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* DialogContent 에 overflow 금지 — 안쪽 팝오버가 잘린다(CLAUDE.md Gotchas) */}
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col p-0 bg-white/90 backdrop-blur-md border-white/20 shadow-xl">
        <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0 bg-white/50 border-b border-gray-100/50 rounded-t-lg">
          <DialogTitle>보드 수정</DialogTitle>
          <DialogDescription>
            보드의 정보를 수정하세요
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto px-6 pb-6 flex-1 rounded-b-lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">보드 제목 *</Label>
              <Input
                id="edit-title"
                placeholder="예: 팀 프로젝트 회의"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">설명 (선택사항)</Label>
              <Textarea
                id="edit-description"
                placeholder="보드에 대한 간단한 설명을 입력하세요"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label>카테고리 (선택사항)</Label>
              <BoardCategorySelect
                options={categoryOptions}
                value={category}
                onChange={setCategory}
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">보드 색상</Label>
              <div className="flex gap-3 justify-start py-1">
                {colors.map((color) => (
                  <button
                    key={color.name}
                    type="button"
                    onClick={() => setSelectedColor(color.name)}
                    className={`relative h-8 w-8 rounded-full transition-all duration-200 hover:scale-110 shadow-sm ${color.class} ${selectedColor === color.name
                        ? "ring-2 ring-offset-2 ring-slate-400 scale-110"
                        : "hover:shadow-md"
                      }`}
                    title={color.name}
                    disabled={isPending}
                  >
                    {selectedColor === color.name && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-2.5 h-2.5 bg-white rounded-full shadow-sm" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-medium text-slate-700">보드 공개 설정</Label>
              <RadioGroup value={visibility} onValueChange={(value) => setVisibility(value as BoardVisibility)} disabled={isPending} className="grid grid-cols-1 gap-3">
                <div className={`relative flex items-start space-x-3 rounded-xl border p-4 transition-all cursor-pointer ${visibility === 'public'
                    ? 'bg-emerald-50/50 border-emerald-200 ring-1 ring-emerald-200'
                    : 'bg-white/40 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                  }`}>
                  <RadioGroupItem value="public" id="edit-public" className="mt-1" />
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="edit-public" className="font-semibold cursor-pointer flex items-center gap-2 text-slate-800">
                      <Globe className={`h-4 w-4 ${visibility === 'public' ? 'text-emerald-600' : 'text-slate-500'}`} />
                      전체 공개
                    </Label>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      모든 사용자가 보드를 보고 노트와 댓글을 작성할 수 있습니다.
                    </p>
                  </div>
                </div>

                <div className={`relative flex items-start space-x-3 rounded-xl border p-4 transition-all cursor-pointer ${visibility === 'read_only'
                    ? 'bg-blue-50/50 border-blue-200 ring-1 ring-blue-200'
                    : 'bg-white/40 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                  }`}>
                  <RadioGroupItem value="read_only" id="edit-read_only" className="mt-1" />
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="edit-read_only" className="font-semibold cursor-pointer flex items-center gap-2 text-slate-800">
                      <Eye className={`h-4 w-4 ${visibility === 'read_only' ? 'text-blue-600' : 'text-slate-500'}`} />
                      부분 공개
                    </Label>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      모든 사용자가 보드를 볼 수 있지만, 멤버만 작성할 수 있습니다.
                    </p>
                  </div>
                </div>

                <div className={`relative flex items-start space-x-3 rounded-xl border p-4 transition-all cursor-pointer ${visibility === 'private'
                    ? 'bg-red-50/50 border-red-200 ring-1 ring-red-200'
                    : 'bg-white/40 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                  }`}>
                  <RadioGroupItem value="private" id="edit-private" className="mt-1" />
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="edit-private" className="font-semibold cursor-pointer flex items-center gap-2 text-slate-800">
                      <Lock className={`h-4 w-4 ${visibility === 'private' ? 'text-red-600' : 'text-slate-500'}`} />
                      비공개
                    </Label>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      초대된 멤버만 보드를 보고 작성할 수 있습니다.
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                type="submit"
                className="flex-1"
                disabled={isPending}
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                수정
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isPending}
              >
                취소
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
