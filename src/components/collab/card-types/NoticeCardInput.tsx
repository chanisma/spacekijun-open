"use client";

import { useEffect } from "react";
import { useCollabBoard } from "@/hooks/useCollabBoards";
import { Loader2 } from "lucide-react";
import type { NoticeCardData } from "@/types/collabCardTypes";

interface NoticeCardInputProps {
  boardId: string;
  onChange: (data: NoticeCardData) => void;
  disabled?: boolean;
}

export function NoticeCardInput({ boardId, onChange, disabled }: NoticeCardInputProps) {
  const { data: board, isLoading } = useCollabBoard(boardId);

  useEffect(() => {
    if (board?.members) {
      // 보드 멤버들의 초기 acknowledgements 상태 생성
      const acknowledgements: NoticeCardData['acknowledgements'] = {};

      board.members.forEach((member) => {
        acknowledgements[member.resource.id] = {
          acknowledged: false,
          acknowledged_at: null,
        };
      });

      const cardData: NoticeCardData = {
        acknowledgements,
      };

      onChange(cardData);
    }
  }, [board?.members, onChange]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">멤버 목록 불러오는 중...</span>
      </div>
    );
  }

  if (!board?.members || board.members.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 px-3 bg-muted/50 rounded-lg">
        보드에 멤버가 없습니다. 보드 멤버를 추가한 후 공지 카드를 생성할 수 있습니다.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        공지 확인 대상: {board.members.length}명
      </div>
      <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
        💡 이 카드를 생성하면 보드 멤버들이 공지를 확인했는지 추적할 수 있습니다.
      </div>
    </div>
  );
}
