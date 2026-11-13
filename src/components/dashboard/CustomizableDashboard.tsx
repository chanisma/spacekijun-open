import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Eye, EyeOff, GripVertical, LayoutGrid, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DIALOG_FOOTER_CLASS, DIALOG_HEADER_CLASS, FOOTER_BUTTON_CLASS } from '@/components/tasks/dialogDesign';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { useDashboardLayout } from '@/hooks/useDashboardLayout';
import {
  WIDGET_SIZES, moveWidget, resolveDashboard, toDashboardLayout, widgetSpanClass,
  type DashboardKind, type DashboardWidgetDef, type ResolvedWidget,
} from '@/lib/dashboardLayout';

/**
 * 꾸밀 수 있는 홈 그리드 (2026-10-25). 카드 정의(`defs`)와 그리는 함수(`render`)를 받아
 * 그 사람의 배치(순서·크기·숨김)대로 그린다. 판정은 `@/lib/dashboardLayout`.
 *
 * 카드마다 칸 하나(`empty:hidden`) — 카드가 스스로 null 이면(대기 0건 등) 칸도 사라져 구멍이 남지 않는다.
 * 여러 장을 그리는 카드(안내 상자 등)는 `multi` 로 받아 칸 안에 작은 그리드를 둔다.
 */
export interface DashboardWidget extends DashboardWidgetDef {
  render: () => ReactNode;
  /** 여러 장을 그리는 카드 — 칸 안에서 2열 그리드(넓을 때) */
  multi?: boolean;
}

export function CustomizableDashboard({ kind, widgets, className }: { kind: DashboardKind; widgets: DashboardWidget[]; className: string }) {
  const { layout, save } = useDashboardLayout(kind);
  const [editing, setEditing] = useState(false);
  const resolved = useMemo(() => resolveDashboard(widgets, layout), [widgets, layout]);
  const renderOf = useMemo(() => new Map(widgets.map((w) => [w.id, w])), [widgets]);

  return (
    <div className={className}>
      {resolved.filter((w) => !w.hidden).map((w) => {
        const widget = renderOf.get(w.def.id)!;
        return (
          <div key={w.def.id} data-dashboard-widget={w.def.id}
            className={cn('min-w-0 empty:hidden', widgetSpanClass(kind, w.span), widget.multi && 'grid gap-4 sm:gap-5', widget.multi && w.span >= 8 && 'md:grid-cols-2')}>
            {widget.render()}
          </div>
        );
      })}
      <div className="col-span-full flex justify-end">
        <Button variant="ghost" size="sm" className="h-9 text-xs text-slate-500" onClick={() => setEditing(true)}>
          <LayoutGrid className="mr-1.5 h-4 w-4" />홈 꾸미기
        </Button>
      </div>
      {editing && (
        <DashboardCustomizeDialog
          kind={kind}
          defs={widgets}
          initial={resolved}
          saving={save.isPending}
          onClose={() => setEditing(false)}
          onSave={async (next) => {
            try {
              await save.mutateAsync(toDashboardLayout(widgets, next));
              setEditing(false);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : '홈 배치를 저장하지 못했습니다.');
            }
          }}
        />
      )}
    </div>
  );
}

