/**
 * «연결한 사람» — 자기 에이전트를 SPACEKIJUN 에 연결(동의)한 사람 목록 (2026-10-25).
 * 원본 = 관리자 전용 RPC admin_mcp_connections(), 사람 단위 묶기·판정 = `@/lib/mcpConnections`.
 * 켜진 허용 수는 «권한 배정»과 같은 자료(useMcpGrantData)로 센다 — 연결해도 허용이 0개면 도구를 하나도 못 쓴다.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Search, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ROLE_META } from '@/components/admin/userRoles';
import { formatWhen, groupMcpConnections, type McpConnectionRow } from '@/lib/mcpConnections';
import type { AppRole } from '@/lib/roles';
import { useMcpGrantData } from './useMcpGrantData';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function McpConnectionsTab() {
  const [query, setQuery] = useState('');
  const connections = useQuery({
    queryKey: ['admin-mcp-connections'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_mcp_connections' as never);
      if (error) throw error;
      return (data ?? []) as unknown as McpConnectionRow[];
    },
  });
  const grants = useMcpGrantData();
  const grantPeople = useMemo(() => new Map(grants.people.map((p) => [p.resourceId, p])), [grants.people]);

  const people = useMemo(() => groupMcpConnections(connections.data ?? []), [connections.data]);
  const shown = useMemo(() => {
    const q = query.trim();
    return q ? people.filter((p) => p.name.includes(q) || p.email.includes(q) || p.agents.some((a) => a.name.includes(q))) : people;
  }, [people, query]);

  const active = people.filter((p) => p.active);
  const weekAgo = new Date(Date.now() - WEEK_MS).toISOString();
  const usedThisWeek = active.filter((p) => p.lastUsedAt && p.lastUsedAt > weekAgo).length;

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-3 gap-2 text-center sm:max-w-md">
        <div className="rounded-lg border bg-card px-2 py-2 shadow-sm"><dt className="text-xs text-slate-500">연결한 사람</dt><dd className="text-lg font-semibold text-slate-800">{active.length}</dd></div>
        <div className="rounded-lg border bg-card px-2 py-2 shadow-sm"><dt className="text-xs text-slate-500">지난 7일 사용</dt><dd className="text-lg font-semibold text-slate-800">{usedThisWeek}</dd></div>
        <div className="rounded-lg border bg-card px-2 py-2 shadow-sm"><dt className="text-xs text-slate-500">연결 등록</dt><dd className="text-lg font-semibold text-slate-800">{active.reduce((n, p) => n + p.connections, 0)}</dd></div>
      </dl>

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Users className="h-4 w-4 text-blue-600" />연결을 허용한 사람</p>
            <p className="text-xs text-slate-500">
              동의 화면에서 «허용»을 누른 사람입니다. 에이전트는 다시 연결할 때마다 새로 등록되어 같은 이름이 여러 번 셀 수 있습니다.
              연결을 끊는 것은 각자 <code className="rounded bg-slate-100 px-1">/oauth/consent</code> 에서 합니다.
            </p>
          </div>
          <div className="relative shrink-0 sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="이름·에이전트로 거르기" className="h-10 pl-9 text-base sm:text-sm" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="whitespace-nowrap bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">사람</th>
                <th className="px-3 py-2 font-medium">에이전트</th>
                <th className="px-3 py-2 font-medium">켜진 허용</th>
                <th className="px-3 py-2 font-medium">처음 허용</th>
                <th className="px-3 py-2 font-medium">마지막 사용</th>
                <th className="px-3 py-2 text-right font-medium" title="학생 정보를 읽거나 무언가를 바꾼 호출만 기록됩니다">기록된 호출(30일)</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {connections.isLoading ? (
                <tr><td colSpan={6} className="py-6 text-center text-slate-500"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
              ) : connections.isError ? (
                <tr><td colSpan={6} className="py-4 text-center text-xs text-rose-600">{connections.error instanceof Error ? connections.error.message : '불러오지 못했습니다.'}</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center text-sm text-slate-500">{query ? '맞는 사람이 없습니다.' : '아직 연결한 사람이 없습니다.'}</td></tr>
              ) : shown.map((p) => {
                const role = p.role && p.role in ROLE_META ? ROLE_META[p.role as AppRole] : null;
                const person = p.resourceId ? grantPeople.get(p.resourceId) : undefined;
                const allowed = person ? grants.activeCount(person) : 0;
                return (
                  <tr key={p.userId} className={p.active ? '' : 'text-slate-400'}>
                    <td className="px-3 py-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className={`truncate font-medium ${p.active ? 'text-slate-800' : ''}`}>{p.name}</span>
                        {role && <Badge variant="secondary" className={`shrink-0 text-[10px] ${role.badgeClass}`}>{role.label}</Badge>}
                        {!p.active && <Badge variant="outline" className="shrink-0 text-[10px]">해제함</Badge>}
                      </div>
                      <p className="truncate text-[11px] text-slate-400" title={p.email}>{p.email}</p>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {p.agents.map((a) => (
                          <span key={a.name} className="inline-flex max-w-[220px] items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600" title={a.name}>
                            <span className="truncate">{a.name}</span>{a.count > 1 && <span className="ml-1 shrink-0 tabular-nums text-slate-400">×{a.count}</span>}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {!p.resourceId ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-700" title="교직원 명단에 연결되지 않은 계정은 도구를 쓸 수 없습니다">
                          <AlertTriangle className="h-3.5 w-3.5" />명단 미연결
                        </span>
                      ) : grants.isLoading ? '…' : (
                        <span className={allowed === 0 ? 'text-xs text-amber-700' : 'tabular-nums text-slate-700'}>{allowed === 0 ? '허용 없음' : `${allowed}개`}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{formatWhen(p.firstGrantedAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{formatWhen(p.lastUsedAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700">{p.calls30d}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
