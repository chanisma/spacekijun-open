// 사업 ↔ 업무 (2026-11-10, P3) — 업무 온톨로지 연결 표(ontology_link)에 «budget_project → work, related» 로 잇는다.
// 업무 한 장 보기(/work/o/work/:id)의 연결 칸에는 «예산»으로 되돌아 보인다(양 끝을 볼 수 있는 사람에게만 — RLS).
// 끊기는 흔한 동작이라 묻지 않고 [되돌리기] 토스트(useLinkMutations).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Link2, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useObjectLinks, useLinkMutations } from '@/features/work-ontology/hooks/useObjectLinks';
import { searchCandidates } from '@/features/work-ontology/services/ontologyLinkService';
import { hrefOfObject } from '@/features/work-ontology/model/explicitLinks';

export function WorkLinksRow({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const { data } = useObjectLinks('budget_project', projectId);
  const { link, unlink } = useLinkMutations();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(query), 250); return () => clearTimeout(t); }, [query]);
  const candidates = useQuery({
    queryKey: ['object-links', 'candidates', 'work', debounced],
    queryFn: () => searchCandidates('work', debounced),
    enabled: open,
  });

  const works = (data?.rows ?? [])
    .map((r) => {
      const outgoing = r.from_type === 'budget_project' && r.from_id === projectId;
      const otherType = outgoing ? r.to_type : r.from_type;
      const otherId = outgoing ? r.to_id : r.from_id;
      const o = data?.resolved.get(`${otherType}:${otherId}`);
      return otherType === 'work' && o ? { row: r, o } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const linkedIds = new Set(works.map((w) => w.o.id));

  if (!works.length && !canEdit) return null;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
      <span className="inline-flex items-center gap-1 text-slate-500"><Link2 className="h-3 w-3" />업무</span>
      {works.map(({ row, o }) => {
        const href = hrefOfObject(o);
        return (
          <span key={row.id} className="inline-flex max-w-full items-center gap-0.5 rounded-full border border-emerald-100 bg-emerald-50/70 py-0.5 pl-2 pr-0.5 text-emerald-800">
            {href ? <Link to={href} className="min-w-0 truncate hover:underline">{o.label}</Link> : <span className="truncate">{o.label}</span>}
            {canEdit && (
              <button
                type="button"
                aria-label={`${o.label} 연결 끊기`}
                className="flex h-6 w-6 items-center justify-center rounded-full text-emerald-500 hover:bg-emerald-100 hover:text-emerald-800"
                onClick={() => unlink.mutate({
                  id: row.id,
                  restore: { fromType: row.from_type, fromId: row.from_id, toType: row.to_type, toId: row.to_id, kind: row.kind, note: row.note },
                })}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        );
      })}
      {canEdit && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-slate-500"><Plus className="h-3 w-3" />{works.length ? '' : '업무 잇기'}</Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="업무 이름으로 찾기" className="h-9 pl-7 text-[16px] sm:text-sm" autoFocus />
            </div>
            <ul className="mt-2 max-h-64 overflow-y-auto">
              {(candidates.data ?? []).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={linkedIds.has(c.id)}
                    onClick={() => link.mutate(
                      { fromType: 'budget_project', fromId: projectId, toType: 'work', toId: c.id, kind: 'related' },
                      { onSuccess: () => setOpen(false) },
                    )}
                    className="flex min-h-[44px] w-full min-w-0 flex-col items-start rounded-md px-2 py-1.5 text-left hover:bg-slate-50 disabled:opacity-50"
                  >
                    <span className="w-full truncate text-sm text-slate-800">{c.label}</span>
                    <span className="w-full truncate text-[11px] text-slate-500">{linkedIds.has(c.id) ? '이어짐' : c.sub}</span>
                  </button>
                </li>
              ))}
              {candidates.data && !candidates.data.length && <li className="px-2 py-4 text-center text-xs text-slate-500">찾는 업무가 없습니다</li>}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
