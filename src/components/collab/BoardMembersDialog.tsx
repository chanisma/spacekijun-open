import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { useAddBoardMember, useRemoveBoardMember } from "@/hooks/useCollabBoards";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Crown, User, X, UserPlus, Loader2 } from "lucide-react";

interface BoardMember {
  id: string;
  role: 'owner' | 'editor' | 'viewer';
  created_at: string;
  resource: {
    id: string;
    name: string | null;
  };
}

interface BoardMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: string;
  boardTitle: string;
  members: BoardMember[];
  isOwner: boolean;
  /**
   * 멤버 추가 selector의 대상 청중.
   * - teacher(기본): 교사·학생 + 태그·반·수업 그룹 검색 전부
   * - student: 학생 중심 + 반·수업 그룹 검색만 (태그 검색 제외)
   */
  audience?: "teacher" | "student";
}

export function BoardMembersDialog({
  open,
  onOpenChange,
  boardId,
  boardTitle,
  members,
  isOwner,
  audience = "teacher",
}: BoardMembersDialogProps) {
  const isStudentAudience = audience === "student";
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [addingMembers, setAddingMembers] = useState(false);

  const { mutate: addMember } = useAddBoardMember();
  const { mutate: removeMember } = useRemoveBoardMember();
  const { toast } = useToast();

  const handleAddMembers = async () => {
    if (selectedMembers.length === 0) {
      return;
    }

    setAddingMembers(true);

    try {
      // 선택된 멤버 resource ID들 (ALL_*, TAG_* 제외)
      const memberIds = selectedMembers.filter(id => !id.startsWith("ALL_") && !id.startsWith("TAG_"));

      if (memberIds.length === 0) {
        toast({
          title: "입력 오류",
          description: "멤버를 선택해주세요.",
          variant: "destructive",
        });
        setAddingMembers(false);
        return;
      }

      const { data: resources, error } = await supabase
        .from('resource')
        .select('id, name')
        .in('id', memberIds);

      if (error) {
        throw error;
      }

      // 이미 멤버인 사용자 필터링
      const existingMemberIds = members.map(m => m.resource.id);
      const newMemberResources = resources?.filter(r => !existingMemberIds.includes(r.id)) || [];

      if (newMemberResources.length === 0) {
        toast({
          title: "알림",
          description: "선택한 멤버가 이미 보드에 참여 중입니다.",
        });
        setAddingMembers(false);
        return;
      }

      // 멤버 추가
      let successCount = 0;
      for (const resource of newMemberResources) {
        await new Promise<void>((resolve) => {
          addMember(
            {
              boardId,
              userId: resource.id,
              role: 'editor',
            },
            {
              onSuccess: () => {
                successCount++;
                resolve();
              },
              onError: (error) => {
                console.error('멤버 추가 오류:', error);
                resolve();
              },
            }
          );
        });
      }

      toast({
        title: "멤버 추가 완료",
        description: `${successCount}명의 멤버가 추가되었습니다.`,
      });

      setSelectedMembers([]);
    } catch (error) {
      console.error('멤버 추가 중 오류:', error);
      toast({
        title: "멤버 추가 실패",
        description: "멤버를 추가하는 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setAddingMembers(false);
    }
  };

  const handleRemoveMember = (userId: string, userName: string) => {
    if (!confirm(`"${userName}" 멤버를 보드에서 제거하시겠습니까?`)) {
      return;
    }

    removeMember(
      { boardId, userId },
      {
        onSuccess: () => {
          toast({
            title: "멤버 제거 완료",
            description: "멤버가 보드에서 제거되었습니다.",
          });
        },
        onError: (error) => {
          toast({
            title: "멤버 제거 실패",
            description: error.message || "멤버를 제거하는 중 오류가 발생했습니다.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'owner':
        return '소유자';
      case 'editor':
        return '편집자';
      case 'viewer':
        return '뷰어';
      default:
        return role;
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'owner':
        return 'default';
      case 'editor':
        return 'secondary';
      case 'viewer':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0">
          <DialogTitle>{boardTitle} - 멤버 관리</DialogTitle>
          <DialogDescription>
            보드에 참여 중인 멤버를 관리합니다
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto px-6 pb-6 flex-1">
          {/* 멤버 추가 (소유자만) */}
          {isOwner && (
            <div className="space-y-2 p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-2 mb-2">
                <UserPlus className="h-4 w-4" />
                <span className="font-medium text-sm">멤버 추가</span>
              </div>
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
                disabled={addingMembers}
              />
              <Button
                onClick={handleAddMembers}
                disabled={addingMembers || selectedMembers.length === 0}
                className="w-full"
                size="sm"
              >
                {addingMembers && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {addingMembers ? "추가 중..." : "멤버 추가"}
              </Button>
            </div>
          )}

          {/* 멤버 리스트 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <User className="h-4 w-4" />
              <span className="font-medium text-sm">멤버 목록 ({members.length}명)</span>
            </div>
            <div className="space-y-2">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {member.resource?.name?.slice(0, 2) || '??'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">
                          {member.resource?.name || '이름 없음'}
                        </p>
                        {member.role === 'owner' && (
                          <Crown className="h-3 w-3 text-yellow-600" />
                        )}
                      </div>
                    </div>
                    <Badge variant={getRoleBadgeVariant(member.role)} className="flex-shrink-0">
                      {getRoleLabel(member.role)}
                    </Badge>
                  </div>
                  {isOwner && member.role !== 'owner' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveMember(member.resource.id, member.resource.name || '이름 없음')}
                      className="h-8 w-8 ml-2 hover:bg-red-500/10 hover:text-red-600"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
