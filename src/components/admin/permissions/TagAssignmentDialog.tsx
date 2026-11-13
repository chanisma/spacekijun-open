import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, ChevronRight } from 'lucide-react';
import { useTagAssignmentCounts } from './useTagAssignmentCounts';
import { TagResourceDialog } from '../TagResourceDialog';
import type { TagRuleKind } from '@/config/permissionMatrix';

interface MatchedDbTag {
  id: string;
  name: string;
  color: string;
}

export interface DialogTagTarget {
  /** 알려진 태그 라벨 (exact: 이름, pattern: "N학년 M반") */
  label: string;
  kind: TagRuleKind;
  /** 이 행에 매칭되는 실제 DB 태그들 */
  dbTags: MatchedDbTag[];
}

interface TagAssignmentDialogProps {
  target: DialogTagTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 매트릭스 행 클릭 시 열리는 할당 편집 다이얼로그.
 *
 * - exact 태그(예: 상담교사)는 DB 태그가 1개뿐이므로 바로 TagResourceDialog 로 편집.
 * - pattern 태그(예: N학년 M반)는 여러 구체 태그(1학년 1반, 2학년 3반…)에 대응하므로
 *   먼저 어떤 태그를 편집할지 고르게 한 뒤 TagResourceDialog 로 넘긴다.
 *
 * 실제 할당 추가/삭제 로직은 기존 TagResourceDialog(resource_tag_assignments)를
 * 그대로 재사용한다 — 검증된 경로이고, 저장 즉시 해당 기능의 권한이 적용된다.
 */
export function TagAssignmentDialog({ target, open, onOpenChange }: TagAssignmentDialogProps) {
  const queryClient = useQueryClient();
  const { data: counts } = useTagAssignmentCounts();
  // exact(태그 1개)면 자동 선택, pattern 이면 사용자가 고르게 한다.
  const [selectedTag, setSelectedTag] = useState<MatchedDbTag | null>(null);

  useEffect(() => {
    if (open && target) {
      setSelectedTag(target.dbTags.length === 1 ? target.dbTags[0] : null);
    } else if (!open) {
      setSelectedTag(null);
    }
  }, [open, target]);

  if (!target) return null;

  // 단일 태그(또는 선택 완료) → 기존 TagResourceDialog 위임
  if (selectedTag) {
    return (
      <TagResourceDialog
        tag={selectedTag}
        open={open}
        onOpenChange={(o) => {
          if (!o) {
            // TagResourceDialog 는 raw supabase 로 저장하고 react-query 캐시를
            // 무효화하지 않으므로, 닫힐 때 매트릭스의 "보유 인원" 카운트를
            // 직접 갱신해 준다 (저장 여부와 무관하게 안전 — 단순 refetch).
            queryClient.invalidateQueries({ queryKey: ['tag-assignment-counts'] });
            // pattern 의 경우 태그 선택 화면으로 돌아가지 않고 전체 닫기
            onOpenChange(false);
          }
        }}
      />
    );
  }

  // pattern 태그 + 여러 후보 → 어떤 구체 태그를 편집할지 선택
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            편집할 태그 선택
            <Badge variant="outline">{target.label}</Badge>
          </DialogTitle>
          <DialogDescription>
            "{target.label}" 패턴에 해당하는 태그가 여러 개입니다. 교직원을 편집할
            구체적인 태그를 선택하세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2 max-h-[60vh] overflow-y-auto">
          {target.dbTags
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
            .map((t) => (
              <Button
                key={t.id}
                variant="outline"
                className="w-full justify-between h-auto py-2.5"
                onClick={() => setSelectedTag(t)}
              >
                <span className="flex items-center gap-2">
                  <Badge style={{ backgroundColor: t.color, color: 'white' }}>
                    {t.name}
                  </Badge>
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {counts?.get(t.id) ?? 0}명
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Button>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
