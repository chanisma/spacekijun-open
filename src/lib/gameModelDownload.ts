/**
 * «이세계에서는 사회인»(학생 독 게임 = 이세계 3D) 3D 모델 설치 파일 받기 (2026-10-21 사용자 요청).
 *
 * 파일이 커서 앱 배포 버킷이 아니라 **구글 드라이브 공유 링크**로 나눈다(사용자 결정: 링크는 관리자가 바꾼다).
 * 저장 = `system_settings` 키 하나(public read · admin write — 메뉴 설정과 같은 표).
 *
 * ⚠️ 링크는 https 구글 드라이브 주소만 받는다 — 학생이 «설치 파일»을 받는 단추라, 관리자 실수나 계정 탈취로
 *    아무 사이트의 실행 파일로 보내지 않게 한다. 화면도 저장할 때 같은 검사를 한다(읽을 때도 다시 본다).
 */

export const GAME_MODEL_SETTING_KEY = 'isekai3d_model_download';
export const GAME_MODEL_TITLE = '이세계에서는 사회인 — 3D 모델 설치 파일';

export interface GameModelDownload {
  url: string;
  /** 판·크기 같은 한 줄 안내(선택) */
  note: string;
  updatedAt: string | null;
}

const DRIVE_HOSTS = new Set(['drive.google.com', 'docs.google.com']);

export function validateDriveUrl(raw: string): { ok: true; url: string } | { ok: false; reason: string } {
  const text = raw.trim();
  if (!text) return { ok: false, reason: '구글 드라이브 공유 링크를 붙여 넣어 주세요.' };
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return { ok: false, reason: '링크 모양이 아니에요.' };
  }
  if (u.protocol !== 'https:') return { ok: false, reason: 'https 로 시작하는 링크만 받아요.' };
  if (!DRIVE_HOSTS.has(u.hostname)) return { ok: false, reason: '구글 드라이브(drive.google.com) 링크만 받아요.' };
  return { ok: true, url: u.toString() };
}

/** 저장값 → 화면 값. 모양이 틀리거나 드라이브 링크가 아니면 null(= 아직 준비 중) */
export function parseGameModelDownload(value: unknown): GameModelDownload | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.url !== 'string') return null;
  const checked = validateDriveUrl(v.url);
  if (!checked.ok) return null;
  return {
    url: checked.url,
    note: typeof v.note === 'string' ? v.note.slice(0, 200) : '',
    updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : null,
  };
}
