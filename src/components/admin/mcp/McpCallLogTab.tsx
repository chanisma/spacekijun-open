/**
 * «호출 기록» — 학생 정보를 읽거나 무언가를 바꾼 에이전트 호출(표 mcp_call_log, 읽기 = 관리자). 최근 100건.
 * 이름표는 도구 설명(mcpToolDocs.generated)의 제목을 쓰고, 요약(describeCall)은 기록 detail 의 알려진 키만 풀어 쓴다.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { MCP_TOOL_DOCS } from '@/lib/mcpToolDocs.generated';

interface CallLogRow {
  id: number;
  tool: string;
  detail: Record<string, unknown>;
  at: string;
  resource: { name: string } | null;
}

const TITLE = new Map(MCP_TOOL_DOCS.map((t) => [t.name, t.title]));
// 기록 이름이 도구 이름과 다른 것(read_data 는 학생 데이터셋만 기록된다)
const TOOL_LABEL: Record<string, string> = { read_data: '학생 데이터 읽기' };
const label = (tool: string) => TOOL_LABEL[tool] ?? TITLE.get(tool) ?? tool;

const KIND_LABEL: Record<string, string> = {
  schedule: '학사일정', event: '출장', duty: '업무', training: '연수', personal: '개인일정',
  approval: '결재', signature: '전자서명',
};

/** 기록 한 줄의 요약 — 학년·반·번호·날짜, 할 일 상태. 모르는 키는 그대로 보인다. */
function describeCall(row: Pick<CallLogRow, 'tool' | 'detail'>): string {
  const d = row.detail ?? {};
  if (row.tool.startsWith('homeroom_')) {
    const parts = [`${d.grade}학년 ${d.class}반`];
    if (d.number) parts.push(`${d.number}번`);
    if (d.date) parts.push(String(d.date));
    else if (d.day) parts.push(`${'월화수목금토일'[Number(d.day) - 1] ?? d.day}요일`);
    if (d.count !== undefined) parts.push(`${d.count}명`);
    return parts.join(' · ');
  }
  if (row.tool === 'set_my_task_status') {
    const what = d.status === 'completed' ? '완료' : '되돌리기';
    return [what, d.deadline && `${d.deadline} 회차`, d.unit_key && '단위'].filter(Boolean).join(' · ');
  }
  if (row.tool === 'create_schedule') return `${KIND_LABEL[String(d.kind)] ?? d.kind} · 참석자 ${d.attendees ?? 0}명 · 알림 ${d.notified ?? 0}명`;
  if (row.tool === 'update_schedule') return `${KIND_LABEL[String(d.kind)] ?? d.kind} · ${Array.isArray(d.changed) ? d.changed.join('·') : ''}`;
  if (row.tool === 'delete_schedule') return `${KIND_LABEL[String(d.kind)] ?? d.kind} · ${d.title ?? ''}`;
  if (row.tool === 'submit_purchase_request') return `품목 ${d.items ?? '?'}개`;
  if (row.tool === 'list_managed_purchase_requests') return `${d.status === 'all' ? '전부' : '처리 대기'} · 품목 ${d.items ?? 0}개`;
  if (row.tool === 'cancel_my_purchase_item') return d.request_deleted ? '마지막 품목 — 신청 삭제' : '품목 하나';
  if (row.tool === 'update_my_purchase_item') return '품목 하나';
  if (row.tool === 'create_purchase_page') return String(d.title ?? '');
  if (row.tool === 'create_notice') return `${d.department ?? ''} · ${Number(d.targets) > 0 ? `대상 ${d.targets}명` : '전체 교직원'}`;
  if (row.tool === 'delete_notice' || row.tool === 'delete_code_project') return String(d.title ?? '');
  if (row.tool === 'reject_sign_request' || row.tool === 'cancel_sign_request') return KIND_LABEL[String(d.kind)] ?? String(d.kind ?? '');
  if (row.tool === 'create_code_project') return `${d.visibility === 'school' ? '학교 전체' : d.visibility === 'link' ? '링크' : '나만'} · 파일 ${d.files ?? '?'}개`;
  if (row.tool === 'update_code_project') return Array.isArray(d.changed) ? d.changed.join('·') : '';
  return JSON.stringify(d);
}

export function McpCallLogTab() {
  const [query, setQuery] = useState('');
  const log = useQuery({
    queryKey: ['mcp-call-log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mcp_call_log' as never)
        .select('id, tool, detail, at, resource:resource_id(name)')
        .order('at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as CallLogRow[];
    },
  });

  const rows = useMemo(() => {
    const q = query.trim();
    return (log.data ?? []).filter((r) => !q || (r.resource?.name ?? '').includes(q) || label(r.tool).includes(q) || r.tool.includes(q));
  }, [log.data, query]);

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">최근 호출 기록</p>
          <p className="text-xs text-slate-500">학생 정보를 읽은 호출과 무언가를 바꾼 호출이 남습니다(최근 100건). 일정 조회처럼 학생 정보가 없는 읽기는 남기지 않습니다.</p>
        </div>
        <div className="relative sm:w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="이름·도구로 거르기" className="h-10 pl-9 text-base sm:text-sm" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <tbody className="divide-y">
            {log.isLoading ? (
              <tr><td className="py-6 text-center text-slate-500"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
            ) : log.isError ? (
              <tr><td className="py-4 text-center text-xs text-rose-600">{log.error instanceof Error ? log.error.message : '불러오지 못했습니다.'}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="py-6 text-center text-sm text-slate-500">{query ? '맞는 기록이 없습니다.' : '아직 기록이 없습니다.'}</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{new Date(row.at).toLocaleString('ko-KR')}</td>
                <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-800">{row.resource?.name ?? '(알 수 없음)'}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-700">{label(row.tool)}</td>
                <td className="min-w-0 px-3 py-2 text-xs text-slate-500">{describeCall(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
