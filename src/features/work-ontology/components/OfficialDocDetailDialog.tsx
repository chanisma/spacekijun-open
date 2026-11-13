// 공문 상세 창 — 작업실의 «기록»·«연결»에서 공문을 누르면 (2026-11-12 사용자 요청)
// 읽기만 한다: 접수 정보 · AI 판정(성격·기한·요지·물을 것) · 결정 · 본문. 결정·고치기는 공문 판단함·업무노트 제안이 맡는다.
// 공문 표 RLS = 관리자 · 결재권자 본인(official_doc_is_mine) — 그 밖이면 «볼 수 없는 공문»으로 말한다.
import { useQuery } from '@tanstack/react-query';
import { AlignLeft, FileText, HelpCircle, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DIALOG_FOOTER_CLASS, DIALOG_HEADER_CLASS, FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS, SectionLabel, TitleIconChip } from '@/components/tasks/dialogDesign';
import { DECISION_CHOICES } from '@/lib/officialDocDecision';
import { cn } from '@/lib/utils';
import { getOfficialDocBody } from '@/features/official-docs/officialDocService';
import { toKstDateKey } from '../model/todayFeed';

export interface DocRef { id?: string | null; docNo?: string | null; title: string }

interface DocDetail {
  id: string; doc_no: string; title: string; sender: string | null; registered_at: string | null;
  approver_name: string | null; process_status: string | null;
  triage: { nature: string | null; needs_action: boolean | null; deadline: string | null; question: string | null; summary: string | null } | null;
  decision: { decision: string; reason: string | null; created_at: string } | null;
  body: string | null;
}

const db = supabase as unknown as { from: (t: string) => any };

async function fetchDoc(ref: DocRef): Promise<DocDetail | null> {
  let q = db.from('official_doc').select('id, doc_no, title, sender, registered_at, approver_name, process_status');
  q = ref.id ? q.eq('id', ref.id) : q.eq('doc_no', ref.docNo);
  const { data: doc, error } = await q.maybeSingle();
  if (error) throw error;
  if (!doc) return null;
  const [t, d, body] = await Promise.all([
    db.from('official_doc_triage').select('nature, needs_action, deadline, question, result').eq('doc_id', doc.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('official_doc_decision').select('decision, reason, created_at').eq('doc_id', doc.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    getOfficialDocBody(doc.id).catch(() => null),
  ]);
  const tr = t.data as { nature: string | null; needs_action: boolean | null; deadline: string | null; question: string | null; result: { summary?: string } | null } | null;
  return {
    ...doc,
    triage: tr ? { nature: tr.nature, needs_action: tr.needs_action, deadline: tr.deadline, question: tr.question, summary: tr.result?.summary ?? null } : null,
    decision: (d.data as DocDetail['decision']) ?? null,
    body,
  };
}

const DECISION_LABEL: Record<string, string> = Object.fromEntries(DECISION_CHOICES.map((o) => [o.value, o.label]));

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 gap-3 py-1 text-sm">
      <dt className="w-20 flex-none text-xs text-slate-500">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-slate-800">{children}</dd>
    </div>
  );
}

export function OfficialDocDetailDialog({ docRef, onOpenChange }: { docRef: DocRef | null; onOpenChange: (o: boolean) => void }) {
  const open = !!docRef;
  const q = useQuery({
    queryKey: ['work-object', 'official-doc', docRef?.id ?? null, docRef?.docNo ?? null],
    queryFn: () => fetchDoc(docRef!),
    enabled: open && !!(docRef?.id || docRef?.docNo),
    staleTime: 5 * 60 * 1000,
  });
  const d = q.data;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex min-w-0 items-center gap-2.5">
            <TitleIconChip icon={FileText} />
            <div className="min-w-0">
              <DialogTitle className="break-keep text-base">{d?.title ?? docRef?.title ?? '공문'}</DialogTitle>
              <DialogDescription className="truncate text-xs">{d ? [d.sender, d.doc_no].filter(Boolean).join(' · ') : '공문 상세'}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          {q.isLoading ? <p className="text-sm text-slate-500">불러오는 중…</p>
            : q.error ? <p className="text-sm text-rose-700">공문을 불러오지 못했습니다 — {(q.error as Error).message}</p>
            : !d ? <p className="text-sm text-slate-600">볼 수 없는 공문입니다. 공문은 관리자와 결재권자 본인만 봅니다.</p>
            : (
              <>
                <dl className="divide-y divide-slate-100">
                  {d.registered_at && <Row label="접수">{toKstDateKey(d.registered_at)}</Row>}
                  {d.approver_name && <Row label="결재권자">{d.approver_name}</Row>}
                  {d.process_status && <Row label="처리 상태">{d.process_status}</Row>}
                  {d.triage?.nature && <Row label="성격">{d.triage.nature}{d.triage.needs_action === false ? ' · 할 일 없음' : d.triage.needs_action ? ' · 처리 필요' : ''}</Row>}
                  {d.triage?.deadline && <Row label="기한">{d.triage.deadline.slice(0, 10)}</Row>}
                  {d.decision && (
                    <Row label="결정">{DECISION_LABEL[d.decision.decision] ?? d.decision.decision}{d.decision.reason ? ` — ${d.decision.reason}` : ''} <span className="text-xs text-slate-400">({toKstDateKey(d.decision.created_at)})</span></Row>
                  )}
                </dl>
                {d.triage?.summary && (
                  <section>
                    <SectionLabel icon={Sparkles}>AI 요지</SectionLabel>
                    <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-700">{d.triage.summary}</p>
                  </section>
                )}
                {d.triage?.question && (
                  <section>
                    <SectionLabel icon={HelpCircle}>확인할 것</SectionLabel>
                    <p className="mt-1 text-sm text-slate-700">{d.triage.question}</p>
                  </section>
                )}
                <section>
                  <SectionLabel icon={AlignLeft}>본문</SectionLabel>
                  {d.body ? (
                    <pre className={cn('mt-1 whitespace-pre-wrap break-words rounded-lg border border-slate-200 px-3 py-2 font-sans text-[13px] leading-relaxed text-slate-800')}>{d.body}</pre>
                  ) : <p className="mt-1 text-xs text-slate-500">본문이 없습니다(수집되지 않았거나 비공개 공문).</p>}
                </section>
              </>
            )}
        </div>
        <div className={DIALOG_FOOTER_CLASS}>
          <Button variant="ghost" className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)} onClick={() => onOpenChange(false)}>닫기</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
