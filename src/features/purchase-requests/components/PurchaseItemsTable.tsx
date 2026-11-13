import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PurchaseColumn, PurchaseItemRow } from '../types';
import { LinkCell } from './LinkCell';
import { normalizeCellValue } from '../utils/myItems';

interface PurchaseItemsTableProps {
  columns: PurchaseColumn[];
  rows: PurchaseItemRow[];
  onChange: (rows: PurchaseItemRow[]) => void;
  readonly?: boolean;
  /**
   * 열람 모드에서 행마다 덧붙일 칸 (품목별 승인 상태 등, 2026-09-02).
   * **편집 모드에서는 그리지 않는다** — 입력 중인 표에 읽기 전용 칸이 섞이면
   * 스프레드시트 이동(Tab/Enter)의 열 계산이 어긋난다.
   */
  extraColumnHeader?: string;
  renderExtraCell?: (row: PurchaseItemRow) => React.ReactNode;
}

const newRowFor = (cols: PurchaseColumn[]): PurchaseItemRow => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  cells: Object.fromEntries(cols.map((c) => [c.id, c.type === 'number' ? '' : ''])),
});

export const PurchaseItemsTable: React.FC<PurchaseItemsTableProps> = ({
  columns,
  rows,
  onChange,
  readonly = false,
  extraColumnHeader,
  renderExtraCell,
}) => {
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState<string | number>('');
  const cellRefs = useRef<Map<string, HTMLElement>>(new Map());

  // 기본적으로 행이 하나도 없으면 한 줄 자동 추가
  useEffect(() => {
    if (!readonly && rows.length === 0 && columns.length > 0) {
      onChange([newRowFor(columns)]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns.length]);

  const visibleColumns = columns;
  const showExtra = readonly && !!renderExtraCell;

  const handleAddRow = () => {
    onChange([...rows, newRowFor(visibleColumns)]);
  };

  const handleDeleteRow = (rowId: string) => {
    onChange(rows.filter((r) => r.id !== rowId));
  };

  const setCellValue = (rowId: string, colId: string, value: string | number) => {
    onChange(
      rows.map((r) => (r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: value } } : r)),
    );
  };

  const openCell = (rowId: string, colId: string) => {
    const row = rows.find((r) => r.id === rowId);
    const current = row?.cells?.[colId] ?? '';
    setDraftValue(current as string | number);
    setEditingCell(`${rowId}-${colId}`);
  };

  // URL 컬럼은 https:// 누락 시 자동 보정 — 품목 수정 창과 같은 규칙(utils/myItems)
  const normalizeForColumn = normalizeCellValue;

  const commitCell = (rowId: string, colId: string, value: string | number) => {
    const col = visibleColumns.find((c) => c.id === colId);
    const normalized = col ? normalizeForColumn(col, value) : value;
    setCellValue(rowId, colId, normalized);
    setEditingCell(null);
  };

  const navigate = (
    rowId: string,
    colId: string,
    direction: 'up' | 'down' | 'left' | 'right' | 'next',
  ) => {
    const cols = visibleColumns;
    const rowIdx = rows.findIndex((r) => r.id === rowId);
    const colIdx = cols.findIndex((c) => c.id === colId);
    if (rowIdx === -1 || colIdx === -1) return;

    let nextRow = rowIdx;
    let nextCol = colIdx;

    const currentCol = cols[colIdx];
    const normalizedDraft = currentCol ? normalizeForColumn(currentCol, draftValue) : draftValue;

    if (direction === 'right' || direction === 'next') {
      if (colIdx < cols.length - 1) nextCol = colIdx + 1;
      else if (rowIdx < rows.length - 1) {
        nextRow = rowIdx + 1;
        nextCol = 0;
      } else {
        // 마지막 셀이면 새 행 추가 후 첫 셀로 이동
        const created = newRowFor(visibleColumns);
        onChange([...rows.map((r) => (r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: normalizedDraft } } : r)), created]);
        setEditingCell(null);
        setTimeout(() => openCell(created.id, cols[0].id), 0);
        return;
      }
    } else if (direction === 'left') {
      if (colIdx > 0) nextCol = colIdx - 1;
      else if (rowIdx > 0) {
        nextRow = rowIdx - 1;
        nextCol = cols.length - 1;
      } else return;
    } else if (direction === 'down') {
      if (rowIdx < rows.length - 1) nextRow = rowIdx + 1;
      else {
        const created = newRowFor(visibleColumns);
        onChange([...rows.map((r) => (r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: normalizedDraft } } : r)), created]);
        setEditingCell(null);
        setTimeout(() => openCell(created.id, colId), 0);
        return;
      }
    } else if (direction === 'up') {
      if (rowIdx > 0) nextRow = rowIdx - 1;
      else return;
    }

    setCellValue(rowId, colId, normalizedDraft);
    openCell(rows[nextRow].id, cols[nextCol].id);
  };

  return (
    <div className="space-y-2">
      {/* ── 모바일: 품목 카드 폼 — 6열 가로 스크롤 표는 폰에서 사실상 입력 불가라 세로 필드로 전환 */}
      <div className="sm:hidden space-y-2">
        {rows.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground rounded-lg border border-dashed">
            데이터가 없습니다
          </div>
        ) : (
          rows.map((row, rowIdx) => (
            <div key={row.id} className="rounded-lg border border-gray-200 bg-white p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-400">품목 {rowIdx + 1}</span>
                {!readonly && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-red-500"
                    onClick={() => handleDeleteRow(row.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
              {visibleColumns.map((col) => {
                const value = row.cells?.[col.id] ?? '';
                return (
                  <div key={col.id} className="space-y-0.5">
                    <label className="text-[11px] text-slate-500">
                      {col.name}
                      {col.required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    {readonly ? (
                      <div className="min-h-[24px] text-xs">
                        {col.type === 'url' && value ? (
                          <LinkCell value={value} />
                        ) : (
                          <span className="whitespace-pre-wrap">
                            {value !== '' && value !== undefined ? String(value) : '—'}
                          </span>
                        )}
                      </div>
                    ) : (
                      <Input
                        type={col.type === 'number' ? 'number' : col.type === 'url' ? 'url' : 'text'}
                        value={String(value)}
                        placeholder={col.type === 'url' ? '구매 링크 붙여넣기' : col.required ? '필수 입력' : ''}
                        onChange={(e) =>
                          setCellValue(
                            row.id,
                            col.id,
                            col.type === 'number'
                              ? e.target.value === ''
                                ? ''
                                : Number(e.target.value)
                              : e.target.value,
                          )
                        }
                        onBlur={() => {
                          if (col.type === 'url') {
                            const current = row.cells?.[col.id] ?? '';
                            const normalized = normalizeForColumn(col, current as string | number);
                            if (normalized !== current) setCellValue(row.id, col.id, normalized);
                          }
                        }}
                        className="h-8 text-xs"
                      />
                    )}
                  </div>
                );
              })}
              {showExtra && (
                <div className="space-y-0.5 border-t pt-2">
                  <label className="text-[11px] text-slate-500">{extraColumnHeader}</label>
                  <div className="text-xs">{renderExtraCell?.(row)}</div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* ── 데스크톱: 셀 편집 스프레드시트 */}
      <div className="hidden sm:block overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-xs md:text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="w-8 px-1 py-2 text-center text-muted-foreground font-medium border-r border-gray-200">
                #
              </th>
              {visibleColumns.map((col) => (
                <th
                  key={col.id}
                  className="px-2 py-2 text-left font-semibold text-gray-700 border-r border-gray-200 last:border-r-0 whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    <span>{col.name}</span>
                    {col.required && <span className="text-red-500 text-[10px]">*</span>}
                    <span className="text-[9px] text-muted-foreground font-normal">
                      {col.type === 'number' ? '(숫자)' : col.type === 'url' ? '(URL)' : ''}
                    </span>
                  </div>
                </th>
              ))}
              {showExtra && (
                <th className="px-2 py-2 text-left font-semibold text-gray-700 whitespace-nowrap border-l border-gray-200">
                  {extraColumnHeader}
                </th>
              )}
              {!readonly && <th className="w-8 px-1 py-2 border-l border-gray-200" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr
                key={row.id}
                className={cn(
                  'border-b border-gray-100 last:border-b-0 transition-colors',
                  rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50',
                  !readonly && 'hover:bg-blue-50/30',
                )}
              >
                <td className="px-1 py-1 text-center text-[10px] text-muted-foreground border-r border-gray-100">
                  {rowIdx + 1}
                </td>
                {visibleColumns.map((col) => {
                  const cellKey = `${row.id}-${col.id}`;
                  const value = row.cells?.[col.id] ?? '';
                  const isEditing = editingCell === cellKey;

                  if (readonly || !col) {
                    return (
                      <td
                        key={col.id}
                        className="px-2 py-1.5 border-r border-gray-100 last:border-r-0"
                      >
                        {col.type === 'url' && value ? (
                          <LinkCell value={value} />
                        ) : (
                          <span className="text-xs whitespace-pre-wrap">
                            {value !== '' && value !== undefined ? String(value) : '—'}
                          </span>
                        )}
                      </td>
                    );
                  }

                  return (
                    <td
                      key={col.id}
                      className="px-1 py-0.5 border-r border-gray-100 last:border-r-0"
                    >
                      {isEditing ? (
                        <Input
                          autoFocus
                          type={col.type === 'number' ? 'number' : col.type === 'url' ? 'url' : 'text'}
                          value={String(draftValue)}
                          onChange={(e) =>
                            setDraftValue(
                              col.type === 'number'
                                ? e.target.value === ''
                                  ? ''
                                  : Number(e.target.value)
                                : e.target.value,
                            )
                          }
                          onBlur={() => commitCell(row.id, col.id, draftValue)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              setEditingCell(null);
                              return;
                            }
                            if (e.key === 'Enter' || e.key === 'ArrowDown') {
                              e.preventDefault();
                              navigate(row.id, col.id, 'down');
                              return;
                            }
                            if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              navigate(row.id, col.id, 'up');
                              return;
                            }
                            if (e.key === 'Tab') {
                              e.preventDefault();
                              navigate(row.id, col.id, e.shiftKey ? 'left' : 'next');
                            }
                          }}
                          className="h-7 text-xs border-blue-300 focus:ring-1 focus:ring-blue-400 px-1.5 min-w-[60px]"
                        />
                      ) : (
                        <div
                          ref={(el) => {
                            if (el) cellRefs.current.set(cellKey, el);
                            else cellRefs.current.delete(cellKey);
                          }}
                          tabIndex={0}
                          className={cn(
                            'min-h-[28px] px-1.5 py-1 rounded text-xs leading-tight outline-none cursor-pointer',
                            'hover:bg-blue-100/60 focus:ring-2 focus:ring-blue-400/60 focus:bg-blue-50',
                            !value && 'text-muted-foreground/40',
                          )}
                          onClick={() => openCell(row.id, col.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              openCell(row.id, col.id);
                            }
                          }}
                        >
                          {value !== '' && value !== undefined
                            ? String(value)
                            : col.required
                            ? '필수 입력'
                            : '클릭하여 입력'}
                        </div>
                      )}
                    </td>
                  );
                })}
                {showExtra && (
                  <td className="px-2 py-1.5 align-top border-l border-gray-100">
                    {renderExtraCell?.(row)}
                  </td>
                )}
                {!readonly && (
                  <td className="px-1 py-0.5 border-l border-gray-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-red-500"
                      onClick={() => handleDeleteRow(row.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={visibleColumns.length + (readonly ? 1 : 2) + (showExtra ? 1 : 0)}
                  className="py-6 text-center text-xs text-muted-foreground"
                >
                  데이터가 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!readonly && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleAddRow}
          className="w-full h-8 text-xs border-dashed"
          type="button"
        >
          <Plus className="w-3 h-3 mr-1" /> 품목 추가
        </Button>
      )}
    </div>
  );
};
