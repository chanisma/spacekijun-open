/**
 * 연수 상세의 «로그인 없이 서명» (2026-10-25) — 이 기능 이후 만든 연수(서명 링크가 있는 연수)에서 기존
 * «서명하기»·«QR로 서명받기»를 **대신한다**(사용자 결정: 앞으로의 연수는 로그인 없는 서명만).
 *
 * - 서명할 당사자 = **내 서명 QR**(휴대폰으로 찍으면 로그인 없이 서명 화면). 서명했으면 내 서명을 보여 준다.
 * - 만든 사람·관리자 = 참석자별 **서명 여부** + 기한 바꾸기. 남의 QR·링크는 보여 주지 않는다(사용자 결정 — 각자 자기 QR 로
 *   서명하므로 만든 사람에게 필요한 것은 누가 했는지뿐. 링크가 곧 서명 자격이라 화면에 덜 나올수록 낫다).
 * 링크가 없는 옛 연수면 `useTrainingSignLinks().data.enabled === false` — 상세는 기존 서명 방식을 그대로 쓴다.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, QrCode, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SignQrCode } from '@/components/signature/SignQrCode';
import { SignatureStrokesView } from '@/components/signature/SignatureStrokesView';
import { toast } from '@/lib/toast';
import {
  fetchTrainingSignLinks, setTrainingSignLinkExpiry, trainingSignLinkPath, type TrainingSignLinks,
} from '@/services/trainingSignLinkService';

export function useTrainingSignLinks(meetingId: string | undefined, enabled: boolean) {
  return useQuery<TrainingSignLinks>({
    queryKey: ['training-sign-links', meetingId],
    enabled: enabled && !!meetingId,
    retry: false,
    staleTime: 30_000,
    queryFn: () => fetchTrainingSignLinks(meetingId!),
  });
}

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fmt = (iso: string) => new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });

export function TrainingSignLinksPanel({ meetingId, data, myName, mySignatureStrokes }: {
  meetingId: string;
  data: TrainingSignLinks;
  myName: string | null;
  /** 내가 이미 서명했으면 그 획 — 무엇이 인쇄될지 보여 준다 */
  mySignatureStrokes: unknown;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const mine = myName ? data.links.find((l) => l.signerName === myName) ?? null : null;
  const mySigned = !!mySignatureStrokes || !!mine?.signed;

  const save = async (value: string | null) => {
    setSaving(true);
    try {
      await setTrainingSignLinkExpiry(meetingId, value ? new Date(value).toISOString() : null);
      await qc.invalidateQueries({ queryKey: ['training-sign-links', meetingId] });
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '기한을 바꾸지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* 서명할 당사자 — 내 QR */}
      {mine && (mySigned ? (
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-1.5 text-green-700">
            <Check className="h-4 w-4" />
            <span className="text-xs font-medium md:text-sm">서명이 완료되었습니다</span>
          </div>
          {!!mySignatureStrokes && (
            <div className="flex h-16 items-center justify-center rounded-lg border border-pink-200 bg-white p-2 text-gray-800 md:h-20">
              <SignatureStrokesView value={mySignatureStrokes} title={`${myName ?? ''} 서명`} />
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-pink-200 bg-white p-3 text-center">
          <p className="flex items-center gap-1 text-xs font-semibold text-pink-900"><QrCode className="h-3.5 w-3.5" />내 서명 QR</p>
          <SignQrCode path={trainingSignLinkPath(mine.token)} size={140} label={`${mine.signerName} 서명`} showCopy={false} isCredentialLink />
          <p className="text-[11px] text-pink-700">휴대폰 카메라로 찍으면 <b>로그인 없이</b> 서명 화면이 열립니다.</p>
        </div>
      ))}

      {/* 만든 사람·관리자 — 참석자별 QR + 기한 */}
      {data.canManage && (
        <div className="space-y-2 rounded-lg border border-pink-200 bg-white/80 p-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-pink-900">
            <Users className="h-3.5 w-3.5 text-pink-600" />참석자별 서명 여부
            <span className="font-normal text-pink-700">— 각자 자기 QR(일정 상세·알림)로 서명합니다</span>
          </p>

          {editing ? (
            <div className="space-y-1.5 rounded-md bg-pink-50/60 p-2">
              <input type="datetime-local" value={draft} onChange={(e) => setDraft(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-base sm:text-xs" />
              <div className="flex flex-wrap justify-end gap-1.5">
                <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={saving} onClick={() => void save(null)}>기본(연수 끝 + 7일)으로</Button>
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEditing(false)}>취소</Button>
                <Button size="sm" className="h-8 bg-blue-600 text-xs hover:bg-blue-700" disabled={saving || !draft} onClick={() => void save(draft)}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '저장'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-2 text-[11px] text-slate-600">
              <span className="min-w-0 flex-1">
                서명 기한 <b className="text-slate-800">{data.expiresAt ? fmt(data.expiresAt) : '—'}</b>{data.expiresCustom ? ' (직접 정함)' : ' (연수 끝 + 7일)'}
              </span>
              <Button size="sm" variant="ghost" className="h-8 shrink-0 text-xs" onClick={() => { setDraft(data.expiresAt ? toLocalInput(data.expiresAt) : ''); setEditing(true); }}>바꾸기</Button>
            </div>
          )}

          <ul className="grid max-h-60 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3">
            {data.links.map((l) => (
              <li key={l.signerName} className="flex min-w-0 items-center gap-1.5 rounded-md border border-pink-100 bg-white px-2 py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate text-slate-800" title={l.signerName}>{l.signerName}</span>
                {l.signed
                  ? <span className="inline-flex shrink-0 items-center gap-0.5 text-emerald-700"><Check className="h-3.5 w-3.5" />서명</span>
                  : <span className="shrink-0 text-slate-400">대기</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
