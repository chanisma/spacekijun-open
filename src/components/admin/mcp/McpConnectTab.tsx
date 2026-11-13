/**
 * «연결 안내» — 서버 주소 · 연결 방법 · OAuth 서버 상태 · 지금 누가 무엇을 쓰는가(요약).
 */
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Bot, CheckCircle2, Copy, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MCP_FEATURES, MCP_TOOL_GRANTS, mcpServerUrl } from '@/lib/mcpTools';
import { MCP_TOOL_DOCS } from '@/lib/mcpToolDocs.generated';
import { supabaseProject } from '@/services/oauthConsentService';
import { toast } from '@/lib/toast';
import { useMcpGrantData } from './useMcpGrantData';

const SERVER_URL = mcpServerUrl(supabaseProject.supabaseUrl);
const DISCOVERY_URL = `${supabaseProject.supabaseUrl.replace(/\/$/, '')}/.well-known/oauth-authorization-server/auth/v1`;

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('복사했습니다.');
  } catch {
    toast.error('복사하지 못했습니다. 직접 선택해 복사해 주세요.');
  }
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      {label && <p className="text-xs font-medium text-slate-500">{label}</p>}
      <div className="flex min-w-0 items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-100 px-2.5 py-2 text-xs" title={value}>{value}</code>
        <Button variant="outline" size="sm" className="h-9 shrink-0 text-xs" onClick={() => copy(value)}>
          <Copy className="mr-1 h-3.5 w-3.5" />복사
        </Button>
      </div>
    </div>
  );
}

export function McpConnectTab({ onOpenTab }: { onOpenTab: (tab: string) => void }) {
  // OAuth 2.1 서버가 꺼져 있으면 에이전트가 인가 서버를 못 찾아 연결 자체가 시작되지 않는다.
  const oauthServer = useQuery({
    queryKey: ['oauth-server-status'],
    queryFn: async () => (await fetch(DISCOVERY_URL)).ok,
    retry: false,
    staleTime: 60_000,
  });
  const data = useMcpGrantData();
  const teachers = data.people.filter((p) => p.type === 'teacher');
  const offByDefault = MCP_TOOL_GRANTS.filter((g) => !data.teacherDefaults.has(g.key));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-4">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Bot className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-2 text-sm text-slate-700">
              <p>
                선생님이 자기 에이전트(Claude 등)를 SPACEKIJUN 에 연결하면, 에이전트가 <b>그 선생님 본인의 권한</b>으로 일정·업무·공지 같은
                기능을 대신 다룹니다. 웹에서 그 선생님이 못 하는 일은 에이전트도 못 합니다(도구마다 서버가 다시 확인합니다).
              </p>
              <p className="text-xs text-slate-500">
                학생 정보가 담긴 도구(우리 반·학생 데이터·학생 메모)는 학생을 학반 번호로 다루고 호출이 기록되지만, 내용은 외부 AI 로 나갑니다 —
                학교 기준을 확인해 주세요.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-800">연결 방법</p>
          <CopyRow label="MCP 서버 주소" value={SERVER_URL} />
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
            <li><b>Claude 웹·데스크톱</b> — 설정 → 커넥터 → 사용자 지정 커넥터 추가에 위 주소를 넣습니다.</li>
            <li>
              <b>Claude Code</b> — 터미널에서 아래 명령을 실행합니다.
              <div className="mt-1.5"><CopyRow label="" value={`claude mcp add --transport http spacekijun ${SERVER_URL}`} /></div>
            </li>
            <li>처음 연결할 때 SPACEKIJUN 동의 화면이 열립니다. 학교 구글 계정으로 로그인해 허용하면 끝입니다.</li>
            <li>연결을 끊으려면 각자 <code className="rounded bg-slate-100 px-1">/oauth/consent</code> 화면에서 해제합니다.</li>
          </ol>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="mb-2 text-sm font-semibold text-slate-800">연결 서버 상태</p>
          {oauthServer.isLoading ? (
            <p className="text-sm text-slate-500">확인하는 중…</p>
          ) : oauthServer.data ? (
            <p className="flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />OAuth 2.1 서버가 켜져 있습니다.</p>
          ) : (
            <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <p className="flex items-center gap-1.5 font-medium"><AlertTriangle className="h-4 w-4" />아직 아무도 연결할 수 없습니다.</p>
              <p>Supabase 대시보드 Authentication → OAuth Server 에서 켜고, Authorization Path 를 <code>/oauth/consent</code>, 동적 클라이언트 등록을 켜 주세요.</p>
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><ShieldCheck className="h-4 w-4 text-blue-600" />지금 배정</p>
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-slate-50 px-2 py-2"><dt className="text-xs text-slate-500">기능</dt><dd className="text-lg font-semibold text-slate-800">{MCP_FEATURES.length}</dd></div>
            <div className="rounded-lg bg-slate-50 px-2 py-2"><dt className="text-xs text-slate-500">허용</dt><dd className="text-lg font-semibold text-slate-800">{MCP_TOOL_GRANTS.length}</dd></div>
            <div className="rounded-lg bg-slate-50 px-2 py-2"><dt className="text-xs text-slate-500">도구</dt><dd className="text-lg font-semibold text-slate-800">{MCP_TOOL_DOCS.length}</dd></div>
          </dl>
          {data.isLoading ? (
            <p className="text-sm text-slate-500">불러오는 중…</p>
          ) : data.isError ? (
            <p className="text-xs text-rose-600">{data.error instanceof Error ? data.error.message : '불러오지 못했습니다.'}</p>
          ) : (
            <ul className="space-y-1.5 text-sm text-slate-700">
              <li>교사 <b>{teachers.length}명</b>은 기본 허용 {data.teacherDefaults.size}개를 받습니다(계정이 연결된 교사).</li>
              {offByDefault.length > 0 && (
                <li className="text-xs text-slate-500">기본에서 빠진 것 — {offByDefault.map((g) => g.label).join(' · ')} (필요한 사람에게만 따로 켭니다)</li>
              )}
              <li className="text-xs text-slate-500">직원은 기본 허용을 받지 않습니다 — 사람별로 켭니다.</li>
            </ul>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => onOpenTab('grants')}>권한 배정 열기</Button>
            <Button size="sm" variant="outline" onClick={() => onOpenTab('people')}>연결한 사람 보기</Button>
            <Button size="sm" variant="outline" onClick={() => onOpenTab('guide')}>도구 설명 보기</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
