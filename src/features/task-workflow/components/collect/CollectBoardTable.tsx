// ========================================
// 입력 받기 표 — 매니저 현황·공개 표·내 입력 모두 이 표 하나로 그린다.
// 행 = 대상 단위(사람 / 과목 / 학급), 열 = 구분 × 입력 항목.
// 모델 = src/lib/collectInput.ts buildCollectTable (여기서 판정하지 않는다)
// ========================================

import { Fragment } from 'react';
import { cn } from '@/lib/utils';
import {
  collectRowProgress,
  formatCollectValue,
  type CollectRow,
  type CollectTable,
} from '@/lib/collectInput';
import { CollectFieldInput } from './CollectFieldInput';

interface Props {
  table: CollectTable;
  /** 이 줄을 이 화면에서 고칠 수 있는가 */
  canEditRow?: (row: CollectRow) => boolean;
  onCommit?: (row: CollectRow, dimensionKey: string, fieldKey: string, value: string) => void;
  /** 포함 이유를 보인다(매니저) */
  showReasons?: boolean;
  /** 빈 표 문구 */
  emptyText?: string;
  /**
   * 휴대폰(<640px)에서는 표 대신 줄마다 카드로 — 응답자 화면용. 좁은 폭에서 입력칸이 든 표는
   * 이름이 한 글자씩 꺾이고 예/아니오가 쪼개진다(2026-09-23 390px 스크린샷에서 확인).
   */
  mobileCards?: boolean;
}

