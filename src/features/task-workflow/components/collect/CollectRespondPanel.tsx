// ========================================
// 입력 받기 — 응답자 화면(개별 입력·공개 표 공용)
// 개별 입력 = 서버가 내 줄만 준다. 공개 표 = 모두의 줄이 오고 내 줄만 고칠 수 있다.
// ========================================

import { useEffect, useMemo, useRef } from 'react';
import { CheckCircle2, Lock, Loader2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import {
  buildCollectTable,
  COLLECT_MODE_LABEL,
  type CollectBoard,
  type CollectRow,
  type CollectValues,
} from '@/lib/collectInput';
import { useSubmitCollectResponse } from '../../hooks/useCollectInput';
import { CollectBoardTable } from './CollectBoardTable';

export function CollectRespondPanel({ board, updatedAt }: { board: CollectBoard; updatedAt: number }) {
  // 개별 입력은 내 줄만 — 서버는 대상자에게 내 줄만 주지만 **매니저 겸 대상자**에게는 전원을 준다
  // (현황 표용). 입력 화면에서는 같은 규칙으로 보이도록 여기서 거른다.
  const table = useMemo(() => {
    const full = buildCollectTable(board);
    const privateMode = (board.request?.visibility ?? full.config.mode) === 'private';
    return privateMode ? { ...full, rows: full.rows.filter((r) => r.mine) } : full;
  }, [board]);
  const submit = useSubmitCollectResponse();
  const open = board.request?.status === 'open';

  // 칸마다 마지막으로 보낸 값 — 같은 칸의 두 항목을 연달아 바꿔도 앞의 값을 잃지 않게.
  // 서버 값이 새로 오면 비운다(공개 표에서 남이 고친 값을 덮어쓰지 않게).
  const latest = useRef(new Map<string, CollectValues>());
  useEffect(() => latest.current.clear(), [updatedAt]);

  // 내 진행은 «칸»으로 센다 — 내 할 일 「요청」 칩(«n/m칸»)과 같은 단위(2026-10-06; 종전 «내 줄 x/y»와 어긋났다)
  const myRows = table.rows.filter((r) => r.mine);
  const myCells = myRows.flatMap((r) => r.cells);
  const myCellsDone = myCells.filter((c) => c.complete).length;
  const allDone = myCells.length > 0 && myCellsDone === myCells.length;
  // 공개 표에서 내 줄을 먼저 — 남의 줄 뒤에 묻혀 휴대폰에서 끝까지 내려가야 했다
  const ordered = useMemo(
    () => ({ ...table, rows: [...table.rows.filter((r) => r.mine), ...table.rows.filter((r) => !r.mine)] }),
    [table],
  );

  const commit = (row: CollectRow, dimensionKey: string, fieldKey: string, value: string) => {
    const key = `${row.unitKey}\u0000${dimensionKey}`;
    const cell = row.cells.find((c) => c.dimensionKey === dimensionKey);
    const next: CollectValues = { ...(latest.current.get(key) ?? cell?.values ?? {}) };
    if (value) next[fieldKey] = value;
    else delete next[fieldKey];
    latest.current.set(key, next);
    submit.mutate(
      { actionId: board.action.id, unitKey: row.unitKey, dimensionKey, values: next },
      { onError: (e: Error) => toast.error(`저장하지 못했습니다: ${e.message}`) },
    );
  };

  const config = table.config;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600">{COLLECT_MODE_LABEL[config.mode].respondent}</span>
        {myCells.length > 0 && (
          <span className={allDone ? 'inline-flex items-center gap-1 text-emerald-700' : 'tabular-nums text-slate-600'}>
            {allDone && <CheckCircle2 className="h-3.5 w-3.5" />}
            입력 {myCellsDone}/{myCells.length}칸
          </span>
        )}
        {submit.isPending ? (
          <span className="inline-flex items-center gap-1 text-slate-400">
            <Loader2 className="h-3 w-3 animate-spin" />저장 중
          </span>
        ) : submit.isSuccess ? (
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <CheckCircle2 className="h-3 w-3" />저장됨{!allDone && ` · 남은 칸 ${myCells.length - myCellsDone}`}
          </span>
        ) : null}
        {!open && (
          <span className="inline-flex items-center gap-1 text-slate-500">
            <Lock className="h-3.5 w-3.5" />마감되어 더 고칠 수 없습니다
          </span>
        )}
      </div>

      {/* 끝났다는 순간을 준다 — 제출 버튼이 없는 화면이라 «다 했나?»를 찾게 된다(2026-10-06) */}
      {open && allDone && (
        <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />모두 입력했습니다 — 닫아도 됩니다. 마감 전까지는 다시 열어 고칠 수 있습니다.
        </p>
      )}

      {config.guide && (
        <p className="whitespace-pre-wrap rounded-lg bg-blue-50/60 px-3 py-2 text-xs leading-relaxed text-slate-700">{config.guide}</p>
      )}

      <CollectBoardTable
        table={ordered}
        canEditRow={(row) => open && row.mine}
        onCommit={commit}
        mobileCards
        emptyText="이 요청에서 내가 채울 줄이 없습니다."
      />
      <p className="text-[11px] text-slate-400">
        고르는 항목은 누르는 즉시, 글·숫자는 칸을 벗어나면 저장됩니다.
        {config.fields.some((f) => f.required) && ' * 표시 항목을 채우면 그 칸이 완료됩니다.'}
      </p>
    </div>
  );
}
