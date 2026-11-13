// ========================================
// 과제 단위 편집기 (2026-08-12)
// 할 일을 "과제 명칭" 단위(예: 과목별 평가계획서)로 쪼개고, 단위마다 담당자를
// 미리 지정하거나 비워 둔다(비운 단위는 담당자 범주의 사용자가 카드에서 직접 선택).
// 프리셋: 과목별(teacher_timetable 현행 학기 — 과목↔담당교사 자동 매칭),
//         학급별(resource_tags "N학년 M반" — 담임 자동 매칭). 프리셋은 불러온 시점의
//         매칭을 복사하는 스냅샷이다(이후 담당 교사가 바뀌어도 발행된 할 일은 불변).
// 붙여넣기: 엑셀 2열(단위명 ⇥ 담당자명들) 일괄 등록, 이름은 교사 리소스에 매칭.
// ========================================

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { DialogFooter,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import { supabase } from '@/integrations/supabase/client';
import { useTimetableTerm, formatTermLabel } from '@/hooks/useTimetableTerm';
import { newUnitKey, parseUnitPaste } from '@/lib/taskUnits';
import { BookOpen, ClipboardPaste, ListChecks, Plus, School, X } from 'lucide-react';

/** 편집 폼에서 다루는 단위 행 — assigneeIds는 그 단위를 맡은(배정/선택된) 담당자 */
export interface UnitRow {
  key: string;
  label: string;
  assigneeIds: string[];
}

interface ResourceLike {
  id: string;
  name: string;
  type: string;
}

interface PresetUnit {
  label: string;
  assigneeIds: string[];
  assigneeNames: string[];
}

/** 페이지네이션 fetch — PostgREST가 1000행에서 조용히 잘라내므로 range로 끝까지 읽는다 */
async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const pageSize = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
}

/** 과목별 프리셋 — 현행 학기 teacher_timetable에서 (학년, 과목) → 담당교사(들) */
function useSubjectPresetUnits(enabled: boolean, teacherByName: Map<string, string>) {
  const { term } = useTimetableTerm();
  return {
    term,
    query: useQuery({
      queryKey: ['task-unit-preset-subjects', term?.year, term?.semester],
      enabled: enabled && Boolean(term),
      staleTime: 5 * 60 * 1000,
      queryFn: async (): Promise<PresetUnit[]> => {
        const rows = await fetchAllRows<{
          grade: number;
          subject_name: string;
          teacher_name: string | null;
          teacher_resource_id: string | null;
        }>((from, to) =>
          supabase
            .from('teacher_timetable')
            .select('grade, subject_name, teacher_name, teacher_resource_id')
            .eq('academic_year', term!.year)
            .eq('semester', term!.semester)
            .eq('activity_type', 'subject')
            .range(from, to)
        );

        const byUnit = new Map<string, { label: string; ids: Map<string, string> }>();
        for (const row of rows) {
          const label = `${row.grade}학년 ${row.subject_name}`;
          const entry = byUnit.get(label) ?? { label, ids: new Map() };
          const name = row.teacher_name?.trim() ?? '';
          // teacher_resource_id가 비어 있으면 이름으로 교사 리소스에 폴백 매칭
          const id = row.teacher_resource_id ?? teacherByName.get(name.replace(/\s+/g, ''));
          if (id) entry.ids.set(id, name || id);
          byUnit.set(label, entry);
        }
        return [...byUnit.values()]
          .sort((a, b) => a.label.localeCompare(b.label, 'ko'))
          .map((u) => ({
            label: u.label,
            assigneeIds: [...u.ids.keys()],
            assigneeNames: [...u.ids.values()],
          }));
      },
    }),
  };
}

