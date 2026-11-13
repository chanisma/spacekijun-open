import { SmartDeviceCard } from './SmartDeviceCard';
import { Loader2, PlugZap } from 'lucide-react';
import type { SmartDeviceWithStatus, DeviceCommand } from '@/types/smartthings';

interface SmartDeviceGridProps {
  devices: SmartDeviceWithStatus[];
  isLoading: boolean;
  canControl: boolean;
  isAdmin: boolean;
  pendingDeviceId: string | null;
  onCommand: (deviceId: string, command: DeviceCommand) => void;
  onEdit?: (device: SmartDeviceWithStatus) => void;
}

export function SmartDeviceGrid({
  devices,
  isLoading,
  canControl,
  isAdmin,
  pendingDeviceId,
  onCommand,
  onEdit,
}: SmartDeviceGridProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <PlugZap className="h-12 w-12 mb-3 opacity-40" />
        <p className="text-sm">등록된 스마트 기기가 없습니다.</p>
        {isAdmin && (
          <p className="text-xs mt-1">상단의 "기기 추가" 버튼으로 등록하세요.</p>
        )}
      </div>
    );
  }

  // 교실별 그룹화
  const grouped = groupByRoom(devices);

  return (
    <div className="space-y-6">
      {grouped.map(({ room, devices: roomDevices }) => (
        <div key={room}>
          {room !== '__ungrouped__' && (
            <h3 className="text-sm font-medium text-muted-foreground mb-2 px-1">
              {room}
            </h3>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {roomDevices.map((device) => (
              <SmartDeviceCard
                key={device.id}
                device={device}
                canControl={canControl}
                isAdmin={isAdmin}
                isPending={pendingDeviceId === device.device_id}
                onCommand={onCommand}
                onEdit={onEdit}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function groupByRoom(devices: SmartDeviceWithStatus[]) {
  const map = new Map<string, SmartDeviceWithStatus[]>();

  for (const d of devices) {
    const key = d.room_name || '__ungrouped__';
    const arr = map.get(key) ?? [];
    arr.push(d);
    map.set(key, arr);
  }

  // 미분류를 마지막에
  const sorted = [...map.entries()].sort(([a], [b]) => {
    if (a === '__ungrouped__') return 1;
    if (b === '__ungrouped__') return -1;
    return a.localeCompare(b, 'ko');
  });

  return sorted.map(([room, devices]) => ({ room, devices }));
}
