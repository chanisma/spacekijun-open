// 스펙 타깃 목록 편집 패널(공유): SpecFillActionRunner confirm 단계 + Spec Workspace.
// 오버레이 뷰와 선택 동기화(selectedTargetId/onSelectTarget — 선택 시 행 강조·자동 스크롤).
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DraggableAttributes,
  type DragEndEvent,
} from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Braces, Columns3, Crosshair, GripVertical, Info, Trash2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  deriveChoiceOptions, resolveLocator, resolvedRegionText,
  type Locator, type RowGroupColumn, type RowGroupTarget, type Target, type WorkSpec,
} from '../document/spec';
import type { HwpxIndex } from '../document/spec/hwpxIndex';

export const KIND_LABEL: Record<Target['kind'], string> = {
  scalar: '단답', choice: '택일', prose: '서술', rowGroup: '반복 행', tableGroup: '표 묶음',
  computed: '계산', keep: '유지',
  // 이름 2종(2026-08-22) — 계획 검토에서 명단 다중 선택. kind가 곧 검색 대상이다
  personTeacher: '이름(교사)', personStudent: '이름(학생)',
};

export function locatorSummary(loc: Locator): string {
  if (loc.kind === 'clickhere') return '누름틀';
  if (loc.kind === 'text') return `텍스트 "${(loc.anchor ?? '').slice(0, 18)}"`;
  const t = loc.table ? `표#${loc.section != null ? `s${loc.section}·` : ''}${loc.table.index}` : '표?';
  if (loc.kind === 'cell') return `${t} (${loc.addr?.row},${loc.addr?.col})`;
  if (loc.kind === 'table') return `${t} 전체`;
  return `${t} 행 ${loc.rows?.[0]}–${loc.rows?.[1]}${loc.cols?.length ? ` · ${loc.cols.length}열` : ''}`;
}

const COLUMN_KIND_LABEL: Record<RowGroupColumn['kind'], string> = {
  scalar: '입력', computed: '계산', prose: '서술', keep: '유지',
};

/**
 * 반복 행의 열별 공통 지침 편집기 — 각 열의 지침·유형(입력/계산/유지)·수식을 표로 편집.
 * 행 전체 공통 지침은 타깃의 '작성 지침' 칸이 담당한다(행/열 2단 지침 구조).
 */