/** 학급별 프리셋 — resource_tags "N학년 M반"(담임 판정의 정본)에서 반 → 담임 */
function useClassPresetUnits(enabled: boolean) {
  return useQuery({
    queryKey: ['task-unit-preset-classes'],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PresetUnit[]> => {
      const { data: tags, error: tagError } = await supabase
        .from('resource_tags')
        .select('id, name')
        .like('name', '%학년%반');
      if (tagError) throw new Error(tagError.message);
      const classTags = (tags ?? []).filter((t) => /^[1-3]\s*학년\s*\d+\s*반$/.test(t.name));
      if (classTags.length === 0) return [];

      const { data: assignments, error: asgError } = await supabase
        .from('resource_tag_assignments')
        .select('tag_id, resource_id')
        .in('tag_id', classTags.map((t) => t.id));
      if (asgError) throw new Error(asgError.message);

      const resourceIds = [...new Set((assignments ?? []).map((a) => a.resource_id))];
      const { data: teachers, error: teacherError } = resourceIds.length
        ? await supabase
            .from('resource')
            .select('id, name, type')
            .in('id', resourceIds)
            .eq('type', 'teacher')
        : { data: [], error: null };
      if (teacherError) throw new Error(teacherError.message);
      const teacherById = new Map((teachers ?? []).map((r) => [r.id, r.name]));

      const tagById = new Map(classTags.map((t) => [t.id, t.name]));
      const byTag = new Map<string, { label: string; ids: Map<string, string> }>();
      for (const a of assignments ?? []) {
        const tagName = tagById.get(a.tag_id);
        const teacherName = teacherById.get(a.resource_id);
        if (!tagName || !teacherName) continue;
        const match = tagName.match(/^([1-3])\s*학년\s*(\d+)\s*반$/);
        if (!match) continue;
        const label = `${match[1]}학년 ${match[2]}반`;
        const entry = byTag.get(label) ?? { label, ids: new Map() };
        entry.ids.set(a.resource_id, teacherName);
        byTag.set(label, entry);
      }
      return [...byTag.values()]
        .sort((a, b) => a.label.localeCompare(b.label, 'ko', { numeric: true }))
        .map((u) => ({
          label: u.label,
          assigneeIds: [...u.ids.keys()],
          assigneeNames: [...u.ids.values()],
        }));
    },
  });
}

