import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  AUTH_TIMESTAMP_KEY, PERSONAL_DEVICE_KEY, PERSONAL_DEVICE_CHANGED,
  isDailySessionExpired, readPersonalDeviceUser, setPersonalDevice, shouldExpireSession, syncPersonalDeviceSession,
} from '../personalDevice';

const storage = new Map<string, string>();
const events = new EventTarget();
beforeEach(() => {
  storage.clear();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: events });
});

test('ordinary sessions expire exactly at the next local 5 AM', () => {
  const beforeFive = new Date(2026, 8, 8, 4, 30).getTime().toString();
  assert.equal(isDailySessionExpired(beforeFive, new Date(2026, 8, 8, 4, 59, 59)), false);
  assert.equal(isDailySessionExpired(beforeFive, new Date(2026, 8, 8, 5)), true);
  const atFive = new Date(2026, 8, 8, 5).getTime().toString();
  assert.equal(isDailySessionExpired(atFive, new Date(2026, 8, 9, 4, 59, 59)), false);
  assert.equal(isDailySessionExpired(atFive, new Date(2026, 8, 9, 5)), true);
});

test('a registered account survives daily resets and browser state restoration', () => {
  storage.set(AUTH_TIMESTAMP_KEY, '1000');
  setPersonalDevice('user-a');
  assert.equal(readPersonalDeviceUser(), 'user-a');
  assert.equal(shouldExpireSession('user-a', 'teacher'), false);
  assert.equal(shouldExpireSession('user-b', 'teacher'), true);
});

test('removing registration restores daily expiry and notifies the current tab', () => {
  let count = 0;
  const listener = () => { count++; };
  events.addEventListener(PERSONAL_DEVICE_CHANGED, listener);
  storage.set(AUTH_TIMESTAMP_KEY, '1000');
  setPersonalDevice('user-a');
  setPersonalDevice(null);
  assert.equal(readPersonalDeviceUser(), null);
  assert.equal(shouldExpireSession('user-a', 'student'), true);
  assert.equal(count, 2);
  events.removeEventListener(PERSONAL_DEVICE_CHANGED, listener);
});

test('revocation in another tab is read immediately; existing admin exemption remains', () => {
  storage.set(AUTH_TIMESTAMP_KEY, '1000');
  setPersonalDevice('user-a');
  storage.delete(PERSONAL_DEVICE_KEY);
  assert.equal(shouldExpireSession('user-a', 'teacher'), true);
  assert.equal(shouldExpireSession('user-a', 'admin'), false);
});

test('missing, corrupt and future timestamps fail closed', () => {
  for (const value of [null, '', 'abc', 'NaN', '0', '-1', 'Infinity', '1e300', String(Date.now() + 86400000)]) {
    assert.equal(isDailySessionExpired(value), true, String(value));
  }
});

test('blocked browser storage cannot grant a personal-device exemption', () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => {
    throw new Error('Storage disabled');
  } });
  assert.equal(readPersonalDeviceUser(), null);
  assert.equal(shouldExpireSession('user-a', 'teacher'), true);
  assert.throws(() => setPersonalDevice('user-a'), /Storage disabled/);
});

test('session restoration and refresh preserve registration, switching accounts removes it', () => {
  setPersonalDevice('user-a');
  syncPersonalDeviceSession('user-a');
  syncPersonalDeviceSession('user-a');
  assert.equal(readPersonalDeviceUser(), 'user-a');
  syncPersonalDeviceSession('user-b');
  assert.equal(readPersonalDeviceUser(), null);
  syncPersonalDeviceSession('user-a');
  assert.equal(readPersonalDeviceUser(), null);
});

test('sign-out or a revoked session removes registration before the next login', () => {
  setPersonalDevice('user-a');
  syncPersonalDeviceSession(null);
  assert.equal(readPersonalDeviceUser(), null);
  syncPersonalDeviceSession('user-a');
  assert.equal(readPersonalDeviceUser(), null);
});
