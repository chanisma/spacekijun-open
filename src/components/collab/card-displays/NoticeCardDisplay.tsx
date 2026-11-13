"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";
import { useAcknowledgeNotice } from "@/hooks/useCollabCardActions";
import { useToast } from "@/hooks/use-toast";
import { useCollabBoard } from "@/hooks/useCollabBoards";
import type { NoticeCardData } from "@/types/collabCardTypes";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";

interface NoticeCardDisplayProps {
  data: NoticeCardData;
  noteId: string;
  boardId: string;
  currentResourceId: string | undefined;
}

export function NoticeCardDisplay({
  data,
  noteId,
  boardId,
  currentResourceId,
}: NoticeCardDisplayProps) {
  const { mutate: acknowledgeNotice, isPending } = useAcknowledgeNotice();
  const { toast } = useToast();
  const { data: board } = useCollabBoard(boardId);

  const acknowledgements = data.acknowledgements || {};
  const acknowledgedCount = Object.values(acknowledgements).filter(
    (ack) => ack.acknowledged
  ).length;
  const totalCount = Object.keys(acknowledgements).length;

  const currentUserAcknowledged = currentResourceId
    ? acknowledgements[currentResourceId]?.acknowledged
    : false;

  const handleAcknowledge = () => {
    if (!currentResourceId) {
      toast({
        title: "권한 오류",
        description: "사용자 정보를 불러올 수 없습니다.",
        variant: "destructive",
      });
      return;
    }

    acknowledgeNotice(
      { noteId, resourceId: currentResourceId },
      {
        onSuccess: () => {
          toast({
            title: "확인 완료",
            description: "공지를 확인했습니다.",
          });
        },
        onError: (error) => {
          toast({
            title: "확인 실패",
            description: error.message || "공지 확인 중 오류가 발생했습니다.",
            variant: "destructive",
          });
        },
      }
    );
  };

  // 멤버 정보 매핑
  const getMemberName = (resourceId: string) => {
    const member = board?.members?.find((m) => m.resource.id === resourceId);
    return member?.resource.name || "알 수 없음";
  };

  return (
    <div className="mt-4 space-y-3 border-t pt-3">
      {/* 확인 현황 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">확인 현황</span>
          <Badge variant={acknowledgedCount === totalCount ? "default" : "secondary"}>
            {acknowledgedCount}/{totalCount}
          </Badge>
        </div>
        {!currentUserAcknowledged && (
          <Button
            size="sm"
            onClick={handleAcknowledge}
            disabled={isPending}
            className="h-8"
          >
            {isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            {isPending ? "확인 중..." : "확인 완료"}
          </Button>
        )}
      </div>

      {/* 멤버별 확인 상태 */}
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {Object.entries(acknowledgements).map(([resourceId, ack]) => (
          <div
            key={resourceId}
            className={`flex items-center justify-between p-2 rounded-xl text-xs transition-colors ${
              ack.acknowledged
                ? "bg-green-50/80 backdrop-blur-sm ring-1 ring-inset ring-green-200/50 dark:bg-green-950/20"
                : "bg-white/40 backdrop-blur-sm ring-1 ring-inset ring-gray-200/50 dark:bg-gray-800/50"
            }`}
          >
            <div className="flex items-center gap-2">
              {ack.acknowledged ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              ) : (
                <Clock className="h-4 w-4 text-gray-400" />
              )}
              <span
                className={`font-medium ${
                  ack.acknowledged
                    ? "text-green-700 dark:text-green-300"
                    : "text-gray-600 dark:text-gray-400"
                }`}
              >
                {getMemberName(resourceId)}
              </span>
            </div>
            {ack.acknowledged && ack.acknowledged_at && (
              <span className="text-gray-500 dark:text-gray-400">
                {formatDistanceToNow(new Date(ack.acknowledged_at), {
                  addSuffix: true,
                  locale: ko,
                })}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* 진행률 표시 */}
      <div className="pt-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>확인률</span>
          <span>{Math.round((acknowledgedCount / totalCount) * 100)}%</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="bg-green-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(acknowledgedCount / totalCount) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