/** 프리셋 선택 다이얼로그 — 체크한 항목을 단위 행으로 추가(이미 있는 라벨은 기본 해제) */
function UnitPresetDialog({
  kind,
  open,
  onOpenChange,
  existingLabels,
  onAdd,
  teacherByName,
}: {
  kind: 'subject' | 'class';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingLabels: Set<string>;
  onAdd: (units: PresetUnit[]) => void;
  teacherByName: Map<string, string>;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const subject = useSubjectPresetUnits(open && kind === 'subject', teacherByName);
  const classQuery = useClassPresetUnits(open && kind === 'class');

  const query = kind === 'subject' ? subject.query : classQuery;
  const units = query.data ?? [];
  const selectable = units.filter((u) => !existingLabels.has(u.label));

  const toggle = (label: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });

  const handleAdd = () => {
    onAdd(units.filter((u) => checked.has(u.label)));
    setChecked(new Set());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-md overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-base">
            {kind === 'subject' ? '과목별 단위 불러오기' : '학급별 단위 불러오기'}
          </DialogTitle>
          <DialogDescription>
            {kind === 'subject'
              ? `현행 학기(${formatTermLabel(subject.term) ?? '학기 미확인'}) 수업 배정에서 과목과 담당 교사를 가져옵니다.`
              : '학급 담임 태그(N학년 M반)에서 반과 담임 교사를 가져옵니다.'}
            {' '}불러온 뒤에도 단위별 담당자를 수정할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        {query.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">불러오는 중…</p>
        ) : query.isError ? (
          <p className="py-6 text-center text-sm text-rose-600">
            목록을 불러오지 못했습니다: {(query.error as Error)?.message}
          </p>
        ) : units.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            불러올 항목이 없습니다.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{selectable.length}개 선택 가능</span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setChecked(new Set(selectable.map((u) => u.label)))}
                >
                  전체 선택
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setChecked(new Set())}
                >
                  전체 해제
                </Button>
              </div>
            </div>
            <div className="max-h-[45vh] space-y-1 overflow-y-auto rounded-md border p-2">
              {units.map((unit) => {
                const already = existingLabels.has(unit.label);
                return (
                  <label
                    key={unit.label}
                    className={
                      'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50 ' +
                      (already ? 'opacity-45' : '')
                    }
                  >
                    <Checkbox
                      checked={checked.has(unit.label)}
                      disabled={already}
                      onCheckedChange={() => toggle(unit.label)}
                    />
                    <span className="min-w-0 flex-1 truncate">{unit.label}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {already
                        ? '추가됨'
                        : unit.assigneeNames.length > 0
                          ? unit.assigneeNames.join(', ')
                          : '담당자 없음'}
                    </span>
                  </label>
                );
              })}
            </div>
          </>
        )}

        <DialogFooter className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button type="button" size="sm" disabled={checked.size === 0} onClick={handleAdd}>
            {checked.size > 0 ? `${checked.size}개 단위 추가` : '단위 추가'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UnitPasteDialog({
  open,
  onOpenChange,
  onAdd,
  teacherByName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (rows: Array<{ label: string; assigneeIds: string[] }>) => void;
  teacherByName: Map<string, string>;
}) {
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseUnitPaste(text, teacherByName), [text, teacherByName]);

  const handleAdd = () => {
    onAdd(parsed.rows.map(({ label, assigneeIds }) => ({ label, assigneeIds })));
    setText('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobile="fullscreen" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">붙여넣기로 단위 추가</DialogTitle>
          <DialogDescription>
            엑셀·구글 시트에서 복사해 붙여넣으세요. 1열은 단위명, 2열부터는 담당자 이름입니다.
            담당자 열이 없으면 담당자 없는 단위로 추가됩니다(범주 담당자가 직접 선택).
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'예)\n물리학Ⅰ\t김교사\n화학Ⅰ\t이교사, 박교사\n기타 서류'}
          rows={7}
          className="font-mono text-sm"
        />
        {text.trim() && (
          <div className="space-y-1 text-xs">
            <p className="text-muted-foreground">
              단위 {parsed.rows.length}개 ·{' '}
              담당자 매칭 {parsed.rows.filter((r) => r.assigneeIds.length > 0).length}개
            </p>
            {parsed.unmatchedNames.length > 0 && (
              <p className="text-amber-600">
                매칭 안 된 이름(무시됨): {parsed.unmatchedNames.join(', ')}
              </p>
            )}
          </div>
        )}
        <DialogFooter className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button type="button" size="sm" disabled={parsed.rows.length === 0} onClick={handleAdd}>
            {parsed.rows.length > 0 ? `${parsed.rows.length}개 단위 추가` : '단위 추가'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface TaskUnitEditorProps {
  rows: UnitRow[];
  onChange: (rows: UnitRow[]) => void;
  /** 이름→id 매칭용 전체 리소스(TaskEditDialog의 useResources 결과 재사용) */
  resources?: ResourceLike[];
}

export function TaskUnitEditor({ rows, onChange, resources }: TaskUnitEditorProps) {
  const [presetKind, setPresetKind] = useState<'subject' | 'class' | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);

  // 공백 제거 이름 → 교사 리소스 id (동명이인은 먼저 온 쪽 — 프리셋은 id 우선이라 영향 최소)
  const teacherByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of resources ?? []) {
      if (r.type !== 'teacher') continue;
      const key = r.name.replace(/\s+/g, '');
      if (!map.has(key)) map.set(key, r.id);
    }
    return map;
  }, [resources]);

  const existingLabels = useMemo(() => new Set(rows.map((r) => r.label)), [rows]);

  const updateRow = (key: string, patch: Partial<UnitRow>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const appendRows = (added: Array<{ label: string; assigneeIds: string[] }>) =>
    onChange([
      ...rows,
      ...added
        .filter((a) => !existingLabels.has(a.label))
        .map((a) => ({ key: newUnitKey(), label: a.label, assigneeIds: a.assigneeIds })),
    ]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() => onChange([...rows, { key: newUnitKey(), label: '', assigneeIds: [] }])}
        >
          <Plus className="h-3.5 w-3.5" />
          단위 추가
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() => setPresetKind('subject')}
        >
          <BookOpen className="h-3.5 w-3.5" />
          과목별 불러오기
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() => setPresetKind('class')}
        >
          <School className="h-3.5 w-3.5" />
          학급별 불러오기
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() => setPasteOpen(true)}
        >
          <ClipboardPaste className="h-3.5 w-3.5" />
          붙여넣기
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          <ListChecks className="mx-auto mb-1 h-4 w-4" />
          단위가 없습니다. 직접 추가하거나 과목별·학급별 프리셋을 불러오세요.
        </p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((row, index) => (
            <div key={row.key} className="flex items-start gap-1.5">
              <span className="mt-2 w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <Input
                value={row.label}
                onChange={(e) => updateRow(row.key, { label: e.target.value })}
                placeholder="단위 이름 (예: 물리학Ⅰ)"
                className="h-9 flex-1"
              />
              <div className="w-[45%] min-w-0">
                <SearchableMultiSelect
                  filterByTeacher
                  selectedValues={row.assigneeIds}
                  onSelectionChange={(ids) => updateRow(row.key, { assigneeIds: ids })}
                  placeholder="담당자 (비우면 직접 선택)"
                  maxSelectedDisplay={1}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-0.5 h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-rose-600"
                onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
                title="이 단위 삭제"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        담당자를 지정하지 않은 단위는 담당자 범주에 있는 사용자가 할 일 카드에서 직접
        선택해 수행합니다. 모든 단위가 완료되면 할 일이 완료 처리됩니다.
      </p>

      {presetKind && (
        <UnitPresetDialog
          kind={presetKind}
          open
          onOpenChange={(open) => !open && setPresetKind(null)}
          existingLabels={existingLabels}
          onAdd={appendRows}
          teacherByName={teacherByName}
        />
      )}
      <UnitPasteDialog
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        onAdd={appendRows}
        teacherByName={teacherByName}
      />
    </div>
  );
}
