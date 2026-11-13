// ========================================
// 연결 표(ontology_link) 줄 → 「연결」 칸 (2026-11-08, P1)
//
// 표 = docs/database/core.md «업무 온톨로지 연결». 옛 연결(공문 출처·흐름 선·계보)은 workObject.buildWorkLinks 가
// 만들고, 여기서 만든 줄을 **같은 묶음에 합친다** — 같은 상대가 두 길로 이어져 있으면 한 줄로(옛 연결이 이긴다:
// 지울 수 없는 연결을 지울 수 있는 것처럼 보이면 안 된다).
// ========================================

import { objectHref, type ObjectType } from './objectRef';
import type { LinkEntry, LinkGroup, LinkGroupKey } from './workObject';

export const LINK_KINDS = ['evidence', 'schedule', 'output', 'related', 'precedes'] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export const LINK_KIND_LABEL: Record<LinkKind, string> = {
  evidence: '근거',
  schedule: '일정',
  output: '만든 것',
  related: '관련',
  precedes: '앞 → 뒤',
};

export interface LinkRow {
  id: string;
  from_type: ObjectType;
  from_id: string;
  to_type: ObjectType;
  to_id: string;
  kind: LinkKind;
  note: string | null;
  created_by: string;
  created_at: string;
}

/** 상대 객체를 사람이 읽을 이름으로 — 서비스가 표마다 한 번에 읽어 채운다 */
export interface ResolvedObject {
  type: ObjectType;
  id: string;
  label: string;
  sub?: string | null;
  /** 할 일이면 그 업무 — 한 장 보기 주소에 쓴다 */
  workId?: string | null;
}

/** 객체 → 갈 곳. 한 장 보기가 없는 종류는 그 기능의 화면으로 */
export function hrefOfObject(o: ResolvedObject): string | null {
  switch (o.type) {
    case 'work': return objectHref('work', o.id);
    case 'task': return o.workId ? objectHref('work', o.workId, o.id) : null;
    case 'meeting': return `/schedule?event=${encodeURIComponent(o.id)}`;
    case 'official_doc': return '/tasks/docs';
    case 'signature_request': return '/signatures';
    case 'document': return '/documents';
    case 'budget_project': return `/tasks/budget?project=${encodeURIComponent(o.id)}`;
    default: return null;
  }
}

const TYPE_BADGE: Record<ObjectType, string> = {
  work: '업무', task: '할 일', official_doc: '공문', meeting: '일정', signature_request: '서명', document: '문서', budget_project: '예산',
};

/** 연결 한 줄이 어느 묶음으로 가는가 — 옛 연결의 묶음 열쇠와 같게 */
function groupKeyOf(kind: LinkKind): LinkGroupKey {
  if (kind === 'evidence') return 'doc';
  if (kind === 'precedes' || kind === 'related') return 'flow';
  return kind; // schedule · output
}

const GROUP_TITLE: Record<LinkGroupKey, string> = {
  doc: '근거',
  flow: '흐름 · 앞뒤 업무',
  lineage: '계보 · 지난 해',
  schedule: '일정',
  output: '만든 것',
};

const GROUP_ORDER: LinkGroupKey[] = ['doc', 'schedule', 'output', 'flow', 'lineage'];

export function explicitEntries(
  self: { type: ObjectType; id: string },
  rows: readonly LinkRow[],
  resolve: (type: ObjectType, id: string) => ResolvedObject | null,
  me: { userId: string | null; isAdmin: boolean },
): Array<{ group: LinkGroupKey; entry: LinkEntry }> {
  const out: Array<{ group: LinkGroupKey; entry: LinkEntry }> = [];
  for (const r of rows) {
    const outgoing = r.from_type === self.type && r.from_id === self.id;
    const incoming = r.to_type === self.type && r.to_id === self.id;
    if (!outgoing && !incoming) continue;
    const otherType = outgoing ? r.to_type : r.from_type;
    const otherId = outgoing ? r.to_id : r.from_id;
    const other = resolve(otherType, otherId);
    if (!other) continue; // 볼 수 없거나 지워진 상대 — RLS 가 이미 걸렀어야 하지만 이름을 못 찾으면 그리지 않는다
    const badge = r.kind === 'precedes' ? (outgoing ? '다음' : '앞') : r.kind === 'related' ? '관련' : TYPE_BADGE[otherType];
    out.push({
      group: groupKeyOf(r.kind),
      entry: {
        key: `link:${r.id}`,
        badge,
        label: other.label,
        href: hrefOfObject(other),
        sub: [r.note, other.sub].filter(Boolean).join(' · ') || null,
        linkId: r.id,
        removable: me.isAdmin || (!!me.userId && r.created_by === me.userId),
        targetKey: `${otherType}:${otherId}`,
        doc: otherType === 'official_doc' ? { id: otherId } : null,
      },
    });
  }
  return out;
}

/** 옛 연결 묶음 + 표의 연결 → 한 벌. 같은 상대(같은 주소)가 이미 옛 연결에 있으면 표의 줄은 버린다 */
export function mergeLinkGroups(
  derived: readonly LinkGroup[],
  explicit: ReadonlyArray<{ group: LinkGroupKey; entry: LinkEntry }>,
): LinkGroup[] {
  const map = new Map<LinkGroupKey, LinkEntry[]>();
  for (const g of derived) map.set(g.key, [...g.entries]);
  const seenHref = new Set(derived.flatMap((g) => g.entries.map((e) => `${g.key}|${e.href ?? e.label}`)));
  for (const { group, entry } of explicit) {
    const k = `${group}|${entry.href ?? entry.label}`;
    if (entry.href && seenHref.has(k)) continue;
    seenHref.add(k);
    map.set(group, [...(map.get(group) ?? []), entry]);
  }
  return GROUP_ORDER
    .filter((key) => (map.get(key) ?? []).length > 0)
    .map((key) => ({
      key,
      title: derived.find((g) => g.key === key)?.title ?? GROUP_TITLE[key],
      entries: map.get(key)!,
    }));
}
