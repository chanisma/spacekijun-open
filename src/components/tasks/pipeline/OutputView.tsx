// 산출물 하나를 그린다 — 업무 진행 화면의 «앞 단계에서 넘어온 것»·«이 할 일이 남긴 것» 공용.
// 판정·정규화는 src/lib/workPipeline.ts. 여기는 그리기만 한다.

import { ExternalLink, FileText, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  isSafeLink,
  numericColumnTotals,
  outputHasContent,
  type ResolvedOutputBody,
} from '@/lib/workPipeline';

const MAX_TABLE_ROWS = 30;

export function OutputBodyView({ body, compact = false }: { body: ResolvedOutputBody; compact?: boolean }) {
  if (!outputHasContent(body)) {
    return <p className="text-xs text-slate-400">아직 남긴 것이 없습니다.</p>;
  }
  switch (body.kind) {
    case 'signal':
      return <p className="text-xs text-emerald-700">완료</p>;
    case 'value':
      return (
        <p className={cn('whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700', compact && 'line-clamp-4')}>
          {body.text}
        </p>
      );
    case 'people':
      return (
        <div className="flex flex-wrap gap-1">
          {body.people.map((p) => (
            <span
              key={p.resourceId ?? p.name}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]',
                p.resourceId ? 'border-slate-200 bg-white text-slate-700' : 'border-amber-200 bg-amber-50 text-amber-700',
              )}
              title={p.resourceId ? undefined : '계정이 연결되지 않아 받는 사람으로 넘길 수 없습니다'}
            >
              <Users className="h-3 w-3" />
              {p.name}
            </span>
          ))}
        </div>
      );
    case 'table': {
      const rows = body.rows.slice(0, compact ? 8 : MAX_TABLE_ROWS);
      const totals = numericColumnTotals(body);
      return (
        <div className="space-y-1">
          {/* 표는 자기 컨테이너에서만 가로로 밀린다(CLAUDE.md §6) */}
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-max text-[11px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {body.columns.map((c) => (
                    <th key={c.key} className="whitespace-nowrap px-2 py-1 text-left font-medium">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-t border-slate-100">
                    {body.columns.map((c) => (
                      <td key={c.key} className="max-w-[16rem] truncate px-2 py-1 text-slate-700" title={r.cells[c.key]}>
                        {r.cells[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-400">
            {body.rows.length}줄{body.rows.length > rows.length ? ` 중 ${rows.length}줄 표시` : ''}
            {totals.length > 0 && ` · 합계 ${totals.map((t) => `${t.label} ${t.total.toLocaleString()}`).join(' · ')}`}
          </p>
        </div>
      );
    }
    case 'spec_document':
      return (
        <div className="space-y-1">
          <p className="flex items-center gap-1 text-xs font-medium text-slate-700">
            <FileText className="h-3.5 w-3.5 text-indigo-500" />
            <span className="truncate" title={body.title}>{body.title}</span>
          </p>
          <dl className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[11px]">
            {body.fields.slice(0, compact ? 6 : 40).map((f) => (
              <div key={f.key} className="contents">
                <dt className="truncate text-slate-400" title={f.key}>{f.key}</dt>
                <dd className="truncate text-slate-700" title={f.value}>{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      );
    case 'file':
      return (
        <ul className="space-y-0.5">
          {body.files.map((f) => (
            <li key={f.url} className="min-w-0">
              {isSafeLink(f.url) ? (
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 items-center gap-1 text-xs text-blue-700 hover:underline"
                  title={`${f.name}\n${f.url}`}
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  <span className="truncate">{f.name}</span>
                </a>
              ) : (
                // 제출 RPC 가 주소 형식을 검사하지 않는다 — javascript: 같은 주소는 링크로 만들지 않는다
                <span className="block truncate text-xs text-slate-500" title="열 수 없는 주소">{f.name}</span>
              )}
            </li>
          ))}
        </ul>
      );
  }
}
