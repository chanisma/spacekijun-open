import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import type { DeviceStatus } from '@/types/smartthings';

interface DeviceStatusBadgeProps {
  status: DeviceStatus | null;
  loading?: boolean;
}

export function DeviceStatusBadge({ status, loading }: DeviceStatusBadgeProps) {
  if (loading) {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        확인 중
      </Badge>
    );
  }

  if (!status) {
    return (
      <Badge variant="outline" className="bg-gray-100 text-gray-500">
        상태 없음
      </Badge>
    );
  }

  if (!status.online) {
    return (
      <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-300">
        <span className="mr-1.5 h-2 w-2 rounded-full bg-gray-400 inline-block" />
        오프라인
      </Badge>
    );
  }

  if (status.switch === 'on') {
    return (
      <Badge className="bg-green-100 text-green-700 border-green-300 hover:bg-green-100">
        <span className="mr-1.5 h-2 w-2 rounded-full bg-green-500 inline-block animate-pulse" />
        켜짐
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">
      <span className="mr-1.5 h-2 w-2 rounded-full bg-red-400 inline-block" />
      꺼짐
    </Badge>
  );
}
