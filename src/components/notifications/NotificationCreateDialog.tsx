import React, { useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DialogFooter, Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import { supabase } from '@/integrations/supabase/client';
import { useNotificationMutations } from '@/hooks/useNotifications';

interface NotificationCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const NotificationCreateDialog = ({ open, onOpenChange }: NotificationCreateDialogProps) => {
  const { user } = useAuth();
  const { createManualNotification } = useNotificationMutations();

  // Local form state
  const [newNotificationTitle, setNewNotificationTitle] = useState('');
  const [newNotificationMessage, setNewNotificationMessage] = useState('');
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);

  const handleCreateNotification = async () => {
    if (!user || !newNotificationTitle || !newNotificationMessage || selectedTargets.length === 0) return;

    try {
      // Get target resource IDs based on selected targets
      let targetResourceIds: string[] = [];

      if (selectedTargets.includes('ALL_TEACHERS')) {
        // "전체 선생님"이 선택된 경우 - 모든 선생님의 resource ID 가져오기
        const { data: teacherResources, error: resourceError } = await supabase
          .from('resource')
          .select('id')
          .eq('type', 'teacher');

        if (resourceError) {
          console.error('선생님 리소스 조회 오류:', resourceError);
          throw resourceError;
        }

        targetResourceIds = teacherResources?.map(r => r.id) || [];
      } else {
        // selectedTargets는 이미 resource ID들이므로 직접 사용
        targetResourceIds = selectedTargets;
      }

      // Use the mutation with proper data
      await createManualNotification.mutateAsync({
        title: newNotificationTitle,
        message: newNotificationMessage,
        targetResourceIds
      });

      // Clear form on success
      setNewNotificationTitle('');
      setNewNotificationMessage('');
      setSelectedTargets([]);
      onOpenChange(false);

    } catch (error) {
      console.error('알림 생성 중 오류:', error);
    }
  };

  const handleClose = () => {
    setNewNotificationTitle('');
    setNewNotificationMessage('');
    setSelectedTargets([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>새 알림 생성</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="title">제목</Label>
            <Input
              id="title"
              value={newNotificationTitle}
              onChange={(e) => setNewNotificationTitle(e.target.value)}
              placeholder="알림 제목을 입력하세요"
            />
          </div>
          <div>
            <Label htmlFor="message">내용</Label>
            <Textarea
              id="message"
              value={newNotificationMessage}
              onChange={(e) => setNewNotificationMessage(e.target.value)}
              placeholder="알림 내용을 입력하세요"
              rows={3}
            />
          </div>
          <div>
            <Label htmlFor="targets">알림 대상</Label>
            <SearchableMultiSelect
              selectedValues={selectedTargets}
              onSelectionChange={setSelectedTargets}
              placeholder="알림을 받을 대상을 선택하세요"
              searchPlaceholder="선생님 이름을 검색하거나 쉼표로 구분하여 입력..."
              emptyText="검색 결과가 없습니다."
              filterByTeacher={true}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              선생님 이름을 검색하거나 직접 입력할 수 있습니다. 여러 명을 선택하려면 쉼표(,)로 구분하세요.
            </p>
          </div>
          <DialogFooter className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={createManualNotification.isPending}
            >
              취소
            </Button>
            <Button
              onClick={handleCreateNotification}
              disabled={createManualNotification.isPending || !newNotificationTitle || !newNotificationMessage || selectedTargets.length === 0}
            >
              {createManualNotification.isPending ? '생성 중...' : '생성'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};