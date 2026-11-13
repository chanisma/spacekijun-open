/**
 * 시간 포맷·D-day 계산 헬퍼 (KST 가정).
 */

export function formatPeriod(opensAt: string | null, closesAt: string | null): string {
  if (!opensAt && !closesAt) return '상시';
  const open = opensAt ? formatDt(opensAt) : '';
  const close = closesAt ? formatDt(closesAt) : '';
  return `${open} → ${close}`;
}

export function formatDt(iso: string): string {
  const d = new Date(iso);
  const m = `${d.getMonth() + 1}`;
  const day = `${d.getDate()}`;
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mm = `${d.getMinutes()}`.padStart(2, '0');
  return `${m}/${day} ${hh}:${mm}`;
}

export function timeRemaining(closesAt: string | null): string | null {
  if (!closesAt) return null;
  const now = Date.now();
  const close = new Date(closesAt).getTime();
  const diff = close - now;
  if (diff < 0) return '마감됨';
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (days > 0) return `${days}일 ${hours}시간`;
  if (hours > 0) return `${hours}시간 ${mins}분`;
  return `${mins}분`;
}

export function isRoundOpenNow(round: {
  status: string;
  opens_at: string | null;
  closes_at: string | null;
}): boolean {
  if (round.status !== 'open') return false;
  const now = Date.now();
  if (round.opens_at && now < new Date(round.opens_at).getTime()) return false;
  if (round.closes_at && now > new Date(round.closes_at).getTime()) return false;
  return true;
}
