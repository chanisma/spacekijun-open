import { useState } from "react";
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
import { useCreateBoard, useCollabBoards, type BoardVisibility } from "@/hooks/useCollabBoards";
import { BoardCategorySelect } from "@/components/collab/BoardCategorySelect";
import { categoryNames } from "@/lib/collabCategories";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Globe, Eye, Lock } from "lucide-react";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";

interface CreateBoardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * 멤버 초대 selector의 대상 청중.
   * - teacher(기본): 교사·학생 모두 + 태그·반·수업 그룹 검색 전부
   * - student: 학생 중심 + 반·수업 그룹 검색만 (태그 검색 제외)
   */
  audience?: "teacher" | "student";
}

export function CreateBoardDialog({ open, onOpenChange, audience = "teacher" }: CreateBoardDialogProps) {
  const isStudentAudience = audience === "student";
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedColor, setSelectedColor] = useState("blue");
  const [visibility, setVisibility] = useState<BoardVisibility>("public");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [category, setCategory] = useState<string | null>(null);

  const { mutate: createBoard, isPending } = useCreateBoard();
  /**
   * 카테고리 선택지는 **내가 받아본 보드 전부**에서 유도한다(목록 화면의
   * 접근 필터를 적용하기 전). 다른 사람이 만든 이름도 고를 수 있어야 한다는
   * 요구 때문이고, 같은 캐시(`['collab-boards']`)라 추가 왕복이 없다.
   */
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast({
        title: "입력 오류",
        description: "보드 제목을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    // SearchableMultiSelect의 값은 resource.id(UUID)다. 교직원·학생 모두 동일.
    // ALL_*/TAG_* 일괄 옵션 토큰만 제거하고 개별 resource id를 그대로 전달한다.
    const memberIds = selectedMembers.filter(
      (id) => !id.startsWith("ALL_") && !id.startsWith("TAG_")
    );

    createBoard(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        color: selectedColor,
        visibility: visibility,
        category,
        member_ids: memberIds.length > 0 ? memberIds : undefined,
      },
      {
        onSuccess: () => {
          setTitle("");
          setDescription("");
          setSelectedColor("blue");
          setVisibility("public");
          setSelectedMembers([]);
          setCategory(null);
          onOpenChange(false);
        },
        onError: (error) => {
          toast({
            title: "보드 생성 실패",
            description: error.message || "보드를 생성하는 중 오류가 발생했습니다.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleCancel = () => {
    setTitle("");
    setDescription("");
    setSelectedColor("blue");
    setVisibility("public");
    setSelectedMembers([]);
    setCategory(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        DialogContent 에 overflow 를 주지 않는다 — usePortalContainer 가 팝오버·셀렉트를
        Content 안으로 포털하므로 여기 overflow 가 있으면 카테고리/멤버 드롭다운이
        모달 경계에서 잘린다(CLAUDE.md Gotchas). 모서리는 헤더/본문 라운딩으로 처리.
      */}
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col p-0 bg-white/90 backdrop-blur-md border-white/20 shadow-xl">
        <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0 bg-white/50 border-b border-gray-100/50 rounded-t-lg">
          <DialogTitle>새 보드 만들기</DialogTitle>
          <DialogDescription>
            팀원들과 협업할 새로운 보드를 생성하세요
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto px-6 pb-6 flex-1 rounded-b-lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">보드 제목 *</Label>
              <Input
                id="title"
                placeholder="예: 팀 프로젝트 회의"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">설명 (선택사항)</Label>
              <Textarea
                id="description"
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
              <p className="text-xs text-muted-foreground">
                목록에서 보드를 묶어 볼 때 씁니다. 없는 이름은 새로 만들 수 있고, 만든 이름은 다른 사람도 고를 수 있습니다.
              </p>
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
                  <RadioGroupItem value="public" id="public" className="mt-1" />
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="public" className="font-semibold cursor-pointer flex items-center gap-2 text-slate-800">
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
                  <RadioGroupItem value="read_only" id="read_only" className="mt-1" />
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="read_only" className="font-semibold cursor-pointer flex items-center gap-2 text-slate-800">
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
                  <RadioGroupItem value="private" id="private" className="mt-1" />
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="private" className="font-semibold cursor-pointer flex items-center gap-2 text-slate-800">
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

            {(visibility === 'read_only' || visibility === 'private') && (
              <div className="space-y-2">
                <Label htmlFor="members">멤버 초대 (선택사항)</Label>
                <SearchableMultiSelect
                  filterByTeacher={!isStudentAudience}
                  filterByStudent={true}
                  enableTagSearch={!isStudentAudience}
                  enableClassSearch={true}
                  enableCourseSearch={true}
                  selectedValues={selectedMembers}
                  onSelectionChange={setSelectedMembers}
                  placeholder={isStudentAudience ? "학생을 선택하세요" : "교사·학생을 선택하세요"}
                  searchPlaceholder="이름·태그·반(2-1)·수업명으로 검색..."
                  emptyText="검색 결과가 없습니다"
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  {visibility === 'read_only'
                    ? '초대된 멤버만 노트와 댓글을 작성할 수 있습니다.'
                    : '초대된 멤버만 보드에 접근할 수 있습니다.'}
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button
                type="submit"
                className="flex-1"
                disabled={isPending}
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                생성
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
