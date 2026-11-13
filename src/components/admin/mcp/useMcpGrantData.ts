/**
 * MCP 권한 배정 자료 — 교사 기본(mcp_tool_policy) · 사람별 추가(mcp_tool_grant) · 사람별 해제(mcp_tool_block) · 교직원 명단.
 * 표시용이다 — 실제 판정은 DB mcp_private.my_grants() 가 한다(같은 규칙: 추가 ∪ (교사 기본 − 해제), 직원은 추가만).
 */
import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MCP_TOOL_GRANT_KEYS, grantOn, grantState, type McpGrantState } from '@/lib/mcpTools';

export interface McpPerson {
  resourceId: string;
  name: string;
  type: 'teacher' | 'staff';
  explicit: Set<string>;
  blocked: Set<string>;
}

export const MCP_GRANT_QUERY_KEY = ['mcp-grant-data'] as const;

interface Raw {
  policy: Array<{ tool: string; teacher_default: boolean }>;
  grants: Array<{ resource_id: string; tool: string }>;
  blocks: Array<{ resource_id: string; tool: string }>;
  staff: Array<{ id: string; name: string; type: string; status: string | null }>;
}

async function load(): Promise<Raw> {
  const [policy, grants, blocks, staff] = await Promise.all([
    supabase.from('mcp_tool_policy' as never).select('tool, teacher_default'),
    supabase.from('mcp_tool_grant' as never).select('resource_id, tool'),
    supabase.from('mcp_tool_block' as never).select('resource_id, tool'),
    supabase.from('resource').select('id, name, type, status').in('type', ['teacher', 'staff']).order('name'),
  ]);
  for (const r of [policy, grants, blocks, staff]) if (r.error) throw r.error;
  return {
    policy: (policy.data ?? []) as unknown as Raw['policy'],
    grants: (grants.data ?? []) as unknown as Raw['grants'],
    blocks: (blocks.data ?? []) as unknown as Raw['blocks'],
    staff: (staff.data ?? []) as unknown as Raw['staff'],
  };
}

export function useMcpGrantData() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: MCP_GRANT_QUERY_KEY, queryFn: load });

  const derived = useMemo(() => {
    const raw = query.data;
    const teacherDefaults = new Set((raw?.policy ?? []).filter((p) => p.teacher_default).map((p) => p.tool));
    const byPerson = (rows: Raw['grants']) => {
      const map = new Map<string, Set<string>>();
      for (const r of rows) map.set(r.resource_id, (map.get(r.resource_id) ?? new Set()).add(r.tool));
      return map;
    };
    const grants = byPerson(raw?.grants ?? []);
    const blocks = byPerson(raw?.blocks ?? []);
    // 재직자만(상태가 비었거나 active) — 단, 허용·해제 줄이 남은 사람은 퇴직자라도 보인다(정리할 수 있게)
    const people: McpPerson[] = (raw?.staff ?? [])
      .filter((s) => !s.status || s.status === 'active' || grants.has(s.id) || blocks.has(s.id))
      .map((s) => ({
        resourceId: s.id,
        name: s.name,
        type: s.type === 'staff' ? 'staff' : 'teacher',
        explicit: grants.get(s.id) ?? new Set(),
        blocked: blocks.get(s.id) ?? new Set(),
      }));
    return { teacherDefaults, people, policyLoaded: (raw?.policy.length ?? 0) > 0 };
  }, [query.data]);

  const stateOf = (person: McpPerson, key: string): McpGrantState => grantState(key, person, derived.teacherDefaults);
  const activeCount = (person: McpPerson) => MCP_TOOL_GRANT_KEYS.filter((k) => grantOn(stateOf(person, k))).length;
  const refresh = () => queryClient.invalidateQueries({ queryKey: MCP_GRANT_QUERY_KEY });

  return { ...query, ...derived, stateOf, activeCount, refresh };
}
