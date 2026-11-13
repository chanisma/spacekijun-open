/**
 * 작업 「전자서명 받기」 실행 화면 (2026-09-24).
 *
 * 서명 자체는 전자서명 기능이 전부 갖고 있다 — 문서 올리기·서명자와 자리 지정·순차/동시·
 * 날인·7일 정리까지. 여기서 하는 일은 **그 요청을 이 작업에 매다는 것**뿐이다.
 *
 * 대상은 `subject_type='task_action'` + `subject_id=<작업 id>` 다. `signature_request.subject_type`
 * 에는 CHECK 가 없어(자유 문자열) 새 표도 마이그레이션도 필요 없다 — 결재·task_action 와 같은
 * «대상을 두 칸으로 가리킨다» 원칙.
 *
 * ⚠️ 완료를 자동으로 찍지 않는다. 요청이 완료돼도 담당자가 [완료 기록]을 눌러야 한다 —
 * 서명 완료는 서버가 알지만 «이 작업이 끝났는가»는 한 요청으로 결정되지 않는다(한 할 일에
 * 계획서·결과보고 두 요청을 매다는 것이 정상이라 `multiple: true` 다).
 */
import { useMemo, useState } from 'react';
import { FileSignature, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';
import { SignatureRequestWizard } from '@/features/e-signature/components/SignatureRequestWizard';
import { SignatureSignDialog } from '@/features/e-signature/components/SignatureSignDialog';
import { useSignatureRequestsBySubject } from '@/features/e-signature/hooks/useSignatureRequests';
import { myTurn } from '@/features/e-signature/lib/signatureFlow';
import {
  daysUntilPurge,
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_TONE,
  type SignatureRequest,
} from '@/features/e-signature/types';
import { ManualCompletionRecord } from '../ManualCompletionRecord';
import type { TaskAction } from '../../types';

/** 이 작업에 매달린 서명 요청을 가리키는 대상 키 — 만드는 쪽·읽는 쪽이 함께 쓴다 */
export const SIGNATURE_SUBJECT_TYPE = 'task_action';

export function SignatureRequestRunner({
  action,
  workflowId,
  /** 남의 업무 흐름에서 열었다 — 새 요청을 만들지 않고 현황만 본다 */
  guideOnly = false,
}: {
  action: TaskAction;
  workflowId: string | null;
  guideOnly?: boolean;
}) {
  const { user, profile } = useAuth();
  const { data: requests = [], isLoading } = useSignatureRequestsBySubject(
    SIGNATURE_SUBJECT_TYPE,
    action.id,
  );
  const [wizardOpen, setWizardOpen] = useState(false);
  const [signing, setSigning] = useState<SignatureRequest | null>(null);

  const me = { userId: user?.id ?? null, name: profile?.name ?? null };
  // 열어 둔 서명 창에는 항상 최신 행을 넘긴다(서명 직후 상태가 스냅샷에 갇히지 않게)
  const signingLive = signing ? requests.find((r) => r.id === signing.id) ?? signing : null;

  const summary = useMemo(() => {
    const done = requests.filter((r) => r.status === 'completed').length;
    const mine = requests.filter(
      (r) =>
        myTurn(
          r.signers.map((s) => ({
            id: s.id, orderIndex: s.orderIndex, roleLabel: s.roleLabel,
            signerUserId: s.signerUserId, signerName: s.signerName,
            status: s.status, fields: s.fields,
          })),
          r.status,
          me,
        ).isMyTurn,
    ).length;
    return { done, mine, total: requests.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, me.userId, me.name]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-blue-50/40 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">전자서명 받기</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              문서를 올리고 서명할 사람과 자리를 지정하면 차례대로 서명 요청이 갑니다.
              같은 순번은 동시에, 다음 순번은 앞 순번이 끝난 뒤에 받습니다.
            </p>
          </div>
          {!guideOnly && (
            <Button
              size="sm"
              className="shrink-0 bg-blue-600 hover:bg-blue-700"
              onClick={() => setWizardOpen(true)}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              서명 요청 만들기
            </Button>
          )}
        </div>
        {requests.length > 0 && (
          <p className="mt-3 text-[11px] text-slate-500">
            요청 {summary.total}건 · 완료 {summary.done}건
            {summary.mine > 0 && <span className="ml-1 font-semibold text-blue-600">· 내 차례 {summary.mine}건</span>}
          </p>
        )}
      </div>

      <section className="space-y-2">
        <h3 className="text-xs font-bold text-slate-500">이 작업의 서명 요청</h3>
        {isLoading ? (
          <p className="px-1 text-xs text-slate-400">불러오는 중…</p>
        ) : requests.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
            아직 서명 요청이 없습니다.
            {!guideOnly && ' 위에서 만들어 주세요.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {requests.map((request) => {
              const turn = myTurn(
                request.signers.map((s) => ({
                  id: s.id, orderIndex: s.orderIndex, roleLabel: s.roleLabel,
                  signerUserId: s.signerUserId, signerName: s.signerName,
                  status: s.status, fields: s.fields,
                })),
                request.status,
                me,
              );
              const signed = request.signers.filter((s) => s.status === 'signed').length;
              // 진행 중이면 서명 마감(요청자가 정함), 완료면 완료 후 7일에 문서가 정리된다 — 남은 날짜를 말하지 않으면 «왜 파일이 없지»가 된다
              const purgeIn = daysUntilPurge(request);
              return (
                <li
                  key={request.id}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"
                >
                  <FileSignature className="h-4 w-4 shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-800" title={request.title}>
                      {request.title}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      서명 {signed}/{request.signers.length}명
                      {typeof purgeIn === 'number' && (
                        <span className={cn('ml-1.5', purgeIn <= 2 ? 'text-rose-600' : 'text-amber-600')}>
                          · {request.status === 'pending' ? '서명 마감' : '문서 삭제'} D-{purgeIn}
                        </span>
                      )}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                      REQUEST_STATUS_TONE[request.status],
                    )}
                  >
                    {REQUEST_STATUS_LABEL[request.status]}
                  </span>
                  {turn.isMyTurn && (
                    <Button size="sm" className="h-7 shrink-0 bg-blue-600 text-xs hover:bg-blue-700" onClick={() => setSigning(request)}>
                      서명하기
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {!guideOnly && (
        <ManualCompletionRecord
          action={action}
          workflowId={workflowId}
          snapshot={{
            mode: 'signature.request',
            requests: requests.length,
            completed: summary.done,
          }}
        />
      )}

      {/* 러너 다이얼로그 «안에» 겹쳐 띄운다 — 바깥을 닫지 않는다(docs/nested-modal-pitfalls.md) */}
      <SignatureRequestWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        subjectType={SIGNATURE_SUBJECT_TYPE}
        subjectId={action.id}
      />
      {signingLive && (
        <SignatureSignDialog
          open
          onOpenChange={(open) => !open && setSigning(null)}
          request={signingLive}
        />
      )}
    </div>
  );
}
