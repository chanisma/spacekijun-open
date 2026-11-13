import { useMemo, useState } from 'react';
import { ListTree, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  useSelectableSubjects,
  useUpdateSelectableSubject,
  type SelectableSubjectRow,
} from '@/features/course-selection/hooks/useCourseSelection';
import { SUBJECT_CATEGORIES, CATEGORY_CODES, type CategoryCode } from '@/features/course-selection/constants/categories';
import { SUBJECT_PREREQUISITES } from '@/features/course-selection/constants/prerequisites';

interface RowEdit {
  default_max_capacity: number | null;
  default_class_count: number | null;
  is_active: boolean;
}

export function CourseSelectableSubjectManagement() {
  const { toast } = useToast();
  const { data: subjects = [], isLoading } = useSelectableSubjects();
  const update = useUpdateSelectableSubject();
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return subjects;
    return subjects.filter((s) => s.name.includes(search.trim()));
  }, [subjects, search]);

  const grouped = useMemo(() => {
    const m = new Map<string, SelectableSubjectRow[]>();
    for (const s of filtered) {
      const arr = m.get(s.category_code) ?? [];
      arr.push(s);
      m.set(s.category_code, arr);
    }
    return m;
  }, [filtered]);

  const stats = useMemo(() => {
    const total = subjects.length;
    const matched = subjects.filter((s) => s.school_curriculum_id).length;
    const withCap = subjects.filter((s) => s.default_max_capacity != null).length;
    return { total, matched, withCap };
  }, [subjects]);

  const getEdit = (s: SelectableSubjectRow): RowEdit =>
    edits[s.id] ?? {
      default_max_capacity: s.default_max_capacity,
      default_class_count: s.default_class_count,
      is_active: s.is_active,
    };

  const setEdit = (id: string, patch: Partial<RowEdit>) => {
    setEdits((prev) => ({
      ...prev,
      [id]: { ...getEdit({ id, ...patch } as never), ...patch },
    }));
  };

  const isDirty = (s: SelectableSubjectRow) => {
    const e = edits[s.id];
    if (!e) return false;
    return (
      e.default_max_capacity !== s.default_max_capacity ||
      e.default_class_count !== s.default_class_count ||
      e.is_active !== s.is_active
    );
  };

  const handleSave = async (s: SelectableSubjectRow) => {
    const e = edits[s.id];
    if (!e) return;
    try {
      await update.mutateAsync({ id: s.id, patch: e });
      toast({ title: '저장됨', description: s.name });
      setEdits((prev) => { const n = { ...prev }; delete n[s.id]; return n; });
    } catch (err) {
      toast({ title: '저장 실패', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ListTree className="h-6 w-6" />
            선택과목 카탈로그
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            학생이 신청 가능한 과목 목록 + 기본 정원. 카테고리·선수과목은 코드 상수 (TS).
          </p>
        </div>
        <Input placeholder="과목명 검색" value={search} onChange={(e) => setSearch(e.target.value)} className="w-[200px]" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>요약</CardTitle>
          <CardDescription>
            전체 {stats.total}과목 · 교육과정 매칭 {stats.matched}/{stats.total} · 정원 설정 {stats.withCap}/{stats.total}
          </CardDescription>
        </CardHeader>
      </Card>

      {CATEGORY_CODES.map((code) => {
        const cat = SUBJECT_CATEGORIES[code];
        const items = grouped.get(code) ?? [];
        if (items.length === 0) return null;
        return (
          <Card key={code}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Badge variant={cat.type === 'required' ? 'default' : 'secondary'} className="text-[10px]">
                  {code}
                </Badge>
                {cat.name}
                <span className="text-xs text-muted-foreground font-normal">
                  · {items.length}과목 · 신청 {cat.minSelections}~{cat.maxSelections}개 · {cat.type === 'required' ? '필수' : '선택'}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="text-left p-2 w-[35%]">과목명</th>
                    <th className="text-center p-2 w-[12%]">교육과정</th>
                    <th className="text-center p-2 w-[10%]">선수과목</th>
                    <th className="text-right p-2 w-[12%]">기본 정원</th>
                    <th className="text-right p-2 w-[10%]">분반 수</th>
                    <th className="text-center p-2 w-[10%]">활성</th>
                    <th className="text-right p-2 w-[11%]">저장</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => {
                    const e = getEdit(s);
                    const dirty = isDirty(s);
                    const prereq = SUBJECT_PREREQUISITES[s.name];
                    return (
                      <tr key={s.id} className={cn('border-b last:border-b-0', dirty && 'bg-amber-50/30')}>
                        <td className="p-2 font-medium">{s.name}</td>
                        <td className="p-2 text-center">
                          {s.school_curriculum_id ? (
                            <Badge variant="outline" className="text-[10px] border-green-500/40 text-green-700 dark:text-green-400">매칭됨</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[10px]">미매칭</Badge>
                          )}
                        </td>
                        <td className="p-2 text-center text-xs">
                          {prereq ? <span title={prereq.join(', ')} className="text-amber-700">{prereq.length}개</span> : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="p-2 text-right">
                          <Input
                            type="number" min={0} max={500}
                            value={e.default_max_capacity ?? ''}
                            onChange={(v) => setEdit(s.id, { default_max_capacity: v.target.value === '' ? null : parseInt(v.target.value, 10) })}
                            className="w-20 h-7 text-right text-xs ml-auto"
                          />
                        </td>
                        <td className="p-2 text-right">
                          <Input
                            type="number" min={0} max={20}
                            value={e.default_class_count ?? ''}
                            onChange={(v) => setEdit(s.id, { default_class_count: v.target.value === '' ? null : parseInt(v.target.value, 10) })}
                            className="w-16 h-7 text-right text-xs ml-auto"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <Switch checked={e.is_active} onCheckedChange={(v) => setEdit(s.id, { is_active: v })} />
                        </td>
                        <td className="p-2 text-right">
                          <Button size="sm" variant={dirty ? 'default' : 'ghost'} disabled={!dirty || update.isPending} onClick={() => handleSave(s)}>
                            <Save className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
