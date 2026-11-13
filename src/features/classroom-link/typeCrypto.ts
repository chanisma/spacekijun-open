/**
 * 휴대폰으로 구글 비밀번호 입력(2026-10-14) — 휴대폰에서 암호화해 **그 교실 기기만** 풀 수 있게.
 *
 * 기기가 QR 에 실어 보낸 공개키(P-256, base64url — QR 의 # 뒤라 서버로 가지 않는다)와 이 휴대폰의 일회용 키로
 * ECDH → HKDF-SHA256(salt = 표(code), info = INFO) → AES-256-GCM. 서버는 {epk, iv, ct} 만 맡아 두었다 넘긴다.
 * 🚨 기기 쪽(NEIS_helper core/classroom_type.py · TypeRelay.kt)과 같은 규칙이어야 한다 — scripts/classroom-link-test 가 견준다.
 */
export const TYPE_INFO = 'spacekijun-classroom-type-v1';

export function toB64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let text = '';
  view.forEach((b) => { text += String.fromCharCode(b); });
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(value: string): Uint8Array {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const raw = atob(b64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export interface SealedSecret { epk: string; iv: string; ct: string }

/** 기기 공개키로 비밀번호를 봉한다. 평문은 이 함수 밖으로 나가지 않는다 */
export async function sealForDevice(devicePub: string, code: string, secret: string): Promise<SealedSecret> {
  const subtle = globalThis.crypto.subtle;
  const enc = new TextEncoder();
  const peer = await subtle.importKey('raw', fromB64url(devicePub), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const mine = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const shared = await subtle.deriveBits({ name: 'ECDH', public: peer }, mine.privateKey, 256);
  const hkdf = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  const key = await subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode(code), info: enc.encode(TYPE_INFO) },
    hkdf, { name: 'AES-GCM', length: 256 }, false, ['encrypt'],
  );
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(secret));
  const epk = await subtle.exportKey('raw', mine.publicKey);
  return { epk: toB64url(epk), iv: toB64url(iv), ct: toB64url(ct) };
}
