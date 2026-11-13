import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GripVertical, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { DEFAULT_COLUMNS, PurchaseColumn, PurchaseColumnType } from '../types';

interface PageColumnEditorProps {
  columns: PurchaseColumn[];
  onChange: (columns: PurchaseColumn[]) => void;
}

const COLUMN_TYPE_OPTIONS: { value: PurchaseColumnType; label: string }[] = [
  { value: 'text', label: '텍스트' },
  { value: 'number', label: '숫자' },
  { value: 'url', label: 'URL' },
];

const newCustomCol = (): PurchaseColumn => ({
  id: `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  name: '',
  type: 'text',
  required: false,
  isDefault: false,
});

export function PageColumnEditor({ columns, onChange }: PageColumnEditorProps) {
  const update = (id: string, patch: Partial<PurchaseColumn>) => {
    onChange(columns.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const remove = (id: string) => {
    onChange(columns.filter((c) => c.id !== id));
  };

  const add = () => {
    onChange([...columns, newCustomCol()]);
  };

  const move = (id: string, direction: -1 | 1) => {
    const idx = columns.findIndex((c) => c.id === id);
    if (idx === -1) return;
    const next = [...columns];
    const target = idx + direction;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };

  const restoreDefaults = () => {
    const customCols = columns.filter((c) => !c.isDefault);
    const existingDefaultIds = new Set(columns.filter((c) => c.isDefault).map((c) => c.id));
    const missing = DEFAULT_COLUMNS.filter((c) => !existingDefaultIds.has(c.id));
    onChange([...columns, ...missing]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">신청 항목 컬럼</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={restoreDefaults}
        >
          <RotateCcw className="w-3 h-3 mr-1" /> 누락된 기본 컬럼 복원
        </Button>
      </div>

      <div className="space-y-2">
        {columns.map((col, idx) => (
          <div
            key={col.id}
            className="flex items-center gap-2 p-2 border rounded-lg bg-white hover:bg-slate-50/50"
          >
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                className="text-muted-foreground hover:text-slate-700 disabled:opacity-30 text-[10px]"
                onClick={() => move(col.id, -1)}
                disabled={idx === 0}
                aria-label="위로"
              >
                ▲
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:text-slate-700 disabled:opacity-30 text-[10px]"
                onClick={() => move(col.id, 1)}
                disabled={idx === columns.length - 1}
                aria-label="아래로"
              >
                ▼
              </button>
            </div>

            <Input
              value={col.name}
              onChange={(e) => update(col.id, { name: e.target.value })}
              placeholder="컬럼명"
              className="flex-1 h-9 text-sm"
            />

            <Select
              value={col.type}
              onValueChange={(v) => update(col.id, { type: v as PurchaseColumnType })}
            >
              <SelectTrigger className="w-24 h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLUMN_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
              <Checkbox
                checked={col.required}
                onCheckedChange={(checked) => update(col.id, { required: Boolean(checked) })}
              />
              필수
            </label>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-red-500"
              onClick={() => remove(col.id)}
              title={col.isDefault ? '기본 컬럼 제거' : '컬럼 제거'}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={add} className="w-full h-9">
        <Plus className="w-4 h-4 mr-1" /> 컬럼 추가
      </Button>

      <p className="text-[11px] text-muted-foreground">
        기본 컬럼(물품명, 구매 주소, 가격, 개수, 비고)을 자유롭게 제거하거나 새 컬럼을 추가할 수
        있습니다. 신청자는 필수 컬럼을 반드시 입력해야 합니다.
      </p>
    </div>
  );
}
