// URL 셀 표시용 파서 — 긴 쇼핑몰 URL을 "쇼핑몰 이름" 칩으로 줄여 보여주기 위한 순수 함수.
// LinkCell(표시)과 ManagerView의 쇼핑몰별 그룹핑이 같은 파서를 공유한다.

export interface LinkDisplayInfo {
  /** 클릭 가능한 정규화된 URL. 파싱 실패 시 null */
  href: string | null;
  /** 칩에 표시할 짧은 라벨 — 알려진 쇼핑몰 이름 또는 호스트명, 파싱 실패 시 잘린 원문 */
  label: string;
  /** www. 을 제거한 호스트명. 파싱 실패 시 null. 그룹핑 키로 사용 */
  host: string | null;
}

// 순서 중요: 더 구체적인 서브도메인(smartstore.naver.com)이 일반 도메인(naver.com)보다 먼저.
const KNOWN_SHOPS: Array<{ suffix: string; label: string }> = [
  { suffix: 'smartstore.naver.com', label: '스마트스토어' },
  { suffix: 'brand.naver.com', label: '네이버 브랜드스토어' },
  { suffix: 'shopping.naver.com', label: '네이버쇼핑' },
  { suffix: 'naver.com', label: '네이버' },
  { suffix: 'coupang.com', label: '쿠팡' },
  { suffix: 'gmarket.co.kr', label: 'G마켓' },
  { suffix: 'auction.co.kr', label: '옥션' },
  { suffix: '11st.co.kr', label: '11번가' },
  { suffix: 'aliexpress.com', label: '알리익스프레스' },
  { suffix: 'aliexpress.us', label: '알리익스프레스' },
  { suffix: 'amazon.com', label: '아마존' },
  { suffix: 'amazon.co.jp', label: '아마존 재팬' },
  { suffix: 'ssg.com', label: 'SSG닷컴' },
  { suffix: 'lotteon.com', label: '롯데온' },
  { suffix: 'homeplus.co.kr', label: '홈플러스' },
  { suffix: 'tmon.co.kr', label: '티몬' },
  { suffix: 'wemakeprice.com', label: '위메프' },
  { suffix: 'danawa.com', label: '다나와' },
  { suffix: 'kyobobook.co.kr', label: '교보문고' },
  { suffix: 'yes24.com', label: '예스24' },
  { suffix: 'aladin.co.kr', label: '알라딘' },
  { suffix: 'hottracks.co.kr', label: '핫트랙스' },
  { suffix: 'interpark.com', label: '인터파크' },
  { suffix: 'oliveyoung.co.kr', label: '올리브영' },
  { suffix: 'musinsa.com', label: '무신사' },
  { suffix: 'daisomall.co.kr', label: '다이소몰' },
  { suffix: 'devicemart.co.kr', label: '디바이스마트' },
  { suffix: 'eleparts.co.kr', label: '엘레파츠' },
  { suffix: 'compuzone.co.kr', label: '컴퓨존' },
  { suffix: '10x10.co.kr', label: '텐바이텐' },
];

const hostMatches = (host: string, suffix: string): boolean =>
  host === suffix || host.endsWith(`.${suffix}`);

const MAX_FALLBACK_LEN = 40;

export function parseLinkDisplay(rawValue: unknown): LinkDisplayInfo {
  const raw = String(rawValue ?? '').trim();
  if (!raw) return { href: null, label: '', host: null };

  // 스킴이 없으면 https:// 를 붙여 시도 (입력 보정 로직과 동일한 관용)
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`;

  let url: URL | null = null;
  try {
    url = new URL(candidate);
  } catch {
    url = null;
  }

  // 호스트에 점이 없으면(예: "미정", "학교 앞 문구점") URL이 아니라 일반 텍스트로 취급
  if (!url || !url.hostname.includes('.')) {
    const label = raw.length > MAX_FALLBACK_LEN ? `${raw.slice(0, MAX_FALLBACK_LEN)}…` : raw;
    return { href: null, label, host: null };
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  const known = KNOWN_SHOPS.find((s) => hostMatches(host, s.suffix));
  return { href: url.href, label: known?.label ?? host, host };
}

/** 쇼핑몰별 그룹핑 표시명 — host가 없으면 '기타'로 묶는다 */
export function shopGroupLabel(info: LinkDisplayInfo): string {
  if (!info.host) return '기타';
  return info.label;
}
