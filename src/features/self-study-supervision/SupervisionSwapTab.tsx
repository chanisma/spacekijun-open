// 자습 감독 배정 — [내 감독·교체] 탭 (2026-10-11)
//
// 교체는 상대가 수락하는 순간 서버가 두 일정의 담당자를 맞바꾼다(`respond_supervision_swap`,
// 사용자 결정 — 학년부장 승인 없음, 학년부장에게는 알림만). 신청 뒤 담당자가 바뀌었으면 서버가 거부한다.
import { useMemo, useState } from 'react';
import { ArrowLeftRight, CalendarX2, Check, Loader2, Send, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { DIALOG_FOOTER_CLASS, FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS } from '@/components/tasks/dialogDesign';
import { SLOT_LABEL, gradeLabel, type SupervisionSlot } from '@/lib/selfStudySupervision';
import { UnavailabilityPanel } from './UnavailabilityPanel';
import {
  useMySupervisionSwaps,
  useMyUpcomingSupervision,
  useSupervisionPool,
  useSupervisionUnavailability,
  useUpcomingSupervision,
  type SupervisionHistoryItem,
  type SupervisionSwapRow,
} from './useSupervisionSources';

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

function dateLabel(date: string | null) {
  if (!date) return '';
  const [y, m, d] = date.split('-').map(Number);
  return `${m}/${d}(${WEEKDAY[new Date(y, m - 1, d).getDay()]})`;
}

function slotLabel(slot: SupervisionSlot | null, withMorning = false) {
  if (!slot) return '';
  return slot === 'evening' && withMorning ? '아침·저녁' : SLOT_LABEL[slot];
}

const STATUS_LABEL: Record<SupervisionSwapRow['status'], { text: string; tone: string }> = {
  pending: { text: '기다리는 중', tone: 'bg-slate-100 text-slate-600' },
  accepted: { text: '교체됨', tone: 'bg-emerald-50 text-emerald-700' },
  rejected: { text: '거절됨', tone: 'bg-rose-50 text-rose-700' },
  cancelled: { text: '취소됨', tone: 'bg-slate-100 text-slate-400' },
};

/** 신청 서버 오류 → 사람이 읽는 문장(서버가 이미 한국어로 말한다) */
function errorText(error: unknown): string {
  const message = (error as { message?: string } | null)?.message ?? '';
  return message || '처리하지 못했습니다';
}

function RequestForm({
  mine,
  myName,
  onDone,
  onCancel,
}: {
  mine: SupervisionHistoryItem & { grade: number };
  myName: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<'swap' | 'cover'>('swap');
  const [partnerMeeting, setPartnerMeeting] = useState<string>('');
  const [coverPartner, setCoverPartner] = useState<string>('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const upcoming = useUpcomingSupervision(mine.grade, true);
  const pool = useSupervisionPool(mine.grade, true);

  // 맞바꿀 수 있는 감독 = 같은 학년, 남이 맡은 것, 내가 이미 그날 맡지 않은 것
  const swapOptions = useMemo(
    () => (upcoming.data ?? []).filter((row) => row.meetingId !== mine.meetingId && row.names.length === 1 && !row.names.includes(myName)),
    [upcoming.data, mine.meetingId, myName],
  );
  const coverOptions = useMemo(() => (pool.data ?? []).filter((p) => p.name !== myName), [pool.data, myName]);

  const submit = async () => {
    let partnerId: string | undefined;
    let partnerMeetingId: string | null = null;
    if (mode === 'swap') {
      const target = swapOptions.find((row) => row.meetingId === partnerMeeting);
      if (!target) return;
      partnerMeetingId = target.meetingId;
      partnerId = pool.data?.find((p) => p.name === target.names[0])?.resourceId;
      if (!partnerId) {
        // 학년부 명단 밖의 선생님이 맡은 감독 — 이름으로 찾는다
        const { data } = await supabase.from('resource').select('id').eq('name', target.names[0]).in('type', ['teacher', 'staff']).limit(2);
        if ((data ?? []).length !== 1) { toast.error('그 감독을 맡은 선생님을 한 분으로 특정하지 못했습니다'); return; }
        partnerId = data![0].id;
      }
    } else {
      partnerId = coverPartner || undefined;
    }
    if (!partnerId) return;
    setBusy(true);
    const { error } = await supabase.rpc('request_supervision_swap', {
      p_my_meeting: mine.meetingId,
      p_partner: partnerId,
      p_partner_meeting: partnerMeetingId,
      p_message: message.trim() || null,
    });
    setBusy(false);
    if (error) { toast.error(errorText(error)); return; }
    toast.success('교체를 신청했습니다 — 상대 선생님이 수락하면 일정이 바로 바뀝니다');
    onDone();
  };

  const ready = mode === 'swap' ? !!partnerMeeting : !!coverPartner;

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-blue-100 bg-blue-50/40 p-3">
      <div className="flex rounded-lg border border-slate-100 bg-white p-0.5 text-xs">
        {([['swap', '다른 감독과 맞바꾸기'], ['cover', '대신 맡아 달라고 하기']] as const).map(([value, label]) => (
          <button key={value} type="button" onClick={() => setMode(value)}
            className={cn('h-8 flex-1 rounded-md font-medium', mode === value ? 'bg-blue-600 text-white' : 'text-slate-500')}>
            {label}
          </button>
        ))}
      </div>
      {mode === 'swap' ? (
        upcoming.isLoading ? <p className="text-xs text-slate-500">불러오는 중…</p> : swapOptions.length === 0 ? (
          <p className="text-xs text-slate-500">맞바꿀 수 있는 {gradeLabel(mine.grade)} 감독이 앞으로 석 달 안에 없습니다.</p>
        ) : (
          <select aria-label="맞바꿀 감독" className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
            value={partnerMeeting} onChange={(e) => setPartnerMeeting(e.target.value)}>
            <option value="">맞바꿀 감독을 고르세요</option>
            {swapOptions.map((row) => (
              <option key={row.meetingId} value={row.meetingId}>
                {dateLabel(row.date)} {slotLabel(row.slot, row.withMorning)} · {row.names[0]}
              </option>
            ))}
          </select>
        )
      ) : (
        <select aria-label="대신 맡아 줄 선생님" className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
          value={coverPartner} onChange={(e) => setCoverPartner(e.target.value)}>
          <option value="">대신 맡아 줄 선생님을 고르세요</option>
          {coverOptions.map((p) => <option key={p.resourceId} value={p.resourceId}>{p.name}</option>)}
        </select>
      )}
      <Textarea rows={2} maxLength={300} placeholder="전할 말(선택) — 예: 그날 출장이 생겼습니다"
        value={message} onChange={(e) => setMessage(e.target.value)} className="text-sm" />
      <div className="flex justify-end gap-1.5">
        <Button variant="ghost" className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)} onClick={onCancel}>취소</Button>
        <Button className="h-8 gap-1.5 bg-blue-600 px-3 text-xs hover:bg-blue-700" disabled={!ready || busy} onClick={submit}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} 신청 보내기
        </Button>
      </div>
    </div>
  );
}

