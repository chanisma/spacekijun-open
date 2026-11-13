import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useCreateDashboardInfo, useUpdateDashboardInfo } from '@/hooks/useDashboardInfo';
import { DashboardInfoBox, ContentType } from '@/types/dashboardInfo';

interface DashboardInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  infoBox: DashboardInfoBox | null;
}

export function DashboardInfoDialog({ open, onOpenChange, infoBox }: DashboardInfoDialogProps) {
  const createInfoBox = useCreateDashboardInfo();
  const updateInfoBox = useUpdateDashboardInfo();

  const [title, setTitle] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [displayOrder, setDisplayOrder] = useState(0);

  // Initialize form when editing
  useEffect(() => {
    if (infoBox) {
      setTitle(infoBox.title);
      setIsActive(infoBox.is_active);
      setDisplayOrder(infoBox.display_order);
    } else {
      // Reset form when creating new
      setTitle('');
      setIsActive(true);
      setDisplayOrder(0);
    }
  }, [infoBox, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      return;
    }

    const input = {
      title: title.trim(),
      content_type: 'card' as ContentType,
      content: '', // Cards don't have content, only items do
      is_active: isActive,
      display_order: displayOrder,
      parent_card_id: null, // This is a card, not an item
    };

    if (infoBox) {
      // Update existing
      updateInfoBox.mutate(
        { id: infoBox.id, input },
        {
          onSuccess: () => {
            onOpenChange(false);
          },
        }
      );
    } else {
      // Create new
      createInfoBox.mutate(input, {
        onSuccess: () => {
          onOpenChange(false);
        },
      });
    }
  };

  const isLoading = createInfoBox.isPending || updateInfoBox.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{infoBox ? '카드 수정' : '카드 추가'}</DialogTitle>
          <DialogDescription>
            홈 대시보드에 표시될 카드를 {infoBox ? '수정' : '생성'}하세요. 카드 생성 후 "아이템 관리"에서 내용을 추가할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">카드 제목 *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="카드 제목을 입력하세요 (예: 오늘의 공지사항)"
              required
            />
          </div>

          {/* Info Message */}
          <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-200">
            <p className="text-sm text-indigo-900 font-semibold mb-2">
              💡 카드 사용 방법
            </p>
            <ol className="text-sm text-indigo-800 space-y-1 list-decimal list-inside">
              <li>먼저 카드를 저장합니다.</li>
              <li>관리 화면에서 "아이템 관리" 버튼을 클릭합니다.</li>
              <li>텍스트, 이미지, 생일 정보 등 여러 아이템을 추가하고 순서를 조정합니다.</li>
            </ol>
          </div>

          {/* Display Order */}
          <div className="space-y-2">
            <Label htmlFor="display-order">우선순위</Label>
            <Input
              id="display-order"
              type="number"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 0)}
              placeholder="0"
            />
            <p className="text-sm text-muted-foreground">
              숫자가 클수록 먼저 표시됩니다. 기본값: 0
            </p>
          </div>

          {/* Active Status */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="is-active">활성 상태</Label>
              <p className="text-sm text-muted-foreground">
                활성화하면 홈 대시보드에 표시됩니다.
              </p>
            </div>
            <Switch
              id="is-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              취소
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !title.trim()}
            >
              {isLoading ? '저장 중...' : infoBox ? '수정' : '추가'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