export function DashboardCustomizeDialog({ kind, defs, initial, saving, onClose, onSave }: {
  kind: DashboardKind; defs: DashboardWidgetDef[]; initial: ResolvedWidget[]; saving: boolean;
  onClose: () => void; onSave: (next: ResolvedWidget[]) => void;
}) {
  const [draft, setDraft] = useState(initial);
  useEffect(() => setDraft(initial), [initial]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const update = (id: string, patch: Partial<ResolvedWidget>) => setDraft((prev) => prev.map((w) => (w.def.id === id ? { ...w, ...patch } : w)));
  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && e.active.id !== e.over.id) setDraft((prev) => moveWidget(prev, String(e.active.id), String(e.over!.id)));
  };
  const shown = draft.filter((w) => !w.hidden);
  const hidden = draft.filter((w) => w.hidden);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle>홈 꾸미기</DialogTitle>
          <DialogDescription>
            카드를 끌어 순서를 바꾸고, 크기와 보이기를 정합니다. 아래 칸은 넓은 화면의 실제 배치와 같은 비율이에요
            (휴대폰에서는 위에서부터 한 줄씩). 이 배치는 {kind === 'student' ? '내 학생 홈' : '내 홈'}에만 적용됩니다.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-y-auto px-1">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={shown.map((w) => w.def.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-12 gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-2">
                {shown.map((w) => (
                  <SortableBlock key={w.def.id} widget={w} onSpan={(span) => update(w.def.id, { span })} onHide={() => update(w.def.id, { hidden: true })} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          {hidden.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-semibold text-slate-500">숨긴 카드 — 누르면 다시 보입니다</p>
              <div className="flex flex-wrap gap-2">
                {hidden.map((w) => (
                  <button key={w.def.id} type="button" onClick={() => update(w.def.id, { hidden: false })}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border bg-white px-3 text-sm text-slate-600 hover:border-blue-300 hover:text-blue-700">
                    <Eye className="h-4 w-4" />{w.def.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">
            그날 보여 줄 내용이 없는 카드(서명 대기 0건 등)는 홈에서 저절로 빠집니다 — 숨기지 않아도 자리를 차지하지 않아요.
          </p>
        </div>
        <DialogFooter className={DIALOG_FOOTER_CLASS}>
          <Button variant="ghost" className={FOOTER_BUTTON_CLASS} onClick={() => setDraft(resolveDashboard(defs, null))}>
            <RotateCcw className="mr-1.5 h-4 w-4" />기본 배치로
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" className={FOOTER_BUTTON_CLASS} onClick={onClose}>취소</Button>
          <Button className="bg-blue-600 hover:bg-blue-700" disabled={saving} onClick={() => onSave(draft)}>{saving ? '저장 중…' : '저장'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// 휴대폰 = 한 줄씩(실제 휴대폰 홈과 같다 — 비율대로 그리면 이름이 잘린다), 넓으면 넓은 화면 비율
const BLOCK_SPAN: Record<number, string> = {
  3: 'col-span-12 sm:col-span-3', 4: 'col-span-12 sm:col-span-4', 5: 'col-span-12 sm:col-span-5', 6: 'col-span-12 sm:col-span-6',
  7: 'col-span-12 sm:col-span-7', 8: 'col-span-12 sm:col-span-8', 9: 'col-span-12 sm:col-span-9', 10: 'col-span-12 sm:col-span-10',
  11: 'col-span-12 sm:col-span-11', 12: 'col-span-12',
};

function SortableBlock({ widget, onSpan, onHide }: { widget: ResolvedWidget; onSpan: (span: number) => void; onHide: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.def.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('min-w-0 rounded-lg border bg-white p-2 shadow-sm', BLOCK_SPAN[widget.span], isDragging && 'z-10 ring-2 ring-blue-400')}>
      <div className="flex min-w-0 items-start gap-1">
        <button type="button" {...attributes} {...listeners} aria-label={`${widget.def.label} 옮기기`}
          className="flex h-8 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 active:cursor-grabbing">
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800" title={widget.def.label}>{widget.def.label}</p>
          {widget.def.description && <p className="line-clamp-2 text-[11px] text-slate-500">{widget.def.description}</p>}
        </div>
        <button type="button" onClick={onHide} aria-label={`${widget.def.label} 숨기기`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-rose-600">
          <EyeOff className="h-4 w-4" />
        </button>
      </div>
      {!widget.def.fixedSpan && (
        <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="크기">
          {/* 기본 크기가 고르는 크기 넷(4·6·8·12칸)에 없으면(맥락에 맞춘 7·5칸 등) «지금 크기»를 눌린 칩으로 보여 준다 */}
          {!WIDGET_SIZES.some((s) => s.span === widget.span) && (
            <span className="inline-flex h-7 items-center rounded-md bg-blue-600 px-2 text-[11px] text-white" aria-current="true">기본</span>
          )}
          {WIDGET_SIZES.map((s) => (
            <button key={s.span} type="button" aria-pressed={widget.span === s.span} onClick={() => onSpan(s.span)}
              className={cn('h-7 rounded-md px-2 text-[11px]', widget.span === s.span ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
