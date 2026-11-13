/**
 * 품의 차수 표 — 엑셀처럼 셀에서 바로 고친다 (2026-10-12 후속, 사용자 요구)
 *
 * - 셀 = 늘 떠 있는 입력칸. 칸을 떠나면(blur) 값이 바뀌었을 때만 저장한다.
 * - Enter·↓ = 아래 칸, ↑ = 위 칸, Esc = 되돌리기. Tab 은 브라우저 기본(오른쪽 칸).
 * - 엑셀에서 여러 칸을 복사해 붙이면 그 칸부터 오른쪽·아래로 채운다(있는 행까지만).
 * - 기본 열은 품명·단가·수량·비고뿐(+ 계산 열 금액). 맨 끝 [+] = 새 열 만들기 ·
 *   준비된 열(규격·이용 기간·구매처·링크·결제 방법·예산 과목) 넣기.
 * - 열 머리 메뉴 = 이름 바꾸기 · 왼쪽/오른쪽 · 열 빼기.
 *
 * 값의 해석(숫자·빈 칸·품명 필수)과 패치 만들기는 utils/purchaseOrder.ts 가 한다 —
 * 여기서는 그리기와 키보드만 맡는다.
 */
import { useMemo, useRef, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  EyeOff,
  Link2,
  Lock,
  Pencil,
  Plus,
  X,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import type {
  PurchaseColumnType,
  PurchaseOrderColumn,
  PurchaseOrderLine,
  PurchaseOrderLink,
} from '../../types';
import {
  type OrderCellValue,
  formatOrderCell,
  availableFieldColumns,
  isLockedColumn,
  lineAmount,
  moveColumn,
  newCustomColumnId,
  parseClipboardGrid,
  parseOrderCell,
  readOrderCell,
} from '../../utils/purchaseOrder';
import { formatKrw } from '../../utils/officialDocument';

export interface CellCommit {
  lineId: string;
  cells: { col: PurchaseOrderColumn; value: OrderCellValue }[];
}

interface OrderSheetProps {
  batchId: string;
  columns: PurchaseOrderColumn[];
  /** 표 순서대로 정렬된 이 차수의 품목 */
  lines: PurchaseOrderLine[];
  linksByLine: Map<string, PurchaseOrderLink[]>;
  describeItem: (requestId: string, rowId: string) => { requester: string; name: string } | null;
  selected: Set<string>;
  onToggleSelect: (lineId: string) => void;
  onToggleAll: () => void;
  onCommit: (commits: CellCommit[]) => void;
  onCreateLine: (name: string) => void;
  onUnlink: (link: PurchaseOrderLink, line: PurchaseOrderLine) => void;
  onColumnsChange: (columns: PurchaseOrderColumn[]) => void;
}

const TYPE_LABEL: Record<PurchaseColumnType, string> = { text: '글자', number: '숫자', url: '링크' };

/** 휴대폰 16px(iOS 확대 방지) · 데스크톱은 표 밀도 */
const CELL_INPUT =
  'h-8 w-full min-w-0 rounded-none border-0 bg-transparent px-2 text-[16px] shadow-none focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 focus-visible:ring-offset-0 sm:text-xs';

const colWidth = (col: PurchaseOrderColumn) =>
  col.field === 'name' ? 'min-w-[11rem]' : col.type === 'number' ? 'min-w-[6rem]' : 'min-w-[8rem]';

export function OrderSheet({
  batchId,
  columns,
  lines,
  linksByLine,
  describeItem,
  selected,
  onToggleSelect,
  onToggleAll,
  onCommit,
  onCreateLine,
  onUnlink,
  onColumnsChange,
}: OrderSheetProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  /** 금액 열은 수량 열 바로 뒤에 붙는 계산 열이다(고칠 수 없다) */
  const qtyIndex = columns.findIndex((c) => c.field === 'qty');
  const total = useMemo(
    () => lines.reduce((sum, l) => sum + (lineAmount(l) ?? 0), 0),
    [lines],
  );
  const allSelected = lines.length > 0 && lines.every((l) => selected.has(l.id));

  const focusCell = (r: number, c: number) => {
    const el = rootRef.current?.querySelector<HTMLInputElement>(
      `input[data-sheet-r="${r}"][data-sheet-c="${c}"]`,
    );
    if (el) {
      el.focus();
      el.select();
    }
  };

  const commitCell = (line: PurchaseOrderLine, col: PurchaseOrderColumn, raw: string) => {
    const parsed = parseOrderCell(col, raw);
    if (parsed.ok === false) {
      toast.error(parsed.reason);
      return;
    }
    if (parsed.value === readOrderCell(line, col)) return;
    onCommit([{ lineId: line.id, cells: [{ col, value: parsed.value }] }]);
  };

  /** 여러 칸 붙여넣기 — 있는 행·열까지만 채우고, 해석 안 되는 값은 건너뛴다 */
  const pasteGrid = (r0: number, c0: number, text: string): boolean => {
    const grid = parseClipboardGrid(text);
    if (grid.length === 1 && grid[0].length === 1) return false; // 한 칸 = 브라우저 기본 붙여넣기
    const commits: CellCommit[] = [];
    let skipped = 0;
    let outside = 0;
    grid.forEach((cells, i) => {
      const line = lines[r0 + i];
      if (!line) {
        outside += 1;
        return;
      }
      const out: CellCommit['cells'] = [];
      cells.forEach((raw, j) => {
        const col = columns[c0 + j];
        if (!col) return;
        const parsed = parseOrderCell(col, raw);
        if (parsed.ok === false) {
          skipped += 1;
          return;
        }
        out.push({ col, value: parsed.value });
      });
      if (out.length > 0) commits.push({ lineId: line.id, cells: out });
    });
    if (commits.length > 0) onCommit(commits);
    if (skipped > 0 || outside > 0) {
      toast.warning(
        [
          skipped > 0 ? `해석할 수 없는 값 ${skipped}칸은 건너뛰었습니다` : '',
          outside > 0 ? `표 아래로 넘친 ${outside}줄은 넣지 않았습니다(품목을 먼저 만들어 주세요)` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      );
    }
    return true;
  };

  return (
    <div ref={rootRef} className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b bg-slate-50 text-left text-slate-600">
            <th className="sticky left-0 z-10 w-8 bg-slate-50 px-2 py-1.5">
              <Checkbox checked={allSelected} onCheckedChange={onToggleAll} aria-label="모든 품목 선택" />
            </th>
            <th className="w-8 px-1 py-1.5 text-slate-400">#</th>
            {columns.map((col, ci) => (
              <HeaderCells key={col.id} withAmount={ci === qtyIndex}>
                <th className={`${colWidth(col)} border-l px-1 py-1 font-medium`}>
                  {renamingId === col.id ? (
                    <Input
                      autoFocus
                      defaultValue={col.name}
                      className="h-7 text-[16px] sm:text-xs"
                      onBlur={(e) => {
                        setRenamingId(null);
                        const name = e.target.value.trim();
                        if (name && name !== col.name) {
                          onColumnsChange(columns.map((c) => (c.id === col.id ? { ...c, name } : c)));
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                    />
                  ) : (
                    <ColumnMenu
                      col={col}
                      first={ci === 0}
                      last={ci === columns.length - 1}
                      onRename={() => setRenamingId(col.id)}
                      onMove={(dir) => onColumnsChange(moveColumn(columns, col.id, dir))}
                      onRemove={() => {
                        const msg = col.field
                          ? `'${col.name}' 열을 표에서 뺍니다. 적어 둔 값은 지우지 않으며 [+]의 준비된 열에서 다시 넣을 수 있습니다.`
                          : `'${col.name}' 열을 지웁니다. 이 열에 적은 값도 더는 보이지 않습니다.`;
                        if (window.confirm(msg)) onColumnsChange(columns.filter((c) => c.id !== col.id));
                      }}
                    />
                  )}
                </th>
              </HeaderCells>
            ))}
            <th className="min-w-[4.5rem] border-l px-2 py-1.5 text-center font-medium">신청</th>
            <th className="w-10 border-l px-1 py-1">
              <AddColumnButton columns={columns} onColumnsChange={onColumnsChange} />
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, r) => {
            const linked = linksByLine.get(line.id) ?? [];
            const isSelected = selected.has(line.id);
            return (
              <tr
                key={line.id}
                className={`border-b align-middle ${isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50/60'}`}
              >
                <td className="sticky left-0 z-10 bg-inherit px-2">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleSelect(line.id)}
                    aria-label={`${line.name} 선택`}
                  />
                </td>
                <td className="px-1 text-slate-400 tabular-nums">{r + 1}</td>
                {columns.map((col, c) => (
                  <HeaderCells
                    key={col.id}
                    withAmount={c === qtyIndex}
                    amount={
                      <td className="border-l bg-slate-50/60 px-2 text-right font-medium tabular-nums text-slate-700">
                        {lineAmount(line) !== null ? lineAmount(line)!.toLocaleString('ko-KR') : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    }
                  >
                    <td className="border-l p-0">
                      <SheetCell
                        sheetId={batchId}
                        r={r}
                        c={c}
                        col={col}
                        value={readOrderCell(line, col)}
                        onCommit={(raw) => commitCell(line, col, raw)}
                        onNav={(dr) => focusCell(r + dr, c)}
                        onPaste={(text) => pasteGrid(r, c, text)}
                      />
                    </td>
                  </HeaderCells>
                ))}
                <td className="border-l px-1 text-center">
                  <LinkedPopover
                    line={line}
                    links={linked}
                    describeItem={describeItem}
                    onUnlink={(l) => onUnlink(l, line)}
                  />
                </td>
                <td className="border-l" />
              </tr>
            );
          })}
          {/* 새 품목 — 품명을 적으면 줄이 생긴다 */}
          <tr className="border-b bg-slate-50/40">
            <td className="sticky left-0 z-10 bg-inherit px-2 text-slate-300">
              <Plus className="h-3.5 w-3.5" />
            </td>
            <td />
            {columns.map((col, c) => (
              <HeaderCells key={col.id} withAmount={c === qtyIndex} amount={<td className="border-l" />}>
                <td className="border-l p-0">
                  {col.field === 'name' ? (
                    <NewLineCell onCreate={onCreateLine} />
                  ) : null}
                </td>
              </HeaderCells>
            ))}
            <td className="border-l" />
            <td className="border-l" />
          </tr>
        </tbody>
        <tfoot>
          <tr className="bg-slate-50 font-semibold text-slate-700">
            <td className="sticky left-0 z-10 bg-slate-50" />
            <td />
            {columns.map((col, c) => (
              <HeaderCells
                key={col.id}
                withAmount={c === qtyIndex}
                amount={
                  <td className="border-l px-2 py-1.5 text-right tabular-nums text-emerald-700">
                    {formatKrw(total)}
                  </td>
                }
              >
                <td className="border-l px-2 py-1.5 text-slate-500">
                  {c === 0 ? `합계 · ${lines.length}개 품목` : ''}
                </td>
              </HeaderCells>
            ))}
            <td className="border-l" />
            <td className="border-l" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** 열 하나 + (수량 열이면) 바로 뒤에 금액 칸. 머리글에서는 금액 머리를 그린다 */
function HeaderCells({
  withAmount,
  amount,
  children,
}: {
  withAmount: boolean;
  amount?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      {withAmount &&
        (amount ?? (
          <th className="min-w-[6.5rem] border-l bg-slate-100/70 px-2 py-1.5 text-right font-medium" title="단가 × 수량 (계산 열)">
            금액
          </th>
        ))}
    </>
  );
}

function ColumnMenu({
  col,
  first,
  last,
  onRename,
  onMove,
  onRemove,
}: {
  col: PurchaseOrderColumn;
  first: boolean;
  last: boolean;
  onRename: () => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const locked = isLockedColumn(col);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`flex w-full min-w-0 items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-slate-100 ${
          col.type === 'number' ? 'justify-end' : ''
        }`}
        title={`${col.name} — 열 메뉴`}
      >
        {locked && <Lock className="h-3 w-3 shrink-0 text-slate-300" />}
        <span className="truncate">{col.name}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-slate-300" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuItem onSelect={onRename}>
          <Pencil className="mr-2 h-3.5 w-3.5" /> 이름 바꾸기
        </DropdownMenuItem>
        <DropdownMenuItem disabled={first} onSelect={() => onMove(-1)}>
          <ChevronLeft className="mr-2 h-3.5 w-3.5" /> 왼쪽으로
        </DropdownMenuItem>
        <DropdownMenuItem disabled={last} onSelect={() => onMove(1)}>
          <ChevronRight className="mr-2 h-3.5 w-3.5" /> 오른쪽으로
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={locked}
          onSelect={onRemove}
          className="text-rose-600 focus:text-rose-700"
        >
          <EyeOff className="mr-2 h-3.5 w-3.5" />
          {locked ? '금액 계산에 쓰여 뺄 수 없음' : col.field ? '열 빼기' : '열 지우기'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AddColumnButton({
  columns,
  onColumnsChange,
}: {
  columns: PurchaseOrderColumn[];
  onColumnsChange: (columns: PurchaseOrderColumn[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<PurchaseColumnType>('text');
  const hidden = availableFieldColumns(columns);

  const add = () => {
    const n = name.trim();
    if (!n) return;
    onColumnsChange([...columns, { id: newCustomColumnId(), name: n, type }]);
    setName('');
    setType('text');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-slate-200 hover:text-slate-800"
        title="열 추가"
        aria-label="열 추가"
      >
        <Plus className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3 p-3">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-slate-500">새 열</p>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="예: 견적 업체 2, 계정 이메일"
            className="h-8 text-[16px] sm:text-xs"
          />
          <div className="inline-flex rounded-lg border border-slate-100 bg-slate-100/50 p-0.5">
            {(Object.keys(TYPE_LABEL) as PurchaseColumnType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${
                  type === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={add} disabled={!name.trim()} className="h-8 w-full bg-blue-600 text-xs hover:bg-blue-700">
            열 추가
          </Button>
        </div>
        {hidden.length > 0 && (
          <div className="space-y-1 border-t pt-2">
            <p className="text-[11px] font-semibold text-slate-500">준비된 열 넣기</p>
            <div className="flex flex-wrap gap-1">
              {hidden.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => {
                    onColumnsChange([...columns, { ...h }]);
                    setOpen(false);
                  }}
                  className="rounded-full border px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
                >
                  + {h.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function SheetCell({
  sheetId,
  r,
  c,
  col,
  value,
  onCommit,
  onNav,
  onPaste,
}: {
  sheetId: string;
  r: number;
  c: number;
  col: PurchaseOrderColumn;
  value: OrderCellValue;
  onCommit: (raw: string) => void;
  onNav: (dr: -1 | 1) => void;
  onPaste: (text: string) => boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState('');
  /** Esc 로 되돌릴 때는 blur 가 저장하지 않게 한다 */
  const skipCommit = useRef(false);
  const original = value === null || value === undefined ? '' : String(value);

  return (
    <div className="flex items-center">
      <input
        data-sheet={sheetId}
        data-sheet-r={r}
        data-sheet-c={c}
        value={focused ? draft : formatOrderCell(col, value)}
        inputMode={col.type === 'number' ? 'decimal' : undefined}
        onFocus={(e) => {
          setDraft(original);
          setFocused(true);
          requestAnimationFrame(() => e.target.select());
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setFocused(false);
          if (skipCommit.current) {
            skipCommit.current = false;
            return;
          }
          if (draft !== original) onCommit(draft);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return; // 한글 조합 중 Enter 는 글자 확정이다
          if (e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault();
            onNav(1);
            if (e.key === 'Enter') e.currentTarget.blur();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            onNav(-1);
          } else if (e.key === 'Escape') {
            skipCommit.current = true;
            setDraft(original);
            e.currentTarget.blur();
          }
        }}
        onPaste={(e) => {
          if (onPaste(e.clipboardData.getData('text'))) e.preventDefault();
        }}
        className={`${CELL_INPUT} ${col.type === 'number' ? 'text-right tabular-nums' : ''} ${
          col.field === 'name' ? 'font-medium text-slate-800' : 'text-slate-700'
        }`}
        title={formatOrderCell(col, value) || undefined}
      />
      {col.type === 'url' && !focused && typeof value === 'string' && /^https?:\/\//i.test(value) && (
        <a
          href={value}
          target="_blank"
          rel="noreferrer noopener"
          className="mr-1 shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600"
          title="새 창에서 열기"
          aria-label="링크 열기"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

function NewLineCell({ onCreate }: { onCreate: (name: string) => void }) {
  const [value, setValue] = useState('');
  const create = () => {
    const name = value.trim();
    if (!name) return;
    onCreate(name);
    setValue('');
  };
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={create}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          create();
        }
      }}
      placeholder="+ 품목 직접 추가 (품명 입력)"
      className={`${CELL_INPUT} placeholder:text-slate-400`}
    />
  );
}

function LinkedPopover({
  line,
  links,
  describeItem,
  onUnlink,
}: {
  line: PurchaseOrderLine;
  links: PurchaseOrderLink[];
  describeItem: (requestId: string, rowId: string) => { requester: string; name: string } | null;
  onUnlink: (link: PurchaseOrderLink) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
          links.length > 0
            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
        }`}
        title="연결된 신청 품목"
      >
        <Link2 className="h-3 w-3" />
        {links.length}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="border-b px-3 py-2 text-[11px] font-semibold text-slate-500">
          <span className="block truncate" title={line.name}>
            {line.name}
          </span>
          연결된 신청 품목 {links.length}개
        </div>
        {links.length === 0 ? (
          <p className="px-3 py-3 text-[11px] text-slate-400">
            직접 추가한 품목입니다. 아래 신청 품목을 골라 ▲ 로 올리면 같은 이름끼리 여기에 붙습니다.
          </p>
        ) : (
          <div className="max-h-60 overflow-y-auto">
            {links.map((l) => {
              const info = describeItem(l.request_id, l.row_id);
              return (
                <div key={l.id} className="flex min-w-0 items-center gap-2 border-b px-3 py-1.5 text-xs last:border-b-0">
                  <span className="w-14 shrink-0 truncate text-slate-500">{info?.requester || '—'}</span>
                  <span className="min-w-0 flex-1 truncate" title={info?.name}>
                    {info?.name || '(물품명 없음)'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onUnlink(l)}
                    className="shrink-0 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    title="이 품목에서 빼기 — '아직 안 담긴' 쪽으로 돌아갑니다"
                    aria-label="빼기"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
