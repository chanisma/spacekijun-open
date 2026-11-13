import type { ActivityHost } from '../types';

/** 앞뒤 공백만 정리한다. 이름이 비슷한 동아리를 임의로 같은 주최로 묶지 않는다. */
export function matchInquiryClubHost(name: string | null | undefined, hosts: ActivityHost[]): ActivityHost | null {
  const clubName = name?.trim();
  if (!clubName) return null;
  const matches = hosts.filter(host =>
    host.kind === 'club' && host.status === 'active' && host.name.trim() === clubName
  );
  return matches.length === 1 ? matches[0] : null;
}
