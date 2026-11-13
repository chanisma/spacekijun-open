/**
 * 관리자 «AI 기록»(2026-10-15 사용자 요청) — 탐구 설계를 비롯한 AI 기능의 호출·오류를 기능별로 본다.
 *
 * 위: 기능별 요약(호출 수 · 문제 호출 · 요청 실패 · 화면 오류 · 응답 시간). 행을 누르면 아래 목록이 그 기능으로 좁혀진다.
 * 아래: 기록 한 줄씩(최신순). 기본은 «문제만» — 성공 호출까지 보면 실패가 묻힌다.
 *
 * ⚠️ 프롬프트·응답 본문은 기록에 없다(개인정보). 그래서 «무엇을 물었나»는 여기서 볼 수 없고, 볼 수 있는 것은
 *    언제 · 누가 · 어느 모델로 · 얼마나 걸려 · 어떻게 끝났나 · 토큰 수뿐이다. 화면이 그 사실을 말한다.
 */
import { useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, Loader2, RefreshCw, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Stat, statCard } from './statParts';
import {
  type AiLogFeedRow, type AiLogSummaryRow, type PeriodKey,
  LEVEL_LABEL, OUTCOME_META, PERIODS, actionLabel, callProblemRate, durationLabel, featureLabel, percentLabel,
  problemCalls, problemTotal, sortSummary, tokenLabel, totals,
} from './aiLogCatalog';

const PAGE = 100;
const ROLE_LABEL: Record<string, string> = { student: '학생', teacher: '교사', staff: '직원', admin: '관리자' };

type RpcResult = { data: unknown; error: { message: string } | null };
// 새 RPC 라 생성된 타입에 없다. `supabase.rpc` 를 변수로 떼어 내면 `this` 가 끊기므로 호출 자리에서 부른다
const rpc = (fn: string, args: Record<string, unknown>): Promise<RpcResult> =>
  supabase.rpc(fn as never, args as never) as unknown as Promise<RpcResult>;

function sinceOf(period: PeriodKey): string {
  const ms = PERIODS.find((p) => p.key === period)?.ms ?? PERIODS[1].ms;
  // 분 단위로 내려 쿼리 키가 렌더마다 바뀌지 않게 한다
  return new Date(Math.floor((Date.now() - ms) / 60_000) * 60_000).toISOString();
}

