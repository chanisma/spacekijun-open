/**
 * 관리자 «에이전트(MCP)» 탭 — 선생님이 자기 에이전트(Claude 등)로 SPACEKIJUN 도구를 쓰는 연결을 관리한다.
 *
 * 2026-10-24 개편: 위쪽 탭 넷으로 나눴다.
 *   연결 안내 — 서버 주소·연결 방법·OAuth 서버 상태·지금 누가 쓰는가
 *   도구 설명 — 기능별로 허용과 도구(에이전트가 받는 설명 그대로 — mcpToolDocs.generated.ts)
 *   권한 배정 — 교사 기본(mcp_tool_policy) + 사람별 추가(mcp_tool_grant)·해제(mcp_tool_block)
 *   연결한 사람 — 동의(인증)한 사람 · 에이전트 · 마지막 사용(RPC admin_mcp_connections, 2026-10-25)
 *   호출 기록 — 학생 정보를 읽거나 무언가를 바꾼 호출(mcp_call_log)
 * 여기서 켠 것이 곧 권한이다 — 각 MCP RPC 가 DB 판정(mcp_private.my_grants)으로 다시 확인한다.
 * 그래도 **웹에서 그 사람이 못 하는 일은 켜도 못 한다**(사용자 본인 토큰이라 RLS 가 그대로 걸린다).
 */
import { useState } from 'react';
import { BookOpen, History, Link2, ShieldCheck, Users } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { readStoredString, writeStoredString } from '@/lib/safeLocalStorage';
import { McpConnectTab } from './mcp/McpConnectTab';
import { McpToolGuideTab } from './mcp/McpToolGuideTab';
import { McpGrantTab } from './mcp/McpGrantTab';
import { McpCallLogTab } from './mcp/McpCallLogTab';
import { McpConnectionsTab } from './mcp/McpConnectionsTab';

const TABS = [
  { key: 'connect', label: '연결 안내', icon: Link2 },
  { key: 'guide', label: '도구 설명', icon: BookOpen },
  { key: 'grants', label: '권한 배정', icon: ShieldCheck },
  { key: 'people', label: '연결한 사람', icon: Users },
  { key: 'log', label: '호출 기록', icon: History },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const STORAGE_KEY = 'admin.mcp.tab';
const isTab = (v: string | null): v is TabKey => TABS.some((t) => t.key === v);

export function McpAgentManagement() {
  const [tab, setTab] = useState<TabKey>(() => {
    const stored = readStoredString(STORAGE_KEY);
    return isTab(stored) ? stored : 'connect';
  });
  const change = (v: string) => {
    if (!isTab(v)) return;
    setTab(v);
    writeStoredString(STORAGE_KEY, v);
  };

  return (
    <section aria-label="에이전트(MCP) 연결 관리" className="space-y-4">
      <Tabs value={tab} onValueChange={change}>
        <div className="overflow-x-auto">
          <TabsList className="h-auto rounded-xl bg-slate-100 p-1">
            {TABS.map(({ key, label, icon: Icon }) => (
              <TabsTrigger key={key} value={key} className="min-h-[40px] gap-1.5 rounded-lg px-3 text-sm">
                <Icon className="h-4 w-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="connect" className="mt-4"><McpConnectTab onOpenTab={change} /></TabsContent>
        <TabsContent value="guide" className="mt-4"><McpToolGuideTab /></TabsContent>
        <TabsContent value="grants" className="mt-4"><McpGrantTab /></TabsContent>
        <TabsContent value="people" className="mt-4"><McpConnectionsTab /></TabsContent>
        <TabsContent value="log" className="mt-4"><McpCallLogTab /></TabsContent>
      </Tabs>
    </section>
  );
}
