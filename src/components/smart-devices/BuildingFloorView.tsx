import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Building2, Loader2, PlugZap, GripVertical, ArrowDownUp } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  useDroppable,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { RoomDeviceCell } from './RoomDeviceCell';
import { Button } from '@/components/ui/button';
import type { SmartDeviceWithStatus, DeviceCommand } from '@/types/smartthings';

// ─── 건물 층 구성 ─────────────────────────────
export const BUILDING_FLOORS = [
  { floor: 5, label: '1학년', keywords: ['1학년', '1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '1-8', '1-9'] },
  { floor: 4, label: '', keywords: [] },
  { floor: 3, label: '공용실', keywords: ['공용', '컴퓨터', '과학', '음악', '미술', '도서', '시청각', '상담', '방송'] },
  { floor: 2, label: '', keywords: [] },
  { floor: 1, label: '', keywords: [] },
] as const;

export function assignFloor(device: SmartDeviceWithStatus): number | null {
  // 1. meta.floor가 명시적으로 설정되어 있으면 우선
  const metaFloor = (device.meta as Record<string, unknown>)?.floor;
  if (typeof metaFloor === 'number') return metaFloor;

  // 2. room_name 키워드 매칭 폴백
  const roomName = device.room_name;
  if (!roomName) return null;
  const lower = roomName.toLowerCase();
  for (const cfg of BUILDING_FLOORS) {
    if (cfg.keywords.some(kw => lower.includes(kw.toLowerCase()))) {
      return cfg.floor;
    }
  }
  return null;
}

// ─── Droppable Floor ──────────────────────────
function DroppableFloor({
  floorNumber,
  isOver,
  children,
}: {
  floorNumber: number | 'unassigned';
  isOver?: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver: dropping } = useDroppable({
    id: `floor-${floorNumber}`,
    data: { floor: floorNumber },
  });

  const active = isOver || dropping;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'transition-all duration-200 rounded-lg',
        active && 'ring-2 ring-orange-400/60 bg-orange-50/30 dark:bg-orange-950/10',
      )}
    >
      {children}
    </div>
  );
}

// ─── Main Component ───────────────────────────
interface BuildingFloorViewProps {
  devices: SmartDeviceWithStatus[];
  isLoading: boolean;
  canControl: boolean;
  isAdmin: boolean;
  pendingDeviceId: string | null;
  onCommand: (deviceId: string, command: DeviceCommand) => void;
  onEdit?: (device: SmartDeviceWithStatus) => void;
  onFloorChange?: (deviceId: string, floor: number | null, currentMeta: Record<string, unknown>) => void;
}

