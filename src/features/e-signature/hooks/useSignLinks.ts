/**
 * 서명 링크(토큰) 조회.
 *
 * 서버가 범위를 정한다 — **요청자·admin 은 전원, 서명자는 자기 것 하나만**.
 * 화면에서 거르지 않는 이유: 서버 범위와 화면 범위가 어긋나면 "있는데 안 보인다"가 된다.
 *
 * 토큰은 **자격증명**이므로 오래 캐시하지 않는다(회수·재발급이 즉시 반영돼야 한다).
 */
import { useQuery } from '@tanstack/react-query';
import { fetchSignLinks, type SignLink } from '../services/signatureTokenService';

export function useSignLinks(requestId: string | null, enabled = true) {
  const query = useQuery({
    queryKey: ['signature-sign-links', requestId],
    queryFn: () => fetchSignLinks(requestId!),
    enabled: enabled && !!requestId,
    staleTime: 60 * 1000,
    // 권한이 없으면 서버가 42501 을 던진다 — 재시도해도 달라지지 않는다
    retry: false,
  });

  return {
    links: query.data ?? ([] as SignLink[]),
    isLoading: query.isLoading,
  };
}

/** 이름으로 내 링크를 찾는다. 서명자에게는 애초에 자기 것만 오므로 대개 첫 항목이다. */
export function findMyLink(links: SignLink[], myName: string | null | undefined): SignLink | null {
  if (links.length === 0) return null;
  if (links.length === 1) return links[0];
  return links.find((l) => !!myName && l.signerName === myName) ?? null;
}
