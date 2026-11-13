import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DialogFooter, Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileSpreadsheet, Lock, Users, Edit2, Eye, Table2, LayoutGrid, Plus, Trash2, Maximize2 } from 'lucide-react';
import { PluginComponentProps, CsvViewerData, ViewerConfig, TableConfig, AggFn, CardConfig, CardFieldConfig, CardAgg } from '@/types/plugin';
import { useAuth } from '@/components/auth/AuthProvider';
import { cn } from '@/lib/utils';

const DISPLAY_MODES = [
  { value: 'table' as const, label: '표', icon: Table2 },
  { value: 'card' as const, label: '카드', icon: LayoutGrid },
];

const parseCsv = (text: string): { headers: string[]; rows: string[][] } => {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 1) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = lines.slice(1).map(line => {
    const cells = line.split(',').map(c => c.trim());
    while (cells.length < headers.length) cells.push('');
    return cells.slice(0, headers.length);
  });
  return { headers, rows };
};

const serializeCsv = (headers: string[], rows: string[][]): string =>
  [headers, ...rows].map(row => row.join(',')).join('\n');

const AGG_LABELS: Record<AggFn, string> = {
  first: '첫 번째 값', sum: '합계', count: '개수', avg: '평균', min: '최솟값', max: '최댓값',
};

const applyAgg = (values: string[], fn: AggFn): string => {
  if (values.length === 0) return '—';
  if (fn === 'count') return String(values.length);
  if (fn === 'first') return values[0] ?? '—';
  const nums = values.map(v => parseFloat(v.replace(/,/g, ''))).filter(n => !isNaN(n));
  if (nums.length === 0) return '—';
  switch (fn) {
    case 'sum': {
      const s = nums.reduce((a, b) => a + b, 0);
      return Number.isInteger(s) ? String(s) : s.toFixed(2);
    }
    case 'avg': {
      const a = nums.reduce((a, b) => a + b, 0) / nums.length;
      return Number.isInteger(a) ? String(a) : a.toFixed(2);
    }
    case 'min': return String(Math.min(...nums));
    case 'max': return String(Math.max(...nums));
  }
};

const defaultViewer = (): ViewerConfig => ({
  id: Date.now().toString(),
  title: '뷰어 1',
  displayMode: 'table',
});

const emptyData = (): CsvViewerData => ({
  title: '',
  csvText: '',
  viewers: [defaultViewer()],
  settings: { editPermission: 'creator_only' },
});

