/**
 * 어떤 기능에나 붙는 전자서명 버튼.
 *
 * ```tsx
 * <SignatureButton subjectType="timetable.swap_document" subjectId={docId} />
 * ```
 *
 * 대상은 `subjectType` + `subjectId` 로 가리킨다 — 기능마다 표가 달라 FK 를 걸 수 없다
 * (결재·task_action 와 같은 원칙). 화면은 그 대상에 붙은 요청이 있으면 **현황**을,
 * 없으면 **요청 만들기**를 연다.
 */
import React, { useState } from 'react';
import { FileSignature, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DialogFooter, Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DIALOG_HEADER_CLASS } from '@/components/tasks/dialogDesign';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';
import { SignatureRequestWizard } from './SignatureRequestWizard';
import { SignatureSignDialog } from './SignatureSignDialog';
import { SignerLine } from './SignerLine';
import { myTurn } from '../lib/signatureFlow';
import { useSignatureRequestsBySubject } from '../hooks/useSignatureRequests';
import { REQUEST_STATUS_LABEL, REQUEST_STATUS_TONE, type SignatureRequest } from '../types';

interface Props {
  subjectType: string;
  subjectId: string;
  /** 버튼 라벨(기본 '전자서명') */
  label?: string;
  size?: 'sm' | 'default';
  variant?: 'default' | 'outline' | 'ghost';
  className?: string;
}

export const SignatureButton: React.FC<Props> = ({
  subjectType, subjectId, label = '전자서명', size = 'sm', variant = 'outline', className,
}) => {
  const { user, profile } = useAuth();
  const { data: requests = [], isLoading } = useSignatureRequestsBySubject(subjectType, subjectId);
  const [listOpen, setListOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selected, setSelected] = useState<SignatureRequest | null>(null);

  const me = { userId: user?.id ?? null, name: profile?.name ?? null };

  const mine = requests.filter((r) =>
    myTurn(
      r.signers.map((s) => ({
        id: s.id, orderIndex: s.orderIndex, roleLabel: s.roleLabel,
        signerUserId: s.signerUserId, signerName: s.signerName,
        status: s.status, fields: s.fields,
      })),
      r.status, me,
    ).isMyTurn,
  ).length;

  const selectedLive = selected
    ? requests.find((r) => r.id === selected.id) ?? selected
    : null;

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={cn('gap-1.5', className)}
        onClick={() => (requests.length > 0 ? setListOpen(true) : setWizardOpen(true))}
        disabled={isLoading}
      >
        {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSignature className="h-3.5 w-3.5" />}
        {requests.length > 0 ? '서명 현황' : label}
        {/* 배지 = 눌러야 할 이유. 0이면 달지 않는다 */}
        {mine > 0 && (
          <span className="rounded-full bg-blue-600 px-1.5 text-[10px] font-semibold text-white">
            {mine}
          </span>
        )}
      </Button>

      {/* 이 대상에 붙은 요청들 */}
      <Dialog open={listOpen} onOpenChange={setListOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader className={DIALOG_HEADER_CLASS}>
            <DialogTitle className="text-sm">서명 현황</DialogTitle>
          </DialogHeader>
          <ul className="divide-y divide-gray-50">
            {requests.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => { setSelected(r); setListOpen(false); }}
                  className="flex w-full flex-col gap-1 px-1 py-2.5 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800" title={r.title}>
                      {r.title}
                    </span>
                    <span className={cn('shrink-0 rounded border px-1.5 py-0.5 text-[10px]', REQUEST_STATUS_TONE[r.status])}>
                      {REQUEST_STATUS_LABEL[r.status]}
                    </span>
                  </div>
                  <SignerLine request={r} meId={me.userId} meName={me.name} compact />
                </button>
              </li>
            ))}
          </ul>
          <DialogFooter className="flex justify-end border-t border-slate-100 pt-3">
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => { setListOpen(false); setWizardOpen(true); }}
            >
              새 서명 요청
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 마법사가 자기 Dialog 를 소유한다(문서 첨부 시 폭이 늘어난다) */}
      <SignatureRequestWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        subjectType={subjectType}
        subjectId={subjectId}
      />

      <SignatureSignDialog
        request={selectedLive}
        open={!!selected}
        onOpenChange={(v) => { if (!v) setSelected(null); }}
      />
    </>
  );
};

export default SignatureButton;
