/**
 * 휴대폰 앱(안드로이드 APK) 내려받기 (2026-11-10) — «PC 앱» 페이지(`/desktop-app`)에 함께 보인다.
 *
 * 배포본은 Supabase Storage 공개 버킷 `desk-releases/<채널>/` 에 있다. 올리기 = NEIS_helper 쪽 스크립트:
 *   - web-android        스페이스기전 앱(TWA — spacekijun.lovable.app 을 주소창 없이)  `deploy/web-android/build.py --publish`
 *   - classroom-android  스페이스기전 교실(안드로이드 전자칠판)                     `deploy/classroom-android/build.py --publish`
 *
 *   latest.json = { app, version, versionCode, file, size, sha256, certificate, published }
 *   <file> = 판 번호가 붙은 APK (오래 캐시) — 받기 단추는 이 주소로 바로 간다.
 *
 * 데스크와 달리 목록에 서명이 없다. 대신 APK 자체가 앱 서명 키로 서명돼 있어, 안드로이드가 깔 때·덮어쓸 때 확인한다
 * (다른 키로 서명된 APK 는 깔린 앱을 덮어쓰지 못한다). 여기서는 목록 모양만 확인한다.
 */
import { DESKTOP_RELEASE_BASE } from './desktopApps';

export type AndroidAppChannel = 'web-android' | 'classroom-android';

export interface AndroidAppInfo {
  channel: AndroidAppChannel;
  name: string;
  audience: string;
  summary: string;
  features: string[];
  /** 학생에게도 보이나 */
  students: boolean;
}

export const ANDROID_APPS: Record<AndroidAppChannel, AndroidAppInfo> = {
  'web-android': {
    channel: 'web-android',
    name: '스페이스기전 앱',
    audience: '휴대폰 · 모두',
    summary: '스페이스기전을 휴대폰 앱처럼 — 주소창 없이 바로 열리고, 알림을 받습니다.',
    features: ['홈 화면 아이콘으로 바로 열기', '스페이스기전 알림(푸시)', '쪽지 · 메모 · 내 PC 에이전트와 대화'],
    students: true,
  },
  'classroom-android': {
    channel: 'classroom-android',
    name: '스페이스기전 교실',
    audience: '전자칠판 · 교직원',
    summary: '안드로이드 전자칠판에 까는 수업 도구 — 칠판의 QR 을 휴대폰으로 찍어 고른 수업 화면을 띄웁니다.',
    features: ['QR 한 번으로 수업 화면(사이트·구글 앱·파일)', '수업이 끝나면 고친 파일 올리고 로그인 지우기', '새 판은 앱이 스스로 받아 둠'],
    students: false,
  },
};

export function androidAppsForViewer({ isStudentView }: { isStudentView: boolean }): AndroidAppChannel[] {
  return (Object.keys(ANDROID_APPS) as AndroidAppChannel[]).filter((channel) => !isStudentView || ANDROID_APPS[channel].students);
}

export interface AndroidRelease {
  version: string;
  versionCode: number;
  file: string;
  size: number;
  sha256: string;
  published?: string;
  /** 받기 주소 */
  url: string;
}

const FILE = /^Spacekijun[A-Za-z]+-[0-9.]{1,20}\.apk$/;

export function parseAndroidRelease(channel: AndroidAppChannel, value: unknown): AndroidRelease {
  const data = (value ?? {}) as Record<string, unknown>;
  const { version, versionCode, file, size, sha256, published } = data;
  if (typeof version !== 'string' || !/^\d{1,4}(\.\d{1,4}){1,3}$/.test(version)
      || typeof versionCode !== 'number' || !Number.isSafeInteger(versionCode) || versionCode < 1
      || typeof file !== 'string' || !FILE.test(file)
      || typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0 || size > 200 * 1024 * 1024
      || typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) {
    throw new Error('앱 배포 목록의 모양이 올바르지 않습니다.');
  }
  return { version, versionCode, file, size, sha256, published: typeof published === 'string' ? published : undefined,
           url: `${DESKTOP_RELEASE_BASE}/${channel}/${file}` };
}

export async function fetchAndroidRelease(channel: AndroidAppChannel): Promise<AndroidRelease> {
  let response: Response;
  try {
    response = await fetch(`${DESKTOP_RELEASE_BASE}/${channel}/latest.json?t=${Date.now()}`, { cache: 'no-store' });
  } catch {
    throw new Error('배포 목록을 받지 못했습니다. 인터넷 연결을 확인해 주세요.');
  }
  if (response.status === 400 || response.status === 404) throw new Error('아직 올라간 판이 없습니다.');
  if (!response.ok) throw new Error(`배포 목록을 받지 못했습니다 (${response.status}).`);
  return parseAndroidRelease(channel, await response.json());
}

export function isAndroidDevice(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}
