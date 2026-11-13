import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SmartThingsService } from '@/services/smartThingsService';
import type {
  SmartDevice,
  SmartDeviceWithStatus,
  DeviceCommand,
  SmartDeviceFormData,
  SmartDevicePermission,
} from '@/types/smartthings';
import { useToast } from '@/hooks/use-toast';

const QUERY_KEYS = {
  devices: ['smart-devices'] as const,
  statuses: ['smart-device-statuses'] as const,
  permissions: ['smart-device-permissions'] as const,
  locations: ['smartthings-locations'] as const,
  myPermission: ['smart-device-my-permission'] as const,
  stDevices: ['smartthings-api-devices'] as const,
};

/** DB에 등록된 디바이스 매핑 목록 */
export function useSmartDevices() {
  return useQuery({
    queryKey: QUERY_KEYS.devices,
    queryFn: () => SmartThingsService.getDevices(),
  });
}

/** 등록된 디바이스들의 실시간 상태 (30초 폴링) */
export function useDeviceStatuses(devices: SmartDevice[] | undefined) {
  const deviceIds = devices?.filter(d => d.is_active).map(d => d.device_id) ?? [];

  return useQuery({
    queryKey: [...QUERY_KEYS.statuses, deviceIds],
    queryFn: async () => {
      if (deviceIds.length === 0) return {};

      const results = await SmartThingsService.getMultipleDeviceStatuses(deviceIds);
      const statusMap: Record<string, ReturnType<typeof SmartThingsService.parseDeviceStatus>> = {};

      for (const r of results) {
        statusMap[r.deviceId] = SmartThingsService.parseDeviceStatus(r);
      }
      return statusMap;
    },
    enabled: deviceIds.length > 0,
    refetchInterval: 30_000, // 30초 폴링
    refetchIntervalInBackground: false,
  });
}

/** DB 디바이스 + 실시간 상태 결합 */
export function useSmartDevicesWithStatus() {
  const { data: devices, isLoading: devicesLoading, error: devicesError } = useSmartDevices();
  const { data: statuses, isLoading: statusesLoading } = useDeviceStatuses(devices);

  const devicesWithStatus: SmartDeviceWithStatus[] = (devices ?? []).map(device => ({
    ...device,
    status: statuses?.[device.device_id] ?? null,
    loading: statusesLoading,
  }));

  return {
    devices: devicesWithStatus,
    isLoading: devicesLoading,
    isStatusLoading: statusesLoading,
    error: devicesError,
  };
}

/** 전원 제어 명령 (optimistic update) */
export function useDeviceCommand() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ deviceId, command }: { deviceId: string; command: DeviceCommand }) =>
      SmartThingsService.sendCommand(deviceId, command),

    onMutate: async ({ deviceId, command }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.statuses });

      const previous = queryClient.getQueryData(QUERY_KEYS.statuses);

      // Optimistic: 즉시 상태 변경
      queryClient.setQueriesData(
        { queryKey: QUERY_KEYS.statuses },
        (old: Record<string, any> | undefined) => {
          if (!old || !old[deviceId]) return old;
          return {
            ...old,
            [deviceId]: { ...old[deviceId], switch: command },
          };
        }
      );

      return { previous };
    },

    onError: (_err, _vars, context) => {
      // 실패 시 롤백
      if (context?.previous) {
        queryClient.setQueriesData({ queryKey: QUERY_KEYS.statuses }, context.previous);
      }
      const msg = _err instanceof Error ? _err.message : '';
      const isOffline = msg.includes('DeviceOffline') || msg.includes('Device is offline');
      toast({
        title: isOffline ? '기기 오프라인' : '제어 실패',
        description: isOffline
          ? '기기가 오프라인 상태입니다. 전원 연결을 확인하세요.'
          : (msg || '전원 제어에 실패했습니다.'),
        variant: 'destructive',
      });
    },

    onSuccess: (_data, { command }) => {
      toast({
        title: command === 'on' ? '전원 켜짐' : '전원 꺼짐',
        description: `디바이스가 ${command === 'on' ? '켜졌습니다' : '꺼졌습니다'}.`,
      });
    },

    onSettled: () => {
      // 3초 후 실제 상태로 동기화
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.statuses });
      }, 3000);
    },
  });
}

/** 현재 사용자의 제어 권한 확인 */
export function useCanControlDevice() {
  return useQuery({
    queryKey: QUERY_KEYS.myPermission,
    queryFn: () => SmartThingsService.checkMyPermission(),
    staleTime: 5 * 60 * 1000, // 5분 캐싱
  });
}

/** SmartThings 장소(Location) 목록 */
export function useSmartThingsLocations(enabled = false) {
  return useQuery({
    queryKey: QUERY_KEYS.locations,
    queryFn: async () => {
      const result = await SmartThingsService.listLocations();
      return result.items ?? [];
    },
    enabled,
    staleTime: 5 * 60_000, // 5분 캐싱
  });
}

/** SmartThings API 디바이스 목록 (등록 다이얼로그용) */
export function useSmartThingsApiDevices(enabled = false) {
  return useQuery({
    queryKey: QUERY_KEYS.stDevices,
    queryFn: async () => {
      const result = await SmartThingsService.listSmartThingsDevices();
      return result.items ?? [];
    },
    enabled,
    staleTime: 60_000, // 1분 캐싱
  });
}

// ─── Admin: 디바이스 매핑 CRUD Mutations ─────────

export function useAddDevice() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (form: SmartDeviceFormData) => SmartThingsService.addDevice(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.devices });
    },
    onError: (err: Error) => {
      toast({ title: '등록 실패', description: err.message, variant: 'destructive' });
    },
  });
}

export function useUpdateDevice() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<SmartDeviceFormData> }) =>
      SmartThingsService.updateDevice(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.devices });
    },
    onError: (err: Error) => {
      toast({ title: '수정 실패', description: err.message, variant: 'destructive' });
    },
  });
}

export function useUpdateDeviceFloor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, floor, currentMeta }: { id: string; floor: number | null; currentMeta: Record<string, unknown> }) =>
      SmartThingsService.updateDeviceFloor(id, floor, currentMeta),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.devices });
    },
  });
}

export function useDeleteDevice() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => SmartThingsService.deleteDevice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.devices });
    },
    onError: (err: Error) => {
      toast({ title: '삭제 실패', description: err.message, variant: 'destructive' });
    },
  });
}

// ─── Admin: 권한 관리 ────────────────────────────

export function useDevicePermissions() {
  return useQuery({
    queryKey: QUERY_KEYS.permissions,
    queryFn: () => SmartThingsService.getPermissions(),
  });
}

export function useGrantPermission() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ userId, grantedBy }: { userId: string; grantedBy: string }) =>
      SmartThingsService.grantPermission(userId, grantedBy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.permissions });
    },
    onError: (err: Error) => {
      toast({ title: '권한 부여 실패', description: err.message, variant: 'destructive' });
    },
  });
}

export function useRevokePermission() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (userId: string) => SmartThingsService.revokePermission(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.permissions });
    },
    onError: (err: Error) => {
      toast({ title: '권한 철회 실패', description: err.message, variant: 'destructive' });
    },
  });
}
