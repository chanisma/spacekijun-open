export const RHWP_STUDIO_VERSION = '0.7.19';

export function getRhwpStudioUrl(): string {
  const configuredUrl = import.meta.env.VITE_RHWP_STUDIO_URL?.trim();
  const studioUrl = new URL(
    configuredUrl || '/rhwp-studio/index.html',
    window.location.origin
  );

  if (!['http:', 'https:'].includes(studioUrl.protocol)) {
    throw new Error('rhwp Studio는 HTTP(S) 주소에서만 실행할 수 있습니다.');
  }
  if (studioUrl.origin !== window.location.origin) {
    throw new Error(
      '문서 보호를 위해 rhwp Studio는 SPACEKIJUN과 같은 출처에서만 실행할 수 있습니다.'
    );
  }

  return studioUrl.toString();
}
