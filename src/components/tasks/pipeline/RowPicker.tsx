// 앞 단계 표에서 행을 골라 이 할 일의 표로 — ④ 표 → 표 (예: 신청 목록 → 승인된 것만).
// 결과는 **스냅샷**이다(앞 단계가 나중에 바뀌어도 이미 고른 것은 흔들리지 않는다).
// 덧붙일 열(예: "결정")을 한 번에 만들 수 있다 — 회의에서 행마다 승인·보류를 적는 자리.

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { pickRows, type OutputTable } from '@/lib/workPipeline';

export function RowPicker({
  source,
  sourceLabel,
  previous,
  restricted = false,
  onPick,
  onCancel,
}: {
  source: OutputTable;
  sourceLabel: string;
  /** **같은 출처에서 고른** 이 할 일의 옛 표 — 다른 출처면 null 로 넘길 것(결정 값이 엉뚱한 줄에 붙는다) */
  previous: OutputTable | null;
  /** 비공개 수합·본인만 보는 제출 — 가져온 표는 매니저만 본다 */
  restricted?: boolean;
  onPick: (table: OutputTable, rowKeys: string[]) => void;
  onCancel: () => void;
}) {
  // 이미 고른 적이 있으면 그 행을 기본 선택으로 — 다시 열 때 처음부터 고르지 않게
  const initial = useMemo(() => {
    const prevKeys = new Set((previous?.rows ?? []).map((r) => r.key));
    const hit = source.rows.filter((r) => prevKeys.has(r.key)).map((r) => r.key);
    return hit.length > 0 ? hit : source.rows.map((r) => r.key);
  }, [source, previous]);
  const [selected, setSelected] = useState<string[]>(initial);
  const [extra, setExtra] = useState(() => {
    const baseKeys = new Set(source.columns.map((c) => c.key));
    return (previous?.columns ?? []).filter((c) => !baseKeys.has(c.key)).map((c) => c.label).join(', ');
  });

  const toggle = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const apply = () => {
    const baseKeys = new Set(source.columns.map((c) => c.key));
    const prevExtras = (previous?.columns ?? []).filter((c) => !baseKeys.has(c.key));
    const labels = extra.split(',').map((s) => s.trim()).filter(Boolean);
    // 같은 이름의 덧붙인 열은 같은 키를 쓴다 — 다시 골라도 적어 둔 결정이 살아남게
    const extraColumns = labels.map((label, i) => prevExtras.find((c) => c.label === label) ?? { key: `x${i + 1}_${Date.now().toString(36)}`, label });
    onPick(pickRows(source, selected, extraColumns, previous), selected);
  };

  const cols = source.columns.slice(0, 4);

  return (
    <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/40 p-2.5">
      <p className="text-xs font-medium text-slate-700">
        「{sourceLabel}」에서 넘길 줄을 고르세요 <span className="text-slate-400">({selected.length}/{source.rows.length})</span>
      </p>
      {restricted && (
        <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-800">
          이 자료는 <b>사람마다 보이는 범위가 다릅니다</b>(비공개 수합·본인만 보는 제출). 가져와 저장한 표는
          <b> 이 업무의 책임자만</b> 봅니다 — 다른 담당자에게는 보이지 않습니다.
        </p>
      )}
      <div className="flex gap-1.5">
        <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setSelected(source.rows.map((r) => r.key))}>
          모두
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setSelected([])}>
          모두 해제
        </Button>
      </div>
      <div className="max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-max text-[11px]">
          <thead className="sticky top-0 bg-slate-50 text-slate-500">
            <tr>
              <th className="w-8" />
              {cols.map((c) => <th key={c.key} className="px-2 py-1 text-left font-medium">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {source.rows.map((r) => (
              <tr key={r.key} className="border-t border-slate-100">
                <td className="px-2 py-1">
                  <Checkbox checked={selected.includes(r.key)} onCheckedChange={() => toggle(r.key)} aria-label="이 줄 넘기기" />
                </td>
                {cols.map((c) => (
                  <td key={c.key} className="max-w-[12rem] truncate px-2 py-1 text-slate-700" title={r.cells[c.key]}>{r.cells[c.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label className="block space-y-1">
        <span className="text-[11px] text-slate-600">덧붙일 열(쉼표로 여러 개 — 예: 결정, 비고)</span>
        <Input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="결정" className="h-8 text-base md:text-xs" />
      </label>
      <div className="flex justify-end gap-1.5">
        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={onCancel}>취소</Button>
        <Button type="button" size="sm" className="h-8 bg-blue-600 text-xs hover:bg-blue-700" onClick={apply} disabled={selected.length === 0}>
          {selected.length}줄 가져오기
        </Button>
      </div>
    </div>
  );
}
