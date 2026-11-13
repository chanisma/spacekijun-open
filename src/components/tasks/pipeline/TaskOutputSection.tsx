// 이 할 일이 «무엇을 남기는가» — 선언 + 자동 원천(입력 받기·제출물·문서) + 사람이 남기는 값·명단·표.
// 저장은 save_task_output RPC(매니저·그 할 일 담당자). 선언은 task.meta.output(매니저).
// 판정 = src/lib/workPipeline.ts

import { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, Loader2, Lock, PackageOpen, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import { useResourceSelect } from '@/hooks/useResourceSelect';
import { SectionLabel } from '@/components/tasks/dialogDesign';
import { toast } from '@/lib/toast';
import {
  effectiveOutputKind,
  isManualOutputKind,
  manualPayloadToBody,
  OUTPUT_KIND_META,
  OUTPUT_KIND_ORDER,
  parseOutputDecl,
  sameOutputSource,
  type OutputKind,
  type OutputPerson,
  type OutputTable,
  type PipelineActionLike,
  type ResolvedOutput,
} from '@/lib/workPipeline';
import { tablePayload, type TaskOutputValueRow } from '@/services/workPipelineService';
import { useClearTaskOutput, useSaveTaskOutput, useUpdateTaskOutputDecl, type PipelineTask } from '@/hooks/useWorkPipeline';
import { OutputBodyView } from './OutputView';
import { RowPicker } from './RowPicker';
import { TableTidyPanel } from './TableTidyPanel';
import { TableEditor } from './TableEditor';

export function TaskOutputSection({
  workId,
  task,
  actions,
  resolved,
  manual,
  canManage,
  canWrite,
  upstream,
  onDirtyChange,
}: {
  workId: string;
  task: PipelineTask;
  actions: PipelineActionLike[];
  /** 이 할 일의 풀어낸 산출물(자동 원천 + 직접 남긴 것) */
  resolved: ResolvedOutput[];
  manual: TaskOutputValueRow | null;
  canManage: boolean;
  canWrite: boolean;
  /** 앞 단계 산출물 — 행 고르기의 재료 */
  upstream: ResolvedOutput[];
  /** 저장하지 않은 변경이 있는가 — 페이지가 다른 할 일로 옮기기 전에 한 번 묻는다 */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const decl = parseOutputDecl(task.meta);
  const kind = effectiveOutputKind(task, actions);
  const updateDecl = useUpdateTaskOutputDecl(workId);
  const save = useSaveTaskOutput(workId);
  const clear = useClearTaskOutput(workId);

  // ── 선언 편집 ──
  const [declKind, setDeclKind] = useState<OutputKind | 'auto'>(decl?.kind ?? 'auto');
  const [declLabel, setDeclLabel] = useState(decl?.label ?? '');
  useEffect(() => {
    setDeclKind(decl?.kind ?? 'auto');
    setDeclLabel(decl?.label ?? '');
  }, [task.id, decl?.kind, decl?.label]);
  const declDirty = (decl?.kind ?? 'auto') !== declKind || (decl?.label ?? '') !== declLabel.trim();

  const saveDecl = async () => {
    try {
      await updateDecl.mutateAsync({
        taskId: task.id,
        decl: declKind === 'auto' ? null : { kind: declKind, ...(declLabel.trim() ? { label: declLabel.trim() } : {}) },
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // ── 직접 남기는 값 ──
  // 저장된 값의 형태가 **지금 선언과 다르면** 편집기에 섞지 않는다 — 따로 «형태가 달라진 옛 값»으로 보이고
  // 지울 수 있게 한다(선언을 바꾼 뒤 옛 값이 편집기엔 안 보이면서 뒤 단계로는 흘렀다 — 적대적 검증 2026-09-27)
  const manualMatches = !!manual && manual.kind === kind;
  const manualBody = manual && manualMatches ? manualPayloadToBody(manual.kind, manual.payload) : null;
  const staleBody = manual && !manualMatches ? manualPayloadToBody(manual.kind, manual.payload) : null;
  const [text, setText] = useState('');
  const [peopleIds, setPeopleIds] = useState<string[]>([]);
  const [table, setTable] = useState<OutputTable>({ columns: [], rows: [] });
  const [provenance, setProvenance] = useState<Record<string, unknown>>({});
  const [picking, setPicking] = useState<ResolvedOutput | null>(null);
  const [dirty, setDirty] = useState(false);
  /** 비공개 원천에서 가져왔는가 — 저장하면 매니저만 본다. 한 번 제한되면 이 표에서는 풀리지 않는다 */
  const [restricted, setRestricted] = useState(false);

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  useEffect(() => {
    setText(manualBody?.kind === 'value' ? manualBody.text : '');
    setPeopleIds(manualBody?.kind === 'people' ? manualBody.people.map((p) => p.resourceId).filter((x): x is string => !!x) : []);
    setTable(manualBody?.kind === 'table' ? { columns: manualBody.columns, rows: manualBody.rows } : { columns: [{ key: 'c1', label: '항목' }], rows: [] });
    setProvenance(manual?.provenance ?? {});
    setRestricted(Boolean(manual?.restricted));
    setPicking(null);
    setDirty(false);
    // manual.updated_at 이 바뀌면(저장·남의 저장) 다시 채운다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, manual?.updated_at]);

  const { items: teacherItems } = useResourceSelect({ resourceType: ['teacher', 'staff'] });
  const nameOf = useMemo(() => new Map(teacherItems.map((i) => [i.value, i.label])), [teacherItems]);
  // 계정 없는 이름(표에서 넘어온 사람)은 선택기에 없으므로 따로 들고 있다
  const unlinkedPeople = manualBody?.kind === 'people' ? manualBody.people.filter((p) => !p.resourceId) : [];

  const upstreamTables = upstream.filter((o) => o.body.kind === 'table' && o.body.rows.length > 0);
  const autoOutputs = resolved.filter((o) => o.sourceType !== 'manual');

  const doSave = async () => {
    try {
      if (kind === 'value') {
        await save.mutateAsync({ taskId: task.id, kind: 'value', payload: { text: text.trim() }, provenance });
      } else if (kind === 'people') {
        const people: OutputPerson[] = [
          ...peopleIds.map((id) => ({ resourceId: id, name: nameOf.get(id) ?? '(이름 없음)' })),
          ...unlinkedPeople,
        ];
        await save.mutateAsync({ taskId: task.id, kind: 'people', payload: { people }, provenance });
      } else if (kind === 'table') {
        const cleaned: OutputTable = {
          columns: table.columns.map((c) => ({ ...c, label: c.label.trim() || c.key })),
          rows: table.rows.filter((r) => Object.values(r.cells).some((v) => v.trim())),
        };
        await save.mutateAsync({ taskId: task.id, kind: 'table', payload: tablePayload(cleaned), provenance, restricted });
      }
      setDirty(false);
      toast.success('남긴 것을 저장했습니다. 다음 단계에서 받아 쓸 수 있습니다.');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const doClear = async () => {
    try {
      await clear.mutateAsync(task.id);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <section className="space-y-2.5">
      <SectionLabel icon={PackageOpen}>이 할 일이 남기는 것</SectionLabel>

      {/* 선언 */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-2">
        <span className="text-xs text-slate-500">형태</span>
        {canManage ? (
          <>
            <Select value={declKind} onValueChange={(v) => setDeclKind(v as OutputKind | 'auto')}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">자동 ({OUTPUT_KIND_META[effectiveOutputKind({ ...task, meta: { ...task.meta, output: undefined } }, actions)].label})</SelectItem>
                {OUTPUT_KIND_ORDER.map((k) => <SelectItem key={k} value={k}>{OUTPUT_KIND_META[k].label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              value={declLabel}
              onChange={(e) => setDeclLabel(e.target.value)}
              placeholder="무엇인지 (예: 승인된 신청 목록)"
              maxLength={60}
              className="h-8 min-w-[10rem] flex-1 text-base md:text-xs"
            />
            {declDirty && (
              <Button type="button" size="sm" className="h-8 bg-blue-600 text-xs hover:bg-blue-700" onClick={saveDecl} disabled={updateDecl.isPending}>
                {updateDecl.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '정하기'}
              </Button>
            )}
          </>
        ) : (
          <span className="text-xs font-medium text-slate-700">
            {OUTPUT_KIND_META[kind].label}{decl?.label ? ` · ${decl.label}` : ''}
          </span>
        )}
        <span className="w-full text-[10px] text-slate-400">{OUTPUT_KIND_META[kind].hint}</span>
      </div>

      {/* 자동으로 유도되는 산출물 */}
      {autoOutputs.map((o) => (
        <div key={`${o.sourceType}-${o.sourceLabel}`} className="space-y-1 rounded-lg border border-slate-200 p-2">
          <p className="truncate text-[11px] font-medium text-slate-500" title={o.sourceLabel}>{o.sourceLabel}</p>
          {o.unavailable && <p className="text-[11px] text-amber-700">{o.unavailable}</p>}
          <OutputBodyView body={o.body} />
        </div>
      ))}

      {/* 형태가 달라진 옛 값 — 흐름에는 싣지 않는다 */}
      {staleBody && manual && (
        <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
          <p className="text-[11px] font-medium text-amber-800">
            형태를 바꾸기 전에 남긴 «{OUTPUT_KIND_META[manual.kind].label}»이 있습니다 — 다음 단계로 넘어가지 않습니다.
          </p>
          <OutputBodyView body={staleBody} compact />
          {canWrite && (
            <div className="flex justify-end">
              <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={doClear} disabled={clear.isPending}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> 옛 값 지우기
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 사람이 남기는 값 */}
      {isManualOutputKind(kind) && (
        <div className="space-y-2 rounded-lg border border-slate-200 p-2.5">
          {restricted && (
            <p className="flex items-center gap-1 text-[10px] font-medium text-amber-700">
              <Lock className="h-3 w-3" /> 비공개 자료에서 가져온 표 — 이 업무의 책임자만 봅니다
            </p>
          )}
          {manual && manualMatches && (
            <p className="text-[10px] text-slate-400">
              {manual.updated_by_name ?? '누군가'} · {new Date(manual.updated_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 저장
              {typeof manual.provenance?.sourceLabel === 'string' && ` · 「${manual.provenance.sourceLabel}」에서 가져옴`}
            </p>
          )}
          {!canWrite ? (
            manualBody ? <OutputBodyView body={manualBody} /> : <p className="text-xs text-slate-400">아직 남긴 것이 없습니다. 이 할 일의 담당자·책임자가 남깁니다.</p>
          ) : kind === 'value' ? (
            <Textarea
              value={text}
              onChange={(e) => { setText(e.target.value); setDirty(true); }}
              rows={3}
              placeholder="예: 선정 업체 — ○○교육 / 회의 일시 — 4월 7일 15:30"
              className="text-base md:text-xs"
            />
          ) : kind === 'people' ? (
            <div className="space-y-1">
              <SearchableMultiSelect
                filterByTeacher
                selectedValues={peopleIds}
                onSelectionChange={(v) => { setPeopleIds(v); setDirty(true); }}
                placeholder="명단에 넣을 교직원"
                pickerTitle="명단"
              />
              {unlinkedPeople.length > 0 && (
                <p className="text-[10px] text-amber-700">계정이 없는 이름 {unlinkedPeople.length}명({unlinkedPeople.map((p) => p.name).join(', ')})은 그대로 둡니다.</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {picking && picking.body.kind === 'table' ? (
                <RowPicker
                  source={picking.body}
                  sourceLabel={picking.sourceLabel}
                  // 옛 결정 값은 **같은 출처에서 다시 고를 때만** 이어받는다(다른 출처면 줄 키가 겹쳐 엉뚱한 줄에 붙는다)
                  previous={table.rows.length > 0 && sameOutputSource(provenance, picking) ? table : null}
                  restricted={Boolean(picking.restricted)}
                  onCancel={() => setPicking(null)}
                  onPick={(next, rowKeys) => {
                    setTable(next);
                    setProvenance({
                      fromTaskId: picking.taskId,
                      sourceKey: picking.sourceKey,
                      sourceLabel: picking.sourceLabel,
                      rowKeys,
                      pickedAt: new Date().toISOString(),
                    });
                    if (picking.restricted) setRestricted(true);
                    setPicking(null);
                    setDirty(true);
                  }}
                />
              ) : (
                upstreamTables.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {upstreamTables.map((o) => (
                      <Button
                        key={`${o.taskId}-${o.sourceLabel}`}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 max-w-full text-xs"
                        onClick={() => setPicking(o)}
                        title={o.sourceLabel}
                      >
                        <ArrowDownToLine className="mr-1 h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">앞 단계 표에서 줄 고르기 · {o.sourceLabel}</span>
                      </Button>
                    ))}
                  </div>
                )
              )}
              <TableEditor value={table} onChange={(t) => { setTable(t); setDirty(true); }} />
              {table.rows.length > 0 && (
                <TableTidyPanel workId={workId} taskId={task.id} table={table} onApply={(t) => { setTable(t); setDirty(true); }} />
              )}
            </div>
          )}
          {canWrite && (
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {manual && manualMatches && (
                <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={doClear} disabled={clear.isPending}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> 지우기
                </Button>
              )}
              <Button type="button" size="sm" className="h-8 bg-blue-600 text-xs hover:bg-blue-700" onClick={doSave} disabled={!dirty || save.isPending}>
                {save.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
                저장
              </Button>
            </div>
          )}
        </div>
      )}

      {kind === 'signal' && autoOutputs.length === 0 && (
        <p className="text-[11px] text-slate-400">이 할 일은 «끝났다»는 신호만 넘깁니다. 넘길 값·명단·표가 있으면 형태를 정하세요.</p>
      )}
    </section>
  );
}

