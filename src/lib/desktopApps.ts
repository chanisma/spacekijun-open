/**
 * PC 앱 내려받기 (2026-10-20) — 스페이스기전 데스크(교직원) · 스페이스기전 학생(학생).
 *
 * 배포본은 이미 Supabase Storage 공개 버킷 `desk-releases/<채널>/` 에 있다. 앱의 자동 업데이트가 읽는 바로 그
 * 자리다(NEIS_helper `app/core/updater.py`, 올리기 = `deploy/desk-update/publish.py`). 웹은 새로 올리지 않고 그것을
 * 그대로 받는다:
 *
 *   latest.json = { manifest: {app, version, size, sha256, parts[{name,size,sha256}], published}, signature }
 *   <버전>/<앱>.exe.partN = 20MB 조각
 *
 * - 조각을 받아 이어 붙이고 조각마다·전체의 SHA-256 을 목록과 맞춘다(업데이터와 같은 확인).
 * - 목록의 **Ed25519 서명**을 업데이터와 같은 공개 키로 확인한다. 저장소 계정이 털려도 남의 실행 파일을 내려주지
 *   않기 위해서다 — 서명을 확인할 수 없는 브라우저(아주 옛 판)에서는 받지 않고 브라우저를 새로 하라고 말한다.
 * - ⚠️ 서명된 바이트 = Python `json.dumps(manifest, sort_keys=True, separators=(',',':'), ensure_ascii=True)`.
 *   `canonicalJson` 이 그것을 그대로 다시 만든다. 한 글자라도 다르면 «서명 불일치»가 된다(회귀가 Python 과 대조).
 * - ⚠️ `PUBLIC_KEY` 는 `updater.py` 의 PUBLIC_KEY 와 같아야 한다. 서명 키를 바꾸면 이곳도 함께 바꿀 것.
 */

export type DesktopAppChannel = 'teacher' | 'student';

export interface DesktopAppInfo {
  channel: DesktopAppChannel;
  /** 실행 파일 이름(확장자 없이) = 목록의 `app` */
  app: 'SpacekijunDesk' | 'SpacekijunStudent';
  name: string;
  englishName: string;
  audience: string;
  summary: string;
  features: string[];
}

export const DESKTOP_APPS: Record<DesktopAppChannel, DesktopAppInfo> = {
  teacher: {
    channel: 'teacher',
    app: 'SpacekijunDesk',
    name: '스페이스기전 데스크',
    englishName: 'SPACEKIJUN Desktop',
    audience: '교직원용',
    summary: '스페이스기전을 PC 프로그램으로 — 알림을 바로 받고, 업무에 쓰는 학교 사이트를 한곳에서 엽니다.',
    features: ['스페이스기전 알림을 PC 에서 바로', '나이스·업무포털·에듀파인·쿨메신저 바로가기', '캡처·클립보드 도구'],
  },
  student: {
    channel: 'student',
    app: 'SpacekijunStudent',
    name: '스페이스기전 학생',
    englishName: 'SPACEKIJUN Student',
    audience: '학생용',
    summary: '학생이 쓰는 학교 사이트와 스페이스기전의 학생 기능을 PC 화면 가장자리의 독에 모았습니다.',
    features: ['스페이스기전·Google 클래스룸·기전시트온·리로스쿨 바로가기', '다마고찌·별까지 쌓기·시간표·일정', '캡처·클립보드 도구'],
  },
};

/** 누구에게 어느 앱을 보여 줄까 — 학생(미리보기 포함)은 학생판, 그 밖은 데스크. 실제 관리자는 둘 다(배포 확인용). */
export function desktopAppsForViewer({ isStudentView, isRealAdmin }: { isStudentView: boolean; isRealAdmin: boolean }): DesktopAppChannel[] {
  if (isStudentView) return ['student'];
  return isRealAdmin ? ['teacher', 'student'] : ['teacher'];
}

