import { FormEvent, useState } from 'react';
import { ExternalLink, LogOut, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { CURRENT_PRIVACY_POLICY_EFFECTIVE_DATE } from './PrivacyPolicyContent';

interface PrivacyConsentGateProps {
  userEmail?: string;
  isAccepting: boolean;
  loadError: string | null;
  onAccept: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onRetry: () => Promise<void>;
}

export const PrivacyConsentGate = ({
  userEmail,
  isAccepting,
  loadError,
  onAccept,
  onSignOut,
  onRetry,
}: PrivacyConsentGateProps) => {
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [studentRecordConfirmed, setStudentRecordConfirmed] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const allConfirmed = policyAccepted && studentRecordConfirmed && ageConfirmed;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!allConfirmed || isAccepting) return;

    setSubmitError(null);
    try {
      await onAccept();
    } catch (error) {
      console.error('개인정보처리방침 동의 저장 오류:', error);
      setSubmitError('동의 내용을 저장하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.');
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-slate-100 px-4 py-8 sm:py-12">
      <Card className="mx-auto max-w-2xl border-emerald-100 shadow-xl">
        <CardHeader className="space-y-4 border-b border-slate-100 pb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-emerald-700">사이트 이용 전 필수 확인</p>
            <CardTitle className="text-2xl leading-tight sm:text-3xl">
              개인정보처리방침에 동의해 주세요
            </CardTitle>
            <p className="text-sm leading-6 text-slate-600">
              기존 사용자와 신규 사용자 모두 최신 방침을 확인해야 SPACEKIJUN을 이용할 수
              있습니다. 시행일은 {CURRENT_PRIVACY_POLICY_EFFECTIVE_DATE}입니다.
            </p>
            {userEmail && (
              <p className="break-all text-xs text-slate-500">로그인 계정: {userEmail}</p>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              생활기록부, 성적, 상담·위기지원 기록에는 학생의 교육기회와 인격에 영향을 줄 수
              있는 정보가 포함됩니다. 업무상 필요한 범위에서만 열람하고 캡처, 개인 저장,
              메신저 공유, 무단 AI 입력을 해서는 안 됩니다.
            </div>

            <div className="space-y-4">
              <label
                htmlFor="privacy-policy-consent"
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 hover:bg-slate-50"
              >
                <Checkbox
                  id="privacy-policy-consent"
                  checked={policyAccepted}
                  onCheckedChange={(checked) => setPolicyAccepted(checked === true)}
                  className="mt-0.5"
                />
                <span className="text-sm leading-6 text-slate-700">
                  <strong className="text-slate-950">[필수] 개인정보처리방침을 확인했으며,</strong>{' '}
                  계정·권한 관리와 사이트 제공에 필요한 개인정보 처리에 동의합니다.
                </span>
              </label>

              <label
                htmlFor="student-record-notice"
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 hover:bg-slate-50"
              >
                <Checkbox
                  id="student-record-notice"
                  checked={studentRecordConfirmed}
                  onCheckedChange={(checked) => setStudentRecordConfirmed(checked === true)}
                  className="mt-0.5"
                />
                <span className="text-sm leading-6 text-slate-700">
                  <strong className="text-slate-950">[필수] 학생기록 특별 보호 원칙을 확인했으며,</strong>{' '}
                  생활기록부·성적·상담기록을 목적 외로 열람·반출·공유하지 않겠습니다.
                </span>
              </label>

              <label
                htmlFor="privacy-age-confirmation"
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 hover:bg-slate-50"
              >
                <Checkbox
                  id="privacy-age-confirmation"
                  checked={ageConfirmed}
                  onCheckedChange={(checked) => setAgeConfirmed(checked === true)}
                  className="mt-0.5"
                />
                <span className="text-sm leading-6 text-slate-700">
                  <strong className="text-slate-950">[필수] 만 14세 이상이거나,</strong> 만 14세
                  미만인 경우 학교가 법정대리인의 동의를 별도 절차로 확인했습니다.
                </span>
              </label>
            </div>

            <a
              href="/privacy"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 underline underline-offset-4"
            >
              개인정보처리방침 전문 보기
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>

            {(loadError || submitError) && (
              <Alert variant="destructive">
                <AlertDescription className="space-y-3">
                  <p>{submitError || loadError}</p>
                  {loadError && (
                    <Button type="button" variant="outline" size="sm" onClick={() => void onRetry()}>
                      다시 확인
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                className="gap-2 text-slate-600"
                disabled={isAccepting}
                onClick={() => void onSignOut()}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                동의하지 않고 로그아웃
              </Button>
              <Button
                type="submit"
                disabled={!allConfirmed || isAccepting || Boolean(loadError)}
                className="bg-emerald-700 hover:bg-emerald-800"
              >
                {isAccepting ? '동의 저장 중...' : '동의하고 SPACEKIJUN 시작'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
};