export const CsvViewerPlugin: React.FC<PluginComponentProps> = ({
  instance,
  readonly = false,
  onUpdate,
}) => {
  const { user } = useAuth();
  const [data, setData] = useState<CsvViewerData>(emptyData());
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSpreadsheetOpen, setIsSpreadsheetOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<CsvViewerData>(emptyData());
  const [activeViewerIdx, setActiveViewerIdx] = useState(0);
  const [editViewerIdx, setEditViewerIdx] = useState(0);

  // ── 스프레드시트 편집 상태 ────────────────────────────────
  const [editHeaders, setEditHeaders] = useState<string[]>(['열 1']);
  const [editRows, setEditRows] = useState<string[][]>([['']]);
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [cellDraft, setCellDraft] = useState('');
  const cellRefs = useRef<Map<string, HTMLElement>>(new Map());
  const pendingFocusRef = useRef<string | null>(null);

  // ── Undo / Redo 히스토리 ──────────────────────────────────
  type Snapshot = { headers: string[]; rows: string[][] };
  const [undoStack, setUndoStack] = useState<Snapshot[]>([]);
  const [redoStack, setRedoStack] = useState<Snapshot[]>([]);
  const undoHandlerRef = useRef<() => void>(() => {});
  const redoHandlerRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (pendingFocusRef.current) {
      const el = cellRefs.current.get(pendingFocusRef.current);
      if (el) el.focus();
      pendingFocusRef.current = null;
    }
  });

  useEffect(() => {
    if (instance.data && typeof instance.data === 'object') {
      const d = instance.data as any;
      // 하위 호환: 기존 displayMode/tableConfig/cardConfig 필드를 viewers 배열로 마이그레이션
      let viewers: ViewerConfig[] = Array.isArray(d.viewers) ? d.viewers : [];
      if (viewers.length === 0) {
        viewers = [{
          id: '1',
          title: '뷰어 1',
          displayMode: d.displayMode || 'table',
          tableConfig: d.tableConfig,
          cardConfig: d.cardConfig,
        }];
      }
      setData({
        title: d.title || '',
        csvText: d.csvText || '',
        viewers,
        settings: d.settings || { editPermission: 'creator_only' },
      });
      setActiveViewerIdx(0);
    }
  }, [instance.data]);

  const isCreator = instance.created_by === user?.id;
  const canEdit = !readonly && (data.settings?.editPermission === 'creator_only' ? isCreator : true);

  const { headers, rows } = parseCsv(data.csvText);
  const hasData = Boolean(data.title && data.csvText.trim());

  const openEdit = () => {
    const draft = JSON.parse(JSON.stringify(data)) as CsvViewerData;
    setEditDraft(draft);
    const { headers: h, rows: r } = parseCsv(draft.csvText);
    setEditHeaders(h.length ? h : ['열 1']);
    setEditRows(r.length ? r : [Array(h.length || 1).fill('')]);
    setEditingCell(null);
    setEditViewerIdx(0);
    setIsEditing(true);
  };

  const saveEdit = () => {
    // 현재 편집 중인 셀 커밋
    const finalHeaders = [...editHeaders];
    const finalRows = editRows.map(r => [...r]);
    if (editingCell) {
      if (editingCell.startsWith('h-')) {
        const ci = parseInt(editingCell.slice(2));
        finalHeaders[ci] = cellDraft;
      } else {
        const [, ri, ci] = editingCell.split('-').map(Number);
        finalRows[ri][ci] = cellDraft;
      }
    }
    const csvText = serializeCsv(finalHeaders, finalRows);
    const saved = { ...editDraft, csvText };
    setData(saved);
    if (onUpdate) onUpdate(saved);
    setIsEditing(false);
    setEditingCell(null);
  };

  // ── 셀 열기/커밋/네비게이션 ──────────────────────────────
  const openCell = (key: string, value: string) => {
    setEditingCell(key);
    setCellDraft(value);
  };

  const commitAndOpen = (key: string, value: string, nextKey: string, nextValue: string) => {
    pushHistory();
    if (key.startsWith('h-')) {
      const ci = parseInt(key.slice(2));
      setEditHeaders(prev => prev.map((h, i) => i === ci ? value : h));
    } else {
      const [, ri, ci] = key.split('-').map(Number);
      setEditRows(prev => prev.map((row, i) => i === ri ? row.map((c, j) => j === ci ? value : c) : row));
    }
    setEditingCell(nextKey);
    setCellDraft(nextValue);
  };

  const commitCurrent = (key: string, value: string) => {
    pushHistory();
    if (key.startsWith('h-')) {
      const ci = parseInt(key.slice(2));
      setEditHeaders(prev => prev.map((h, i) => i === ci ? value : h));
    } else {
      const [, ri, ci] = key.split('-').map(Number);
      setEditRows(prev => prev.map((row, i) => i === ri ? row.map((c, j) => j === ci ? value : c) : row));
    }
    setEditingCell(null);
  };

  const navigate = (key: string, value: string, dir: 'right' | 'left' | 'down' | 'up' | 'next') => {
    const colCount = editHeaders.length;
    const rowCount = editRows.length;

    let isHeader = key.startsWith('h-');
    let ri = isHeader ? -1 : parseInt(key.split('-')[1]);
    let ci = isHeader ? parseInt(key.slice(2)) : parseInt(key.split('-')[2]);

    let nextRi = ri;
    let nextCi = ci;
    let nextIsHeader = isHeader;

    if (dir === 'right' || dir === 'next') {
      if (ci < colCount - 1) { nextCi = ci + 1; }
      else {
        // 마지막 열 어느 행에서든 Tab → 열 추가
        commitAndOpen(key, value, `h-${colCount}`, '');
        setEditHeaders(prev => [...prev, `열 ${prev.length + 1}`]);
        setEditRows(prev => prev.map(row => [...row, '']));
        return;
      }
    } else if (dir === 'left') {
      if (ci > 0) { nextCi = ci - 1; }
      else if (!isHeader && ri > 0) { nextRi = ri - 1; nextCi = colCount - 1; }
      else if (!isHeader && ri === 0) { nextRi = -1; nextCi = colCount - 1; nextIsHeader = true; }
      else return;
    } else if (dir === 'down') {
      if (isHeader) { nextRi = 0; nextIsHeader = false; }
      else if (ri < rowCount - 1) { nextRi = ri + 1; }
      else {
        // 마지막 행에서 Enter → 행 추가
        const newRowIdx = rowCount;
        commitAndOpen(key, value, `r-${newRowIdx}-${ci}`, '');
        setEditRows(prev => [...prev, Array(colCount).fill('')]);
        pendingFocusRef.current = `r-${newRowIdx}-${ci}`;
        return;
      }
    } else if (dir === 'up') {
      if (!isHeader && ri === 0) { nextRi = -1; nextIsHeader = true; }
      else if (!isHeader && ri > 0) { nextRi = ri - 1; }
      else return;
    }

    const nextKey = nextIsHeader ? `h-${nextCi}` : `r-${nextRi}-${nextCi}`;
    const nextVal = nextIsHeader
      ? editHeaders[nextCi]
      : (editRows[nextRi]?.[nextCi] ?? '');
    commitAndOpen(key, value, nextKey, nextVal);
  };

  // ── 뷰 모드 div 셀 포커스 이동 ──────────────────────────
  const navigateFocusedCell = (key: string, dir: 'right' | 'left' | 'down' | 'up') => {
    const colCount = editHeaders.length;
    const rowCount = editRows.length;
    const isHeader = key.startsWith('h-');
    const ri = isHeader ? -1 : parseInt(key.split('-')[1]);
    const ci = isHeader ? parseInt(key.slice(2)) : parseInt(key.split('-')[2]);

    let nextRi = ri, nextCi = ci, nextIsHeader = isHeader;

    if (dir === 'right') {
      if (ci < colCount - 1) { nextCi = ci + 1; }
      else if (isHeader) { nextRi = 0; nextCi = 0; nextIsHeader = false; }
      else if (ri < rowCount - 1) { nextRi = ri + 1; nextCi = 0; }
      else return;
    } else if (dir === 'left') {
      if (ci > 0) { nextCi = ci - 1; }
      else if (!isHeader && ri > 0) { nextRi = ri - 1; nextCi = colCount - 1; }
      else if (!isHeader && ri === 0) { nextRi = -1; nextCi = colCount - 1; nextIsHeader = true; }
      else return;
    } else if (dir === 'down') {
      if (isHeader) { nextRi = 0; nextIsHeader = false; }
      else if (ri < rowCount - 1) { nextRi = ri + 1; }
      else return;
    } else if (dir === 'up') {
      if (!isHeader && ri === 0) { nextRi = -1; nextIsHeader = true; }
      else if (!isHeader && ri > 0) { nextRi = ri - 1; }
      else return;
    }

    const nextKey = nextIsHeader ? `h-${nextCi}` : `r-${nextRi}-${nextCi}`;
    const el = cellRefs.current.get(nextKey);
    if (el) el.focus();
  };

  // ── 히스토리 헬퍼 ────────────────────────────────────────
  const pushHistory = () => {
    setUndoStack(prev => [
      ...prev.slice(-49),
      { headers: [...editHeaders], rows: editRows.map(r => [...r]) },
    ]);
    setRedoStack([]);
  };

  const handleUndo = () => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      const snapshot = prev[prev.length - 1];
      setRedoStack(r => [{ headers: [...editHeaders], rows: editRows.map(row => [...row]) }, ...r.slice(0, 49)]);
      setEditHeaders(snapshot.headers);
      setEditRows(snapshot.rows);
      setEditingCell(null);
      return prev.slice(0, -1);
    });
  };

  const handleRedo = () => {
    setRedoStack(prev => {
      if (prev.length === 0) return prev;
      const snapshot = prev[0];
      setUndoStack(u => [...u.slice(-49), { headers: [...editHeaders], rows: editRows.map(row => [...row]) }]);
      setEditHeaders(snapshot.headers);
      setEditRows(snapshot.rows);
      setEditingCell(null);
      return prev.slice(1);
    });
  };

  undoHandlerRef.current = handleUndo;
  redoHandlerRef.current = handleRedo;

  useEffect(() => {
    if (!isEditing) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undoHandlerRef.current(); }
      if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); redoHandlerRef.current(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isEditing]);

  const handleKeyDown = (e: React.KeyboardEvent, key: string) => {
    if (e.key === 'Escape') { pendingFocusRef.current = key; commitCurrent(key, cellDraft); return; }
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); navigate(key, cellDraft, 'down'); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); navigate(key, cellDraft, 'up'); return; }
    if (e.key === 'ArrowRight' && (e.target as HTMLInputElement).selectionStart === cellDraft.length) {
      e.preventDefault(); navigate(key, cellDraft, 'right'); return;
    }
    if (e.key === 'ArrowLeft' && (e.target as HTMLInputElement).selectionStart === 0) {
      e.preventDefault(); navigate(key, cellDraft, 'left'); return;
    }
    if (e.key === 'Tab') { e.preventDefault(); navigate(key, cellDraft, e.shiftKey ? 'left' : 'next'); }
  };

  // ── 행/열 조작 ────────────────────────────────────────────
  const addColumn = () => {
    pushHistory();
    setEditHeaders(prev => [...prev, `열 ${prev.length + 1}`]);
    setEditRows(prev => prev.map(row => [...row, '']));
  };

  const removeColumn = (ci: number) => {
    if (editHeaders.length <= 1) return;
    pushHistory();
    setEditHeaders(prev => prev.filter((_, i) => i !== ci));
    setEditRows(prev => prev.map(row => row.filter((_, i) => i !== ci)));
    setEditingCell(null);
  };

  const addRow = () => {
    pushHistory();
    setEditRows(prev => [...prev, Array(editHeaders.length).fill('')]);
  };

  const removeRow = (ri: number) => {
    pushHistory();
    setEditRows(prev => prev.filter((_, i) => i !== ri));
    setEditingCell(null);
  };

  // ── 피벗 헬퍼 ────────────────────────────────────────────
  const build2DPivot = (hdrs: string[], rws: string[][], cfg: TableConfig) => {
    const rowIdx = hdrs.indexOf(cfg.rowField || '');
    const colIdx = hdrs.indexOf(cfg.colField || '');
    const valIdx = hdrs.indexOf(cfg.valueField || '');
    if (rowIdx < 0 || colIdx < 0 || valIdx < 0) return null;
    const rowVals = [...new Set(rws.map(r => r[rowIdx]))].filter(Boolean);
    const colVals = [...new Set(rws.map(r => r[colIdx]))].filter(Boolean);
    // 값 배열 수집 후 집계 적용
    const multi: Record<string, Record<string, string[]>> = {};
    rws.forEach(r => {
      const rv = r[rowIdx], cv = r[colIdx], vv = r[valIdx];
      if (!rv || !cv) return;
      if (!multi[rv]) multi[rv] = {};
      if (!multi[rv][cv]) multi[rv][cv] = [];
      multi[rv][cv].push(vv);
    });
    const fn: AggFn = cfg.aggregation || 'first';
    const map: Record<string, Record<string, string>> = {};
    rowVals.forEach(rv => {
      map[rv] = {};
      colVals.forEach(cv => {
        map[rv][cv] = applyAgg(multi[rv]?.[cv] ?? [], fn);
      });
    });
    return { rowVals, colVals, map, rowField: cfg.rowField! };
  };

  const render2DTable = (
    rowVals: string[],
    colVals: string[],
    map: Record<string, Record<string, string>>,
    rowLabel: string,
    cfg?: TableConfig,
    colLabel?: string,
  ) => {
    const showColSum = cfg?.showColSummary;
    const showRowSum = cfg?.showRowSummary;
    const colSumFn: AggFn = cfg?.colSummaryFn || 'sum';
    const rowSumFn: AggFn = cfg?.rowSummaryFn || 'sum';

    // 열 방향 요약 (하단 행): 각 colVal에 대해 전체 rowVal 집계
    const colSummaryRow = showColSum
      ? colVals.map(cv => applyAgg(rowVals.map(rv => map[rv]?.[cv] ?? ''), colSumFn))
      : null;

    // 행 방향 요약 (우측 열): 각 rowVal에 대해 전체 colVal 집계
    const rowSummaryCol = showRowSum
      ? rowVals.map(rv => applyAgg(colVals.map(cv => map[rv]?.[cv] ?? ''), rowSumFn))
      : null;

    // 그랜드 토탈 (우하단 코너: 둘 다 켜진 경우)
    const grandTotal = showColSum && showRowSum
      ? applyAgg(rowVals.flatMap(rv => colVals.map(cv => map[rv]?.[cv] ?? '')), colSumFn)
      : null;

    const totalCols = colVals.length + 1 + (showRowSum ? 1 : 0);

    return (
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-xs md:text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="border-r border-gray-300 bg-gray-100 whitespace-nowrap">
                {colLabel ? (
                  <div className="relative min-w-[80px] min-h-[44px] px-2 py-1">
                    <span className="absolute top-1 right-1.5 text-[10px] font-semibold text-gray-500 leading-tight">{colLabel}</span>
                    <span className="absolute bottom-1 left-1.5 text-[10px] font-semibold text-gray-600 leading-tight">{rowLabel}</span>
                    <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" aria-hidden="true">
                      <line x1="0" y1="0" x2="100%" y2="100%" stroke="#d1d5db" strokeWidth="1" />
                    </svg>
                  </div>
                ) : (
                  <div className="px-3 py-2 text-left font-semibold text-gray-500">{rowLabel}</div>
                )}
              </th>
              {colVals.map((cv, i) => (
                <th key={i} className="px-3 py-2 text-center font-semibold text-gray-700 border-r border-gray-200 last:border-r-0 whitespace-nowrap">
                  {cv}
                </th>
              ))}
              {showRowSum && (
                <th className="px-3 py-2 text-center font-semibold text-blue-600 border-l border-gray-300 bg-blue-50/50 whitespace-nowrap">
                  {AGG_LABELS[rowSumFn]}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rowVals.length === 0 ? (
              <tr><td colSpan={totalCols} className="py-6 text-center text-xs text-muted-foreground">데이터가 없습니다</td></tr>
            ) : rowVals.map((rv, ri) => (
              <tr key={ri} className={cn('border-b border-gray-100 last:border-b-0', ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/50')}>
                <td className="px-3 py-1.5 border-r border-gray-300 font-medium text-gray-700 whitespace-nowrap bg-gray-50">{rv}</td>
                {colVals.map((cv, ci) => (
                  <td key={ci} className="px-3 py-1.5 border-r border-gray-100 last:border-r-0 text-gray-700 text-center">
                    {map[rv]?.[cv] || '—'}
                  </td>
                ))}
                {rowSummaryCol && (
                  <td className="px-3 py-1.5 border-l border-gray-300 text-blue-700 font-semibold text-center bg-blue-50/40">
                    {rowSummaryCol[ri]}
                  </td>
                )}
              </tr>
            ))}
            {colSummaryRow && (
              <tr className="border-t-2 border-gray-300 bg-blue-50/60 font-medium">
                <td className="px-3 py-1.5 border-r border-gray-300 text-[10px] text-blue-500 font-semibold bg-blue-50">
                  {AGG_LABELS[colSumFn]}
                </td>
                {colSummaryRow.map((val, ci) => (
                  <td key={ci} className="px-3 py-1.5 border-r border-gray-100 last:border-r-0 text-blue-700 text-center">
                    {val}
                  </td>
                ))}
                {grandTotal !== null && (
                  <td className="px-3 py-1.5 border-l border-gray-300 text-blue-800 font-bold text-center bg-blue-100/60">
                    {grandTotal}
                  </td>
                )}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  // ── 뷰어 렌더링 ───────────────────────────────────────────
  const renderViewer = (viewerCfg: ViewerConfig, hdrs: string[], rws: string[][]) => {
    if (viewerCfg.displayMode === 'card') {
      if (rws.length === 0) {
        return <p className="text-xs text-muted-foreground text-center py-6">데이터가 없습니다</p>;
      }

      const cardCfg = viewerCfg.cardConfig;
      const groupField = cardCfg?.groupField;
      const groupIdx = groupField ? hdrs.indexOf(groupField) : -1;

      // 표시할 필드 결정 (설정 없으면 전체)
      const ALL_CARD_AGGS: Array<{ value: CardAgg; label: string }> = [
        { value: 'raw', label: '전체' },
        { value: 'sum', label: '합' },
        { value: 'avg', label: '평균' },
        { value: 'count', label: '개수' },
        { value: 'min', label: '최솟값' },
        { value: 'max', label: '최댓값' },
      ];
      const fieldsToShow: CardFieldConfig[] =
        cardCfg?.fields && cardCfg.fields.length > 0
          ? cardCfg.fields
          : hdrs.map(h => ({ field: h, aggregations: ['raw' as CardAgg] }));

      const renderCardRow = (fc: CardFieldConfig, values: string[]) => {
        const aggs = fc.aggregations.length > 0 ? fc.aggregations : ['raw' as CardAgg];
        return (
          <div key={fc.field} className="flex items-start gap-2 text-xs">
            <span className="font-medium text-gray-500 shrink-0 min-w-[4rem] truncate">{fc.field}:</span>
            <div className="flex flex-wrap gap-1">
              {aggs.map(agg => {
                const display = agg === 'raw'
                  ? (values.filter(Boolean).join(', ') || '—')
                  : (applyAgg(values, agg) || '—');
                const aggLabel = aggs.length > 1
                  ? ALL_CARD_AGGS.find(a => a.value === agg)?.label
                  : undefined;
                return (
                  <span key={agg} className="text-gray-700">
                    {aggLabel && <span className="text-[10px] text-muted-foreground mr-0.5">[{aggLabel}]</span>}
                    {display}
                  </span>
                );
              })}
            </div>
          </div>
        );
      };

      if (!groupField || groupIdx < 0) {
        // 그룹화 없음: 행별 카드
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {rws.map((row, ri) => {
              const titleField = fieldsToShow[0]?.field;
              const titleIdx = titleField ? hdrs.indexOf(titleField) : 0;
              const title = row[titleIdx] || `항목 ${ri + 1}`;
              return (
                <div key={ri} className="border rounded-lg p-3 bg-white hover:bg-gray-50 transition-colors">
                  <div className="font-medium text-sm mb-2 text-gray-800 truncate">{title}</div>
                  {fieldsToShow.slice(1).map(fc => {
                    const fi = hdrs.indexOf(fc.field);
                    return fi >= 0 ? renderCardRow(fc, [row[fi]]) : null;
                  })}
                </div>
              );
            })}
          </div>
        );
      }

      // 그룹화: groupField 기준으로 카드 생성
      const groups = [...new Set(rws.map(r => r[groupIdx]))].filter(Boolean);
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {groups.map((g, gi) => {
            const groupRows = rws.filter(r => r[groupIdx] === g);
            return (
              <div key={gi} className="border rounded-lg p-3 bg-white hover:bg-gray-50 transition-colors">
                <div className="font-medium text-sm mb-2 text-gray-800 truncate">{g}</div>
                {fieldsToShow
                  .filter(fc => fc.field !== groupField)
                  .map(fc => {
                    const fi = hdrs.indexOf(fc.field);
                    if (fi < 0) return null;
                    const values = groupRows.map(r => r[fi]);
                    return renderCardRow(fc, values);
                  })}
              </div>
            );
          })}
        </div>
      );
    }

    // table — dimension 분기
    const cfg = viewerCfg.tableConfig || { dimension: '1d' };

    // 2차원 피벗
    if (cfg.dimension === '2d') {
      const pivot = build2DPivot(hdrs, rws, cfg);
      if (!pivot) {
        return <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-3">행 축, 열 축, 값 컬럼을 모두 설정해야 합니다.</p>;
      }
      return render2DTable(pivot.rowVals, pivot.colVals, pivot.map, pivot.rowField, cfg, cfg.colField);
    }

    // 3차원 (그룹별 2D 피벗)
    if (cfg.dimension === '3d') {
      const groupIdx = hdrs.indexOf(cfg.groupField || '');
      if (groupIdx < 0 || !cfg.rowField || !cfg.colField || !cfg.valueField) {
        return <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-3">그룹, 행 축, 열 축, 값 컬럼을 모두 설정해야 합니다.</p>;
      }
      const groups = [...new Set(rws.map(r => r[groupIdx]))].filter(Boolean);
      if (groups.length === 0) {
        return <p className="text-xs text-muted-foreground text-center py-6">데이터가 없습니다</p>;
      }
      return (
        <div className="space-y-4">
          {groups.map((g, gi) => {
            const groupRows = rws.filter(r => r[groupIdx] === g);
            const pivot = build2DPivot(hdrs, groupRows, cfg);
            if (!pivot) return null;
            return (
              <div key={gi}>
                <div className="text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
                  {cfg.groupField}: {g}
                </div>
                {render2DTable(pivot.rowVals, pivot.colVals, pivot.map, pivot.rowField, cfg, cfg.colField)}
              </div>
            );
          })}
        </div>
      );
    }

    // 1차원 (기본 flat table)
    const summaryFn: AggFn = cfg.summaryFn || 'sum';
    const summaryRow = cfg.showSummary && rws.length > 0
      ? hdrs.map((_, ci) => applyAgg(rws.map(r => r[ci] ?? ''), summaryFn))
      : null;

    return (
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-xs md:text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {hdrs.map((h, i) => (
                <th key={i} className="px-3 py-2 text-left font-semibold text-gray-700 border-r border-gray-200 last:border-r-0 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rws.length === 0 ? (
              <tr>
                <td colSpan={hdrs.length} className="py-6 text-center text-xs text-muted-foreground">
                  데이터가 없습니다
                </td>
              </tr>
            ) : (
              rws.map((row, ri) => (
                <tr key={ri} className={cn('border-b border-gray-100 last:border-b-0', ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/50')}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-1.5 border-r border-gray-100 last:border-r-0 text-gray-700">
                      {cell || '—'}
                    </td>
                  ))}
                </tr>
              ))
            )}
            {summaryRow && (
              <tr className="border-t-2 border-gray-300 bg-blue-50/60 font-medium">
                {summaryRow.map((val, ci) => (
                  <td key={ci} className="px-3 py-1.5 border-r border-gray-200 last:border-r-0 text-blue-700">
                    {ci === 0
                      ? <span className="text-[10px] text-blue-500 font-semibold">{AGG_LABELS[summaryFn]}</span>
                      : val}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  // ── 스프레드시트 편집 폼 ──────────────────────────────────
  const renderEditForm = () => {
  const currentViewer = editDraft.viewers[editViewerIdx] ?? editDraft.viewers[0];
  const setViewerPatch = (patch: Partial<ViewerConfig>) =>
    setEditDraft(prev => ({
      ...prev,
      viewers: prev.viewers.map((v, i) => i === editViewerIdx ? { ...v, ...patch } : v),
    }));
  return (
    <div className="space-y-4">
      {/* 제목 */}
      <div>
        <Label htmlFor="csv-title">제목</Label>
        <Input
          id="csv-title"
          value={editDraft.title}
          onChange={e => setEditDraft(prev => ({ ...prev, title: e.target.value }))}
          placeholder="데이터 제목"
          className="mt-1"
        />
      </div>

      {/* 스프레드시트 테이블 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label>데이터 입력</Label>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">
              {editHeaders.length}열 · {editRows.length}행
            </span>
            <button
              type="button"
              onClick={() => setIsSpreadsheetOpen(true)}
              className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 hover:underline"
              title="전체 화면으로 편집"
            >
              <Maximize2 className="w-3 h-3" />
              넓게 편집
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-blue-50 border-b border-gray-200">
                {/* 행번호 열 */}
                <th className="w-7 px-1 py-1.5 text-center text-[10px] text-muted-foreground border-r border-gray-200 font-normal">#</th>
                {editHeaders.map((h, ci) => {
                  const key = `h-${ci}`;
                  return (
                    <th key={ci} className="group px-0 py-0 border-r border-gray-200 last:border-r-0 min-w-[80px]">
                      <div className="flex items-center">
                        {editingCell === key ? (
                          <Input
                            autoFocus
                            value={cellDraft}
                            onChange={e => setCellDraft(e.target.value)}
                            onBlur={() => commitCurrent(key, cellDraft)}
                            onKeyDown={e => handleKeyDown(e, key)}
                            className="h-7 text-xs border-0 border-b-2 border-blue-500 rounded-none bg-white px-2 font-semibold focus-visible:ring-0"
                          />
                        ) : (
                          <div
                            ref={el => { if (el) cellRefs.current.set(key, el); else cellRefs.current.delete(key); }}
                            tabIndex={0}
                            className="flex-1 h-7 px-2 py-1 font-semibold text-gray-700 cursor-pointer hover:bg-blue-100/60 leading-5 outline-none focus:ring-2 focus:ring-inset focus:ring-blue-400/60 focus:bg-blue-50"
                            onClick={() => openCell(key, h)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { e.preventDefault(); openCell(key, h); }
                              else if (e.key === 'ArrowLeft') { e.preventDefault(); navigateFocusedCell(key, 'left'); }
                              else if (e.key === 'ArrowRight') { e.preventDefault(); navigateFocusedCell(key, 'right'); }
                              else if (e.key === 'ArrowUp') { e.preventDefault(); navigateFocusedCell(key, 'up'); }
                              else if (e.key === 'ArrowDown') { e.preventDefault(); navigateFocusedCell(key, 'down'); }
                            }}
                          >
                            <span className="inline-flex items-center gap-1">
                              <span className="truncate">{h || <span className="text-muted-foreground/40 font-normal">열 이름</span>}</span>
                              {editHeaders.length > 1 && (
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); removeColumn(ci); }}
                                  className="opacity-0 group-hover:opacity-100 hover:text-red-500 text-muted-foreground shrink-0 transition-opacity"
                                  title="열 삭제"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    </th>
                  );
                })}
                {/* 열 추가 버튼 */}
                <th className="w-8 border-l border-gray-200">
                  <button
                    type="button"
                    onClick={addColumn}
                    className="w-full h-7 flex items-center justify-center text-muted-foreground hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    title="열 추가"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {editRows.map((row, ri) => (
                <tr key={ri} className={cn('border-b border-gray-100 last:border-b-0 group', ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/30')}>
                  {/* 행번호 */}
                  <td className="px-1 py-0 text-center text-[10px] text-muted-foreground border-r border-gray-100 w-7">
                    <div className="flex items-center justify-center gap-0.5">
                      <span>{ri + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeRow(ri)}
                        className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity"
                        title="행 삭제"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </td>
                  {row.map((cell, ci) => {
                    const key = `r-${ri}-${ci}`;
                    return (
                      <td key={ci} className="px-0 py-0 border-r border-gray-100 last:border-r-0">
                        {editingCell === key ? (
                          <Input
                            autoFocus
                            value={cellDraft}
                            onChange={e => setCellDraft(e.target.value)}
                            onBlur={() => commitCurrent(key, cellDraft)}
                            onKeyDown={e => handleKeyDown(e, key)}
                            className="h-7 text-xs border-0 border-b-2 border-blue-400 rounded-none bg-white px-2 focus-visible:ring-0"
                          />
                        ) : (
                          <div
                            ref={el => { if (el) cellRefs.current.set(key, el); else cellRefs.current.delete(key); }}
                            tabIndex={0}
                            className="h-7 px-2 py-1 cursor-pointer hover:bg-blue-50/60 truncate leading-5 text-gray-700 outline-none focus:ring-2 focus:ring-inset focus:ring-blue-400/60 focus:bg-blue-50/80"
                            onClick={() => openCell(key, cell)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { e.preventDefault(); openCell(key, cell); }
                              else if (e.key === 'ArrowLeft') { e.preventDefault(); navigateFocusedCell(key, 'left'); }
                              else if (e.key === 'ArrowRight') { e.preventDefault(); navigateFocusedCell(key, 'right'); }
                              else if (e.key === 'ArrowUp') { e.preventDefault(); navigateFocusedCell(key, 'up'); }
                              else if (e.key === 'ArrowDown') { e.preventDefault(); navigateFocusedCell(key, 'down'); }
                            }}
                          >
                            {cell || <span className="text-muted-foreground/30">—</span>}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="w-8 border-l border-gray-100" />
                </tr>
              ))}

              {/* 행 추가 */}
              <tr>
                <td colSpan={editHeaders.length + 2} className="px-0 py-0">
                  <button
                    type="button"
                    onClick={addRow}
                    className="w-full h-7 flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-blue-600 hover:bg-blue-50/50 transition-colors border-dashed border-t border-gray-200"
                  >
                    <Plus className="w-3 h-3" />
                    행 추가
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 전체 화면 스프레드시트 편집 Dialog */}
      <Dialog open={isSpreadsheetOpen} onOpenChange={setIsSpreadsheetOpen}>
        <DialogContent className="max-w-[95vw] w-full max-h-[92vh] flex flex-col p-0">
          <DialogHeader className="px-5 pt-4 pb-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Maximize2 className="w-4 h-4 text-blue-500" />
              데이터 입력 — {editHeaders.length}열 · {editRows.length}행
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto p-4">
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-blue-50 border-b border-gray-200">
                    <th className="w-7 px-1 py-1.5 text-center text-[10px] text-muted-foreground border-r border-gray-200 font-normal">#</th>
                    {editHeaders.map((h, ci) => {
                      const key = `h-${ci}`;
                      return (
                        <th key={ci} className="group px-0 py-0 border-r border-gray-200 last:border-r-0 min-w-[100px]">
                          <div className="flex items-center">
                            {editingCell === key ? (
                              <Input
                                autoFocus
                                value={cellDraft}
                                onChange={e => setCellDraft(e.target.value)}
                                onBlur={() => commitCurrent(key, cellDraft)}
                                onKeyDown={e => handleKeyDown(e, key)}
                                className="h-8 text-xs border-0 border-b-2 border-blue-500 rounded-none bg-white px-2 font-semibold focus-visible:ring-0"
                              />
                            ) : (
                              <div
                                ref={el => { if (el) cellRefs.current.set(key, el); else cellRefs.current.delete(key); }}
                                tabIndex={0}
                                className="flex-1 h-8 px-2 py-1.5 font-semibold text-gray-700 cursor-pointer hover:bg-blue-100/60 leading-5 outline-none focus:ring-2 focus:ring-inset focus:ring-blue-400/60 focus:bg-blue-50"
                                onClick={() => openCell(key, h)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') { e.preventDefault(); openCell(key, h); }
                                  else if (e.key === 'ArrowLeft') { e.preventDefault(); navigateFocusedCell(key, 'left'); }
                                  else if (e.key === 'ArrowRight') { e.preventDefault(); navigateFocusedCell(key, 'right'); }
                                  else if (e.key === 'ArrowUp') { e.preventDefault(); navigateFocusedCell(key, 'up'); }
                                  else if (e.key === 'ArrowDown') { e.preventDefault(); navigateFocusedCell(key, 'down'); }
                                }}
                              >
                                <span className="inline-flex items-center gap-1">
                                  <span className="truncate">{h || <span className="text-muted-foreground/40 font-normal">열 이름</span>}</span>
                                  {editHeaders.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={e => { e.stopPropagation(); removeColumn(ci); }}
                                      className="opacity-0 group-hover:opacity-100 hover:text-red-500 text-muted-foreground shrink-0 transition-opacity"
                                      title="열 삭제"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </span>
                              </div>
                            )}
                          </div>
                        </th>
                      );
                    })}
                    <th className="w-8 border-l border-gray-200">
                      <button
                        type="button"
                        onClick={addColumn}
                        className="w-full h-8 flex items-center justify-center text-muted-foreground hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="열 추가"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {editRows.map((row, ri) => (
                    <tr key={ri} className={cn('border-b border-gray-100 last:border-b-0 group', ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/30')}>
                      <td className="px-1 py-0 text-center text-[10px] text-muted-foreground border-r border-gray-100 w-7">
                        <div className="flex items-center justify-center gap-0.5">
                          <span>{ri + 1}</span>
                          <button
                            type="button"
                            onClick={() => removeRow(ri)}
                            className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity"
                            title="행 삭제"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </td>
                      {row.map((cell, ci) => {
                        const key = `r-${ri}-${ci}`;
                        return (
                          <td key={ci} className="px-0 py-0 border-r border-gray-100 last:border-r-0">
                            {editingCell === key ? (
                              <Input
                                autoFocus
                                value={cellDraft}
                                onChange={e => setCellDraft(e.target.value)}
                                onBlur={() => commitCurrent(key, cellDraft)}
                                onKeyDown={e => handleKeyDown(e, key)}
                                className="h-8 text-xs border-0 border-b-2 border-blue-400 rounded-none bg-white px-2 focus-visible:ring-0"
                              />
                            ) : (
                              <div
                                ref={el => { if (el) cellRefs.current.set(key, el); else cellRefs.current.delete(key); }}
                                tabIndex={0}
                                className="h-8 px-2 py-1.5 cursor-pointer hover:bg-blue-50/60 truncate leading-5 text-gray-700 outline-none focus:ring-2 focus:ring-inset focus:ring-blue-400/60 focus:bg-blue-50/80"
                                onClick={() => openCell(key, cell)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') { e.preventDefault(); openCell(key, cell); }
                                  else if (e.key === 'ArrowLeft') { e.preventDefault(); navigateFocusedCell(key, 'left'); }
                                  else if (e.key === 'ArrowRight') { e.preventDefault(); navigateFocusedCell(key, 'right'); }
                                  else if (e.key === 'ArrowUp') { e.preventDefault(); navigateFocusedCell(key, 'up'); }
                                  else if (e.key === 'ArrowDown') { e.preventDefault(); navigateFocusedCell(key, 'down'); }
                                }}
                              >
                                {cell || <span className="text-muted-foreground/30">—</span>}
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td className="w-8 border-l border-gray-100" />
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={editHeaders.length + 2} className="px-0 py-0">
                      <button
                        type="button"
                        onClick={addRow}
                        className="w-full h-8 flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-blue-600 hover:bg-blue-50/50 transition-colors border-dashed border-t border-gray-200"
                      >
                        <Plus className="w-3 h-3" />
                        행 추가
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter className="px-5 py-3 border-t shrink-0 flex justify-end">
            <Button onClick={() => setIsSpreadsheetOpen(false)}>
              완료
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 표시 형식 + 미리보기 */}
      <div>
        <Label>표시 형식</Label>
        <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">
          일반 사용자에게 보여줄 형식을 선택합니다.
        </p>
        <div className="flex gap-2 mb-3">
          {DISPLAY_MODES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setViewerPatch({ displayMode: value })}
              className={cn(
                'flex-1 flex flex-col items-center gap-1.5 py-2.5 rounded-lg border text-xs transition-colors',
                currentViewer.displayMode === value
                  ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                  : 'border-gray-200 hover:border-gray-300 text-muted-foreground hover:text-gray-700'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* 뷰어 탭 관리 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">뷰어 목록</Label>
            <button
              type="button"
              onClick={() => {
                const newViewer: ViewerConfig = {
                  id: Date.now().toString(),
                  title: `뷰어 ${editDraft.viewers.length + 1}`,
                  displayMode: 'table',
                };
                setEditDraft(prev => ({ ...prev, viewers: [...prev.viewers, newViewer] }));
                setEditViewerIdx(editDraft.viewers.length);
              }}
              className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700"
            >
              <Plus className="w-3 h-3" />
              뷰어 추가
            </button>
          </div>
          <div className="flex gap-1 flex-wrap">
            {editDraft.viewers.map((v, i) => (
              <div key={v.id} className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setEditViewerIdx(i)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs border transition-colors',
                    i === editViewerIdx
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                      : 'border-gray-200 text-muted-foreground hover:border-gray-300'
                  )}
                >
                  {v.title}
                </button>
                {editDraft.viewers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditDraft(prev => ({ ...prev, viewers: prev.viewers.filter((_, j) => j !== i) }));
                      setEditViewerIdx(prev => Math.max(0, prev >= i ? prev - 1 : prev));
                    }}
                    className="text-muted-foreground hover:text-red-500 transition-colors p-0.5"
                    title="뷰어 삭제"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {/* 현재 뷰어 제목 */}
          <Input
            value={currentViewer?.title || ''}
            onChange={e => setViewerPatch({ title: e.target.value })}
            placeholder="뷰어 이름"
            className="h-7 text-xs"
          />
        </div>

        {/* 카드 설정 (카드 모드일 때만) */}
        {currentViewer.displayMode === 'card' && (() => {
          const cardCfg = currentViewer.cardConfig || {};
          const setCardConfig = (patch: Partial<CardConfig>) =>
            setViewerPatch({ cardConfig: { ...(currentViewer.cardConfig || {}), ...patch } });
          const fieldOptions = editHeaders.filter(h => h.trim());
          const currentFields: CardFieldConfig[] =
            cardCfg.fields && cardCfg.fields.length > 0
              ? cardCfg.fields
              : fieldOptions.map(f => ({ field: f, aggregations: ['raw' as CardAgg] }));

          const isFieldIncluded = (f: string) =>
            !cardCfg.fields || cardCfg.fields.length === 0 || cardCfg.fields.some(fc => fc.field === f);

          const toggleFieldInclude = (field: string, include: boolean) => {
            if (include) {
              const newFields = fieldOptions
                .filter(f => isFieldIncluded(f) || f === field)
                .map(f => currentFields.find(fc => fc.field === f) || { field: f, aggregations: ['raw' as CardAgg] });
              setCardConfig({ fields: newFields });
            } else {
              setCardConfig({ fields: currentFields.filter(fc => fc.field !== field) });
            }
          };

          const toggleAgg = (field: string, agg: CardAgg) => {
            const fc = currentFields.find(f => f.field === field) || { field, aggregations: ['raw' as CardAgg] };
            const has = fc.aggregations.includes(agg);
            const newAggs = has ? fc.aggregations.filter(a => a !== agg) : [...fc.aggregations, agg];
            if (newAggs.length === 0) return; // 최소 하나는 선택 유지
            setCardConfig({
              fields: currentFields.map(f => f.field === field ? { ...f, aggregations: newAggs } : f),
            });
          };

          const ALL_CARD_AGGS: Array<{ value: CardAgg; label: string }> = [
            { value: 'raw', label: '전체' },
            { value: 'sum', label: '합' },
            { value: 'avg', label: '평균' },
            { value: 'count', label: '개수' },
            { value: 'min', label: '최솟값' },
            { value: 'max', label: '최댓값' },
          ];

          return (
            <div className="mt-3 space-y-3 border-t pt-3">
              {/* 카드 기준 컬럼 */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">카드 기준 컬럼</Label>
                <p className="text-[11px] text-muted-foreground">이 컬럼의 값 하나당 카드 하나로 묶습니다.</p>
                <Select
                  value={cardCfg.groupField || '__none__'}
                  onValueChange={v => setCardConfig({ groupField: v === '__none__' ? undefined : v })}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">그룹화 없음 (행별 카드)</SelectItem>
                    {fieldOptions.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* 표시 필드 설정 */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">표시 필드 설정</Label>
                {fieldOptions.map(field => {
                  const isGroup = field === cardCfg.groupField;
                  const included = isFieldIncluded(field);
                  const fc = currentFields.find(f => f.field === field) || { field, aggregations: ['raw' as CardAgg] };
                  return (
                    <div key={field} className={cn('rounded-lg border p-2.5 space-y-2', isGroup ? 'bg-blue-50/40 border-blue-200' : 'bg-gray-50/40')}>
                      <div className="flex items-center gap-2">
                        {!isGroup && (
                          <input
                            type="checkbox"
                            checked={included}
                            onChange={e => toggleFieldInclude(field, e.target.checked)}
                            className="w-3.5 h-3.5 accent-blue-500"
                          />
                        )}
                        <span className={cn('text-xs font-medium', isGroup ? 'text-blue-600' : 'text-gray-700')}>
                          {field}
                          {isGroup && <span className="ml-1.5 text-[10px] font-normal text-blue-400">(카드 제목)</span>}
                        </span>
                      </div>
                      {!isGroup && included && (
                        <div className="flex flex-wrap gap-1.5 ml-5">
                          {ALL_CARD_AGGS.map(({ value, label }) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => toggleAgg(field, value)}
                              className={cn(
                                'px-2 py-0.5 rounded-full border text-[10px] transition-colors',
                                fc.aggregations.includes(value)
                                  ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                                  : 'border-gray-200 text-muted-foreground hover:border-gray-300'
                              )}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* 표 차원 설정 (표 모드일 때만) */}
        {currentViewer.displayMode === 'table' && (() => {
          const dim = currentViewer.tableConfig?.dimension || '1d';
          const setTableConfig = (patch: Partial<TableConfig>) =>
            setViewerPatch({ tableConfig: { ...(currentViewer.tableConfig || { dimension: '1d' }), ...patch } });
          const fieldOptions = editHeaders.filter(h => h.trim());

          return (
            <div className="mt-3 space-y-3 border-t pt-3">
              <div>
                <Label className="text-xs font-medium">표 차원</Label>
                <div className="flex gap-2 mt-1.5">
                  {(['1d', '2d', '3d'] as const).map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setTableConfig({ dimension: d })}
                      className={cn(
                        'flex-1 py-1.5 rounded-lg border text-xs transition-colors',
                        dim === d
                          ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                          : 'border-gray-200 hover:border-gray-300 text-muted-foreground'
                      )}
                    >
                      {d === '1d' ? '1차원' : d === '2d' ? '2차원' : '3차원'}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {dim === '1d' && '각 행이 하나의 레코드로 표시됩니다.'}
                  {dim === '2d' && '행·열 두 축으로 교차 집계 표를 만듭니다.'}
                  {dim === '3d' && '그룹별로 분리된 2차원 교차 표를 만듭니다.'}
                </p>
              </div>

              {(dim === '2d' || dim === '3d') && (
                <div className={cn('grid gap-2', dim === '3d' ? 'grid-cols-2' : 'grid-cols-3')}>
                  {dim === '3d' && (
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">그룹 기준 컬럼</Label>
                      <Select
                        value={currentViewer.tableConfig?.groupField || ''}
                        onValueChange={v => setTableConfig({ groupField: v })}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="선택" /></SelectTrigger>
                        <SelectContent>
                          {fieldOptions.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {([
                    { key: 'rowField' as const, label: '행 축 컬럼' },
                    { key: 'colField' as const, label: '열 축 컬럼' },
                    { key: 'valueField' as const, label: '값 컬럼' },
                  ]).map(({ key, label }) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-xs">{label}</Label>
                      <Select
                        value={currentViewer.tableConfig?.[key] || ''}
                        onValueChange={v => setTableConfig({ [key]: v })}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="선택" /></SelectTrigger>
                        <SelectContent>
                          {fieldOptions.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}

              {/* 2D/3D 집계 방식 */}
              {(dim === '2d' || dim === '3d') && (
                <div className="space-y-1">
                  <Label className="text-xs">셀 집계 방식</Label>
                  <Select
                    value={currentViewer.tableConfig?.aggregation || 'first'}
                    onValueChange={v => setTableConfig({ aggregation: v as AggFn })}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.entries(AGG_LABELS) as [AggFn, string][]).map(([v, label]) => (
                        <SelectItem key={v} value={v}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">같은 행·열 조합의 값이 여러 개일 때 처리 방식</p>
                </div>
              )}

              {/* 2D 요약 설정 */}
              {dim === '2d' && (
                <div className="space-y-3 border-t pt-3">
                  <Label className="text-xs font-medium text-gray-600">요약 설정</Label>

                  {/* 열 방향 요약 행 (하단) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-xs">열 방향 요약 행 (하단)</Label>
                        <p className="text-[11px] text-muted-foreground">각 열의 전체 집계를 표 하단에 표시</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTableConfig({ showColSummary: !currentViewer.tableConfig?.showColSummary })}
                        className={cn(
                          'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors',
                          currentViewer.tableConfig?.showColSummary ? 'bg-blue-500' : 'bg-gray-200'
                        )}
                      >
                        <span className={cn(
                          'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform',
                          currentViewer.tableConfig?.showColSummary ? 'translate-x-4' : 'translate-x-0'
                        )} />
                      </button>
                    </div>
                    {currentViewer.tableConfig?.showColSummary && (
                      <Select
                        value={currentViewer.tableConfig?.colSummaryFn || 'sum'}
                        onValueChange={v => setTableConfig({ colSummaryFn: v as AggFn })}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.entries(AGG_LABELS) as [AggFn, string][]).map(([v, label]) => (
                            <SelectItem key={v} value={v}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* 행 방향 요약 열 (우측) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-xs">행 방향 요약 열 (우측)</Label>
                        <p className="text-[11px] text-muted-foreground">각 행의 전체 집계를 표 우측에 표시</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTableConfig({ showRowSummary: !currentViewer.tableConfig?.showRowSummary })}
                        className={cn(
                          'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors',
                          currentViewer.tableConfig?.showRowSummary ? 'bg-blue-500' : 'bg-gray-200'
                        )}
                      >
                        <span className={cn(
                          'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform',
                          currentViewer.tableConfig?.showRowSummary ? 'translate-x-4' : 'translate-x-0'
                        )} />
                      </button>
                    </div>
                    {currentViewer.tableConfig?.showRowSummary && (
                      <Select
                        value={currentViewer.tableConfig?.rowSummaryFn || 'sum'}
                        onValueChange={v => setTableConfig({ rowSummaryFn: v as AggFn })}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.entries(AGG_LABELS) as [AggFn, string][]).map(([v, label]) => (
                            <SelectItem key={v} value={v}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              )}

              {/* 1D 요약 행 */}
              {dim === '1d' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">요약 행 표시</Label>
                    <button
                      type="button"
                      onClick={() => setTableConfig({ showSummary: !currentViewer.tableConfig?.showSummary })}
                      className={cn(
                        'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors',
                        currentViewer.tableConfig?.showSummary ? 'bg-blue-500' : 'bg-gray-200'
                      )}
                    >
                      <span className={cn(
                        'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform',
                        currentViewer.tableConfig?.showSummary ? 'translate-x-4' : 'translate-x-0'
                      )} />
                    </button>
                  </div>
                  {currentViewer.tableConfig?.showSummary && (
                    <div className="space-y-1">
                      <Label className="text-xs">요약 방식</Label>
                      <Select
                        value={currentViewer.tableConfig?.summaryFn || 'sum'}
                        onValueChange={v => setTableConfig({ summaryFn: v as AggFn })}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.entries(AGG_LABELS) as [AggFn, string][]).map(([v, label]) => (
                            <SelectItem key={v} value={v}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* 실시간 미리보기 */}
        {(editHeaders.some(h => h.trim()) || editRows.some(r => r.some(c => c.trim()))) && (
          <div className="border rounded-lg bg-gray-50 p-3 mt-3">
            <p className="text-[11px] text-muted-foreground font-medium mb-2">미리보기</p>
            <div className="bg-white rounded-md overflow-hidden">
              {renderViewer(currentViewer, editHeaders, editRows)}
            </div>
          </div>
        )}
      </div>

      {/* 권한 설정 */}
      <div className="space-y-2 border-t pt-3">
        <Label className="text-xs text-muted-foreground font-medium flex items-center gap-1">
          <Lock className="w-3 h-3" /> 권한 설정
        </Label>
        <div className="space-y-1">
          <Label className="text-xs">데이터 수정 권한</Label>
          <Select
            value={editDraft.settings?.editPermission || 'creator_only'}
            onValueChange={v =>
              setEditDraft(prev => ({
                ...prev,
                settings: { ...prev.settings, editPermission: v as 'all' | 'creator_only' },
              }))
            }
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <span className="flex items-center gap-1"><Users className="w-3 h-3" />모두 수정 가능</span>
              </SelectItem>
              <SelectItem value="creator_only">
                <span className="flex items-center gap-1"><Lock className="w-3 h-3" />생성자만 수정</span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          onClick={saveEdit}
          disabled={!editDraft.title.trim() || editHeaders.every(h => !h.trim())}
        >
          저장
        </Button>
        <Button variant="outline" onClick={() => setIsEditing(false)}>
          취소
        </Button>
      </div>
    </div>
  );
  };

  // ── 초기 상태 (데이터 없음) ──────────────────────────────
  if (!hasData) {
    if (!canEdit) return null;
    return (
      <>
        <Card className="w-full">
          <CardContent className="py-6 px-3 md:px-6 text-center">
            <FileSpreadsheet className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-xs md:text-sm text-muted-foreground mb-3">
              아직 CSV 데이터가 없습니다
            </p>
            <Button
              onClick={() => { openEdit(); setIsOpen(true); }}
              size="sm"
              className="h-8 text-xs md:h-9 md:text-sm"
            >
              데이터 입력
            </Button>
          </CardContent>
        </Card>

        <Dialog open={isOpen} onOpenChange={open => { setIsOpen(open); if (!open) setIsEditing(false); }}>
          <DialogContent className="max-w-3xl w-full max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{editDraft.title || '새 CSV 데이터'}</span>
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-auto">
              {renderEditForm()}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // ── 컴팩트 카드 ───────────────────────────────────────────
  const safeActiveIdx = Math.min(activeViewerIdx, data.viewers.length - 1);
  const activeViewer = data.viewers[safeActiveIdx] || data.viewers[0];
  const modeLabel = data.viewers.length === 1
    ? (DISPLAY_MODES.find(m => m.value === activeViewer?.displayMode)?.label || '표')
    : `${data.viewers.length}개 뷰어`;

  return (
    <>
      <Card className="w-full cursor-pointer hover:shadow-sm transition-shadow" onClick={() => setIsOpen(true)}>
        <CardContent className="py-3 px-3 md:px-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FileSpreadsheet className="w-4 h-4 shrink-0 text-emerald-600" />
              <span className="text-sm font-medium truncate">{data.title}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{rows.length}행</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] text-muted-foreground">{modeLabel}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[10px]"
                onClick={e => { e.stopPropagation(); setIsOpen(true); }}
              >
                <Eye className="w-3 h-3 mr-1" />
                열기
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 메인 Dialog ── */}
      <Dialog open={isOpen} onOpenChange={open => { setIsOpen(open); if (!open) setIsEditing(false); }}>
        <DialogContent className="max-w-3xl w-full max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2 pr-2">
              <span className="flex items-center gap-2 text-base min-w-0">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="truncate">
                  {isEditing ? (editDraft.title || '편집 중...') : data.title}
                </span>
              </span>
              {!isEditing && canEdit && (
                <Button variant="ghost" size="sm" onClick={openEdit} className="h-7 px-2 text-xs shrink-0">
                  <Edit2 className="w-3 h-3 mr-1" />
                  편집
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-auto">
            {isEditing ? (
              renderEditForm()
            ) : (
              <>
                <div className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5">
                  <span className="font-medium">{rows.length}행</span>
                  <span>·</span>
                  <span>{headers.length}열</span>
                </div>
                {/* 뷰어 탭 (여러 개일 때만) */}
                {data.viewers.length > 1 && (
                  <div className="flex gap-1 mb-3 flex-wrap border-b pb-2">
                    {data.viewers.map((v, i) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setActiveViewerIdx(i)}
                        className={cn(
                          'px-3 py-1 rounded-full text-xs border transition-colors',
                          i === safeActiveIdx
                            ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                            : 'border-gray-200 text-muted-foreground hover:border-gray-300'
                        )}
                      >
                        {v.title}
                      </button>
                    ))}
                  </div>
                )}
                {activeViewer && renderViewer(activeViewer, headers, rows)}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
