import { Switch } from '@/components/ui/switch';
import { Loader2, Lock, Zap, WifiOff, Settings, GripVertical } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { SmartDeviceWithStatus, DeviceCommand } from '@/types/smartthings';

interface RoomDeviceCellProps {
  device: SmartDeviceWithStatus;
  canControl: boolean;
  isPending: boolean;
  isAdmin: boolean;
  isDndEnabled?: boolean;
  onCommand: (deviceId: string, command: DeviceCommand) => void;
  onEdit?: (device: SmartDeviceWithStatus) => void;
}

export function RoomDeviceCell({
  device,
  canControl,
  isPending,
  isAdmin,
  isDndEnabled = false,
  onCommand,
  onEdit,
}: RoomDeviceCellProps) {
  const isOn = device.status?.switch === 'on';
  const isOnline = device.status?.online ?? false;
  const isLoading = device.loading;
  const displayName = device.label;

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: device.id,
    data: { device },
    disabled: !isDndEnabled,
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 50 : undefined,
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative flex flex-col items-center rounded-lg p-2 transition-all duration-300',
        'border backdrop-blur-sm w-[88px]',
        isDragging && 'opacity-50 shadow-lg scale-105',
        !isOnline
          ? 'bg-slate-100/60 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-700/40'
          : isOn
            ? 'bg-gradient-to-b from-emerald-50 to-green-50/80 dark:from-emerald-950/30 dark:to-green-950/20 border-emerald-300/60 dark:border-emerald-700/40 shadow-[0_0_10px_rgba(16,185,129,0.12)]'
            : 'bg-slate-50/80 dark:bg-slate-900/40 border-slate-200/80 dark:border-slate-700/50',
      )}
    >
      {/* 드래그 핸들 + 관리 버튼 */}
      {isAdmin && (
        <div className="absolute top-0.5 right-0.5 flex items-center gap-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {isDndEnabled && (
            <button
              {...listeners}
              {...attributes}
              className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 cursor-grab active:cursor-grabbing touch-none"
            >
              <GripVertical className="h-2.5 w-2.5 text-muted-foreground" />
            </button>
          )}
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(device); }}
              className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10"
            >
              <Settings className="h-2.5 w-2.5 text-muted-foreground" />
            </button>
          )}
        </div>
      )}

      {/* 상태 표시 (창문) */}
      <div className={cn(
        'w-9 h-7 rounded flex items-center justify-center mb-1 transition-all duration-300',
        !isOnline
          ? 'bg-slate-200/80 dark:bg-slate-700/60'
          : isOn
            ? 'bg-gradient-to-b from-emerald-400 to-green-500 dark:from-emerald-500 dark:to-green-600 shadow-[0_0_6px_rgba(16,185,129,0.35)]'
            : 'bg-slate-300/60 dark:bg-slate-600/60',
      )}>
        {isLoading ? (
          <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
        ) : !isOnline ? (
          <WifiOff className="h-3 w-3 text-slate-400" />
        ) : isOn ? (
          <Zap className="h-3 w-3 text-white" />
        ) : (
          <div className="w-2.5 h-2.5 rounded-full bg-slate-400/50" />
        )}
      </div>

      {/* 디바이스명 */}
      <span className={cn(
        'text-[10px] font-medium text-center leading-tight truncate w-full',
        !isOnline ? 'text-slate-400' : 'text-slate-700 dark:text-slate-200',
      )}>
        {displayName}
      </span>

      {/* 전력 */}
      {isOn && device.status?.power !== undefined && (
        <span className="text-[9px] text-emerald-600/80 dark:text-emerald-400/70 mt-0.5">
          {device.status.power.toFixed(0)}W
        </span>
      )}

      {/* 제어 스위치 */}
      <div className="mt-1">
        {!canControl ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Lock className="h-2.5 w-2.5 text-slate-300" />
            </TooltipTrigger>
            <TooltipContent><p>제어 권한 없음</p></TooltipContent>
          </Tooltip>
        ) : (
          <div className="flex items-center gap-0.5">
            {isPending && <Loader2 className="h-2.5 w-2.5 animate-spin text-slate-400" />}
            <Switch
              checked={isOn}
              disabled={!isOnline || isPending}
              onCheckedChange={(checked) => onCommand(device.device_id, checked ? 'on' : 'off')}
              className="scale-[0.65] origin-center"
            />
          </div>
        )}
      </div>
    </div>
  );
}
