import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Table2, GripVertical, Lock, Users, Maximize2 } from 'lucide-react';
import { PluginComponentProps, TablePluginData, TableColumn, TableRow } from '@/types/plugin';
import { useAuth } from '@/components/auth/AuthProvider';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const COLUMN_TYPES = [
  { value: 'text', label: '텍스트' },
  { value: 'number', label: '숫자' },
  { value: 'checkbox', label: '체크박스' },
] as const;

const emptyData = (): TablePluginData => ({ title: '', columns: [], rows: [] });

const newColumn = (): TableColumn => ({
  id: Date.now().toString() + Math.random(),
  name: '',
  type: 'text',
});

const newRow = (columns: TableColumn[]): TableRow => ({
  id: Date.now().toString() + Math.random(),
  cells: Object.fromEntries(columns.map(c => [c.id, c.type === 'checkbox' ? false : c.type === 'number' ? '' : ''])),
});

export const TablePlugin: React.FC<PluginComponentProps> = ({
  instance,
  readonly = false,
  onUpdate,
}) => {
  const { user } = useAuth();
  const [tableData, setTableData] = useState<TablePluginData>(emptyData());
  const [isEditMode, setIsEditMode] = useState(false);
  const [editData, setEditData] = useState<TablePluginData>(emptyData());
  // Track which cell is being edited: "rowId-colId"
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [cellDraftValue, setCellDraftValue] = useState<string | number | boolean>('');
  const [isExpanded, setIsExpanded] = useState(false);
  const cellRefs = useRef<Map<string, HTMLElement>>(new Map());
  const pendingFocusRef = useRef<string | null>(null);

  useEffect(() => {
    if (pendingFocusRef.current) {
      const el = cellRefs.current.get(pendingFocusRef.current);
      if (el) el.focus();
      pendingFocusRef.current = null;
    }
  });

  useEffect(() => {
    if (instance.data && typeof instance.data === 'object') {
      const d = instance.data as Partial<TablePluginData>;
      setTableData({
        title: d.title || '',
        columns: d.columns || [],
        rows: d.rows || [],
        settings: d.settings || {},
      });
    }
  }, [instance.data]);

  const isCreator = instance.created_by === user?.id;
  const canAdd = !readonly && (tableData.settings?.addPermission === 'creator_only' ? isCreator : true);
  const canDelete = !readonly && (tableData.settings?.deletePermission === 'creator_only' ? isCreator : true);
  const canEdit = !readonly && (tableData.settings?.editPermission === 'creator_only' ? isCreator : true);

  // ── 셀 값 업데이트 ────────────────────────────────────────
  const handleCellChange = (rowId: string, colId: string, value: string | number | boolean) => {
    const updated: TablePluginData = {
      ...tableData,
      rows: tableData.rows.map(r =>
        r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: value } } : r
      ),
    };
    setTableData(updated);
    if (onUpdate) onUpdate(updated);
  };

  const handleAddRow = () => {
    const updated: TablePluginData = {
      ...tableData,
      rows: [...tableData.rows, newRow(tableData.columns)],
    };
    setTableData(updated);
    if (onUpdate) onUpdate(updated);
  };

  const handleDeleteRow = (rowId: string) => {
    const updated: TablePluginData = {
      ...tableData,
      rows: tableData.rows.filter(r => r.id !== rowId),
    };
    setTableData(updated);
    if (onUpdate) onUpdate(updated);
  };

  // ── 편집 모드 (컬럼 구성) ─────────────────────────────────
  const openEdit = () => {
    setEditData(JSON.parse(JSON.stringify(tableData)));
    setIsEditMode(true);
    setIsExpanded(true);
  };

  const handleAddColumn = () => {
    setEditData(prev => ({ ...prev, columns: [...prev.columns, newColumn()] }));
  };

  const handleRemoveColumn = (id: string) => {
    setEditData(prev => ({
      ...prev,
      columns: prev.columns.filter(c => c.id !== id),
    }));
  };

  const handleColumnChange = (id: string, field: keyof TableColumn, value: string) => {
    setEditData(prev => ({
      ...prev,
      columns: prev.columns.map(c => c.id === id ? { ...c, [field]: value } : c),
    }));
  };

  const handleSave = () => {
    // 저장 시 기존 행의 새 컬럼 셀 초기화, 삭제된 컬럼 셀 제거
    const saved: TablePluginData = {
      ...editData,
      rows: tableData.rows.map(row => {
        const cells: TableRow['cells'] = {};
        editData.columns.forEach(col => {
          if (col.id in row.cells) {
            cells[col.id] = row.cells[col.id];
          } else {
            cells[col.id] = col.type === 'checkbox' ? false : '';
          }
        });
        return { ...row, cells };
      }),
    };
    setTableData(saved);
    if (onUpdate) onUpdate(saved);
    setIsEditMode(false);
  };

  // ── 편집 모드 UI (다이얼로그 내부용) ─────────────────────────
  const renderEditContent = (onCancel?: () => void) => (
    <div className="space-y-3 overflow-y-auto flex-1">
      <div>
        <Label htmlFor="tbl-title">제목</Label>
        <Input
          id="tbl-title"
          value={editData.title}
          onChange={e => setEditData(prev => ({ ...prev, title: e.target.value }))}
          placeholder="표 제목"
        />
      </div>

      <div className="space-y-2">
        <Label>컬럼</Label>
        {editData.columns.map((col, idx) => (
          <div key={col.id} className="flex items-center gap-2">
            <Input
              value={col.name}
              onChange={e => handleColumnChange(col.id, 'name', e.target.value)}
              placeholder={`컬럼 ${idx + 1}`}
              className="flex-1"
            />
            <Select
              value={col.type}
              onValueChange={val => handleColumnChange(col.id, 'type', val)}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLUMN_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveColumn(col.id)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={handleAddColumn} className="w-full">
          <Plus className="w-4 h-4 mr-2" />
          컬럼 추가
        </Button>
      </div>

      <div className="space-y-2 border-t pt-3">
        <Label className="text-xs text-muted-foreground font-medium flex items-center gap-1">
          <Lock className="w-3 h-3" /> 권한 설정
        </Label>
        <div className="grid grid-cols-3 gap-2">
          {([
            { key: 'addPermission', label: '행 추가' },
            { key: 'deletePermission', label: '행 삭제' },
            { key: 'editPermission', label: '셀 수정' },
          ] as const).map(({ key, label }) => (
            <div key={key} className="space-y-1">
              <Label className="text-xs">{label}</Label>
              <Select
                value={editData.settings?.[key] || 'all'}
                onValueChange={v => setEditData(prev => ({ ...prev, settings: { ...prev.settings, [key]: v as 'all' | 'creator_only' } }))}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all"><span className="flex items-center gap-1"><Users className="w-3 h-3" />모두</span></SelectItem>
                  <SelectItem value="creator_only"><span className="flex items-center gap-1"><Lock className="w-3 h-3" />생성자만</span></SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-2 border-t">
        <Button
          onClick={handleSave}
          disabled={!editData.title || editData.columns.filter(c => c.name.trim()).length === 0}
        >
          저장
        </Button>
        <Button variant="outline" onClick={onCancel ?? (() => setIsEditMode(false))}>취소</Button>
      </div>
    </div>
  );

  // ── 초기 상태 ─────────────────────────────────────────────
  if (!tableData.title || tableData.columns.length === 0) {
    if (!readonly) {
      return (
        <>
          <Card className="w-full">
            <CardContent className="py-6 px-3 md:px-6 text-center">
              <Table2 className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-xs md:text-sm text-muted-foreground mb-3">
                아직 설정된 표가 없습니다
              </p>
              <Button onClick={openEdit} size="sm" className="h-8 text-xs md:h-9 md:text-sm">
                표 만들기
              </Button>
            </CardContent>
          </Card>

          <Dialog open={isExpanded} onOpenChange={open => { setIsExpanded(open); if (!open) setIsEditMode(false); }}>
            <DialogContent className="max-w-lg w-full max-h-[90vh] flex flex-col">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <Table2 className="w-4 h-4 text-blue-600" />
                  표 설정
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-auto">
                {renderEditContent(() => setIsExpanded(false))}
              </div>
            </DialogContent>
          </Dialog>
        </>
      );
    }
    return null;
  }

  // ── 셀 커밋 (blur/Enter 시 저장) ─────────────────────────
  const commitCell = (rowId: string, colId: string, value: string | number | boolean) => {
    handleCellChange(rowId, colId, value);
    setEditingCell(null);
  };

  // ── 셀 열기 (draft 초기화) ────────────────────────────────
  const openCell = (rowId: string, colId: string) => {
    const row = tableData.rows.find(r => r.id === rowId);
    const col = tableData.columns.find(c => c.id === colId);
    const current = row?.cells[colId] ?? (col?.type === 'checkbox' ? false : '');
    setCellDraftValue(current);
    setEditingCell(`${rowId}-${colId}`);
  };

  // ── 셀 네비게이션 ────────────────────────────────────────
  const navigateCell = (rowId: string, colId: string, direction: 'up' | 'down' | 'left' | 'right' | 'next') => {
    const cols = tableData.columns.filter(c => c.name.trim());
    const rows = tableData.rows;
    const rowIdx = rows.findIndex(r => r.id === rowId);
    const colIdx = cols.findIndex(c => c.id === colId);

    let nextRow = rowIdx;
    let nextCol = colIdx;

    if (direction === 'right' || direction === 'next') {
      if (colIdx < cols.length - 1) nextCol = colIdx + 1;
      else if (rowIdx < rows.length - 1) { nextRow = rowIdx + 1; nextCol = 0; }
      else return;
    } else if (direction === 'left') {
      if (colIdx > 0) nextCol = colIdx - 1;
      else if (rowIdx > 0) { nextRow = rowIdx - 1; nextCol = cols.length - 1; }
      else return;
    } else if (direction === 'down') {
      if (rowIdx < rows.length - 1) nextRow = rowIdx + 1;
      else return;
    } else if (direction === 'up') {
      if (rowIdx > 0) nextRow = rowIdx - 1;
      else return;
    }

    handleCellChange(rowId, colId, cellDraftValue);
    openCell(rows[nextRow].id, cols[nextCol].id);
  };

  // ── 뷰 모드 셀 포커스 이동 ────────────────────────────────
  const navigateFocusedCell = (rowId: string, colId: string, direction: 'up' | 'down' | 'left' | 'right') => {
    const cols = tableData.columns.filter(c => c.name.trim());
    const rows = tableData.rows;
    const rowIdx = rows.findIndex(r => r.id === rowId);
    const colIdx = cols.findIndex(c => c.id === colId);

    let nextRow = rowIdx;
    let nextCol = colIdx;

    if (direction === 'right') {
      if (colIdx < cols.length - 1) nextCol = colIdx + 1;
      else if (rowIdx < rows.length - 1) { nextRow = rowIdx + 1; nextCol = 0; }
      else return;
    } else if (direction === 'left') {
      if (colIdx > 0) nextCol = colIdx - 1;
      else if (rowIdx > 0) { nextRow = rowIdx - 1; nextCol = cols.length - 1; }
      else return;
    } else if (direction === 'down') {
      if (rowIdx < rows.length - 1) nextRow = rowIdx + 1;
      else return;
    } else if (direction === 'up') {
      if (rowIdx > 0) nextRow = rowIdx - 1;
      else return;
    }

    const nextKey = `${rows[nextRow].id}-${cols[nextCol].id}`;
    const el = cellRefs.current.get(nextKey);
    if (el) el.focus();
  };

  // ── 뷰 모드 (스프레드시트) ─────────────────────────────────
  const validColumns = tableData.columns.filter(c => c.name.trim());

  const renderTableContent = () => (
    <>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-xs md:text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {(canAdd || canDelete) && (
                <th className="w-8 px-1 py-2 text-center text-muted-foreground font-medium border-r border-gray-200">
                  #
                </th>
              )}
              {validColumns.map(col => (
                <th
                  key={col.id}
                  className="px-2 py-2 text-left font-semibold text-gray-700 border-r border-gray-200 last:border-r-0 whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    {col.name}
                    <span className="text-[9px] text-muted-foreground font-normal">
                      {col.type === 'number' ? '(숫자)' : col.type === 'checkbox' ? '(체크)' : ''}
                    </span>
                  </div>
                </th>
              ))}
              {canDelete && (
                <th className="w-8 px-1 py-2 border-l border-gray-200" />
              )}
            </tr>
          </thead>
          <tbody>
            {tableData.rows.map((row, rowIdx) => (
              <tr
                key={row.id}
                className={cn(
                  'border-b border-gray-100 last:border-b-0 transition-colors',
                  rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50',
                  canEdit && 'hover:bg-blue-50/30'
                )}
              >
                {(canAdd || canDelete) && (
                  <td className="px-1 py-1 text-center text-[10px] text-muted-foreground border-r border-gray-100">
                    {rowIdx + 1}
                  </td>
                )}
                {validColumns.map(col => {
                  const cellKey = `${row.id}-${col.id}`;
                  const value = row.cells[col.id] ?? (col.type === 'checkbox' ? false : '');

                  return (
                    <td key={col.id} className="px-1 py-0.5 border-r border-gray-100 last:border-r-0">
                      {col.type === 'checkbox' ? (
                        <div className="flex items-center justify-center">
                          <Checkbox
                            checked={Boolean(value)}
                            onCheckedChange={checked => handleCellChange(row.id, col.id, Boolean(checked))}
                            disabled={!canEdit}
                          />
                        </div>
                      ) : editingCell === cellKey && canEdit ? (
                        <Input
                          autoFocus
                          type={col.type === 'number' ? 'number' : 'text'}
                          value={String(cellDraftValue)}
                          onChange={e => setCellDraftValue(col.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
                          onBlur={() => commitCell(row.id, col.id, cellDraftValue)}
                          onKeyDown={e => {
                            if (e.key === 'Escape') { pendingFocusRef.current = cellKey; setEditingCell(null); return; }
                            if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); navigateCell(row.id, col.id, 'down'); return; }
                            if (e.key === 'ArrowUp') { e.preventDefault(); navigateCell(row.id, col.id, 'up'); return; }
                            if (e.key === 'ArrowRight' && (e.target as HTMLInputElement).selectionStart === String((e.target as HTMLInputElement).value).length) { e.preventDefault(); navigateCell(row.id, col.id, 'right'); return; }
                            if (e.key === 'ArrowLeft' && (e.target as HTMLInputElement).selectionStart === 0) { e.preventDefault(); navigateCell(row.id, col.id, 'left'); return; }
                            if (e.key === 'Tab') { e.preventDefault(); navigateCell(row.id, col.id, e.shiftKey ? 'left' : 'next'); }
                          }}
                          className="h-7 text-xs border-blue-300 focus:ring-1 focus:ring-blue-400 px-1.5 min-w-[60px]"
                        />
                      ) : (
                        <div
                          ref={el => {
                            if (el) cellRefs.current.set(cellKey, el);
                            else cellRefs.current.delete(cellKey);
                          }}
                          tabIndex={canEdit ? 0 : undefined}
                          className={cn(
                            'min-h-[28px] px-1.5 py-1 rounded text-xs leading-tight outline-none',
                            canEdit && 'cursor-pointer hover:bg-blue-100/60 focus:ring-2 focus:ring-blue-400/60 focus:bg-blue-50',
                            !value && canEdit && 'text-muted-foreground/40'
                          )}
                          onClick={() => canEdit && openCell(row.id, col.id)}
                          onKeyDown={e => {
                            if (!canEdit) return;
                            if (e.key === 'Enter') { e.preventDefault(); openCell(row.id, col.id); }
                            else if (e.key === 'ArrowLeft') { e.preventDefault(); navigateFocusedCell(row.id, col.id, 'left'); }
                            else if (e.key === 'ArrowRight') { e.preventDefault(); navigateFocusedCell(row.id, col.id, 'right'); }
                            else if (e.key === 'ArrowUp') { e.preventDefault(); navigateFocusedCell(row.id, col.id, 'up'); }
                            else if (e.key === 'ArrowDown') { e.preventDefault(); navigateFocusedCell(row.id, col.id, 'down'); }
                          }}
                        >
                          {value !== '' && value !== undefined ? String(value) : (canEdit ? '클릭하여 입력' : '—')}
                        </div>
                      )}
                    </td>
                  );
                })}
                {canDelete && (
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

            {tableData.rows.length === 0 && (
              <tr>
                <td
                  colSpan={validColumns.length + (readonly ? 0 : 2)}
                  className="py-6 text-center text-xs text-muted-foreground"
                >
                  데이터가 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canAdd && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleAddRow}
          className="mt-2 w-full h-7 text-xs border-dashed"
        >
          <Plus className="w-3 h-3 mr-1" />
          행 추가
        </Button>
      )}
    </>
  );

  return (
    <>
      <Card className="w-full overflow-hidden border-l-4 border-l-blue-500">
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <Table2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="text-sm font-medium truncate">{tableData.title}</span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={e => { e.stopPropagation(); setIsExpanded(true); }}
              className="h-7 px-3 text-xs shrink-0"
            >
              열기
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isExpanded} onOpenChange={open => { setIsExpanded(open); if (!open) setIsEditMode(false); }}>
        <DialogContent className={isEditMode ? "max-w-lg w-full max-h-[90vh] flex flex-col" : "max-w-5xl w-full max-h-[90vh] flex flex-col"}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Table2 className="w-4 h-4 text-blue-600" />
              {isEditMode ? '표 설정' : (
                <>
                  {tableData.title}
                  <span className="text-xs font-normal text-muted-foreground ml-1">{tableData.rows.length}행</span>
                </>
              )}
              {isCreator && !readonly && !isEditMode && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={openEdit}
                  className="ml-auto h-7 px-2 text-xs text-muted-foreground"
                >
                  편집
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {isEditMode ? renderEditContent() : renderTableContent()}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
