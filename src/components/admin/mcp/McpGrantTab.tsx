/**
 * «권한 배정» — 교사 기본(도구마다 켜고 끔) + 사람별 조정(기본에서 빠진 것을 켜거나, 기본을 그 사람만 끔).
 *
 * 2026-10-24 사용자 결정: 모든 교사가 기본으로 모든 허용을 받는다 — 급식지도 명단·자습 감독 배정처럼 맡은 사람만 하는 일은 뺀다.
 * 저장: 교사 기본 = mcp_tool_policy.teacher_default · 사람별 추가 = mcp_tool_grant · 사람별 해제 = mcp_tool_block (쓰기 = 관리자 RLS).
 * 한 칸을 바꿀 때 무엇을 넣고 빼는지는 planToggle(src/lib/mcpTools.ts) 한 곳이 정한다.
 */
import { useMemo, useState } from 'react';
import { Loader2, RotateCcw, Search, UserRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { MCP_TOOL_GRANTS, grantOn, planToggle, type McpGrantState } from '@/lib/mcpTools';
import { useMcpFeatureOrder } from './useMcpFeatureOrder';
import { useMcpGrantData, type McpPerson } from './useMcpGrantData';

const grantInfo = (key: string) => MCP_TOOL_GRANTS.find((g) => g.key === key);

const STATE_LABEL: Record<McpGrantState, { text: string; className: string } | null> = {
  default: null,
  added: { text: '따로 켬', className: 'bg-blue-50 text-blue-700' },
  blocked: { text: '이 사람만 끔', className: 'bg-rose-50 text-rose-700' },
  off: null,
};

type Filter = 'all' | 'exceptions' | 'staff';

/** RLS 가 막으면 오류가 아니라 0행이다 — 바뀐 행 수로 확인한다 */
async function expectRows(promise: PromiseLike<{ data: unknown[] | null; error: unknown }>, what: string) {
  const { data, error } = await promise;
  if (error) throw error;
  if (!data || data.length === 0) throw new Error(`${what} 저장하지 못했습니다(권한 확인).`);
}

export function McpGrantTab() {
  // 기능 순서 = 왼쪽 메뉴 순서(2026-10-25)
  const features = useMcpFeatureOrder();
  const data = useMcpGrantData();
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const exceptionsOf = (p: McpPerson) => p.explicit.size + p.blocked.size;
  const visible = useMemo(() => {
    const q = query.trim();
    return data.people.filter((p) => (!q || p.name.includes(q))
      && (filter === 'all' || (filter === 'staff' ? p.type === 'staff' : exceptionsOf(p) > 0)));
  }, [data.people, query, filter]);
  const selected = data.people.find((p) => p.resourceId === selectedId) ?? null;

  async function run(key: string, job: () => Promise<void>) {
    setBusy(key);
    try {
      await job();
      await data.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setBusy(null);
    }
  }

  const setDefault = (tool: string, on: boolean) => run(`policy:${tool}`, () => expectRows(
    supabase.from('mcp_tool_policy' as never).update({ teacher_default: on, updated_at: new Date().toISOString() } as never).eq('tool', tool).select('tool'),
    '교사 기본을',
  ));

  const toggle = (person: McpPerson, tool: string, on: boolean) => run(person.resourceId, async () => {
    const plan = planToggle(tool, on, person, data.teacherDefaults);
    if (plan.removeGrant) await expectRows(supabase.from('mcp_tool_grant' as never).delete().eq('resource_id', person.resourceId).eq('tool', tool).select('tool'), '허용을');
    if (plan.removeBlock) await expectRows(supabase.from('mcp_tool_block' as never).delete().eq('resource_id', person.resourceId).eq('tool', tool).select('tool'), '해제를');
    if (plan.addGrant) await expectRows(supabase.from('mcp_tool_grant' as never).insert({ resource_id: person.resourceId, tool } as never).select('tool'), '허용을');
    if (plan.addBlock) await expectRows(supabase.from('mcp_tool_block' as never).insert({ resource_id: person.resourceId, tool } as never).select('tool'), '해제를');
  });

  const resetPerson = (person: McpPerson) => {
    if (!window.confirm(`${person.name} 선생님의 사람별 조정(따로 켬 ${person.explicit.size}개 · 끔 ${person.blocked.size}개)을 모두 지우고 기본으로 되돌릴까요?`)) return;
    return run(person.resourceId, async () => {
      if (person.explicit.size) await expectRows(supabase.from('mcp_tool_grant' as never).delete().eq('resource_id', person.resourceId).select('tool'), '허용을');
      if (person.blocked.size) await expectRows(supabase.from('mcp_tool_block' as never).delete().eq('resource_id', person.resourceId).select('tool'), '해제를');
    });
  };

  if (data.isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  if (data.isError) {
    return <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{data.error instanceof Error ? data.error.message : '불러오지 못했습니다.'}</p>;
  }

  return (
    <div className="space-y-4">
      {/* ── 교사 기본 ── */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold text-slate-800">교사 기본 배정</p>
          <p className="text-xs text-slate-500">
            켠 허용은 계정이 연결된 <b>모든 교사</b>가 받습니다(새로 온 교사도 바로). 도구는 서버가 그 교사의 웹 권한으로 다시 좁히므로,
            맡은 사람만 하는 일(급식지도 명단·자습 감독 배정 등)만 끄고 아래에서 사람별로 켭니다. 직원은 기본을 받지 않습니다.
          </p>
        </div>
        <div className="grid gap-x-6 gap-y-4 p-4 md:grid-cols-2 xl:grid-cols-3">
          {features.map((f) => (
            <div key={f.key} className="min-w-0 space-y-1.5">
              <p className="text-xs font-semibold text-slate-500">{f.label}</p>
              {f.grants.map((key) => {
                const g = grantInfo(key)!;
                const on = data.teacherDefaults.has(key);
                return (
                  <label key={key} className="flex min-h-[40px] items-center justify-between gap-3 rounded-lg px-2 py-1 hover:bg-slate-50" title={g.description}>
                    <span className={cn('min-w-0 truncate text-sm', on ? 'text-slate-800' : 'text-slate-400')}>{g.label}</span>
                    <Switch checked={on} disabled={busy !== null} onCheckedChange={(v) => setDefault(key, v)} aria-label={`교사 기본 · ${g.label}`} />
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── 사람별 조정 ── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="space-y-2 border-b px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">사람별 조정</p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="이름으로 찾기" className="h-10 pl-9 text-base sm:text-sm" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {([['all', '전체'], ['exceptions', '조정한 사람'], ['staff', '직원']] as const).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setFilter(k)}
                  className={cn('min-h-[36px] rounded-full px-3 text-xs font-medium', filter === k ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <ul className="max-h-[520px] divide-y overflow-y-auto">
            {visible.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-slate-500">맞는 사람이 없습니다.</li>
            ) : visible.map((p) => (
              <li key={p.resourceId}>
                <button type="button" onClick={() => setSelectedId(p.resourceId)}
                  className={cn('flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-50', selectedId === p.resourceId && 'bg-blue-50')}>
                  <UserRound className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                    {p.name}{p.type === 'staff' && <span className="ml-1 text-xs font-normal text-slate-400">직원</span>}
                  </span>
                  {exceptionsOf(p) > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">조정 {exceptionsOf(p)}</span>}
                  <span className="shrink-0 text-xs text-slate-500">{data.activeCount(p)}/{MCP_TOOL_GRANTS.length}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border bg-card shadow-sm">
          {!selected ? (
            <div className="flex h-full min-h-[200px] items-center justify-center p-6 text-center text-sm text-slate-500">
              왼쪽에서 사람을 고르면 그 사람이 쓰는 허용을 보고 바꿀 수 있습니다.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{selected.name}{selected.type === 'staff' && ' (직원)'}</p>
                  <p className="text-xs text-slate-500">
                    쓰는 허용 {data.activeCount(selected)}개{selected.type === 'staff' ? ' — 직원은 기본이 없어 켠 것만 씁니다' : ''}
                  </p>
                </div>
                {exceptionsOf(selected) > 0 && (
                  <Button variant="ghost" size="sm" className="h-9 text-xs" disabled={busy !== null} onClick={() => resetPerson(selected)}>
                    <RotateCcw className="mr-1 h-3.5 w-3.5" />기본으로 되돌리기
                  </Button>
                )}
              </div>
              <div className="grid gap-x-6 gap-y-4 p-4 md:grid-cols-2">
                {features.map((f) => (
                  <div key={f.key} className="min-w-0 space-y-1">
                    <p className="text-xs font-semibold text-slate-500">{f.label}</p>
                    {f.grants.map((key) => {
                      const g = grantInfo(key)!;
                      const state = data.stateOf(selected, key);
                      const badge = STATE_LABEL[state];
                      return (
                        <label key={key} className="flex min-h-[40px] items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-50" title={g.description}>
                          <Checkbox checked={grantOn(state)} disabled={busy !== null} onCheckedChange={(v) => toggle(selected, key, !!v)}
                            aria-label={`${selected.name} · ${g.label}`} />
                          <span className={cn('min-w-0 flex-1 truncate text-sm', grantOn(state) ? 'text-slate-800' : 'text-slate-400')}>{g.label}</span>
                          {badge && <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[11px]', badge.className)}>{badge.text}</span>}
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
              {busy === selected.resourceId && <p className="px-4 pb-3 text-xs text-slate-500"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />저장하는 중…</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