function timeLabel(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function AiLogManagement() {
  const [period, setPeriod] = useState<PeriodKey>('7d');
  const [feature, setFeature] = useState<string | null>(null);
  const [problemsOnly, setProblemsOnly] = useState(true);
  const since = useMemo(() => sinceOf(period), [period]);

  const summary = useQuery({
    queryKey: ['admin-ai-log-summary', since],
    queryFn: async () => {
      const { data, error } = await rpc('admin_ai_log_summary', { p_since: since });
      if (error) throw new Error(error.message);
      return sortSummary((data ?? []) as AiLogSummaryRow[]);
    },
  });

  const feed = useInfiniteQuery({
    queryKey: ['admin-ai-log-feed', since, feature, problemsOnly],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await rpc('admin_ai_log_feed', {
        p_feature: feature, p_since: since, p_problems_only: problemsOnly, p_limit: PAGE, p_before: pageParam,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as AiLogFeedRow[];
    },
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1].created_at : null),
  });

  const rows = summary.data ?? [];
  const t = totals(rows);
  const items = feed.data?.pages.flat() ?? [];
  const refreshing = summary.isFetching || feed.isFetching;

  return (
    <section aria-label="AI 기록" className="space-y-4" data-ai-log-admin>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-slate-100 bg-slate-100/50 p-1" role="group" aria-label="기간">
          {PERIODS.map((p) => (
            <button key={p.key} type="button" onClick={() => setPeriod(p.key)} aria-pressed={period === p.key}
              className={cn('h-8 rounded-md px-3 text-xs', period === p.key ? 'bg-white font-semibold text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
              최근 {p.label}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => { void summary.refetch(); void feed.refetch(); }} disabled={refreshing}>
          <RefreshCw className={cn('mr-1 h-4 w-4', refreshing && 'animate-spin')} />새로 읽기
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        엣지 함수가 AI(OpenAI·Upstage)를 부를 때마다 한 줄씩 남습니다(2026-10-15부터). 질문과 답의 본문은 개인정보라 남기지 않아,
        여기서는 언제·누가·어느 모델로·얼마나 걸려·어떻게 끝났는지만 볼 수 있습니다. 기록은 90일 보관합니다.
      </p>

      {summary.isError && <p role="alert" className="text-sm text-rose-700">{(summary.error as Error).message}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat title="AI 호출" value={t.calls.toLocaleString()} sub={`기능 ${rows.length}개`} />
        <Stat title="문제 호출" value={t.problemCalls.toLocaleString()} sub={`실패·빈 응답·잘림 · ${percentLabel(t.calls ? t.problemCalls / t.calls : null)}`} />
        <Stat title="요청 실패" value={t.requestFailures.toLocaleString()} sub="AI를 부르기 전후로 요청 전체가 실패" />
        <Stat title="화면 오류" value={t.clientErrors.toLocaleString()} sub="브라우저가 알아챈 실패(응답 해석 등)" />
      </div>

      <div className={cn(statCard, 'p-0')}>
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <h3 className="text-sm font-semibold">기능별</h3>
          <span className="text-xs text-muted-foreground">행을 누르면 아래 기록이 그 기능으로 좁혀집니다</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="whitespace-nowrap bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">기능</th>
                <th className="px-3 py-2 text-right font-medium">호출</th>
                <th className="px-3 py-2 text-right font-medium">문제 호출</th>
                <th className="px-3 py-2 text-right font-medium">요청 실패</th>
                <th className="px-3 py-2 text-right font-medium">화면 오류</th>
                <th className="px-3 py-2 text-right font-medium">사람</th>
                <th className="px-3 py-2 text-right font-medium" title="성공한 호출의 중앙값 / 상위 10%">응답 시간</th>
                <th className="px-3 py-2 text-right font-medium" title="입력 / 출력 토큰">토큰</th>
                <th className="px-3 py-2 text-left font-medium">마지막 문제</th>
              </tr>
            </thead>
            <tbody>
              {summary.isPending && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" />집계하는 중…</td></tr>
              )}
              {!summary.isPending && rows.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">이 기간에 남은 AI 기록이 없습니다.</td></tr>
              )}
              {rows.map((r) => {
                const rate = callProblemRate(r);
                const selected = feature === r.feature;
                return (
                  <tr key={r.feature} data-ai-feature={r.feature} aria-selected={selected}
                    onClick={() => setFeature(selected ? null : r.feature)}
                    className={cn('cursor-pointer border-t hover:bg-slate-50', selected && 'bg-blue-50/60 hover:bg-blue-50')}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{featureLabel(r.feature)}</div>
                      <div className="text-[11px] text-slate-500">{r.feature}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.calls.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <span className={cn(problemCalls(r) > 0 && 'font-semibold text-rose-700')}>{problemCalls(r)}</span>
                      <span className="ml-1 text-xs text-muted-foreground">{percentLabel(rate)}</span>
                      {problemCalls(r) > 0 && (
                        <div className="text-[11px] text-muted-foreground">
                          {[r.error_calls && `실패 ${r.error_calls}`, r.empty_calls && `빈 ${r.empty_calls}`, r.truncated_calls && `잘림 ${r.truncated_calls}`].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </td>
                    <td className={cn('px-3 py-2 text-right tabular-nums', r.request_failures > 0 && 'font-semibold text-rose-700')}>{r.request_failures}</td>
                    <td className={cn('px-3 py-2 text-right tabular-nums', r.client_errors > 0 && 'font-semibold text-rose-700')}>{r.client_errors}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.users}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs">{durationLabel(r.p50_ms)} / {durationLabel(r.p90_ms)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs">{tokenLabel(r.prompt_tokens)} / {tokenLabel(r.completion_tokens)}</td>
                    <td className="max-w-[18rem] px-3 py-2">
                      {problemTotal(r) > 0 ? (
                        <>
                          <div className="text-xs text-slate-500">{timeLabel(r.last_problem_at)}</div>
                          <div className="truncate text-xs text-rose-700" title={r.last_problem_message ?? ''}>{r.last_problem_message ?? '—'}</div>
                        </>
                      ) : <span className="text-xs text-muted-foreground">없음</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className={cn(statCard, 'p-0')}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">기록</h3>
            {feature ? (
              <button type="button" onClick={() => setFeature(null)}
                className="inline-flex min-w-0 items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700 ring-1 ring-inset ring-blue-200">
                <span className="truncate">{featureLabel(feature)}</span><X className="h-3 w-3 shrink-0" aria-label="기능 거르기 해제" />
              </button>
            ) : <span className="text-xs text-muted-foreground">모든 기능</span>}
          </div>
          <div className="inline-flex rounded-lg border border-slate-100 bg-slate-100/50 p-1" role="group" aria-label="보기">
            {([[true, '문제만'], [false, '전체']] as const).map(([value, label]) => (
              <button key={label} type="button" onClick={() => setProblemsOnly(value)} aria-pressed={problemsOnly === value}
                className={cn('h-7 rounded-md px-3 text-xs', problemsOnly === value ? 'bg-white font-semibold text-slate-800 shadow-sm' : 'text-slate-500')}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {feed.isError && <p role="alert" className="px-4 py-3 text-sm text-rose-700">{(feed.error as Error).message}</p>}
        {feed.isPending && <p className="px-4 py-6 text-center text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" />불러오는 중…</p>}
        {!feed.isPending && items.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {problemsOnly ? '이 기간에 문제 기록이 없습니다.' : '이 기간에 기록이 없습니다.'}
          </p>
        )}
        <ul className="divide-y">
          {items.map((row) => <FeedItem key={`${row.source}-${row.id}`} row={row} showFeature={!feature} />)}
        </ul>
        {feed.hasNextPage && (
          <div className="border-t p-3 text-center">
            <Button variant="ghost" size="sm" onClick={() => void feed.fetchNextPage()} disabled={feed.isFetchingNextPage}>
              {feed.isFetchingNextPage ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ChevronDown className="mr-1 h-4 w-4" />}더 오래된 기록
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function FeedItem({ row, showFeature }: { row: AiLogFeedRow; showFeature: boolean }) {
  const [open, setOpen] = useState(false);
  const meta = OUTCOME_META[row.outcome] ?? OUTCOME_META.error;
  const problem = row.level !== 'call' || row.outcome !== 'success';
  const tokens = row.prompt_tokens !== null || row.completion_tokens !== null
    ? `${tokenLabel(row.prompt_tokens)} → ${tokenLabel(row.completion_tokens)}${row.reasoning_tokens ? ` (추론 ${tokenLabel(row.reasoning_tokens)})` : ''}`
    : null;
  const who = row.user_name ? `${row.user_name}${row.user_role ? ` · ${ROLE_LABEL[row.user_role] ?? row.user_role}` : ''}` : null;
  const details: [string, string | null][] = [
    ['함수', row.fn], ['동작', row.action], ['화면', row.app_path], ['공급자', row.provider], ['모델', row.model],
    ['HTTP', row.http_status === null ? null : String(row.http_status)], ['종료 사유', row.finish_reason],
    ['학생', row.student_id],
    ['부가 정보', row.detail && Object.keys(row.detail).length ? JSON.stringify(row.detail) : null],
  ];

  return (
    <li data-ai-log-row={row.outcome} className="px-4 py-2.5">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full min-w-0 text-left">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="tabular-nums text-slate-500">{timeLabel(row.created_at)}</span>
          <span className={cn('rounded px-1.5 py-0.5 font-medium ring-1 ring-inset', meta.tone)} title={meta.hint}>{meta.label}</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600" title="호출 = AI를 한 번 부름 · 요청 = 요청 전체 실패 · 화면 = 브라우저가 알아챈 실패">{LEVEL_LABEL[row.level] ?? row.level}</span>
          {showFeature && <span className="font-medium text-slate-700">{featureLabel(row.feature)}</span>}
          <span className="min-w-0 truncate text-slate-700">{actionLabel(row)}</span>
          {row.model && <span className="text-slate-500">{row.model}</span>}
          {row.duration_ms !== null && <span className="tabular-nums text-slate-500">{durationLabel(row.duration_ms)}</span>}
          {tokens && <span className="tabular-nums text-slate-500">{tokens}</span>}
          {who && <span className="text-slate-500">{who}</span>}
          <ChevronDown className={cn('ml-auto h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform', open && 'rotate-180')} />
        </div>
        {problem && row.message && (
          <p className="mt-1 flex min-w-0 items-start gap-1 break-all text-xs text-rose-700">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{row.message}
          </p>
        )}
      </button>
      {open && (
        <dl className="mt-2 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-md bg-slate-50 p-2.5 text-xs">
          {details.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-slate-500">{k}</dt>
              <dd className="break-all text-slate-700">{v}</dd>
            </div>
          ))}
          {!problem && row.message && (<><dt className="text-slate-500">메시지</dt><dd className="break-all">{row.message}</dd></>)}
        </dl>
      )}
    </li>
  );
}
