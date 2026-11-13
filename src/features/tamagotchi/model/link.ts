/**
 * 통신(2026-10-26 — 실시간, 원작 적외선 통신처럼) · 종·창고 읽기의 순수 규칙. 서버 = 20261027030000_tamagotchi_species_storage_link.sql.
 *
 * - 신청은 2분 동안만 산다(LINK_TTL_MS = 서버 interval '2 minutes'). 받는 쪽이 앱을 열어 두고 있어야 받는다.
 * - 새 친구와 첫 통신이면 둘 다 전파 가족 알 표(first_contact). 같은 친구와 다시 하면 펫끼리 반가울 뿐.
 */
import type { Species } from './species';

export const LINK_TTL_MS = 2 * 60 * 1000;

export type LinkStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
export interface TamaLink {
  id: string;
  from_user: string;
  to_user: string;
  status: LinkStatus;
  first_contact: boolean;
  created_at: string;
  responded_at: string | null;
  /** 내가 건 통신인가 */
  mine: boolean;
  /** 상대 이름(별빛 친구) */
  partner: string;
}
export interface LinkData { links: TamaLink[]; partners: number; serverNow: number }

export interface EggTicket { id: string; species: Exclude<Species, 'star'>; created_at: string; partner: string | null }
export interface SpeciesData {
  unlocked: Record<'tide' | 'moon' | 'sprout', boolean>;
  tickets: EggTicket[];
  storage: { size: number; used: number; movePrice: number };
  tradePartners: number;
}

const STATUSES: LinkStatus[] = ['pending', 'accepted', 'declined', 'cancelled', 'expired'];

export function parseLinks(raw: unknown): LinkData {
  const r = (raw ?? {}) as { links?: unknown; partners?: unknown; server_now?: unknown };
  const links = Array.isArray(r.links) ? r.links.filter((l): l is TamaLink =>
    !!l && typeof l.id === 'string' && STATUSES.includes(l.status) && typeof l.created_at === 'string') : [];
  return {
    links: links.map((l) => ({ ...l, partner: typeof l.partner === 'string' ? l.partner : '친구', first_contact: !!l.first_contact, mine: !!l.mine })),
    partners: typeof r.partners === 'number' ? r.partners : 0,
    serverNow: typeof r.server_now === 'number' ? r.server_now : Date.now(),
  };
}

export function parseSpecies(raw: unknown): SpeciesData {
  const r = (raw ?? {}) as Record<string, unknown>;
  const u = (r.unlocked ?? {}) as Record<string, unknown>;
  const st = (r.storage ?? {}) as Record<string, unknown>;
  const tickets = Array.isArray(r.tickets) ? (r.tickets as EggTicket[]).filter((t) => t && typeof t.id === 'string' && t.species === 'signal') : [];
  return {
    unlocked: { tide: u.tide === true, moon: u.moon === true, sprout: u.sprout === true },
    tickets: tickets.map((t) => ({ ...t, partner: typeof t.partner === 'string' ? t.partner : null })),
    storage: {
      size: typeof st.size === 'number' ? st.size : 6,
      used: typeof st.used === 'number' ? st.used : 0,
      movePrice: typeof st.move_price === 'number' ? st.move_price : 10,
    },
    tradePartners: typeof r.trade_partners === 'number' ? r.trade_partners : 0,
  };
}

/** 신청이 살아 있는 남은 초(서버 시각 기준) — 지났으면 0 */
export function linkSecondsLeft(link: Pick<TamaLink, 'created_at'>, serverNowMs: number): number {
  return Math.min(LINK_TTL_MS / 1000, Math.max(0, Math.ceil((Date.parse(link.created_at) + LINK_TTL_MS - serverNowMs) / 1000)));
}

/** 받을 수 있는 신청(나에게 온 · 기다리는 중 · 2분 안) — 가장 최근 것 하나 */
export function incomingLink(data: LinkData | undefined, serverNowMs: number): TamaLink | null {
  return data?.links.find((l) => !l.mine && l.status === 'pending' && linkSecondsLeft(l, serverNowMs) > 0) ?? null;
}
/** 내가 건, 아직 기다리는 신청 */
export function outgoingLink(data: LinkData | undefined, serverNowMs: number): TamaLink | null {
  return data?.links.find((l) => l.mine && l.status === 'pending' && linkSecondsLeft(l, serverNowMs) > 0) ?? null;
}
