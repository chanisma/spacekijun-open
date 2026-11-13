import { useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { MobileLoading } from '../MobileShell';
import { AGENTS_QUERY_KEY, agentOverview, buildRooms, type AgentRoom } from '../data/agents';
import { ChatMessages, RoomFooter, RoomSections, RoomSubtitle } from '../components/AgentChat';
import { AgentRequestSection } from '../components/AgentRequests';

/**
 * 내 PC 의 에이전트 터미널 — 채팅방처럼 (2026-10-29 요청, 2026-11-10 채팅방으로).
 * 방 = 데스크 칸의 «대화» 하나(data/agents.ts buildRooms). 이름이 같아도 칸을 닫고 새로 열었거나 /clear 한 뒤는 다른 방이고,
 * 끝난 방은 읽기만 한다 — 끝난 칸의 대화가 같은 이름의 새 칸에 이어 보이거나 그쪽으로 보내지는 일이 없게.
 * PC 쪽 조건: 데스크 에이전트 터미널 위쪽 «휴대폰» 스위치 켜기 + «에이전트끼리 보기»를 켜고 연 에이전트.
 * 예약 업무(2026-11-07) 결과도 그 칸의 방에 «⏰ 예약»으로 온다. 보는 동안 5초마다 새로 읽는다.
 * 방은 주소의 ?room= 으로 연다 — 휴대폰 뒤로 가기로 목록에 돌아온다.
 * 받은 작업 요청(2026-11-11) — 목록 맨 위. 알림에서 오면 ?request= 로 그 카드를 펼친다. 맡기면 그 방을 연다.
 * 방 목록·대화·요청 카드는 웹 /agents 와 같은 부품(components/AgentChat · AgentRequests).
 */
export default function AgentsPage() {
  const { data, isLoading, error } = useQuery({ queryKey: AGENTS_QUERY_KEY, queryFn: agentOverview, refetchInterval: 5000 });
  const [params, setParams] = useSearchParams();
  const rooms = useMemo(() => (data ? buildRooms(data) : []), [data]);
  const openKey = params.get('room');
  const focusId = params.get('request');
  const open = (key: string, replace = false) => setParams({ room: key }, { replace });
  const location = useLocation();
  const navigate = useNavigate();
  // 목록에서 열었으면 뒤로 가기, 알림 등으로 방에 바로 들어왔으면(앞 기록 없음) 목록으로 바꾼다
  const close = () => (location.key !== 'default' ? navigate(-1) : setParams({}, { replace: true }));

  if (isLoading) return <MobileLoading label="내 PC 를 찾는 중…" />;
  if (error) return <p className="rounded-2xl bg-white p-5 text-center text-sm text-rose-600 shadow-sm">{(error as Error).message}</p>;

  const room = openKey ? rooms.find((item) => item.key === openKey) : undefined;
  if (openKey && room) return <ChatRoom room={room} onBack={close} onOpen={(key) => open(key, true)} />;

  return (
    <div className="space-y-4">
      {openKey && !room && (
        <p className="rounded-2xl bg-amber-50 p-3 text-xs text-amber-800">그 대화를 찾지 못했습니다 — 7일이 지나 지워졌을 수 있어요.</p>
      )}
      <AgentRequestSection rooms={rooms} via="phone" focusId={focusId} onSent={(key) => open(key)} />
      <RoomSections overview={data} rooms={rooms} onOpen={open} />
    </div>
  );
}

function ChatRoom({ room, onBack, onOpen }: { room: AgentRoom; onBack: () => void; onOpen: (key: string) => void }) {
  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-slate-100">
      <header className="flex items-center gap-2 border-b bg-white px-2 pb-2 pt-[calc(env(safe-area-inset-top)+8px)]">
        <button onClick={onBack} className="rounded-full p-2" aria-label="뒤로"><ArrowLeft className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-slate-900">{room.title}</div>
          <RoomSubtitle room={room} />
        </div>
      </header>
      <ChatMessages room={room} />
      <RoomFooter room={room} onOpen={onOpen} />
    </div>
  );
}