export function CollectBoardTable({ table, canEditRow, onCommit, showReasons, emptyText, mobileCards }: Props) {
  const { config, dimensions, rows } = table;
  const hasUnit = config.axis !== 'person';
  const hasDims = dimensions.some((d) => d.key !== '');
  const fields = config.fields;

  if (rows.length === 0) {
    return <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-slate-400">{emptyText ?? '표시할 줄이 없습니다.'}</p>;
  }

  return (
    <>
    {mobileCards && (
      <div className="space-y-2 sm:hidden">
        {rows.map((row) => (
          <RowCard key={row.key} row={row} table={table} editable={Boolean(canEditRow?.(row)) && !row.removed} onCommit={onCommit} />
        ))}
      </div>
    )}
    <div className={cn('overflow-x-auto rounded-xl border bg-card', mobileCards && 'hidden sm:block')}>
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>
            {hasUnit && <th rowSpan={hasDims ? 2 : 1} className="border-b px-3 py-2 text-left font-medium">{config.axis === 'class' ? '학급' : config.axis === 'club' ? '동아리' : config.axis === 'club_member' ? '동아리 · 부원' : '과목'}</th>}
            <th rowSpan={hasDims ? 2 : 1} className="border-b px-3 py-2 text-left font-medium">대상</th>
            {hasDims
              ? dimensions.map((d) => (
                  <th key={d.key} colSpan={fields.length} className="border-b border-l px-3 py-2 text-center font-semibold text-slate-600">
                    {d.label}
                  </th>
                ))
              : fields.map((f) => (
                  <th key={f.key} className="border-b border-l px-3 py-2 text-left font-medium">
                    {f.label}{f.required && <span className="ml-0.5 text-rose-500">*</span>}
                  </th>
                ))}
          </tr>
          {hasDims && (
            <tr>
              {dimensions.map((d) =>
                fields.map((f, fi) => (
                  <th key={`${d.key}-${f.key}`} className={cn('border-b px-3 py-1.5 text-left font-medium', fi === 0 && 'border-l')}>
                    {f.label}{f.required && <span className="ml-0.5 text-rose-500">*</span>}
                  </th>
                )),
              )}
            </tr>
          )}
        </thead>
        <tbody>
          {rows.map((row) => {
            const editable = Boolean(canEditRow?.(row)) && !row.removed;
            return (
              <tr key={row.key} className={cn('border-b last:border-b-0', row.removed && 'opacity-50', row.mine && 'bg-blue-50/30')}>
                {hasUnit && (
                  <td className="whitespace-nowrap px-3 py-2 align-top font-medium text-slate-700">{row.unitLabel}</td>
                )}
                <td className="px-3 py-2 align-top">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="whitespace-nowrap text-slate-700">{row.people.map((p) => p.name).join(', ')}</span>
                    {row.removed && <Tag tone="muted">명단 밖</Tag>}
                    {row.unlinked && <Tag tone="danger">미연결</Tag>}
                    {!row.removed && !row.unlinked && (() => {
                      const progress = collectRowProgress(row);
                      return <Tag tone={progress.tone}>{progress.label}</Tag>;
                    })()}
                  </div>
                  {showReasons && (() => {
                    // 단위 칸이 이미 말한 이유(«1학년 공통수학2 수업»)는 줄마다 되풀이하지 않는다
                    const reasons = [...new Set(row.people.flatMap((p) => p.reasons))]
                      .filter((reason) => !(row.unitLabel && reason.startsWith(row.unitLabel)));
                    return reasons.length > 0 && (
                      <div className="mt-0.5 text-[10px] text-slate-500">{reasons.join(' · ')}</div>
                    );
                  })()}
                </td>
                {row.cells.map((cell) => (
                  <Fragment key={cell.dimensionKey}>
                    {fields.map((f, fi) => (
                      <td
                        key={f.key}
                        className={cn(
                          'px-3 py-2 align-top',
                          fi === 0 && 'border-l',
                          !row.removed && !row.unlinked && (cell.complete ? 'bg-emerald-50/50' : ''),
                        )}
                      >
                        {editable ? (
                          <CollectFieldInput
                            field={f}
                            value={cell.values[f.key]}
                            onCommit={(v) => onCommit?.(row, cell.dimensionKey, f.key, v)}
                          />
                        ) : (
                          <span className={cn('text-slate-700', !cell.values[f.key] && 'text-slate-300')}>
                            {formatCollectValue(f, cell.values[f.key]) || '—'}
                          </span>
                        )}
                        {fi === 0 && config.answerMode === 'shared' && cell.responderName && (
                          <div className="mt-0.5 text-[10px] text-slate-400">입력 {cell.responderName}</div>
                        )}
                      </td>
                    ))}
                  </Fragment>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}

function RowCard({ row, table, editable, onCommit }: {
  row: CollectRow;
  table: CollectTable;
  editable: boolean;
  onCommit?: Props['onCommit'];
}) {
  const { config, dimensions } = table;
  const hasDims = dimensions.some((d) => d.key !== '');
  return (
    <div className={cn('rounded-xl border bg-card p-3', row.mine && 'border-blue-200', row.removed && 'opacity-50')}>
      <div className="flex flex-wrap items-center gap-1.5">
        {row.unitLabel && <span className="text-sm font-semibold text-slate-800">{row.unitLabel}</span>}
        <span className="text-xs text-slate-500">{row.people.map((p) => p.name).join(', ')}</span>
        {!row.removed && !row.unlinked && (() => {
          const progress = collectRowProgress(row);
          return <Tag tone={progress.tone}>{progress.label}</Tag>;
        })()}
      </div>
      <div className="mt-2 space-y-2">
        {row.cells.map((cell, i) => (
          <div key={cell.dimensionKey} className={cn('rounded-lg p-2', cell.complete ? 'bg-emerald-50/60' : 'bg-slate-50')}>
            {hasDims && <div className="mb-1.5 text-xs font-semibold text-slate-600">{dimensions[i].label}</div>}
            <div className="space-y-2">
              {config.fields.map((f) => (
                <div key={f.key} className="flex flex-col gap-1">
                  <span className="text-[11px] text-slate-500">{f.label}{f.required && <span className="ml-0.5 text-rose-500">*</span>}</span>
                  {editable ? (
                    <CollectFieldInput field={f} value={cell.values[f.key]} onCommit={(v) => onCommit?.(row, cell.dimensionKey, f.key, v)} />
                  ) : (
                    <span className="text-sm text-slate-700">{formatCollectValue(f, cell.values[f.key]) || '—'}</span>
                  )}
                </div>
              ))}
            </div>
            {config.answerMode === 'shared' && cell.responderName && (
              <div className="mt-1 text-[10px] text-slate-400">입력 {cell.responderName}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Tag({ tone, children }: { tone: 'done' | 'partial' | 'todo' | 'danger' | 'muted'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium',
        tone === 'done' && 'bg-emerald-100 text-emerald-700',
        tone === 'partial' && 'bg-blue-100 text-blue-700',
        tone === 'todo' && 'bg-slate-100 text-slate-500',
        tone === 'danger' && 'bg-rose-100 text-rose-700',
        tone === 'muted' && 'bg-slate-100 text-slate-400',
      )}
    >
      {children}
    </span>
  );
}
