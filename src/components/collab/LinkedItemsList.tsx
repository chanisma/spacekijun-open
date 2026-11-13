import { Calendar, CalendarDays, CheckSquare, X, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useUnlinkItem } from "@/hooks/useCollabNotes";
import { useToast } from "@/hooks/use-toast";
import type { LinkedItem } from "@/types/collabCardTypes";
import { useNavigate } from "react-router-dom";

interface LinkedItemsListProps {
  noteId: string;
  boardId: string;
  linkedItems: LinkedItem[];
  canEdit?: boolean;
}

export function LinkedItemsList({
  noteId,
  boardId,
  linkedItems,
  canEdit = true,
}: LinkedItemsListProps) {
  const { mutate: unlinkItem } = useUnlinkItem();
  const { toast } = useToast();
  const navigate = useNavigate();

  if (!linkedItems || linkedItems.length === 0) {
    return null;
  }

  const handleUnlink = (itemId: string, itemType: "event" | "task" | "schedule", itemName: string) => {
    if (!confirm(`"${itemName}" 연결을 해제하시겠습니까?`)) {
      return;
    }

    unlinkItem(
      {
        noteId,
        itemId,
        itemType,
      },
      {
        onSuccess: () => {
          const typeLabel = itemType === "event" ? "이벤트" : itemType === "task" ? "업무" : "스케줄";
          toast({
            title: "연결 해제 완료",
            description: `${typeLabel} 연결이 해제되었습니다.`,
          });
        },
        onError: (error) => {
          toast({
            title: "연결 해제 실패",
            description: error.message || "연결 해제 중 오류가 발생했습니다.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleNavigate = (item: LinkedItem) => {
    if (item.type === "event") {
      navigate("/tasks/mine", { state: { selectedEventId: item.id } });
    } else if (item.type === "task") {
      navigate("/tasks/mine", { state: { selectedTaskId: item.id } });
    } else if (item.type === "schedule") {
      navigate("/schedule", { state: { scheduleId: item.id } });
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500/10 text-green-700 border-green-500/20";
      case "completed":
        return "bg-blue-500/10 text-blue-700 border-blue-500/20";
      case "cancelled":
        return "bg-red-500/10 text-red-700 border-red-500/20";
      case "pending":
        return "bg-yellow-500/10 text-yellow-700 border-yellow-500/20";
      default:
        return "bg-gray-500/10 text-gray-700 border-gray-500/20";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "active":
        return "진행중";
      case "completed":
        return "완료";
      case "cancelled":
        return "취소";
      case "pending":
        return "대기";
      default:
        return status;
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-slate-900/10 space-y-2">
      <h4 className="text-xs font-semibold opacity-60 mb-2">연결된 항목</h4>
      {linkedItems.map((item) => (
        <div
          key={`${item.type}-${item.id}`}
          onClick={(e) => {
            e.stopPropagation();
            handleNavigate(item);
          }}
          className="flex items-center gap-2 p-2 rounded-lg bg-white/50 hover:bg-white/80 border border-transparent hover:border-black/5 transition-all group cursor-pointer"
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {item.type === "event" ? (
              <Calendar className="h-3.5 w-3.5 flex-shrink-0 text-blue-600" />
            ) : item.type === "task" ? (
              <CheckSquare className="h-3.5 w-3.5 flex-shrink-0 text-green-600" />
            ) : (
              <CalendarDays className="h-3.5 w-3.5 flex-shrink-0 text-purple-600" />
            )}
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium truncate block">{item.name}</span>
              {item.status && (
                <Badge
                  variant="outline"
                  className={`text-[10px] mt-0.5 ${getStatusBadgeColor(item.status)}`}
                >
                  {getStatusLabel(item.status)}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                handleNavigate(item);
              }}
              className="h-6 w-6 hover:bg-blue-500/20 hover:text-blue-700"
              title="상세 보기"
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  handleUnlink(item.id, item.type, item.name);
                }}
                className="h-6 w-6 hover:bg-red-500/20 hover:text-red-700"
                title="연결 해제"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
