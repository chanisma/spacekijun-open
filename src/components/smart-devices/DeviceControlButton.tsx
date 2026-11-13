import { Switch } from '@/components/ui/switch';
import { Loader2, Lock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { DeviceStatus, DeviceCommand } from '@/types/smartthings';

interface DeviceControlButtonProps {
  status: DeviceStatus | null;
  canControl: boolean;
  isPending: boolean;
  onCommand: (command: DeviceCommand) => void;
}

export function DeviceControlButton({
  status,
  canControl,
  isPending,
  onCommand,
}: DeviceControlButtonProps) {
  const isOn = status?.switch === 'on';
  const isOnline = status?.online ?? false;
  const disabled = !canControl || !isOnline || isPending;

  if (!canControl) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-not-allowed">
            <Lock className="h-3.5 w-3.5" />
            <span>조회만 가능</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>제어 권한이 없습니다. 관리자에게 문의하세요.</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      <Switch
        checked={isOn}
        disabled={disabled}
        onCheckedChange={(checked) => onCommand(checked ? 'on' : 'off')}
      />
    </div>
  );
}
