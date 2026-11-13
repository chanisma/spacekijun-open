// AI 표 정리 — 한 열에서 같은 것을 가리키는 표기를 묶는다(노트북/랩탑). **버튼을 눌렀을 때만** 돈다.
// AI 에는 행이 아니라 고유값만 보낸다(src/lib/workAi.ts). 제안은 [적용]/[무시] 카드이고
// 적용해도 저장되지 않은 표만 바뀐다 — 저장은 사람이 [저장]을 눌러야 한다.

import { useMemo, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { applyTidyGroups, distinctColumnValues, type SuggestionDecision } from '@/lib/workAi';
import type { OutputTable } from '@/lib/workPipeline';
import { recordSuggestionDecision, runTableTidy, type AiSuggestionRecord, type TableTidyResult } from '@/services/workAiService';
import { toast } from '@/lib/toast';

export function TableTidyPanel({
  workId,
  taskId,
  table,
  onApply,
}: {
  workId: string;
  taskId: string;
  table: OutputTable;
  onApply: (next: OutputTable) => void;
}) {
  // 묶을 값이 둘 이상인 열만 고를 수 있다
  const candidates = useMemo(
    () => table.columns.filter((c) => distinctColumnValues(table, c.key).length >= 2),
    [table],
  );
  const [columnKey, setColumnKey] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [suggestion, setSuggestion] = useState<AiSuggestionRecord<TableTidyResult> | null>(null);
  const [decisions, setDecisions] = useState<Record<string, SuggestionDecision>>({});

  if (candidates.length === 0) return null;
  const activeKey = candidates.some((c) => c.key === columnKey) ? columnKey : candidates[0].key;

  const run = async (force = false) => {
    setRunning(true);
    try {
      const res = await runTableTidy({ workId, taskId, table, columnKey: activeKey, force });
      setSuggestion(res);
      setDecisions(res.decisions);
      if (res.result.groups.length === 0) toast.info('묶을 표기를 찾지 못했습니다.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  // 지금 표의 이 열에 실제로 있는 값 — 묶음이 가리키는 값이 없으면 적용해도 아무 일이 없다
  // (조기 return 뒤라 훅을 쓰지 않는다 — 가벼운 계산이다)
  const presentValues = new Set(distinctColumnValues(table, activeKey).map((v) => v.value));

  const decide = (groupId: string, decision: SuggestionDecision) => {
    if (!suggestion) return;
    if (decision === 'applied') {
      const group = suggestion.result.groups.find((g) => g.id === groupId);
      // ⚠️ 적용할 열은 **지금 고른 열**이다 — 캐시가 다른 표에서 맞았을 때 그쪽 열 키로 적용하면 아무 일도
      //    안 일어나는데 «적용함»으로 보였다(적대적 검증 2026-09-27)
      if (group) onApply(applyTidyGroups(table, activeKey, [group]));
    }
    setDecisions((prev) => ({ ...prev, [groupId]: decision }));
    void recordSuggestionDecision(suggestion.id, groupId, decision);
  };

  return (
    <div className="space-y-2 rounded-lg border border-violet-100 bg-violet-50/40 p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Select value={activeKey} onValueChange={(v) => { setColumnKey(v); setSuggestion(null); }}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {candidates.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="sm" className="h-8 border-violet-200 text-xs text-violet-700" onClick={() => run()} disabled={running}>
          {running ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
          AI 표기 묶기
        </Button>
        {suggestion?.cached && (
          <button type="button" className="text-[10px] text-slate-400 hover:text-slate-600" onClick={() => run(true)}>
            저장된 결과 · 다시 받기
          </button>
        )}
      </div>
      {suggestion && suggestion.result.groups.length > 0 && (
        <ul className="space-y-1">
          {suggestion.result.groups.map((g) => {
            const d = decisions[g.id];
            const applicable = g.variants.some((v) => v !== g.canonical && presentValues.has(v));
            return (
              <li key={g.id} className="flex flex-wrap items-center gap-1.5 rounded-md bg-white px-2 py-1 text-[11px]">
                <span className="min-w-0 flex-1 text-slate-700">
                  {g.variants.filter((v) => v !== g.canonical).join(', ')} → <b>{g.canonical}</b>
                </span>
                {d ? (
                  <span className={d === 'applied' ? 'text-emerald-600' : 'text-slate-400'}>{d === 'applied' ? '적용함' : '무시함'}</span>
                ) : !applicable ? (
                  <span className="text-slate-400">이미 같은 표기</span>
                ) : (
                  <>
                    <Button type="button" size="sm" className="h-7 bg-blue-600 px-2 text-[11px] hover:bg-blue-700" onClick={() => decide(g.id, 'applied')}>적용</Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => decide(g.id, 'dismissed')}>무시</Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {suggestion && suggestion.result.dropped > 0 && (
        <p className="text-[10px] text-slate-400">표에 없는 값을 쓴 제안 {suggestion.result.dropped}개는 뺐습니다.</p>
      )}
    </div>
  );
}
