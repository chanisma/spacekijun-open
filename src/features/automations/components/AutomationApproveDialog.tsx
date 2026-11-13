// ========================================
// 승인 단계 (2026-10-23) — 미리보기 → 나에게 시험 발송 → 승인하고 켜기
//
// 무인 서버가 보내므로 쿨메신저 스킬의 «매 쪽지 승인»은 여기 한 번으로 대신한다.
// 미리보기는 서버가 회차를 만들 때와 같은 함수(명단 풀기·변수 채우기)로 그날의 실제 쪽지를 보여 준다.
// ========================================
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Eye, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  DIALOG_FOOTER_CLASS, DIALOG_HEADER_CLASS, FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS, SectionLabel, TitleIconChip,
} from '@/components/tasks/dialogDesign';
import { NamePreview } from '@/components/ui/name-list-overlay';
import { COOLMSG_SENDER_NAME } from '@/lib/automationConfig';
import { describeSpec, formatRunAt, kstDateKeyOf, nextRuns } from '@/lib/automationCron';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { approveAutomation, previewAutomation, testSendAutomation, type Automation } from '../automationService';

interface Props {
  automation: Automation | null;
  onOpenChange: (open: boolean) => void;
  onApproved: () => void;
  /** 승인할 수 있는가 — 주인만(관리자가 남의 것을 보면 미리보기만) */
  canApprove: boolean;
}

export function AutomationApproveDialog({ automation, onOpenChange, onApproved, canApprove }: Props) {
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState<'test' | 'approve' | null>(null);
  const a = automation;
  const previewDate = date || null;

  const preview = useQuery({
    queryKey: ['automation-preview', a?.id, a?.updated_at, previewDate],
    queryFn: () => previewAutomation(a!.id, previewDate ?? undefined),
    enabled: Boolean(a),
    retry: false,
  });

  const upcoming = a ? nextRuns(a.schedule_cron, Date.now(), 5, { startsOn: a.starts_on, endsOn: a.ends_on }) : [];
  const p = preview.data;

  async function testSend() {
    if (!a) return;
    setBusy('test');
    try {
      await testSendAutomation(a.id);
      toast.success(`시험 쪽지를 보낼 차례에 올렸습니다 — 서버가 가져가면 «${COOLMSG_SENDER_NAME}»으로 나에게만 갑니다. 결과는 기록에서 봅니다.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '시험 발송을 올리지 못했습니다.');
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    if (!a) return;
    setBusy('approve');
    try {
      await approveAutomation(a.id);
      toast.success(upcoming[0] ? `켰습니다 — 첫 발송 ${formatRunAt(upcoming[0])}` : '켰습니다.');
      onApproved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '승인하지 못했습니다.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={Boolean(a)} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-start gap-3">
            <TitleIconChip icon={Eye} />
            <div className="min-w-0">
              <DialogTitle className="truncate text-base" title={a?.title}>{a?.title ?? ''} — 미리보기</DialogTitle>
              <DialogDescription className="text-xs">
                {a ? describeSpec(a.schedule_spec, a.schedule_cron) : ''} · 보내는 계정 «{COOLMSG_SENDER_NAME}» · 승인한 뒤 고치면 다시 승인해야 합니다.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
          <section className="space-y-2">
            <SectionLabel icon={Eye}>다음 실행</SectionLabel>
            <p className="text-sm text-slate-700">
              {upcoming.length > 0 ? upcoming.map(formatRunAt).join(' · ') : '정한 기간 안에 실행할 때가 없습니다.'}
            </p>
            {a?.skip_closed_days && <p className="text-xs text-slate-500">쉬는 날(주말·공휴일·휴업일)이면 그 회차는 건너뜁니다.</p>}
          </section>

          <section className="space-y-3">
            <SectionLabel icon={Send}
              trailing={
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  기준 날짜
                  <Input type="date" className="h-7 w-36 text-xs" value={date} onChange={(e) => setDate(e.target.value)}
                    placeholder={kstDateKeyOf(Date.now())} />
                </label>
              }>
              그날 실제로 나갈 쪽지
            </SectionLabel>

            {preview.isLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
            ) : preview.isError ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                미리보기를 만들지 못했습니다: {preview.error instanceof Error ? preview.error.message : ''} — 받는 사람 조건을 확인해 주세요.
              </p>
            ) : p ? (
              <>
                {p.closed_reason && (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    {p.date}은 쉬는 날({p.closed_reason})이라 실제로는 건너뜁니다. 아래는 보낸다면의 모습입니다.
                  </p>
                )}
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  <span className="flex-shrink-0 text-slate-500">받는 사람 {p.recipient_count}명</span>
                  <span className="min-w-0 truncate">
                    <NamePreview names={p.recipients.map((r) => r.name)} />
                  </span>
                </div>
                {p.recipient_count === 0 && (
                  <p className="flex items-center gap-1.5 text-xs text-rose-600"><AlertTriangle className="h-3.5 w-3.5" />받는 사람이 없어 회차마다 건너뜁니다.</p>
                )}
                {p.over_limit && (
                  <p className="flex items-center gap-1.5 text-xs text-rose-600">
                    <AlertTriangle className="h-3.5 w-3.5" />회차당 상한 {p.max_recipients_per_run}명을 넘어 보내지 않습니다. 조건을 좁혀 주세요.
                  </p>
                )}
                {p.per_recipient && (
                  <p className="text-xs text-indigo-700">사람마다 따로 한 통 — 아래는 그중 최대 3통입니다. 마감 임박 업무가 없는 사람에게는 보내지 않습니다.</p>
                )}
                {p.messages.length === 0 ? (
                  <p className="text-xs text-slate-500">이 날짜에는 보낼 쪽지가 없습니다.</p>
                ) : p.messages.map((m, i) => (
                  <div key={i} className="min-w-0 rounded-lg border bg-white">
                    <div className="flex min-w-0 items-center gap-2 border-b bg-slate-50 px-3 py-1.5 text-xs">
                      {m.to && <span className="flex-shrink-0 text-slate-500">{m.to.name} 에게</span>}
                      <span className="min-w-0 truncate font-medium text-slate-800" title={m.title}>{m.title}</span>
                    </div>
                    <pre className="whitespace-pre-wrap break-words px-3 py-2 font-sans text-sm text-slate-700">{m.body}</pre>
                  </div>
                ))}
              </>
            ) : null}
          </section>
        </div>

        <div className={cn(DIALOG_FOOTER_CLASS, 'flex-wrap items-center')}>
          <p className="mr-auto min-w-0 text-xs text-slate-500">
            {a?.approved_at ? `승인됨 ${new Date(a.approved_at).toLocaleString('ko-KR')}` : '쪽지는 회수할 수 없습니다. 시험 발송으로 먼저 확인해 보세요.'}
          </p>
          <Button variant="ghost" className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)} disabled={busy !== null} onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          {canApprove && (
            <>
              <Button variant="ghost" className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)} disabled={busy !== null || !p} onClick={testSend}>
                {busy === 'test' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                나에게 시험 발송
              </Button>
              {!a?.approved_at && (
                <Button className={cn(FOOTER_BUTTON_CLASS, 'bg-blue-600 hover:bg-blue-700')}
                  disabled={busy !== null || !p || p.recipient_count === 0 || p.over_limit || upcoming.length === 0}
                  onClick={approve}>
                  {busy === 'approve' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  승인하고 켜기
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
