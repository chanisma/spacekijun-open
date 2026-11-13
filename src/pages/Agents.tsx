/**
 * 웹 «에이전트»(/agents) — 모바일 앱 «에이전트» 탭을 일반 웹에(2026-11-11 «모바일 앱의 에이전트 기능을 일반 웹에도 적용»).
 * 내 PC 데스크의 에이전트 대화 방(목록 · 대화 · 보내기) + 받은 작업 요청(«에이전트에게 맡기기», via 'web').
 * 방 묶기·보내기·요청 RPC 는 모바일과 한 벌 — src/mobile/data/agents.ts · agentRequests.ts, 화면 부품도 src/mobile/components 를 같이 쓴다.
 * 보낸 기기는 휴대폰과 같은 phoneDevice()(이 브라우저의 표시) — 서버는 'phone:<id>' 로 적는다.
 * 방은 ?room=, 알림에서 온 요청은 ?request= (notificationNavigation 'agent_request').
 */
import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bot, Loader2 } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { PageContainer } from '@/components/layout/PageContainer';
import { AGENTS_QUERY_KEY, agentOverview, buildRooms } from '@/mobile/data/agents';
import { ChatMessages, RoomFooter, RoomSections, RoomSubtitle } from '@/mobile/components/AgentChat';
import { AgentRequestSection } from '@/mobile/components/AgentRequests';

export default function AgentsPage() {
  const { data, isLoading, error } = useQuery({ queryKey: AGENTS_QUERY_KEY, queryFn: agentOverview, refetchInterval: 5000 });
  const [params, setParams] = useSearchParams();
  const rooms = useMemo(() => (data ? buildRooms(data) : []), [data]);
  const openKey = params.get('room');
  const focusId = params.get('request');
  // 고른 방이 없으면 첫 열린 방(없으면 첫 방)을 보인다 — 주소는 고를 때만 바꾼다
  const room = (openKey ? rooms.find((item) => item.key === openKey) : undefined)
    ?? (!openKey ? rooms.find((item) => item.state === 'live') ?? rooms[0] : undefined);
  const open = (key: string) => {
    const next = new URLSearchParams(params);
    next.set('room', key);
    setParams(next, { replace: true });
  };

  // 주소의 방이 사라졌으면(7일 정리) room 을 비운다 — 첫 열린 방이 대신 보인다
  useEffect(() => {
    if (openKey && data && !rooms.some((item) => item.key === openKey)) {
      const next = new URLSearchParams(params);
      next.delete('room');
      setParams(next, { replace: true });
    }
  }, [openKey, data, rooms, params, setParams]);

  return (
    <Layout>
      <PageContainer>
        {isLoading ? (
          <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />내 PC 를 찾는 중…
          </div>
        ) : error ? (
          <p className="rounded-2xl bg-white p-5 text-center text-sm text-rose-600 shadow-sm">{(error as Error).message}</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_380px]">
            <aside className="space-y-4 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto">
              <RoomSections overview={data} rooms={rooms} onOpen={open} activeKey={room?.key ?? null} />
            </aside>

            <section className="flex h-[calc(100vh-9rem)] min-h-[28rem] flex-col overflow-hidden rounded-2xl border bg-slate-100">
              {room ? (
                <>
                  <header className="border-b bg-white px-4 py-2.5">
                    <div className="truncate font-semibold text-slate-900">{room.title}</div>
                    <RoomSubtitle room={room} />
                  </header>
                  <ChatMessages room={room} />
                  <RoomFooter room={room} onOpen={open} safeArea={false} />
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-500">
                  <Bot className="h-8 w-8 text-slate-300" />
                  대화를 고르면 여기에 주고받은 메시지가 보입니다.
                </div>
              )}
            </section>

            <aside className="lg:col-span-2 xl:col-span-1 xl:max-h-[calc(100vh-9rem)] xl:overflow-y-auto">
              <AgentRequestSection rooms={rooms} via="web" focusId={focusId} onSent={open} hideWhenEmpty={false} />
            </aside>
          </div>
        )}
      </PageContainer>
    </Layout>
  );
}
