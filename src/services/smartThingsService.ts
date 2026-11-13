import { supabase } from '@/integrations/supabase/client';
import type {
  SmartDevice,
  SmartDevicePermission,
  SmartDeviceFormData,
  SmartThingsAction,
  SmartThingsProxyResponse,
  SmartThingsDeviceListResponse,
  SmartThingsLocationListResponse,
  DeviceStatusResult,
  DeviceStatus,
  DeviceCommand,
} from '@/types/smartthings';

export class SmartThingsService {
  // ─── Edge Function Proxy ───────────────────────

  private static async callProxy<T = unknown>(
    action: SmartThingsAction,
    params: Record<string, unknown> = {}
  ): Promise<T> {
    const { data, error } = await supabase.functions.invoke('smartthings-proxy', {
      body: { action, ...params },
    });

    if (error) {
      throw new Error(error.message || 'Edge Function 호출 실패');
    }

    const response = data as SmartThingsProxyResponse<T>;
    if (response.error) {
      throw new Error(response.error);
    }

    return response.result as T;
  }

  // ─── SmartThings API (via Proxy) ───────────────

  /** SmartThings 장소(Location) 목록 조회 */
  static async listLocations(): Promise<SmartThingsLocationListResponse> {
    return this.callProxy<SmartThingsLocationListResponse>('listLocations');
  }

  /** SmartThings에 등록된 switch 디바이스 목록 (locationId로 장소 필터링 가능) */
  static async listSmartThingsDevices(locationId?: string): Promise<SmartThingsDeviceListResponse> {
    const params: Record<string, unknown> = {};
    if (locationId) params.locationId = locationId;
    return this.callProxy<SmartThingsDeviceListResponse>('listDevices', params);
  }

  /** 여러 디바이스 상태 일괄 조회 */
  static async getMultipleDeviceStatuses(deviceIds: string[]): Promise<DeviceStatusResult[]> {
    return this.callProxy<DeviceStatusResult[]>('getMultipleDeviceStatuses', { deviceIds });
  }

  /** 전원 제어 명령 */
  static async sendCommand(deviceId: string, command: DeviceCommand): Promise<void> {
    await this.callProxy('sendCommand', { deviceId, command });
  }

  // ─── 상태 파싱 ─────────────────────────────────

  /** Edge Function 응답을 DeviceStatus로 변환 */
  static parseDeviceStatus(result: DeviceStatusResult): DeviceStatus | null {
    if (result.error) return null;

    try {
      const main = result.status?.components?.main;
      const switchVal = main?.switch?.switch?.value ?? 'off';
      const online = result.health?.state === 'ONLINE';

      // powerConsumptionReport 또는 powerMeter에서 전력값 추출
      const powerReport = main?.powerConsumptionReport?.powerConsumption?.value;
      const powerMeter = main?.powerMeter?.power?.value;

      return {
        switch: switchVal as 'on' | 'off',
        online,
        power: powerReport?.power ?? powerMeter ?? undefined,
        energy: powerReport?.energy ?? undefined,
        deltaEnergy: powerReport?.deltaEnergy ?? undefined,
        lastUpdated: main?.switch?.switch?.timestamp ?? new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  // ─── DB: 디바이스 매핑 CRUD ────────────────────

  /** DB에 등록된 디바이스 매핑 전체 조회 */
  static async getDevices(): Promise<SmartDevice[]> {
    const { data, error } = await supabase
      .from('smart_devices')
      .select('*')
      .order('room_name', { ascending: true, nullsFirst: false });

    if (error) throw new Error(`디바이스 목록 조회 실패: ${error.message}`);
    return (data as unknown as SmartDevice[]) ?? [];
  }

  /** 디바이스 매핑 등록 */
  static async addDevice(form: SmartDeviceFormData): Promise<SmartDevice> {
    const { data, error } = await supabase
      .from('smart_devices')
      .insert([{
        device_id: form.device_id,
        label: form.label,
        room_name: form.room_name || null,
        resource_id: form.resource_id || null,
      }])
      .select()
      .single();

    if (error) throw new Error(`디바이스 등록 실패: ${error.message}`);
    return data as unknown as SmartDevice;
  }

  /** 디바이스 매핑 수정 */
  static async updateDevice(id: string, updates: Partial<SmartDeviceFormData>): Promise<SmartDevice> {
    const { data, error } = await supabase
      .from('smart_devices')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`디바이스 수정 실패: ${error.message}`);
    return data as unknown as SmartDevice;
  }

  /** 디바이스 층 배치 변경 (meta.floor 업데이트) */
  static async updateDeviceFloor(id: string, floor: number | null, currentMeta: Record<string, unknown>): Promise<void> {
    const newMeta = { ...currentMeta, floor };
    const { error } = await supabase
      .from('smart_devices')
      .update({ meta: newMeta })
      .eq('id', id);

    if (error) throw new Error(`층 배치 변경 실패: ${error.message}`);
  }

  /** 디바이스 매핑 삭제 */
  static async deleteDevice(id: string): Promise<void> {
    const { error } = await supabase
      .from('smart_devices')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`디바이스 삭제 실패: ${error.message}`);
  }

  // ─── DB: 제어 권한 관리 ────────────────────────

  /** 제어 권한 목록 조회 (profiles join) */
  static async getPermissions(): Promise<SmartDevicePermission[]> {
    const { data, error } = await supabase
      .from('smart_device_permissions')
      .select('*');

    if (error) throw new Error(`권한 목록 조회 실패: ${error.message}`);

    // profiles 테이블에서 이름 조회
    const perms = (data as unknown as SmartDevicePermission[]) ?? [];
    if (perms.length === 0) return perms;

    const userIds = perms.map(p => p.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, email')
      .in('id', userIds);

    const profileMap = new Map(profiles?.map(p => [p.id, p]) ?? []);
    return perms.map(p => ({
      ...p,
      user_name: profileMap.get(p.user_id)?.name ?? undefined,
      user_email: profileMap.get(p.user_id)?.email ?? undefined,
    }));
  }

  /** 제어 권한 부여 */
  static async grantPermission(userId: string, grantedBy: string): Promise<void> {
    const { error } = await supabase
      .from('smart_device_permissions')
      .upsert({
        user_id: userId,
        can_control: true,
        granted_by: grantedBy,
      }, { onConflict: 'user_id' });

    if (error) throw new Error(`권한 부여 실패: ${error.message}`);
  }

  /** 제어 권한 철회 */
  static async revokePermission(userId: string): Promise<void> {
    const { error } = await supabase
      .from('smart_device_permissions')
      .delete()
      .eq('user_id', userId);

    if (error) throw new Error(`권한 철회 실패: ${error.message}`);
  }

  /** 현재 사용자의 제어 권한 확인 */
  static async checkMyPermission(): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // Admin 확인
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role === 'admin') return true;

    // 권한 테이블 확인
    const { data: perm } = await supabase
      .from('smart_device_permissions')
      .select('can_control')
      .eq('user_id', user.id)
      .single();

    return perm?.can_control === true;
  }
}
