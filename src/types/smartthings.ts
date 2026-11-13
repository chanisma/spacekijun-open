// SmartThings 디바이스 DB 레코드 (smart_devices 테이블)
export interface SmartDevice {
  id: string;
  device_id: string;
  label: string;
  room_name: string | null;
  resource_id: string | null;
  device_type: string;
  is_active: boolean;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// SmartThings API에서 반환하는 디바이스 정보
export interface SmartThingsApiDevice {
  deviceId: string;
  name: string;
  label: string;
  locationId: string;
  roomId?: string;
  type: string;
  components: {
    id: string;
    label: string;
    capabilities: { id: string; version: number }[];
  }[];
}

// 디바이스 실시간 상태
export interface DeviceStatus {
  switch: 'on' | 'off';
  online: boolean;
  power?: number;         // Watts (실시간)
  energy?: number;        // Wh (누적)
  deltaEnergy?: number;   // Wh (기간 내)
  lastUpdated: string;
}

// DB 디바이스 + 실시간 상태 결합
export interface SmartDeviceWithStatus extends SmartDevice {
  status: DeviceStatus | null;
  loading?: boolean;
}

// 디바이스 제어 권한
export interface SmartDevicePermission {
  id: string;
  user_id: string;
  can_control: boolean;
  granted_by: string | null;
  created_at: string;
  // Joined fields
  user_name?: string;
  user_email?: string;
}

// 디바이스 명령
export type DeviceCommand = 'on' | 'off';

// SmartThings Location (장소)
export interface SmartThingsLocation {
  locationId: string;
  name: string;
}

// SmartThings Location 목록 응답
export interface SmartThingsLocationListResponse {
  items: SmartThingsLocation[];
}

// Edge Function 요청 액션
export type SmartThingsAction =
  | 'listLocations'
  | 'listDevices'
  | 'getDeviceStatus'
  | 'getDeviceHealth'
  | 'getMultipleDeviceStatuses'
  | 'sendCommand';

// Edge Function 응답
export interface SmartThingsProxyResponse<T = unknown> {
  result?: T;
  error?: string;
}

// 디바이스 등록 폼 데이터
export interface SmartDeviceFormData {
  device_id: string;
  label: string;
  room_name?: string;
  resource_id?: string;
}

// SmartThings API 디바이스 목록 응답
export interface SmartThingsDeviceListResponse {
  items: SmartThingsApiDevice[];
}

// 디바이스 상태 응답 (Edge Function getMultipleDeviceStatuses)
export interface DeviceStatusResult {
  deviceId: string;
  status?: {
    components: {
      main: {
        switch?: { switch: { value: 'on' | 'off'; timestamp: string } };
        powerConsumptionReport?: {
          powerConsumption: {
            value: {
              power: number;
              energy: number;
              deltaEnergy: number;
            };
            timestamp: string;
          };
        };
        powerMeter?: {
          power: { value: number; unit: string; timestamp: string };
        };
      };
    };
  };
  health?: { state: 'ONLINE' | 'OFFLINE' | 'UNHEALTHY' | 'UNKNOWN' };
  error?: string;
}
