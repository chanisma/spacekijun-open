// ========================================
// 교과 분류 관리 (Admin "교과 분류")
// 과목 → 교과(군). 대상 선정 규칙("1학년 수학 교사 전원")이 이 분류를 읽는다.
// 판정은 서버(subject_group_catalog → subject_group_of)가 하고, 여기는 보여 주고 고치기만 한다.
// ========================================

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Shapes, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/lib/toast';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  GROUP_TO_CLUSTER,
  SUBJECT_CLUSTERS,
  SUBJECT_GROUPS,
  SUBJECT_GROUP_SOURCE_LABEL,
  isSubjectGroup,
  shortSubjectGroup,
  type SubjectGroupCatalogRow,
} from '@/lib/subjectClassification';
import { cn } from '@/lib/utils';

const CATALOG_KEY = ['subject-group-catalog'] as const;
const NONE = '__none__';
const DERIVED = '__derived__';

const SOURCE_TONE: Record<SubjectGroupCatalogRow['source'], string> = {
  manual: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  auto: 'bg-slate-50 text-slate-600 border-slate-200',
  fallback: 'bg-amber-50 text-amber-700 border-amber-200',
  none: 'bg-rose-50 text-rose-700 border-rose-200',
};

export function SubjectClassificationManagement() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [taughtOnly, setTaughtOnly] = useState(true);
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [clusterFilter, setClusterFilter] = useState<string>('all');

  const { data: rows = [], isLoading } = useQuery({
    queryKey: CATALOG_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('subject_group_catalog', {});
      if (error) throw error;
      return (data ?? []) as SubjectGroupCatalogRow[];
    },
  });

  const assign = useMutation({
    mutationFn: async ({ subject, group }: { subject: string; group: string | null }) => {
      if (group === null) {
        // 직접 지정을 거둔다 → 원본 라벨 판정으로 돌아간다
        const { error } = await supabase
          .from('subject_classification')
          .delete()
          .eq('subject_name', subject);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from('subject_classification')
        .upsert(
          { subject_name: subject, subject_group: group, source: 'manual', updated_at: new Date().toISOString() },
          { onConflict: 'subject_name' },
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATALOG_KEY }),
    onError: (error: Error) => toast.error(`교과 분류를 저장하지 못했습니다: ${error.message}`),
  });

  // 묶음 예외 — NULL 이면 교과(군)에서 유도(새 과목이 묶음에서 조용히 빠지지 않게 과목마다 저장하지 않는다)
  const assignCluster = useMutation({
    mutationFn: async ({ row, cluster }: { row: SubjectGroupCatalogRow; cluster: string | null }) => {
      if (!row.subject_group) throw new Error('교과(군)를 먼저 정하세요.');
      const { error } = await supabase
        .from('subject_classification')
        .upsert(
          {
            subject_name: row.subject_name,
            subject_group: row.subject_group,
            // 표에 없던 과목(원본 라벨 판정)은 그 판정을 그대로 적는다
            source: row.source === 'manual' ? 'manual' : 'auto',
            cluster_override: cluster,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'subject_name' },
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATALOG_KEY }),
    onError: (error: Error) => toast.error(`묶음을 저장하지 못했습니다: ${error.message}`),
  });

  const clusterCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows.filter((x) => x.teacher_count > 0)) {
      const key = r.subject_cluster ?? NONE;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [rows]);

  const taught = useMemo(() => rows.filter((r) => r.teacher_count > 0), [rows]);
  const unclassifiedTaught = taught.filter((r) => !r.subject_group).length;

  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of taught) {
      const key = r.subject_group ?? NONE;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [taught]);

  const visible = useMemo(() => {
    const q = search.trim().replace(/\s+/g, '');
    return rows.filter((r) => {
      if (taughtOnly && r.teacher_count === 0) return false;
      if (groupFilter !== 'all' && (r.subject_group ?? NONE) !== groupFilter) return false;
      if (clusterFilter !== 'all' && (r.subject_cluster ?? NONE) !== clusterFilter) return false;
      if (q && !r.subject_name.replace(/\s+/g, '').includes(q)) return false;
      return true;
    });
  }, [rows, search, taughtOnly, groupFilter, clusterFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">교과 분류</h2>
        <p className="text-sm text-muted-foreground">
          과목이 어느 교과(군)에 속하는지 정합니다. 할 일의 대상을 "1학년 수학 교사 전원"처럼
          고를 때 이 분류를 씁니다. 교육과정 원본 라벨이 개정판마다 달라 여기서 10개 교과(군)로 맞춥니다.
        </p>
      </div>

      {/* 교과 묶음 — 교과(군) 위의 한 층. 어문학과 = 국어·제2외국어/한문, 예체능 = 기가·정보·체육·예술·교양(교육학 제외) */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-semibold text-slate-400">묶음</span>
        <GroupChip label="전체" count={taught.length} active={clusterFilter === 'all'} onClick={() => setClusterFilter('all')} />
        {SUBJECT_CLUSTERS.map((c) => (
          <GroupChip
            key={c}
            label={shortSubjectGroup(c)}
            title={c}
            count={clusterCounts.get(c) ?? 0}
            active={clusterFilter === c}
            onClick={() => setClusterFilter(c)}
          />
        ))}
      </div>

      {/* 교과(군)별 올해 개설 과목 수 — 누르면 그 교과(군)만 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-semibold text-slate-400">교과(군)</span>
        <GroupChip label="전체" count={taught.length} active={groupFilter === 'all'} onClick={() => setGroupFilter('all')} />
        {SUBJECT_GROUPS.map((g) => (
          <GroupChip
            key={g}
            label={shortSubjectGroup(g)}
            title={g}
            count={groupCounts.get(g) ?? 0}
            active={groupFilter === g}
            onClick={() => setGroupFilter(g)}
          />
        ))}
        {unclassifiedTaught > 0 && (
          <GroupChip
            label="미분류"
            count={unclassifiedTaught}
            tone="danger"
            active={groupFilter === NONE}
            onClick={() => setGroupFilter(NONE)}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="과목 이름으로 찾기"
            className="h-9 pl-8"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="taught-only" checked={taughtOnly} onCheckedChange={setTaughtOnly} />
          <Label htmlFor="taught-only" className="text-sm">올해 개설 과목만</Label>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">과목</th>
              <th className="px-3 py-2 text-left font-medium">올해 개설</th>
              <th className="px-3 py-2 text-left font-medium">교육과정 원본 라벨</th>
              <th className="px-3 py-2 text-left font-medium">교과(군)</th>
              <th className="px-3 py-2 text-left font-medium">묶음</th>
              <th className="px-3 py-2 text-left font-medium">판정</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">불러오는 중…</td></tr>
            )}
            {!isLoading && visible.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">조건에 맞는 과목이 없습니다.</td></tr>
            )}
            {visible.map((r) => (
              <tr key={r.subject_name} className="border-t">
                <td className="px-3 py-2 font-medium text-slate-800">{r.subject_name}</td>
                <td className="px-3 py-2 text-slate-600">
                  {r.teacher_count > 0
                    ? `${r.taught_grades.map((g) => `${g}학년`).join('·')} · 교사 ${r.teacher_count}명`
                    : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">
                  {r.curriculum_labels.length > 0 ? r.curriculum_labels.join(', ') : '—'}
                </td>
                <td className="px-3 py-2">
                  <Select
                    value={r.subject_group ?? NONE}
                    onValueChange={(v) => assign.mutate({ subject: r.subject_name, group: v === NONE ? null : v })}
                    disabled={assign.isPending}
                  >
                    <SelectTrigger className="h-8 w-[190px] text-xs" aria-label={`${r.subject_name} 교과(군)`}>
                      <SelectValue placeholder="미분류" />
                    </SelectTrigger>
                    <SelectContent>
                      {!r.subject_group && <SelectItem value={NONE}>미분류</SelectItem>}
                      {SUBJECT_GROUPS.map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2">
                  <Select
                    value={r.cluster_override ?? DERIVED}
                    onValueChange={(v) => assignCluster.mutate({ row: r, cluster: v === DERIVED ? null : v })}
                    disabled={assignCluster.isPending || !r.subject_group}
                  >
                    <SelectTrigger
                      className={cn('h-8 w-[170px] text-xs', r.cluster_override && 'border-indigo-300 bg-indigo-50/60')}
                      aria-label={`${r.subject_name} 묶음`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DERIVED}>
                        교과(군) 따름{r.subject_group && isSubjectGroup(r.subject_group) ? ` · ${GROUP_TO_CLUSTER[r.subject_group]}` : ''}
                      </SelectItem>
                      {SUBJECT_CLUSTERS.map((c) => (
                        <SelectItem key={c} value={c}>{c} (예외)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className={cn('text-[11px] font-normal', SOURCE_TONE[r.source])}>
                      {SUBJECT_GROUP_SOURCE_LABEL[r.source]}
                    </Badge>
                    {r.source === 'manual' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-slate-500"
                        // 되돌리기는 분류 행을 지운다 — 묶음 예외(교육학 → 교양)가 있으면 함께 조용히 사라지므로 막는다
                        title={r.cluster_override
                          ? '묶음 예외가 있어 되돌릴 수 없습니다 — 묶음을 「교과(군) 따름」으로 먼저 바꾸세요'
                          : '직접 지정을 거두고 교육과정 원본 라벨로 판정합니다'}
                        onClick={() => assign.mutate({ subject: r.subject_name, group: null })}
                        disabled={assign.isPending || Boolean(r.cluster_override)}
                      >
                        <RotateCcw className="mr-1 h-3 w-3" />
                        원본대로
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <Shapes className="h-3.5 w-3.5" />
        새로 개설된 과목은 교육과정 원본 라벨로 자동 판정됩니다. 원본이 여러 교과를 한 칸에 묶은 경우
        (2015 개정 「기술·가정/제2외국어/한문/교양」)만 미분류로 남으니 여기서 지정해 주세요. 묶음은 교과(군)을 따르고,
        교육학처럼 과목 하나만 다른 묶음에 둘 때만 예외를 고릅니다.
      </p>
    </div>
  );
}

function GroupChip({
  label,
  title,
  count,
  active,
  tone,
  onClick,
}: {
  label: string;
  title?: string;
  count: number;
  active: boolean;
  tone?: 'danger';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors',
        active
          ? tone === 'danger'
            ? 'border-rose-300 bg-rose-50 text-rose-700'
            : 'border-blue-300 bg-blue-50 text-blue-700'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
      )}
    >
      {label}
      <span className={cn('tabular-nums', active ? 'font-semibold' : 'text-slate-400')}>{count}</span>
    </button>
  );
}
