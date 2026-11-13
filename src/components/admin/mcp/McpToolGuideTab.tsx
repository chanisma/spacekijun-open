/**
 * «도구 설명» — 기능별로 허용과 그 아래 도구를 보인다. 도구 설명은 에이전트가 받는 글 그대로
 * (`mcpToolDocs.generated.ts` — handler.js TOOLS 에서 생성). 허용 묶음 = `MCP_FEATURES`.
 */
import { useMemo, useState } from 'react';
import { ChevronRight, Lock, Pencil, Search, ShieldAlert, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { MCP_FEATURES, MCP_TOOL_GRANTS, type McpFeatureKey } from '@/lib/mcpTools';
import { useMcpFeatureOrder } from './useMcpFeatureOrder';
import { MCP_TOOL_DOCS, type McpToolDoc } from '@/lib/mcpToolDocs.generated';
import { useMcpGrantData } from './useMcpGrantData';

const grantInfo = (key: string) => MCP_TOOL_GRANTS.find((g) => g.key === key);

function ToolBadge({ tool }: { tool: McpToolDoc }) {
  if (tool.readOnly) return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">읽기</span>;
  if (tool.destructive) return <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">되돌릴 수 없음</span>;
  return <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">쓰기</span>;
}

function ToolRow({ tool }: { tool: McpToolDoc }) {
  return (
    <details className="group rounded-lg border border-slate-200 bg-white">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-start gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium text-slate-800">{tool.title}</span>
            <code className="break-all rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{tool.name}</code>
            <ToolBadge tool={tool} />
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-slate-500 group-open:line-clamp-none">{tool.description}</p>
        </div>
      </summary>
      <div className="border-t border-slate-100 px-3 py-2.5 pl-9">
        {tool.params.length === 0 ? (
          <p className="text-xs text-slate-500">받는 값이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-xs">
              <thead className="text-left text-slate-500">
                <tr><th className="py-1 pr-3 font-medium">값</th><th className="py-1 pr-3 font-medium">형식</th><th className="py-1 font-medium">설명</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {tool.params.map((p) => (
                  <tr key={p.name}>
                    <td className="whitespace-nowrap py-1.5 pr-3 align-top">
                      <code>{p.name}</code>{p.required && <span className="ml-1 text-rose-600" title="꼭 넣는 값">*</span>}
                    </td>
                    <td className="whitespace-nowrap py-1.5 pr-3 align-top text-slate-500">{p.options ? p.options.join(' · ') : p.type}</td>
                    <td className="py-1.5 align-top">{p.description ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}

export function McpToolGuideTab() {
  // 기능 순서 = 왼쪽 메뉴 순서(2026-10-25)
  const features = useMcpFeatureOrder();
  const [feature, setFeature] = useState<McpFeatureKey | null>(null);
  const [query, setQuery] = useState('');
  const { teacherDefaults, policyLoaded } = useMcpGrantData();

  const toolsByGrant = useMemo(() => {
    const map = new Map<string, McpToolDoc[]>();
    for (const tool of MCP_TOOL_DOCS) for (const g of tool.grants) map.set(g, [...(map.get(g) ?? []), tool]);
    return map;
  }, []);

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => (q
    ? MCP_TOOL_DOCS.filter((t) => [t.name, t.title, t.description].some((s) => s.toLowerCase().includes(q)))
    : []), [q]);

  const current = features.find((f) => f.key === feature) ?? features[0];
  const toolCount = (f: (typeof MCP_FEATURES)[number]) => new Set(f.grants.flatMap((g) => (toolsByGrant.get(g) ?? []).map((t) => t.name))).size;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="도구 이름·설명으로 찾기 (예: 공지, 반려, 교체)"
            className="h-10 pl-9 text-base sm:text-sm" />
        </div>
        <p className="shrink-0 text-xs text-slate-500">
          기능 {MCP_FEATURES.length} · 허용 {MCP_TOOL_GRANTS.length} · 도구 {MCP_TOOL_DOCS.length} — 설명은 에이전트가 받는 글 그대로입니다
        </p>
      </div>

      {q ? (
        <div className="space-y-2 rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-800">«{query.trim()}» 검색 결과 {matches.length}개</p>
          {matches.length === 0 ? <p className="text-sm text-slate-500">맞는 도구가 없습니다.</p> : matches.map((tool) => (
            <div key={tool.name} className="space-y-1">
              <p className="text-[11px] text-slate-500">
                {tool.grants.map((g) => `${MCP_FEATURES.find((f) => (f.grants as readonly string[]).includes(g))?.label ?? ''} › ${grantInfo(g)?.label ?? g}`).join(' / ')}
              </p>
              <ToolRow tool={tool} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav aria-label="기능" className="flex gap-1.5 overflow-x-auto lg:sticky lg:top-4 lg:flex-col lg:self-start lg:overflow-visible">
            {features.map((f) => (
              <button key={f.key} type="button" onClick={() => setFeature(f.key)}
                className={cn('flex min-h-[44px] shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                  f.key === current.key ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-100 lg:bg-transparent')}>
                <span className="whitespace-nowrap">{f.label}</span>
                <span className={cn('rounded-full px-1.5 text-[11px]', f.key === current.key ? 'bg-white/20' : 'bg-slate-100 text-slate-500')}>{toolCount(f)}</span>
              </button>
            ))}
          </nav>

          <div className="min-w-0 space-y-3">
            <div>
              <h3 className="text-base font-semibold text-slate-800">{current.label}</h3>
              <p className="text-sm text-slate-500">{current.description}</p>
            </div>
            {current.grants.map((key) => {
              const g = grantInfo(key);
              if (!g) return null;
              const tools = toolsByGrant.get(key) ?? [];
              const byDefault = teacherDefaults.has(key);
              return (
                <div key={key} className="space-y-2 rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">{g.label}</span>
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{g.key}</code>
                    {g.writes
                      ? <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700"><Pencil className="h-3 w-3" />바꾸는 도구 포함</span>
                      : <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"><Lock className="h-3 w-3" />읽기만</span>}
                    {policyLoaded && (byDefault
                      ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"><Users className="h-3 w-3" />교사 기본</span>
                      : <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"><ShieldAlert className="h-3 w-3" />사람별로 켬</span>)}
                  </div>
                  <p className="text-sm text-slate-600">{g.description}</p>
                  <div className="space-y-1.5">
                    {tools.map((tool) => <ToolRow key={tool.name} tool={tool} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
