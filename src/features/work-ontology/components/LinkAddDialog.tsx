// 「연결 추가」 — 이 업무에 일정·다른 업무를 잇는다 (2026-11-08, P1)
// 쓰기 = link_objects RPC(멱등). 공문·서명·문서는 그 기능 화면에서 잇는다(P2 이후) — 여기서는 사람이 가장 자주 찾는 둘만.
import { useEffect, useState } from 'react';
import { CalendarDays, Link2, ListTodo, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DIALOG_FOOTER_CLASS, DIALOG_HEADER_CLASS, FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS, TitleIconChip } from '@/components/tasks/dialogDesign';
import { cn } from '@/lib/utils';
import { searchCandidates, type LinkCandidate } from '../services/ontologyLinkService';
import { useLinkMutations } from '../hooks/useObjectLinks';
import type { LinkKind } from '../model/explicitLinks';

type Target = 'meeting' | 'work';
type WorkRelation = 'related' | 'before' | 'after';

const WORK_RELATIONS: Array<{ value: WorkRelation; label: string; hint: string }> = [
  { value: 'related', label: '관련', hint: '서로 참고하는 업무' },
  { value: 'before', label: '이 업무의 앞', hint: '그 업무가 끝나야 이 업무를 한다' },
  { value: 'after', label: '이 업무의 다음', hint: '이 업무 다음에 하는 업무' },
];

export function LinkAddDialog({ open, onOpenChange, workId, existing }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workId: string;
  /** 이미 이어진 상대 «종류:id» — 목록에서 «이어짐»으로 보인다 */
  existing: ReadonlySet<string>;
}) {
  const [target, setTarget] = useState<Target>('meeting');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [relation, setRelation] = useState<WorkRelation>('related');
  const { link } = useLinkMutations();

  useEffect(() => { const t = setTimeout(() => setDebounced(query), 250); return () => clearTimeout(t); }, [query]);
  useEffect(() => { if (!open) { setQuery(''); setDebounced(''); } }, [open]);

  const candidatesQ = useQuery({
    queryKey: ['object-links', 'candidates', target, debounced],
    queryFn: () => searchCandidates(target, debounced),
    enabled: open,
  });
  const candidates = (candidatesQ.data ?? []).filter((c) => !(c.type === 'work' && c.id === workId));

  const connect = (c: LinkCandidate) => {
    let kind: LinkKind = 'schedule';
    let from: { type: 'work' | 'meeting'; id: string } = { type: 'work', id: workId };
    let to: { type: 'work' | 'meeting'; id: string } = { type: c.type as 'work' | 'meeting', id: c.id };
    if (c.type === 'work') {
      kind = relation === 'related' ? 'related' : 'precedes';
      // «앞» = 그 업무 → 이 업무
      if (relation === 'before') { from = { type: 'work', id: c.id }; to = { type: 'work', id: workId }; }
    }
    link.mutate({ fromType: from.type, fromId: from.id, toType: to.type, toId: to.id, kind });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-lg">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-center gap-2.5">
            <TitleIconChip icon={Link2} />
            <div className="min-w-0">
              <DialogTitle className="text-base">연결 추가</DialogTitle>
              <DialogDescription className="text-xs">이 업무와 이어진 일정·업무를 고릅니다. 양쪽을 다 볼 수 있는 사람에게만 보입니다.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 sm:px-6">
          <div className="flex gap-1.5" role="group" aria-label="잇는 대상">
            {([['meeting', '일정', CalendarDays], ['work', '업무', ListTodo]] as const).map(([value, label, Icon]) => (
              <Button key={value} type="button" size="sm" variant={target === value ? 'default' : 'outline'}
                className={cn('min-h-11 sm:min-h-9', target === value && 'bg-blue-600 hover:bg-blue-700')}
                aria-pressed={target === value} onClick={() => setTarget(value)}>
                <Icon className="mr-1.5 h-4 w-4" aria-hidden />{label}
              </Button>
            ))}
          </div>

          {target === 'work' && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="업무 사이 관계">
              {WORK_RELATIONS.map((r) => (
                <button key={r.value} type="button" title={r.hint} aria-pressed={relation === r.value} onClick={() => setRelation(r.value)}
                  className={cn('min-h-11 rounded-full border px-3 text-sm sm:min-h-8', relation === r.value ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600')}>
                  {r.label}
                </button>
              ))}
            </div>
          )}

          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9 text-base sm:text-sm"
              placeholder={target === 'meeting' ? '일정 제목(앞뒤 120일)' : '업무 이름'} aria-label="찾기" />
          </label>

          <ul className="divide-y divide-slate-100" aria-busy={candidatesQ.isLoading}>
            {candidatesQ.isLoading && <li className="py-3 text-sm text-slate-500">찾는 중…</li>}
            {!candidatesQ.isLoading && candidates.length === 0 && <li className="py-3 text-sm text-slate-500">맞는 것이 없습니다.</li>}
            {candidates.map((c) => {
              const linked = existing.has(`${c.type}:${c.id}`);
              return (
                <li key={c.id} className="flex min-w-0 items-center gap-2 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-800" title={c.label}>{c.label}</span>
                    {c.sub && <span className="block truncate text-xs text-slate-500">{c.sub}</span>}
                  </span>
                  <Button type="button" size="sm" variant="outline" className="min-h-11 flex-none sm:min-h-8"
                    disabled={linked || link.isPending} onClick={() => connect(c)}>
                    {linked ? '이어짐' : '잇기'}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className={DIALOG_FOOTER_CLASS}>
          <Button type="button" variant="ghost" className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)} onClick={() => onOpenChange(false)}>닫기</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
