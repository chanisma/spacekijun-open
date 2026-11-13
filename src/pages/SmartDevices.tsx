import { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { PageContainer } from '@/components/layout/PageContainer';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  useSmartDevicesWithStatus,
  useDeviceCommand,
  useCanControlDevice,
  useDeleteDevice,
  useUpdateDeviceFloor,
} from '@/hooks/useSmartDevices';
import { BuildingFloorView } from '@/components/smart-devices/BuildingFloorView';
import { DeviceMappingDialog } from '@/components/smart-devices/DeviceMappingDialog';
import { DevicePermissionDialog } from '@/components/smart-devices/DevicePermissionDialog';
import { Button } from '@/components/ui/button';
import { Plus, Shield, RefreshCw, Building2, Zap, Wifi, Power } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { SmartDeviceWithStatus, DeviceCommand } from '@/types/smartthings';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const SmartDevices = () => {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const { devices, isLoading, isStatusLoading } = useSmartDevicesWithStatus();
  const { data: canControl = false } = useCanControlDevice();
  const deviceCommand = useDeviceCommand();
  const deleteDevice = useDeleteDevice();
  const updateFloor = useUpdateDeviceFloor();

  const [showMappingDialog, setShowMappingDialog] = useState(false);
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  const [editDevice, setEditDevice] = useState<SmartDeviceWithStatus | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SmartDeviceWithStatus | null>(null);
  const [pendingDeviceId, setPendingDeviceId] = useState<string | null>(null);

  const handleCommand = async (deviceId: string, command: DeviceCommand) => {
    setPendingDeviceId(deviceId);
    try {
      await deviceCommand.mutateAsync({ deviceId, command });
    } finally {
      setPendingDeviceId(null);
    }
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['smart-device-statuses'] });
  };

  // 통계
  const onlineCount = devices.filter(d => d.status?.online).length;
  const onCount = devices.filter(d => d.status?.switch === 'on').length;

  return (
    <Layout>
      <PageContainer width="narrow">
        {/* 헤더 - Glassmorphism */}
        <div className="relative rounded-2xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border border-white/20 dark:border-slate-700/30 shadow-lg shadow-slate-200/40 dark:shadow-slate-900/40 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 bg-gradient-to-r from-orange-600 to-amber-500 text-white px-2.5 py-1 rounded-md text-xs font-semibold shadow-sm">
                <Building2 className="h-3.5 w-3.5" />
                스마트 기기
              </span>
              <p className="text-sm text-slate-500 dark:text-slate-400">교실별 전원 상태 확인 및 제어</p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isStatusLoading}
                className="h-7 text-xs"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${isStatusLoading ? 'animate-spin' : ''}`} />
                새로고침
              </Button>

              {isAdmin && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPermissionDialog(true)}
                    className="h-7 text-xs"
                  >
                    <Shield className="h-3 w-3 mr-1" />
                    권한
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditDevice(null);
                      setShowMappingDialog(true);
                    }}
                    className="h-7 text-xs bg-orange-600 hover:bg-orange-700"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    기기 추가
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* 통계 pills */}
          {devices.length > 0 && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-700/30 flex-wrap">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/40">
                <Building2 className="h-3 w-3 text-slate-400" />
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{devices.length}개 등록</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/50 dark:border-emerald-800/30">
                <Wifi className="h-3 w-3 text-emerald-500" />
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">{onlineCount}개 온라인</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50/80 dark:bg-green-950/30 border border-green-200/50 dark:border-green-800/30">
                <Power className="h-3 w-3 text-green-500" />
                <span className="text-[11px] font-medium text-green-600 dark:text-green-400">{onCount}개 켜짐</span>
              </div>
            </div>
          )}
        </div>

        {/* 건물 정면도 */}
        <BuildingFloorView
          devices={devices}
          isLoading={isLoading}
          canControl={canControl}
          isAdmin={isAdmin ?? false}
          pendingDeviceId={pendingDeviceId}
          onCommand={handleCommand}
          onEdit={(device) => {
            setEditDevice(device);
            setShowMappingDialog(true);
          }}
          onFloorChange={(id, floor, currentMeta) => {
            updateFloor.mutate({ id, floor, currentMeta });
          }}
        />

        {/* 다이얼로그들 */}
        <DeviceMappingDialog
          open={showMappingDialog}
          onOpenChange={(open) => {
            setShowMappingDialog(open);
            if (!open) setEditDevice(null);
          }}
          editDevice={editDevice}
        />

        {isAdmin && (
          <DevicePermissionDialog
            open={showPermissionDialog}
            onOpenChange={setShowPermissionDialog}
          />
        )}

        {/* 삭제 확인 */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>기기 삭제</AlertDialogTitle>
              <AlertDialogDescription>
                "{deleteTarget?.label}" 기기를 목록에서 삭제하시겠습니까?
                SmartThings 연결은 유지됩니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction onClick={async () => {
                if (!deleteTarget) return;
                await deleteDevice.mutateAsync(deleteTarget.id);
                setDeleteTarget(null);
              }}>삭제</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageContainer>
    </Layout>
  );
};

export default SmartDevices;
