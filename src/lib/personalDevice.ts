// A browser-local session preference, never an authorization or identity claim.
export const PERSONAL_DEVICE_KEY = 'spacekijun_personal_device_user';
export const PERSONAL_DEVICE_CHANGED = 'spacekijun:personal-device-changed';
export const AUTH_TIMESTAMP_KEY = 'auth_login_timestamp';

export function readPersonalDeviceUser(): string | null {
  try {
    return localStorage.getItem(PERSONAL_DEVICE_KEY);
  } catch {
    return null;
  }
}

export function setPersonalDevice(userId: string | null): void {
  if (userId) {
    localStorage.setItem(PERSONAL_DEVICE_KEY, userId);
    if (readPersonalDeviceUser() !== userId) {
      throw new Error('이 브라우저에서 개인기기 설정을 저장할 수 없습니다.');
    }
  } else {
    localStorage.removeItem(PERSONAL_DEVICE_KEY);
  }
  window.dispatchEvent(new Event(PERSONAL_DEVICE_CHANGED));
}

// Auth callbacks must still complete if browser storage becomes unavailable.
export function syncPersonalDeviceSession(userId: string | null): void {
  const registeredUser = readPersonalDeviceUser();
  if (registeredUser && registeredUser !== userId) {
    try {
      setPersonalDevice(null);
    } catch (error) {
      console.error('개인기기 등록 해제 실패:', error);
    }
  }
}

export function isDailySessionExpired(
  loginTimestamp: string | null,
  now = new Date(),
): boolean {
  if (!loginTimestamp) return true;
  const timestamp = Number(loginTimestamp);
  if (!Number.isFinite(timestamp) || timestamp <= 0 || timestamp > now.getTime()) return true;
  const loginDate = new Date(timestamp);
  const expiration = new Date(loginDate);
  expiration.setHours(5, 0, 0, 0);
  if (loginDate >= expiration) expiration.setDate(expiration.getDate() + 1);
  return now >= expiration;
}

export function shouldExpireSession(userId: string, role?: string | null): boolean {
  if (role === 'admin' || readPersonalDeviceUser() === userId) return false;
  try {
    return isDailySessionExpired(localStorage.getItem(AUTH_TIMESTAMP_KEY));
  } catch {
    return true;
  }
}