export function BuildingFloorView({
  devices,
  isLoading,
  canControl,
  isAdmin,
  pendingDeviceId,
  onCommand,
  onEdit,
  onFloorChange,
}: BuildingFloorViewProps) {
  const [isDndMode, setIsDndMode] = useState(false);
  const [activeDevice, setActiveDevice] = useState<SmartDeviceWithStatus | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <PlugZap className="h-12 w-12 mb-3 opacity-40" />
        <p className="text-sm">등록된 스마트 기기가 없습니다.</p>
        {isAdmin && (
          <p className="text-xs mt-1">상단의 "기기 추가" 버튼으로 등록하세요.</p>
        )}
      </div>
    );
  }

  // 디바이스를 층별로 분류
  const floorDevices = new Map<number, SmartDeviceWithStatus[]>();
  const unassigned: SmartDeviceWithStatus[] = [];

  for (const device of devices) {
    const floor = assignFloor(device);
    if (floor !== null) {
      const arr = floorDevices.get(floor) ?? [];
      arr.push(device);
      floorDevices.set(floor, arr);
    } else {
      unassigned.push(device);
    }
  }

  const getFloorStats = (floorDevs: SmartDeviceWithStatus[]) => {
    const on = floorDevs.filter(d => d.status?.switch === 'on').length;
    return { total: floorDevs.length, on };
  };

  const handleDragStart = (event: DragStartEvent) => {
    const device = event.active.data.current?.device as SmartDeviceWithStatus | undefined;
    setActiveDevice(device ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDevice(null);
    const { active, over } = event;
    if (!over || !onFloorChange) return;

    const device = active.data.current?.device as SmartDeviceWithStatus | undefined;
    if (!device) return;

    const targetFloor = over.data.current?.floor as number | 'unassigned' | undefined;
    if (targetFloor === undefined) return;

    const newFloor = targetFloor === 'unassigned' ? null : targetFloor;
    const currentFloor = assignFloor(device);

    // 같은 층이면 무시
    if (newFloor === currentFloor) return;

    onFloorChange(device.id, newFloor, (device.meta as Record<string, unknown>) ?? {});
  };

  const renderFloorRow = (cfg: typeof BUILDING_FLOORS[number]) => {
    const floorDevs = floorDevices.get(cfg.floor) ?? [];
    const hasDevices = floorDevs.length > 0;
    const stats = getFloorStats(floorDevs);

    const content = (
      <div
        className={cn(
          'border-b border-slate-200/80 dark:border-slate-700/50 transition-all',
          hasDevices ? 'py-4 px-4 sm:px-6' : 'py-2.5 px-4 sm:px-6',
          isDndMode && !hasDevices && 'py-4 px-4 sm:px-6',
        )}
      >
        <div className="flex items-start gap-3 sm:gap-4">
          {/* 층 번호 */}
          <div className={cn(
            'flex flex-col items-center shrink-0 w-14',
            hasDevices || isDndMode ? 'pt-1' : 'pt-0',
          )}>
            <span className={cn(
              'text-lg font-bold tracking-tight',
              hasDevices ? 'text-slate-700 dark:text-slate-200' : 'text-slate-300 dark:text-slate-600',
            )}>
              {cfg.floor}F
            </span>
            {cfg.label && (
              <span className={cn(
                'text-[10px] font-medium mt-0.5',
                hasDevices ? 'text-slate-500 dark:text-slate-400' : 'text-slate-300 dark:text-slate-600',
              )}>
                {cfg.label}
              </span>
            )}
            {hasDevices && (
              <div className="flex items-center gap-1 mt-1.5">
                <div className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  stats.on > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-300',
                )} />
                <span className="text-[9px] text-slate-400">
                  {stats.on}/{stats.total}
                </span>
              </div>
            )}
          </div>

          {/* 구분선 */}
          <div className={cn(
            'w-px self-stretch shrink-0',
            hasDevices ? 'bg-slate-200 dark:bg-slate-700' : 'bg-slate-100 dark:bg-slate-800',
          )} />

          {/* 교실 영역 */}
          {hasDevices ? (
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap gap-2">
                {floorDevs
                  .sort((a, b) => (a.room_name ?? a.label).localeCompare(b.room_name ?? b.label, 'ko'))
                  .map((device) => (
                    <RoomDeviceCell
                      key={device.id}
                      device={device}
                      canControl={canControl}
                      isPending={pendingDeviceId === device.device_id}
                      isAdmin={isAdmin}
                      isDndEnabled={isDndMode}
                      onCommand={onCommand}
                      onEdit={onEdit}
                    />
                  ))}
              </div>
            </div>
          ) : (
            <div className={cn(
              'flex-1 flex items-center',
              isDndMode ? 'min-h-[60px] py-2' : 'py-0.5',
            )}>
              <span className={cn(
                'text-xs italic',
                isDndMode
                  ? 'text-orange-400/80 dark:text-orange-500/60'
                  : 'text-slate-300 dark:text-slate-600',
              )}>
                {isDndMode ? '여기에 기기를 드래그하세요' : '스마트기기 미등록'}
              </span>
            </div>
          )}
        </div>
      </div>
    );

    if (isDndMode) {
      return (
        <DroppableFloor key={cfg.floor} floorNumber={cfg.floor}>
          {content}
        </DroppableFloor>
      );
    }

    return <div key={cfg.floor}>{content}</div>;
  };

  const buildingContent = (
    <div className="space-y-0">
      {/* 배치 모드 토글 */}
      {isAdmin && devices.length > 0 && (
        <div className="flex justify-end mb-2 mx-auto max-w-5xl">
          <Button
            variant={isDndMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => setIsDndMode(!isDndMode)}
            className={cn(
              'h-7 text-xs gap-1.5',
              isDndMode && 'bg-orange-600 hover:bg-orange-700',
            )}
          >
            {isDndMode ? <GripVertical className="h-3 w-3" /> : <ArrowDownUp className="h-3 w-3" />}
            {isDndMode ? '배치 완료' : '층 배치'}
          </Button>
        </div>
      )}

      {/* 건물 지붕 */}
      <div className="relative mx-auto max-w-5xl">
        <div className="h-3 bg-gradient-to-b from-slate-400 to-slate-500 dark:from-slate-500 dark:to-slate-600 rounded-t-2xl mx-4" />
        <div className="h-1.5 bg-slate-500 dark:bg-slate-600 mx-2 rounded-t-sm" />
      </div>

      {/* 건물 본체 */}
      <div className="relative mx-auto max-w-5xl border-x-4 border-slate-300/80 dark:border-slate-600/60 bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950">
        {BUILDING_FLOORS.map(renderFloorRow)}
      </div>

      {/* 건물 기초 */}
      <div className="relative mx-auto max-w-5xl">
        <div className="h-2 bg-slate-400 dark:bg-slate-600 mx-1 rounded-b-sm" />
        <div className="h-1 bg-slate-500 dark:bg-slate-700 rounded-b-lg" />
      </div>

      {/* 미분류 디바이스 */}
      {(unassigned.length > 0 || isDndMode) && (
        <div className="mt-6 mx-auto max-w-5xl">
          <div className="flex items-center gap-2 mb-3 px-1">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">미분류 기기</span>
            <span className="text-xs text-slate-400">
              {isDndMode ? '건물 층으로 드래그하여 배치하세요' : '교실/장소를 설정하면 건물에 표시됩니다'}
            </span>
          </div>
          {isDndMode ? (
            <DroppableFloor floorNumber="unassigned">
              <div className={cn(
                'flex flex-wrap gap-2 px-1 min-h-[60px] rounded-lg p-3 transition-all',
                unassigned.length === 0 && 'border-2 border-dashed border-slate-200 dark:border-slate-700',
              )}>
                {unassigned.length > 0 ? (
                  unassigned.map((device) => (
                    <RoomDeviceCell
                      key={device.id}
                      device={device}
                      canControl={canControl}
                      isPending={pendingDeviceId === device.device_id}
                      isAdmin={isAdmin}
                      isDndEnabled={isDndMode}
                      onCommand={onCommand}
                      onEdit={onEdit}
                    />
                  ))
                ) : (
                  <span className="text-xs text-slate-300 italic self-center">
                    모든 기기가 배치되었습니다
                  </span>
                )}
              </div>
            </DroppableFloor>
          ) : (
            <div className="flex flex-wrap gap-2 px-1">
              {unassigned.map((device) => (
                <RoomDeviceCell
                  key={device.id}
                  device={device}
                  canControl={canControl}
                  isPending={pendingDeviceId === device.device_id}
                  isAdmin={isAdmin}
                  onCommand={onCommand}
                  onEdit={onEdit}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  // DnD 모드가 아니면 DndContext 없이 렌더
  if (!isDndMode) return buildingContent;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {buildingContent}

      {/* 드래그 오버레이 */}
      <DragOverlay dropAnimation={null}>
        {activeDevice && (
          <div className="opacity-90 rotate-2 scale-105 pointer-events-none">
            <RoomDeviceCell
              device={activeDevice}
              canControl={false}
              isPending={false}
              isAdmin={false}
              onCommand={() => {}}
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