// ---------------------------------------------------------------- 사용 안내 영상

/**
 * 유튜브 사용 안내 영상. `id` = 유튜브 영상 id(주소의 v= 뒤 11자). 비어 있으면 영상 칸을 그리지 않는다.
 * `channel` = 어느 앱의 안내인가(그 앱을 보는 사람에게만 보인다), 생략하면 모두에게.
 */
export interface GuideVideo {
  id: string;
  title: string;
  channel?: DesktopAppChannel;
}

export const DESKTOP_APP_GUIDE_VIDEOS: GuideVideo[] = [
  // 2026-10-19 일부 공개 — 데스크·학생판 독의 «에이전트 터미널» (영상 설명이 두 판을 함께 다룬다 → 모두에게)
  { id: 'jtt4hbKe_Nw', title: '에이전트 터미널 사용법과 활용 — Claude Code·Codex로 업무 맡기기' },
  // 2026-10-19 일부 공개 — 교실 PC 수업 도구(교사 연수 영상)
  { id: 'I2rJ6LEUlNM', title: '스페이스기전 교실 사용 방법 — QR 한 번으로 교실 PC에 수업 도구 펼치기', channel: 'teacher' },
];

export function guideVideosFor(channels: DesktopAppChannel[], videos: GuideVideo[] = DESKTOP_APP_GUIDE_VIDEOS): GuideVideo[] {
  return videos.filter((video) => YOUTUBE_ID.test(video.id) && (!video.channel || channels.includes(video.channel)));
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** 유튜브 주소(watch·youtu.be·shorts·embed)나 id 에서 id 를 꺼낸다. 못 꺼내면 null. */
export function youtubeIdOf(value: string): string | null {
  const text = value.trim();
  if (YOUTUBE_ID.test(text)) return text;
  const match = text.match(/(?:youtu\.be\/|[?&]v=|\/(?:shorts|embed|live)\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------- 배포 목록

export const DESKTOP_RELEASE_BASE = 'https://your-project-ref.supabase.co/storage/v1/object/public/desk-releases';
/** NEIS_helper `app/core/updater.py` PUBLIC_KEY 와 같은 값 */
export const DESKTOP_RELEASE_PUBLIC_KEY = '2446b283914417bacf07dfa2a26447f3e9979a80d0ca28b8396e32b9762c529a';

const MAX_SIZE = 400 * 1024 * 1024;
const VERSION = /^\d{1,4}(\.\d{1,4}){1,3}$/;
const HEX64 = /^[0-9a-f]{64}$/;

export interface ReleasePart {
  name: string;
  size: number;
  sha256: string;
}

export interface ReleaseManifest {
  app: string;
  version: string;
  size: number;
  sha256: string;
  parts: ReleasePart[];
  published?: string;
}

export interface ReleaseDocument {
  manifest: ReleaseManifest;
  signature: string;
}

export class DesktopReleaseError extends Error {
  constructor(message: string, readonly kind: 'format' | 'signature' | 'unsupported' | 'network' | 'integrity' | 'aborted' = 'format') {
    super(message);
    this.name = 'DesktopReleaseError';
  }
}

/** Python `json.dumps(v, sort_keys=True, separators=(',',':'), ensure_ascii=True)` 와 같은 문자열. */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    // 목록에는 정수만 있다. 실수는 Python repr 과 JS 표기가 갈릴 수 있으니 받지 않는다.
    if (!Number.isSafeInteger(value)) throw new DesktopReleaseError('업데이트 목록에 정수가 아닌 수가 있습니다.');
    return String(value);
  }
  if (typeof value === 'string') {
    // JSON.stringify 는 비ASCII·DEL 을 그대로 두므로 Python ensure_ascii 처럼 \uXXXX(소문자)로 바꾼다.
    return JSON.stringify(value).replace(/[\u007f-￿]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    // Python 은 코드 포인트 순, JS 기본 정렬은 UTF-16 단위 순 — 키가 ASCII 라 같다.
    return `{${Object.keys(record).sort().map((key) => `${canonicalJson(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  throw new DesktopReleaseError('업데이트 목록 형식이 올바르지 않습니다.');
}

/** 업데이터 `check_manifest` 와 같은 형식 확인(서명 제외). 통과하면 목록을, 아니면 던진다. */
export function checkReleaseDocument(document: unknown, channel: DesktopAppChannel): ReleaseDocument {
  const doc = document as Partial<ReleaseDocument> | null;
  if (!doc || typeof doc !== 'object' || !doc.manifest || typeof doc.manifest !== 'object'
      || typeof doc.signature !== 'string' || !/^[0-9a-f]{128}$/.test(doc.signature)) {
    throw new DesktopReleaseError('업데이트 목록 형식이 올바르지 않습니다.');
  }
  const manifest = doc.manifest as ReleaseManifest;
  const app = DESKTOP_APPS[channel].app;
  if (manifest.app !== app) throw new DesktopReleaseError('다른 프로그램의 배포 목록입니다.');
  if (typeof manifest.version !== 'string' || !VERSION.test(manifest.version)) throw new DesktopReleaseError('판 번호가 올바르지 않습니다.');
  const { size, sha256, parts } = manifest;
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_SIZE || typeof sha256 !== 'string' || !HEX64.test(sha256)
      || !Array.isArray(parts) || parts.length === 0 || parts.length > 64) {
    throw new DesktopReleaseError('배포 목록 내용이 올바르지 않습니다.');
  }
  const partName = new RegExp(`^${app}\\.exe\\.part\\d{1,3}$`);
  let total = 0;
  for (const part of parts) {
    if (!part || typeof part.name !== 'string' || !partName.test(part.name) || !Number.isSafeInteger(part.size) || part.size <= 0
        || typeof part.sha256 !== 'string' || !HEX64.test(part.sha256)) {
      throw new DesktopReleaseError('배포 조각 정보가 올바르지 않습니다.');
    }
    total += part.size;
  }
  if (total !== size) throw new DesktopReleaseError('배포 조각 크기가 맞지 않습니다.');
  return { manifest, signature: doc.signature };
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(data: BufferSource): Promise<string> {
  return bytesToHex(await crypto.subtle.digest('SHA-256', data));
}

/** 목록의 서명을 확인한다. 맞으면 끝, 틀리면 `signature`, 브라우저가 Ed25519 를 모르면 `unsupported` 로 던진다. */
export async function verifyReleaseSignature(doc: ReleaseDocument, publicKeyHex: string = DESKTOP_RELEASE_PUBLIC_KEY): Promise<void> {
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey('raw', hexToBytes(publicKeyHex), { name: 'Ed25519' }, false, ['verify']);
  } catch {
    throw new DesktopReleaseError('이 브라우저는 배포본의 서명을 확인하지 못합니다. 브라우저를 최신 판으로 업데이트한 뒤 다시 받아 주세요.', 'unsupported');
  }
  const data = new TextEncoder().encode(canonicalJson(doc.manifest));
  const ok = await crypto.subtle.verify({ name: 'Ed25519' }, key, hexToBytes(doc.signature), data);
  if (!ok) throw new DesktopReleaseError('배포 목록의 서명이 맞지 않습니다. 관리자에게 알려 주세요.', 'signature');
}

export function releaseUrl(channel: DesktopAppChannel, path: string): string {
  return `${DESKTOP_RELEASE_BASE}/${channel}/${path}`;
}

/** 지금 올라가 있는 판의 목록을 읽어 형식·서명까지 확인한다. */
export async function fetchLatestRelease(channel: DesktopAppChannel, fetcher: typeof fetch = fetch): Promise<ReleaseManifest> {
  let raw: unknown;
  try {
    const response = await fetcher(`${releaseUrl(channel, 'latest.json')}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    raw = await response.json();
  } catch {
    throw new DesktopReleaseError('배포 정보를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.', 'network');
  }
  const doc = checkReleaseDocument(raw, channel);
  await verifyReleaseSignature(doc);
  return doc.manifest;
}

export interface DownloadProgress {
  received: number;
  total: number;
  /** 받은 뒤 확인 중 */
  verifying: boolean;
}

/**
 * 조각을 받아 이어 붙이고 확인한 실행 파일 바이트를 돌려준다. 조각마다·전체 SHA-256 이 목록과 같아야 한다.
 * `manifest` 는 `fetchLatestRelease` 가 서명까지 확인한 것이어야 한다.
 */
export async function downloadRelease(
  channel: DesktopAppChannel,
  manifest: ReleaseManifest,
  onProgress?: (progress: DownloadProgress) => void,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<Uint8Array> {
  const whole = new Uint8Array(manifest.size);
  let offset = 0;
  const report = (verifying = false) => onProgress?.({ received: offset, total: manifest.size, verifying });
  report();
  for (const part of manifest.parts) {
    let response: Response;
    try {
      response = await fetcher(releaseUrl(channel, `${manifest.version}/${part.name}`), { signal });
    } catch (error) {
      if (signal?.aborted) throw new DesktopReleaseError('내려받기를 멈췄습니다.', 'aborted');
      throw new DesktopReleaseError('내려받는 중 연결이 끊겼습니다. 다시 시도해 주세요.', 'network');
    }
    if (!response.ok) throw new DesktopReleaseError('배포 파일을 찾지 못했습니다. 잠시 뒤 다시 시도해 주세요.', 'network');
    const start = offset;
    try {
      if (response.body) {
        const reader = response.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (offset + value.length > start + part.size) throw new DesktopReleaseError('받은 조각 크기가 목록과 다릅니다.', 'integrity');
          whole.set(value, offset);
          offset += value.length;
          report();
        }
      } else {
        const value = new Uint8Array(await response.arrayBuffer());
        if (value.length !== part.size) throw new DesktopReleaseError('받은 조각 크기가 목록과 다릅니다.', 'integrity');
        whole.set(value, offset);
        offset += value.length;
        report();
      }
    } catch (error) {
      if (error instanceof DesktopReleaseError) throw error;
      if (signal?.aborted) throw new DesktopReleaseError('내려받기를 멈췄습니다.', 'aborted');
      throw new DesktopReleaseError('내려받는 중 연결이 끊겼습니다. 다시 시도해 주세요.', 'network');
    }
    if (offset - start !== part.size) throw new DesktopReleaseError('받은 조각 크기가 목록과 다릅니다.', 'integrity');
    if (await sha256Hex(whole.subarray(start, offset)) !== part.sha256) {
      throw new DesktopReleaseError('받은 파일이 손상되었습니다. 다시 시도해 주세요.', 'integrity');
    }
  }
  report(true);
  if (offset !== manifest.size || await sha256Hex(whole) !== manifest.sha256) {
    throw new DesktopReleaseError('받은 파일이 손상되었습니다. 다시 시도해 주세요.', 'integrity');
  }
  return whole;
}

/** 실행 파일 이름 — 판 번호를 붙이지 않는다(앱이 제자리에서 스스로 새 판으로 바뀌므로 이름의 번호가 곧 거짓이 된다). */
export function releaseFileName(channel: DesktopAppChannel): string {
  return `${DESKTOP_APPS[channel].app}.exe`;
}

export function formatMegabytes(bytes: number): string {
  return `${(bytes / 1048576).toFixed(bytes >= 100 * 1048576 ? 0 : 1)}MB`;
}

/** 지금 쓰는 기기가 Windows PC 인가(내려받을 수는 있게 두고, 아니면 안내만 한다) */
export function isWindowsDesktop(userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return /Windows NT/i.test(userAgent) && !/Windows Phone/i.test(userAgent);
}
