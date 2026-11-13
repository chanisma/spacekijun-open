import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Check, Plug, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useSmartThingsApiDevices,
  useSmartDevices,
  useAddDevice,
  useUpdateDevice,
} from '@/hooks/useSmartDevices';
import type { SmartDeviceWithStatus, SmartThingsApiDevice } from '@/types/smartthings';
import { useToast } from '@/hooks/use-toast';

interface DeviceMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editDevice?: SmartDeviceWithStatus | null;
}

export function DeviceMappingDialog({ open, onOpenChange, editDevice }: DeviceMappingDialogProps) {
  const isEdit = !!editDevice;
  const { toast } = useToast();

  // 수정 모드 state
  const [label, setLabel] = useState('');
  const [roomName, setRoomName] = useState('');

  // 추가 모드 state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);

  // API 디바이스 목록 (추가 모드)
  const { data: apiDevices, isLoading: apiLoading, error: apiError, refetch: refetchApiDevices } = useSmartThingsApiDevices(open && !isEdit);
  // DB에 이미 등록된 디바이스 (중복 체크용)
  const { data: registeredDevices } = useSmartDevices();

  const addDevice = useAddDevice();
  const updateDevice = useUpdateDevice();

  const registeredDeviceIds = new Set(registeredDevices?.map(d => d.device_id) ?? []);

  useEffect(() => {
    if (editDevice) {
      setLabel(editDevice.label);
      setRoomName(editDevice.room_name || '');
    } else {
      setSelectedIds(new Set());
      setLabel('');
      setRoomName('');
    }
  }, [editDevice, open]);

  const toggleDevice = (deviceId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(deviceId)) {
        next.delete(deviceId);
      } else {
        next.add(deviceId);
      }
      return next;
    });
  };

  const selectAll = () => {
    const available = apiDevices?.filter(d => !registeredDeviceIds.has(d.deviceId)) ?? [];
    setSelectedIds(new Set(available.map(d => d.deviceId)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleBulkAdd = async () => {
    if (selectedIds.size === 0) return;
    setIsAdding(true);

    let successCount = 0;
    let failCount = 0;

    for (const id of selectedIds) {
      const device = apiDevices?.find(d => d.deviceId === id);
      if (!device) continue;

      try {
        await addDevice.mutateAsync({
          device_id: device.deviceId,
          label: device.label || device.name,
        });
        successCount++;
      } catch {
        failCount++;
      }
    }

    setIsAdding(false);

    if (successCount > 0) {
      toast({
        title: `${successCount}개 디바이스 등록 완료`,
        description: failCount > 0 ? `${failCount}개 등록 실패` : undefined,
      });
    }

    onOpenChange(false);
  };

  const handleEditSubmit = async () => {
    if (!label || !editDevice) return;
    await updateDevice.mutateAsync({
      id: editDevice.id,
      updates: { label, room_name: roomName || undefined },
    });
    onOpenChange(false);
  };

  const availableCount = apiDevices?.filter(d => !registeredDeviceIds.has(d.deviceId)).length ?? 0;

  // 수정 모드
  if (isEdit) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>기기 수정</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>표시명</Label>
              <Input
                placeholder="예: 1-1 교실 프로젝터"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>교실 / 장소 (선택)</Label>
              <Input
                placeholder="예: 1학년 1반"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={updateDevice.isPending}>
              취소
            </Button>
            <Button onClick={handleEditSubmit} disabled={!label || updateDevice.isPending}>
              {updateDevice.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              수정
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // 추가 모드 (카드 멀티셀렉트)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>기기 추가</DialogTitle>
          <p className="text-sm text-muted-foreground">
            등록할 디바이스를 선택하세요. 표시명은 디바이스명으로 자동 설정됩니다.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {apiLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              디바이스 목록 불러오는 중...
            </div>
          ) : apiDevices && apiDevices.length > 0 ? (
            <div className="space-y-3">
              {/* 전체선택/해제 */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {availableCount}개 등록 가능 · {selectedIds.size}개 선택됨
                </span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAll} disabled={availableCount === 0}>
                    전체 선택
                  </Button>
                  <Button variant="ghost" size="sm" onClick={deselectAll} disabled={selectedIds.size === 0}>
                    선택 해제
                  </Button>
                </div>
              </div>

              {/* 디바이스 카드 그리드 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {apiDevices.map((device: SmartThingsApiDevice) => {
                  const isRegistered = registeredDeviceIds.has(device.deviceId);
                  const isSelected = selectedIds.has(device.deviceId);
                  const deviceLabel = device.label || device.name;

                  return (
                    <button
                      key={device.deviceId}
                      type="button"
                      disabled={isRegistered}
                      onClick={() => toggleDevice(device.deviceId)}
                      className={cn(
                        'relative flex items-start gap-3 rounded-lg border p-3 text-left transition-all',
                        isRegistered
                          ? 'border-muted bg-muted/50 opacity-60 cursor-not-allowed'
                          : isSelected
                            ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/20 ring-1 ring-orange-500'
                            : 'border-border hover:border-orange-300 hover:bg-accent cursor-pointer',
                      )}
                    >
                      {/* 체크 아이콘 */}
                      <div
                        className={cn(
                          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
                          isRegistered
                            ? 'border-muted-foreground/30 bg-muted'
                            : isSelected
                              ? 'border-orange-500 bg-orange-500 text-white'
                              : 'border-muted-foreground/40',
                        )}
                      >
                        {(isSelected || isRegistered) && <Check className="h-3.5 w-3.5" />}
                      </div>

                      {/* 디바이스 정보 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Plug className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="text-sm font-medium truncate">{deviceLabel}</span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {device.deviceId.slice(0, 8)}...
                        </p>
                        {isRegistered && (
                          <span className="text-xs text-muted-foreground font-medium">등록됨</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : apiError ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <p className="text-sm font-medium text-destructive">SmartThings 연결 실패</p>
              <p className="text-xs text-center max-w-sm">
                {apiError instanceof Error ? apiError.message : 'SmartThings API에 연결할 수 없습니다.'}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => refetchApiDevices()}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                다시 시도
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <Plug className="h-8 w-8" />
              <p className="text-sm">등록 가능한 switch 디바이스가 없습니다.</p>
              <p className="text-xs">SmartThings에 switch capability 디바이스를 추가하세요.</p>
            </div>
          )}
        </div>

        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isAdding}>
            취소
          </Button>
          <Button onClick={handleBulkAdd} disabled={selectedIds.size === 0 || isAdding}>
            {isAdding && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {selectedIds.size > 0 ? `${selectedIds.size}개 등록` : '등록'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
