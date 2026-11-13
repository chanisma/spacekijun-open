// 창체 옛 기록 연결 (2026-11-11 동아리 P5) — 담당자.
// 창체에 이미 있는 옛 동아리 주최(«두잇1(코딩)» 같은 탐구 원본 표기, 2023~2025 활동)를 동아리 계보에 잇는다.
// ⚠️ 이름이 비슷하다고 자동으로 잇지 않는다(창체의 결정) — 서버가 표기만 다른 후보를 «제안»하고 사람이 [잇기]를 누른다.
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, History, Link2, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useClubMutation, useHostCandidates } from '../hooks/useClubs';
import { linkHost } from '../services/clubService';
import type { ClubSummary } from '../types';
import { PanelTitle } from './panel';

export function ArchiveLinkCard({ clubs }: { clubs: ClubSummary[] }) {
  const [open, setOpen] = useState(false);
  const { data = [] } = useHostCandidates(true);
  const [pick, setPick] = useState<Record<string, string>>({});
  const link = useClubMutation(({ host, club }: { host: string; club: string | null }) => linkHost(host, club), {
    success: () => null,
  });
  // 동아리(정체성) 하나에 한 줄 — 이름이 바뀐 해의 두 행은 club_id 가 같다
  const clubOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of clubs) if (!seen.has(c.club_id) && c.status !== 'proposed') seen.set(c.club_id, c.name);
    return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [clubs]);
  const unlinked = data.filter((c) => !c.linked_club);
  if (data.length === 0) return null;
  const acts = unlinked.reduce((s, c) => s + c.activities, 0);

  return (
    <div className="rounded-xl border bg-white ">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
        <PanelTitle icon={History}>창체 옛 기록 연결</PanelTitle>
        <span className="ml-auto text-xs text-slate-500">
          {unlinked.length ? <span className="text-amber-700">잇지 않은 옛 주최 {unlinked.length} · 활동 {acts}건</span> : '모두 이었습니다'}
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t px-4 pb-4 pt-3">
          <p className="text-xs text-slate-500">
            창체 아카이브의 옛 동아리 이름(지난 생기부 표기)을 지금 동아리에 이으면, 그 활동이 동아리 «활동 › 지난 해»와 학생 아카이브에 나타납니다.
            이름이 비슷해도 자동으로 잇지 않습니다 — 같은 동아리가 맞는지 확인하고 이어 주세요.
          </p>
          <ul className="divide-y">
            {data.map((c) => {
              const chosen = pick[c.host_id] ?? c.suggestion?.club_id ?? '';
              return (
                <li key={c.host_id} className="flex min-w-0 flex-wrap items-center gap-2 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900" title={c.name}>{c.name}</span>
                    <span className="text-xs text-slate-500">활동 {c.activities}건{c.years?.length ? ` · ${c.years.join('·')}` : ''}</span>
                  </span>
                  {c.linked_club ? (
                    <>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"><Link2 className="h-3 w-3" />{c.linked_club.name}</span>
                      <Button size="sm" variant="ghost" className="h-9 gap-1 text-xs text-slate-500" onClick={() => link.mutate({ host: c.host_id, club: null })}><Unlink className="h-3.5 w-3.5" />끊기</Button>
                    </>
                  ) : (
                    <>
                      <Select value={chosen || undefined} onValueChange={(v) => setPick((p) => ({ ...p, [c.host_id]: v }))}>
                        <SelectTrigger className="h-9 w-44" aria-label={`${c.name} 을 이을 동아리`}><SelectValue placeholder="동아리 고르기" /></SelectTrigger>
                        <SelectContent>{clubOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}{c.suggestion?.club_id === o.id ? ' (제안)' : ''}</SelectItem>)}</SelectContent>
                      </Select>
                      <Button size="sm" className="h-9 gap-1 bg-blue-600 text-xs hover:bg-blue-700" disabled={!chosen || link.isPending}
                        onClick={() => link.mutate({ host: c.host_id, club: chosen })}><Link2 className="h-3.5 w-3.5" />잇기</Button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
