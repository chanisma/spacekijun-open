import { useEffect, useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  useSaveNotificationTemplate,
  type NotificationTemplate,
  type NotificationTemplateKey,
} from '@/hooks/useNotificationTemplate';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 편집 대상 setting_key */
  settingKey: NotificationTemplateKey;
  /** 카탈로그 상의 이벤트 이름 (다이얼로그 제목에 표시) */
  eventName: string;
  /** DB 에 저장된 현재 값 (없으면 null) */
  current: NotificationTemplate | null;
  /** 코드에 하드코딩된 기본 문구 — '기본값으로 되돌리기'와 미저장 상태 표시용 */
  fallback: NotificationTemplate;
}

/**
 * 알림 전송 문구 편집.
 *
 * 알림 관리 화면의 카탈로그 카드에서 열린다 — 이벤트를 보는 곳에서 바로 고치는 흐름이라
 * 시스템 설정에 별도 카드를 두는 것보다 자연스럽다.
 */
export function NotificationTemplateEditDialog({
  open,
  onOpenChange,
  settingKey,
  eventName,
  current,
  fallback,
}: Props) {
  const { toast } = useToast();
  const save = useSaveNotificationTemplate(settingKey);
  const [draft, setDraft] = useState<NotificationTemplate>(current ?? fallback);

  // 열리는 순간에만 최신 값으로 초기화 (닫았다 열면 편집 중 내용은 버린다).
  // current/fallback을 의존성에 넣으면 안 된다 — 부모가 fallback을 매 렌더 새 객체로
  // 만들고 저장값 쿼리도 백그라운드 refetch가 있어서, 열려 있는 동안 부모가 리렌더될
  // 때마다(검색 타이핑 등) 작성 중이던 문구가 통째로 리셋된다(2026-08-12 수정).
  useEffect(() => {
    if (open) setDraft(current ?? fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSave = async () => {
    try {
      await save.mutateAsync(draft);
      onOpenChange(false);
    } catch (err) {
      toast({
        title: '저장 실패',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{eventName} 문구 편집</DialogTitle>
          <DialogDescription>
            저장하면 이후 발송되는 알림에 이 문구가 사용됩니다. 이미 발송된 알림은 바뀌지 않습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="notification-template-title">알림 제목</Label>
            <Input
              id="notification-template-title"
              value={draft.title}
              onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
              placeholder={fallback.title}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notification-template-message">알림 메시지</Label>
            <Textarea
              id="notification-template-message"
              value={draft.message}
              onChange={(e) => setDraft((prev) => ({ ...prev, message: e.target.value }))}
              placeholder={fallback.message}
              className="min-h-40"
            />
            <p className="text-xs text-muted-foreground">
              💡 <code className="font-mono">{'{userName}'}</code> 를 쓰면 수신자 이름이 들어갑니다.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setDraft(fallback)}
            disabled={save.isPending}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            기본 문구로 되돌리기
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={save.isPending}>
              <Save className="mr-2 h-4 w-4" />
              {save.isPending ? '저장 중...' : '저장'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
