// 사람이 남기는 표 편집 — 열·줄 추가·삭제, 머리 이름 바꾸기, 칸 쓰기.
// 저장은 호출부가 한다(이 컴포넌트는 값만 바꾼다). 표 모양 판정은 src/lib/workPipeline.ts.

import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { nextColumnKey, nextRowKey, type OutputTable } from '@/lib/workPipeline';

// 휴대폰 16px(iOS 확대 방지 — CLAUDE.md §2-1) · 데스크톱 밀도
const CELL_INPUT =
  'h-8 w-full min-w-[6rem] rounded border border-transparent bg-transparent px-1.5 text-base outline-none hover:border-slate-200 focus:border-blue-400 focus:bg-white md:text-xs';

export function TableEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: OutputTable;
  onChange: (next: OutputTable) => void;
  disabled?: boolean;
}) {
  const setCell = (rowKey: string, colKey: string, text: string) =>
    onChange({
      ...value,
      rows: value.rows.map((r) => (r.key === rowKey ? { ...r, cells: { ...r.cells, [colKey]: text } } : r)),
    });

  const addColumn = () => {
    const key = nextColumnKey(value);
    onChange({
      columns: [...value.columns, { key, label: `열 ${value.columns.length + 1}` }],
      rows: value.rows.map((r) => ({ ...r, cells: { ...r.cells, [key]: '' } })),
    });
  };

  const removeColumn = (key: string) =>
    onChange({
      columns: value.columns.filter((c) => c.key !== key),
      rows: value.rows.map((r) => {
        const cells = { ...r.cells };
        delete cells[key];
        return { ...r, cells };
      }),
    });

  const renameColumn = (key: string, label: string) =>
    onChange({ ...value, columns: value.columns.map((c) => (c.key === key ? { ...c, label } : c)) });

  const addRow = () => {
    const key = nextRowKey(value);
    onChange({ ...value, rows: [...value.rows, { key, cells: Object.fromEntries(value.columns.map((c) => [c.key, ''])) }] });
  };

  const removeRow = (key: string) => onChange({ ...value, rows: value.rows.filter((r) => r.key !== key) });

  return (
    <div className="space-y-1.5">
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-max text-xs">
          <thead className="bg-slate-50">
            <tr>
              {value.columns.map((c) => (
                <th key={c.key} className="px-1 py-1 text-left font-medium">
                  <div className="flex items-center gap-0.5">
                    <input
                      aria-label="열 이름"
                      className={`${CELL_INPUT} font-medium text-slate-600`}
                      value={c.label}
                      disabled={disabled}
                      onChange={(e) => renameColumn(c.key, e.target.value)}
                    />
                    {!disabled && (
                      <button
                        type="button"
                        onClick={() => removeColumn(c.key)}
                        className="shrink-0 rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                        aria-label={`${c.label} 열 삭제`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {value.rows.map((r) => (
              <tr key={r.key} className="border-t border-slate-100">
                {value.columns.map((c) => (
                  <td key={c.key} className="px-1 py-0.5">
                    <input
                      aria-label={`${c.label} 값`}
                      className={`${CELL_INPUT} text-slate-700`}
                      value={r.cells[c.key] ?? ''}
                      disabled={disabled}
                      onChange={(e) => setCell(r.key, c.key, e.target.value)}
                    />
                  </td>
                ))}
                <td className="px-1">
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => removeRow(r.key)}
                      className="rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                      aria-label="줄 삭제"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!disabled && (
        <div className="flex gap-1.5">
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={addRow} disabled={value.columns.length === 0}>
            <Plus className="mr-1 h-3.5 w-3.5" /> 줄 추가
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={addColumn}>
            <Plus className="mr-1 h-3.5 w-3.5" /> 열 추가
          </Button>
        </div>
      )}
    </div>
  );
}