function RowSchemaEditor({ target, onChange }: {
  target: RowGroupTarget;
  onChange: (schema: RowGroupColumn[]) => void;
}) {
  const schema = target.rowSchema;

  // 자동 시드 폴백: 스키마가 비어 있으면 지정 영역의 열(locator.cols)로 즉시 생성 —
  // 구버전·탐지 타깃도 편집기가 빈 채로 열리지 않는다(지침은 사람이 채움).
  useEffect(() => {
    if (schema.length > 0) return;
    const cols = target.locator.cols;
    if (!cols?.length) return;
    onChange(cols.map((col) => ({ col, kind: 'scalar' as const, source: `row.c${col}` })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.id]);
  const set = (i: number, patch: Partial<RowGroupColumn>) =>
    onChange(schema.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const remove = (i: number) => onChange(schema.filter((_, k) => k !== i));
  const add = () => {
    const nextCol = schema.length ? Math.max(...schema.map((c) => c.col)) + 1 : 0;
    onChange([...schema, { col: nextCol, kind: 'scalar', source: `row.c${nextCol}` }]);
  };
  return (
    <div className="space-y-1 border-t border-slate-100 bg-slate-50/70 p-2">
      <p className="text-[10px] text-slate-400">
        {target.repeatUnit !== 'row' && target.detector !== 'rowGroup' && '선택한 형태로 반복하고, 같은 구간의 기존 예시 행은 생성 내용으로 대체합니다. '}
        {target.replaceRows && `기존 예시 대체 구간: ${target.replaceRows[0]}–${target.replaceRows[1]}행. `}
        열별 공통 지침 — 각 열이 어떤 값인지 적으면 AI 계획·채움이 그 지침을 따릅니다.
        빈 열 지침은 "AI 라벨 보완"으로 채울 수 있습니다.
        행 전체 공통 지침은 위 "작성 지침" 칸에 적으세요.
      </p>
      {schema.map((col, i) => (
        <div key={`${col.col}-${i}`} className="flex items-center gap-1.5">
          <span className="w-9 shrink-0 rounded bg-slate-100 px-1 py-0.5 text-center text-[10px] font-semibold text-slate-500">
            {col.col}열
          </span>
          <Select value={col.kind} onValueChange={(v) => {
            const kind = v as RowGroupColumn['kind'];
            set(i, {
              kind,
              source: kind === 'scalar' ? (col.source ?? `row.c${col.col}`) : col.source,
              formula: kind === 'computed' ? (col.formula ?? '') : undefined,
            });
          }}>
            <SelectTrigger className="h-6 w-16 text-[10px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(COLUMN_KIND_LABEL) as RowGroupColumn['kind'][]).map((k) => (
                <SelectItem key={k} value={k} className="text-xs">{COLUMN_KIND_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {col.kind === 'keep' ? (
            <span className="flex-1 text-[10px] text-slate-400">원본 행 내용 유지(채우지 않음)</span>
          ) : (
            <Input
              className="h-6 flex-1 text-[11px]"
              placeholder="열 지침 (예: 품목명, 30,000원×20개 형식의 산출내역)"
              value={col.instruction ?? ''}
              onChange={(e) => set(i, { instruction: e.target.value || undefined })}
            />
          )}
          {col.kind === 'computed' && (
            <Input
              className="h-6 w-36 font-mono text-[10px]"
              placeholder="수식 예: row.unit * row.qty"
              value={col.formula ?? ''}
              onChange={(e) => set(i, { formula: e.target.value })}
            />
          )}
          <Button size="icon" variant="ghost" className="h-5 w-5 text-slate-300"
            onClick={() => remove(i)}><Trash2 className="h-3 w-3" /></Button>
        </div>
      ))}
      <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={add}>열 추가</Button>
    </div>
  );
}

/**
 * 한 줄 높이에서 시작해 내용에 따라 자동으로 커지는 지침 입력칸 (2026-08-16 사용자 요청).
 * 종전 Input은 긴 지침이 잘려 안 보였다 — 자동 줄바꿈 + scrollHeight 기반 높이 동기화.
 */
function AutoGrowTextarea({ value, placeholder, onChange }: {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-7 flex-1 resize-none overflow-hidden rounded-md border border-input bg-background px-2 py-1.5 text-[11px] leading-4 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    />
  );
}

/**
 * DnD 정렬 래퍼(2026-08-16 사용자 요청) — 훅은 루프 안에서 못 부르므로 행마다 이 컴포넌트가
 * useSortable을 대신 들고, 그립 핸들에 얹을 attributes/listeners를 render prop으로 내려준다.
 * 순서는 곧 spec.targets 배열 순서 — 계획 검토 폼의 필드 순서도 이 순서를 따른다.
 */
function SortableTargetRow({ id, children }: {
  id: string;
  children: (drag: {
    attributes: DraggableAttributes;
    listeners: SyntheticListenerMap | undefined;
  }) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'relative z-10 bg-white opacity-90 shadow-md' : undefined}
    >
      {children({ attributes, listeners })}
    </div>
  );
}

export interface SpecTargetPanelProps {
  spec: WorkSpec;
  onChange: (spec: WorkSpec) => void;
  selectedTargetId?: string | null;
  onSelectTarget?: (id: string) => void;
  /** 영역 재지정 시작(라벨·지침 유지, 위치만 교체) — 오버레이 호스트가 다음 지정을 이 타깃에 적용 */
  onReassignTarget?: (id: string) => void;
  /** 파싱 인덱스 — 유형을 택일로 바꿀 때 지정 구역에서 선택지·마크쌍을 유도하는 데 쓴다 */
  indexes?: HwpxIndex[];
  className?: string;
}

/**
 * 유형을 '택일'로 바꿀 때의 패치: 지정 구역의 체크박스에서 선택지·마크쌍을 유도한다.
 * 유도 실패(마크 2개 미만 등)면 빈 배열 — 스키마 유도가 크래시하지 않게 하고 사람이 채운다.
 */
function choicePatch(t: Target, indexes?: HwpxIndex[]): Record<string, unknown> {
  if (!indexes?.length) return { options: [] };
  try {
    const res = resolveLocator(indexes, t.locator);
    if (res.kind === 'stale') return { options: [] };
    const derived = deriveChoiceOptions(
      resolvedRegionText(res, indexes), indexes.map((i) => i.fullText).join('\n'),
    );
    return derived ? { options: derived.options, mark: derived.mark, exclusive: true } : { options: [] };
  } catch {
    return { options: [] };
  }
}

export function SpecTargetPanel({ spec, onChange, selectedTargetId, onSelectTarget, onReassignTarget, indexes, className }: SpecTargetPanelProps) {
  const [newAnchor, setNewAnchor] = useState('');
  const [newKind, setNewKind] = useState<Target['kind']>('scalar');
  // 고급(JSON) 편집: 폼이 못 다루는 필드(locator 세부 등) 탈출구
  const [jsonEditId, setJsonEditId] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState('');
  // 반복 행 열 지침 편집기 열림 대상
  const [schemaEditId, setSchemaEditId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!selectedTargetId || !listRef.current) return;
    listRef.current
      .querySelector(`[data-target-row="${selectedTargetId}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedTargetId]);

  // DnD — 클릭·입력과 드래그를 구분하기 위해 8px 이동 후에만 드래그 시작
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = spec.targets.findIndex((t) => t.id === active.id);
    const newIndex = spec.targets.findIndex((t) => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onChange({ ...spec, targets: arrayMove(spec.targets, oldIndex, newIndex) });
  };

  const update = (i: number, patch: Partial<Target>) => {
    const targets = spec.targets.map((t, k) => (k === i ? ({ ...t, ...patch } as Target) : t));
    onChange({ ...spec, targets });
  };
  const remove = (i: number) => onChange({ ...spec, targets: spec.targets.filter((_, k) => k !== i) });
  const addManual = () => {
    if (!newAnchor.trim()) return;
    const t = {
      id: `manual-${Date.now()}`, kind: newKind, required: true,
      locator: { kind: 'text', anchor: newAnchor.trim() },
      label: newAnchor.trim().slice(0, 20), evidence: '수동 추가',
    } as Target;
    onChange({ ...spec, targets: [...spec.targets, t] });
    setNewAnchor('');
  };

  return (
    <div className={`flex flex-col overflow-hidden rounded-lg border border-slate-200 ${className ?? ''}`}>
      <div ref={listRef} className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
        {/* 열 의미 헤더(2026-08-16 사용자 요청) — 행과 같은 flex·gap·폭을 미러링해 정렬.
            sticky 배경은 불투명이어야 한다(알파면 스크롤 시 행이 비쳐 보임 — 프로젝트 공통 함정) */}
        <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-400">
          <span className="w-4 shrink-0" aria-hidden />
          <span className="w-24 shrink-0">유형</span>
          <span className="w-32 shrink-0">라벨</span>
          <span className="w-6 shrink-0 text-center" title="문서 내 위치 — ⓘ에 마우스를 올리면 표시">위치</span>
          <span className="min-w-0 flex-1">작성 지침</span>
          <span className="shrink-0">동작</span>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={spec.targets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        {spec.targets.map((t, i) => (
          <SortableTargetRow key={t.id} id={t.id}>
          {({ attributes, listeners }) => (<>
          <div
            data-target-row={t.id}
            onClick={() => onSelectTarget?.(t.id)}
            className={`flex items-center gap-2 px-2 py-1.5 text-xs ${
              t.confirmRequired ? 'bg-amber-50/60' : ''
            } ${selectedTargetId === t.id ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : ''}`}
          >
            <span
              {...attributes}
              {...listeners}
              className="flex h-6 w-4 shrink-0 cursor-grab touch-none items-center justify-center text-slate-300 hover:text-slate-500 active:cursor-grabbing"
              title="드래그하여 순서 이동"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </span>
            <Select value={t.kind} onValueChange={(v) => {
              const kind = v as Target['kind'];
              // choice로 전환 시 options가 비면 엔진이 'no selection'으로 건너뛴다 —
              // 지정 구역의 체크박스에서 선택지·마크쌍을 유도해 채운다(실패 시 빈 배열).
              const patch: Record<string, unknown> = { kind };
              if (kind === 'choice' && !Array.isArray((t as { options?: unknown }).options)) {
                Object.assign(patch, choicePatch(t, indexes));
              }
              update(i, patch as Partial<Target>);
            }}>
              <SelectTrigger className="h-7 w-24 text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_LABEL) as Target['kind'][]).map((k) => (
                  <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className={`h-7 w-32 text-[11px] ${t.autoLabel ? 'italic text-slate-500' : ''}`}
              placeholder="라벨"
              title={t.autoLabel ? '자동 추정 라벨 — AI 보완이 교체할 수 있음(직접 수정하면 고정)' : undefined}
              value={t.label ?? ''}
              onChange={(e) => update(i, { label: e.target.value, autoLabel: false })}
            />
            {/* 문서 내 위치 — 텍스트 열 대신 ⓘ 호버 툴팁(2026-08-16 사용자 요청).
                위치 요약 + 지정 당시 지문(evidence)을 함께 보여준다 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex h-6 w-6 shrink-0 cursor-default items-center justify-center text-slate-300 hover:text-slate-500">
                  <Info className="h-3.5 w-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-xs font-medium">{locatorSummary(t.locator)}</p>
                {t.evidence && (
                  <p className="mt-0.5 text-[10px] opacity-80">지문: {t.evidence}</p>
                )}
              </TooltipContent>
            </Tooltip>
            {t.kind === 'choice' && !(t as { options?: unknown[] }).options?.length && (
              <span
                className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-700"
                title="선택지가 없으면 채움이 이 타깃을 건너뜁니다 — 고급(JSON) 편집에서 options를 채우세요."
              >선택지 없음</span>
            )}
            {/* 필수 토글 제거(2026-08-16 사용자 결정) — 탐지·지정 모두 required:true로
                생성하므로 잉여 UI였다. 예외가 필요하면 고급(JSON) 편집에서 조정 */}
            <AutoGrowTextarea
              placeholder="작성 지침"
              value={t.instruction ?? ''}
              onChange={(v) => update(i, { instruction: v })}
            />
            {t.confirmRequired ? (
              <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] text-amber-700"
                onClick={(e) => { e.stopPropagation(); update(i, { confirmRequired: false }); }}>확인</Button>
            ) : null}
            {t.kind === 'rowGroup' && (
              <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-400"
                title="열별 공통 지침 편집(반복 행)"
                onClick={(e) => {
                  e.stopPropagation();
                  setSchemaEditId(schemaEditId === t.id ? null : t.id);
                }}><Columns3 className="h-3.5 w-3.5" /></Button>
            )}
            {onReassignTarget && (
              <Button size="icon" variant="ghost" className="h-6 w-6 text-blue-400 hover:text-blue-600"
                title="영역 재지정 — 라벨·지침은 유지하고 문서에서 새 위치를 지정"
                onClick={(e) => { e.stopPropagation(); onReassignTarget(t.id); }}>
                <Crosshair className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-400"
              title="고급(JSON) 편집 — 수식·행 스키마·locator 세부"
              onClick={(e) => {
                e.stopPropagation();
                if (jsonEditId === t.id) { setJsonEditId(null); return; }
                setJsonEditId(t.id);
                setJsonText(JSON.stringify(t, null, 2));
              }}><Braces className="h-3.5 w-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-400"
              onClick={(e) => { e.stopPropagation(); remove(i); }}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
          {schemaEditId === t.id && t.kind === 'rowGroup' && (
            <RowSchemaEditor
              target={t as RowGroupTarget}
              onChange={(rowSchema) => {
                const targets = spec.targets.map((x, k) =>
                  k === i ? ({ ...x, rowSchema } as Target) : x);
                onChange({ ...spec, targets });
              }}
            />
          )}
          {jsonEditId === t.id && (
            <div className="space-y-1 border-t border-slate-100 bg-slate-50/70 p-2">
              <Textarea rows={10} className="font-mono text-[11px]" value={jsonText} onChange={(e) => setJsonText(e.target.value)} />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setJsonEditId(null)}>취소</Button>
                <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => {
                  try {
                    const parsed = JSON.parse(jsonText) as Target;
                    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('객체가 아닙니다.');
                    // 병합이 아닌 전체 교체(필드 삭제 반영), id는 원본 유지
                    onChange({
                      ...spec,
                      targets: spec.targets.map((x, k) => (k === i ? ({ ...parsed, id: t.id } as Target) : x)),
                    });
                    setJsonEditId(null);
                  } catch (err) {
                    toast.error(`타깃 JSON 파싱 실패: ${err instanceof Error ? err.message : String(err)}`);
                  }
                }}>적용</Button>
              </div>
            </div>
          )}
          </>)}
          </SortableTargetRow>
        ))}
        </SortableContext>
        </DndContext>
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-slate-100 bg-slate-50/60 p-2">
        <Select value={newKind} onValueChange={(v) => setNewKind(v as Target['kind'])}>
          <SelectTrigger className="h-7 w-24 text-[11px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(['scalar', 'personTeacher', 'personStudent', 'prose', 'keep'] as Target['kind'][]).map((k) => (
              <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input className="h-7 flex-1 text-[11px]" placeholder="문서 내 텍스트 앵커로 타깃 수동 추가" value={newAnchor} onChange={(e) => setNewAnchor(e.target.value)} />
        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={addManual}>추가</Button>
      </div>
    </div>
  );
}
