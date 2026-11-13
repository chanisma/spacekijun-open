import { Zap, Activity } from 'lucide-react';
import type { DeviceStatus } from '@/types/smartthings';

interface DevicePowerMonitorProps {
  status: DeviceStatus | null;
}

export function DevicePowerMonitor({ status }: DevicePowerMonitorProps) {
  if (!status || !status.online || status.switch !== 'on') {
    return null;
  }

  const hasPower = status.power !== undefined;
  const hasEnergy = status.energy !== undefined;

  if (!hasPower && !hasEnergy) return null;

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
      {hasPower && (
        <span className="flex items-center gap-1">
          <Zap className="h-3 w-3 text-yellow-500" />
          {status.power!.toFixed(1)}W
        </span>
      )}
      {hasEnergy && (
        <span className="flex items-center gap-1">
          <Activity className="h-3 w-3 text-blue-500" />
          {(status.energy! / 1000).toFixed(2)}kWh
        </span>
      )}
    </div>
  );
}
