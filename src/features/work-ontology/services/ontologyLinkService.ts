// 연결 표(ontology_link) 읽기·쓰기 (2026-11-08, P1) — 쓰기는 RPC 만(link_objects·unlink_objects, INVOKER)
// 볼 수 없는 상대는 RLS 가 줄째로 거른다(양 끝을 모두 볼 수 있어야 보인다). 이름은 표마다 한 번에 읽는다.
import { supabase } from '@/integrations/supabase/client';
import type { ObjectType } from '../model/objectRef';
import type { LinkKind, LinkRow, ResolvedObject } from '../model/explicitLinks';

const db = supabase as unknown as { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => any };

export async function fetchLinks(type: ObjectType, id: string): Promise<LinkRow[]> {
  const { data, error } = await db.from('ontology_link')
    .select('id, from_type, from_id, to_type, to_id, kind, note, created_by, created_at')
    .or(`and(from_type.eq.${type},from_id.eq.${id}),and(to_type.eq.${type},to_id.eq.${id})`)
    .order('created_at', { ascending: true })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as LinkRow[];
}

function kstDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t + 9 * 3_600_000).toISOString();
  return `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
}

/** 상대 객체 이름 — 종류마다 한 번 읽는다. 못 읽은 것(볼 수 없음·지워짐)은 맵에 없다 */
export async function resolveObjects(refs: Array<{ type: ObjectType; id: string }>): Promise<Map<string, ResolvedObject>> {
  const byType = new Map<ObjectType, string[]>();
  for (const r of refs) byType.set(r.type, [...new Set([...(byType.get(r.type) ?? []), r.id])]);
  const out = new Map<string, ResolvedObject>();
  const put = (o: ResolvedObject) => out.set(`${o.type}:${o.id}`, o);

  await Promise.all([...byType.entries()].map(async ([type, ids]) => {
    if (ids.length === 0) return;
    if (type === 'work') {
      const { data } = await db.from('work').select('id, name, status').in('id', ids);
      for (const w of data ?? []) put({ type, id: w.id, label: w.name, sub: w.status === 'completed' ? '완료' : null });
    } else if (type === 'task') {
      const { data } = await db.from('task').select('id, title, event_id, due_date').in('id', ids);
      for (const t of data ?? []) put({ type, id: t.id, label: t.title, workId: t.event_id, sub: t.due_date ? `마감 ${kstDate(t.due_date)}` : null });
    } else if (type === 'meeting') {
      const { data } = await db.from('meeting').select('id, kind, starts_at, meta, section(name)').in('id', ids);
      for (const m of data ?? []) {
        const meta = (m.meta ?? {}) as { title?: string; section_name?: string };
        put({ type, id: m.id, label: meta.title || meta.section_name || m.section?.name || '일정', sub: kstDate(m.starts_at) });
      }
    } else if (type === 'official_doc') {
      const { data } = await db.from('official_doc').select('id, title, registered_at').in('id', ids);
      for (const d of data ?? []) put({ type, id: d.id, label: d.title, sub: d.registered_at ? `${kstDate(d.registered_at)} 접수` : null });
    } else if (type === 'signature_request') {
      const { data } = await db.from('signature_request').select('id, title, status').in('id', ids);
      for (const s of data ?? []) put({ type, id: s.id, label: s.title, sub: s.status === 'completed' ? '서명 완료' : null });
    } else if (type === 'document') {
      const { data } = await db.from('documents').select('id, title, file_name').in('id', ids);
      for (const d of data ?? []) put({ type, id: d.id, label: d.title || d.file_name || '문서' });
    } else if (type === 'budget_project') {
      // 예산 사업 — 담당자·관리자만 보인다(RLS). 이름 앞의 [목적]·[총액배분]은 떼고 학년도를 붙인다
      const { data } = await db.from('budget_project').select('id, name, fiscal_year').in('id', ids);
      for (const b of data ?? []) put({ type, id: b.id, label: String(b.name).replace(/^\s*\[(목적|총액배분)\]\s*/, ''), sub: `${b.fiscal_year}학년도` });
    }
  }));
  return out;
}

export async function linkObjects(input: {
  fromType: ObjectType; fromId: string; toType: ObjectType; toId: string; kind: LinkKind; note?: string | null;
}): Promise<string> {
  const { data, error } = await db.rpc('link_objects', {
    p_from_type: input.fromType, p_from_id: input.fromId,
    p_to_type: input.toType, p_to_id: input.toId,
    p_kind: input.kind, p_note: input.note ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function unlinkObjects(id: string): Promise<boolean> {
  const { data, error } = await db.rpc('unlink_objects', { p_id: id });
  if (error) throw new Error(error.message);
  return !!data;
}

/** 이을 후보 찾기 — 일정(앞뒤 120일, 제목) · 업무(이름). 볼 수 있는 것만 온다(RLS) */
export interface LinkCandidate { type: ObjectType; id: string; label: string; sub: string | null }

export async function searchCandidates(type: 'meeting' | 'work', query: string): Promise<LinkCandidate[]> {
  const q = query.trim();
  if (type === 'work') {
    let req = db.from('work').select('id, name, status, meta').order('updated_at', { ascending: false }).limit(20);
    if (q) req = req.ilike('name', `%${q.replace(/[%_]/g, '')}%`);
    const { data, error } = await req;
    if (error) throw error;
    return (data ?? []).map((w: { id: string; name: string; status: string; meta: { department?: string; year?: number } | null }) => ({
      type: 'work' as const, id: w.id, label: w.name,
      sub: [w.meta?.department, w.meta?.year ? `${w.meta.year}학년도` : null, w.status === 'completed' ? '완료' : null].filter(Boolean).join(' · ') || null,
    }));
  }
  const from = new Date(Date.now() - 120 * 86_400_000).toISOString();
  const to = new Date(Date.now() + 120 * 86_400_000).toISOString();
  const { data, error } = await db.from('meeting')
    .select('id, kind, starts_at, meta')
    .gte('starts_at', from).lt('starts_at', to)
    .in('kind', ['schedule', 'event', 'training', 'duty', 'personal'])
    .order('starts_at', { ascending: true })
    .limit(1000);
  if (error) throw error;
  const KIND: Record<string, string> = { schedule: '학사', event: '행사', training: '연수', duty: '업무', personal: '개인' };
  // 오늘에서 가까운 순 — 앞뒤 120일을 시간 순으로 두면 넉 달 전 일정부터 보여 이번 주 일정까지 한참 내려가야 한다(실측)
  const now = Date.now();
  const rows = (data ?? [])
    .map((m: { id: string; kind: string; starts_at: string; meta: { title?: string; section_name?: string } | null }) => ({
      type: 'meeting' as const, id: m.id,
      label: m.meta?.title || m.meta?.section_name || '일정',
      sub: [kstDate(m.starts_at), KIND[m.kind] ?? m.kind].filter(Boolean).join(' · '),
      distance: Math.abs(Date.parse(m.starts_at) - now),
    }))
    .sort((a: { distance: number }, b: { distance: number }) => a.distance - b.distance)
    .map(({ distance: _d, ...rest }: { distance: number } & LinkCandidate) => rest);
  // 제목 검색은 meta 안이라 서버에서 못 거른다 — 받은 앞뒤 120일 안에서 거른다
  return (q ? rows.filter((r) => r.label.includes(q)) : rows).slice(0, 30);
}
