import { Card, CardContent } from '@/components/ui/card';
import { Plug, MapPin, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeviceStatusBadge } from './DeviceStatusBadge';
import { DevicePowerMonitor } from './DevicePowerMonitor';
import { DeviceControlButton } from './DeviceControlButton';
import type { SmartDeviceWithStatus, DeviceCommand } from '@/types/smartthings';

interface SmartDeviceCardProps {
  device: SmartDeviceWithStatus;
  canControl: boolean;
  isAdmin: boolean;
  isPending: boolean;
  onCommand: (deviceId: string, command: DeviceCommand) => void;
  onEdit?: (device: SmartDeviceWithStatus) => void;
}

export function SmartDeviceCard({
  device,
  canControl,
  isAdmin,
  isPending,
  onCommand,
  onEdit,
}: SmartDeviceCardProps) {
  const isOn = device.status?.switch === 'on';
  const isOnline = device.status?.online ?? false;

  return (
    <Card className={`transition-all duration-200 ${
      !isOnline
        ? 'opacity-60 border-gray-200'
        : isOn
          ? 'border-green-200 shadow-sm shadow-green-100'
          : 'border-red-100'
    }`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className={`mt-0.5 p-2 rounded-lg ${
              !isOnline
                ? 'bg-gray-100'
                : isOn
                  ? 'bg-green-100'
                  : 'bg-red-50'
            }`}>
              <Plug className={`h-5 w-5 ${
                !isOnline
                  ? 'text-gray-400'
                  : isOn
                    ? 'text-green-600'
                    : 'text-red-400'
              }`} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-sm truncate">{device.label}</h3>
                <DeviceStatusBadge status={device.status} loading={device.loading} />
              </div>

              {device.room_name && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                  <MapPin className="h-3 w-3" />
                  <span>{device.room_name}</span>
                </div>
              )}

              <DevicePowerMonitor status={device.status} />
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <DeviceControlButton
              status={device.status}
              canControl={canControl}
              isPending={isPending}
              onCommand={(cmd) => onCommand(device.device_id, cmd)}
            />
            {isAdmin && onEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                onClick={() => onEdit(device)}
              >
                <Settings className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
