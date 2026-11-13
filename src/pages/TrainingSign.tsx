import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Calendar, Check, Clock, MapPin, PenTool, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useProfile } from '@/hooks/useProfile';
import { useCurrentResourceId } from '@/services/hooks/useUnifiedAuth';
import { SignaturePad } from '@/components/signature/SignaturePad';
import { SignatureStrokesView } from '@/components/signature/SignatureStrokesView';
import { useSubmitTrainingSignature, useTrainingSignatures } from '@/hooks/useTrainingSignatures';
import { trainingAssigneeNames } from '@/lib/trainingSignature';
import type { SignatureStrokes } from '@/lib/signatureStrokes';

/**
 * 연수 참석 서명 페이지 (`/training-sign/:meetingId`).
 *
 * QR로 휴대폰에서 여는 화면이라 앱 셸(사이드바·헤더) 없이 단독으로 렌더한다.
 * 로그인은 필수다 — 라우트가 public 화이트리스트에 없으므로 `RequireAuth`가 막고,
 * 로그인 후 이 주소로 되돌아온다(`sessionStorage` 경유, RequireAuth 참조).
 */
export default function TrainingSign() {
  const { meetingId } = useParams<{ meetingId: string }>();
  const { toast } = useToast();
  const { profile } = useProfile();
  const { resourceId } = useCurrentResourceId();

  const [strokes, setStrokes] = React.useState<SignatureStrokes | null>(null);
  const [resigning, setResigning] = React.useState(false);
  const submit = useSubmitTrainingSignature();

  const { data: meeting, isLoading: meetingLoading, error: meetingError } = useQuery({
    queryKey: ['training-sign-meeting', meetingId],
    enabled: !!meetingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meeting')
        .select('id, kind, starts_at, ends_at, meta')
        .eq('id', meetingId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: signatures = [], isLoading: signaturesLoading } = useTrainingSignatures(meetingId);

  const meta = (meeting?.meta ?? {}) as Record<string, unknown>;
  const title = typeof meta.title === 'string' ? meta.title : '연수';
  const room = typeof meta.room_name === 'string' ? meta.room_name : null;
  const assignees = trainingAssigneeNames(meta.assignee);
  const myName = profile?.name ?? '';
  const isAssignee = !!myName && assignees.includes(myName);
  const mySignature = signatures.find((s) => s.signer_name === myName) ?? null;

  const handleSubmit = async () => {
    if (!strokes || !meetingId || !myName) return;
    try {
      await submit.mutateAsync({
        meetingId,
        signerName: myName,
        resourceId,
        strokes,
        source: 'qr',
      });
      setStrokes(null);
      setResigning(false);
      toast({ title: '서명 완료', description: '연수 참석 서명이 저장되었습니다.' });
    } catch (error) {
      toast({
        title: '서명 저장 실패',
        description: error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    }
  };

  const loading = meetingLoading || signaturesLoading || !profile;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto w-full max-w-md space-y-4">
        <header className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
            <PenTool className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">연수 참석 서명</h1>
        </header>

        {loading ? (
          <Card>
            <div className="flex items-center justify-center py-10">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
            </div>
          </Card>
        ) : meetingError || !meeting ? (
          <Card>
            <Message
              title="연수 정보를 불러올 수 없습니다"
              body="주소가 정확한지 확인해 주세요. 참석자 명단에 없는 연수는 열람할 수 없습니다."
            />
          </Card>
        ) : meeting.kind !== 'training' ? (
          <Card>
            <Message title="연수 일정이 아닙니다" body="이 서명 화면은 연수 일정에서만 쓸 수 있습니다." />
          </Card>
        ) : (
          <>
            <Card>
              <div className="space-y-3">
                <h2 className="text-base font-semibold text-slate-900">{title}</h2>
                <div className="space-y-1.5 text-sm text-slate-600">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    {format(new Date(meeting.starts_at), 'yyyy년 M월 d일 (E)', { locale: ko })}
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-slate-400" />
                    {format(new Date(meeting.starts_at), 'HH:mm')}
                    {meeting.ends_at ? ` - ${format(new Date(meeting.ends_at), 'HH:mm')}` : ''}
                  </div>
                  {room && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-slate-400" />
                      {room}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between border-t pt-3">
                  <span className="text-xs text-slate-500">서명 현황</span>
                  <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                    {signatures.length} / {assignees.length}명
                  </Badge>
                </div>
              </div>
            </Card>

            {!isAssignee ? (
              <Card>
                <Message
                  title="참석자 명단에 없습니다"
                  body={`${myName || '현재 계정'}님은 이 연수의 참석자로 등록되어 있지 않습니다. 연수 담당 선생님께 문의해 주세요.`}
                />
              </Card>
            ) : mySignature && !resigning ? (
              <Card>
                <div className="space-y-3 text-center">
                  <div className="flex items-center justify-center gap-2 text-emerald-700">
                    <Check className="h-5 w-5" />
                    <span className="font-medium">서명이 완료되었습니다</span>
                  </div>
                  <div className="flex h-24 items-center justify-center rounded-lg border bg-white p-2 text-slate-800">
                    <SignatureStrokesView value={mySignature.strokes} title={`${myName} 서명`} />
                  </div>
                  <p className="text-xs text-slate-500">
                    {format(new Date(mySignature.signed_at), 'M월 d일 HH:mm')} 서명 · {myName}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setResigning(true)} className="gap-1.5">
                    <RotateCcw className="h-3.5 w-3.5" />
                    다시 서명하기
                  </Button>
                </div>
              </Card>
            ) : (
              <Card>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">서명자</span>
                    <span className="text-sm font-semibold text-slate-900">{myName}</span>
                  </div>
                  {/* 세로 화면에서 손가락으로 쓰기 좋게 캔버스를 조금 더 높인다. */}
                  <SignaturePad onChange={setStrokes} aspectRatio={1.8} disabled={submit.isPending} />
                  <Button
                    onClick={handleSubmit}
                    disabled={!strokes || submit.isPending}
                    className="h-11 w-full gap-1.5 text-sm"
                  >
                    <Check className="h-4 w-4" />
                    {submit.isPending ? '저장 중...' : mySignature ? '다시 서명 제출' : '서명 제출'}
                  </Button>
                  {mySignature && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setResigning(false);
                        setStrokes(null);
                      }}
                      className="h-9 w-full text-xs text-slate-500"
                    >
                      취소
                    </Button>
                  )}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-xl border bg-white p-4 shadow-sm">{children}</div>
);

const Message: React.FC<{ title: string; body: string }> = ({ title, body }) => (
  <div className="py-4 text-center">
    <p className="text-sm font-medium text-slate-800">{title}</p>
    <p className="mt-1 text-xs leading-relaxed text-slate-500">{body}</p>
  </div>
);