export function SupervisionSwapTab({
  myName,
  myResourceId = null,
  onChanged,
  onClose,
}: {
  myName: string | null;
  myResourceId?: string | null;
  /** 일정이 바뀌었을 때 — 스케줄 다시 읽기 */
  onChanged: () => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const mine = useMyUpcomingSupervision(myName, true);
  const swaps = useMySupervisionSwaps(true);
  const [formFor, setFormFor] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const unavailability = useSupervisionUnavailability(!!myResourceId);
  const myRules = (unavailability.data ?? []).filter((r) => r.resourceId === myResourceId);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['self-study-supervision-swaps'] });
    void queryClient.invalidateQueries({ queryKey: ['self-study-supervision-mine'] });
    void queryClient.invalidateQueries({ queryKey: ['self-study-supervision-upcoming'] });
    void queryClient.invalidateQueries({ queryKey: ['self-study-supervision-sources'] });
  };

  const respond = async (id: string, accept: boolean) => {
    setActing(id);
    const { error } = await supabase.rpc('respond_supervision_swap', { p_request: id, p_accept: accept });
    setActing(null);
    if (error) { toast.error(errorText(error)); refresh(); return; }
    toast.success(accept ? '교체를 수락했습니다 — 두 감독 일정이 바뀌었습니다' : '교체 요청을 거절했습니다');
    refresh();
    if (accept) onChanged();
  };

  const cancel = async (id: string) => {
    setActing(id);
    const { error } = await supabase.rpc('cancel_supervision_swap', { p_request: id });
    setActing(null);
    if (error) { toast.error(errorText(error)); return; }
    refresh();
  };

  const rows = swaps.data ?? [];
  const incoming = rows.filter((r) => !r.i_am_requester && r.status === 'pending');
  const outgoing = rows.filter((r) => r.i_am_requester && r.status === 'pending');
  const done = rows.filter((r) => r.status !== 'pending').slice(0, 10);
  const pendingMeetings = new Set(outgoing.map((r) => r.requester_meeting_id));

  const describe = (r: SupervisionSwapRow) => r.partner_meeting_id
    ? `${dateLabel(r.requester_date)} ${slotLabel(r.requester_slot)}(${r.requester_name}) ↔ ${dateLabel(r.partner_date)} ${slotLabel(r.partner_slot)}(${r.partner_name})`
    : `${dateLabel(r.requester_date)} ${slotLabel(r.requester_slot)} — ${r.requester_name} → ${r.partner_name}`;

  return (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3 sm:px-6">
        {incoming.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-semibold text-slate-500">나에게 온 교체 요청 {incoming.length}</h3>
            <ul className="space-y-2">
              {incoming.map((r) => (
                <li key={r.id} className="rounded-xl border border-blue-200 bg-blue-50/50 p-3">
                  <p className="text-sm font-semibold text-slate-800">{r.requester_name} 선생님의 요청</p>
                  <p className="mt-0.5 break-words text-xs text-slate-600">{describe(r)}</p>
                  {r.message && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-500">“{r.message}”</p>}
                  <div className="mt-2 flex justify-end gap-1.5">
                    <Button variant="ghost" className="h-8 gap-1 px-3 text-xs text-rose-600 hover:bg-rose-50" disabled={acting === r.id} onClick={() => respond(r.id, false)}>
                      <X className="h-3.5 w-3.5" /> 거절
                    </Button>
                    <Button className="h-8 gap-1 bg-blue-600 px-3 text-xs hover:bg-blue-700" disabled={acting === r.id} onClick={() => respond(r.id, true)}>
                      {acting === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} 수락하고 바꾸기
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-xs font-semibold text-slate-500">내가 맡은 앞으로의 자습 감독</h3>
          {mine.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중…</p>
          ) : (mine.data ?? []).length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/50 px-6 py-8 text-center text-sm text-slate-500">
              앞으로 맡은 자습 감독이 없습니다.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {(mine.data ?? []).map((item) => {
                const waiting = pendingMeetings.has(item.meetingId);
                return (
                  <li key={item.meetingId} className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums text-slate-800">{dateLabel(item.date)}</span>
                      <span className="text-xs text-slate-500">{gradeLabel(item.grade)} {slotLabel(item.slot, item.withMorning)}</span>
                      {waiting ? (
                        <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">교체 신청 중</span>
                      ) : (
                        <Button variant="ghost" className="ml-auto h-8 gap-1 px-2 text-xs text-blue-700 hover:bg-blue-50"
                          onClick={() => setFormFor(formFor === item.meetingId ? null : item.meetingId)}>
                          <ArrowLeftRight className="h-3.5 w-3.5" /> 교체 신청
                        </Button>
                      )}
                    </div>
                    {formFor === item.meetingId && myName && (
                      <RequestForm mine={item} myName={myName} onCancel={() => setFormFor(null)} onDone={() => { setFormFor(null); refresh(); }} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {myResourceId && myName && (
          <section>
            <h3 className="mb-2 flex items-center gap-1 text-xs font-semibold text-slate-500">
              <CalendarX2 className="h-3.5 w-3.5" /> 내가 못 하는 날 {myRules.length > 0 ? myRules.length : ''}
            </h3>
            <UnavailabilityPanel
              people={[{ resourceId: myResourceId, name: myName }]}
              fixedPerson={{ resourceId: myResourceId, name: myName }}
              rules={myRules}
              canEdit={() => true}
              intro="매주 저녁 수업처럼 반복되는 사정이나 미리 아는 날을 적어 두면, 감독을 배정할 때 그 날은 피합니다. 이미 만든 감독은 바뀌지 않으니 그때는 교체를 신청해 주세요."
            />
          </section>
        )}

        {outgoing.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-semibold text-slate-500">내가 보낸 신청</h3>
            <ul className="space-y-1.5">
              {outgoing.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                  <span className="min-w-0 flex-1 break-words text-slate-700">{describe(r)}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{r.partner_name} 선생님 답 기다리는 중</span>
                  <Button variant="ghost" className="h-8 px-2 text-xs text-slate-500" disabled={acting === r.id} onClick={() => cancel(r.id)}>신청 취소</Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {done.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-semibold text-slate-500">지난 교체</h3>
            <ul className="space-y-1">
              {done.map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-xs text-slate-500">
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 font-medium', STATUS_LABEL[r.status].tone)}>{STATUS_LABEL[r.status].text}</span>
                  <span className="min-w-0 truncate" title={describe(r)}>{describe(r)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <div className={DIALOG_FOOTER_CLASS}>
        <Button variant="ghost" className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)} onClick={onClose}>닫기</Button>
      </div>
    </>
  );
}
